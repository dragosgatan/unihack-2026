import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CachePolicy, OriginRequestPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TempoStack } from '../lib/tempo-stack.ts';

let root: string;
let apiBundleDir: string;
let webDistDir: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'tempo-infra-'));
  apiBundleDir = join(root, 'api');
  webDistDir = join(root, 'web');
  mkdirSync(apiBundleDir);
  mkdirSync(join(webDistDir, 'assets'), { recursive: true });
  writeFileSync(join(apiBundleDir, 'lambda.mjs'), 'export const handler = async () => ({});');
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
    webDistDir,
  });
  return Template.fromStack(stack);
}

describe('TempoStack', () => {
  let template: Template;

  beforeAll(() => {
    template = synth();
  });

  it('creates an on-demand single table keyed by pk and sk', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: Match.absent(),
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
      ExplicitAuthFlows: Match.arrayWith(['ALLOW_USER_SRP_AUTH']),
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
                'token.actions.githubusercontent.com:sub': 'repo:dragosgatan/unihack-2026:ref:refs/heads/main',
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
        },
      },
    });
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 7 });
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
          webDistDir,
        }),
    ).toThrow(/npm run build/);
  });
});
