import { describe, expect, it } from 'vitest';
import { buildSeed } from '../mock/seed/build.ts';
import { admin, attending, therapist } from '../mock/seed/institution.ts';
import { fixedNow } from '../mock/testing.ts';
import { loadSeed } from './load-seed.ts';
import { createMemoryStore } from './memory.ts';

const subs = new Map([
  [admin.id, 'sub-admin'],
  [attending.id, 'sub-attending'],
  [therapist.id, 'sub-therapist'],
]);

describe('loadSeed', () => {
  it('rewrites every staff reference to the Cognito sub and writes the seed through the store', async () => {
    const store = createMemoryStore();
    const seed = buildSeed(fixedNow);
    const loaded = await loadSeed(store, seed, subs);

    expect(JSON.stringify(loaded)).not.toMatch(/staff-(adm|att|ther)-1/);
    expect(await store.getStaff('sub-attending')).toMatchObject({ name: attending.name, role: 'attending' });
    expect(await store.getStaff(attending.id)).toBeUndefined();

    const patients = await store.listPatients('inst-1');
    expect(patients.map((patient) => patient.id)).toEqual(['pat-1', 'pat-2', 'pat-3']);
    for (const patient of patients) expect(patient.attendingId).toBe('sub-attending');
    expect(patients.find((patient) => patient.id === 'pat-2')?.therapistIds).toEqual(['sub-therapist']);

    const acl = await store.getPatientDetail('pat-3');
    expect(acl?.plan?.createdBy).toBe('sub-therapist');
    expect(acl?.record?.updatedBy).toBe('sub-therapist');
    expect(acl?.record?.injury?.phaseHistory[0]?.decidedBy).toBe('sub-therapist');

    const sessions = seed.sessions.filter((session) => session.patientId === 'pat-1');
    expect((await store.getSession(sessions[0]?.id ?? ''))?.startedBy).toBe('sub-attending');
  });

  it('turns metric values into points and latest values', async () => {
    const store = createMemoryStore();
    const seed = buildSeed(fixedNow);
    await loadSeed(store, seed, subs);

    const right = seed.metricValues
      .filter((value) => value.patientId === 'pat-1' && value.metricId === 'finger-tapping.taps-per-second')
      .filter((value) => value.side === 'right')
      .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
    const all = { from: '2000-01-01T00:00:00.000Z', to: fixedNow.toISOString() };
    const points = await store.listPoints('pat-1', 'finger-tapping.taps-per-second', 'right', all);
    expect(points).toEqual(right.map(({ t, value }) => ({ t, value })));

    const latest = await store.listLatest('pat-1');
    expect(latest).toContainEqual({
      metricId: 'finger-tapping.taps-per-second',
      side: 'right',
      t: right.at(-1)?.t,
      value: right.at(-1)?.value,
    });
  });

  it('can run twice without duplicating anything', async () => {
    const store = createMemoryStore();
    await loadSeed(store, buildSeed(fixedNow), subs);
    await loadSeed(store, buildSeed(fixedNow), subs);
    expect(await store.listPatients('inst-1')).toHaveLength(3);
    const all = { from: '2000-01-01T00:00:00.000Z', to: fixedNow.toISOString() };
    const once = buildSeed(fixedNow).metricValues.filter(
      (value) => value.patientId === 'pat-3' && value.metricId === 'pain.intensity',
    );
    expect(await store.listPoints('pat-3', 'pain.intensity', undefined, all)).toHaveLength(once.length);
  });
});
