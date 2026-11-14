import { z } from 'zod';
import {
  devicePairingCodeResponseSchema,
  homeDataSchema,
  localDate,
  sessionDue,
  type ActivityId,
  type HomeData,
  type IsoDate,
  type SessionPlan,
  type SessionPlanItem,
  type SubmittedResult,
} from '@tempo/shared';

export const homeDeviceSchema = devicePairingCodeResponseSchema.extend({ pinHash: z.string().optional() });

export type HomeDevice = z.infer<typeof homeDeviceSchema>;

export const homePath = '/patient/home';
const deviceKey = 'tempo-home-device';
const dataKey = 'tempo-home-data';
const dayMs = 86_400_000;
const keptDays = 30;

const read = <T>(key: string, schema: z.ZodType<T>): T | undefined => {
  try {
    const parsed = schema.safeParse(JSON.parse(localStorage.getItem(key) ?? 'null'));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const loadDevice = () => read(deviceKey, homeDeviceSchema);
export const saveDevice = (device: HomeDevice) => localStorage.setItem(deviceKey, JSON.stringify(device));
export const loadHomeData = (): HomeData => read(dataKey, homeDataSchema) ?? { checkIns: [], pain: [], exercises: [] };
export const saveHomeData = (data: HomeData) => localStorage.setItem(dataKey, JSON.stringify(data));

export const forgetDevice = () => {
  localStorage.removeItem(deviceKey);
  localStorage.removeItem(dataKey);
};

export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone === true);

// Safari keeps a home screen app's storage apart from the browser's, so a phone paired in Safari opens unpaired from the icon.
export const storageSplitOnInstall = () => 'standalone' in navigator && !isInstalled();

export const pinHash = async (deviceId: string, pin: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${deviceId}:${pin}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const activityOf = (result: SubmittedResult): ActivityId => (result.status === 'completed' ? result.raw.activityId : result.activityId);
const isCheckIn = (activityId: ActivityId) => activityId.startsWith('check-in-');

const repetitions = (result: SubmittedResult): number | undefined => {
  if (result.status !== 'completed') return undefined;
  const { raw } = result;
  switch (raw.activityId) {
    case 'shoulder-raise':
      return raw.data.trials.reduce((sum, trial) => sum + trial.reps.length, 0);
    case 'single-leg-squat':
      return raw.data.trials.reduce((sum, trial) => sum + trial.reps.length, 0);
    case 'sit-to-stand':
      return raw.data.reps.length;
    default:
      return undefined;
  }
};

export const recordFinished = (data: HomeData, results: SubmittedResult[], at: Date): HomeData => {
  const t = at.toISOString();
  const since = at.getTime() - keptDays * dayMs;
  const recent = <E extends { t: string }>(entries: E[]) => entries.filter((entry) => Date.parse(entry.t) >= since);
  const checkedIn = results.some((result) => result.status === 'completed' && isCheckIn(activityOf(result)));
  const later = data.lastSessionAt === undefined || at.getTime() > Date.parse(data.lastSessionAt);
  return {
    ...data,
    lastSessionAt: later && results.some((result) => !isCheckIn(activityOf(result))) ? t : data.lastSessionAt,
    checkIns: [...(checkedIn ? [t] : []), ...data.checkIns.filter((checkIn) => Date.parse(checkIn) >= since)],
    pain: [
      ...results.flatMap((result) =>
        result.status === 'completed' && result.raw.activityId === 'check-in-pain' ? [{ t, intensity: result.raw.data.intensity }] : [],
      ),
      ...recent(data.pain),
    ],
    exercises: [
      ...results.flatMap((result) => {
        const count = repetitions(result);
        return count === undefined ? [] : [{ t, activityId: activityOf(result), repetitions: count }];
      }),
      ...recent(data.exercises),
    ],
  };
};

export const dueToday = (plan: SessionPlan, data: HomeData, now: Date, timeZone: string): SessionPlanItem[] => {
  const today = localDate(now, timeZone);
  const checkedIn = data.checkIns.some((t) => localDate(t, timeZone) === today);
  const sessionDueToday =
    data.lastSessionAt === undefined || localDate(sessionDue(plan.schedule, data.lastSessionAt, now).dueAt, timeZone) <= today;
  return plan.items.filter((item) => (item.kind === 'check-in' ? !checkedIn : sessionDueToday));
};

const previousDay = (date: IsoDate): IsoDate => new Date(Date.parse(date) - dayMs).toISOString().slice(0, 10);

export const checkInStreak = (checkIns: string[], now: Date, timeZone: string): number => {
  const days = new Set(checkIns.map((t) => localDate(t, timeZone)));
  let day = localDate(now, timeZone);
  if (!days.has(day)) day = previousDay(day);
  let streak = 0;
  for (; days.has(day); day = previousDay(day)) streak += 1;
  return streak;
};

export const weekRepetitions = (exercises: HomeData['exercises'], now: Date): [ActivityId, number][] => {
  const since = now.getTime() - 7 * dayMs;
  const totals = new Map<ActivityId, number>();
  for (const entry of exercises) {
    if (Date.parse(entry.t) >= since) totals.set(entry.activityId, (totals.get(entry.activityId) ?? 0) + entry.repetitions);
  }
  return [...totals];
};
