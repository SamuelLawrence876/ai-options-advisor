import { MarketContext, MarketTrend, WatchlistItem } from '../../types';
import { getActiveWatchlist } from '../../utils/aws/dynamodb';
import { error, info } from '../../utils/logger';
import { classifyMarketTrend, classifyVixRegime, computeMovingAverage } from '../../utils/metrics';
import { putJson } from '../../utils/aws/s3';
import { getSecretValue } from '../../utils/aws/secrets';
import { fetchFlashAlphaIv } from '../../utils/clients/flashAlpha';
import { fetchFinnhubEarningsCalendar } from '../../utils/clients/finnhub';
import { dateOffsetDays } from '../../utils/dates';
import { fetchMarketBars } from './marketBars';

const SECTOR_ETF_MAP: Record<string, string> = {
  Technology: 'XLK',
  Financials: 'XLF',
  Energy: 'XLE',
  Healthcare: 'XLV',
  'Consumer Discretionary': 'XLY',
  'Consumer Staples': 'XLP',
  Industrials: 'XLI',
  Materials: 'XLB',
  Utilities: 'XLU',
  'Real Estate': 'XLRE',
  Communications: 'XLC',
};

interface FetchMarketContextEvent {
  date?: string;
}

interface FetchMarketContextResult {
  date: string;
  marketContext: MarketContext;
  tickers: WatchlistItem[];
}

export const handler = async (
  event: FetchMarketContextEvent,
): Promise<FetchMarketContextResult> => {
  const bucketName = process.env.BUCKET_NAME!;
  const watchlistTable = process.env.WATCHLIST_TABLE!;
  const flashAlphaArn = process.env.FLASH_ALPHA_SECRET_ARN!;
  const finnhubArn = process.env.FINNHUB_SECRET_ARN!;

  const date = event.date ?? new Date().toISOString().slice(0, 10);
  const from60d = dateOffsetDays(date, -60);

  info('fetch-market-context started', { date });

  const [flashAlphaKey, finnhubKey, tickers] = await Promise.all([
    getSecretValue(flashAlphaArn),
    getSecretValue(finnhubArn),
    getActiveWatchlist(watchlistTable),
  ]);

  const { vixBars, spyBars, qqqBars, vixPrice, spyPrice, qqqPrice } = await fetchMarketBars(
    finnhubKey,
    from60d,
    date,
  );

  const vix20dAvg = computeMovingAverage(vixBars.map(b => b.close), 20);
  const spyMa20 = computeMovingAverage(spyBars.map(b => b.close), 20);
  const spyMa50 = computeMovingAverage(spyBars.map(b => b.close), 50);
  const qqqMa20 = computeMovingAverage(qqqBars.map(b => b.close), 20);
  const qqqMa50 = computeMovingAverage(qqqBars.map(b => b.close), 50);

  const spyTrend = classifyMarketTrend(spyPrice, spyMa20, spyMa50);
  const qqqTrend = classifyMarketTrend(qqqPrice, qqqMa20, qqqMa50);
  const bullCount = [spyTrend, qqqTrend].filter(t => t === 'BULL').length;
  const bearCount = [spyTrend, qqqTrend].filter(t => t === 'BEAR').length;
  const marketTrend: MarketTrend =
    bullCount > bearCount ? 'BULL' : bearCount > bullCount ? 'BEAR' : 'NEUTRAL';

  const requiredSectors = new Set(
    tickers.map(t => t.sector).filter((s): s is string => Boolean(s)),
  );
  const requiredEtfs = Array.from(requiredSectors)
    .map(s => SECTOR_ETF_MAP[s])
    .filter((etf): etf is string => Boolean(etf));

  const sectorIvs: Record<string, number> = {};
  await Promise.allSettled(
    requiredEtfs.map(async etf => {
      try {
        const iv = await fetchFlashAlphaIv(etf, flashAlphaKey);
        const sector = Object.entries(SECTOR_ETF_MAP).find(([, e]) => e === etf)?.[0];
        if (sector) sectorIvs[sector] = iv;
      } catch (err) {
        error(`Failed to fetch sector IV for ${etf}`, err as Error);
      }
    }),
  );

  const earningsCalendar = await fetchFinnhubEarningsCalendar(
    date,
    dateOffsetDays(date, 90),
    finnhubKey,
  ).catch(err => {
    error('Failed to fetch earnings calendar', err as Error);
    return {} as Record<string, string>;
  });

  const marketContext: MarketContext = {
    date,
    vix: vixPrice,
    vix20dAvg,
    vixRegime: classifyVixRegime(vixPrice),
    spyPrice,
    spyTrend,
    qqqPrice,
    qqqTrend,
    marketTrend,
    sectorIvs,
    fetchedAt: new Date().toISOString(),
  };

  await Promise.all([
    putJson(bucketName, `raw-data/${date}/market-context.json`, marketContext),
    putJson(bucketName, `raw-data/${date}/earnings-calendar.json`, earningsCalendar),
  ]);

  info('fetch-market-context complete', { date, vix: vixPrice, marketTrend, tickerCount: tickers.length });

  return { date, marketContext, tickers };
};
