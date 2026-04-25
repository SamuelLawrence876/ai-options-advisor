import { EnrichedTicker, PortfolioSynthesis, TickerAnalysis, TopPick } from '../types';

export function withCandidateMetrics(
  analysis: TickerAnalysis,
  enriched: EnrichedTicker,
): TickerAnalysis {
  const candidate = enriched.candidateTrade;
  if (!candidate) return analysis;

  const actionableMismatch =
    analysis.recommendation !== 'SKIP' &&
    analysis.recommendation !== 'WATCH' &&
    analysis.recommendation !== candidate.strategy;

  if (actionableMismatch) {
    return {
      ...analysis,
      recommendation: 'WATCH',
      confidence: 'LOW',
      adjustedStrike: undefined,
      adjustedExpiry: undefined,
      annualisedYield: undefined,
      maxLoss: undefined,
      buyingPowerRequired: undefined,
      robpAnnualised: undefined,
      reasoning: `Model recommended ${analysis.recommendation}, but the pre-screened candidate is ${candidate.strategy}. Waiting for a matching candidate before ranking.`,
      flags: [...analysis.flags, 'STRATEGY_MISMATCH'],
    };
  }

  return {
    ...analysis,
    adjustedStrike: candidate.strike,
    adjustedExpiry: candidate.expiry,
    annualisedYield: candidate.annualisedYield,
    maxLoss: candidate.maxLoss,
    buyingPowerRequired: candidate.bpr,
    robpAnnualised: candidate.robpAnnualised,
  };
}

function withTickerAnalysisMetrics(pick: TopPick, analysis: TickerAnalysis): TopPick {
  return {
    ...pick,
    maxLoss: analysis.maxLoss ?? pick.maxLoss,
    buyingPower: analysis.buyingPowerRequired ?? pick.buyingPower,
    annualisedYield: analysis.annualisedYield ?? pick.annualisedYield,
    robpAnnualised: analysis.robpAnnualised ?? pick.robpAnnualised,
  };
}

function isTopPickEligible(analysis: TickerAnalysis): boolean {
  return (
    analysis.recommendation !== 'SKIP' &&
    analysis.recommendation !== 'WATCH' &&
    Number.isFinite(analysis.maxLoss) &&
    Number.isFinite(analysis.buyingPowerRequired) &&
    Number.isFinite(analysis.annualisedYield) &&
    Number.isFinite(analysis.robpAnnualised) &&
    (analysis.maxLoss ?? 0) > 0 &&
    (analysis.buyingPowerRequired ?? 0) > 0 &&
    (analysis.robpAnnualised ?? 0) > 0
  );
}

export function withTopPickMetrics(
  synthesis: PortfolioSynthesis,
  tickerAnalyses: TickerAnalysis[],
): PortfolioSynthesis {
  const analysesBySymbol = new Map(tickerAnalyses.map(analysis => [analysis.symbol, analysis]));

  return {
    ...synthesis,
    topPicks: synthesis.topPicks.flatMap(pick => {
      const analysis = analysesBySymbol.get(pick.symbol);
      if (!analysis || !isTopPickEligible(analysis)) return [];
      return [withTickerAnalysisMetrics(pick, analysis)];
    }),
  };
}
