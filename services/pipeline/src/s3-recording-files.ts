import { GetObjectCommand, NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import type { RecordingReader } from './ports.ts';

export const createS3RecordingReader = (bucket: string, client: S3Client = new S3Client({})): RecordingReader => ({
  get: async (key) => {
    try {
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!object.Body) return undefined;
      return { mimeType: object.ContentType ?? 'application/octet-stream', bytes: await object.Body.transformToByteArray() };
    } catch (error) {
      if (error instanceof NoSuchKey) return undefined;
      throw error;
    }
  },
});
