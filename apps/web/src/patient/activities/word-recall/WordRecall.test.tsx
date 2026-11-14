import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { wordRecallRawResultSchema, type WordRecallDelayedConfig } from '@tempo/shared';
import { completedResult, type ActivityProgress } from '../../session/runner.ts';
import { saveRecording } from '../../session/store.ts';
import { press } from '../check-in-test-helpers.ts';
import { WordRecall } from './WordRecall.tsx';
import { wordLists } from './words.ts';

vi.mock('../../session/store.ts', () => ({ saveRecording: vi.fn(() => Promise.resolve()) }));

const stopTrack = vi.fn();

class FakeRecorder {
  static isTypeSupported = (type: string) => type === 'audio/mp4';
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, options: { mimeType: string }) {
    this.mimeType = options.mimeType;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio']) });
    this.onstop?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(() => Promise.resolve({ getTracks: () => [{ stop: stopTrack }] })) },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const flush = () => act(async () => {});
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

const speakAndFinish = async () => {
  press('Speak');
  await flush();
  press("I've finished");
};

const setup = (config: Record<string, unknown> = {}) => {
  const onComplete = vi.fn();
  const progress: ActivityProgress[] = [];
  const view = render(<WordRecall config={config} language="en" onComplete={onComplete} onProgress={(value) => progress.push(value)} />);
  return { onComplete, progress, view };
};

const startTask = async () => {
  const context = setup();
  press('Next');
  press('Listen');
  wait(4500);
  await speakAndFinish();
  press('Listen');
  wait(9000);
  return context;
};

describe('WordRecall', () => {
  it('returns the five words and a stored recording after practice, discarding the practice clip', async () => {
    const { onComplete, progress } = await startTask();
    await speakAndFinish();

    const raw = wordRecallRawResultSchema.parse(onComplete.mock.calls[0]?.[0]);
    expect(raw).toMatchObject({ part: 'immediate', language: 'en', recording: { mimeType: 'audio/mp4', bytes: 5 } });
    expect(wordLists).toContainEqual(raw.words);
    expect(saveRecording).toHaveBeenCalledOnce();
    expect(saveRecording).toHaveBeenCalledWith(raw.recording.id, expect.any(Blob));
    expect(progress.map((value) => value.stage)).toEqual(['practice', 'task', 'task']);
    expect(stopTrack).toHaveBeenCalledTimes(2);
    expect(completedResult('word-recall', raw, new Date())).toBeDefined();
  });

  it('keeps the clip so far and releases the microphone when unmounted mid-recall', async () => {
    const { onComplete, progress, view } = await startTask();
    press('Speak');
    await flush();
    const partial = progress.at(-1)?.partialData as { recording: { id: string } };
    view.unmount();

    expect(onComplete).not.toHaveBeenCalled();
    expect(saveRecording).toHaveBeenCalledWith(partial.recording.id, expect.any(Blob));
    expect(stopTrack).toHaveBeenCalledTimes(2);
  });

  it('rests until five minutes have passed, then asks for the same words again', async () => {
    const words = wordLists[1] ?? [];
    const config: WordRecallDelayedConfig = {
      part: 'delayed',
      language: 'en',
      words,
      presentedAt: new Date(Date.now() - 60_000).toISOString(),
    };
    const { onComplete } = setup(config);

    expect(screen.getByRole('heading', { name: 'Time for a short rest' })).toBeDefined();
    wait(4 * 60_000);
    await speakAndFinish();

    expect(wordRecallRawResultSchema.parse(onComplete.mock.calls[0]?.[0])).toMatchObject({ part: 'delayed', words });
  });

  it('stops by itself after thirty seconds', async () => {
    const { onComplete } = await startTask();
    press('Speak');
    await flush();
    wait(30_000);

    expect(onComplete).toHaveBeenCalledOnce();
  });
});
