import { recordDraftSchema, type AiOutput, type RecordDraft } from '@tempo/shared';
import { generate, type GenerateContext } from './generate.ts';
import { clinicianOnlyRules, type Media } from './provider.ts';

export const recordIntakePromptVersion = 'record-intake-1';

const system = [
  'You read a hospital discharge letter (a photo or PDF) and draft the medical record fields for a clinician to check and confirm.',
  'diagnoses: each diagnosis as written in the letter. Add code only when an ICD-10 code is printed next to it in the letter; never infer a code.',
  'medications: each medication with dose, frequency and start date (YYYY-MM-DD) only when the letter states them.',
  'historyNotes: short notes on relevant history, events and limitations stated in the letter.',
  'Copy facts from the letter only. Leave out anything that is not written in it.',
  "Leave out the patient's name, date of birth, address, phone number, hospital or insurance numbers and the names of staff, even where the letter shows them.",
  clinicianOnlyRules,
].join('\n');

export type IntakeRecordInput = { document: Media; inputRef: string };

export const intakeRecord = (
  context: GenerateContext,
  { document, inputRef }: IntakeRecordInput,
): Promise<AiOutput<RecordDraft>> =>
  generate(context, {
    task: 'record-intake',
    promptVersion: recordIntakePromptVersion,
    inputRef,
    system,
    parts: [document],
    responseSchema: recordDraftSchema,
  });
