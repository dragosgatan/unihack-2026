import type { RawResult } from '../activity.ts';
import type { Score } from '../session.ts';
import { scoreShoulderRaise, scoreSingleLegSquat, scoreSitToStand } from './exercises.ts';
import { scoreFingerTapping } from './finger-tapping.ts';
import { scoreTrailMaking } from './trail-making.ts';

export { scoreFingerTapping, tapsPerSecond, intervalVariability, decrement } from './finger-tapping.ts';
export { scoreTrailMaking, trailProgress } from './trail-making.ts';
export { clockDrawingFeatures, clockDrawingSvg, clockStrokesPath, type ClockDrawingFeatures } from './clock-drawing.ts';
export * from './angle.ts';
export * from './exercises.ts';
export * from './pose.ts';
export * from './reps.ts';
export * from './tracking.ts';

export const scoreResult = (raw: RawResult): Score[] => {
  switch (raw.activityId) {
    case 'finger-tapping':
      return scoreFingerTapping(raw.data);
    case 'trail-making-a':
      return scoreTrailMaking('a', raw.data);
    case 'trail-making-b':
      return scoreTrailMaking('b', raw.data);
    case 'shoulder-raise':
      return scoreShoulderRaise(raw.data);
    case 'sit-to-stand':
      return scoreSitToStand(raw.data);
    case 'single-leg-squat':
      return scoreSingleLegSquat(raw.data);
    default:
      return [];
  }
};
