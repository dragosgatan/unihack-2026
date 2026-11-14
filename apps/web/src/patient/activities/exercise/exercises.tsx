import type {
  ExerciseRep,
  SessionPlanItem,
  ShoulderRaiseRawResult,
  ShoulderRaiseRep,
  SingleLegSquatRawResult,
  SingleLegSquatRep,
  SitToStandRawResult,
} from '@tempo/shared';
import {
  shoulderRaiseTracking,
  singleLegSquatTracking,
  sitToStandTracking,
  type RepSample,
  type SquatSample,
} from '@tempo/shared/scoring';
import type { RunnerActivityProps } from '../index.ts';
import { Exercise, type ExerciseDefinition } from './Exercise.tsx';

type Props<Raw> = RunnerActivityProps<SessionPlanItem['config'], Raw>;

const sitToStandMs = 30_000;
const angleSlackDegrees = 10;

const shoulderRaise: ExerciseDefinition<RepSample, ShoulderRaiseRep, ShoulderRaiseRawResult> = {
  title: 'Shoulder raise',
  demo: 'shoulder-raise',
  instructions:
    'Prop the device up and stand back so your whole body is in view. Lift your arm out to the side as high as is comfortable, then lower it slowly. Copy the figure.',
  practice: (side) => `Practice. Lift your ${side} arm once, then lower it.`,
  task: (side, target) => `Lift your ${side} arm, ${target} times.`,
  tracking: shoulderRaiseTracking,
  sides: (config) => (config.side ? [config.side] : ['right', 'left']),
  cue: (peak, config) =>
    config.targetAngle !== undefined && peak < config.targetAngle - angleSlackDegrees ? 'A little higher.' : undefined,
  result: (trials) => ({ trials }),
};

const sitToStand: ExerciseDefinition<RepSample, ExerciseRep, SitToStandRawResult> = {
  title: 'Sit to stand',
  demo: 'sit-to-stand',
  instructions:
    'Prop the device up so it can see you sitting and standing. Sit on a firm chair with your arms crossed. Stand up fully, then sit down again, as many times as you can until you hear stop.',
  practice: () => 'Practice. Stand up once, then sit down.',
  task: () => 'Stand up and sit down as many times as you can, until you hear stop.',
  tracking: sitToStandTracking,
  sides: () => ['right'],
  durationMs: sitToStandMs,
  result: (trials) => ({ durationMs: sitToStandMs, reps: trials[0]?.reps ?? [] }),
};

const singleLegSquat: ExerciseDefinition<SquatSample, SingleLegSquatRep, SingleLegSquatRawResult> = {
  title: 'Single-leg squat',
  demo: 'single-leg-squat',
  instructions:
    'Prop the device up and stand back so your whole body is in view. Hold on to a chair or table for balance. Stand on one leg, bend that knee as far as is comfortable, then straighten up. Copy the figure.',
  practice: (side) => `Practice. Stand on your ${side} leg and bend the knee once.`,
  task: (side, target) => `Stand on your ${side} leg and bend the knee, ${target} times.`,
  tracking: singleLegSquatTracking,
  sides: () => ['right', 'left'],
  result: (trials) => ({ trials }),
};

export const ShoulderRaise = (props: Props<ShoulderRaiseRawResult>) => <Exercise {...props} definition={shoulderRaise} />;
export const SitToStand = (props: Props<SitToStandRawResult>) => <Exercise {...props} definition={sitToStand} />;
export const SingleLegSquat = (props: Props<SingleLegSquatRawResult>) => <Exercise {...props} definition={singleLegSquat} />;
