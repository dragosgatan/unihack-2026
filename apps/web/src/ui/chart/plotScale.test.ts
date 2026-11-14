import { describe, expect, it } from 'vitest';
import { edgeInset, plotXScale, yLabelGutter } from './plotScale.ts';

describe('plotXScale', () => {
  it('maps the domain onto the plot area, leaving the label gutter on the right', () => {
    const { x, plotRight } = plotXScale(340, { start: 1000, end: 2000 });
    expect(plotRight).toBe(340 - yLabelGutter);
    expect(x(1000)).toBe(edgeInset);
    expect(x(2000)).toBe(plotRight - edgeInset);
    expect(x(1500)).toBe((edgeInset + plotRight - edgeInset) / 2);
  });
});
