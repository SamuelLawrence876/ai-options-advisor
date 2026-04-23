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

async function fetchAlphaVantageDailyOhlcv(
  symbol: string,
  apiKey: string,
): Promise<OhlcvBar[]> {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=compact&apikey=${apiKey}`;
  const response = await fetch(url);
  const data = (await response.json()) as Record<string, unknown>;
  const series = data['Time Series (Daily)'] as Record<string, Record<string, string>> | undefined;
  if (!series) throw new Error(`No daily data for ${symbol}: ${JSON.stringify(data)}`);

  return Object.entries(series)
    .map(([date, bar]) => ({
      date,
      open: parseFloat(bar['1. open']),
      high: parseFloat(bar['2. high']),
      low: parseFloat(bar['3. low']),
      close: parseFloat(bar['5. adjusted close']),
      volume: parseFloat(bar['6. volume']),
    }))
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
  const alphaVantageArn = process.env.ALPHA_VANTAGE_SECRET_ARN!;

  const date = event.date ?? new Date().toISOString().slice(0, 10);

  info('fetch-market-context started', { date });

  const [flashAlphaKey, alphaVantageKey, tickers] = await Promise.all([
    getSecretValue(flashAlphaArn),
    getSecretValue(alphaVantageArn),
    getActiveWatchlist(watchlistTable),
  ]);

  const [vixBars, spyBars, qqqBars] = await Promise.all([
    fetchAlphaVantageDailyOhlcv('VIX', alphaVantageKey),
    fetchAlphaVantageDailyOhlcv('SPY', alphaVantageKey),
    fetchAlphaVantageDailyOhlcv('QQQ', alphaVantageKey),
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
