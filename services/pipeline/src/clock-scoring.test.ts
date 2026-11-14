import { inflateSync } from 'node:zlib';
import type { ClockDrawingRawResult } from '@tempo/shared';
import { describe, expect, it } from 'vitest';
import { createAi, createMockProvider, type AiProvider, type AiRequest } from './ai/index.ts';
import { createPipelineAi } from './ai-port.ts';
import { clockDrawingPng } from './clock-image.ts';

const size = 64;

const pixelsOf = (png: Uint8Array): ((x: number, y: number) => number | undefined) => {
  const bytes = Buffer.from(png);
  const idatLength = bytes.readUInt32BE(33);
  const rows = inflateSync(bytes.subarray(41, 41 + idatLength));
  return (x, y) => rows[y * (size + 1) + 1 + x];
};

const raw: ClockDrawingRawResult = {
  hand: 'right',
  targetTime: '11:10',
  strokes: [
    [
      { t: 1200, x: 0.2, y: 0.5 },
      { t: 1500, x: 0.8, y: 0.5 },
    ],
    [{ t: 2100, x: 0.5, y: 0.2 }],
  ],
};

describe('clockDrawingPng', () => {
  const png = clockDrawingPng(raw.strokes, size);
  const pixel = pixelsOf(png);

  it('is a square greyscale PNG', () => {
    const bytes = Buffer.from(png);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.subarray(12, 16).toString('latin1')).toBe('IHDR');
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20), bytes[24], bytes[25]]).toEqual([size, size, 8, 0]);
    expect(bytes.subarray(-8, -4).toString('latin1')).toBe('IEND');
  });

  it('draws strokes in black on white', () => {
    expect(pixel(32, 32)).toBe(0);
    expect(pixel(13, 32)).toBe(0);
    expect(pixel(51, 32)).toBe(0);
    expect(pixel(32, 40)).toBe(255);
    expect(pixel(2, 2)).toBe(255);
    expect(pixel(58, 32)).toBe(255);
  });

  it('leaves a dot for a single touch', () => {
    expect(pixel(32, 12)).toBe(0);
    expect(pixel(32, 20)).toBe(255);
  });
});

describe('scoreItem', () => {
  const recording = () => {
    const requests: AiRequest[] = [];
    const mock = createMockProvider();
    const provider: AiProvider = {
      name: 'mock',
      generate: (request) => {
        requests.push(request);
        return mock.generate(request);
      },
    };
    return { requests, ai: createPipelineAi(createAi({ provider, now: () => new Date('2026-11-14T10:00:00.000Z') })) };
  };

  it('sends the drawing as a PNG with the target time and maps the total to the clock score', async () => {
    const { requests, ai } = recording();
    const scored = await ai.scoreItem({ activityId: 'clock-drawing', data: raw, inputRef: 'result:res-1' });

    expect(scored?.output).toEqual({ scores: [{ metricId: 'clock-drawing.score', value: 2 }] });
    expect(scored?.meta.inputRef).toBe('result:res-1');
    expect(requests).toHaveLength(1);
    const [text, image] = requests[0]?.parts ?? [];
    expect(text && 'text' in text ? text.text : '').toContain('11:10');
    expect(image && 'mimeType' in image ? image.mimeType : '').toBe('image/png');
  });

  it('leaves a blank drawing to the clinician without calling the model', async () => {
    const { requests, ai } = recording();
    expect(await ai.scoreItem({ activityId: 'clock-drawing', data: { ...raw, strokes: [] }, inputRef: 'r' })).toBeUndefined();
    expect(requests).toHaveLength(0);
  });

  it('does not score data that is not a clock drawing, or other activities', async () => {
    const { requests, ai } = recording();
    expect(await ai.scoreItem({ activityId: 'clock-drawing', data: { taps: [] }, inputRef: 'r' })).toBeUndefined();
    expect(await ai.scoreItem({ activityId: 'word-recall', data: raw, inputRef: 'r' })).toBeUndefined();
    expect(requests).toHaveLength(0);
  });
});
