import marketContextFixture from './fixtures/market-context.json';
import watchlistItemFixture from './fixtures/watchlist-item.json';
import { getBucketName, getRegion, getStage, resourceNames } from './utils/config';
import { invokeLambda } from './utils/lambda';
import { getJsonObject, objectExists } from './utils/s3';
import { FundamentalsData, OptionsData, TechnicalsData, WatchlistItem } from '../src/types';

jest.setTimeout(120000);

const TEST_DATE = `acceptance-${Date.now()}`;
const stage = getStage();
const region = getRegion();
const names = resourceNames(stage);
const ticker = watchlistItemFixture as WatchlistItem;

const baseEvent = {
  ticker,
  date: TEST_DATE,
  marketContext: marketContextFixture,
};

let bucket: string;

beforeAll(async () => {
  bucket = await getBucketName(stage, region);
});

describe('fetchOptionsData Lambda', () => {
  it('invokes without error and writes options.json to S3', async () => {
    const result = await invokeLambda(names.fetchOptionsDataFn, baseEvent);
    expect(result.statusCode).toBe(200);

    const key = `raw-data/${TEST_DATE}/${ticker.symbol}/options.json`;
    await expect(objectExists(bucket, key)).resolves.toBe(true);
  });

  it('options.json has required volatility fields', async () => {
    const data = await getJsonObject<OptionsData>(
      bucket,
      `raw-data/${TEST_DATE}/${ticker.symbol}/options.json`,
    );
    expect(typeof data.ivRank).toBe('number');
    expect(typeof data.ivPercentile).toBe('number');
    expect(typeof data.iv30d).toBe('number');
    expect(typeof data.hv30d).toBe('number');
    expect(data.candidateStrikes).toBeInstanceOf(Array);
    expect(data.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('fetchFundamentals Lambda', () => {
  it('invokes without error and writes fundamentals.json to S3', async () => {
    const result = await invokeLambda(names.fetchFundamentalsFn, baseEvent);
    expect(result.statusCode).toBe(200);

    const key = `raw-data/${TEST_DATE}/${ticker.symbol}/fundamentals.json`;
    await expect(objectExists(bucket, key)).resolves.toBe(true);
  });

  it('fundamentals.json has required fields', async () => {
    const data = await getJsonObject<FundamentalsData>(
      bucket,
      `raw-data/${TEST_DATE}/${ticker.symbol}/fundamentals.json`,
    );
    expect(data.symbol).toBe(ticker.symbol);
    expect(data.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('fetchTechnicals Lambda', () => {
  it('invokes without error and writes technicals.json to S3', async () => {
    const result = await invokeLambda(names.fetchTechnicalsFn, baseEvent);
    expect(result.statusCode).toBe(200);

    const key = `raw-data/${TEST_DATE}/${ticker.symbol}/technicals.json`;
    await expect(objectExists(bucket, key)).resolves.toBe(true);
  });

  it('technicals.json has computed indicators', async () => {
    const data = await getJsonObject<TechnicalsData>(
      bucket,
      `raw-data/${TEST_DATE}/${ticker.symbol}/technicals.json`,
    );
    expect(data.symbol).toBe(ticker.symbol);
    expect(data.price).toBeGreaterThan(0);
    expect(data.ma20).toBeGreaterThan(0);
    expect(data.ma50).toBeGreaterThan(0);
    expect(['BULLISH', 'NEUTRAL', 'BEARISH']).toContain(data.trend);
    expect(data.atr14).toBeGreaterThan(0);
    expect(data.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
