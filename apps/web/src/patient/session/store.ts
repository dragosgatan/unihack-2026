import { z } from 'zod';
import { idSchema, routes, submitSessionRequestSchema } from '@tempo/shared';
import { runnerStateSchema, type RunnerState } from './runner.ts';

const outboxEntrySchema = z.object({
  sessionId: idSchema,
  token: z.string().min(1),
  body: submitSessionRequestSchema,
});

export type OutboxEntry = z.infer<typeof outboxEntrySchema>;

const currentKey = 'current';
let opening: Promise<IDBDatabase> | undefined;

const database = () =>
  (opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('tempo-patient', 2);
    request.onupgradeneeded = ({ oldVersion }) => {
      if (oldVersion < 1) {
        request.result.createObjectStore('runner');
        request.result.createObjectStore('outbox', { keyPath: 'sessionId' });
      }
      request.result.createObjectStore('recordings');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));

const requestDone = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

export async function loadRunner(): Promise<RunnerState | undefined> {
  const stored: unknown = await requestDone((await database()).transaction('runner').objectStore('runner').get(currentKey));
  const parsed = runnerStateSchema.safeParse(stored);
  return parsed.success ? parsed.data : undefined;
}

export async function saveRunner(state: RunnerState) {
  const tx = (await database()).transaction('runner', 'readwrite');
  tx.objectStore('runner').put(state, currentKey);
  await transactionDone(tx);
}

// shortcut: recordings stay on the device until an audio upload route exists; sync must upload and then delete them.
export async function saveRecording(id: string, audio: Blob) {
  const tx = (await database()).transaction('recordings', 'readwrite');
  tx.objectStore('recordings').put(audio, id);
  await transactionDone(tx);
}

export async function finishRunner(entry: OutboxEntry) {
  const tx = (await database()).transaction(['runner', 'outbox'], 'readwrite');
  tx.objectStore('outbox').put(entry);
  tx.objectStore('runner').delete(currentKey);
  await transactionDone(tx);
}

async function send(entry: OutboxEntry) {
  const path = routes.submitSession.path.replace(':sessionId', encodeURIComponent(entry.sessionId));
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${entry.token}` },
    body: JSON.stringify(entry.body),
  });
  if (!res.ok) throw new Error(`Submit of ${entry.sessionId} failed with ${res.status}`);
  routes.submitSession.response.parse(await res.json());
}

export async function syncOutbox() {
  const stored: unknown[] = await requestDone((await database()).transaction('outbox').objectStore('outbox').getAll());
  for (const item of stored) {
    const parsed = outboxEntrySchema.safeParse(item);
    if (!parsed.success) {
      console.error('Unreadable outbox entry kept', parsed.error);
      continue;
    }
    try {
      await send(parsed.data);
      const tx = (await database()).transaction('outbox', 'readwrite');
      tx.objectStore('outbox').delete(parsed.data.sessionId);
      await transactionDone(tx);
    } catch (error) {
      console.error(error);
    }
  }
}
