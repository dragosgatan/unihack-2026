import { metricDefinitions, type ActivityId, type MetricId } from '@tempo/shared';

export interface AboutTest {
  summary: string;
  measures: string;
}

export const aboutTests: Record<ActivityId, AboutTest> = {
  'finger-tapping': {
    summary: 'The patient taps two targets on the screen in turn, as fast as they can, for 15 seconds with each hand.',
    measures: 'Taps per second, how even the rhythm is, and how much tapping slows from the start to the end of the trial.',
  },
  'trail-making-a': {
    summary: 'The patient connects numbered circles in order (1, 2, 3 and on) by touch.',
    measures: 'Time to finish and the number of wrong connections.',
  },
  'trail-making-b': {
    summary: 'The patient connects circles by touch, alternating between numbers and letters (1, A, 2, B and on).',
    measures: 'Time to finish and the number of wrong connections.',
  },
  'clock-drawing': {
    summary: 'The patient draws a clock face with numbers and hands on the screen with a finger or stylus.',
    measures: 'Points against a fixed rubric for the contour, the numbers and the hands. The score is AI-assisted and a clinician can override it.',
  },
  'word-recall': {
    summary: 'The device says five words and the patient says them back, then again after about five minutes.',
    measures: 'Words recalled straight away and after the delay. Speech is transcribed by AI and the words are matched in code.',
  },
  'spiral-tracing': {
    summary: 'The patient traces an Archimedes spiral on the screen with each hand.',
    measures: 'Distance from the printed path, an estimate of tremor frequency, and tracing speed.',
  },
  'shoulder-raise': {
    summary: 'The patient raises each arm to the front or side while the camera tracks the movement on the device.',
    measures: 'Peak shoulder angle, repetitions and smoothness. Only joint angles are stored, never video.',
  },
  'sit-to-stand': {
    summary: 'The patient stands up from a chair and sits down again as many times as they can in 30 seconds while the camera tracks them on the device.',
    measures: 'The number of stands and the time each one takes. Only joint angles are stored, never video.',
  },
  'single-leg-squat': {
    summary: 'The patient squats on one leg at a time while the camera tracks them on the device.',
    measures: 'Squat depth, knee angle, how far the knee drifts inward, and left against right. Only joint angles are stored, never video.',
  },
  'check-in-pain': {
    summary: 'At the start of each session the patient rates their pain on a 0 to 10 face scale and marks where it is on a body map.',
    measures: 'Reported pain intensity from 0 to 10.',
  },
  'check-in-medication': {
    summary: 'At the start of each session the patient says, for each prescribed drug, whether they took it as planned, missed doses or stopped.',
    measures: 'The share of prescribed doses reported as taken.',
  },
  'check-in-episodes': {
    summary: 'At the start of each session the patient reports episodes since the last one, such as falls, dizziness or freezing.',
    measures: 'The number of episodes reported.',
  },
};

const betterDirection: Partial<Record<MetricId, string>> = {
  'finger-tapping.taps-per-second': 'faster tapping',
  'finger-tapping.variability': 'a more even rhythm',
  'finger-tapping.decrement': 'less slowing over the trial',
  'trail-making-a.time': 'faster completion',
  'trail-making-a.errors': 'fewer wrong connections',
  'trail-making-b.time': 'faster completion',
  'trail-making-b.errors': 'fewer wrong connections',
  'clock-drawing.score': 'more rubric items present in the drawing',
  'word-recall.immediate': 'more words recalled',
  'word-recall.delayed': 'more words recalled',
  'spiral-tracing.deviation': 'a trace closer to the printed spiral',
  'spiral-tracing.speed': 'faster tracing',
  'shoulder-raise.peak-angle': 'the arm raised higher',
  'shoulder-raise.repetitions': 'more repetitions completed',
  'shoulder-raise.smoothness': 'smoother movement',
  'sit-to-stand.count': 'more stands in 30 seconds',
  'sit-to-stand.time-per-repetition': 'quicker stands',
  'single-leg-squat.depth': 'a deeper squat',
  'single-leg-squat.knee-angle': 'more knee bend at the bottom of the squat',
  'single-leg-squat.knee-valgus': 'less inward drift of the knee',
  'single-leg-squat.symmetry': 'the two sides performing more alike',
  'pain.intensity': 'less reported pain',
  'medication.adherence': 'more doses taken as planned',
  'episodes.count': 'fewer reported episodes',
};

export function directionSentence(metricId: MetricId): string | null {
  const meaning = betterDirection[metricId];
  if (meaning === undefined) return null;
  return `${metricDefinitions[metricId].higherIsBetter ? 'Higher' : 'Lower'} values mean ${meaning}.`;
}
