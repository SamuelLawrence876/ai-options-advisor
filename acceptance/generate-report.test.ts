import marketContextFixture from './fixtures/market-context.json';
import technicalsFixture from './fixtures/technicals.json';
import fundamentalsFixture from './fixtures/fundamentals.json';
import optionsFixture from './fixtures/options.json';
import watchlistItemFixture from './fixtures/watchlist-item.json';
import { getBucketName, getRegion, getStage, resourceNames } from './utils/config';
import { invokeLambda } from './utils/lambda';
import { objectExists, getTextObject } from './utils/s3';
import { EnrichedTicker, MarketContext, PortfolioSynthesis, TickerAnalysis, WatchlistItem } from '../src/types';

jest.setTimeout(60000);

const TEST_DATE = `acceptance-${Date.now()}`;
const stage = getStage();
const region = getRegion();
const names = resourceNames(stage);
const ticker = watchlistItemFixture as WatchlistItem;

let bucket: string;
let reportResult: { reportKey: string; synthesis: PortfolioSynthesis; tickerAnalyses: TickerAnalysis[] };

const fixtureAnalysis: TickerAnalysis = {
  symbol: 'AAPL',
  recommendation: 'COVERED_CALL',
  confidence: 'HIGH',
  adjustedStrike: 190.0,
  adjustedExpiry: '2026-05-16',
  reasoning: 'IV rank at 62, bullish trend, earnings clear at 94 DTE.',
  risks: ['Near 52w high', 'Ex-dividend approaching'],
  flags: [],
  annualisedYield: 14.8,
  maxLoss: 16285,
  buyingPowerRequired: 18925,
  robpAnnualised: 14.8,
};

const fixtureSynthesis: PortfolioSynthesis = {
  topPicks: [
    {
      symbol: 'AAPL',
      strategy: 'COVERED_CALL',
      tradeDescription: 'Sell the AAPL $190 call, 28 DTE, collect $2.15',
      maxLoss: 16285,
      buyingPower: 18925,
      annualisedYield: 14.8,
      robpAnnualised: 14.8,
      confidence: 'HIGH',
      reasoning: 'IV rank elevated at 62, bullish trend, no near-term catalysts.',
      risks: ['Near 52w high', 'Ex-dividend in 11 days'],
    },
  ],
  executiveSummary: 'Normal VIX environment with bullish market trend. AAPL offers the best ROBP this week with IV rank at 62 and clear earnings window.',
  sectorConcentrationWarnings: [],
  correlatedRiskWarnings: [],
  macroNote: 'VIX at 18.5, NORMAL regime. Good week for premium selling. SPY and QQQ both in bullish trend.',
  robpVsYieldDivergences: [],
};

const fixtureEnrichedTicker: EnrichedTicker = {
  ticker,
  date: TEST_DATE,
  vrp: optionsFixture.iv30d - optionsFixture.hv30d,
  ivRankSignal: 'SELL_ENVIRONMENT',
  ivVsSector: 'ABOVE',
  earningsInWindow: false,
  earningsProximity: 'CLEAR',
  exDivInWindow: false,
  near52wHigh: false,
  atrPct: technicalsFixture.atrPct,
  premiumCoversAtr: true,
  liquidityOk: true,
  suggestedStrategy: 'COVERED_CALL',
  candidateTrade: {
    strategy: 'COVERED_CALL',
    expiry: '2026-05-16',
    dte: 28,
    strike: 190.0,
    delta: 0.30,
    theta: 0.058,
    premiumMid: 2.15,
    bid: 2.10,
    ask: 2.20,
    spreadPct: 4.5,
    openInterest: 6140,
    maxLoss: 16285,
    bpr: 18925,
    annualisedYield: 14.8,
    robpAnnualised: 14.8,
    liquidityOk: true,
  },
  marketContext: marketContextFixture as unknown as MarketContext,
  rawOptions: optionsFixture as unknown as EnrichedTicker['rawOptions'],
  rawFundamentals: fundamentalsFixture as unknown as EnrichedTicker['rawFundamentals'],
  rawTechnicals: technicalsFixture as unknown as EnrichedTicker['rawTechnicals'],
};

beforeAll(async () => {
  bucket = await getBucketName(stage, region);
  const result = await invokeLambda<{
    reportKey: string;
    synthesis: PortfolioSynthesis;
    tickerAnalyses: TickerAnalysis[];
  }>(names.generateReportFn, {
    synthesis: fixtureSynthesis,
    tickerAnalyses: [fixtureAnalysis],
    enrichedTickers: [fixtureEnrichedTicker],
    date: TEST_DATE,
    marketContext: marketContextFixture,
  });
  reportResult = result.payload;
});

describe('generateReport Lambda', () => {
  it('writes HTML report to S3 at the expected key', async () => {
    expect(reportResult.reportKey).toBe(`reports/${TEST_DATE}/full-report.html`);
    await expect(objectExists(bucket, `reports/${TEST_DATE}/full-report.html`)).resolves.toBe(true);
  });

  it('HTML report contains expected sections', async () => {
    const html = await getTextObject(bucket, `reports/${TEST_DATE}/full-report.html`);
    expect(html).toContain('Options Analysis Report');
    expect(html).toContain('Top Opportunities This Week');
    expect(html).toContain('Full Watchlist Review');
    expect(html).toContain('ROBP');
    expect(html).toContain('AAPL');
    expect(html).toContain(marketContextFixture.vixRegime);
  });

  it('returns synthesis and ticker analyses for pipeline chaining', () => {
    expect(reportResult.synthesis).toBeDefined();
    expect(reportResult.tickerAnalyses).toBeInstanceOf(Array);
  });
});
