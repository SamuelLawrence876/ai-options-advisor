const DISCORD_CONTENT_LIMIT = 2000;
const DISCORD_REPORT_CHUNK_LIMIT = 1800;

interface DiscordWebhookPayload {
  content: string;
}

export function buildDiscordMessages(
  reportMarkdown: string,
  presignedUrl: string,
  date: string,
  topPickCount: number,
): DiscordWebhookPayload[] {
  const header = `Options Analysis - ${date} - ${topPickCount} top picks\nFull report: ${presignedUrl}`;
  const chunks = splitContent(reportMarkdown, DISCORD_REPORT_CHUNK_LIMIT);

  return [header, ...chunks].map(content => {
    if (content.length > DISCORD_CONTENT_LIMIT) {
      throw new Error('Discord message content exceeds payload limit');
    }

    return { content };
  });
}

export async function sendDiscordReport(
  webhookUrl: string,
  reportMarkdown: string,
  presignedUrl: string,
  date: string,
  topPickCount: number,
): Promise<void> {
  const messages = buildDiscordMessages(reportMarkdown, presignedUrl, date, topPickCount);

  for (const message of messages) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`Discord webhook failed with ${response.status}: ${responseBody}`);
    }
  }
}

function splitContent(content: string, limit: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const line of content.split('\n')) {
    const lineWithBreak = current ? `\n${line}` : line;

    if ((current + lineWithBreak).length <= limit) {
      current += lineWithBreak;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (line.length <= limit) {
      current = line;
      continue;
    }

    chunks.push(...splitLongLine(line, limit));
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitLongLine(line: string, limit: number): string[] {
  const chunks: string[] = [];

  for (let index = 0; index < line.length; index += limit) {
    chunks.push(line.slice(index, index + limit));
  }

  return chunks;
}
