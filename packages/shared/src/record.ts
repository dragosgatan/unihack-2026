import { z } from 'zod';
import { idSchema, isoDateSchema, isoDateTimeSchema, sideSchema } from './common.ts';

export const timelineEventSchema = z.object({
  id: idSchema,
  t: isoDateTimeSchema,
  type: z.enum([
    'medication-change',
    'surgery',
    'fall',
    'milestone',
    'plan-change',
    'baseline-reset',
    'phase-change',
    'other',
  ]),
  label: z.string().min(1),
});

export const affectedLimbSchema = z.object({
  limb: z.enum(['arm', 'hand', 'leg', 'foot']),
  side: sideSchema,
  prosthesis: z.boolean(),
});

export const rehabPhaseTargetSchema = z.object({ label: z.string().min(1), met: z.boolean() });

export const completedRehabPhaseSchema = z.object({
  name: z.string().min(1),
  enteredAt: isoDateSchema,
  completedAt: isoDateSchema,
  targets: z.array(rehabPhaseTargetSchema),
  decidedBy: idSchema,
});

export const injurySchema = z.object({
  structure: z.string().min(1),
  side: sideSchema,
  dateOfInjury: isoDateSchema,
  surgery: z.object({ date: isoDateSchema, type: z.string().min(1) }).optional(),
  sport: z
    .object({
      name: z.string().min(1),
      level: z.enum(['recreational', 'competitive', 'professional']),
    })
    .optional(),
  rehabPhase: z
    .object({
      name: z.string().min(1),
      enteredAt: isoDateSchema,
      targets: z.array(rehabPhaseTargetSchema),
    })
    .optional(),
  phaseHistory: z.array(completedRehabPhaseSchema),
});

export const diagnosisSchema = z.object({
  code: z.string().regex(/^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/),
  label: z.string().min(1),
});

export const medicationSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  rxnormId: z.string().min(1).optional(),
  dose: z.string().min(1),
  frequency: z.string().min(1),
  startDate: isoDateSchema,
  stopDate: isoDateSchema.optional(),
});

export const limitationSchema = z.enum(['vision', 'hearing', 'speech']);

export const medicalRecordSchema = z.object({
  patientId: idSchema,
  yearsOfEducation: z.number().int().nonnegative(),
  dominantHand: sideSchema,
  affectedLimbs: z.array(affectedLimbSchema),
  injury: injurySchema.optional(),
  diagnoses: z.array(diagnosisSchema),
  medications: z.array(medicationSchema),
  limitations: z.array(limitationSchema),
  clinicalNotes: z.string(),
  rehabGoals: z.array(z.string().min(1)),
  timeline: z.array(timelineEventSchema),
  updatedAt: isoDateTimeSchema,
  updatedBy: idSchema,
});

export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type AffectedLimb = z.infer<typeof affectedLimbSchema>;
export type RehabPhaseTarget = z.infer<typeof rehabPhaseTargetSchema>;
export type CompletedRehabPhase = z.infer<typeof completedRehabPhaseSchema>;
export type Injury = z.infer<typeof injurySchema>;
export type Diagnosis = z.infer<typeof diagnosisSchema>;
export type Medication = z.infer<typeof medicationSchema>;
export type Limitation = z.infer<typeof limitationSchema>;
export type MedicalRecord = z.infer<typeof medicalRecordSchema>;
