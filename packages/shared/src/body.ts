import { z } from 'zod';
import type { Language } from './common.ts';

export const bodyRegions = [
  'head-neck',
  'left-shoulder',
  'right-shoulder',
  'left-arm',
  'right-arm',
  'chest',
  'back',
  'left-hip',
  'right-hip',
  'left-knee',
  'right-knee',
  'left-foot',
  'right-foot',
] as const;

export const bodyRegionSchema = z.enum(bodyRegions);

export type BodyRegion = z.infer<typeof bodyRegionSchema>;

export const bodyRegionLabels = {
  en: {
    'head-neck': 'Head or neck',
    'left-shoulder': 'Left shoulder',
    'right-shoulder': 'Right shoulder',
    'left-arm': 'Left arm',
    'right-arm': 'Right arm',
    chest: 'Chest',
    back: 'Back',
    'left-hip': 'Left hip',
    'right-hip': 'Right hip',
    'left-knee': 'Left knee',
    'right-knee': 'Right knee',
    'left-foot': 'Left foot',
    'right-foot': 'Right foot',
  },
  ro: {
    'head-neck': 'Cap sau gât',
    'left-shoulder': 'Umărul stâng',
    'right-shoulder': 'Umărul drept',
    'left-arm': 'Brațul stâng',
    'right-arm': 'Brațul drept',
    chest: 'Piept',
    back: 'Spate',
    'left-hip': 'Șoldul stâng',
    'right-hip': 'Șoldul drept',
    'left-knee': 'Genunchiul stâng',
    'right-knee': 'Genunchiul drept',
    'left-foot': 'Piciorul stâng',
    'right-foot': 'Piciorul drept',
  },
} as const satisfies Record<Language, Record<BodyRegion, string>>;

export const bodyRegionLabel = (location: string, language: Language): string => {
  const region = bodyRegionSchema.safeParse(location);
  return region.success ? bodyRegionLabels[language][region.data] : location;
};
