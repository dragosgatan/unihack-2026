import { z } from 'zod';
import {
  assistantActions,
  type AiMeta,
  type AiOutput,
  type AssistantActionId,
  type Language,
} from '@tempo/shared';
import { AiOutputInvalidError, type GenerateContext } from './generate.ts';
import { languageNames } from './language.ts';
import type { AiFunctionCall, AiPart, AiTool, Media } from './provider.ts';

export const assistantPromptVersion = 'assistant-1';
export const respondFunctionName = 'respond';

const actionDescriptions: Record<AssistantActionId, string> = {
  navigate: 'Open another screen of the app, by its screen id.',
  goBack: 'Go back to the previous screen.',
  repeatInstructions: 'Say the instructions of the current test or exercise again.',
  pauseSession: 'Pause the running session.',
  cannotDo:
    'Open the "I can\'t do this" screen for the current test or exercise. The patient picks the reason there; never pass one.',
  answerCheckIn:
    'Fill in a check-in answer the user said, such as pain intensity from 0 to 10 and where it hurts. The user confirms it before it is saved.',
  logEpisode:
    'Fill in an episode the user reports, such as a fall or dizziness, with how many times it happened. The user confirms it before it is saved.',
  openPatient: 'Open a patient by the name the user said. Put the name exactly as spoken in spokenName.',
  openMetric: 'Open the chart of one metric for the patient on screen.',
  askRecord:
    'Pass a question about patient data, such as how a score changed, to "Ask the record". Put the question as the user asked it.',
};

const respondParamsSchema = z.object({
  reply: z.string().trim().min(1),
  transcript: z.string().optional(),
});

const respondTool: AiTool = {
  name: respondFunctionName,
  description:
    'Call this exactly once on every turn. reply: one short sentence to say to the user, in their language. transcript: for a spoken request, a verbatim transcript in the language spoken.',
  parameters: respondParamsSchema,
};

const fallbackReply: Record<Language, string> = {
  en: 'Sorry, I did not catch that.',
  ro: 'Scuze, nu am înțeles.',
};

export const assistantTurnOutputSchema = z.object({
  transcript: z.string(),
  reply: z.string().min(1),
  calls: z.array(z.object({ id: z.string().min(1), params: z.unknown() })),
});

export type AssistantTurnOutput = z.infer<typeof assistantTurnOutputSchema>;

export type AssistantTurnInput = {
  language: Language;
  screenId: string;
  availableActionIds: readonly AssistantActionId[];
  input: { audio: Media } | { text: string };
  inputRef: string;
};

const systemFor = (screenId: string): string =>
  [
    'You operate the Tempo rehabilitation app for one spoken or typed request, by calling the declared functions.',
    'Always call respond with a reply of one short sentence in the user\'s language, English or Romanian.',
    `The user is on the screen "${screenId}". Only the declared functions are available here.`,
    'Rules:',
    '- Never help with, hint at, answer or complete any part of a test or exercise.',
    '- Never choose a reason for "I can\'t do this"; only open that screen.',
    '- Never tell a patient their scores, interpret results or give medical advice. Say their therapist is the one to ask.',
    '- Never make a clinical decision: do not accept, edit or dismiss a suggestion, sign off a report, override a score, or save a change to a record or plan. Say the user has to do it by hand.',
    '- Never enter a PIN, a session code or a password.',
    '- Never answer a clinician\'s question about patient data yourself. Pass it to askRecord.',
    '- Put a person\'s name into openPatient.spokenName exactly as said.',
    '- If no function fits the request, call only respond and say you can\'t do that here.',
    '- Never say you did something unless you called the function for it.',
  ].join('\n');

const toolsFor = (availableActionIds: readonly AssistantActionId[]): AiTool[] => [
  ...[...new Set(availableActionIds)].map((id) => ({
    name: id,
    description: actionDescriptions[id],
    parameters: assistantActions[id].params,
  })),
  respondTool,
];

const inputPart = (input: AssistantTurnInput['input']): AiPart => ('audio' in input ? input.audio : { text: input.text });

const assemble = (calls: readonly AiFunctionCall[], { language, input }: AssistantTurnInput): unknown => {
  const respond = calls
    .filter((call) => call.name === respondFunctionName)
    .map((call) => respondParamsSchema.safeParse(call.arguments))
    .find((parsed) => parsed.success)?.data;
  return {
    transcript: 'text' in input ? input.text : (respond?.transcript ?? ''),
    reply: respond?.reply ?? fallbackReply[language],
    calls: calls
      .filter((call) => call.name !== respondFunctionName)
      .map((call) => ({ id: call.name, params: call.arguments })),
  };
};

const attempts = 2;

export const assistantTurn = async (
  { provider, now }: GenerateContext,
  input: AssistantTurnInput,
): Promise<AiOutput<AssistantTurnOutput>> => {
  let issues: string[] = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await provider.generate({
      task: 'assistant',
      system: systemFor(input.screenId),
      parts: [{ text: `The user speaks ${languageNames[input.language]}.` }, inputPart(input.input)],
      tools: toolsFor(input.availableActionIds),
    });
    const parsed = assistantTurnOutputSchema.safeParse(assemble(response.calls ?? [], input));
    if (parsed.success) {
      const meta: AiMeta = {
        model: response.model,
        promptVersion: assistantPromptVersion,
        inputRef: input.inputRef,
        provider: provider.name,
        createdAt: now().toISOString(),
      };
      return { output: parsed.data, meta };
    }
    issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`);
  }
  throw new AiOutputInvalidError('assistant', issues);
};
