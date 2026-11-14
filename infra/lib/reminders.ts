import { Duration, RemovalPolicy, Stack, TimeZone } from 'aws-cdk-lib';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Schedule, ScheduleExpression, ScheduleTargetInput, TimeWindow } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
import { Construct } from 'constructs';

export const reminderSchedules = [
  { id: 'CheckIn', kind: 'check-in', hour: '9' },
  { id: 'MissedSessions', kind: 'missed-sessions', hour: '18' },
] as const;

export interface RemindersProps {
  bundleDir: string;
  table: ITable;
  appUrl: string;
}

export class Reminders extends Construct {
  readonly handler: Function;

  constructor(scope: Construct, id: string, props: RemindersProps) {
    super(scope, id);

    const reportSender: unknown = this.node.tryGetContext('reportSender');
    const sender = typeof reportSender === 'string' && reportSender !== '' ? reportSender : undefined;

    this.handler = new Function(this, 'Function', {
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      code: Code.fromAsset(props.bundleDir),
      handler: 'reminders.handler',
      memorySize: 512,
      timeout: Duration.minutes(5),
      retryAttempts: 1,
      logGroup: new LogGroup(this, 'Logs', {
        retention: RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        TABLE_NAME: props.table.tableName,
        APP_URL: props.appUrl,
        ...(sender ? { REPORT_SENDER: sender } : {}),
      },
    });
    props.table.grantReadWriteData(this.handler);
    if (sender) {
      this.handler.addToRolePolicy(
        new PolicyStatement({
          actions: ['ses:SendEmail'],
          resources: [Stack.of(this).formatArn({ service: 'ses', resource: 'identity', resourceName: '*' })],
        }),
      );
    }

    for (const { id: scheduleId, kind, hour } of reminderSchedules) {
      new Schedule(this, `${scheduleId}Schedule`, {
        description: `Tempo ${kind} reminders`,
        schedule: ScheduleExpression.cron({ minute: '0', hour, timeZone: TimeZone.EUROPE_BUCHAREST }),
        timeWindow: TimeWindow.off(),
        target: new LambdaInvoke(this.handler, {
          input: ScheduleTargetInput.fromObject({ kind }),
          retryAttempts: 1,
        }),
      });
    }
  }
}
