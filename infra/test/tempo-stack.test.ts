import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CachePolicy, OriginRequestPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pipelineSteps } from '../lib/pipeline.ts';
import { TempoStack } from '../lib/tempo-stack.ts';

let root: string;
let apiBundleDir: string;
let pipelineBundleDir: string;
let webDistDir: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'tempo-infra-'));
  apiBundleDir = join(root, 'api');
  pipelineBundleDir = join(root, 'pipeline');
  webDistDir = join(root, 'web');
  mkdirSync(apiBundleDir);
  mkdirSync(pipelineBundleDir);
  mkdirSync(join(webDistDir, 'assets'), { recursive: true });
  writeFileSync(join(apiBundleDir, 'lambda.mjs'), 'export const handler = async () => ({});');
  for (const { file } of pipelineSteps) writeFileSync(join(pipelineBundleDir, `${file}.mjs`), 'export const handler = async () => ({});');
  writeFileSync(join(webDistDir, 'index.html'), '<!doctype html>');
  writeFileSync(join(webDistDir, 'assets', 'x.js'), '');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function synth(context: Record<string, string> = {}): Template {
  const app = new App({ context });
  const stack = new TempoStack(app, 'TempoStack', {
    env: { region: 'eu-central-1' },
    apiBundleDir,
    pipelineBundleDir,
    webDistDir,
  });
  return Template.fromStack(stack);
}

describe('TempoStack', () => {
  let template: Template;

  beforeAll(() => {
    template = synth();
  });

  it('creates an on-demand single table keyed by pk and sk with one index and a ttl', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'gsi1',
          KeySchema: [
            { AttributeName: 'gsi1pk', KeyType: 'HASH' },
            { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: 'gsi1pk', AttributeType: 'S' },
        { AttributeName: 'gsi1sk', AttributeType: 'S' },
      ]),
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    });
  });

  it('generates the device token secret, deletes it with the stack and lets only the API read it', () => {
    const tokenSecrets = template.findResources('AWS::SecretsManager::Secret', {
      DeletionPolicy: 'Delete',
      Properties: {
        GenerateSecretString: { PasswordLength: 64, ExcludePunctuation: true },
      },
    });
    expect(Object.keys(tokenSecrets)).toHaveLength(1);
    const [secretId] = Object.keys(tokenSecrets);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
            Resource: { Ref: secretId },
          }),
        ]),
      },
    });
  });

  it('creates the staff groups and disables self sign-up', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      UsernameAttributes: ['email'],
    });
    for (const group of ['admin', 'attending', 'therapist']) {
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: group });
    }
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      ExplicitAuthFlows: Match.arrayWith(['ALLOW_ADMIN_USER_PASSWORD_AUTH', 'ALLOW_USER_SRP_AUTH']),
    });
  });

  it('routes /api/* to the API without rewriting errors to index.html', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        PriceClass: 'PriceClass_100',
        CustomErrorResponses: Match.absent(),
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
        CacheBehaviors: [
          Match.objectLike({
            PathPattern: '/api/*',
            ViewerProtocolPolicy: 'redirect-to-https',
            AllowedMethods: Match.arrayWith(['PUT', 'PATCH', 'POST', 'DELETE']),
            CachePolicyId: CachePolicy.CACHING_DISABLED.cachePolicyId,
            OriginRequestPolicyId: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER.originRequestPolicyId,
          }),
        ],
      }),
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'ANY /api/{proxy+}' });
  });

  it('throttles the two code redemption routes and leaves the rest on the default', () => {
    const limit = { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10 };
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'POST /api/device/session-code' });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'POST /api/device/pairing-code' });
    template.resourceCountIs('AWS::ApiGatewayV2::Stage', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: Match.absent(),
      RouteSettings: {
        'POST /api/device/session-code': limit,
        'POST /api/device/pairing-code': limit,
      },
    });
  });

  it('lets only the main branch of the repo assume the deploy role', () => {
    template.resourceCountIs('AWS::IAM::OIDCProvider', 1);
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub': 'repo:dragosgatan@239200524/unihack-2026@1456485054:ref:refs/heads/main',
              },
            },
          }),
        ],
      },
    });

    const roles = template.findResources('AWS::IAM::Role', {
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [Match.objectLike({ Action: 'sts:AssumeRoleWithWebIdentity' })],
        },
      },
    });
    const roleIds = Object.keys(roles);
    expect(roleIds).toHaveLength(1);

    const policies = template.findResources('AWS::IAM::Policy', {
      Properties: { Roles: [{ Ref: roleIds[0] }] },
    });
    const statements = Object.values(policies).flatMap(
      (policy) => (policy as { Properties: { PolicyDocument: { Statement: unknown[] } } }).Properties.PolicyDocument.Statement,
    );
    expect(statements).toHaveLength(1);
    expect(JSON.stringify(statements[0])).toContain('cdk-hnb659fds-*-');
    expect(JSON.stringify(statements[0])).toContain('-eu-central-1');
    expect(statements[0]).toMatchObject({ Action: 'sts:AssumeRole', Effect: 'Allow' });
  });

  it('runs the API on Node.js 22 ARM64 with its configuration', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
      Handler: 'lambda.handler',
      MemorySize: 512,
      Timeout: 29,
      Environment: {
        Variables: {
          TABLE_NAME: Match.anyValue(),
          UPLOADS_BUCKET: Match.anyValue(),
          USER_POOL_ID: Match.anyValue(),
          USER_POOL_CLIENT_ID: Match.anyValue(),
          DEVICE_TOKEN_SECRET_ARN: Match.anyValue(),
        },
      },
    });
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 7 });
  });

  it('runs each pipeline step as its own Node.js 22 ARM64 Lambda with the mock AI provider', () => {
    for (const { file } of pipelineSteps) {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs22.x',
        Architectures: ['arm64'],
        Handler: `${file}.handler`,
        Environment: {
          Variables: {
            TABLE_NAME: Match.anyValue(),
            APP_URL: Match.anyValue(),
            AI_PROVIDER: 'mock',
            REPORT_SENDER: Match.absent(),
          },
        },
      });
    }
    const pipelineLogGroups = Object.keys(template.findResources('AWS::Logs::LogGroup')).filter((id) =>
      id.startsWith('Pipeline'),
    );
    expect(pipelineLogGroups).toHaveLength(pipelineSteps.length);
    for (const id of pipelineLogGroups) {
      expect(template.toJSON().Resources[id].Properties.RetentionInDays).toBe(7);
    }
  });

  it('chains the steps in one standard state machine with a retry on every step', () => {
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', { StateMachineType: 'STANDARD' });
    const [machine] = Object.values(template.findResources('AWS::StepFunctions::StateMachine'));
    const definition = JSON.stringify(machine);
    for (const { id } of pipelineSteps) expect(definition).toContain(`\\"${id}\\":{`);
    expect(definition.match(/MaxAttempts/g)).toHaveLength(pipelineSteps.length);
    expect(definition.match(/States\.ALL/g)).toHaveLength(pipelineSteps.length);
  });

  it('gives only the two AI steps the Gemini key and a longer timeout', () => {
    const functions = Object.values(template.findResources('AWS::Lambda::Function')) as {
      Properties: { Handler: string; Timeout: number; Environment?: { Variables?: Record<string, unknown> } };
    }[];
    const withKey = functions.filter((fn) => fn.Properties.Environment?.Variables?.['GEMINI_SECRET_ARN'] !== undefined);
    expect(withKey.map((fn) => fn.Properties.Handler).sort()).toEqual(['ai-items.handler', 'report.handler']);
    for (const fn of withKey) expect(fn.Properties.Timeout).toBe(180);
  });

  it('lets the API start the pipeline and tells it which state machine to use', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'lambda.handler',
      Environment: { Variables: { STATE_MACHINE_ARN: { Ref: Match.stringLikeRegexp('^PipelineStateMachine') } } },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'states:StartExecution',
            Resource: { Ref: Match.stringLikeRegexp('^PipelineStateMachine') },
          }),
        ]),
      },
    });
  });

  it('sends report email through SES only when a sender is configured', () => {
    expect(JSON.stringify(template.toJSON())).not.toContain('ses:SendEmail');
    const withSender = synth({ reportSender: 'reports@example.test' });
    withSender.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'notify.handler',
      Environment: { Variables: { REPORT_SENDER: 'reports@example.test' } },
    });
    withSender.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Action: 'ses:SendEmail' })]) },
    });
  });

  it('blocks public access on both buckets', () => {
    const buckets = template.findResources('AWS::S3::Bucket');
    expect(Object.keys(buckets)).toHaveLength(2);
    for (const bucket of Object.values(buckets)) {
      expect(bucket).toMatchObject({
        Properties: {
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
        },
      });
    }
    template.hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: [Match.objectLike({ AllowedMethods: ['GET', 'PUT'] })],
      },
    });
  });

  it('exports the outputs the app and CI need', () => {
    for (const output of ['AppUrl', 'DeployRoleArn', 'UserPoolId', 'UserPoolClientId', 'TableName', 'UploadsBucketName']) {
      template.hasOutput(output, {});
    }
  });

  it('creates nothing in a VPC', () => {
    const ec2 = Object.values(template.toJSON().Resources as Record<string, { Type: string }>).filter((resource) =>
      resource.Type.startsWith('AWS::EC2::'),
    );
    expect(ec2).toHaveLength(0);
  });

  it('imports the GitHub OIDC provider when its ARN is given', () => {
    const imported = synth({
      githubOidcProviderArn: 'arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com',
    });
    imported.resourceCountIs('AWS::IAM::OIDCProvider', 0);
  });

  it('fails with a clear error when the build output is missing', () => {
    const app = new App();
    expect(
      () =>
        new TempoStack(app, 'TempoStack', {
          env: { region: 'eu-central-1' },
          apiBundleDir: join(root, 'missing'),
          pipelineBundleDir,
          webDistDir,
        }),
    ).toThrow(/npm run build/);
  });

  it('fails with a clear error when a pipeline bundle is missing', () => {
    const app = new App();
    expect(
      () =>
        new TempoStack(app, 'TempoStack', {
          env: { region: 'eu-central-1' },
          apiBundleDir,
          pipelineBundleDir: join(root, 'missing'),
          webDistDir,
        }),
    ).toThrow(/score\.mjs.*npm run build/);
  });
});
