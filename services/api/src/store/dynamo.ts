import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type BatchWriteCommandInput,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import {
  activityResultSchema,
  baselineSchema,
  checkInEntrySchema,
  flagSchema,
  isoDateTimeSchema,
  medicalRecordSchema,
  metricIdSchema,
  pairedDeviceSchema,
  patientSchema,
  sessionPlanSchema,
  sessionReportSchema,
  sessionSchema,
  sideSchema,
  skipEventSchema,
  staffSchema,
  suggestionSchema,
  type MetricPoint,
  type Session,
} from '@tempo/shared';
import {
  baselineKey,
  baselinePrefix,
  checkInKey,
  checkInRange,
  codeKey,
  currentPlanKey,
  deviceKey,
  devicePrefix,
  flagPrefix,
  institutionKey,
  institutionPk,
  keyOfFlag,
  latestKey,
  latestPrefix,
  patientIndexKey,
  patientIndexPrefix,
  patientKey,
  painAlertKey,
  patientFlagPrefix,
  patientPk,
  planVersionKey,
  pointKey,
  pointPrefix,
  publicDataKey,
  recordKey,
  reportKey,
  resultKey,
  resultPrefix,
  sessionIndexKey,
  sessionIndexPrefix,
  sessionKey,
  sessionPk,
  skipKey,
  skipRange,
  staffIndexKey,
  staffKey,
  suggestionKey,
  suggestionPrefix,
  type Key,
} from './keys.ts';
import { storedCheckIns, storedResults, storedSkips } from './submission.ts';
import { newestFirst } from './suggestions.ts';
import type { CodeEntry, MetricValue, PublicDataEntry, Store } from './types.ts';

type Item = Record<string, unknown>;
type WriteRequests = NonNullable<BatchWriteCommandInput['RequestItems']>[string];

const metricValueSchema = z.object({
  patientId: z.string().min(1),
  sessionId: z.string().min(1),
  metricId: metricIdSchema,
  side: sideSchema.optional(),
  t: isoDateTimeSchema,
  value: z.number(),
});

const codeFields = { code: z.string().min(1), expiresAt: isoDateTimeSchema, used: z.boolean() };
const codeEntrySchema = z.discriminatedUnion('kind', [
  z.object({ ...codeFields, kind: z.literal('session'), sessionId: z.string().min(1) }),
  z.object({ ...codeFields, kind: z.literal('pairing'), patientId: z.string().min(1) }),
]);

const publicDataEntrySchema = z.object({
  kind: z.enum(['rxnorm', 'icd10', 'openfda-label']),
  query: z.string(),
  fetchedAt: isoDateTimeSchema,
  keepUntil: isoDateTimeSchema,
  value: z.unknown(),
});

const batchSize = 25;
const codeTtlGraceSeconds = 60 * 60;
const dataName = { '#data': 'data' };

const dataOf = (item: Item | undefined): unknown => item?.['data'];

const point = (item: Item): MetricPoint => {
  const { t, value, sessionId } = metricValueSchema.parse(dataOf(item));
  return { t, value, sessionId };
};

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type DynamoStoreOptions = { tableName: string; client?: DynamoDBDocumentClient };

export const createDocumentClient = (): DynamoDBDocumentClient =>
  DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

export const createDynamoStore = ({ tableName, client = createDocumentClient() }: DynamoStoreOptions): Store => {
  const get = async (key: Key): Promise<Item | undefined> =>
    (await client.send(new GetCommand({ TableName: tableName, Key: key }))).Item;

  const put = async (item: Item): Promise<void> => {
    await client.send(new PutCommand({ TableName: tableName, Item: item }));
  };

  const queryAll = async (input: Omit<QueryCommandInput, 'TableName'>): Promise<Item[]> => {
    const items: Item[] = [];
    let start: Item | undefined;
    do {
      const page = await client.send(new QueryCommand({ ...input, TableName: tableName, ExclusiveStartKey: start }));
      items.push(...(page.Items ?? []));
      start = page.LastEvaluatedKey;
    } while (start);
    return items;
  };

  const queryPrefix = (pk: string, prefix: string): Promise<Item[]> =>
    queryAll({
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
    });

  const queryBetween = (pk: string, low: string, high: string): Promise<Item[]> =>
    queryAll({
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :low AND :high',
      ExpressionAttributeValues: { ':pk': pk, ':low': low, ':high': high },
    });

  const queryFirst = async (pk: string, prefix: string, count: number, forward: boolean): Promise<Item[]> =>
    (
      await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
          ScanIndexForward: forward,
          Limit: count,
        }),
      )
    ).Items ?? [];

  const queryLast = async (pk: string, low: string, high: string, count: number): Promise<Item[]> =>
    (
      await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk AND sk BETWEEN :low AND :high',
          ExpressionAttributeValues: { ':pk': pk, ':low': low, ':high': high },
          ScanIndexForward: false,
          Limit: count,
        }),
      )
    ).Items ?? [];

  const writeAll = async (items: Item[]): Promise<void> => {
    for (let start = 0; start < items.length; start += batchSize) {
      let requests: WriteRequests = items.slice(start, start + batchSize).map((Item) => ({ PutRequest: { Item } }));
      for (let attempt = 1; requests.length > 0; attempt += 1) {
        if (attempt > 1) await pause(50 * 2 ** attempt);
        const result = await client.send(new BatchWriteCommand({ RequestItems: { [tableName]: requests } }));
        requests = result.UnprocessedItems?.[tableName] ?? [];
      }
    }
  };

  const isConditionFailure = (error: unknown): boolean => error instanceof ConditionalCheckFailedException;

  const sessionItem = (session: Session): Item => ({
    ...sessionKey(session.id),
    ...sessionIndexKey(session.patientId, session.createdAt),
    data: session,
  });

  const getSession = async (sessionId: string): Promise<Session | undefined> => {
    const item = await get(sessionKey(sessionId));
    return item && sessionSchema.parse(dataOf(item));
  };

  return {
    getStaff: async (staffId) => {
      const item = await get(staffKey(staffId));
      return item && staffSchema.parse(dataOf(item));
    },

    listPatients: async (institutionId) => {
      const items = await queryAll({
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk AND begins_with(gsi1sk, :prefix)',
        ExpressionAttributeValues: { ':pk': institutionPk(institutionId), ':prefix': patientIndexPrefix },
      });
      return items.map((item) => patientSchema.parse(dataOf(item)));
    },

    getPatientDetail: async (patientId) => {
      const wanted = [patientKey(patientId), recordKey(patientId), currentPlanKey(patientId)];
      const found: Item[] = [];
      let keys: Item[] = wanted;
      for (let attempt = 1; keys.length > 0; attempt += 1) {
        if (attempt > 1) await pause(50 * 2 ** attempt);
        const result = await client.send(new BatchGetCommand({ RequestItems: { [tableName]: { Keys: keys } } }));
        found.push(...(result.Responses?.[tableName] ?? []));
        keys = result.UnprocessedKeys?.[tableName]?.Keys ?? [];
      }
      const bySk = (key: Key): Item | undefined => found.find((item) => item['sk'] === key.sk);
      const patientItem = bySk(patientKey(patientId));
      if (!patientItem) return undefined;
      const recordItem = bySk(recordKey(patientId));
      const planItem = bySk(currentPlanKey(patientId));
      return {
        patient: patientSchema.parse(dataOf(patientItem)),
        record: recordItem && medicalRecordSchema.parse(dataOf(recordItem)),
        plan: planItem && sessionPlanSchema.parse(dataOf(planItem)),
      };
    },

    getSession,

    listPatientSessions: async (patientId) => {
      const items = await queryAll({
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk AND begins_with(gsi1sk, :prefix)',
        ExpressionAttributeValues: { ':pk': patientPk(patientId), ':prefix': sessionIndexPrefix },
      });
      return items.map((item) => sessionSchema.parse(dataOf(item)));
    },

    putSession: (session) => put(sessionItem(session)),

    submitSession: async (session, { partial, submittedAt, results }) => {
      await writeAll([
        ...storedResults(session, results).map((result, index) => ({ ...resultKey(session.id, index), data: result })),
        ...storedSkips(session, results).map(({ activityId, event }) => ({
          ...skipKey(session.patientId, activityId, event.t, session.id),
          data: event,
        })),
        ...storedCheckIns(session, results).map((entry) => ({
          ...checkInKey(entry.patientId, entry.recordedAt, entry.id),
          data: entry,
        })),
      ]);
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: sessionKey(session.id),
            UpdateExpression: 'SET #data.#status = :submitted, #data.#partial = :partial, #data.#submittedAt = :at',
            ConditionExpression: '#data.#status IN (:created, :inProgress)',
            ExpressionAttributeNames: {
              ...dataName,
              '#status': 'status',
              '#partial': 'partial',
              '#submittedAt': 'submittedAt',
            },
            ExpressionAttributeValues: {
              ':submitted': 'submitted',
              ':partial': partial,
              ':at': submittedAt,
              ':created': 'created',
              ':inProgress': 'in-progress',
            },
          }),
        );
        return 'submitted';
      } catch (error) {
        if (!isConditionFailure(error)) throw error;
        const current = await getSession(session.id);
        if (!current) throw new Error(`Session ${session.id} does not exist`);
        return current.status;
      }
    },

    createCode: async (entry, now) => {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              ...codeKey(entry.code),
              ttl: Math.floor(Date.parse(entry.expiresAt) / 1000) + codeTtlGraceSeconds,
              data: entry,
            },
            ConditionExpression: 'attribute_not_exists(pk) OR #data.#used = :true OR #data.#expiresAt <= :now',
            ExpressionAttributeNames: { ...dataName, '#used': 'used', '#expiresAt': 'expiresAt' },
            ExpressionAttributeValues: { ':true': true, ':now': now.toISOString() },
          }),
        );
        return true;
      } catch (error) {
        if (isConditionFailure(error)) return false;
        throw error;
      }
    },

    redeemCode: async (code, kind, now): Promise<CodeEntry | undefined> => {
      try {
        const result = await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: codeKey(code),
            UpdateExpression: 'SET #data.#used = :true',
            ConditionExpression:
              'attribute_exists(pk) AND #data.#kind = :kind AND #data.#used = :false AND #data.#expiresAt > :now',
            ExpressionAttributeNames: { ...dataName, '#used': 'used', '#kind': 'kind', '#expiresAt': 'expiresAt' },
            ExpressionAttributeValues: { ':true': true, ':false': false, ':kind': kind, ':now': now.toISOString() },
            ReturnValues: 'ALL_NEW',
          }),
        );
        return codeEntrySchema.parse(dataOf(result.Attributes));
      } catch (error) {
        if (isConditionFailure(error)) return undefined;
        throw error;
      }
    },

    getDevice: async (patientId, deviceId) => {
      const item = await get(deviceKey(patientId, deviceId));
      return item && pairedDeviceSchema.parse(dataOf(item));
    },

    putDevice: (device) => put({ ...deviceKey(device.patientId, device.id), data: device }),

    listDevices: async (patientId) =>
      (await queryPrefix(patientPk(patientId), devicePrefix)).map((item) => pairedDeviceSchema.parse(dataOf(item))),

    listLatest: async (patientId) =>
      (await queryPrefix(patientPk(patientId), latestPrefix)).map((item) => {
        const { metricId, side, t, value } = metricValueSchema.parse(dataOf(item));
        return { metricId, ...(side ? { side } : {}), t, value };
      }),

    listPoints: async (patientId, metricId, side, { from, to }) => {
      const prefix = pointPrefix(metricId, side);
      return (await queryBetween(patientPk(patientId), `${prefix}${from}`, `${prefix}${to}`)).map(point);
    },

    firstPoints: async (patientId, metricId, side, count) =>
      (await queryFirst(patientPk(patientId), pointPrefix(metricId, side), count, true)).map(point),

    latestBaseline: async (patientId, metricId, side) => {
      const [item] = await queryFirst(patientPk(patientId), baselinePrefix(metricId, side), 1, false);
      return item && baselineSchema.parse(dataOf(item));
    },

    listSkipEvents: async (patientId, activityId, { from, to }) => {
      const [low, high] = skipRange(activityId, from, to);
      return (await queryBetween(patientPk(patientId), low, high)).map((item) => skipEventSchema.parse(dataOf(item)));
    },

    putInstitution: (institution) => put({ ...institutionKey(institution.id), data: institution }),

    putStaff: (staff) => put({ ...staffKey(staff.id), ...staffIndexKey(staff.institutionId, staff.id), data: staff }),

    putPatient: (patient) =>
      put({ ...patientKey(patient.id), ...patientIndexKey(patient.institutionId, patient.id), data: patient }),

    putRecord: (record) => put({ ...recordKey(record.patientId), data: record }),

    putPlan: (plan) =>
      writeAll([
        { ...currentPlanKey(plan.patientId), data: plan },
        { ...planVersionKey(plan.patientId, plan.version), data: plan },
      ]),

    putMetricValues: async (values) => {
      await writeAll(
        values.map((value) => ({ ...pointKey(value.patientId, value.metricId, value.side, value.t), data: value })),
      );
      const newest = new Map<string, MetricValue>();
      for (const value of values) {
        const key = latestKey(value.patientId, value.metricId, value.side);
        const id = `${key.pk}|${key.sk}`;
        const current = newest.get(id);
        if (!current || current.t <= value.t) newest.set(id, value);
      }
      for (const value of newest.values()) {
        try {
          await client.send(
            new PutCommand({
              TableName: tableName,
              Item: { ...latestKey(value.patientId, value.metricId, value.side), data: value },
              ConditionExpression: 'attribute_not_exists(pk) OR #data.#t <= :t',
              ExpressionAttributeNames: { ...dataName, '#t': 't' },
              ExpressionAttributeValues: { ':t': value.t },
            }),
          );
        } catch (error) {
          if (!isConditionFailure(error)) throw error;
        }
      }
    },

    listResults: async (sessionId) =>
      (await queryPrefix(sessionPk(sessionId), resultPrefix)).map((item) => activityResultSchema.parse(dataOf(item))),

    putResults: (sessionId, results) =>
      writeAll(results.map((result, index) => ({ ...resultKey(sessionId, index), data: result }))),

    setSessionStatus: async (sessionId, status) => {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: sessionKey(sessionId),
          UpdateExpression: 'SET #data.#status = :status',
          ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeNames: { ...dataName, '#status': 'status' },
          ExpressionAttributeValues: { ':status': status },
        }),
      );
    },

    claimPainAlert: async (sessionId) => {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: painAlertKey(sessionId),
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        );
        return true;
      } catch (error) {
        if (isConditionFailure(error)) return false;
        throw error;
      }
    },

    releasePainAlert: async (sessionId) => {
      await client.send(new DeleteCommand({ TableName: tableName, Key: painAlertKey(sessionId) }));
    },

    putBaseline: (baseline) =>
      put({ ...baselineKey(baseline.patientId, baseline.metricId, baseline.side, baseline.from), data: baseline }),

    baselineAt: async (patientId, metricId, side, at) => {
      const prefix = baselinePrefix(metricId, side);
      const [item] = await queryLast(patientPk(patientId), prefix, `${prefix}${at}`, 1);
      return item && baselineSchema.parse(dataOf(item));
    },

    previousPoint: async (patientId, metricId, side, before) => {
      const prefix = pointPrefix(metricId, side);
      const items = await queryLast(patientPk(patientId), prefix, `${prefix}${before}`, 2);
      return items.map(point).find((candidate) => candidate.t < before);
    },

    putFlags: (flags) => writeAll(flags.map((flag) => ({ ...keyOfFlag(flag), data: flag }))),

    listFlags: async (patientId, sessionId) =>
      (await queryPrefix(patientPk(patientId), flagPrefix(sessionId))).map((item) => flagSchema.parse(dataOf(item))),

    listPatientFlags: async (patientId) =>
      (await queryPrefix(patientPk(patientId), patientFlagPrefix))
        .map((item) => flagSchema.parse(dataOf(item)))
        .sort(newestFirst),

    listCheckIns: async (patientId, { from, to }) => {
      const [low, high] = checkInRange(from, to);
      return (await queryBetween(patientPk(patientId), low, high)).map((item) => checkInEntrySchema.parse(dataOf(item)));
    },

    putReport: (report) => put({ ...reportKey(report.sessionId), data: report }),

    getReport: async (sessionId) => {
      const item = await get(reportKey(sessionId));
      return item && sessionReportSchema.parse(dataOf(item));
    },

    getPublicData: async (kind, query): Promise<PublicDataEntry | undefined> => {
      const parsed = publicDataEntrySchema.safeParse(dataOf(await get(publicDataKey(kind, query))));
      return parsed.success ? parsed.data : undefined;
    },

    putPublicData: (entry) =>
      put({
        ...publicDataKey(entry.kind, entry.query),
        ttl: Math.floor(Date.parse(entry.keepUntil) / 1000),
        data: entry,
      }),

    createSuggestion: async (suggestion) => {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: { ...suggestionKey(suggestion.patientId, suggestion.id), data: suggestion },
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        );
        return true;
      } catch (error) {
        if (isConditionFailure(error)) return false;
        throw error;
      }
    },

    getSuggestion: async (patientId, suggestionId) => {
      const item = await get(suggestionKey(patientId, suggestionId));
      return item && suggestionSchema.parse(dataOf(item));
    },

    listSuggestions: async (patientId) =>
      (await queryPrefix(patientPk(patientId), suggestionPrefix))
        .map((item) => suggestionSchema.parse(dataOf(item)))
        .sort(newestFirst),

    decideSuggestion: async (patientId, suggestionId, { status, editedText, decidedBy, decidedAt }) => {
      const set = ['#data.#status = :status', '#data.#decidedBy = :by', '#data.#decidedAt = :at'];
      const edited = editedText === undefined ? {} : { ':text': editedText };
      try {
        const result = await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: suggestionKey(patientId, suggestionId),
            UpdateExpression:
              editedText === undefined
                ? `SET ${set.join(', ')} REMOVE #data.#editedText`
                : `SET ${[...set, '#data.#editedText = :text'].join(', ')}`,
            ConditionExpression: 'attribute_exists(pk)',
            ExpressionAttributeNames: {
              ...dataName,
              '#status': 'status',
              '#decidedBy': 'decidedBy',
              '#decidedAt': 'decidedAt',
              '#editedText': 'editedText',
            },
            ExpressionAttributeValues: { ':status': status, ':by': decidedBy, ':at': decidedAt, ...edited },
            ReturnValues: 'ALL_NEW',
          }),
        );
        return suggestionSchema.parse(dataOf(result.Attributes));
      } catch (error) {
        if (isConditionFailure(error)) return undefined;
        throw error;
      }
    },
  };
};
