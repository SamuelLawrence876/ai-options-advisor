import fundamentalsFixture from './fixtures/fundamentals.json';
import marketContextFixture from './fixtures/market-context.json';
import optionsFixture from './fixtures/options.json';
import technicalsFixture from './fixtures/technicals.json';
import watchlistItemFixture from './fixtures/watchlist-item.json';
import { getBucketName, getRegion, getStage, resourceNames } from './utils/config';
import { invokeLambda } from './utils/lambda';
import { getJsonObject, objectExists, putJsonObject } from './utils/s3';
import { EnrichedTicker, WatchlistItem } from '../src/types';

jest.setTimeout(60000);

const TEST_DATE = `acceptance-${Date.now()}`;
const stage = getStage();
const region = getRegion();
const names = resourceNames(stage);
const ticker = watchlistItemFixture as WatchlistItem;

let bucket: string;

beforeAll(async () => {
  bucket = await getBucketName(stage, region);

  await Promise.all([
    putJsonObject(bucket, `raw-data/${TEST_DATE}/${ticker.symbol}/options.json`, optionsFixture),
    putJsonObject(bucket, `raw-data/${TEST_DATE}/${ticker.symbol}/fundamentals.json`, fundamentalsFixture),
    putJsonObject(bucket, `raw-data/${TEST_DATE}/${ticker.symbol}/technicals.json`, technicalsFixture),
  ]);
});

describe('enrichAndScore Lambda', () => {
  it('invokes without error and writes enriched JSON to S3', async () => {
    const result = await invokeLambda(names.enrichAndScoreFn, {
      ticker,
      date: TEST_DATE,
      marketContext: marketContextFixture,
    });

    expect(result.statusCode).toBe(200);

    const key = `enriched/${TEST_DATE}/${ticker.symbol}.json`;
    await expect(objectExists(bucket, key)).resolves.toBe(true);
  });

  it('enriched output has all required signal fields', async () => {
    const enriched = await getJsonObject<EnrichedTicker>(
      bucket,
      `enriched/${TEST_DATE}/${ticker.symbol}.json`,
    );

    expect(enriched.ticker.symbol).toBe(ticker.symbol);
    expect(typeof enriched.vrp).toBe('number');
    expect(['SELL_ENVIRONMENT', 'SKIP']).toContain(enriched.ivRankSignal);
    expect(['ABOVE', 'BELOW', 'INLINE']).toContain(enriched.ivVsSector);
    expect(typeof enriched.earningsInWindow).toBe('boolean');
    expect(['CLEAR', 'CAUTION', 'DANGER']).toContain(enriched.earningsProximity);
    expect(typeof enriched.liquidityOk).toBe('boolean');
  });

  it('VRP is correctly computed as iv30d minus hv30d', async () => {
    const enriched = await getJsonObject<EnrichedTicker>(
      bucket,
      `enriched/${TEST_DATE}/${ticker.symbol}.json`,
    );

    const expectedVrp = optionsFixture.iv30d - optionsFixture.hv30d;
    expect(enriched.vrp).toBeCloseTo(expectedVrp, 2);
  });

  it('strategy is SKIP when IV rank is below 50', async () => {
    const lowIvOptions = { ...optionsFixture, ivRank: 35 };
    await putJsonObject(
      bucket,
      `raw-data/${TEST_DATE}/${ticker.symbol}/options.json`,
      lowIvOptions,
    );

    const result = await invokeLambda<EnrichedTicker>(names.enrichAndScoreFn, {
      ticker,
      date: TEST_DATE,
      marketContext: marketContextFixture,
    });

    expect(result.payload.suggestedStrategy).toBe('SKIP');

    await putJsonObject(
      bucket,
      `raw-data/${TEST_DATE}/${ticker.symbol}/options.json`,
      optionsFixture,
    );
  });

  it('strategy is SKIP when earnings fall inside the expiry window', async () => {
    const earningsInWindowFundamentals = {
      ...fundamentalsFixture,
      earningsDate: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
      earningsDte: 20,
    };
    await putJsonObject(
      bucket,
      `raw-data/${TEST_DATE}/${ticker.symbol}/fundamentals.json`,
      earningsInWindowFundamentals,
    );

    const result = await invokeLambda<EnrichedTicker>(names.enrichAndScoreFn, {
      ticker,
      date: TEST_DATE,
      marketContext: marketContextFixture,
    });

    expect(result.payload.suggestedStrategy).toBe('SKIP');

    await putJsonObject(
      bucket,
      `raw-data/${TEST_DATE}/${ticker.symbol}/fundamentals.json`,
      fundamentalsFixture,
    );
  });

  it('candidate trade has positive ROBP when strategy is viable', async () => {
    const result = await invokeLambda<EnrichedTicker>(names.enrichAndScoreFn, {
      ticker,
      date: TEST_DATE,
      marketContext: marketContextFixture,
    });

    const enriched = result.payload;

    if (enriched.suggestedStrategy !== 'SKIP' && enriched.candidateTrade) {
      expect(enriched.candidateTrade.robpAnnualised).toBeGreaterThan(0);
      expect(enriched.candidateTrade.bpr).toBeGreaterThan(0);
      expect(enriched.candidateTrade.maxLoss).toBeGreaterThan(0);
    }
  });
});
