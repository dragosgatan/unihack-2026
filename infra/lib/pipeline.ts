import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import {
  DefinitionBody,
  Errors,
  StateMachine,
  StateMachineType,
  type IChainable,
  type INextable,
} from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export const pipelineSteps = [
  { id: 'Score', file: 'score', usesAi: false },
  { id: 'AiItems', file: 'ai-items', usesAi: true },
  { id: 'Compare', file: 'compare', usesAi: false },
  { id: 'DetectChange', file: 'detect-change', usesAi: false },
  { id: 'Suggest', file: 'suggest', usesAi: true },
  { id: 'Report', file: 'report', usesAi: true },
  { id: 'Notify', file: 'notify', usesAi: false },
] as const;

export interface PipelineProps {
  bundleDir: string;
  table: ITable;
  appUrl: string;
}

export class Pipeline extends Construct {
  readonly stateMachine: StateMachine;
  readonly geminiKeySecretName: string;

  constructor(scope: Construct, id: string, props: PipelineProps) {
    super(scope, id);

    const reportSender: unknown = this.node.tryGetContext('reportSender');
    const sender = typeof reportSender === 'string' && reportSender !== '' ? reportSender : undefined;
    const aiProvider = this.node.tryGetContext('aiProvider') === 'gemini' ? 'gemini' : 'mock';
    const geminiKey = new Secret(this, 'GeminiApiKey', {
      description: 'Gemini API key as a plain string',
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.geminiKeySecretName = geminiKey.secretName;
    const code = Code.fromAsset(props.bundleDir);
    const stack = Stack.of(this);

    const tasks = pipelineSteps.map(({ id: stepId, file, usesAi }) => {
      const handler = new Function(this, `${stepId}Function`, {
        runtime: Runtime.NODEJS_22_X,
        architecture: Architecture.ARM_64,
        code,
        handler: `${file}.handler`,
        memorySize: 512,
        timeout: Duration.minutes(usesAi ? 3 : 1),
        logGroup: new LogGroup(this, `${stepId}Logs`, {
          retention: RetentionDays.ONE_WEEK,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        environment: {
          TABLE_NAME: props.table.tableName,
          APP_URL: props.appUrl,
          AI_PROVIDER: aiProvider,
          ...(usesAi ? { GEMINI_SECRET_ARN: geminiKey.secretArn } : {}),
          ...(sender ? { REPORT_SENDER: sender } : {}),
        },
      });
      props.table.grantReadWriteData(handler);
      if (usesAi) geminiKey.grantRead(handler);
      if (sender) {
        handler.addToRolePolicy(
          new PolicyStatement({
            actions: ['ses:SendEmail'],
            resources: [stack.formatArn({ service: 'ses', resource: 'identity', resourceName: '*' })],
          }),
        );
      }

      const task = new LambdaInvoke(this, stepId, {
        lambdaFunction: handler,
        payloadResponseOnly: true,
        retryOnServiceExceptions: false,
      });
      task.addRetry({
        errors: [Errors.ALL],
        interval: Duration.seconds(2),
        backoffRate: 2,
        maxAttempts: 4,
      });
      return task;
    });

    const [first, ...rest] = tasks;
    if (!first) throw new Error('The pipeline has no steps');
    const definition = rest.reduce<IChainable & INextable>((chain, task) => chain.next(task), first);

    this.stateMachine = new StateMachine(this, 'StateMachine', {
      stateMachineType: StateMachineType.STANDARD,
      definitionBody: DefinitionBody.fromChainable(definition),
      timeout: Duration.minutes(30),
    });
  }
}
