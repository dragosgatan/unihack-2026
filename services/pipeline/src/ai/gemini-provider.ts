import { z } from 'zod';
import type { AiPart, AiProvider, AiRequest } from './provider.ts';

export const geminiModel = 'gemini-3.8-flash';
export const geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/interactions';
export const geminiApiRevision = '2026-05-20';
export const geminiTimeoutMs = 60_000;

export class GeminiRequestError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GeminiRequestError';
    this.status = status;
  }
}

type GeminiContent =
  | { type: 'text'; text: string }
  | { type: 'image' | 'audio' | 'document'; mime_type: string; data: string };

const mediaType = (mimeType: string): 'image' | 'audio' | 'document' => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'document';
  throw new GeminiRequestError(`Unsupported media type ${mimeType}`);
};

const toContent = (part: AiPart): GeminiContent =>
  'text' in part
    ? { type: 'text', text: part.text }
    : { type: mediaType(part.mimeType), mime_type: part.mimeType, data: Buffer.from(part.data).toString('base64') };

const unsupportedKeywords = new Set(['$schema', 'pattern']);

const stripUnsupported = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (typeof node !== 'object' || node === null) return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !unsupportedKeywords.has(key))
      .map(([key, value]) => [key, stripUnsupported(value)]),
  );
};

export const geminiRequestBody = ({ system, parts, responseSchema }: AiRequest) => ({
  model: geminiModel,
  system_instruction: system,
  input: parts.map(toContent),
  response_format: {
    type: 'text',
    mime_type: 'application/json',
    schema: stripUnsupported(z.toJSONSchema(responseSchema)),
  },
  store: false,
});

const interactionSchema = z.object({
  model: z.string().min(1).optional(),
  status: z.string().optional(),
  steps: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    }),
  ),
});

const outputText = (interaction: z.infer<typeof interactionSchema>): string =>
  interaction.steps
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .map((content) => (content.type === 'text' ? (content.text ?? '') : ''))
    .join('');

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export type GeminiProviderOptions = {
  apiKey: () => Promise<string>;
  fetch?: typeof fetch;
};

export const createGeminiProvider = ({ apiKey, fetch: fetchImpl = fetch }: GeminiProviderOptions): AiProvider => ({
  name: 'gemini',
  generate: async (request) => {
    const response = await fetchImpl(geminiEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': await apiKey(),
        'api-revision': geminiApiRevision,
      },
      body: JSON.stringify(geminiRequestBody(request)),
      signal: AbortSignal.timeout(geminiTimeoutMs),
    });
    if (!response.ok) throw new GeminiRequestError(`Gemini request for ${request.task} failed`, response.status);
    const interaction = interactionSchema.safeParse(await response.json());
    if (!interaction.success) throw new GeminiRequestError(`Gemini response for ${request.task} has an unknown shape`);
    if (interaction.data.status !== undefined && interaction.data.status !== 'completed') {
      throw new GeminiRequestError(`Gemini interaction for ${request.task} ended as ${interaction.data.status}`);
    }
    return { data: parseJson(outputText(interaction.data)), model: interaction.data.model ?? geminiModel };
  },
});
