import { RemovalPolicy } from 'aws-cdk-lib';
import { FeaturePlan, UserPool, type UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

const staffGroups = ['admin', 'attending', 'therapist'] as const;

export class Auth extends Construct {
  readonly userPool: UserPool;
  readonly webClient: UserPoolClient;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.userPool = new UserPool(this, 'UserPool', {
      signInAliases: { email: true },
      selfSignUpEnabled: false,
      featurePlan: FeaturePlan.LITE,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    for (const group of staffGroups) {
      this.userPool.addGroup(`Group-${group}`, { groupName: group });
    }

    this.webClient = this.userPool.addClient('WebClient', {
      generateSecret: false,
      authFlows: { userSrp: true },
      disableOAuth: true,
      preventUserExistenceErrors: true,
    });
  }
}
