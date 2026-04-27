import { EnrichedTicker, PortfolioSynthesis, TickerAnalysis, TopPick } from '../types';
import { withCandidateMetrics, withTopPickMetrics } from './analysisMetrics';

const candidateTrade = {
  strategy: 'PUT_CREDIT_SPREAD' as const,
  expiry: '2026-05-15',
  dte: 28,
  strike: 190,
  delta: -0.27,
  theta: 0.05,
  premiumMid: 1.2,
  bid: 1.1,
  ask: 1.3,
  spreadPct: 15.4,
  openInterest: 400,
  maxLoss: 380,
  bpr: 380,
  annualisedYield: 8.2,
  robpAnnualised: 115.3,
  liquidityOk: false,
};

describe('analysisMetrics', () => {
  it('returns analysis unchanged when enriched ticker has no candidate trade', () => {
    const analysis = {
      symbol: 'AAPL',
      recommendation: 'SKIP',
      confidence: 'LOW',
      reasoning: 'Low IV.',
      risks: [],
      flags: [],
      adjustedStrike: null,
      adjustedExpiry: null,
      annualisedYield: null,
      maxLoss: null,
      buyingPowerRequired: null,
      robpAnnualised: null,
    } as unknown as TickerAnalysis;

    const enriched = { candidateTrade: undefined } as unknown as EnrichedTicker;

    expect(withCandidateMetrics(analysis, enriched)).toBe(analysis);
  });

  it('uses candidate trade metrics as the source of truth for ticker analysis', () => {
    const analysis = {
      symbol: 'AAPL',
      recommendation: 'SKIP',
      confidence: 'HIGH',
      reasoning: 'Liquidity is too poor for entry.',
      risks: [],
      flags: ['POOR_LIQUIDITY'],
      adjustedStrike: null,
      adjustedExpiry: null,
      annualisedYield: null,
      maxLoss: null,
      buyingPowerRequired: null,
      robpAnnualised: null,
    } as unknown as TickerAnalysis;

    const enriched = {
      candidateTrade,
    } as EnrichedTicker;

    expect(withCandidateMetrics(analysis, enriched)).toMatchObject({
      adjustedStrike: 190,
      adjustedExpiry: '2026-05-15',
      annualisedYield: 8.2,
      maxLoss: 380,
      buyingPowerRequired: 380,
      robpAnnualised: 115.3,
    });
  });

  it('does not rank an actionable recommendation that mismatches the candidate strategy', () => {
    const analysis = {
      symbol: 'AAPL',
      recommendation: 'CSP',
      confidence: 'HIGH',
      reasoning: 'Sell the put.',
      risks: [],
      flags: [],
    } as TickerAnalysis;

    const enriched = {
      candidateTrade,
    } as EnrichedTicker;

    expect(withCandidateMetrics(analysis, enriched)).toMatchObject({
      recommendation: 'WATCH',
      confidence: 'LOW',
      adjustedStrike: undefined,
      annualisedYield: undefined,
      flags: ['STRATEGY_MISMATCH'],
    });
  });

  it('backfills missing top pick metrics from matching ticker analysis', () => {
    const topPick = {
      symbol: 'AAPL',
      strategy: 'PUT_CREDIT_SPREAD',
      tradeDescription: 'Sell the AAPL put spread.',
      maxLoss: null,
      buyingPower: null,
      annualisedYield: null,
      robpAnnualised: null,
      confidence: 'HIGH',
      reasoning: 'Best risk-adjusted return.',
      risks: [],
    } as unknown as TopPick;

    const synthesis = {
      topPicks: [topPick],
      executiveSummary: 'One viable trade.',
      sectorConcentrationWarnings: [],
      correlatedRiskWarnings: [],
      macroNote: 'Normal volatility.',
      robpVsYieldDivergences: [],
    } as PortfolioSynthesis;

    const analyses: TickerAnalysis[] = [
      {
        symbol: 'AAPL',
        recommendation: 'PUT_CREDIT_SPREAD',
        confidence: 'HIGH',
        reasoning: 'Positive ROBP.',
        risks: [],
        flags: [],
        annualisedYield: 8.2,
        maxLoss: 380,
        buyingPowerRequired: 380,
        robpAnnualised: 115.3,
      },
    ];

    expect(withTopPickMetrics(synthesis, analyses).topPicks[0]).toMatchObject({
      annualisedYield: 8.2,
      maxLoss: 380,
      buyingPower: 380,
      robpAnnualised: 115.3,
    });
  });

  it('removes top picks whose ticker analysis was skipped', () => {
    const topPick = {
      symbol: 'AAPL',
      strategy: 'PUT_CREDIT_SPREAD',
      tradeDescription: 'Sell the AAPL put spread.',
      maxLoss: 100,
      buyingPower: 100,
      annualisedYield: 0.2,
      robpAnnualised: 40.6,
      confidence: 'HIGH',
      reasoning: 'Best risk-adjusted return.',
      risks: [],
    } as TopPick;

    const synthesis = {
      topPicks: [topPick],
      executiveSummary: 'One viable trade.',
      sectorConcentrationWarnings: [],
      correlatedRiskWarnings: [],
      macroNote: 'Normal volatility.',
      robpVsYieldDivergences: [],
    } as PortfolioSynthesis;

    const analyses: TickerAnalysis[] = [
      {
        symbol: 'AAPL',
        recommendation: 'SKIP',
        confidence: 'HIGH',
        reasoning: 'Liquidity is too poor.',
        risks: [],
        flags: ['POOR_LIQUIDITY'],
        annualisedYield: 0.2,
        maxLoss: 100,
        buyingPowerRequired: 100,
        robpAnnualised: 40.6,
      },
    ];

    expect(withTopPickMetrics(synthesis, analyses).topPicks).toEqual([]);
  });

  it('removes top picks with invalid risk metrics', () => {
    const topPick = {
      symbol: 'AMZN',
      strategy: 'PUT_CREDIT_SPREAD',
      tradeDescription: 'Sell the AMZN put spread.',
      maxLoss: -108,
      buyingPower: -108,
      annualisedYield: 0.3,
      robpAnnualised: -57.3,
      confidence: 'HIGH',
      reasoning: 'Invalid spread metrics.',
      risks: [],
    } as TopPick;

    const synthesis = {
      topPicks: [topPick],
      executiveSummary: 'One viable trade.',
      sectorConcentrationWarnings: [],
      correlatedRiskWarnings: [],
      macroNote: 'Normal volatility.',
      robpVsYieldDivergences: [],
    } as PortfolioSynthesis;

    const analyses: TickerAnalysis[] = [
      {
        symbol: 'AMZN',
        recommendation: 'PUT_CREDIT_SPREAD',
        confidence: 'HIGH',
        reasoning: 'Invalid spread metrics.',
        risks: [],
        flags: ['NEGATIVE_ROBP'],
        annualisedYield: 0.3,
        maxLoss: -108,
        buyingPowerRequired: -108,
        robpAnnualised: -57.3,
      },
    ];

    expect(withTopPickMetrics(synthesis, analyses).topPicks).toEqual([]);
  });
});
