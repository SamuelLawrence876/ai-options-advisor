import { EnrichedTicker, MarketContext, PortfolioSynthesis, StrategyRecommendation, TickerAnalysis, TopPick } from '../../types';
import { buildReport } from './templates';

const marketContext: MarketContext = {
  date: '2026-04-25',
  vix: 18.7,
  vixRegime: 'NORMAL',
  spyPrice: 500,
  spyTrend: 'NEUTRAL',
  qqqPrice: 400,
  qqqTrend: 'NEUTRAL',
  marketTrend: 'NEUTRAL',
  fetchedAt: '2026-04-25T00:00:00.000Z',
};

const emptySynthesis: PortfolioSynthesis = {
  topPicks: [],
  executiveSummary: 'No viable trades this cycle.',
  sectorConcentrationWarnings: [],
  correlatedRiskWarnings: [],
  macroNote: '',
  robpVsYieldDivergences: [],
};

function makePick(symbol: string, strategy: StrategyRecommendation, risks: string[] = []): TopPick {
  return { symbol, strategy, tradeDescription: `Sell the ${symbol} spread.`, maxLoss: 380, buyingPower: 380, annualisedYield: 12.5, robpAnnualised: 87.3, confidence: 'HIGH', reasoning: 'Strong ROBP.', risks };
}

function makeAnalysis(symbol: string, recommendation: StrategyRecommendation, flags: string[] = []): TickerAnalysis {
  return { symbol, recommendation, confidence: 'HIGH', reasoning: 'Test rationale.', risks: [], flags, annualisedYield: 12.5, maxLoss: 380, buyingPowerRequired: 380, robpAnnualised: 87.3 };
}

describe('buildReport', () => {
  it('renders an empty top opportunities state', () => {
    const report = buildReport(emptySynthesis, [], [], '2026-04-25', marketContext);
    expect(report).toContain('No eligible opportunities this cycle');
    expect(report).toContain('Full Watchlist');
  });

  it('renders top picks with all medal positions and risks', () => {
    const synthesis: PortfolioSynthesis = {
      ...emptySynthesis,
      topPicks: [
        makePick('AAPL', 'PUT_CREDIT_SPREAD', ['Earnings risk', 'Sector drag']),
        makePick('MSFT', 'CSP'),
        makePick('AMZN', 'COVERED_CALL'),
        makePick('NVDA', 'CALL_CREDIT_SPREAD'),
      ],
    };

    const report = buildReport(synthesis, [], [], '2026-04-25', marketContext);

    expect(report).toContain('🥇');
    expect(report).toContain('🥈');
    expect(report).toContain('🥉');
    expect(report).toContain('#4');
    expect(report).toContain('Earnings risk · Sector drag');
    expect(report).toContain('AAPL');
    expect(report).toContain('NVDA');
  });

  it('renders watchlist rows with and without flags', () => {
    const analyses = [
      makeAnalysis('AAPL', 'PUT_CREDIT_SPREAD', ['NEAR_52W_HIGH']),
      makeAnalysis('MSFT', 'SKIP'),
    ];

    const report = buildReport(emptySynthesis, analyses, [], '2026-04-25', marketContext);

    expect(report).toContain('NEAR_52W_HIGH');
    expect(report).toContain('AAPL');
    expect(report).toContain('MSFT');
  });

  it('renders null metric values as em-dash in watchlist', () => {
    const analyses: TickerAnalysis[] = [{
      symbol: 'XOM', recommendation: 'SKIP', confidence: 'LOW', reasoning: 'Low IV.',
      risks: [], flags: [], annualisedYield: undefined, maxLoss: undefined, buyingPowerRequired: undefined, robpAnnualised: undefined,
    }];

    const report = buildReport(emptySynthesis, analyses, [], '2026-04-25', marketContext);

    expect(report).toContain('—%');
  });

  it('renders earnings warnings, skips, sector/correlated risk, and macro note in flags section', () => {
    const synthesis: PortfolioSynthesis = {
      ...emptySynthesis,
      sectorConcentrationWarnings: ['Tech sector over-weight.'],
      correlatedRiskWarnings: ['AAPL and MSFT are correlated.'],
      macroNote: 'VIX elevated — size carefully.',
    };
    const analyses = [makeAnalysis('MSFT', 'SKIP')];
    const enriched = [{ ticker: { symbol: 'AAPL' }, rawFundamentals: { earningsDte: 7, earningsDate: '2026-05-02', symbol: 'AAPL', fetchedAt: '' } }] as EnrichedTicker[];

    const report = buildReport(synthesis, analyses, enriched, '2026-04-25', marketContext);

    expect(report).toContain('Upcoming Earnings');
    expect(report).toContain('AAPL');
    expect(report).toContain('Skipped Positions');
    expect(report).toContain('MSFT');
    expect(report).toContain('Tech sector over-weight');
    expect(report).toContain('AAPL and MSFT are correlated');
    expect(report).toContain('VIX elevated');
  });

  it('renders iron condor with correct emoji in top picks and watchlist', () => {
    const synthesis: PortfolioSynthesis = {
      ...emptySynthesis,
      topPicks: [makePick('AAPL', 'IRON_CONDOR')],
    };
    const analyses = [makeAnalysis('AAPL', 'IRON_CONDOR')];
    const report = buildReport(synthesis, analyses, [], '2026-04-25', marketContext);
    expect(report).toContain('🦅');
    expect(report).toContain('IRON CONDOR');
  });

  it('renders portfolio notes section when ROBP vs yield divergences are present', () => {
    const synthesis: PortfolioSynthesis = {
      ...emptySynthesis,
      robpVsYieldDivergences: ['AAPL ROBP 87% vs yield 12.5% — capital-efficient.'],
    };

    const report = buildReport(synthesis, [], [], '2026-04-25', marketContext);

    expect(report).toContain('Portfolio Notes');
    expect(report).toContain('ROBP vs Yield');
    expect(report).toContain('AAPL ROBP 87%');
  });
});
