import { z } from 'zod';
import { idSchema, isoDateSchema, isoDateTimeSchema, profileSchema, roleSchema } from './common.ts';

export const institutionSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  timezone: z.string().min(1),
});

export const staffSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  role: roleSchema,
  name: z.string().min(1),
  email: z.email(),
});

export const sexSchema = z.enum(['female', 'male', 'other']);

export const patientSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  institutionPatientId: z.string().min(1),
  name: z.string().min(1),
  dateOfBirth: isoDateSchema,
  sex: sexSchema,
  profile: profileSchema,
  attendingId: idSchema,
  therapistIds: z.array(idSchema),
  createdAt: isoDateTimeSchema,
  reminderEmail: z.email().optional(),
});

export const auditEntityTypeSchema = z.enum([
  'institution',
  'staff',
  'patient',
  'medical-record',
  'session-plan',
  'session',
  'activity-result',
  'check-in-entry',
  'episode',
  'suggestion',
  'course-of-care',
  'baseline',
  'pairing-code',
  'device',
]);

export const auditEntrySchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  actorId: idSchema,
  actorRole: roleSchema,
  action: z.enum(['read', 'create', 'update', 'delete']),
  entityType: auditEntityTypeSchema,
  entityId: idSchema,
  patientId: idSchema.optional(),
  at: isoDateTimeSchema,
  via: z.literal('assistant').optional(),
});

export const pairedDeviceSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  label: z.string().min(1).max(100).optional(),
  pairedAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.optional(),
  revokedBy: idSchema.optional(),
});

export type Institution = z.infer<typeof institutionSchema>;
export type Staff = z.infer<typeof staffSchema>;
export type Sex = z.infer<typeof sexSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type AuditEntityType = z.infer<typeof auditEntityTypeSchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type PairedDevice = z.infer<typeof pairedDeviceSchema>;
