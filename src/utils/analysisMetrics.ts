import { EnrichedTicker, PortfolioSynthesis, TickerAnalysis, TopPick } from '../types';

export function withCandidateMetrics(
  analysis: TickerAnalysis,
  enriched: EnrichedTicker,
): TickerAnalysis {
  const candidate = enriched.candidateTrade;
  if (!candidate) return analysis;

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

export function withTopPickMetrics(
  synthesis: PortfolioSynthesis,
  tickerAnalyses: TickerAnalysis[],
): PortfolioSynthesis {
  const analysesBySymbol = new Map(tickerAnalyses.map(analysis => [analysis.symbol, analysis]));

  return {
    ...synthesis,
    topPicks: synthesis.topPicks.map(pick => {
      const analysis = analysesBySymbol.get(pick.symbol);
      return analysis ? withTickerAnalysisMetrics(pick, analysis) : pick;
    }),
  };
}
