import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../store/memory.ts';
import { createPublicData, offlinePublicData } from './client.ts';
import icd10Fixture from './fixtures/icd10cm-parkin.json' with { type: 'json' };
import labelFixture from './fixtures/openfda-label-197444.json' with { type: 'json' };
import rxtermsFixture from './fixtures/rxterms-levod.json' with { type: 'json' };
import {
  ingredientTerms,
  labelUrlByName,
  labelUrlByRxcui,
  parseIcd10,
  parseOpenFdaLabel,
  parseRxterms,
} from './sources.ts';

const hourMs = 3_600_000;
const start = new Date('2026-11-13T12:00:00.000Z');
const levodopa = { name: 'Levodopa/Carbidopa', rxnormId: '197444' };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const timeout = (): Promise<Response> =>
  Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));

type Answer = (url: string) => Promise<Response>;

const setup = (answer: Answer) => {
  let now = start;
  const calls: { url: string; signal: AbortSignal | null | undefined }[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, signal: init?.signal });
    return answer(url);
  });
  const cache = createMemoryStore();
  const client = createPublicData({ fetch, clock: () => now, cache });
  return {
    client,
    cache,
    calls,
    later: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const byHost: Answer = async (url) => {
  if (url.includes('/rxterms/')) return json(rxtermsFixture);
  if (url.includes('/icd10cm/')) return json(icd10Fixture);
  return json(labelFixture);
};

describe('parsing real responses', () => {
  it('turns an RxTerms answer into one option per strength with its rxcui, at most ten', () => {
    const items = parseRxterms(rxtermsFixture);
    expect(items).toHaveLength(10);
    expect(items.slice(0, 3)).toEqual([
      { name: 'Carbidopa/Levodopa (Oral Pill) 10-100 mg Tab', rxnormId: '197443' },
      { name: 'Carbidopa/Levodopa (Oral Pill) 25-100 mg Tab', rxnormId: '197444' },
      { name: 'Carbidopa/Levodopa (Oral Pill) 25-250 mg Tab', rxnormId: '197445' },
    ]);
    expect(parseRxterms([0, [], {}, []])).toEqual([]);
  });

  it('turns an ICD-10-CM answer into codes that pass the diagnosis schema', () => {
    const items = parseIcd10(icd10Fixture);
    expect(items).toHaveLength(10);
    expect(items[0]).toEqual({
      code: 'G20.A1',
      label: "Parkinson's disease without dyskinesia, without mention of fluctuations",
    });
    expect(parseIcd10([0, [], null, []])).toEqual([]);
  });

  it('reads adverse reactions, warnings and a source link from an openFDA label', () => {
    const label = parseOpenFdaLabel(labelFixture);
    expect(label).toMatchObject({
      name: 'CARBIDOPA AND LEVODOPA',
      setId: '0215da3f-13a0-400d-ac2d-20c839bd89ef',
      sourceUrl: 'https://api.fda.gov/drug/label.json?search=set_id:0215da3f-13a0-400d-ac2d-20c839bd89ef',
    });
    expect(label.adverseReactions).toContain('confusion');
    expect(label.warnings).toContain('dyskinesias');
  });

  it('searches labels by rxcui first and by ingredient names otherwise', () => {
    expect(ingredientTerms('Levodopa/Carbidopa')).toEqual(['levodopa', 'carbidopa']);
    expect(ingredientTerms('Carbidopa/Levodopa (Oral Pill) 25-100 mg Tab')).toEqual(['carbidopa', 'levodopa']);
    expect(ingredientTerms('carbidopa and levodopa')).toEqual(['carbidopa', 'levodopa']);
    expect(ingredientTerms('Carbidopa/Levodopa XR (Oral Pill) 25-100 mg XR Tab')).toEqual(['carbidopa', 'levodopa']);
    expect(ingredientTerms('Valproic Acid')).toEqual(['valproic acid']);
    expect(labelUrlByRxcui('197444')).toBe(
      'https://api.fda.gov/drug/label.json?search=openfda.rxcui:"197444"+AND+_exists_:adverse_reactions&limit=1',
    );
    expect(labelUrlByRxcui('19 OR x')).toBeUndefined();
    expect(labelUrlByName('Levodopa/Carbidopa')).toBe(
      'https://api.fda.gov/drug/label.json?search=openfda.generic_name:"levodopa"+AND+openfda.generic_name:"carbidopa"+AND+_exists_:adverse_reactions&limit=1',
    );
  });
});

describe('medication lookup', () => {
  it('calls RxTerms with a timeout, caches the answer and serves the cache while it is fresh', async () => {
    const { client, cache, calls, later } = setup(byHost);
    const live = await client.searchMedications('  Levod ');
    expect(live.source).toBe('live');
    expect(live.items[1]).toEqual({ name: 'Carbidopa/Levodopa (Oral Pill) 25-100 mg Tab', rxnormId: '197444' });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]?.url ?? '').searchParams.get('terms')).toBe('levod');
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(await cache.getPublicData('rxnorm', 'levod')).toMatchObject({
      fetchedAt: start.toISOString(),
      keepUntil: '2026-12-13T12:00:00.000Z',
    });

    later(23 * hourMs);
    expect(await client.searchMedications('LEVOD')).toEqual({ items: live.items, source: 'cache' });
    expect(calls).toHaveLength(1);
  });

  it('serves the stale cache when RxTerms times out after the entry is a day old', async () => {
    let up = true;
    const { client, calls, later } = setup((url) => (up ? byHost(url) : timeout()));
    const live = await client.searchMedications('levod');
    up = false;
    later(25 * hourMs);
    expect(await client.searchMedications('levod')).toEqual({ items: live.items, source: 'cache' });
    expect(calls).toHaveLength(2);
  });

  it('refreshes a stale entry when RxTerms answers again', async () => {
    const { client, cache, later } = setup(byHost);
    await client.searchMedications('levod');
    later(25 * hourMs);
    expect((await client.searchMedications('levod')).source).toBe('live');
    expect((await cache.getPublicData('rxnorm', 'levod'))?.fetchedAt).toBe(new Date(start.getTime() + 25 * hourMs).toISOString());
  });

  it('falls back to the bundled list without a cache, and to an empty list when nothing matches', async () => {
    const { client } = setup(timeout);
    const fallback = await client.searchMedications('levodopa');
    expect(fallback.source).toBe('fallback');
    expect(fallback.items).toContainEqual({ name: 'Carbidopa/Levodopa (Oral Pill) 25-100 mg Tab', rxnormId: '197444' });
    expect(await client.searchMedications('zzzz')).toEqual({ items: [], source: 'fallback' });
  });

  it('treats an error status or an unexpected body as an outage', async () => {
    const failing = setup(async () => json({ error: 'busy' }, 503));
    expect((await failing.client.searchMedications('clopidogrel')).source).toBe('fallback');
    const odd = setup(async () => json({ unexpected: true }));
    expect(await odd.client.searchMedications('clopidogrel')).toMatchObject({ source: 'fallback' });
    expect((await odd.client.searchMedications('clopidogrel')).items[0]?.rxnormId).toBe('309362');
  });

  it('keeps answering when the cache itself fails', async () => {
    const client = createPublicData({
      fetch: async () => json(rxtermsFixture),
      clock: () => start,
      cache: {
        getPublicData: async () => {
          throw new Error('table unavailable');
        },
        putPublicData: async () => {
          throw new Error('table unavailable');
        },
      },
    });
    expect((await client.searchMedications('levod')).source).toBe('live');
  });
});

describe('diagnosis lookup', () => {
  it('calls ICD-10-CM, then the cache, then the stale cache in an outage', async () => {
    let up = true;
    const { client, calls, later } = setup((url) => (up ? byHost(url) : timeout()));
    const live = await client.searchDiagnoses('parkin');
    expect(live.source).toBe('live');
    expect(live.items[0]?.code).toBe('G20.A1');
    expect(new URL(calls[0]?.url ?? '').searchParams.get('sf')).toBe('code,name');
    expect((await client.searchDiagnoses('parkin')).source).toBe('cache');
    expect(calls).toHaveLength(1);
    up = false;
    later(25 * hourMs);
    expect(await client.searchDiagnoses('parkin')).toEqual({ items: live.items, source: 'cache' });
  });

  it('falls back to the bundled codes the demo patients use', async () => {
    const { client } = setup(timeout);
    for (const [query, code] of [['G20', 'G20'], ['I63', 'I63.9'], ['S83.511', 'S83.511A'], ['cruciate', 'S83.511A']]) {
      const result = await client.searchDiagnoses(query ?? '');
      expect(result.source).toBe('fallback');
      expect(result.items.map((item) => item.code)).toContain(code);
    }
    expect(await client.searchDiagnoses('qqqq')).toEqual({ items: [], source: 'fallback' });
  });
});

describe('drug label', () => {
  it('finds the label by rxcui and keeps it fresh for a week', async () => {
    const { client, calls, later } = setup(byHost);
    const live = await client.drugLabel(levodopa);
    expect(live.source).toBe('live');
    expect(live.label?.name).toBe('CARBIDOPA AND LEVODOPA');
    expect(calls.map((call) => call.url)).toEqual([labelUrlByRxcui('197444')]);
    later(6 * 24 * hourMs);
    expect((await client.drugLabel(levodopa)).source).toBe('cache');
    expect(calls).toHaveLength(1);
  });

  it('searches by ingredient name when the rxcui finds nothing', async () => {
    const { client, calls } = setup(async (url) =>
      url.includes('openfda.rxcui') ? json({ error: { code: 'NOT_FOUND' } }, 404) : json(labelFixture),
    );
    const result = await client.drugLabel({ name: 'Levodopa/Carbidopa', rxnormId: '1600773' });
    expect(result).toMatchObject({ source: 'live', label: { name: 'CARBIDOPA AND LEVODOPA' } });
    expect(calls.map((call) => call.url)).toEqual([labelUrlByRxcui('1600773'), labelUrlByName('Levodopa/Carbidopa')]);
  });

  it('answers with no label when openFDA has none, and remembers that', async () => {
    const { client, calls } = setup(async () => json({ error: { code: 'NOT_FOUND' } }, 404));
    expect(await client.drugLabel({ name: 'Unknownium' })).toEqual({ label: undefined, source: 'live' });
    expect(await client.drugLabel({ name: 'Unknownium' })).toEqual({ label: undefined, source: 'cache' });
    expect(calls).toHaveLength(1);
  });

  it('serves the stale label, then the bundled label, then nothing during an outage', async () => {
    let up = true;
    const stale = setup((url) => (up ? byHost(url) : timeout()));
    const live = await stale.client.drugLabel(levodopa);
    up = false;
    stale.later(8 * 24 * hourMs);
    expect(await stale.client.drugLabel(levodopa)).toEqual({ label: live.label, source: 'cache' });

    const { client } = setup(timeout);
    const bundled = await client.drugLabel(levodopa);
    expect(bundled.source).toBe('fallback');
    expect(bundled.label?.adverseReactions).toContain('confusion');
    expect((await client.drugLabel({ name: 'Clopidogrel', rxnormId: '309362' })).label?.name).toBe('CLOPIDOGREL BISULFATE');
    expect((await client.drugLabel({ name: 'Atorvastatin' })).label?.name).toBe('ATORVASTATIN CALCIUM');
    expect(await client.drugLabel({ name: 'Unknownium' })).toEqual({ label: undefined, source: 'fallback' });
  });
});

describe('offline client used by the mock API', () => {
  it('answers from the bundled data in the same shapes', async () => {
    expect((await offlinePublicData.searchMedications('levodopa')).source).toBe('fallback');
    expect((await offlinePublicData.searchDiagnoses('G20')).items[0]).toEqual({ code: 'G20', label: "Parkinson's disease" });
    expect((await offlinePublicData.drugLabel(levodopa)).label?.name).toBe('CARBIDOPA AND LEVODOPA');
  });
});
