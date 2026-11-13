import { clockCriterionScoreSchema, type AiOutput, type ClockDrawingScore } from '@tempo/shared';
import { z } from 'zod';
import { generate, type GenerateContext } from './generate.ts';
import { clinicianOnlyRules, type Media } from './provider.ts';

export const clockRubric = {
  version: 'clock-rubric-1',
  criteria: {
    contour: 'Score 1 if the clock face is a closed contour that is roughly circular. Small gaps or wobble are acceptable.',
    numbers:
      'Score 1 if all numbers 1 to 12 are present, with no extra numbers, in the right order and placed roughly in their correct positions around the face. Roman numerals are acceptable.',
    hands:
      'Score 1 if there are exactly two hands that together show the target time, the hour hand is visibly shorter than the minute hand, and both start near the centre.',
  },
} as const;

export const clockDrawingPromptVersion = `clock-drawing-1/${clockRubric.version}`;

export const clockDrawingResponseSchema = z.object({
  contour: clockCriterionScoreSchema,
  numbers: clockCriterionScoreSchema,
  hands: clockCriterionScoreSchema,
  confidence: z.number().min(0).max(1),
});

const targetTimeSchema = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/);

const system = [
  'You rate a clock drawn on a touch screen by a patient in a rehabilitation programme, using a fixed rubric.',
  'Score each criterion 0 or 1 by the rubric alone, give one short sentence of justification describing what you see, and give your overall confidence from 0 to 1.',
  'Lower your confidence when the image is unclear or a criterion is borderline.',
  clinicianOnlyRules,
].join('\n');

const rubricText = (targetTime: string): string =>
  [
    `The patient was asked to draw a clock showing ${targetTime}.`,
    'Rubric:',
    `contour: ${clockRubric.criteria.contour}`,
    `numbers: ${clockRubric.criteria.numbers}`,
    `hands: ${clockRubric.criteria.hands}`,
  ].join('\n');

export type ScoreClockDrawingInput = { image: Media; targetTime: string; inputRef: string };

export const scoreClockDrawing = async (
  context: GenerateContext,
  { image, targetTime, inputRef }: ScoreClockDrawingInput,
): Promise<AiOutput<ClockDrawingScore>> => {
  const { output, meta } = await generate(context, {
    task: 'clock-drawing',
    promptVersion: clockDrawingPromptVersion,
    inputRef,
    system,
    parts: [{ text: rubricText(targetTimeSchema.parse(targetTime)) }, image],
    responseSchema: clockDrawingResponseSchema,
  });
  const total = output.contour.score + output.numbers.score + output.hands.score;
  return { output: { ...output, total }, meta };
};
