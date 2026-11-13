import { speechTranscriptSchema, type AiOutput, type Language, type SpeechTranscript } from '@tempo/shared';
import { generate, type GenerateContext } from './generate.ts';
import { clinicianOnlyRules, type Media } from './provider.ts';
import { languageNames } from './language.ts';

export const speechPromptVersion = 'speech-1';

const system = [
  'You transcribe a short recording of a patient speaking during a memory or language test.',
  'Write exactly what was said, without correcting, completing or guessing missing words.',
  'In words, list every word the patient said in the order spoken, in lower case without punctuation, including repeats, fillers and self-corrections.',
  'Do not count, judge or score anything.',
  clinicianOnlyRules,
].join('\n');

export type TranscribeSpeechInput = { audio: Media; language: Language; inputRef: string };

export const transcribeSpeech = (
  context: GenerateContext,
  { audio, language, inputRef }: TranscribeSpeechInput,
): Promise<AiOutput<SpeechTranscript>> =>
  generate(context, {
    task: 'speech',
    promptVersion: speechPromptVersion,
    inputRef,
    system,
    parts: [{ text: `The patient speaks ${languageNames[language]}.` }, audio],
    responseSchema: speechTranscriptSchema,
  });
