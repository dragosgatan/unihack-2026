import {
  bodyRegionLabel,
  type ActivityId,
  type MetricId,
  type SessionMode,
  type Side,
  type SkipFlag,
  type SkipReason,
  type SkipStage,
} from '@tempo/shared';

const activityLabels: Record<ActivityId, string> = {
  'finger-tapping': 'Finger tapping',
  'trail-making-a': 'Trail making A',
  'trail-making-b': 'Trail making B',
  'clock-drawing': 'Clock drawing',
  'word-recall': 'Word recall',
  'spiral-tracing': 'Spiral tracing',
  'shoulder-raise': 'Shoulder raise',
  'sit-to-stand': 'Sit to stand',
  'single-leg-squat': 'Single-leg squat',
  'check-in-pain': 'Check-in: pain',
  'check-in-medication': 'Check-in: medication',
  'check-in-episodes': 'Check-in: episodes',
};

const skipReasonLabels: Record<SkipReason, string> = {
  pain: 'It hurts',
  tired: 'Too tired',
  'not-understood': 'Did not understand what to do',
  'cannot-see-or-hear': 'Could not see or hear it well enough',
  'physically-unable': 'Could not physically do it',
  'device-problem': 'Something was wrong with the device',
  other: 'Something else',
};

const capitalise = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

export const activityLabel = (activityId: ActivityId): string => activityLabels[activityId];

export const metricLabel = (metricId: MetricId): string => capitalise((metricId.split('.')[1] ?? metricId).replaceAll('-', ' '));

export const sideLabel = (side: Side | undefined): string => (side ? capitalise(side) : '');

export const modeLabel = (mode: SessionMode): string => (mode === 'kiosk' ? 'Kiosk' : 'Home');

export const skipReasonLabel = (reason: SkipReason): string => skipReasonLabels[reason];

export const stageLabel = (stage: SkipStage): string => capitalise(stage);

export const locationLabel = (location: string): string => bodyRegionLabel(location, 'en');

export const flagLabel = (flag: SkipFlag): string =>
  flag.kind === 'pain-skip'
    ? [
        `Pain skip: ${activityLabel(flag.activityId)}, stopped at ${flag.stage}`,
        ...(flag.painLocation === undefined ? [] : [locationLabel(flag.painLocation)]),
      ].join(', ')
    : `Skipped in two sessions in a row: ${activityLabel(flag.activityId)} (${skipReasonLabel(flag.reason).toLowerCase()})`;

const formatNumber = (value: number): string => String(Number(value.toFixed(2)));

export const withUnit = (value: number, unit: string): string => {
  if (unit === 'count') return formatNumber(value);
  if (unit === '0-10') return `${formatNumber(value)}/10`;
  if (unit === '°' || unit === '%') return `${formatNumber(value)}${unit}`;
  return `${formatNumber(value)} ${unit}`;
};

export const signedWithUnit = (value: number, unit: string): string =>
  `${value > 0 ? '+' : ''}${withUnit(value, unit)}`;

export const dateTimeLabel = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
