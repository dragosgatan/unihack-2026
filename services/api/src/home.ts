import { exerciseRepetitions } from '@tempo/shared/scoring';
import type { ActivityId, ActivityResult, HomeData } from '@tempo/shared';
import { planForDevice } from './device-plan.ts';
import type { PatientDetail, Store } from './store/types.ts';

const homeDays = 30;

const checkInActivities: ReadonlySet<ActivityId> = new Set(['check-in-pain', 'check-in-medication', 'check-in-episodes']);

const activityOf = (result: ActivityResult): ActivityId =>
  result.status === 'completed' ? result.raw.activityId : result.activityId;

const newestFirst = <Item extends { t: string }>(a: Item, b: Item): number => (a.t < b.t ? 1 : a.t > b.t ? -1 : 0);

export const buildHomeData = async (store: Store, { patient, record, plan }: PatientDetail, now: Date): Promise<HomeData> => {
  const to = now.toISOString();
  const from = new Date(now.getTime() - homeDays * 86_400_000).toISOString();
  const within = (t: string): boolean => t >= from && t <= to;

  const [entries, sessions] = await Promise.all([
    store.listCheckIns(patient.id, { from, to }),
    store.listPatientSessions(patient.id),
  ]);
  const own = entries.filter((entry) => entry.recordedBy.kind === 'patient');

  const submitted = sessions
    .flatMap((session) => (session.submittedAt === undefined ? [] : [{ id: session.id, t: session.submittedAt }]))
    .filter(({ t }) => t <= to)
    .sort(newestFirst);

  let lastSessionAt: string | undefined;
  const exercises: HomeData['exercises'] = [];
  for (const session of submitted) {
    if (lastSessionAt !== undefined && session.t < from) break;
    const results = await store.listResults(session.id);
    if (lastSessionAt === undefined && results.some((result) => !checkInActivities.has(activityOf(result)))) {
      lastSessionAt = session.t;
    }
    for (const result of results) {
      if (result.status !== 'completed' || !within(result.completedAt)) continue;
      const repetitions = exerciseRepetitions(result.raw);
      if (repetitions !== undefined) exercises.push({ t: result.completedAt, activityId: result.raw.activityId, repetitions });
    }
  }

  return {
    ...(plan ? { plan: planForDevice(plan, record, now) } : {}),
    ...(lastSessionAt === undefined ? {} : { lastSessionAt }),
    checkIns: own.map((entry) => entry.recordedAt).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)),
    pain: own
      .flatMap((entry) => (entry.body.item === 'pain' ? [{ t: entry.recordedAt, intensity: entry.body.intensity }] : []))
      .sort(newestFirst),
    exercises: exercises.sort(newestFirst),
  };
};
