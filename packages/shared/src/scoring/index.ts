import type { RawResult } from '../activity.ts';
import type { Score } from '../session.ts';
import { scoreFingerTapping } from './finger-tapping.ts';

export { scoreFingerTapping, tapsPerSecond, intervalVariability, decrement } from './finger-tapping.ts';
export * from './angle.ts';

export const scoreResult = (raw: RawResult): Score[] => {
  switch (raw.activityId) {
    case 'finger-tapping':
      return scoreFingerTapping(raw.data);
    default:
      return [];
  }
};
