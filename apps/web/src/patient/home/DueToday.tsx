import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { ActivityId, HomeData, Language, SessionPlanItem } from '@tempo/shared';
import { GroupedList, GroupedListRow } from '../../ui/index.ts';
import { useSpoken, voices } from '../feedback.ts';
import { LanguageSwitch } from '../LanguageSwitch.tsx';
import { startRunner } from '../session/runner.ts';
import { loadRunner, saveRunner, syncEpisodes, syncOutbox } from '../session/store.ts';
import { TapButton } from '../TapButton.tsx';
import { fetchHomeData, startHomeSession, Unpaired } from './api.ts';
import { checkInStreak, dueToday, loadHomeData, saveHomeData, weekRepetitions, type HomeDevice } from './data.ts';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
// Romanian puts "de" before the noun from 20 on, unless the last two digits are 01 to 19 (101 exerciții, 120 de exerciții).
const pluralRo = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count} ${count >= 20 && (count % 100 === 0 || count % 100 >= 20) ? 'de ' : ''}${many}`;

const en = {
  exercises: { 'shoulder-raise': 'Shoulder raise', 'sit-to-stand': 'Sit to stand', 'single-leg-squat': 'Single-leg squat' } as Partial<
    Record<ActivityId, string>
  >,
  checkIn: 'Check-in',
  exerciseCount: (count: number) => plural(count, 'exercise', 'exercises'),
  testCount: (count: number) => plural(count, 'short test', 'short tests'),
  unknown: 'Your check-in, exercises and tests',
  failed: 'That did not start. Check the internet and try again.',
  ready: 'Tap Start when you are ready.',
  allDone: 'All done for today. Thank you.',
  hello: (name: string) => `Hello, ${name}`,
  episode: 'I fell or felt unwell',
  today: 'Today',
  start: 'Start',
  empty: 'Your check-ins and exercises will show here.',
  streak: (days: number) => `You checked in ${plural(days, 'day', 'days')} in a row.`,
  week: 'Exercises this week',
  times: (count: number) => plural(count, 'time', 'times'),
  pain: 'Your pain',
  outOf: (intensity: number) => `${intensity} out of 10`,
};
const copy: Record<Language, typeof en> = {
  en,
  ro: {
    exercises: {
      'shoulder-raise': 'Ridicarea brațului',
      'sit-to-stand': 'Ridicarea de pe scaun',
      'single-leg-squat': 'Genuflexiune pe un picior',
    },
    checkIn: 'Întrebările de azi',
    exerciseCount: (count) => pluralRo(count, 'exercițiu', 'exerciții'),
    testCount: (count) => pluralRo(count, 'test scurt', 'teste scurte'),
    unknown: 'Întrebările, exercițiile și testele dumneavoastră',
    failed: 'Nu a pornit. Verificați internetul și încercați din nou.',
    ready: 'Atingeți Începe când sunteți gata.',
    allDone: 'Gata pentru azi. Vă mulțumim.',
    hello: (name) => `Bună ziua, ${name}`,
    episode: 'Am căzut sau nu mă simt bine',
    today: 'Azi',
    start: 'Începe',
    empty: 'Aici vor apărea întrebările și exercițiile făcute.',
    streak: (days) => `Ați răspuns ${pluralRo(days, 'zi', 'zile')} la rând.`,
    week: 'Exerciții săptămâna aceasta',
    times: (count) => (count === 1 ? 'o dată' : pluralRo(count, '', 'ori')),
    pain: 'Durerea dumneavoastră',
    outOf: (intensity) => `${intensity} din 10`,
  },
};

const dueRows = (items: SessionPlanItem[], t: typeof en) => {
  const count = (kind: SessionPlanItem['kind']) => items.filter((item) => item.kind === kind).length;
  return [
    count('check-in') > 0 && t.checkIn,
    count('exercise') > 0 && t.exerciseCount(count('exercise')),
    count('test') > 0 && t.testCount(count('test')),
  ].filter((row) => row !== false);
};

const large = (text: string) => <span className="text-[20pt]">{text}</span>;
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
  await saveRunner(startRunner({ token, expiresAt, patientFirstName, session, plan: { ...plan, items, language: device.language } }));
}

function Progress({ data, language }: { data: HomeData; language: Language }) {
  const t = copy[language];
  const dayFormat = new Intl.DateTimeFormat(voices[language], { weekday: 'short', day: 'numeric', month: 'short' });
  const now = new Date();
  const streak = checkInStreak(data.checkIns, now, timeZone());
  const week = weekRepetitions(data.exercises, now);
  const pain = data.pain.slice(0, 7);

  if (streak === 0 && week.length === 0 && pain.length === 0) {
    return <p className="text-label-secondary">{t.empty}</p>;
  }

  return (
    <>
      {streak > 0 && <p>{t.streak(streak)}</p>}
      {week.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">{t.week}</h2>
          <GroupedList>
            {week.map(([activityId, repetitions]) => (
              <GroupedListRow
                key={activityId}
                title={large(t.exercises[activityId] ?? activityId)}
                value={large(t.times(repetitions))}
                className="min-h-[60pt]"
              />
            ))}
          </GroupedList>
        </section>
      )}
      {pain.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">{t.pain}</h2>
          <GroupedList>
            {pain.map((entry) => (
              <GroupedListRow
                key={entry.t}
                title={large(dayFormat.format(new Date(entry.t)))}
                value={large(t.outOf(entry.intensity))}
                className="min-h-[60pt]"
              />
            ))}
          </GroupedList>
        </section>
      )}
    </>
  );
}

type DueTodayProps = { device: HomeDevice; onChange: (device: HomeDevice) => void; onUnpaired: () => void };

export function DueToday({ device, onChange, onUnpaired }: DueTodayProps) {
  const navigate = useNavigate();
  const language = device.language;
  const t = copy[language];
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
  const rows = due ? dueRows(due, t) : [t.unknown];
  const message = start.isError ? t.failed : rows.length ? t.ready : t.allDone;
  useSpoken(home.isPending ? '' : `${t.hello(device.patientFirstName)}. ${rows.join('. ')}. ${message}`, language);

  return (
    <main lang={language} className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 p-6 text-[20pt]">
      <div className="flex min-h-[60pt] flex-wrap justify-between gap-3">
        <LanguageSwitch language={language} onChange={(next) => onChange({ ...device, language: next })} />
        <TapButton variant="secondary" onTap={() => navigate('episode')}>
          {t.episode}
        </TapButton>
      </div>
      <h1 className="text-[32pt] font-bold">{t.hello(device.patientFirstName)}</h1>
      {!home.isPending && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">{t.today}</h2>
            {rows.length > 0 && (
              <GroupedList>
                {rows.map((row) => (
                  <GroupedListRow key={row} title={large(row)} className="min-h-[60pt]" />
                ))}
              </GroupedList>
            )}
            <p role="status">{message}</p>
          </section>
          {rows.length > 0 && (
            <TapButton disabled={start.isPending} onTap={() => start.mutate()}>
              {t.start}
            </TapButton>
          )}
          <Progress data={home.data ?? loadHomeData()} language={language} />
        </>
      )}
    </main>
  );
}
