import type { ReportFiles } from './ports.ts';

export type StoredReportPdf = { kind: 'pdf'; bytes: Uint8Array };

export type MemoryReportFiles = ReportFiles & { open(key: string): Promise<StoredReportPdf | undefined> };

export const reportPdfKey = (patientId: string, sessionId: string): string =>
  `reports/${encodeURIComponent(patientId)}/${encodeURIComponent(sessionId)}.pdf`;

export const createMemoryReportFiles = (): MemoryReportFiles => {
  const files = new Map<string, Uint8Array>();
  return {
    put: async (key, pdf) => {
      files.set(key, pdf);
    },
    open: async (key) => {
      const bytes = files.get(key);
      return bytes && { kind: 'pdf', bytes };
    },
  };
};
