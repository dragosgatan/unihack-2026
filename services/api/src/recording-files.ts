import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { RecordingWriter } from '@tempo/pipeline';

export const createS3RecordingWriter = (bucket: string, client: S3Client = new S3Client({})): RecordingWriter => ({
  put: async (key, file) => {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: file.bytes, ContentType: file.mimeType }));
  },
});
