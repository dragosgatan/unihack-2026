import { describe, expect, it } from 'vitest';
import {
  baselineKey,
  codeKey,
  currentPlanKey,
  deviceKey,
  institutionKey,
  latestKey,
  patientIndexKey,
  patientKey,
  planVersionKey,
  pointKey,
  pointPrefix,
  recordKey,
  resultKey,
  sessionIndexKey,
  sessionKey,
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
});
