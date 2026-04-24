import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import {
  EnrichedTicker,
  IvSnapshot,
  MarketContext,
  PortfolioSynthesis,
  ReportMetadata,
  TickerAnalysis,
} from '../../types';
import { putIvSnapshot, putReportMetadata } from '../../utils/dynamodb';
import { error, info } from '../../utils/logger';
import { getPresignedUrl } from '../../utils/s3';

const ses = new SESClient({});

interface DeliverReportEvent {
  reportKey: string;
  synthesis: PortfolioSynthesis;
  tickerAnalyses: TickerAnalysis[];
  enrichedTickers: EnrichedTicker[];
  date: string;
  marketContext: MarketContext;
}

async function sendEmail(
  senderEmail: string,
  recipientEmail: string,
  subject: string,
  htmlBody: string,
): Promise<void> {
  await ses.send(
    new SendEmailCommand({
      Source: senderEmail,
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: htmlBody, Charset: 'UTF-8' } },
      },
    }),
  );
}

function buildEmailBody(
  synthesis: PortfolioSynthesis,
  tickerAnalyses: TickerAnalysis[],
  date: string,
  presignedUrl: string,
  marketContext: MarketContext,
): string {
  const topPicksList = synthesis.topPicks
    .map(
      (p, i) =>
        `<li style="margin-bottom:8px;"><strong>${i + 1}. ${p.symbol}</strong> — ${p.tradeDescription} · ROBP ${p.robpAnnualised.toFixed(1)}% ann.</li>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:24px;color:#111827;">
  <h2 style="margin:0 0 8px;">Options Analysis — ${date}</h2>
  <p style="color:#6b7280;margin:0 0 20px;">VIX ${marketContext.vix.toFixed(2)} [${marketContext.vixRegime}] · ${marketContext.marketTrend} market</p>

  <div style="background:#f9fafb;border-left:4px solid #2563eb;padding:16px;margin-bottom:20px;">
    <strong>Executive Summary</strong><br>
    ${synthesis.executiveSummary}
  </div>

  <h3 style="margin:0 0 12px;">Top Picks This Week</h3>
  <ol style="padding-left:20px;margin:0 0 24px;">${topPicksList}</ol>

  <a href="${presignedUrl}" style="display:inline-block;background:#1e40af;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">View Full Report</a>
  <p style="font-size:12px;color:#9ca3af;margin-top:12px;">Link expires in 7 days. ${tickerAnalyses.length} positions analysed.</p>
</body>
</html>`;
}

export const handler = async (event: DeliverReportEvent): Promise<void> => {
  const bucketName = process.env.BUCKET_NAME!;
  const reportsTable = process.env.REPORTS_TABLE!;
  const ivHistoryTable = process.env.IV_HISTORY_TABLE!;
  const senderEmail = process.env.SENDER_EMAIL!;
  const recipientEmail = process.env.RECIPIENT_EMAIL!;

  const { reportKey, synthesis, tickerAnalyses, enrichedTickers, date, marketContext } = event;

  info('deliver-report started', { date, reportKey });

  const presignedUrl = await getPresignedUrl(bucketName, reportKey, 7 * 24 * 3600);

  const emailBody = buildEmailBody(synthesis, tickerAnalyses, date, presignedUrl, marketContext);
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

  const reportMetadata: ReportMetadata = {
    reportDate: date,
    s3Key: reportKey,
    tickersAnalysed: tickerAnalyses.map((a) => a.symbol),
    topPicks: synthesis.topPicks.map((p) => ({ symbol: p.symbol, strategy: p.strategy })),
    status: 'COMPLETE',
  };
  await putReportMetadata(reportsTable, reportMetadata);

  const ivSnapshots: IvSnapshot[] = enrichedTickers
    .filter((e) => e.rawOptions != null)
    .map((e) => ({
      symbol: e.ticker.symbol,
      date,
      iv30d: e.rawOptions.iv30d,
      ivRank: e.rawOptions.ivRank,
      ivPercentile: e.rawOptions.ivPercentile,
      hv30d: e.rawOptions.hv30d,
      vrp: e.vrp,
    }));

  await Promise.all(ivSnapshots.map((snapshot) => putIvSnapshot(ivHistoryTable, snapshot)));

  info('deliver-report complete', { date, recipientEmail, ivSnapshotsWritten: ivSnapshots.length });
};
