import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';

const ses = new SESClient({});

export async function sendEmail(
  senderEmail: string,
  recipientEmail: string,
  subject: string,
  body: string,
): Promise<void> {
  await ses.send(
    new SendEmailCommand({
      Source: senderEmail,
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: body, Charset: 'UTF-8' } },
      },
    }),
  );
}

export function buildEmailBody(reportMarkdown: string, presignedUrl: string): string {
  return [
    reportMarkdown,
    '',
    '---',
    '',
    `Full report (link expires in 7 days): ${presignedUrl}`,
  ].join('\n');
}
