import { z } from 'zod';
import { diagnosisSchema, lookupItemLimit, type DiagnosisOption, type MedicationOption } from '@tempo/shared';

export const drugLabelSchema = z.object({
  name: z.string().min(1),
  setId: z.string().min(1),
  effectiveTime: z.string().optional(),
  adverseReactions: z.string(),
  warnings: z.string(),
  sourceUrl: z.url(),
});

export type DrugLabel = z.infer<typeof drugLabelSchema>;

export type MedicationRef = { name: string; rxnormId?: string };

const clinicalTables = 'https://clinicaltables.nlm.nih.gov/api';
const openFdaLabels = 'https://api.fda.gov/drug/label.json';

const tidy = (text: string): string => text.trim().replace(/\s+/g, ' ');

export const normaliseQuery = (query: string): string => tidy(query).toLowerCase();

export const rxtermsUrl = (query: string): string =>
  `${clinicalTables}/rxterms/v3/search?${new URLSearchParams({
    terms: query,
    ef: 'RXCUIS,STRENGTHS_AND_FORMS',
    maxList: String(lookupItemLimit),
  })}`;

const rxtermsResponseSchema = z
  .tuple([
    z.number(),
    z.array(z.string()),
    z
      .object({
        RXCUIS: z.array(z.array(z.string())).optional(),
        STRENGTHS_AND_FORMS: z.array(z.array(z.string())).optional(),
      })
      .nullable(),
  ])
  .rest(z.unknown());

export const parseRxterms = (body: unknown): MedicationOption[] => {
  const [, names, extra] = rxtermsResponseSchema.parse(body);
  return names
    .flatMap((name, index) => {
      const strengths = extra?.STRENGTHS_AND_FORMS?.[index] ?? [];
      return (extra?.RXCUIS?.[index] ?? []).map((rxnormId, strength) => ({
        name: tidy(`${name} ${strengths[strength] ?? ''}`),
        rxnormId,
      }));
    })
    .slice(0, lookupItemLimit);
};

export const icd10Url = (query: string): string =>
  `${clinicalTables}/icd10cm/v3/search?${new URLSearchParams({
    sf: 'code,name',
    terms: query,
    maxList: String(lookupItemLimit),
  })}`;

const icd10ResponseSchema = z
  .tuple([z.number(), z.array(z.string()), z.unknown(), z.array(z.tuple([z.string(), z.string()])).nullable()])
  .rest(z.unknown());

export const parseIcd10 = (body: unknown): DiagnosisOption[] => {
  const [, , , display] = icd10ResponseSchema.parse(body);
  return (display ?? [])
    .flatMap(([code, label]) => {
      const parsed = diagnosisSchema.safeParse({ code, label });
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, lookupItemLimit);
};

export const ingredientTerms = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\d.*$/, ' ')
    .replace(/\b(xr|er|cr|sr|dr|xl|la|ec|odt)\b/g, ' ')
    .split(/\/|\+|,|\band\b/)
    .map((term) => tidy(term.replace(/[^a-z -]/g, ' ')))
    .filter((term) => term.length >= 3);

const withAdverseReactions = '+AND+_exists_:adverse_reactions&limit=1';

export const labelUrlByRxcui = (rxcui: string): string | undefined =>
  /^\d+$/.test(rxcui) ? `${openFdaLabels}?search=openfda.rxcui:"${rxcui}"${withAdverseReactions}` : undefined;

export const labelUrlByName = (name: string): string | undefined => {
  const terms = ingredientTerms(name);
  if (terms.length === 0) return undefined;
  const search = terms.map((term) => `openfda.generic_name:"${term.replace(/ /g, '+')}"`).join('+AND+');
  return `${openFdaLabels}?search=${search}${withAdverseReactions}`;
};

const openFdaResponseSchema = z.object({
  results: z
    .array(
      z.object({
        set_id: z.string().min(1),
        effective_time: z.string().optional(),
        adverse_reactions: z.array(z.string()).optional(),
        boxed_warning: z.array(z.string()).optional(),
        warnings_and_cautions: z.array(z.string()).optional(),
        warnings: z.array(z.string()).optional(),
        openfda: z.object({ generic_name: z.array(z.string()).optional() }).optional(),
      }),
    )
    .min(1),
});

export const parseOpenFdaLabel = (body: unknown): DrugLabel => {
  const { results } = openFdaResponseSchema.parse(body);
  const [result] = results;
  if (!result) throw new Error('openFDA returned no label');
  return {
    name: result.openfda?.generic_name?.[0] ?? result.set_id,
    setId: result.set_id,
    ...(result.effective_time === undefined ? {} : { effectiveTime: result.effective_time }),
    adverseReactions: (result.adverse_reactions ?? []).join('\n'),
    warnings: [...(result.boxed_warning ?? []), ...(result.warnings_and_cautions ?? []), ...(result.warnings ?? [])].join(
      '\n',
    ),
    sourceUrl: `${openFdaLabels}?search=set_id:${result.set_id}`,
  };
};
