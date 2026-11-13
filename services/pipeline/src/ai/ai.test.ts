import {
  aiOutputSchema,
  clockDrawingScoreSchema,
  episodeDraftSchema,
  recordDraftSchema,
  sessionSummarySchema,
  speechTranscriptSchema,
} from '@tempo/shared';
import { describe, expect, it } from 'vitest';
import { clockDrawingPromptVersion } from './clock-drawing.ts';
import { AiOutputInvalidError, createAi, createMockProvider, providerFromEnv, type AiProvider, type AiRequest } from './index.ts';

const now = () => new Date('2026-11-13T12:00:00.000Z');
const png = { mimeType: 'image/png', data: new Uint8Array([137, 80, 78, 71]) };
const webm = { mimeType: 'audio/webm', data: new Uint8Array([26, 69, 223, 163]) };
const pdf = { mimeType: 'application/pdf', data: new Uint8Array([37, 80, 68, 70]) };

const summaryInput = {
  sessionId: 'sess-42',
  language: 'en' as const,
  scores: [
    { metricId: 'trail-making-a.time' as const, value: 48, unit: 's', baseline: 39, flagged: true },
    { metricId: 'sit-to-stand.count' as const, value: 11, unit: 'count', baseline: null, flagged: false },
  ],
  skipped: [{ activityId: 'finger-tapping' as const, reason: 'pain' as const, stage: 'task' as const }],
};

const recordingProvider = (inner: AiProvider = createMockProvider()) => {
  const requests: AiRequest[] = [];
  const provider: AiProvider = {
    name: inner.name,
    generate: (request) => {
      requests.push(request);
      return inner.generate(request);
    },
  };
  return { provider, requests };
};

const sentText = (request: AiRequest | undefined): string =>
  JSON.stringify({ system: request?.system, parts: request?.parts.map((part) => ('text' in part ? part.text : part.mimeType)) });

describe('createAi with the mock provider', () => {
  const ai = createAi({ provider: createMockProvider(), now });
  const expectedMeta = (promptVersion: string, inputRef: string) => ({
    model: 'mock',
    promptVersion,
    inputRef,
    provider: 'mock',
    createdAt: '2026-11-13T12:00:00.000Z',
  });

  it('scores a clock drawing with a total computed in code', async () => {
    const result = await ai.scoreClockDrawing({ image: png, targetTime: '11:10', inputRef: 'drawings/res-1.png' });
    expect(aiOutputSchema(clockDrawingScoreSchema).safeParse(result).success).toBe(true);
    expect(result.output.total).toBe(2);
    expect(result.meta).toEqual(expectedMeta(clockDrawingPromptVersion, 'drawings/res-1.png'));
  });

  it('transcribes speech without counting', async () => {
    const result = await ai.transcribeSpeech({ audio: webm, language: 'ro', inputRef: 'audio/res-2.webm' });
    expect(aiOutputSchema(speechTranscriptSchema).safeParse(result).success).toBe(true);
    expect(result.meta).toEqual(expectedMeta('speech-1', 'audio/res-2.webm'));
  });

  it('summarizes a session', async () => {
    const result = await ai.summarizeSession(summaryInput, 'sess-42');
    expect(aiOutputSchema(sessionSummarySchema).safeParse(result).success).toBe(true);
    expect(result.meta).toEqual(expectedMeta('session-summary-1', 'sess-42'));
  });

  it('drafts a record from a document', async () => {
    const result = await ai.intakeRecord({ document: pdf, inputRef: 'intake/doc-1.pdf' });
    expect(aiOutputSchema(recordDraftSchema).safeParse(result).success).toBe(true);
    expect(result.meta).toEqual(expectedMeta('record-intake-1', 'intake/doc-1.pdf'));
  });

  it('drafts an episode from audio or a transcript', async () => {
    const fromAudio = await ai.intakeEpisode({ audio: webm, language: 'en', inputRef: 'audio/ep-1.webm' });
    const fromText = await ai.intakeEpisode({
      transcript: 'I fell yesterday',
      identifiers: [],
      language: 'en',
      inputRef: 'checkin/ci-1',
    });
    expect(aiOutputSchema(episodeDraftSchema).safeParse(fromAudio).success).toBe(true);
    expect(fromText.meta).toEqual(expectedMeta('episode-intake-1', 'checkin/ci-1'));
  });

  it('refuses a malformed target time before calling the provider', async () => {
    const { provider, requests } = recordingProvider();
    await expect(
      createAi({ provider, now }).scoreClockDrawing({ image: png, targetTime: 'ten past eleven', inputRef: 'x' }),
    ).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });
});

describe('what the provider receives', () => {
  it('puts the target time and the image in the clock drawing request', async () => {
    const { provider, requests } = recordingProvider();
    await createAi({ provider, now }).scoreClockDrawing({ image: png, targetTime: '11:10', inputRef: 'r' });
    expect(requests[0]?.parts).toEqual([{ text: expect.stringContaining('11:10') }, png]);
    expect(requests[0]?.system).toContain('Never diagnose');
  });

  it('never sends the session id or stray identity fields in a summary request', async () => {
    const { provider, requests } = recordingProvider();
    const leaky = {
      ...summaryInput,
      patientId: 'pat-777',
      name: 'Maria Ionescu',
      scores: summaryInput.scores.map((score) => ({ ...score, patientId: 'pat-777' })),
    };
    await createAi({ provider, now }).summarizeSession(leaky, 'sess-42');
    const sent = sentText(requests[0]);
    expect(sent).not.toContain('sess-42');
    expect(sent).not.toContain('pat-777');
    expect(sent).not.toContain('Maria');
    expect(sent).toContain('trail-making-a.time');
  });

  it('replaces names and ids in an episode transcript', async () => {
    const { provider, requests } = recordingProvider();
    await createAi({ provider, now }).intakeEpisode({
      transcript: 'This is Maria Ionescu, patient PAT-777. maria fell in the kitchen.',
      identifiers: ['Maria Ionescu', 'Maria', 'Ionescu', 'pat-777'],
      language: 'en',
      inputRef: 'checkin/ci-2',
    });
    const sent = sentText(requests[0]);
    expect(sent.toLowerCase()).not.toContain('maria');
    expect(sent.toLowerCase()).not.toContain('ionescu');
    expect(sent.toLowerCase()).not.toContain('pat-777');
    expect(sent).toContain('fell in the kitchen');
  });
});

describe('validation and retry', () => {
  const badThenGood = (): { provider: AiProvider; calls: () => number } => {
    let calls = 0;
    const mock = createMockProvider();
    return {
      provider: {
        name: 'gemini',
        generate: async (request) => {
          calls++;
          return calls === 1 ? { data: { transcript: 3 }, model: 'gemini-test' } : mock.generate(request);
        },
      },
      calls: () => calls,
    };
  };

  it('retries once when the first response fails validation', async () => {
    const { provider, calls } = badThenGood();
    const result = await createAi({ provider, now }).transcribeSpeech({ audio: webm, language: 'en', inputRef: 'a' });
    expect(calls()).toBe(2);
    expect(result.meta.provider).toBe('gemini');
  });

  it('throws a typed error when the retry also fails', async () => {
    let calls = 0;
    const provider: AiProvider = {
      name: 'gemini',
      generate: async () => {
        calls++;
        return { data: { summary: 'Maria Ionescu did well', claims: 'none' }, model: 'gemini-test' };
      },
    };
    const error = await createAi({ provider, now })
      .summarizeSession(summaryInput, 'sess-42')
      .catch((caught: unknown) => caught);
    expect(calls).toBe(2);
    expect(error).toBeInstanceOf(AiOutputInvalidError);
    expect(error).toMatchObject({ task: 'session-summary', issues: ['claims: invalid_type'] });
    expect(String(error) + JSON.stringify(error)).not.toContain('Maria');
  });
});

describe('providerFromEnv', () => {
  it('uses the mock provider by default', () => {
    expect(providerFromEnv({}).name).toBe('mock');
    expect(providerFromEnv({ AI_PROVIDER: 'mock' }).name).toBe('mock');
  });

  it('uses Gemini when asked and a secret is configured', () => {
    const arn = 'arn:aws:secretsmanager:eu-central-1:123456789012:secret:gemini';
    expect(providerFromEnv({ AI_PROVIDER: 'gemini', GEMINI_SECRET_ARN: arn }).name).toBe('gemini');
  });

  it('refuses Gemini without a secret and refuses unknown providers', () => {
    expect(() => providerFromEnv({ AI_PROVIDER: 'gemini' })).toThrow('GEMINI_SECRET_ARN');
    expect(() => providerFromEnv({ AI_PROVIDER: 'openai' })).toThrow();
  });
});
