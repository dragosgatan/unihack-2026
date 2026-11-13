import type { ComponentType } from 'react';
import type { ActivityId, ActivityModuleProps, SessionPlanItem } from '@tempo/shared';
import type { ActivityProgress } from '../session/runner.ts';

export type RunnerActivityProps<Config, RawResult> = ActivityModuleProps<Config, RawResult> & {
  onProgress: (progress: ActivityProgress) => void;
};

export const activityModules: Partial<
  Record<ActivityId, ComponentType<RunnerActivityProps<SessionPlanItem['config'], unknown>>>
> = {};
