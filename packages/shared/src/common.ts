import { z } from 'zod';

export const idSchema = z.string().min(1);
export const isoDateTimeSchema = z.iso.datetime();
export const isoDateSchema = z.iso.date();

export const languageSchema = z.enum(['en', 'ro']);
export const sideSchema = z.enum(['left', 'right']);
export const roleSchema = z.enum(['admin', 'attending', 'therapist']);
export const profileSchema = z.enum(['neurological', 'limb-loss', 'sports', 'concussion']);

export type Id = z.infer<typeof idSchema>;
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;
export type IsoDate = z.infer<typeof isoDateSchema>;
export type Language = z.infer<typeof languageSchema>;
export type Side = z.infer<typeof sideSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Profile = z.infer<typeof profileSchema>;
