import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { BlockPublicAccess, Bucket, HttpMethods } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { Api } from './api.ts';
import { Auth } from './auth.ts';
import { DeployRole } from './deploy-role.ts';
import { Pipeline, pipelineSteps } from './pipeline.ts';
import { Web } from './web.ts';

export interface TempoStackProps extends StackProps {
  apiBundleDir: string;
  pipelineBundleDir: string;
  webDistDir: string;
}

function requireBuildOutput(dir: string, entryFile: string): void {
  if (!existsSync(join(dir, entryFile))) {
    throw new Error(
      `Missing ${join(dir, entryFile)}. Run "npm run build --workspaces --if-present" from the repo root before synthesising.`,
    );
  }
}

export class TempoStack extends Stack {
  constructor(scope: Construct, id: string, props: TempoStackProps) {
    super(scope, id, props);

    requireBuildOutput(props.apiBundleDir, 'lambda.mjs');
    for (const { file } of pipelineSteps) requireBuildOutput(props.pipelineBundleDir, `${file}.mjs`);
    requireBuildOutput(props.webDistDir, 'index.html');

    const table = new Table(this, 'Table', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    const uploads = new Bucket(this, 'Uploads', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const auth = new Auth(this, 'Auth');

    const api = new Api(this, 'Api', {
      bundleDir: props.apiBundleDir,
      table,
      uploads,
      userPool: auth.userPool,
      userPoolClient: auth.webClient,
    });

    const web = new Web(this, 'Web', { distDir: props.webDistDir, apiDomainName: api.domainName });
    const appUrl = `https://${web.distribution.distributionDomainName}`;

    uploads.addCorsRule({
      allowedOrigins: [appUrl],
      allowedMethods: [HttpMethods.GET, HttpMethods.PUT],
      allowedHeaders: ['*'],
    });

    const pipeline = new Pipeline(this, 'Pipeline', { bundleDir: props.pipelineBundleDir, table, appUrl });
    api.handler.addEnvironment('STATE_MACHINE_ARN', pipeline.stateMachine.stateMachineArn);
    pipeline.stateMachine.grantStartExecution(api.handler);
    new CfnOutput(this, 'GeminiKeySecretName', { value: pipeline.geminiKeySecretName });

    const deployRole = new DeployRole(this, 'Deploy');

    new CfnOutput(this, 'AppUrl', { value: appUrl });
    new CfnOutput(this, 'DeployRoleArn', { value: deployRole.role.roleArn });
    new CfnOutput(this, 'UserPoolId', { value: auth.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: auth.webClient.userPoolClientId });
    new CfnOutput(this, 'TableName', { value: table.tableName });
    new CfnOutput(this, 'UploadsBucketName', { value: uploads.bucketName });
  }
}
