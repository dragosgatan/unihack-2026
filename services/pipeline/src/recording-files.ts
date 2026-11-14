import type { RecordingFile, RecordingReader, RecordingWriter } from './ports.ts';

export type MemoryRecordingFiles = RecordingReader & RecordingWriter;

export const recordingKey = (sessionId: string, recordingId: string): string =>
  `recordings/${encodeURIComponent(sessionId)}/${encodeURIComponent(recordingId)}`;

export const createMemoryRecordingFiles = (): MemoryRecordingFiles => {
  const files = new Map<string, RecordingFile>();
  return {
    put: async (key, file) => {
      files.set(key, file);
    },
    get: async (key) => files.get(key),
  };
};
