import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider';
import { BatchWriteCommand, QueryCommand, type BatchWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { Staff } from '@tempo/shared';
import { buildSeed } from '../mock/seed/build.ts';
import { createDocumentClient, createDynamoStore } from '../store/dynamo.ts';
import { patientPk } from '../store/keys.ts';
import { loadSeed } from '../store/load-seed.ts';

type DeleteRequests = NonNullable<BatchWriteCommandInput['RequestItems']>[string];

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before running the demo loader`);
  return value;
};

const tableName = requiredEnv('TABLE_NAME');
const userPoolId = requiredEnv('USER_POOL_ID');
const region = requiredEnv('AWS_REGION');
const password = requiredEnv('DEMO_PASSWORD');

const cognito = new CognitoIdentityProviderClient({ region });
const documents = createDocumentClient();

const subOf = (attributes: AttributeType[] | undefined): string => {
  const sub = attributes?.find((attribute) => attribute.Name === 'sub')?.Value;
  if (!sub) throw new Error('Cognito user has no sub');
  return sub;
};

const existingSub = async (email: string): Promise<string | undefined> => {
  try {
    const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }));
    return subOf(user.UserAttributes);
  } catch (error) {
    if (error instanceof UserNotFoundException) return undefined;
    throw error;
  }
};

const ensureUser = async (staff: Staff): Promise<string> => {
  const sub =
    (await existingSub(staff.email)) ??
    subOf(
      (
        await cognito.send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: staff.email,
            MessageAction: 'SUPPRESS',
            UserAttributes: [
              { Name: 'email', Value: staff.email },
              { Name: 'email_verified', Value: 'true' },
            ],
          }),
        )
      ).User?.Attributes,
    );
  await cognito.send(
    new AdminSetUserPasswordCommand({ UserPoolId: userPoolId, Username: staff.email, Password: password, Permanent: true }),
  );
  await cognito.send(
    new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: staff.email, GroupName: staff.role }),
  );
  return sub;
};

const clearPartition = async (pk: string): Promise<void> => {
  let start: Record<string, unknown> | undefined;
  do {
    const page = await documents.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        ProjectionExpression: 'pk, sk',
        ExclusiveStartKey: start,
      }),
    );
    const keys = (page.Items ?? []).map((item) => ({ pk: item['pk'], sk: item['sk'] }));
    for (let index = 0; index < keys.length; index += 25) {
      let requests: DeleteRequests = keys.slice(index, index + 25).map((Key) => ({ DeleteRequest: { Key } }));
      while (requests.length > 0) {
        const result = await documents.send(new BatchWriteCommand({ RequestItems: { [tableName]: requests } }));
        requests = result.UnprocessedItems?.[tableName] ?? [];
      }
    }
    start = page.LastEvaluatedKey;
  } while (start);
};

const seed = buildSeed(new Date());
const subs = new Map<string, string>();
for (const staff of seed.staff) {
  subs.set(staff.id, await ensureUser(staff));
  console.log(`${staff.role.padEnd(9)} ${staff.email}`);
}

for (const patient of seed.patients) await clearPartition(patientPk(patient.id));
const notifyEmail = process.env['DEMO_NOTIFY_EMAIL'];
const delivered = notifyEmail
  ? {
      ...seed,
      staff: seed.staff.map((staff) => (staff.role === 'attending' ? { ...staff, email: notifyEmail } : staff)),
      patients: seed.patients.map((patient) => (patient.reminderEmail ? { ...patient, reminderEmail: notifyEmail } : patient)),
    }
  : seed;
const loaded = await loadSeed(createDynamoStore({ tableName, client: documents }), delivered, subs);
console.log(
  `Loaded ${loaded.patients.length} patients, ${loaded.sessions.length} sessions and ${loaded.metricValues.length} metric values into ${tableName}`,
);
