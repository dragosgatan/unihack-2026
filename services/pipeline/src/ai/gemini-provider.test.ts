import { recordDraftSchema, speechTranscriptSchema } from '@tempo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAi } from './index.ts';
import {
  GeminiRequestError,
  createGeminiProvider,
  geminiApiRevision,
  geminiEndpoint,
  geminiModel,
  geminiTimeoutMs,
} from './gemini-provider.ts';
import type { AiRequest } from './provider.ts';
import { cachedSecret } from './secret.ts';

const apiKey = 'AIza-test-key-123';
const audio = { mimeType: 'audio/webm', data: new Uint8Array([1, 2, 3, 250]) };

const request: AiRequest = {
  task: 'speech',
  system: 'system prompt',
  parts: [{ text: 'The patient speaks English.' }, audio],
  responseSchema: speechTranscriptSchema,
};

const interaction = (text: string, status = 'completed') => ({
  id: 'int-1',
  object: 'interaction',
  model: 'gemini-3.8-flash-001',
  status,
  steps: [
    { type: 'user_input', content: [{ type: 'text', text: 'ignored' }] },
    { type: 'model_output', status: 'completed', content: [{ type: 'text', text }] },
  ],
});

type Call = { url: string; init: RequestInit };

const fakeFetch = (respond: () => Response) => {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  };
  return { fetchImpl, calls };
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const bodyOf = (call: Call | undefined): Record<string, unknown> => JSON.parse(String(call?.init.body));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Gemini provider', () => {
  it('sends a stateless structured-output interaction with inline media', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { fetchImpl, calls } = fakeFetch(() => json(interaction('{"transcript":"hello","words":["hello"]}')));
    const provider = createGeminiProvider({ apiKey: async () => apiKey, fetch: fetchImpl });

    const response = await provider.generate(request);

    expect(response).toEqual({ data: { transcript: 'hello', words: ['hello'] }, model: 'gemini-3.8-flash-001' });
    expect(calls[0]?.url).toBe(geminiEndpoint);
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toEqual({
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
      'api-revision': geminiApiRevision,
    });
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(geminiTimeoutMs);

    const body = bodyOf(calls[0]);
    expect(body).toMatchObject({
      model: geminiModel,
      system_instruction: 'system prompt',
      store: false,
      input: [
        { type: 'text', text: 'The patient speaks English.' },
        { type: 'audio', mime_type: 'audio/webm', data: Buffer.from([1, 2, 3, 250]).toString('base64') },
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: { type: 'object', required: ['transcript', 'words'] },
      },
    });
    expect(JSON.stringify(body)).not.toContain('$schema');
    expect(JSON.stringify(body)).not.toContain(apiKey);
  });

  it('maps images and PDFs to their content types', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(interaction('{}')));
    const provider = createGeminiProvider({ apiKey: async () => apiKey, fetch: fetchImpl });
    await provider.generate({
      ...request,
      parts: [
        { mimeType: 'image/png', data: new Uint8Array([1]) },
        { mimeType: 'application/pdf', data: new Uint8Array([2]) },
      ],
    });
    const input = bodyOf(calls[0]).input;
    expect(input).toEqual([
      { type: 'image', mime_type: 'image/png', data: 'AQ==' },
      { type: 'document', mime_type: 'application/pdf', data: 'Ag==' },
    ]);
  });

  it('strips regex patterns the structured-output subset does not support', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(interaction('{}')));
    const provider = createGeminiProvider({ apiKey: async () => apiKey, fetch: fetchImpl });
    await provider.generate({ ...request, responseSchema: recordDraftSchema });
    expect(JSON.stringify(bodyOf(calls[0]).response_format)).not.toContain('pattern');
  });

  it('returns unparseable output as undefined so validation retries it', async () => {
    const { fetchImpl } = fakeFetch(() => json(interaction('not json')));
    const provider = createGeminiProvider({ apiKey: async () => apiKey, fetch: fetchImpl });
    expect((await provider.generate(request)).data).toBeUndefined();
  });

  it('reports HTTP failures with the status only, never the key', async () => {
    const { fetchImpl } = fakeFetch(() => json({ error: { message: `bad key ${apiKey}` } }, 403));
    const provider = createGeminiProvider({ apiKey: async () => apiKey, fetch: fetchImpl });
    const log = vi.spyOn(console, 'log');
    const errorLog = vi.spyOn(console, 'error');
    const error = await provider.generate(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GeminiRequestError);
    expect(error).toMatchObject({ status: 403 });
    expect(String(error) + JSON.stringify(error) + (error instanceof Error ? error.stack : '')).not.toContain(apiKey);
    expect(log).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('rejects an interaction that did not complete', async () => {
    const { fetchImpl } = fakeFetch(() => json(interaction('{}', 'failed')));
    const provider = createGeminiProvider({ apiKey: async () => apiKey, fetch: fetchImpl });
    await expect(provider.generate(request)).rejects.toBeInstanceOf(GeminiRequestError);
  });

  it('records the model Gemini reports in the output meta', async () => {
    const { fetchImpl } = fakeFetch(() => json(interaction('{"transcript":"a","words":["a"]}')));
    const ai = createAi({ provider: createGeminiProvider({ apiKey: async () => apiKey, fetch: fetchImpl }) });
    const result = await ai.transcribeSpeech({ audio, language: 'en', inputRef: 'audio/r1.webm' });
    expect(result.meta).toMatchObject({ provider: 'gemini', model: 'gemini-3.8-flash-001', inputRef: 'audio/r1.webm' });
  });
});

describe('cachedSecret', () => {
  it('reads the secret once and retries after a failure', async () => {
    let reads = 0;
    const read = cachedSecret(async () => {
      reads++;
      if (reads === 1) throw new Error('throttled');
      return apiKey;
    });
    await expect(read()).rejects.toThrow('throttled');
    expect(await read()).toBe(apiKey);
    expect(await read()).toBe(apiKey);
    expect(reads).toBe(2);
  });
});
