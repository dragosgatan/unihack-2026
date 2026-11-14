export type RepSample = { t: number; value: number };
export type Rep<S extends RepSample> = { startMs: number; endMs: number; samples: S[] };
export type RepThresholds = { enter: number; exit: number };

export type RepTracker<S extends RepSample> = {
  armed: boolean;
  reps: Rep<S>[];
  active?: { startMs: number; samples: S[] };
};

export const startReps = <S extends RepSample>(): RepTracker<S> => ({ armed: false, reps: [] });

export const trackReps = <S extends RepSample>(
  state: RepTracker<S>,
  sample: S,
  { enter, exit }: RepThresholds,
): RepTracker<S> => {
  const { active } = state;
  if (active) {
    if (sample.value < exit) {
      return { armed: true, reps: [...state.reps, { startMs: active.startMs, endMs: sample.t, samples: active.samples }] };
    }
    return { ...state, active: { ...active, samples: [...active.samples, sample] } };
  }
  if (sample.value < exit) return state.armed ? state : { ...state, armed: true };
  if (state.armed && sample.value >= enter) return { ...state, active: { startMs: sample.t, samples: [sample] } };
  return state;
};

export const finishReps = <S extends RepSample>(state: RepTracker<S>, endMs: number): Rep<S>[] =>
  state.active ? [...state.reps, { startMs: state.active.startMs, endMs, samples: state.active.samples }] : state.reps;

export const peak = (samples: readonly RepSample[]): number => Math.max(...samples.map((sample) => sample.value));

export const smoothness = (values: readonly number[]): number => {
  const first = values[0];
  const last = values.at(-1);
  if (first === undefined || last === undefined) return 1;
  const travelled = values.slice(1).reduce((sum, value, index) => sum + Math.abs(value - (values[index] ?? value)), 0);
  if (travelled === 0) return 1;
  return (2 * Math.max(...values) - first - last) / travelled;
};
