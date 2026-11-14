import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DrawingUtils, PoseLandmarker, type Landmark, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { exerciseConfigSchema, type ExerciseConfig, type Language, type SessionPlanItem, type Side } from '@tempo/shared';
import {
  finishReps,
  peak,
  startReps,
  trackReps,
  type ExerciseTracking,
  type RepSample,
  type RepTracker,
} from '@tempo/shared/scoring';
import { speak, useSpoken } from '../../feedback.ts';
import { startPoseTracking } from '../../pose/tracker.ts';
import { Screen } from '../../Screen.tsx';
import { TapButton } from '../../TapButton.tsx';
import type { RunnerActivityProps } from '../index.ts';
import { Demo, type DemoName } from './Demo.tsx';

export type Trial<R> = { side: Side; reps: R[] };

export type ExerciseDefinition<S extends RepSample, R, Raw> = {
  title: string;
  demo: DemoName;
  instructions: string;
  practice: (side: Side) => string;
  task: (side: Side, target: number) => string;
  tracking: ExerciseTracking<S, R>;
  sides: (config: ExerciseConfig) => Side[];
  durationMs?: number;
  cue?: (peak: number, config: ExerciseConfig) => string | undefined;
  result: (trials: Trial<R>[]) => Raw;
};

type Step =
  | { kind: 'loading' }
  | { kind: 'practice' }
  | { kind: 'trial'; index: number }
  | { kind: 'next'; index: number }
  | { kind: 'done' };

const idleMs = 20_000;
const lostMs = 2_000;
const nextSideMs = 5_000;
const doneMs = 2_500;

const parseConfig = (config: SessionPlanItem['config']): ExerciseConfig => {
  const parsed = exerciseConfigSchema.safeParse(config);
  if (!parsed.success) console.warn('Exercise config is invalid, using 10 repetitions');
  return parsed.success ? parsed.data : { targetRepetitions: 10 };
};

function useTimers() {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const current = timers.current;
    return () => current.forEach(clearTimeout);
  }, []);
  return {
    set: (name: string, ms: number, run: () => void) => {
      clearTimeout(timers.current.get(name));
      timers.current.set(name, setTimeout(run, ms));
    },
    clear: (name: string) => clearTimeout(timers.current.get(name)),
  };
}

export function Exercise<S extends RepSample, R, Raw>({
  definition,
  config: rawConfig,
  language,
  onComplete,
  onProgress,
}: RunnerActivityProps<SessionPlanItem['config'], Raw> & { definition: ExerciseDefinition<S, R, Raw> }) {
  const { title, demo, instructions, tracking, durationMs, cue, result } = definition;
  const [config] = useState(() => parseConfig(rawConfig));
  const [sides] = useState(() => definition.sides(config));
  const [cameraOn, setCameraOn] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [count, setCount] = useState(0);
  const [cameraFailed, setCameraFailed] = useState(false);
  const timers = useTimers();

  const live = useRef({
    step: step as Step,
    reps: startReps<S>(),
    startedAt: 0,
    lastSeen: 0,
    warned: false,
    trials: [] as Trial<R>[],
  });
  const target = config.targetRepetitions;

  const go = (next: Step, now: number) => {
    live.current = { ...live.current, step: next, reps: startReps<S>(), startedAt: now, lastSeen: now, warned: false };
    setStep(next);
    setCount(0);
    if (next.kind === 'practice') onProgress({ stage: 'practice' });
    if (next.kind === 'trial') {
      reportTask([]);
      if (durationMs) timers.set('end', durationMs, () => endTrial(next.index, performance.now()));
    }
    if (next.kind === 'done') timers.set('done', doneMs, () => onComplete(result(live.current.trials)));
    if (next.kind === 'next') timers.set('next', nextSideMs, () => go({ kind: 'trial', index: next.index }, performance.now()));
    if (next.kind === 'practice' || next.kind === 'trial') timers.set('idle', idleMs, () => finishStep(performance.now()));
  };

  const reportTask = (reps: R[]) => {
    const current = live.current.step;
    const side = current.kind === 'trial' ? sides[current.index] : undefined;
    const trials = side ? [...live.current.trials, { side, reps }] : live.current.trials;
    onProgress({ stage: 'task', partialData: result(trials) });
  };

  const endTrial = (index: number, now: number) => {
    timers.clear('idle');
    timers.clear('end');
    const side = sides[index] ?? 'right';
    const reps = finishReps(live.current.reps, now - live.current.startedAt).map(tracking.rep);
    const trials = [...live.current.trials, { side, reps }];
    live.current = { ...live.current, trials };
    onProgress({ stage: 'task', partialData: result(trials) });
    if (index + 1 < sides.length) go({ kind: 'next', index: index + 1 }, now);
    else go({ kind: 'done' }, now);
  };

  const finishStep = (now: number) => {
    const current = live.current.step;
    if (current.kind === 'practice') go({ kind: 'trial', index: 0 }, now);
    if (current.kind === 'trial') endTrial(current.index, now);
  };

  const onPose = (world: Landmark[] | undefined, now: number) => {
    const state = live.current;
    const current = state.step;
    if (current.kind !== 'practice' && current.kind !== 'trial') return;
    const side = sides[current.kind === 'trial' ? current.index : 0] ?? 'right';
    const sample = world && tracking.sample(world, side, now - state.startedAt);
    if (!sample) {
      if (!state.warned && now - state.lastSeen > lostMs) {
        state.warned = true;
        speak('Step back so I can see all of you.', language);
      }
      return;
    }
    state.lastSeen = now;
    state.warned = false;
    const before = state.reps.reps.length;
    const reps: RepTracker<S> = trackReps(state.reps, sample, tracking.thresholds);
    state.reps = reps;
    const done = reps.reps.at(-1);
    if (reps.reps.length === before || !done) return;

    timers.set('idle', idleMs, () => finishStep(performance.now()));
    if (current.kind === 'practice') {
      go({ kind: 'trial', index: 0 }, now);
      return;
    }

    const repCount = reps.reps.length;
    setCount(repCount);
    reportTask(reps.reps.map(tracking.rep));
    if (!durationMs && repCount >= target) {
      endTrial(current.index, now);
      return;
    }
    const left = target - repCount;
    const correction = cue?.(peak(done.samples), config);
    speak([correction, !durationMs && left <= 3 ? `${left} more.` : `${repCount}.`].filter(Boolean).join(' '), language);
  };

  if (!cameraOn) {
    return (
      <Screen
        title={title}
        text={instructions}
        language={language}
        action={
          <div className="flex flex-col items-center gap-6">
            <Demo name={demo} side={sides[0]} className="h-48" />
            <TapButton className="w-full" onTap={() => setCameraOn(true)}>
              Start
            </TapButton>
          </div>
        }
      />
    );
  }

  const side = sides[step.kind === 'trial' || step.kind === 'next' ? step.index : 0] ?? 'right';
  const text = cameraFailed
    ? 'The camera did not start.'
    : step.kind === 'done'
      ? `${durationMs ? 'Stop. ' : ''}Well done.`
      : step.kind === 'loading'
      ? 'Getting ready. Stand back so your whole body is in view.'
      : step.kind === 'practice'
        ? definition.practice(side)
        : step.kind === 'next'
          ? `Well done. Rest. Next: ${definition.task(side, target)}`
          : `${step.index === 0 ? 'Well done. Now the real one. ' : ''}${definition.task(side, target)}`;

  return (
    <CameraView
      text={text}
      language={language}
      demo={<Demo name={demo} side={side} className="h-40 shrink-0" />}
      count={step.kind === 'trial' ? (durationMs ? `${count}` : `${count} of ${target}`) : undefined}
      onPose={onPose}
      onReady={() => go({ kind: 'practice' }, performance.now())}
      onError={(reason) => {
        console.error(reason);
        setCameraFailed(true);
      }}
    />
  );
}

type CameraViewProps = {
  text: string;
  language: Language;
  demo: ReactNode;
  count: string | undefined;
  onPose: (world: Landmark[] | undefined, now: number) => void;
  onReady: () => void;
  onError: (reason: unknown) => void;
};

function CameraView({ text, language, demo, count, ...handlers }: CameraViewProps) {
  useSpoken(text, language);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const context = canvas.getContext('2d');
    const controller = new AbortController();
    const drawing = context && new DrawingUtils(context);
    const fail = (reason: unknown) => {
      if (!controller.signal.aborted) latest.current.onError(reason);
    };

    const onFrame = (landmarks: NormalizedLandmark[] | undefined, world: Landmark[] | undefined) => {
      if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
      if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
      context?.clearRect(0, 0, canvas.width, canvas.height);
      if (landmarks) drawing?.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: '#22d3ee', lineWidth: 4 });
      latest.current.onPose(world, performance.now());
    };

    startPoseTracking({ video, signal: controller.signal, onFrame, onError: fail, onStatus: () => undefined }).then(
      () => latest.current.onReady(),
      fail,
    );
    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 p-6 text-[20pt]">
      <div className="min-h-[60pt]" />
      <p className="text-center">{text}</p>
      <div className="relative overflow-hidden rounded-2xl bg-black">
        {/* iOS Safari goes fullscreen or refuses to play camera video without playsInline and muted. */}
        <video ref={videoRef} className="block h-auto w-full -scale-x-100" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100" />
      </div>
      <div className="flex items-center justify-center gap-6">
        {demo}
        {count !== undefined && <p className="text-[48pt] font-bold tabular-nums">{count}</p>}
      </div>
    </main>
  );
}
