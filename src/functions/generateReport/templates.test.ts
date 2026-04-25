import { MarketContext, PortfolioSynthesis } from '../../types';
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

describe('buildReport', () => {
  it('renders an empty top opportunities state', () => {
    const synthesis: PortfolioSynthesis = {
      topPicks: [],
      executiveSummary: 'No viable trades this cycle.',
      sectorConcentrationWarnings: [],
      correlatedRiskWarnings: [],
      macroNote: 'Normal volatility.',
      robpVsYieldDivergences: [],
    };

    const report = buildReport(synthesis, [], [], '2026-04-25', marketContext);

    expect(report).toContain('No eligible opportunities this cycle');
    expect(report).toContain('Full Watchlist');
  });
});
