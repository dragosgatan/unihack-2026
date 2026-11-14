import type { MetricRange } from '@tempo/shared';
import { SegmentedControl, type SegmentedOption } from '../SegmentedControl.tsx';

export interface MetricRangeControlProps {
  value: MetricRange;
  onChange: (range: MetricRange) => void;
  className?: string;
}

const rangeOptions: readonly SegmentedOption<MetricRange>[] = [
  { value: 'W', label: 'W' },
  { value: 'M', label: 'M' },
  { value: '6M', label: '6M' },
  { value: 'Y', label: 'Y' },
];

export function MetricRangeControl({ value, onChange, className }: MetricRangeControlProps) {
  return <SegmentedControl aria-label="Range" options={rangeOptions} value={value} onChange={onChange} className={className} />;
}
