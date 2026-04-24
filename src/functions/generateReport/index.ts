import { EnrichedTicker, MarketContext, PortfolioSynthesis, TickerAnalysis } from '../../types';
import { info } from '../../utils/logger';
import { putMarkdown } from '../../utils/aws/s3';
import { buildReport } from './templates';

interface GenerateReportEvent {
  synthesis: PortfolioSynthesis;
  tickerAnalyses: TickerAnalysis[];
  enrichedTickers: EnrichedTicker[];
  date: string;
  marketContext: MarketContext;
}

interface GenerateReportResult {
  reportKey: string;
  synthesis: PortfolioSynthesis;
  tickerAnalyses: TickerAnalysis[];
  enrichedTickers: EnrichedTicker[];
  date: string;
  marketContext: MarketContext;
}

export const handler = async (event: GenerateReportEvent): Promise<GenerateReportResult> => {
  const bucketName = process.env.BUCKET_NAME!;
  const { synthesis, tickerAnalyses, enrichedTickers, date, marketContext } = event;

  info('generate-report started', { date, topPickCount: synthesis.topPicks?.length ?? 0 });

  const report = buildReport(synthesis, tickerAnalyses, enrichedTickers, date, marketContext);

  const reportKey = `reports/${date}/full-report.md`;
  await putMarkdown(bucketName, reportKey, report);

  info('generate-report complete', { date, reportKey });

  return { reportKey, synthesis, tickerAnalyses, enrichedTickers, date, marketContext };
};
