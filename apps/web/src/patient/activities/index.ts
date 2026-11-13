import type { ComponentType } from 'react';
import type { ActivityId, ActivityModuleProps, SessionPlanItem } from '@tempo/shared';

export const activityModules: Partial<
  Record<ActivityId, ComponentType<ActivityModuleProps<SessionPlanItem['config'], unknown>>>
> = {};
