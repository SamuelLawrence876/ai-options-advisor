import { MarketContext, TickerAnalysis } from '../../types';

export const SYSTEM_PROMPT = `You are a professional options trader and analyst specialising in options strategies: covered calls, cash-secured puts (CSPs), put credit spreads, call credit spreads, call debit spreads, and put debit spreads.

Your role is to evaluate options selling opportunities and provide structured, actionable recommendations. You think carefully about:
- Whether IV is genuinely elevated relative to the stock's own history (IV rank)
- Event risk: earnings and dividends inside the expiry window are disqualifying
- Trend alignment: strategies must match the underlying direction
- Capital efficiency: ROBP (return on buying power) annualised is the primary ranking metric, not raw yield
- Position context: whether the trader holds shares affects which strategies are viable
- The candidate trade, strike, expiry, and risk metrics are computed mechanically upstream and are the source of truth

You return structured JSON only. No preamble, no commentary outside the JSON.`;

export const TICKER_ANALYSIS_PROMPT = (
  dossier: string,
) => `Analyse the following ticker dossier and return a structured trade recommendation.

${dossier}

Return a JSON object with this exact structure:
{
  "symbol": "string",
  "recommendation": "COVERED_CALL | PUT_CREDIT_SPREAD | CALL_CREDIT_SPREAD | CALL_DEBIT_SPREAD | PUT_DEBIT_SPREAD | CSP | SKIP | WATCH",
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

If no candidate trade is present, set adjustedStrike and all numeric fields to null.
If a candidate trade is present but you recommend SKIP, preserve its numeric fields so the report can show why the trade failed.
If recommending WATCH, briefly note what catalyst or setup you are waiting for.
Do not invent a different strategy, strike, expiry, max loss, buying power, yield, or ROBP. If the candidate is not attractive, return SKIP or WATCH and explain why.`;

export const PORTFOLIO_SYNTHESIS_PROMPT = (
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
1. Select the top 3-5 opportunities ranked by robpAnnualised (not raw yield). Only select tickers whose recommendation is not SKIP or WATCH and whose maxLoss, buyingPowerRequired, annualisedYield, and robpAnnualised are positive numbers. For each, write a plain-English trade description using the exact strike fields provided, including longStrike for spreads when present (e.g. "Sell the MSFT $415/$410 put spread, 28 DTE, collect $1.20"). Do not create new trades or repair skipped trades.
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
      "strategy": "COVERED_CALL | PUT_CREDIT_SPREAD | CALL_CREDIT_SPREAD | CALL_DEBIT_SPREAD | PUT_DEBIT_SPREAD | CSP",
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
