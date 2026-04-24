import {
  EnrichedTicker,
  MarketContext,
  PortfolioSynthesis,
  TickerAnalysis,
  WatchlistItem,
} from '../../types';
import { invokeModel } from '../../utils/aws/bedrock';
import { getHumanContext } from '../../utils/aws/dynamodb';
import { formatDossier } from '../../utils/dossier';
import { info } from '../../utils/logger';
import { PORTFOLIO_SYNTHESIS_PROMPT, SYSTEM_PROMPT, TICKER_ANALYSIS_PROMPT } from './prompts';

interface Stage1Event {
  stage: 1;
  ticker: WatchlistItem;
  enriched: EnrichedTicker;
  date: string;
  marketContext: MarketContext;
}

interface Stage2Event {
  stage: 2;
  tickerAnalyses: TickerAnalysis[];
  date: string;
  marketContext: MarketContext;
}

type RunLlmAnalysisEvent = Stage1Event | Stage2Event;

export const handler = async (
  event: RunLlmAnalysisEvent,
): Promise<TickerAnalysis | PortfolioSynthesis> => {
  const humanContextTable = process.env.HUMAN_CONTEXT_TABLE!;

  if (event.stage === 1) {
    const { ticker, enriched, date, marketContext } = event;
    const symbol = ticker.symbol;

    info('run-llm-analysis stage 1 started', { symbol, date });

    if (enriched.suggestedStrategy === 'SKIP') {
      info('run-llm-analysis stage 1 SKIP — no Bedrock call', { symbol });
      return {
        symbol,
        recommendation: 'SKIP',
        confidence: 'LOW',
        reasoning:
          'Ticker skipped: IV rank below threshold, earnings inside expiry window, or data unavailable.',
        risks: [],
        flags: [],
      } as TickerAnalysis;
    }

    const humanContext = await getHumanContext(humanContextTable, symbol);
    const dossier = formatDossier(enriched, marketContext, humanContext);
    const prompt = TICKER_ANALYSIS_PROMPT(dossier);

    const analysis = await invokeModel<TickerAnalysis>(prompt, SYSTEM_PROMPT);

    info('run-llm-analysis stage 1 complete', {
      symbol,
      recommendation: analysis.recommendation,
      confidence: analysis.confidence,
    });

    return analysis;
  }

  const { tickerAnalyses, date, marketContext } = event;

  info('run-llm-analysis stage 2 started', { date, count: tickerAnalyses.length });

  const prompt = PORTFOLIO_SYNTHESIS_PROMPT(tickerAnalyses, marketContext);
  const synthesis = await invokeModel<PortfolioSynthesis>(prompt, SYSTEM_PROMPT);

  info('run-llm-analysis stage 2 complete', {
    date,
    topPickCount: synthesis.topPicks?.length ?? 0,
  });

  return synthesis;
};
