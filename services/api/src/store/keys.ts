import type { ActivityId, Flag, MetricId, Side, SkipFlag } from '@tempo/shared';
import type { PublicDataKind } from './types.ts';

export type Key = { pk: string; sk: string };
export type IndexKey = { gsi1pk: string; gsi1sk: string };

const meta = 'META';
const sideKey = (side: Side | undefined): string => side ?? 'none';
const pad = (value: number, width: number): string => String(value).padStart(width, '0');

export const institutionPk = (institutionId: string): string => `INST#${institutionId}`;
export const patientPk = (patientId: string): string => `PATIENT#${patientId}`;
export const sessionPk = (sessionId: string): string => `SESSION#${sessionId}`;

export const institutionKey = (institutionId: string): Key => ({ pk: institutionPk(institutionId), sk: meta });

export const staffKey = (staffId: string): Key => ({ pk: `STAFF#${staffId}`, sk: meta });
export const staffIndexKey = (institutionId: string, staffId: string): IndexKey => ({
  gsi1pk: institutionPk(institutionId),
  gsi1sk: `STAFF#${staffId}`,
});

export const patientKey = (patientId: string): Key => ({ pk: patientPk(patientId), sk: meta });
export const patientIndexPrefix = 'PATIENT#';
export const patientIndexKey = (institutionId: string, patientId: string): IndexKey => ({
  gsi1pk: institutionPk(institutionId),
  gsi1sk: `${patientIndexPrefix}${patientId}`,
});

export const recordKey = (patientId: string): Key => ({ pk: patientPk(patientId), sk: 'RECORD' });
export const currentPlanKey = (patientId: string): Key => ({ pk: patientPk(patientId), sk: 'PLAN#CURRENT' });
export const planVersionKey = (patientId: string, version: number): Key => ({
  pk: patientPk(patientId),
  sk: `PLAN#V#${pad(version, 4)}`,
});

export const devicePrefix = 'DEVICE#';
export const deviceKey = (patientId: string, deviceId: string): Key => ({
  pk: patientPk(patientId),
  sk: `${devicePrefix}${deviceId}`,
});

export const pointPrefix = (metricId: MetricId, side: Side | undefined): string =>
  `POINT#${metricId}#${sideKey(side)}#`;
export const pointKey = (patientId: string, metricId: MetricId, side: Side | undefined, t: string): Key => ({
  pk: patientPk(patientId),
  sk: `${pointPrefix(metricId, side)}${t}`,
});

export const latestPrefix = 'LATEST#';
export const latestKey = (patientId: string, metricId: MetricId, side: Side | undefined): Key => ({
  pk: patientPk(patientId),
  sk: `${latestPrefix}${metricId}#${sideKey(side)}`,
});

export const baselinePrefix = (metricId: MetricId, side: Side | undefined): string =>
  `BASELINE#${metricId}#${sideKey(side)}#`;
export const baselineKey = (patientId: string, metricId: MetricId, side: Side | undefined, from: string): Key => ({
  pk: patientPk(patientId),
  sk: `${baselinePrefix(metricId, side)}${from}`,
});

export const skipPrefix = (activityId: ActivityId): string => `SKIP#${activityId}#`;
export const skipKey = (patientId: string, activityId: ActivityId, t: string, sessionId: string): Key => ({
  pk: patientPk(patientId),
  sk: `${skipPrefix(activityId)}${t}#${sessionId}`,
});
export const skipRange = (activityId: ActivityId, from: string, to: string): [string, string] => [
  `${skipPrefix(activityId)}${from}`,
  `${skipPrefix(activityId)}${to}#￿`,
];

export const sessionKey = (sessionId: string): Key => ({ pk: sessionPk(sessionId), sk: meta });
export const sessionIndexPrefix = 'SESSION#';
export const sessionIndexKey = (patientId: string, createdAt: string): IndexKey => ({
  gsi1pk: patientPk(patientId),
  gsi1sk: `${sessionIndexPrefix}${createdAt}`,
});
export const painAlertKey = (sessionId: string): Key => ({ pk: sessionPk(sessionId), sk: 'PAIN_ALERT' });
export const resultPrefix = 'RESULT#';
export const resultKey = (sessionId: string, index: number): Key => ({
  pk: sessionPk(sessionId),
  sk: `${resultPrefix}${pad(index, 2)}`,
});

export const reportKey = (sessionId: string): Key => ({ pk: sessionPk(sessionId), sk: 'REPORT' });

export const patientFlagPrefix = 'FLAG#';
export const flagPrefix = (sessionId: string): string => `${patientFlagPrefix}${sessionId}#`;
export const flagKey = (patientId: string, sessionId: string, metricId: MetricId, side: Side | undefined): Key => ({
  pk: patientPk(patientId),
  sk: `${flagPrefix(sessionId)}${metricId}#${sideKey(side)}`,
});
export const skipFlagKey = (
  patientId: string,
  sessionId: string,
  kind: SkipFlag['kind'],
  activityId: ActivityId,
): Key => ({
  pk: patientPk(patientId),
  sk: `${flagPrefix(sessionId)}${kind}#${activityId}`,
});
export const keyOfFlag = (flag: Flag): Key =>
  flag.kind === 'reliable-change'
    ? flagKey(flag.patientId, flag.sessionId, flag.metricId, flag.side)
    : skipFlagKey(flag.patientId, flag.sessionId, flag.kind, flag.activityId);

export const codeKey = (code: string): Key => ({ pk: `CODE#${code}`, sk: meta });

export const publicDataKey = (kind: PublicDataKind, query: string): Key => ({
  pk: `PUBLIC#${kind}#${query}`,
  sk: meta,
});

export const suggestionPrefix = 'SUGGESTION#';
export const suggestionKey = (patientId: string, suggestionId: string): Key => ({
  pk: patientPk(patientId),
  sk: `${suggestionPrefix}${suggestionId}`,
});

export const checkInPrefix = 'CHECKIN#';
export const checkInKey = (patientId: string, recordedAt: string, entryId: string): Key => ({
  pk: patientPk(patientId),
  sk: `${checkInPrefix}${recordedAt}#${entryId}`,
});
export const checkInRange = (from: string, to: string): [string, string] => [
  `${checkInPrefix}${from}`,
  `${checkInPrefix}${to}#￿`,
];
