import type {
  ExerciseRep,
  Side,
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
const limb = { right: 'drept', left: 'stâng' } satisfies Record<Side, string>;

const shoulderRaise: ExerciseDefinition<RepSample, ShoulderRaiseRep, ShoulderRaiseRawResult> = {
  demo: 'shoulder-raise',
  copy: {
    en: {
      title: 'Shoulder raise',
      instructions:
        'Prop the device up and stand back so your whole body is in view. Lift your arm out to the side as high as is comfortable, then lower it slowly. Copy the figure.',
      practice: (side) => `Practice. Lift your ${side} arm once, then lower it.`,
      task: (side, target) => `Lift your ${side} arm, ${target} times.`,
    },
    ro: {
      title: 'Ridicarea brațului',
      instructions:
        'Sprijiniți aparatul și depărtați-vă, ca să se vadă tot corpul. Ridicați brațul lateral cât de sus vă este confortabil, apoi coborâți-l încet. Faceți ca figura.',
      practice: (side) => `Exercițiu. Ridicați o dată brațul ${limb[side]}, apoi coborâți-l.`,
      task: (side, target) => `Ridicați brațul ${limb[side]} de ${target} ori.`,
    },
  },
  tracking: shoulderRaiseTracking,
  sides: (config) => (config.side ? [config.side] : ['right', 'left']),
  tooLow: (peak, config) => config.targetAngle !== undefined && peak < config.targetAngle - angleSlackDegrees,
  result: (trials) => ({ trials }),
};

const sitToStand: ExerciseDefinition<RepSample, ExerciseRep, SitToStandRawResult> = {
  demo: 'sit-to-stand',
  copy: {
    en: {
      title: 'Sit to stand',
      instructions:
        'Prop the device up so it can see you sitting and standing. Sit on a firm chair with your arms crossed. Stand up fully, then sit down again, as many times as you can until you hear stop.',
      practice: () => 'Practice. Stand up once, then sit down.',
      task: () => 'Stand up and sit down as many times as you can, until you hear stop.',
    },
    ro: {
      title: 'Ridicarea de pe scaun',
      instructions:
        'Sprijiniți aparatul așa încât să vă vadă și așezat, și în picioare. Stați pe un scaun stabil, cu brațele încrucișate. Ridicați-vă complet, apoi așezați-vă din nou, de câte ori puteți, până auziți stop.',
      practice: () => 'Exercițiu. Ridicați-vă o dată, apoi așezați-vă.',
      task: () => 'Ridicați-vă și așezați-vă de câte ori puteți, până auziți stop.',
    },
  },
  tracking: sitToStandTracking,
  sides: () => ['right'],
  durationMs: sitToStandMs,
  result: (trials) => ({ durationMs: sitToStandMs, reps: trials[0]?.reps ?? [] }),
};

const singleLegSquat: ExerciseDefinition<SquatSample, SingleLegSquatRep, SingleLegSquatRawResult> = {
  demo: 'single-leg-squat',
  copy: {
    en: {
      title: 'Single-leg squat',
      instructions:
        'Prop the device up and stand back so your whole body is in view. Hold on to a chair or table for balance. Stand on one leg, bend that knee as far as is comfortable, then straighten up. Copy the figure.',
      practice: (side) => `Practice. Stand on your ${side} leg and bend the knee once.`,
      task: (side, target) => `Stand on your ${side} leg and bend the knee, ${target} times.`,
    },
    ro: {
      title: 'Genuflexiune pe un picior',
      instructions:
        'Sprijiniți aparatul și depărtați-vă, ca să se vadă tot corpul. Țineți-vă de un scaun sau de o masă pentru echilibru. Stați pe un picior, îndoiți genunchiul cât vă este confortabil, apoi îndreptați-vă. Faceți ca figura.',
      practice: (side) => `Exercițiu. Stați pe piciorul ${limb[side]} și îndoiți o dată genunchiul.`,
      task: (side, target) => `Stați pe piciorul ${limb[side]} și îndoiți genunchiul de ${target} ori.`,
    },
  },
  tracking: singleLegSquatTracking,
  sides: () => ['right', 'left'],
  result: (trials) => ({ trials }),
};

export const ShoulderRaise = (props: Props<ShoulderRaiseRawResult>) => <Exercise {...props} definition={shoulderRaise} />;
export const SitToStand = (props: Props<SitToStandRawResult>) => <Exercise {...props} definition={sitToStand} />;
export const SingleLegSquat = (props: Props<SingleLegSquatRawResult>) => <Exercise {...props} definition={singleLegSquat} />;
