import { CandidateStrike, MarketContext, OptionsData, VolSurfacePoint, WatchlistItem } from '../../types';
import { error, info } from '../../utils/logger';
import { putJson } from '../../utils/s3';
import { getSecretValue } from '../../utils/secrets';

interface FetchOptionsDataEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

interface FlashAlphaQuote {
  strike: number;
  expiry: string;
  optionType: 'call' | 'put';
  delta: number;
  theta: number;
  vega: number;
  bid: number;
  ask: number;
  openInterest: number;
  volume: number;
  iv: number;
}

interface FlashAlphaResponse {
  symbol: string;
  ivRank?: number;
  iv_rank?: number;
  ivPercentile?: number;
  iv_percentile?: number;
  iv30d?: number;
  hv30d?: number;
  volSurface?: FlashAlphaQuote[];
  vol_surface?: FlashAlphaQuote[];
  gammaFlip?: number;
  callWall?: number;
  putWall?: number;
}

async function fetchFlashAlphaOptions(
  symbol: string,
  apiKey: string,
): Promise<FlashAlphaResponse> {
  const url = `https://api.flashalpha.com/v1/options?symbol=${symbol}&apikey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FlashAlpha returned ${response.status} for ${symbol}`);
  }
  return response.json() as Promise<FlashAlphaResponse>;
}

export const handler = async (event: FetchOptionsDataEvent): Promise<FetchOptionsDataEvent> => {
  const bucketName = process.env.BUCKET_NAME!;
  const flashAlphaArn = process.env.FLASH_ALPHA_SECRET_ARN!;

  const { ticker, date } = event;
  const symbol = ticker.symbol;

  info('fetch-options-data started', { symbol, date });

  const apiKey = await getSecretValue(flashAlphaArn);

  let raw: FlashAlphaResponse | undefined;
  try {
    raw = await fetchFlashAlphaOptions(symbol, apiKey);
  } catch (err) {
    error(`FlashAlpha fetch failed for ${symbol} — writing SKIP placeholder`, err as Error);
  }

  if (!raw) {
    const placeholder: OptionsData = {
      symbol,
      ivRank: 0,
      ivPercentile: 0,
      iv30d: 0,
      hv30d: 0,
      volSurface: [],
      candidateStrikes: [],
      fetchedAt: new Date().toISOString(),
    };
    await putJson(bucketName, `raw-data/${date}/${symbol}/options.json`, placeholder);
    info('fetch-options-data wrote SKIP placeholder', { symbol, date });
    return event;
  }

  const quotes: FlashAlphaQuote[] = raw.volSurface ?? raw.vol_surface ?? [];

  const volSurface: VolSurfacePoint[] = quotes.map((q) => ({
    expiry: q.expiry,
    strike: q.strike,
    iv: q.iv,
    delta: q.delta,
  }));

  const candidateStrikes: CandidateStrike[] = quotes.map((q) => ({
    expiry: q.expiry,
    dte: Math.round((new Date(q.expiry).getTime() - Date.now()) / 86400000),
    strike: q.strike,
    optionType: q.optionType,
    delta: q.delta,
    theta: q.theta,
    vega: q.vega,
    bid: q.bid,
    ask: q.ask,
    mid: (q.bid + q.ask) / 2,
    openInterest: q.openInterest,
    volume: q.volume,
  }));

  const optionsData: OptionsData = {
    symbol,
    ivRank: raw.ivRank ?? raw.iv_rank ?? 0,
    ivPercentile: raw.ivPercentile ?? raw.iv_percentile ?? 0,
    iv30d: raw.iv30d ?? 0,
    hv30d: raw.hv30d ?? 0,
    volSurface,
    candidateStrikes,
    gammaFlip: raw.gammaFlip,
    callWall: raw.callWall,
    putWall: raw.putWall,
    fetchedAt: new Date().toISOString(),
  };

  await putJson(bucketName, `raw-data/${date}/${symbol}/options.json`, optionsData);

  info('fetch-options-data complete', { symbol, date, ivRank: optionsData.ivRank });

  return event;
};
