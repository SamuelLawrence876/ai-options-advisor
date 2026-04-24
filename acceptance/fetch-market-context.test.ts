import { getBucketName, getRegion, getStage, resourceNames } from './utils/config';
import { getJsonObject, objectExists } from './utils/s3';
import { invokeLambda } from './utils/lambda';
import { MarketContext, WatchlistItem } from '../src/types';

jest.setTimeout(90000);

const TEST_DATE = `acceptance-${Date.now()}`;
const stage = getStage();
const region = getRegion();
const names = resourceNames(stage);

let bucket: string;

beforeAll(async () => {
  bucket = await getBucketName(stage, region);
});

describe('fetchMarketContext Lambda', () => {
  it('invokes without error and returns date, marketContext, and tickers', async () => {
    const result = await invokeLambda<{
      date: string;
      marketContext: MarketContext;
      tickers: WatchlistItem[];
    }>(names.fetchMarketContextFn, { date: TEST_DATE });

    expect(result.statusCode).toBe(200);
    expect(result.payload.date).toBe(TEST_DATE);
    expect(result.payload.tickers).toBeInstanceOf(Array);
    expect(result.payload.tickers.length).toBeGreaterThan(0);
  });

  it('writes market-context.json to S3', async () => {
    const key = `raw-data/${TEST_DATE}/market-context.json`;
    await expect(objectExists(bucket, key)).resolves.toBe(true);
  });

  it('market context has required fields with valid shapes', async () => {
    const key = `raw-data/${TEST_DATE}/market-context.json`;
    const ctx = await getJsonObject<MarketContext>(bucket, key);

    expect(typeof ctx.vix).toBe('number');
    expect(ctx.vix).toBeGreaterThan(0);
    expect(['LOW', 'NORMAL', 'ELEVATED', 'EXTREME']).toContain(ctx.vixRegime);
    expect(['BULL', 'NEUTRAL', 'BEAR']).toContain(ctx.marketTrend);
    expect(typeof ctx.spyPrice).toBe('number');
    expect(ctx.spyPrice).toBeGreaterThan(0);
    expect(typeof ctx.sectorIvs).toBe('object');
    expect(ctx.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns all active watchlist tickers', async () => {
    const key = `raw-data/${TEST_DATE}/market-context.json`;
    const ctx = await getJsonObject<MarketContext>(bucket, key);

    const result = await invokeLambda<{ tickers: WatchlistItem[] }>(names.fetchMarketContextFn, {
      date: TEST_DATE,
    });

    result.payload.tickers.forEach(ticker => {
      expect(ticker.active).toBe(true);
      expect(typeof ticker.symbol).toBe('string');
      expect(ticker.symbol.length).toBeGreaterThan(0);
    });

    expect(ctx).toBeDefined();
  });
});
