import { describe, expect, it } from 'vitest';
import {
  baselineKey,
  checkInKey,
  checkInRange,
  codeKey,
  currentPlanKey,
  deviceKey,
  episodeKey,
  episodePrefix,
  flagKey,
  flagPrefix,
  institutionKey,
  institutionListIndexKey,
  keyOfFlag,
  latestKey,
  painAlertKey,
  patientFlagPrefix,
  patientIndexKey,
  patientKey,
  planVersionKey,
  pointKey,
  pointPrefix,
  recordKey,
  reminderKey,
  reportKey,
  reportLinkKey,
  resultKey,
  sessionIndexKey,
  sessionKey,
  skipFlagKey,
  skipKey,
  skipRange,
  staffIndexKey,
  staffKey,
} from './keys.ts';

const t = '2026-11-13T10:00:00.000Z';

describe('table keys', () => {
  it('builds institution, staff and patient keys with their index keys', () => {
    expect(institutionKey('inst-1')).toEqual({ pk: 'INST#inst-1', sk: 'META' });
    expect(staffKey('sub-1')).toEqual({ pk: 'STAFF#sub-1', sk: 'META' });
    expect(staffIndexKey('inst-1', 'sub-1')).toEqual({ gsi1pk: 'INST#inst-1', gsi1sk: 'STAFF#sub-1' });
    expect(patientKey('pat-1')).toEqual({ pk: 'PATIENT#pat-1', sk: 'META' });
    expect(patientIndexKey('inst-1', 'pat-1')).toEqual({ gsi1pk: 'INST#inst-1', gsi1sk: 'PATIENT#pat-1' });
  });

  it('keeps record, plans and devices under the patient', () => {
    expect(recordKey('pat-1')).toEqual({ pk: 'PATIENT#pat-1', sk: 'RECORD' });
    expect(currentPlanKey('pat-1')).toEqual({ pk: 'PATIENT#pat-1', sk: 'PLAN#CURRENT' });
    expect(planVersionKey('pat-1', 7)).toEqual({ pk: 'PATIENT#pat-1', sk: 'PLAN#V#0007' });
    expect(deviceKey('pat-1', 'dev-1')).toEqual({ pk: 'PATIENT#pat-1', sk: 'DEVICE#dev-1' });
  });

  it('writes none for a metric without a side', () => {
    expect(pointKey('pat-1', 'pain.intensity', undefined, t)).toEqual({
      pk: 'PATIENT#pat-1',
      sk: `POINT#pain.intensity#none#${t}`,
    });
    expect(latestKey('pat-1', 'finger-tapping.taps-per-second', 'right')).toEqual({
      pk: 'PATIENT#pat-1',
      sk: 'LATEST#finger-tapping.taps-per-second#right',
    });
    expect(baselineKey('pat-1', 'pain.intensity', undefined, t).sk).toBe(`BASELINE#pain.intensity#none#${t}`);
  });

  it('makes point keys sort by time inside their prefix', () => {
    const prefix = pointPrefix('finger-tapping.taps-per-second', 'left');
    const earlier = pointKey('pat-1', 'finger-tapping.taps-per-second', 'left', '2026-09-01T10:00:00.000Z').sk;
    const later = pointKey('pat-1', 'finger-tapping.taps-per-second', 'left', '2026-10-01T10:00:00.000Z').sk;
    expect(earlier.startsWith(prefix)).toBe(true);
    expect(earlier < later).toBe(true);
  });

  it('builds skip keys that fall inside the range that ends at their own time', () => {
    const key = skipKey('pat-1', 'finger-tapping', t, 'sess-9');
    expect(key).toEqual({ pk: 'PATIENT#pat-1', sk: `SKIP#finger-tapping#${t}#sess-9` });
    const [low, high] = skipRange('finger-tapping', '2026-11-01T00:00:00.000Z', t);
    expect(key.sk > low && key.sk < high).toBe(true);
    const [, before] = skipRange('finger-tapping', '2026-11-01T00:00:00.000Z', '2026-11-13T09:59:59.999Z');
    expect(key.sk > before).toBe(true);
  });

  it('builds session, result and code keys', () => {
    expect(sessionKey('sess-1')).toEqual({ pk: 'SESSION#sess-1', sk: 'META' });
    expect(sessionIndexKey('pat-1', t)).toEqual({ gsi1pk: 'PATIENT#pat-1', gsi1sk: `SESSION#${t}` });
    expect(resultKey('sess-1', 3)).toEqual({ pk: 'SESSION#sess-1', sk: 'RESULT#03' });
    expect(codeKey('042917')).toEqual({ pk: 'CODE#042917', sk: 'META' });
  });

  it('keeps the report under the session and one flag per session, metric and side under the patient', () => {
    expect(reportKey('sess-1')).toEqual({ pk: 'SESSION#sess-1', sk: 'REPORT' });
    const flag = flagKey('pat-1', 'sess-1', 'finger-tapping.taps-per-second', 'left');
    expect(flag).toEqual({ pk: 'PATIENT#pat-1', sk: 'FLAG#sess-1#finger-tapping.taps-per-second#left' });
    expect(flag.sk.startsWith(flagPrefix('sess-1'))).toBe(true);
    expect(flag.sk.startsWith(flagPrefix('sess-10'))).toBe(false);
  });

  it('keeps one skip flag per session, kind and activity next to the metric flags', () => {
    const pain = skipFlagKey('pat-1', 'sess-1', 'pain-skip', 'shoulder-raise');
    expect(pain).toEqual({ pk: 'PATIENT#pat-1', sk: 'FLAG#sess-1#pain-skip#shoulder-raise' });
    expect(pain.sk.startsWith(flagPrefix('sess-1'))).toBe(true);
    expect(skipFlagKey('pat-1', 'sess-1', 'repeated-skip', 'shoulder-raise')).not.toEqual(pain);
    expect(pain.sk.startsWith(patientFlagPrefix)).toBe(true);
    const base = { id: 'f', patientId: 'pat-1', sessionId: 'sess-1', createdAt: t } as const;
    expect(keyOfFlag({ ...base, kind: 'pain-skip', activityId: 'shoulder-raise', stage: 'task' })).toEqual(pain);
    expect(
      keyOfFlag({ ...base, kind: 'reliable-change', metricId: 'pain.intensity', value: 6, baseline: 3 }),
    ).toEqual(flagKey('pat-1', 'sess-1', 'pain.intensity', undefined));
  });

  it('builds check-in keys under the patient that sort by time and fall inside a range ending at their own time', () => {
    const key = checkInKey('pat-1', t, 'sess-9-r00');
    expect(key).toEqual({ pk: 'PATIENT#pat-1', sk: `CHECKIN#${t}#sess-9-r00` });
    const [low, high] = checkInRange('2026-11-01T00:00:00.000Z', t);
    expect(key.sk > low && key.sk < high).toBe(true);
    const [, before] = checkInRange('2026-11-01T00:00:00.000Z', '2026-11-13T09:59:59.999Z');
    expect(key.sk > before).toBe(true);
    expect(checkInKey('pat-1', '2026-11-12T10:00:00.000Z', 'sess-9-r00').sk < key.sk).toBe(true);
  });

  it('keys an episode by patient and id, so the same id under another patient is a different item', () => {
    expect(episodeKey('pat-1', 'ep-1')).toEqual({ pk: 'PATIENT#pat-1', sk: 'EPISODE#ep-1' });
    expect(episodeKey('pat-1', 'ep-1').sk.startsWith(episodePrefix)).toBe(true);
    expect(episodeKey('pat-2', 'ep-1')).not.toEqual(episodeKey('pat-1', 'ep-1'));
    expect(episodeKey('pat-1', 'ep-1').sk.startsWith('CHECKIN#')).toBe(false);
  });

  it('keeps the pain alert marker under the session', () => {
    expect(painAlertKey('sess-1')).toEqual({ pk: 'SESSION#sess-1', sk: 'PAIN_ALERT' });
  });

  it('lists every institution under one index partition', () => {
    expect(institutionListIndexKey('inst-1')).toEqual({ gsi1pk: 'INSTITUTIONS', gsi1sk: 'inst-1' });
    expect(institutionListIndexKey('inst-1').gsi1pk).not.toBe(staffIndexKey('inst-1', 'sub-1').gsi1pk);
  });

  it('keeps one reminder marker per patient, kind and occurrence', () => {
    expect(reminderKey('pat-1', 'check-in', '2026-11-13')).toEqual({
      pk: 'PATIENT#pat-1',
      sk: 'REMINDER#check-in#2026-11-13',
    });
    expect(reminderKey('pat-1', 'missed-session', '2026-11-13')).not.toEqual(
      reminderKey('pat-1', 'check-in', '2026-11-13'),
    );
  });

  it('keeps each report link in its own partition by token', () => {
    expect(reportLinkKey('abc_-9')).toEqual({ pk: 'REPORTLINK#abc_-9', sk: 'META' });
    expect(reportLinkKey('abc').pk).not.toBe(reportKey('abc').pk);
  });
});
