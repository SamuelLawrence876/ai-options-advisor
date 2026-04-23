import {
  EnrichedTicker,
  MarketContext,
  PortfolioSynthesis,
  TickerAnalysis,
  WatchlistItem,
} from '../../types';
import { invokeModel } from '../../utils/bedrock';
import { getHumanContext } from '../../utils/dynamodb';
import { formatDossier } from '../../utils/dossier';
import { info } from '../../utils/logger';
import { getJson } from '../../utils/s3';

const SYSTEM_PROMPT = `You are a professional options trader and analyst specialising in premium-selling strategies: covered calls, cash-secured puts (CSPs), put credit spreads, and iron condors.

Your role is to evaluate options selling opportunities and provide structured, actionable recommendations. You think carefully about:
- Whether IV is genuinely elevated relative to the stock's own history (IV rank) and to its sector
- Event risk: earnings and dividends inside the expiry window are disqualifying
- Trend alignment: strategies must match the underlying direction
- Capital efficiency: ROBP (return on buying power) annualised is the primary ranking metric, not raw yield
- Position context: whether the trader holds shares affects which strategies are viable

You return structured JSON only. No preamble, no commentary outside the JSON.`;

const TICKER_ANALYSIS_PROMPT = (dossier: string) => `Analyse the following ticker dossier and return a structured trade recommendation.

${dossier}

Return a JSON object with this exact structure:
{
  "symbol": "string",
  "recommendation": "COVERED_CALL | PUT_CREDIT_SPREAD | CSP | IRON_CONDOR | SKIP | WATCH",
  "confidence": "HIGH | MEDIUM | LOW",
  "adjustedStrike": number or null,
  "adjustedExpiry": "YYYY-MM-DD" or null,
  "reasoning": "2-3 sentence explanation of the key factors driving this recommendation",
  "risks": ["risk 1", "risk 2", "risk 3"],
  "flags": ["any specific warnings"],
  "annualisedYield": number or null,
  "maxLoss": number or null,
  "buyingPowerRequired": number or null,
  "robpAnnualised": number or null
}

If recommending SKIP, set adjustedStrike and all numeric fields to null. Explain clearly in reasoning what needs to change for this to become a trade.
If recommending WATCH, briefly note what catalyst or setup you are waiting for.`;

const PORTFOLIO_SYNTHESIS_PROMPT = (
  tickerAnalyses: TickerAnalysis[],
  marketContext: MarketContext,
) => `You have completed per-ticker analysis for ${tickerAnalyses.length} positions. Now perform portfolio-level synthesis.

MARKET REGIME
─────────────
VIX: ${marketContext.vix.toFixed(2)} [${marketContext.vixRegime}]
Market Trend: ${marketContext.marketTrend}
SPY: $${marketContext.spyPrice.toFixed(2)} (${marketContext.spyTrend})
QQQ: $${marketContext.qqqPrice.toFixed(2)} (${marketContext.qqqTrend})

PER-TICKER RESULTS
──────────────────
${JSON.stringify(tickerAnalyses, null, 2)}

Tasks:
1. Select the top 3-5 opportunities ranked by robpAnnualised (not raw yield). For each, write a plain-English trade description (e.g. "Sell the MSFT $415/$410 put spread, 28 DTE, collect $1.20").
2. Note any cases where ROBP ranking materially differs from yield ranking and why that matters.
3. Flag sector concentration if >2 positions are in the same sector.
4. Flag correlated risk (e.g. multiple semiconductor names).
5. Comment on the macro regime and whether this is a good week for premium selling broadly.
6. Write a 2-3 sentence executive summary.

Return a JSON object with this exact structure:
{
  "topPicks": [
    {
      "symbol": "string",
      "strategy": "COVERED_CALL | PUT_CREDIT_SPREAD | CSP | IRON_CONDOR",
      "tradeDescription": "plain English trade description",
      "maxLoss": number,
      "buyingPower": number,
      "annualisedYield": number,
      "robpAnnualised": number,
      "confidence": "HIGH | MEDIUM | LOW",
      "reasoning": "2-3 sentence rationale",
      "risks": ["risk 1", "risk 2"]
    }
  ],
  "executiveSummary": "2-3 sentence overview of the week's setup",
  "sectorConcentrationWarnings": ["warning 1"],
  "correlatedRiskWarnings": ["warning 1"],
  "macroNote": "commentary on macro regime and premium-selling conditions",
  "robpVsYieldDivergences": ["note any divergences between ROBP and yield rankings"]
}`;

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
