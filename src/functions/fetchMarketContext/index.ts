import { MacroEvent, MarketContext, MarketTrend, WatchlistItem } from '../../types';
import { getActiveWatchlist } from '../../utils/aws/watchlistRepository';
import { error, info } from '../../utils/logger';
import { classifyMarketTrend, classifyVixRegime } from '../../utils/marketRegime';
import { computeMovingAverage } from '../../utils/technicalIndicators';
import { putJson } from '../../utils/aws/s3Json';
import { getSecretValue } from '../../utils/aws/secrets';
import { fetchFinnhubEarningsCalendar } from '../../utils/clients/finnhubEarnings';
import { daysBetween, dateOffsetDays, resolveApiDate } from '../../utils/dates';
import { fetchMarketBars } from './marketBars';
import macroCalendarRaw from '../../data/macro-calendar.json';

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
  const finnhubArn = process.env.FINNHUB_SECRET_ARN!;
  const polygonArn = process.env.POLYGON_SECRET_ARN!;

  const date = event.date ?? new Date().toISOString().slice(0, 10);
  const apiDate = resolveApiDate(date);
  const from100d = dateOffsetDays(apiDate, -100);

  info('fetch-market-context started', { date });

  const [finnhubKey, polygonKey, tickers] = await Promise.all([
    getSecretValue(finnhubArn),
    getSecretValue(polygonArn),
    getActiveWatchlist(watchlistTable),
  ]);

  const { spyBars, qqqBars, vixPrice, spyPrice, qqqPrice } = await fetchMarketBars(
    finnhubKey,
    polygonKey,
    from100d,
    apiDate,
  );

  const spyMa20 = computeMovingAverage(
    spyBars.map(b => b.close),
    20,
  );
  const spyMa50 = computeMovingAverage(
    spyBars.map(b => b.close),
    50,
  );
  const qqqMa20 = computeMovingAverage(
    qqqBars.map(b => b.close),
    20,
  );
  const qqqMa50 = computeMovingAverage(
    qqqBars.map(b => b.close),
    50,
  );

  const spyTrend = classifyMarketTrend(spyPrice, spyMa20, spyMa50);
  const qqqTrend = classifyMarketTrend(qqqPrice, qqqMa20, qqqMa50);
  const bullCount = [spyTrend, qqqTrend].filter(t => t === 'BULL').length;
  const bearCount = [spyTrend, qqqTrend].filter(t => t === 'BEAR').length;
  const marketTrend: MarketTrend =
    bullCount > bearCount ? 'BULL' : bearCount > bullCount ? 'BEAR' : 'NEUTRAL';

  const earningsCalendar = await fetchFinnhubEarningsCalendar(
    apiDate,
    dateOffsetDays(apiDate, 90),
    finnhubKey,
  ).catch(err => {
    error('Failed to fetch earnings calendar', err as Error);
    return {} as Record<string, string>;
  });

  const macroEvents: MacroEvent[] = (macroCalendarRaw as Omit<MacroEvent, 'daysAway'>[])
    .map(e => ({ ...e, daysAway: daysBetween(e.date, apiDate) }))
    .filter(e => e.daysAway >= 0 && e.daysAway <= 21)
    .sort((a, b) => a.daysAway - b.daysAway);

  const marketContext: MarketContext = {
    date,
    vix: vixPrice,
    vixRegime: classifyVixRegime(vixPrice),
    spyPrice,
    spyTrend,
    qqqPrice,
    qqqTrend,
    marketTrend,
    macroEvents,
    fetchedAt: new Date().toISOString(),
  };

  await Promise.all([
    putJson(bucketName, `raw-data/${date}/market-context.json`, marketContext),
    putJson(bucketName, `raw-data/${date}/earnings-calendar.json`, earningsCalendar),
  ]);

  info('fetch-market-context complete', {
    date,
    vix: vixPrice,
    marketTrend,
    tickerCount: tickers.length,
  });

  return { date, marketContext, tickers };
};
