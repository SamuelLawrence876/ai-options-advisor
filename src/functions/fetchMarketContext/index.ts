import { MarketContext, MarketTrend, OhlcvBar, VixRegime, WatchlistItem } from '../../types';
import { getActiveWatchlist } from '../../utils/dynamodb';
import { error, info } from '../../utils/logger';
import { computeMovingAverage } from '../../utils/metrics';
import { putJson } from '../../utils/s3';
import { getSecretValue } from '../../utils/secrets';

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

interface YahooChartResponse {
  chart: {
    result?: Array<{
      timestamp: number[];
      indicators: { quote: Array<{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }> };
    }>;
    error?: unknown;
  };
}

async function fetchYahooOhlcv(symbol: string): Promise<OhlcvBar[]> {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=60d`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = (await response.json()) as YahooChartResponse;
  const result = data.chart.result?.[0];
  if (!result) throw new Error(`No Yahoo Finance data for ${symbol}: ${JSON.stringify(data.chart.error)}`);

  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];

  return timestamp
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: quote.open[i] ?? 0,
      high: quote.high[i] ?? 0,
      low: quote.low[i] ?? 0,
      close: quote.close[i] ?? 0,
      volume: quote.volume[i] ?? 0,
    }))
    .filter((b) => b.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchFlashAlphaIv(symbol: string, apiKey: string): Promise<number> {
  const url = `https://api.flashalpha.com/v1/iv?symbol=${symbol}&apikey=${apiKey}`;
  const response = await fetch(url);
  const data = (await response.json()) as { iv30d?: number; impliedVolatility?: number };
  return data.iv30d ?? data.impliedVolatility ?? 0;
}

function classifyVixRegime(vix: number): VixRegime {
  if (vix < 15) return 'LOW';
  if (vix < 25) return 'NORMAL';
  if (vix < 35) return 'ELEVATED';
  return 'EXTREME';
}

function classifyMarketTrend(price: number, ma20: number, ma50: number): MarketTrend {
  if (price > ma50 && ma20 > ma50) return 'BULL';
  if (price < ma50 && ma20 < ma50) return 'BEAR';
  return 'NEUTRAL';
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
    fetchYahooOhlcv('^VIX'),
    fetchYahooOhlcv('SPY'),
    fetchYahooOhlcv('QQQ'),
  ]);

  const vixCloses = vixBars.map((b) => b.close);
  const spyCloses = spyBars.map((b) => b.close);
  const qqqCloses = qqqBars.map((b) => b.close);

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
  const bullCount = [spyTrend, qqqTrend].filter((t) => t === 'BULL').length;
  const bearCount = [spyTrend, qqqTrend].filter((t) => t === 'BEAR').length;
  const marketTrend: MarketTrend =
    bullCount > bearCount ? 'BULL' : bearCount > bullCount ? 'BEAR' : 'NEUTRAL';

  const requiredSectors = new Set(tickers.map((t) => t.sector).filter(Boolean) as string[]);
  const requiredEtfs = Array.from(requiredSectors)
    .map((s) => SECTOR_ETF_MAP[s])
    .filter(Boolean) as string[];

  const sectorIvs: Record<string, number> = {};
  await Promise.allSettled(
    requiredEtfs.map(async (etf) => {
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
