import type { ComponentType } from 'react';
import type { ActivityId, ActivityModuleProps, SessionPlanItem } from '@tempo/shared';
import type { ActivityProgress } from '../session/runner.ts';
import { EpisodesCheckIn } from './check-in-episodes/EpisodesCheckIn.tsx';
import { MedicationCheckIn } from './check-in-medication/MedicationCheckIn.tsx';
import { PainCheckIn } from './check-in-pain/PainCheckIn.tsx';
import { ShoulderRaise, SingleLegSquat, SitToStand } from './exercise/exercises.tsx';
import { FingerTapping } from './finger-tapping/FingerTapping.tsx';
import { TrailMakingA, TrailMakingB } from './trail-making/TrailMaking.tsx';

export type RunnerActivityProps<Config, RawResult> = ActivityModuleProps<Config, RawResult> & {
  onProgress: (progress: ActivityProgress) => void;
};

export const activityModules: Partial<
  Record<ActivityId, ComponentType<RunnerActivityProps<SessionPlanItem['config'], unknown>>>
> = {
  'finger-tapping': FingerTapping,
  'trail-making-a': TrailMakingA,
  'trail-making-b': TrailMakingB,
  'shoulder-raise': ShoulderRaise,
  'sit-to-stand': SitToStand,
  'single-leg-squat': SingleLegSquat,
  'check-in-pain': PainCheckIn,
  'check-in-medication': MedicationCheckIn,
  'check-in-episodes': EpisodesCheckIn,
};
