import { Stack } from 'aws-cdk-lib';
import {
  type IOidcProvider,
  OidcProviderNative,
  OpenIdConnectPrincipal,
  PolicyStatement,
  Role,
} from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

const githubIssuer = 'token.actions.githubusercontent.com';
const deployBranchSubject = 'repo:dragosgatan/unihack-2026:ref:refs/heads/main';

export class DeployRole extends Construct {
  readonly role: Role;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stack = Stack.of(this);
    const existingProviderArn: unknown = this.node.tryGetContext('githubOidcProviderArn');
    const provider: IOidcProvider =
      typeof existingProviderArn === 'string' && existingProviderArn !== ''
        ? OidcProviderNative.fromOidcProviderArn(this, 'GithubProvider', existingProviderArn)
        : new OidcProviderNative(this, 'GithubProvider', {
            url: `https://${githubIssuer}`,
            clientIds: ['sts.amazonaws.com'],
          });

    this.role = new Role(this, 'Role', {
      assumedBy: new OpenIdConnectPrincipal(provider, {
        StringEquals: {
          [`${githubIssuer}:aud`]: 'sts.amazonaws.com',
          [`${githubIssuer}:sub`]: deployBranchSubject,
        },
      }),
    });

    this.role.addToPolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:${stack.partition}:iam::${stack.account}:role/cdk-hnb659fds-*-${stack.account}-${stack.region}`,
        ],
      }),
    );
  }
}
