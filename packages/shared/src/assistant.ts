import { z } from 'zod';
import { checkInBodySchema, episodeTypeSchema } from './checkin.ts';
import { aiProviderNameSchema } from './ai.ts';
import { idSchema, isoDateTimeSchema, languageSchema, roleSchema } from './common.ts';
import { metricIdSchema } from './metrics.ts';

export const assistantRoleSchema = z.enum(['patient', ...roleSchema.options]);
export const confirmationLevelSchema = z.enum(['auto', 'confirm']);

export type AssistantRole = z.infer<typeof assistantRoleSchema>;
export type ConfirmationLevel = z.infer<typeof confirmationLevelSchema>;

export const assistantActionIds = [
  'navigate',
  'goBack',
  'repeatInstructions',
  'pauseSession',
  'cannotDo',
  'answerCheckIn',
  'logEpisode',
  'openPatient',
  'openMetric',
  'askRecord',
] as const;

export const assistantActionIdSchema = z.enum(assistantActionIds);

export type AssistantActionId = z.infer<typeof assistantActionIdSchema>;

export type AssistantActionDefinition = {
  params: z.ZodType;
  roles: readonly AssistantRole[];
  confirmation: ConfirmationLevel;
};

const noParamsSchema = z.strictObject({});
const everyone = assistantRoleSchema.options;
const clinicians = ['attending', 'therapist'] as const;

export const assistantActions = {
  navigate: {
    params: z.object({ screenId: idSchema }),
    roles: everyone,
    confirmation: 'auto',
  },
  goBack: {
    params: noParamsSchema,
    roles: everyone,
    confirmation: 'auto',
  },
  repeatInstructions: {
    params: noParamsSchema,
    roles: ['patient'],
    confirmation: 'auto',
  },
  pauseSession: {
    params: noParamsSchema,
    roles: ['patient'],
    confirmation: 'auto',
  },
  cannotDo: {
    params: noParamsSchema,
    roles: ['patient'],
    confirmation: 'auto',
  },
  answerCheckIn: {
    params: checkInBodySchema,
    roles: ['patient'],
    confirmation: 'confirm',
  },
  logEpisode: {
    params: z.object({
      type: episodeTypeSchema,
      count: z.number().int().positive(),
      description: z.string().min(1).optional(),
    }),
    roles: ['patient'],
    confirmation: 'confirm',
  },
  openPatient: {
    params: z.object({ spokenName: z.string().min(1) }),
    roles: clinicians,
    confirmation: 'auto',
  },
  openMetric: {
    params: z.object({ metricId: metricIdSchema }),
    roles: clinicians,
    confirmation: 'auto',
  },
  askRecord: {
    params: z.object({ question: z.string().min(1) }),
    roles: clinicians,
    confirmation: 'auto',
  },
} as const satisfies Record<AssistantActionId, AssistantActionDefinition>;

export const runningActivityActionIds = [
  'repeatInstructions',
  'pauseSession',
  'cannotDo',
] as const satisfies readonly AssistantActionId[];

const actionCall = <Id extends AssistantActionId>(id: Id) =>
  z.object({ id: z.literal(id), params: assistantActions[id].params });

export const assistantActionCallSchema = z.discriminatedUnion('id', [
  actionCall('navigate'),
  actionCall('goBack'),
  actionCall('repeatInstructions'),
  actionCall('pauseSession'),
  actionCall('cannotDo'),
  actionCall('answerCheckIn'),
  actionCall('logEpisode'),
  actionCall('openPatient'),
  actionCall('openMetric'),
  actionCall('askRecord'),
]);

const turnContext = {
  language: languageSchema,
  screenId: idSchema,
  availableActionIds: z.array(assistantActionIdSchema),
};

export const assistantTextMaxLength = 500;

export const assistantTurnRequestSchema = z.union([
  z.strictObject({
    audio: z.object({
      mimeType: z.string().regex(/^audio\//),
      data: z.base64().min(1),
    }),
    ...turnContext,
  }),
  z.strictObject({
    text: z.string().trim().min(1).max(assistantTextMaxLength),
    ...turnContext,
  }),
]);

export const assistantTurnResponseSchema = z.object({
  turnId: idSchema,
  transcript: z.string(),
  reply: z.string().min(1),
  actions: z.array(assistantActionCallSchema),
  droppedActionIds: z.array(z.string()),
});

export const assistantViaHeader = 'x-tempo-via';

export const assistantDropReasonSchema = z.enum(['unregistered', 'role', 'unavailable', 'invalid-params']);

export const assistantDroppedActionSchema = z.object({
  id: z.string(),
  reason: assistantDropReasonSchema,
});

export const assistantTurnRecordSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  callerRole: assistantRoleSchema,
  callerId: idSchema,
  screenId: idSchema,
  language: languageSchema,
  input: z.enum(['audio', 'text']),
  transcript: z.string(),
  reply: z.string().min(1),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  inputRef: z.string().min(1),
  provider: aiProviderNameSchema,
  keptActions: z.array(assistantActionCallSchema),
  droppedActions: z.array(assistantDroppedActionSchema),
  createdAt: isoDateTimeSchema,
});

export type AssistantActionCall = z.infer<typeof assistantActionCallSchema>;
export type AssistantTurnRequest = z.infer<typeof assistantTurnRequestSchema>;
export type AssistantTurnResponse = z.infer<typeof assistantTurnResponseSchema>;
export type AssistantDropReason = z.infer<typeof assistantDropReasonSchema>;
export type AssistantDroppedAction = z.infer<typeof assistantDroppedActionSchema>;
export type AssistantTurnRecord = z.infer<typeof assistantTurnRecordSchema>;
