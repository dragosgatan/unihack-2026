import { assistantActions, recordDraftSchema, speechTranscriptSchema } from '@tempo/shared';
import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAi } from './index.ts';
import {
  GeminiRequestError,
  createGeminiProvider,
  geminiApiRevision,
  geminiAssistantTimeoutMs,
  geminiEndpoint,
  geminiModel,
  geminiModelsFor,
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
      model: geminiModelsFor('speech')[0],
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

  it('starts transcription from the lite models and the other pipeline tasks from the large one', () => {
    expect(geminiModelsFor('speech')).toEqual(geminiModelsFor('assistant'));
    expect(geminiModelsFor('clock-drawing')[0]).toBe(geminiModel);
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

  it('moves to the next model when the first one is busy', async () => {
    const responses = [json({ error: { code: 'service_unavailable' } }, 503), json(interaction('{"transcript":"","words":[]}'))];
    const { fetchImpl, calls } = fakeFetch(() => responses.shift() ?? json({}, 500));
    const provider = createGeminiProvider({ apiKey: async () => apiKey, fetch: fetchImpl });
    await provider.generate(request);
    const models = calls.map((call) => (JSON.parse(String(call.init.body)) as { model: string }).model);
    expect(models).toEqual(geminiModelsFor(request.task).slice(0, 2));
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

describe('Gemini provider with function tools', () => {
  const toolsRequest: AiRequest = {
    task: 'assistant',
    system: 'assistant prompt',
    parts: [{ text: 'The user speaks Romanian.' }, { mimeType: 'audio/mp4;codecs=mp4a.40.2', data: new Uint8Array([7]) }],
    tools: [
      { name: 'cannotDo', description: 'Open the cannot-do screen.', parameters: assistantActions.cannotDo.params },
      { name: 'answerCheckIn', description: 'Fill in a check-in.', parameters: assistantActions.answerCheckIn.params },
      { name: 'respond', description: 'Reply.', parameters: z.object({ reply: z.string(), transcript: z.string().optional() }) },
    ],
  };

  const callInteraction = (status: string) => ({
    id: 'int-2',
    object: 'interaction',
    model: 'gemini-3.8-flash-001',
    status,
    steps: [
      { type: 'user_input', content: [{ type: 'text', text: 'ignored' }] },
      { type: 'thought', signature: 'abc' },
      { type: 'function_call', id: 'call-1', name: 'cannotDo', arguments: {} },
      { type: 'function_call', id: 'call-2', name: 'respond', arguments: { reply: 'Deschid ecranul.', transcript: 'nu pot' } },
      { type: 'function_call', id: 'call-3', name: 'goBack' },
    ],
  });

  it('declares the tools, forces a function call and sends no response format', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { fetchImpl, calls } = fakeFetch(() => json(callInteraction('requires_action')));
    await createGeminiProvider({ apiKey: async () => apiKey, fetch: fetchImpl }).generate(toolsRequest);

    const body = bodyOf(calls[0]);
    expect(body).not.toHaveProperty('response_format');
    expect(body).toMatchObject({
      model: geminiModelsFor('assistant')[0],
      system_instruction: 'assistant prompt',
      store: false,
      generation_config: { tool_choice: 'any', thinking_level: 'low' },
      input: [
        { type: 'text', text: 'The user speaks Romanian.' },
        { type: 'audio', mime_type: 'audio/m4a', data: 'Bw==' },
      ],
    });
    expect(body['tools']).toEqual([
      { type: 'function', name: 'cannotDo', description: 'Open the cannot-do screen.', parameters: { type: 'object', properties: {} } },
      {
        type: 'function',
        name: 'answerCheckIn',
        description: 'Fill in a check-in.',
        parameters: expect.objectContaining({ type: 'object', required: ['item'] }),
      },
      {
        type: 'function',
        name: 'respond',
        description: 'Reply.',
        parameters: { type: 'object', properties: { reply: { type: 'string' }, transcript: { type: 'string' } }, required: ['reply'] },
      },
    ]);
    expect(JSON.stringify(body['tools'])).not.toMatch(/anyOf|oneOf|\$schema|const|additionalProperties/);
    expect(timeout).toHaveBeenCalledWith(geminiAssistantTimeoutMs);
  });

  it('walks the whole model chain while models are busy and reports the last status', async () => {
    const { fetchImpl, calls } = fakeFetch(() => new Response('busy', { status: 429 }));
    const error = await createGeminiProvider({ apiKey: async () => apiKey, fetch: fetchImpl })
      .generate(toolsRequest)
      .catch((caught: unknown) => caught);

    expect(calls.map((call) => bodyOf(call)['model'])).toEqual([...geminiModelsFor('assistant')]);
    expect(geminiModelsFor('assistant')[0]).not.toBe(geminiModel);
    expect(error).toMatchObject({ status: 429 });
  });

  it.each(['completed', 'requires_action'])('reads the function calls of a %s interaction', async (status) => {
    const { fetchImpl } = fakeFetch(() => json(callInteraction(status)));
    const response = await createGeminiProvider({ apiKey: async () => apiKey, fetch: fetchImpl }).generate(toolsRequest);
    expect(response).toEqual({
      data: undefined,
      model: 'gemini-3.8-flash-001',
      calls: [
        { name: 'cannotDo', arguments: {} },
        { name: 'respond', arguments: { reply: 'Deschid ecranul.', transcript: 'nu pot' } },
        { name: 'goBack', arguments: {} },
      ],
    });
  });

  it('still rejects a failed interaction, and requires_action without tools', async () => {
    const failed = fakeFetch(() => json(callInteraction('failed')));
    const provider = createGeminiProvider({ apiKey: async () => apiKey, fetch: failed.fetchImpl });
    await expect(provider.generate(toolsRequest)).rejects.toBeInstanceOf(GeminiRequestError);
    const pending = fakeFetch(() => json(interaction('{}', 'requires_action')));
    const structured = createGeminiProvider({ apiKey: async () => apiKey, fetch: pending.fetchImpl });
    await expect(structured.generate(request)).rejects.toBeInstanceOf(GeminiRequestError);
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
