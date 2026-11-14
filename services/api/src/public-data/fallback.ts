import { z } from 'zod';
import {
  diagnosisOptionSchema,
  lookupItemLimit,
  medicationOptionSchema,
  type DiagnosisOption,
  type MedicationOption,
} from '@tempo/shared';
import diagnosesData from './fallback-diagnoses.json' with { type: 'json' };
import labelsData from './fallback-labels.json' with { type: 'json' };
import medicationsData from './fallback-medications.json' with { type: 'json' };
import { drugLabelSchema, ingredientTerms, normaliseQuery, type DrugLabel, type MedicationRef } from './sources.ts';

const bundledLabelSchema = z.object({
  rxnormIds: z.array(z.string()),
  genericNames: z.array(z.string()),
  label: drugLabelSchema,
});

const medications = medicationOptionSchema.array().parse(medicationsData);
const diagnoses = diagnosisOptionSchema.array().parse(diagnosesData);
const labels = bundledLabelSchema.array().parse(labelsData);

export const fallbackMedications = (query: string): MedicationOption[] => {
  const wanted = normaliseQuery(query);
  return medications.filter((option) => option.name.toLowerCase().includes(wanted)).slice(0, lookupItemLimit);
};

export const fallbackDiagnoses = (query: string): DiagnosisOption[] => {
  const wanted = normaliseQuery(query);
  return diagnoses
    .filter((option) => option.code.toLowerCase().startsWith(wanted) || option.label.toLowerCase().includes(wanted))
    .slice(0, lookupItemLimit);
};

export const fallbackLabel = ({ name, rxnormId }: MedicationRef): DrugLabel | undefined => {
  const terms = ingredientTerms(name);
  const byName = (genericNames: string[]): boolean =>
    terms.length > 0 && terms.every((term) => genericNames.some((generic) => generic.includes(term)));
  return labels.find(
    (entry) => (rxnormId !== undefined && entry.rxnormIds.includes(rxnormId)) || byName(entry.genericNames),
  )?.label;
};
