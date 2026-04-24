import fundamentalsFixture from './fixtures/fundamentals.json';
import marketContextFixture from './fixtures/market-context.json';
import optionsFixture from './fixtures/options.json';
import technicalsFixture from './fixtures/technicals.json';
import watchlistItemFixture from './fixtures/watchlist-item.json';
import { getBucketName, getRegion, getStage, resourceNames } from './utils/config';
import { invokeLambda } from './utils/lambda';
import { putJsonObject } from './utils/s3';
import {
  EnrichedTicker,
  MarketContext,
  PortfolioSynthesis,
  TickerAnalysis,
  WatchlistItem,
} from '../src/types';

jest.setTimeout(120000);

const TEST_DATE = `acceptance-${Date.now()}`;
const stage = getStage();
const region = getRegion();
const names = resourceNames(stage);
const ticker = watchlistItemFixture as WatchlistItem;

let bucket: string;

const fixtureEnrichedTicker: EnrichedTicker = {
  ticker: ticker,
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
    delta: 0.3,
    theta: 0.058,
    premiumMid: 2.15,
    bid: 2.1,
    ask: 2.2,
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

  await Promise.all([
    putJsonObject(bucket, `raw-data/${TEST_DATE}/${ticker.symbol}/options.json`, optionsFixture),
    putJsonObject(
      bucket,
      `raw-data/${TEST_DATE}/${ticker.symbol}/fundamentals.json`,
      fundamentalsFixture,
    ),
    putJsonObject(
      bucket,
      `raw-data/${TEST_DATE}/${ticker.symbol}/technicals.json`,
      technicalsFixture,
    ),
    putJsonObject(bucket, `enriched/${TEST_DATE}/${ticker.symbol}.json`, fixtureEnrichedTicker),
  ]);
});

describe('runLlmAnalysis Lambda — Stage 1 (per ticker)', () => {
  let analysis: TickerAnalysis;

  beforeAll(async () => {
    const result = await invokeLambda<TickerAnalysis>(names.runLlmAnalysisFn, {
      stage: 1,
      ticker,
      enriched: fixtureEnrichedTicker,
      date: TEST_DATE,
      marketContext: marketContextFixture,
    });

    expect(result.statusCode).toBe(200);
    analysis = result.payload;
  });

  it('returns a valid recommendation', () => {
    const validRecommendations = [
      'COVERED_CALL',
      'PUT_CREDIT_SPREAD',
      'CSP',
      'IRON_CONDOR',
      'SKIP',
      'WATCH',
    ];
    expect(validRecommendations).toContain(analysis.recommendation);
  });

  it('returns a valid confidence level', () => {
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(analysis.confidence);
  });

  it('includes non-empty reasoning', () => {
    expect(typeof analysis.reasoning).toBe('string');
    expect(analysis.reasoning.length).toBeGreaterThan(20);
  });

  it('includes a risks array', () => {
    expect(analysis.risks).toBeInstanceOf(Array);
  });

  it('returns numeric ROBP when recommendation is not SKIP', () => {
    if (analysis.recommendation !== 'SKIP' && analysis.recommendation !== 'WATCH') {
      expect(typeof analysis.robpAnnualised).toBe('number');
      expect(analysis.robpAnnualised).toBeGreaterThan(0);
    }
  });
});

describe('runLlmAnalysis Lambda — Stage 2 (portfolio synthesis)', () => {
  const fixtureAnalyses: TickerAnalysis[] = [
    {
      symbol: 'AAPL',
      recommendation: 'COVERED_CALL',
      confidence: 'HIGH',
      adjustedStrike: 190.0,
      adjustedExpiry: '2026-05-16',
      reasoning: 'IV rank at 62, bullish trend, earnings clear. Premium covers ATR.',
      risks: ['Near 52w high', 'Ex-dividend in 11 days'],
      flags: [],
      annualisedYield: 14.8,
      maxLoss: 16285,
      buyingPowerRequired: 18925,
      robpAnnualised: 14.8,
    },
  ];

  let synthesis: PortfolioSynthesis;

  beforeAll(async () => {
    const result = await invokeLambda<PortfolioSynthesis>(names.runLlmAnalysisFn, {
      stage: 2,
      tickerAnalyses: fixtureAnalyses,
      date: TEST_DATE,
      marketContext: marketContextFixture,
    });

    expect(result.statusCode).toBe(200);
    synthesis = result.payload;
  });

  it('returns top picks array', () => {
    expect(synthesis.topPicks).toBeInstanceOf(Array);
    expect(synthesis.topPicks.length).toBeGreaterThan(0);
  });

  it('each top pick has required fields', () => {
    synthesis.topPicks.forEach(pick => {
      expect(typeof pick.symbol).toBe('string');
      expect(typeof pick.tradeDescription).toBe('string');
      expect(pick.tradeDescription.length).toBeGreaterThan(10);
      expect(typeof pick.robpAnnualised).toBe('number');
    });
  });

  it('includes a non-empty executive summary', () => {
    expect(typeof synthesis.executiveSummary).toBe('string');
    expect(synthesis.executiveSummary.length).toBeGreaterThan(20);
  });

  it('includes a macro note', () => {
    expect(typeof synthesis.macroNote).toBe('string');
    expect(synthesis.macroNote.length).toBeGreaterThan(10);
  });
});
