import {
  EnrichedTicker,
  MarketContext,
  PortfolioSynthesis,
  ReportMetadata,
  TickerAnalysis,
} from '../../types';
import { putIvSnapshot, putReportMetadata } from '../../utils/aws/dynamodb';
import { error, info } from '../../utils/logger';
import { getText, getPresignedUrl } from '../../utils/aws/s3';
import { getSecretValue } from '../../utils/aws/secrets';
import { sendDiscordReport } from './discord';
import { buildEmailBody, sendEmail } from './email';
import { buildIvSnapshots } from './ivSnapshots';

interface DeliverReportEvent {
  reportKey: string;
  synthesis: PortfolioSynthesis;
  tickerAnalyses: TickerAnalysis[];
  enrichedTickers: EnrichedTicker[];
  date: string;
  marketContext: MarketContext;
}

export const handler = async (event: DeliverReportEvent): Promise<void> => {
  const bucketName = process.env.BUCKET_NAME!;
  const reportsTable = process.env.REPORTS_TABLE!;
  const ivHistoryTable = process.env.IV_HISTORY_TABLE!;
  const senderEmail = process.env.SENDER_EMAIL!;
  const recipientEmail = process.env.RECIPIENT_EMAIL!;
  const discordWebhookSecretArn = process.env.DISCORD_WEBHOOK_SECRET_ARN;

  const { reportKey, synthesis, tickerAnalyses, enrichedTickers, date } = event;

  info('deliver-report started', { date, reportKey });

  const [reportMarkdown, presignedUrl] = await Promise.all([
    getText(bucketName, reportKey),
    getPresignedUrl(bucketName, reportKey, 7 * 24 * 3600),
  ]);

  const emailBody = buildEmailBody(reportMarkdown, presignedUrl);
  try {
    await sendEmail(
      senderEmail,
      recipientEmail,
      `Options Analysis — ${date} — ${synthesis.topPicks.length} top picks`,
      emailBody,
    );
    info('deliver-report email sent', { recipientEmail });
  } catch (err) {
    error('deliver-report email failed — report still available in S3', err as Error);
  }

  if (discordWebhookSecretArn) {
    try {
      const discordWebhookUrl = await getSecretValue(discordWebhookSecretArn);
      await sendDiscordReport(
        discordWebhookUrl,
        reportMarkdown,
        presignedUrl,
        date,
        synthesis.topPicks.length,
      );
      info('deliver-report discord sent');
    } catch (err) {
      error('deliver-report discord failed — report still available in S3', err as Error);
    }
  }

  const reportMetadata: ReportMetadata = {
    reportDate: date,
    s3Key: reportKey,
    tickersAnalysed: tickerAnalyses.map(a => a.symbol),
    topPicks: synthesis.topPicks.map(p => ({ symbol: p.symbol, strategy: p.strategy })),
    status: 'COMPLETE',
  };
  await putReportMetadata(reportsTable, reportMetadata);

  const ivSnapshots = buildIvSnapshots(enrichedTickers, date);
  await Promise.all(ivSnapshots.map(snapshot => putIvSnapshot(ivHistoryTable, snapshot)));

  info('deliver-report complete', { date, recipientEmail, ivSnapshotsWritten: ivSnapshots.length });
};
