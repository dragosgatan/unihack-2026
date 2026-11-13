import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.ts';

export const episodeTypeSchema = z.enum(['fall', 'dizziness', 'seizure', 'freezing', 'confusion', 'spasm']);

export const episodeSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  type: episodeTypeSchema,
  count: z.number().int().positive(),
  occurredAt: isoDateTimeSchema,
  windowStart: isoDateTimeSchema.optional(),
  description: z.string().min(1).optional(),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
  source: z.enum(['check-in', 'home', 'staff']),
});

export const painTypeSchema = z.enum(['ache', 'sharp', 'burning', 'phantom-limb']);

export const painCheckInSchema = z.object({
  item: z.literal('pain'),
  intensity: z.number().int().min(0).max(10),
  location: z.string().min(1).optional(),
  type: painTypeSchema.optional(),
});

export const medicationStatusSchema = z.enum(['taken', 'missed', 'stopped']);

export const medicationCheckInSchema = z.object({
  item: z.literal('medication'),
  medications: z.array(
    z.object({
      medicationId: idSchema,
      name: z.string().min(1),
      status: medicationStatusSchema,
      sideEffects: z.string().min(1).optional(),
    }),
  ),
});

export const episodesCheckInSchema = z.object({
  item: z.literal('episodes'),
  episodes: z.array(
    z.object({
      type: episodeTypeSchema,
      count: z.number().int().nonnegative(),
      description: z.string().min(1).optional(),
    }),
  ),
});

export const checkInBodySchema = z.discriminatedUnion('item', [
  painCheckInSchema,
  medicationCheckInSchema,
  episodesCheckInSchema,
]);

export const recordedBySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('patient') }),
  z.object({ kind: z.literal('staff'), staffId: idSchema }),
]);

export const checkInEntrySchema = z.object({
  id: idSchema,
  patientId: idSchema,
  sessionId: idSchema.optional(),
  recordedAt: isoDateTimeSchema,
  recordedBy: recordedBySchema,
  body: checkInBodySchema,
});

export type EpisodeType = z.infer<typeof episodeTypeSchema>;
export type Episode = z.infer<typeof episodeSchema>;
export type PainType = z.infer<typeof painTypeSchema>;
export type PainCheckIn = z.infer<typeof painCheckInSchema>;
export type MedicationStatus = z.infer<typeof medicationStatusSchema>;
export type MedicationCheckIn = z.infer<typeof medicationCheckInSchema>;
export type EpisodesCheckIn = z.infer<typeof episodesCheckInSchema>;
export type CheckInBody = z.infer<typeof checkInBodySchema>;
export type RecordedBy = z.infer<typeof recordedBySchema>;
export type CheckInEntry = z.infer<typeof checkInEntrySchema>;
