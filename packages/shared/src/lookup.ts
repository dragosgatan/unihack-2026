import { z } from 'zod';
import { diagnosisSchema, medicationSchema } from './record.ts';

export const lookupItemLimit = 10;

export const publicDataSourceSchema = z.enum(['live', 'cache', 'fallback']);

export const lookupQuerySchema = z.object({ q: z.string().trim().min(2).max(80) });

export const medicationOptionSchema = z.object({
  name: medicationSchema.shape.name,
  rxnormId: z.string().min(1),
});

export const diagnosisOptionSchema = diagnosisSchema;

export const medicationLookupResponseSchema = z.object({
  items: z.array(medicationOptionSchema).max(lookupItemLimit),
  source: publicDataSourceSchema,
});

export const diagnosisLookupResponseSchema = z.object({
  items: z.array(diagnosisOptionSchema).max(lookupItemLimit),
  source: publicDataSourceSchema,
});

export type PublicDataSource = z.infer<typeof publicDataSourceSchema>;
export type LookupQuery = z.infer<typeof lookupQuerySchema>;
export type MedicationOption = z.infer<typeof medicationOptionSchema>;
export type DiagnosisOption = z.infer<typeof diagnosisOptionSchema>;
export type MedicationLookupResponse = z.infer<typeof medicationLookupResponseSchema>;
export type DiagnosisLookupResponse = z.infer<typeof diagnosisLookupResponseSchema>;
