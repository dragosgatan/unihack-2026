import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type OpenedReportFile = { kind: 'redirect'; url: string } | { kind: 'pdf'; bytes: Uint8Array };

export type ReportFileOpener = { open(key: string): Promise<OpenedReportFile | undefined> };

export const signedUrlSeconds = 60;

export const createS3ReportFileOpener = (bucket: string, client: S3Client = new S3Client({})): ReportFileOpener => ({
  open: async (key) => ({
    kind: 'redirect',
    url: await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: 'application/pdf',
        ResponseContentDisposition: 'inline; filename="tempo-report.pdf"',
      }),
      { expiresIn: signedUrlSeconds },
    ),
  }),
});
