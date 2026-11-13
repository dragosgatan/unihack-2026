import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { SendEmail } from './ports.ts';

export const createSesEmail =
  (sender: string, client: SESv2Client = new SESv2Client({})): SendEmail =>
  async ({ to, subject, text }) => {
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: sender,
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
      }),
    );
  };
