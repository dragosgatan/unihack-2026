import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MetricSeries } from '@tempo/shared';
import { MetricChart } from './MetricChart.tsx';

afterEach(cleanup);

const series: MetricSeries = {
  metricId: 'finger-tapping.taps-per-second',
  unit: 'taps/s',
  points: [
    { t: '2026-11-03T10:00:00.000Z', value: 3.7 },
    { t: '2026-11-05T10:00:00.000Z', value: 4.2 },
    { t: '2026-11-10T10:00:00.000Z', value: 4.6 },
    { t: '2026-11-12T10:00:00.000Z', value: 4.7 },
  ],
  baseline: 4.1,
  referenceBand: { low: 3.9, high: 4.7 },
  events: [
    { id: 'evt-skip', t: '2026-11-07T10:00:00.000Z', type: 'skip', label: 'Too tired', sessionId: 'sess-1', reason: 'tired', stage: 'practice' },
    { id: 'evt-med', t: '2026-11-11T08:00:00.000Z', type: 'medication-change', label: 'Levodopa dose increased' },
  ],
};

function header() {
  return screen.getByRole('heading', { name: 'Tapping speed' }).parentElement?.textContent ?? '';
}

describe('MetricChart', () => {
  it('shows the title and the average over the range', () => {
    render(<MetricChart series={series} range="M" title="Tapping speed" />);
    expect(header()).toContain('Average');
    expect(header()).toContain('4.3taps/s');
    expect(screen.getByRole('group', { name: 'Tapping speed, 4 sessions, average 4.3 taps/s' })).toBeTruthy();
  });

  it('uses a given domain instead of its own', () => {
    const october = { start: new Date(2026, 9, 1).getTime(), end: new Date(2026, 10, 1).getTime() };
    render(<MetricChart series={series} range="M" title="Tapping speed" domain={october} />);
    expect(screen.getByRole('group', { name: 'Tapping speed, no sessions in this range' })).toBeTruthy();
    expect(screen.getByText('No data in this range')).toBeTruthy();
  });

  it('labels the reference band as the own range', () => {
    render(<MetricChart series={series} range="M" title="Tapping speed" />);
    expect(screen.getByText('own range')).toBeTruthy();
    expect(screen.getByText('baseline')).toBeTruthy();
  });

  it('draws no band when there is none', () => {
    render(<MetricChart series={{ ...series, referenceBand: null }} range="M" title="Tapping speed" />);
    expect(screen.queryByText('own range')).toBeNull();
  });

  it('breaks the line at the skipped session', () => {
    const { container } = render(<MetricChart series={series} range="M" title="Tapping speed" />);
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });

  it('lists skips and events in the hidden table', () => {
    render(<MetricChart series={series} range="M" title="Tapping speed" />);
    const table = screen.getByRole('table', { name: 'Tapping speed' });
    expect(table.textContent).toContain('Skipped');
    expect(table.textContent).toContain('Too tired (tired, stopped at practice)');
    expect(table.textContent).toContain('Medication change: Levodopa dose increased');
  });

  it('shows an empty state when the range has no points', () => {
    render(<MetricChart series={{ ...series, points: [] }} range="W" title="Tapping speed" />);
    expect(screen.getByText('No data in this range')).toBeTruthy();
    expect(header()).toContain('—');
  });

  it('moves through points with the arrow keys and returns to rest on Escape', () => {
    render(<MetricChart series={series} range="M" title="Tapping speed" />);
    const plot = screen.getByRole('group');
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    expect(header()).toContain('Session');
    expect(header()).toContain('3.7taps/s');
    expect(header()).toContain('3 Nov 2026');
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    expect(header()).toContain('4.2taps/s');
    fireEvent.keyDown(plot, { key: 'Escape' });
    expect(header()).toContain('Average');
  });
});

const right: MetricSeries = {
  metricId: 'single-leg-squat.depth',
  unit: '%',
  points: [
    { t: '2026-11-03T10:00:00.000Z', value: 40 },
    { t: '2026-11-10T10:00:00.000Z', value: 50 },
  ],
  baseline: 45,
  referenceBand: { low: 40, high: 50 },
  events: [],
};

const left: MetricSeries = {
  ...right,
  points: [
    { t: '2026-11-03T10:00:00.000Z', value: 60 },
    { t: '2026-11-07T10:00:00.000Z', value: 62 },
    { t: '2026-11-10T10:00:00.000Z', value: 64 },
  ],
};

function depthHeader() {
  return screen.getByRole('heading', { name: 'Squat depth' }).parentElement?.textContent ?? '';
}

describe('MetricChart compare mode', () => {
  it('draws two lines with a legend and no band or baseline', () => {
    const { container } = render(<MetricChart series={right} label="Right" compare={{ series: left, label: 'Left' }} range="M" title="Squat depth" />);
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelectorAll('path[stroke-dasharray]')).toHaveLength(1);
    const legend = container.querySelector('ul');
    expect(legend?.textContent).toBe('RightLeft');
    expect(screen.queryByText('own range')).toBeNull();
    expect(screen.queryByText('baseline')).toBeNull();
  });

  it('shows both averages at rest and both values for a session while stepping', () => {
    render(<MetricChart series={right} label="Right" compare={{ series: left, label: 'Left' }} range="M" title="Squat depth" />);
    expect(depthHeader()).toContain('Right45%');
    expect(depthHeader()).toContain('Left62%');
    const plot = screen.getByRole('group');
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    expect(depthHeader()).toContain('Right40%');
    expect(depthHeader()).toContain('Left60%');
    fireEvent.keyDown(plot, { key: 'ArrowRight' });
    expect(depthHeader()).toContain('Right—');
    expect(depthHeader()).toContain('Left62%');
    expect(depthHeader()).toContain('7 Nov 2026');
  });

  it('gives each side a column in the hidden table', () => {
    render(<MetricChart series={right} label="Right" compare={{ series: left, label: 'Left' }} range="M" title="Squat depth" />);
    const table = screen.getByRole('table', { name: 'Squat depth' });
    const headers = Array.from(table.querySelectorAll('th')).map((cell) => cell.textContent);
    expect(headers).toEqual(['Date', 'Right', 'Left', 'Note']);
    expect(table.textContent).toContain('40 %60 %');
    expect(table.textContent).toContain('—62 %');
  });
});

describe('MetricChart target', () => {
  it('draws a dashed target line with its label and stretches the axis to reach it', () => {
    const { container } = render(<MetricChart series={right} target={{ value: 90, label: '90%' }} range="M" title="Squat depth" />);
    expect(screen.getByText('90%')).toBeTruthy();
    expect(container.querySelectorAll('line[stroke-dasharray]')).toHaveLength(1);
    const tickLabels = Array.from(container.querySelectorAll('text')).map((node) => node.textContent);
    expect(tickLabels).toContain('90');
  });
});
