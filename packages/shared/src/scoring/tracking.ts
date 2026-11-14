import type { Side } from '../common.ts';
import type { ExerciseRep, ShoulderRaiseRep, SingleLegSquatRep } from '../exercise.ts';
import { kneeFlexion, kneeValgus, shoulderElevation, squatDepth, standingHeight, type Pose } from './pose.ts';
import { peak, type Rep, type RepSample, type RepThresholds } from './reps.ts';

export type ExerciseTracking<S extends RepSample, R> = {
  thresholds: RepThresholds;
  sample: (pose: Pose, side: Side, t: number) => S | undefined;
  rep: (rep: Rep<S>) => R;
};

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

export const shoulderRaiseTracking: ExerciseTracking<RepSample, ShoulderRaiseRep> = {
  thresholds: { enter: 40, exit: 25 },
  sample: (pose, side, t) => {
    const value = shoulderElevation(pose, side);
    return value === undefined ? undefined : { t, value };
  },
  rep: ({ startMs, endMs, samples }) => ({ startMs, endMs, angles: samples.map((sample) => oneDecimal(sample.value)) }),
};

export const sitToStandTracking: ExerciseTracking<RepSample, ExerciseRep> = {
  thresholds: { enter: 0.6, exit: 0.35 },
  sample: (pose, _side, t) => {
    const value = standingHeight(pose);
    return value === undefined ? undefined : { t, value };
  },
  rep: ({ startMs, endMs }) => ({ startMs, endMs }),
};

export type SquatSample = RepSample & { depth: number; valgus: number };

export const singleLegSquatTracking: ExerciseTracking<SquatSample, SingleLegSquatRep> = {
  thresholds: { enter: 25, exit: 12 },
  sample: (pose, side, t) => {
    const value = kneeFlexion(pose, side);
    const depth = squatDepth(pose, side);
    const valgus = kneeValgus(pose, side);
    return value === undefined || depth === undefined || valgus === undefined ? undefined : { t, value, depth, valgus };
  },
  rep: ({ startMs, endMs, samples }) => ({
    startMs,
    endMs,
    kneeFlexion: oneDecimal(peak(samples)),
    depth: oneDecimal(Math.max(...samples.map((sample) => sample.depth))),
    valgus: oneDecimal(Math.max(...samples.map((sample) => sample.valgus))),
  }),
};
