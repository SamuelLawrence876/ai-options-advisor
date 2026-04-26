import { EnrichedTicker, MarketContext, PortfolioSynthesis, TickerAnalysis } from '../../types';
import { withCandidateMetrics, withTopPickMetrics } from '../../utils/analysisMetrics';
import { info } from '../../utils/logger';
import { putMarkdown } from '../../utils/aws/s3Text';
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

  const enrichedBySymbol = new Map(
    enrichedTickers.map(enriched => [enriched.ticker.symbol, enriched] as const),
  );
  const tickerAnalysesWithMetrics = tickerAnalyses.map(analysis => {
    const enriched = enrichedBySymbol.get(analysis.symbol);
    return enriched ? withCandidateMetrics(analysis, enriched) : analysis;
  });
  const synthesisWithMetrics = withTopPickMetrics(synthesis, tickerAnalysesWithMetrics);

  const report = buildReport(
    synthesisWithMetrics,
    tickerAnalysesWithMetrics,
    enrichedTickers,
    date,
    marketContext,
  );

  const reportKey = `reports/${date}.md`;
  await putMarkdown(bucketName, reportKey, report);

  info('generate-report complete', { date, reportKey });

  return {
    reportKey,
    synthesis: synthesisWithMetrics,
    tickerAnalyses: tickerAnalysesWithMetrics,
    enrichedTickers,
    date,
    marketContext,
  };
};
