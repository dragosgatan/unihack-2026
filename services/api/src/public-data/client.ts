import { z } from 'zod';
import {
  diagnosisOptionSchema,
  medicationOptionSchema,
  type DiagnosisOption,
  type MedicationOption,
  type PublicDataSource,
} from '@tempo/shared';
import type { PublicDataKind, Store } from '../store/types.ts';
import { fallbackDiagnoses, fallbackLabel, fallbackMedications } from './fallback.ts';
import {
  drugLabelSchema,
  icd10Url,
  labelUrlByName,
  labelUrlByRxcui,
  normaliseQuery,
  parseIcd10,
  parseOpenFdaLabel,
  parseRxterms,
  rxtermsUrl,
  type DrugLabel,
  type MedicationRef,
} from './sources.ts';

const hourMs = 3_600_000;
const dayMs = 24 * hourMs;
const timeoutMs = 3_000;
const keepMs = 30 * dayMs;
const freshMs: Record<PublicDataKind, number> = { rxnorm: dayMs, icd10: dayMs, 'openfda-label': 7 * dayMs };

export type PublicDataCache = Pick<Store, 'getPublicData' | 'putPublicData'>;

export type PublicDataOptions = { fetch: typeof fetch; clock: () => Date; cache: PublicDataCache };

export type Lookup<Item> = { items: Item[]; source: PublicDataSource };

export type LabelLookup = { label: DrugLabel | undefined; source: PublicDataSource };

export type PublicData = {
  searchMedications(query: string): Promise<Lookup<MedicationOption>>;
  searchDiagnoses(query: string): Promise<Lookup<DiagnosisOption>>;
  drugLabel(medication: MedicationRef): Promise<LabelLookup>;
};

const cachedLabelSchema = z.object({ label: drugLabelSchema.nullable() });

export const createPublicData = ({ fetch, clock, cache }: PublicDataOptions): PublicData => {
  const getJson = async (url: string): Promise<unknown> => {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response.json();
  };

  const readCache = async <Value>(kind: PublicDataKind, query: string, schema: z.ZodType<Value>) => {
    try {
      const entry = await cache.getPublicData(kind, query);
      const parsed = schema.safeParse(entry?.value);
      return entry && parsed.success ? { value: parsed.data, fetchedAt: Date.parse(entry.fetchedAt) } : undefined;
    } catch (error) {
      console.warn(`Public data cache read failed for ${kind}`, error);
      return undefined;
    }
  };

  const writeCache = async (kind: PublicDataKind, query: string, value: unknown, now: Date): Promise<void> => {
    try {
      await cache.putPublicData({
        kind,
        query,
        fetchedAt: now.toISOString(),
        keepUntil: new Date(now.getTime() + keepMs).toISOString(),
        value,
      });
    } catch (error) {
      console.warn(`Public data cache write failed for ${kind}`, error);
    }
  };

  const lookup = async <Value>(
    kind: PublicDataKind,
    query: string,
    schema: z.ZodType<Value>,
    live: () => Promise<Value>,
    fallback: () => Value,
  ): Promise<{ value: Value; source: PublicDataSource }> => {
    const now = clock();
    const cached = await readCache(kind, query, schema);
    if (cached && now.getTime() - cached.fetchedAt < freshMs[kind]) return { value: cached.value, source: 'cache' };
    try {
      const value = await live();
      await writeCache(kind, query, value, now);
      return { value, source: 'live' };
    } catch (error) {
      console.warn(`Public data ${kind} is unavailable`, error);
      return cached ? { value: cached.value, source: 'cache' } : { value: fallback(), source: 'fallback' };
    }
  };

  const liveLabel = async ({ name, rxnormId }: MedicationRef): Promise<DrugLabel | null> => {
    const urls = [rxnormId === undefined ? undefined : labelUrlByRxcui(rxnormId), labelUrlByName(name)];
    for (const url of urls) {
      const body = url === undefined ? undefined : await getJson(url);
      if (body !== undefined) return parseOpenFdaLabel(body);
    }
    return null;
  };

  return {
    searchMedications: async (query) => {
      const key = normaliseQuery(query);
      const { value, source } = await lookup(
        'rxnorm',
        key,
        medicationOptionSchema.array(),
        async () => parseRxterms(await getJson(rxtermsUrl(key))),
        () => fallbackMedications(key),
      );
      return { items: value, source };
    },

    searchDiagnoses: async (query) => {
      const key = normaliseQuery(query);
      const { value, source } = await lookup(
        'icd10',
        key,
        diagnosisOptionSchema.array(),
        async () => parseIcd10(await getJson(icd10Url(key))),
        () => fallbackDiagnoses(key),
      );
      return { items: value, source };
    },

    drugLabel: async (medication) => {
      const key = `${medication.rxnormId ?? '-'}|${normaliseQuery(medication.name)}`;
      const { value, source } = await lookup(
        'openfda-label',
        key,
        cachedLabelSchema,
        async () => ({ label: await liveLabel(medication) }),
        () => ({ label: fallbackLabel(medication) ?? null }),
      );
      return { label: value.label ?? undefined, source };
    },
  };
};

export const offlinePublicData: PublicData = {
  searchMedications: async (query) => ({ items: fallbackMedications(normaliseQuery(query)), source: 'fallback' }),
  searchDiagnoses: async (query) => ({ items: fallbackDiagnoses(normaliseQuery(query)), source: 'fallback' }),
  drugLabel: async (medication) => ({ label: fallbackLabel(medication), source: 'fallback' }),
};
