import { z } from 'zod';
import { functionParameters } from './function-parameters.ts';
import type { AiFunctionCall, AiPart, AiProvider, AiRequest, AiTask } from './provider.ts';

export const geminiModel = 'gemini-3.8-flash';
type ModelChain = readonly [string, ...string[]];
const pipelineModels: ModelChain = [geminiModel, 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const assistantModels: ModelChain = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-flash-lite', geminiModel];
const busyStatuses = new Set([429, 503]);
export const geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/interactions';
export const geminiApiRevision = '2026-05-20';
export const geminiTimeoutMs = 60_000;
export const geminiAssistantTimeoutMs = 12_000;

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

const geminiAudioTypes: Record<string, string> = { 'audio/mp4': 'audio/m4a' };

const sentMimeType = (mimeType: string): string => {
  const bare = mimeType.split(';')[0]?.trim().toLowerCase() ?? mimeType;
  return geminiAudioTypes[bare] ?? bare;
};

const toContent = (part: AiPart): GeminiContent => {
  if ('text' in part) return { type: 'text', text: part.text };
  const mimeType = sentMimeType(part.mimeType);
  return { type: mediaType(mimeType), mime_type: mimeType, data: Buffer.from(part.data).toString('base64') };
};

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

// Free-tier quotas are counted per model, so a busy model hands over to the next one. A voice turn has to answer in about a second, which the lite models do and gemini-3.8-flash does not, so the assistant starts from the small end.
const liteFirstTasks: ReadonlySet<AiTask> = new Set<AiTask>(['assistant', 'speech']);
export const geminiModelsFor = (task: AiTask): ModelChain => (liteFirstTasks.has(task) ? assistantModels : pipelineModels);

const outputFormat = (request: AiRequest) =>
  'tools' in request
    ? {
        tools: request.tools.map(({ name, description, parameters }) => ({
          type: 'function',
          name,
          description,
          parameters: functionParameters(parameters),
        })),
        generation_config: { tool_choice: 'any', thinking_level: 'low' },
      }
    : {
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: stripUnsupported(z.toJSONSchema(request.responseSchema)),
        },
      };

export const geminiRequestBody = (request: AiRequest, model: string = geminiModel) => ({
  model,
  system_instruction: request.system,
  input: request.parts.map(toContent),
  ...outputFormat(request),
  store: false,
});

const timeoutFor = (task: AiTask): number => (task === 'assistant' ? geminiAssistantTimeoutMs : geminiTimeoutMs);

const interactionSchema = z.object({
  model: z.string().min(1).optional(),
  status: z.string().optional(),
  steps: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      name: z.string().optional(),
      arguments: z.unknown().optional(),
    }),
  ),
});

const outputText = (interaction: z.infer<typeof interactionSchema>): string =>
  interaction.steps
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .map((content) => (content.type === 'text' ? (content.text ?? '') : ''))
    .join('');

const functionCalls = (interaction: z.infer<typeof interactionSchema>): AiFunctionCall[] =>
  interaction.steps.flatMap((step) =>
    step.type === 'function_call' && step.name !== undefined ? [{ name: step.name, arguments: step.arguments ?? {} }] : [],
  );

const finishedStatuses = (request: AiRequest): ReadonlySet<string> =>
  new Set('tools' in request ? ['completed', 'requires_action'] : ['completed']);

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
    const key = await apiKey();
    const send = (model: string): Promise<Response> =>
      fetchImpl(geminiEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': key,
          'api-revision': geminiApiRevision,
        },
        body: JSON.stringify(geminiRequestBody(request, model)),
        signal: AbortSignal.timeout(timeoutFor(request.task)),
      });
    const firstAvailable = async (model: string, rest: readonly string[]): Promise<{ model: string; response: Response }> => {
      const response = await send(model);
      const [next, ...later] = rest;
      return busyStatuses.has(response.status) && next !== undefined ? firstAvailable(next, later) : { model, response };
    };
    const [preferred, ...others] = geminiModelsFor(request.task);
    const { model: sentTo, response } = await firstAvailable(preferred, others);
    if (!response.ok) throw new GeminiRequestError(`Gemini request for ${request.task} failed`, response.status);
    const interaction = interactionSchema.safeParse(await response.json());
    if (!interaction.success) throw new GeminiRequestError(`Gemini response for ${request.task} has an unknown shape`);
    const { status } = interaction.data;
    if (status !== undefined && !finishedStatuses(request).has(status)) {
      throw new GeminiRequestError(`Gemini interaction for ${request.task} ended as ${status}`);
    }
    const model = interaction.data.model ?? sentTo;
    if ('tools' in request) return { data: undefined, model, calls: functionCalls(interaction.data) };
    return { data: parseJson(outputText(interaction.data)), model };
  },
});
