import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface ApiProps {
  bundleDir: string;
  table: ITable;
  uploads: IBucket;
  userPool: IUserPool;
  userPoolClient: IUserPoolClient;
}

export class Api extends Construct {
  readonly httpApi: HttpApi;
  readonly domainName: string;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    const logGroup = new LogGroup(this, 'Logs', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const handler = new Function(this, 'Handler', {
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      code: Code.fromAsset(props.bundleDir),
      handler: 'lambda.handler',
      memorySize: 512,
      timeout: Duration.seconds(29),
      logGroup,
      environment: {
        TABLE_NAME: props.table.tableName,
        UPLOADS_BUCKET: props.uploads.bucketName,
        USER_POOL_ID: props.userPool.userPoolId,
        USER_POOL_CLIENT_ID: props.userPoolClient.userPoolClientId,
      },
    });
    props.table.grantReadWriteData(handler);
    props.uploads.grantReadWrite(handler);

    this.httpApi = new HttpApi(this, 'HttpApi');
    this.httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration('Lambda', handler),
    });

    const stack = Stack.of(this);
    this.domainName = `${this.httpApi.apiId}.execute-api.${stack.region}.${stack.urlSuffix}`;
  }
}
