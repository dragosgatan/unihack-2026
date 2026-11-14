import { inflateSync } from 'node:zlib';
import type { ClockDrawingRawResult, WordRecallRawResult } from '@tempo/shared';
import { describe, expect, it } from 'vitest';
import { createAi, createMockProvider, type AiProvider, type AiRequest } from './ai/index.ts';
import { createPipelineAi } from './ai-port.ts';
import { clockDrawingPng } from './clock-image.ts';
import { createMemoryRecordingFiles, recordingKey } from './recording-files.ts';

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
    const recordings = createMemoryRecordingFiles();
    const ai = createPipelineAi(createAi({ provider, now: () => new Date('2026-11-14T10:00:00.000Z') }), recordings);
    return { requests, recordings, ai };
  };

  it('sends the drawing as a PNG with the target time and maps the total to the clock score', async () => {
    const { requests, ai } = recording();
    const scored = await ai.scoreItem({ activityId: 'clock-drawing', sessionId: 'sess-1', data: raw, inputRef: 'result:res-1' });

    expect(scored?.output).toEqual({ scores: [{ metricId: 'clock-drawing.score', value: 2 }] });
    expect(scored?.meta.inputRef).toBe('result:res-1');
    expect(requests).toHaveLength(1);
    const [text, image] = requests[0]?.parts ?? [];
    expect(text && 'text' in text ? text.text : '').toContain('11:10');
    expect(image && 'mimeType' in image ? image.mimeType : '').toBe('image/png');
  });

  it('leaves a blank drawing to the clinician without calling the model', async () => {
    const { requests, ai } = recording();
    expect(await ai.scoreItem({ activityId: 'clock-drawing', sessionId: 's', data: { ...raw, strokes: [] }, inputRef: 'r' })).toBeUndefined();
    expect(requests).toHaveLength(0);
  });

  it('does not score data that is not a clock drawing, or other activities', async () => {
    const { requests, ai } = recording();
    expect(await ai.scoreItem({ activityId: 'clock-drawing', sessionId: 's', data: { taps: [] }, inputRef: 'r' })).toBeUndefined();
    expect(await ai.scoreItem({ activityId: 'finger-tapping', sessionId: 's', data: raw, inputRef: 'r' })).toBeUndefined();
    expect(requests).toHaveLength(0);
  });

  const words: WordRecallRawResult = {
    part: 'immediate',
    language: 'en',
    words: ['apple', 'river', 'chair', 'garden', 'candle'],
    presentedAt: '2026-11-14T09:58:00.000Z',
    recording: { id: '0b6c2f1e-8a43-4f3e-9d61-2c7d5b8e4a10', mimeType: 'audio/webm;codecs=opus', durationMs: 9000, bytes: 4 },
  };
  const audio = new Uint8Array([1, 2, 3, 4]);

  it('transcribes the stored recording with its mime type and counts the list words heard', async () => {
    const { requests, recordings, ai } = recording();
    await recordings.put(recordingKey('sess-1', words.recording.id), { mimeType: 'audio/mp4', bytes: audio });

    const scored = await ai.scoreItem({ activityId: 'word-recall', sessionId: 'sess-1', data: words, inputRef: 'result:res-2' });

    expect(scored?.output).toEqual({ scores: [{ metricId: 'word-recall.immediate', value: 4 }] });
    expect(scored?.meta).toMatchObject({ inputRef: 'result:res-2', promptVersion: 'speech-1' });
    expect(requests).toHaveLength(1);
    const [text, sound] = requests[0]?.parts ?? [];
    expect(text && 'text' in text ? text.text : '').toContain('English');
    expect(sound).toEqual({ mimeType: 'audio/mp4', data: audio });
  });

  it('scores a delayed recall on its own metric', async () => {
    const { recordings, ai } = recording();
    await recordings.put(recordingKey('sess-1', words.recording.id), { mimeType: 'audio/mp4', bytes: audio });
    const delayed = { ...words, part: 'delayed' };
    const scored = await ai.scoreItem({ activityId: 'word-recall', sessionId: 'sess-1', data: delayed, inputRef: 'r' });
    expect(scored?.output).toEqual({ scores: [{ metricId: 'word-recall.delayed', value: 4 }] });
  });

  it('leaves a missing or empty recording to the clinician without calling the model', async () => {
    const { requests, recordings, ai } = recording();
    await recordings.put(recordingKey('sess-1', words.recording.id), { mimeType: 'audio/mp4', bytes: audio });
    expect(await ai.scoreItem({ activityId: 'word-recall', sessionId: 'sess-2', data: words, inputRef: 'r' })).toBeUndefined();
    await recordings.put(recordingKey('sess-3', words.recording.id), { mimeType: 'audio/mp4', bytes: new Uint8Array() });
    expect(await ai.scoreItem({ activityId: 'word-recall', sessionId: 'sess-3', data: words, inputRef: 'r' })).toBeUndefined();
    expect(requests).toHaveLength(0);
  });

  it('does not score data that is not a word recall', async () => {
    const { requests, ai } = recording();
    expect(await ai.scoreItem({ activityId: 'word-recall', sessionId: 'sess-1', data: raw, inputRef: 'r' })).toBeUndefined();
    expect(requests).toHaveLength(0);
  });
});
