import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ReportFiles } from './ports.ts';

export const createS3ReportFiles = (bucket: string, client: S3Client = new S3Client({})): ReportFiles => ({
  put: async (key, pdf) => {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: pdf, ContentType: 'application/pdf' }));
  },
});
