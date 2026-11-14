import { z } from 'zod';
import {
  episodeTypeSchema,
  idSchema,
  isoDateTimeSchema,
  recordingMaxBytes,
  routes,
  submitSessionRequestSchema,
  type UploadRecordingRequest,
  type WordRecallRecording,
} from '@tempo/shared';
import { runnerStateSchema, type RunnerState } from './runner.ts';

const outboxEntrySchema = z.object({
  sessionId: idSchema,
  token: z.string().min(1),
  body: submitSessionRequestSchema,
});

export type OutboxEntry = z.infer<typeof outboxEntrySchema>;

// shortcut: body of POST /api/device/episodes asked of C; move it to packages/shared when that route lands.
const episodeEntrySchema = z.object({
  token: z.string().min(1),
  body: z.object({
    id: idSchema,
    type: episodeTypeSchema,
    count: z.number().int().positive(),
    occurredAt: isoDateTimeSchema,
    description: z.string().min(1).optional(),
  }),
});

export type EpisodeEntry = z.infer<typeof episodeEntrySchema>;
const episodesPath = '/api/device/episodes';

const currentKey = 'current';
let opening: Promise<IDBDatabase> | undefined;

const database = () =>
  (opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('tempo-patient', 3);
    request.onupgradeneeded = ({ oldVersion }) => {
      if (oldVersion < 1) {
        request.result.createObjectStore('runner');
        request.result.createObjectStore('outbox', { keyPath: 'sessionId' });
      }
      if (oldVersion < 2) request.result.createObjectStore('recordings');
      if (oldVersion < 3) request.result.createObjectStore('episodes', { keyPath: 'body.id' });
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

export async function redeemSessionCode(code: string) {
  const res = await fetch(routes.redeemSessionCode.path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`Session code rejected with ${res.status}`);
  return routes.redeemSessionCode.response.parse(await res.json());
}

const sessionPath = (path: string, sessionId: string) => path.replace(':sessionId', encodeURIComponent(sessionId));

const recordingsOf = (entry: OutboxEntry): WordRecallRecording[] =>
  entry.body.results.flatMap((result) =>
    result.status === 'completed' && result.raw.activityId === 'word-recall' ? [result.raw.data.recording] : [],
  );

const base64 = (audio: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(audio);
  });

async function upload(entry: OutboxEntry, recording: WordRecallRecording) {
  const audio: unknown = await requestDone((await database()).transaction('recordings').objectStore('recordings').get(recording.id));
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > recordingMaxBytes) return;
  const body: UploadRecordingRequest = { id: recording.id, mimeType: recording.mimeType, data: await base64(audio) };
  const res = await fetch(sessionPath(routes.uploadRecording.path, entry.sessionId), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${entry.token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Recording ${recording.id} of ${entry.sessionId} not uploaded, status ${res.status}`);
  routes.uploadRecording.response.parse(await res.json());
}

async function send(entry: OutboxEntry) {
  for (const recording of recordingsOf(entry)) await upload(entry, recording);
  const res = await fetch(sessionPath(routes.submitSession.path, entry.sessionId), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${entry.token}` },
    body: JSON.stringify(entry.body),
  });
  if (!res.ok) throw new Error(`Submit of ${entry.sessionId} failed with ${res.status}`);
  routes.submitSession.response.parse(await res.json());
}

async function deleteUnreferencedRecordings() {
  if (await loadRunner()) return;
  const db = await database();
  const kept: unknown[] = await requestDone(db.transaction('outbox').objectStore('outbox').getAll());
  const referenced = new Set(
    kept.flatMap((item) => {
      const parsed = outboxEntrySchema.safeParse(item);
      return parsed.success ? recordingsOf(parsed.data).map((recording) => recording.id) : [];
    }),
  );
  const keys = await requestDone(db.transaction('recordings').objectStore('recordings').getAllKeys());
  const tx = db.transaction('recordings', 'readwrite');
  for (const key of keys) if (!referenced.has(String(key))) tx.objectStore('recordings').delete(key);
  await transactionDone(tx);
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
      const tx = (await database()).transaction(['outbox', 'recordings'], 'readwrite');
      tx.objectStore('outbox').delete(parsed.data.sessionId);
      for (const recording of recordingsOf(parsed.data)) tx.objectStore('recordings').delete(recording.id);
      await transactionDone(tx);
    } catch (error) {
      console.error(error);
    }
  }
  await deleteUnreferencedRecordings();
}

export async function queueEpisode(entry: EpisodeEntry) {
  const tx = (await database()).transaction('episodes', 'readwrite');
  tx.objectStore('episodes').put(entry);
  await transactionDone(tx);
}

export async function syncEpisodes() {
  const stored: unknown[] = await requestDone((await database()).transaction('episodes').objectStore('episodes').getAll());
  for (const item of stored) {
    const parsed = episodeEntrySchema.safeParse(item);
    if (!parsed.success) {
      console.error('Unreadable episode kept', parsed.error);
      continue;
    }
    const res = await fetch(episodesPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${parsed.data.token}` },
      body: JSON.stringify(parsed.data.body),
    });
    if (!res.ok) throw new Error(`Episode ${parsed.data.body.id} not sent, status ${res.status}`);
    const tx = (await database()).transaction('episodes', 'readwrite');
    tx.objectStore('episodes').delete(parsed.data.body.id);
    await transactionDone(tx);
  }
}
