import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { ActivityId, SessionPlanItem } from '@tempo/shared';
import { GroupedList, GroupedListRow } from '../../ui/index.ts';
import { useSpoken } from '../feedback.ts';
import { startRunner } from '../session/runner.ts';
import { loadRunner, saveRunner, syncEpisodes, syncOutbox } from '../session/store.ts';
import { TapButton } from '../TapButton.tsx';
import { fetchHomeData, startHomeSession, Unpaired } from './api.ts';
import { checkInStreak, dueToday, loadHomeData, saveHomeData, weekRepetitions, type HomeData, type HomeDevice } from './data.ts';

const exerciseNames: Partial<Record<ActivityId, string>> = {
  'shoulder-raise': 'Shoulder raise',
  'sit-to-stand': 'Sit to stand',
  'single-leg-squat': 'Single-leg squat',
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const dueRows = (items: SessionPlanItem[]) => {
  const count = (kind: SessionPlanItem['kind']) => items.filter((item) => item.kind === kind).length;
  return [
    count('check-in') > 0 && 'Check-in',
    count('exercise') > 0 && plural(count('exercise'), 'exercise', 'exercises'),
    count('test') > 0 && plural(count('test'), 'short test', 'short tests'),
  ].filter((row) => row !== false);
};

const dayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const sync = () => {
  syncOutbox().catch(console.error);
  syncEpisodes().catch(console.error);
};

async function startDue(device: HomeDevice) {
  if (await loadRunner()) return;
  const { session, plan } = await startHomeSession(device.token);
  const data = loadHomeData();
  saveHomeData({ ...data, plan });
  const items = dueToday(plan, data, new Date(), timeZone());
  if (items.length === 0) return;
  const { token, expiresAt, patientFirstName } = device;
  await saveRunner(startRunner({ token, expiresAt, patientFirstName, session, plan: { ...plan, items } }));
}

function Progress({ data }: { data: HomeData }) {
  const now = new Date();
  const streak = checkInStreak(data.checkIns, now, timeZone());
  const week = weekRepetitions(data.exercises, now);
  const pain = data.pain.slice(0, 7);

  if (streak === 0 && week.length === 0 && pain.length === 0) {
    return <p className="text-label-secondary">Your check-ins and exercises will show here.</p>;
  }

  return (
    <>
      {streak > 0 && <p>You checked in {plural(streak, 'day', 'days')} in a row.</p>}
      {week.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Exercises this week</h2>
          <GroupedList>
            {week.map(([activityId, repetitions]) => (
              <GroupedListRow key={activityId} title={exerciseNames[activityId] ?? activityId} value={plural(repetitions, 'time', 'times')} className="min-h-[60pt]" />
            ))}
          </GroupedList>
        </section>
      )}
      {pain.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Your pain</h2>
          <GroupedList>
            {pain.map((entry) => (
              <GroupedListRow key={entry.t} title={dayFormat.format(new Date(entry.t))} value={`${entry.intensity} out of 10`} className="min-h-[60pt]" />
            ))}
          </GroupedList>
        </section>
      )}
    </>
  );
}

export function DueToday({ device, onUnpaired }: { device: HomeDevice; onUnpaired: () => void }) {
  const navigate = useNavigate();
  const home = useQuery({ queryKey: ['home', device.deviceId], queryFn: () => fetchHomeData(device.token) });
  const start = useMutation({ mutationFn: () => startDue(device), onSuccess: () => navigate('session') });
  const unpaired = home.error instanceof Unpaired || start.error instanceof Unpaired;

  useEffect(() => {
    if (unpaired) onUnpaired();
  }, [unpaired, onUnpaired]);

  useEffect(() => {
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, []);

  const due = home.data?.plan && dueToday(home.data.plan, home.data, new Date(), timeZone());
  const rows = due ? dueRows(due) : ['Your check-in, exercises and tests'];
  const message = start.isError ? 'That did not start. Check the internet and try again.' : rows.length ? 'Tap Start when you are ready.' : 'All done for today. Thank you.';
  useSpoken(home.isPending ? '' : `Hello, ${device.patientFirstName}. ${rows.join('. ')}. ${message}`, device.language);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 p-6 text-[20pt]">
      <div className="flex min-h-[60pt] justify-end">
        <TapButton variant="secondary" onTap={() => navigate('episode')}>
          I fell or felt unwell
        </TapButton>
      </div>
      <h1 className="text-[32pt] font-bold">Hello, {device.patientFirstName}</h1>
      {!home.isPending && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Today</h2>
            {rows.length > 0 && (
              <GroupedList>
                {rows.map((row) => (
                  <GroupedListRow key={row} title={row} className="min-h-[60pt]" />
                ))}
              </GroupedList>
            )}
            <p role="status">{message}</p>
          </section>
          {rows.length > 0 && (
            <TapButton disabled={start.isPending} onTap={() => start.mutate()}>
              Start
            </TapButton>
          )}
          <Progress data={home.data ?? loadHomeData()} />
        </>
      )}
    </main>
  );
}
