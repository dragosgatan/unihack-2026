import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, uploadRecordingRequestSchema, type SubmittedResult, type WordRecallPart } from '@tempo/shared';
import { finishRunner, saveRecording, syncOutbox, type OutboxEntry } from './store.ts';

type Rows = Map<IDBValidKey, unknown>;
const stores = new Map<string, { keyPath?: string; rows: Rows }>();

const later = (run: () => void) => setTimeout(run, 0);

function request<T>(produce: () => T) {
  const req: { result?: T; onsuccess?: () => void; onerror?: () => void } = {};
  later(() => {
    req.result = produce();
    req.onsuccess?.();
  });
  return req;
}

const keyOf = (value: unknown, keyPath: string) =>
  keyPath.split('.').reduce<unknown>((at, part) => (at as Record<string, unknown>)[part], value) as IDBValidKey;

const fakeDatabase = {
  createObjectStore: (name: string, options?: { keyPath: string }) => stores.set(name, { keyPath: options?.keyPath, rows: new Map() }),
  transaction: () => {
    const tx: { oncomplete?: () => void; objectStore: (name: string) => unknown } = {
      objectStore: (name) => {
        const store = stores.get(name);
        if (!store) throw new Error(`No store ${name}`);
        return {
          get: (key: IDBValidKey) => request(() => store.rows.get(key)),
          getAll: () => request(() => [...store.rows.values()]),
          getAllKeys: () => request(() => [...store.rows.keys()]),
          put: (value: unknown, key?: IDBValidKey) => store.rows.set(key ?? keyOf(value, store.keyPath ?? ''), value),
          delete: (key: IDBValidKey) => store.rows.delete(key),
        };
      },
    };
    later(() => later(() => tx.oncomplete?.()));
    return tx;
  },
};

const fakeIndexedDB = {
  open: () => {
    const req: { result?: unknown; onupgradeneeded?: (event: { oldVersion: number }) => void; onsuccess?: () => void } = {};
    later(() => {
      req.result = fakeDatabase;
      req.onupgradeneeded?.({ oldVersion: 0 });
      req.onsuccess?.();
    });
    return req;
  },
};

const at = '2026-11-14T10:00:00.000Z';
const words = ['apple', 'river', 'table', 'chair', 'garden'];

const wordRecall = (part: WordRecallPart, id: string): SubmittedResult => ({
  status: 'completed',
  completedAt: at,
  raw: {
    activityId: 'word-recall',
    data: { part, language: 'en', words, presentedAt: at, recording: { id, mimeType: 'audio/mp4', durationMs: 4000, bytes: 5 } },
  },
});

const entry: OutboxEntry = {
  sessionId: 'sess-1',
  token: 'device-token',
  body: { partial: false, results: [wordRecall('immediate', 'rec-1'), wordRecall('delayed', 'rec-2')] },
};

const uploadPath = routes.uploadRecording.path.replace(':sessionId', 'sess-1');
const submitPath = routes.submitSession.path.replace(':sessionId', 'sess-1');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const fetchMock = vi.fn((url: string, init: RequestInit) => {
  if (url === uploadPath) return Promise.resolve(json({ id: uploadRecordingRequestSchema.parse(JSON.parse(String(init.body))).id }));
  return Promise.resolve(json({ sessionId: 'sess-1', status: 'submitted' }));
});

const calledPaths = () => fetchMock.mock.calls.map(([url]) => url);

beforeAll(() => {
  vi.stubGlobal('indexedDB', fakeIndexedDB);
  vi.stubGlobal('fetch', fetchMock);
});

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await finishRunner(entry);
  stores.get('outbox')?.rows.clear();
  stores.get('recordings')?.rows.clear();
  fetchMock.mockClear();
});

afterEach(() => vi.restoreAllMocks());

describe('syncOutbox', () => {
  it('uploads every recording with the device token before submitting', async () => {
    await saveRecording('rec-1', new Blob(['one'], { type: 'audio/mp4' }));
    await saveRecording('rec-2', new Blob(['two'], { type: 'audio/mp4' }));
    await finishRunner(entry);

    await syncOutbox();

    expect(calledPaths()).toEqual([uploadPath, uploadPath, submitPath]);
    const [first, second] = fetchMock.mock.calls.slice(0, 2).map(([, init]) => init);
    expect(JSON.parse(String(first?.body))).toEqual({ id: 'rec-1', mimeType: 'audio/mp4', data: btoa('one') });
    expect(JSON.parse(String(second?.body))).toEqual({ id: 'rec-2', mimeType: 'audio/mp4', data: btoa('two') });
    expect(new Headers(first?.headers).get('authorization')).toBe('Bearer device-token');
  });

  it('keeps the session and its recordings when an upload fails', async () => {
    await saveRecording('rec-1', new Blob(['one'], { type: 'audio/mp4' }));
    await finishRunner(entry);
    fetchMock.mockImplementationOnce(() => Promise.resolve(json({ error: { code: 'internal', message: 'down' } }, 503)));

    await syncOutbox();

    expect(calledPaths()).toEqual([uploadPath]);
    expect(stores.get('outbox')?.rows.has('sess-1')).toBe(true);
    expect(stores.get('recordings')?.rows.has('rec-1')).toBe(true);
  });

  it('submits when a recording is missing or empty', async () => {
    await saveRecording('rec-1', new Blob([], { type: 'audio/mp4' }));
    await finishRunner(entry);

    await syncOutbox();

    expect(calledPaths()).toEqual([submitPath]);
    expect(stores.get('outbox')?.rows.size).toBe(0);
  });

  it('deletes the session recordings and leftover ones after the submit succeeds', async () => {
    await saveRecording('rec-1', new Blob(['one'], { type: 'audio/mp4' }));
    await saveRecording('rec-2', new Blob(['two'], { type: 'audio/mp4' }));
    await saveRecording('rec-skipped', new Blob(['left'], { type: 'audio/mp4' }));
    await finishRunner(entry);

    await syncOutbox();

    expect(stores.get('outbox')?.rows.size).toBe(0);
    expect(stores.get('recordings')?.rows.size).toBe(0);
  });
});
