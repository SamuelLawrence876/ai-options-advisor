import { MarketContext, MarketTrend, WatchlistItem } from '../../types';
import { getActiveWatchlist } from '../../utils/aws/dynamodb';
import { error, info } from '../../utils/logger';
import { classifyMarketTrend, classifyVixRegime, computeMovingAverage } from '../../utils/metrics';
import { putJson } from '../../utils/aws/s3';
import { getSecretValue } from '../../utils/aws/secrets';
import { fetchFlashAlphaIv } from '../../utils/clients/flashAlpha';
import { fetchYahooOhlcv } from '../../utils/clients/yahoo';

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

  const date = event.date ?? new Date().toISOString().slice(0, 10);

  info('fetch-market-context started', { date });

  const [flashAlphaKey, tickers] = await Promise.all([
    getSecretValue(flashAlphaArn),
    getActiveWatchlist(watchlistTable),
  ]);

  const [vixBars, spyBars, qqqBars] = await Promise.all([
    fetchYahooOhlcv('^VIX', '60d'),
    fetchYahooOhlcv('SPY', '60d'),
    fetchYahooOhlcv('QQQ', '60d'),
  ]);

  const vixCloses = vixBars.map(b => b.close);
  const spyCloses = spyBars.map(b => b.close);
  const qqqCloses = qqqBars.map(b => b.close);

  const vix = vixCloses[vixCloses.length - 1] ?? 20;
  const vix20dAvg = computeMovingAverage(vixCloses, 20);

  const spyPrice = spyCloses[spyCloses.length - 1] ?? 0;
  const spyMa20 = computeMovingAverage(spyCloses, 20);
  const spyMa50 = computeMovingAverage(spyCloses, 50);

  const qqqPrice = qqqCloses[qqqCloses.length - 1] ?? 0;
  const qqqMa20 = computeMovingAverage(qqqCloses, 20);
  const qqqMa50 = computeMovingAverage(qqqCloses, 50);

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

  const marketContext: MarketContext = {
    date,
    vix,
    vix20dAvg,
    vixRegime: classifyVixRegime(vix),
    spyPrice,
    spyTrend,
    qqqPrice,
    qqqTrend,
    marketTrend,
    sectorIvs,
    fetchedAt: new Date().toISOString(),
  };

  await putJson(bucketName, `raw-data/${date}/market-context.json`, marketContext);

  info('fetch-market-context complete', { date, vix, marketTrend, tickerCount: tickers.length });

  return { date, marketContext, tickers };
};
