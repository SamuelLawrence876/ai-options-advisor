import { CandidateStrike, OptionsData, VolSurfacePoint } from '../../types';

const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_DELAY_MS = 2_000;

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

interface FlashAlphaOptionsResponse {
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

interface FlashAlphaIvResponse {
  iv30d?: number;
  impliedVolatility?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return DEFAULT_RATE_LIMIT_DELAY_MS * 2 ** attempt;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return seconds * 1000;

  const date = Date.parse(retryAfter);
  if (Number.isNaN(date)) return DEFAULT_RATE_LIMIT_DELAY_MS * 2 ** attempt;

  return Math.max(date - Date.now(), 0);
}

async function fetchJsonWithRateLimitRetry<T>(url: string, symbol: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetch(url);

    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      await delay(retryAfterMs(response, attempt));
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const detail = body ? `: ${body.slice(0, 300)}` : '';
      throw new Error(`FlashAlpha returned ${response.status} for ${symbol}${detail}`);
    }

    return (await response.json()) as T;
  }

  throw new Error(`FlashAlpha rate limit retries exhausted for ${symbol}`);
}

export async function fetchFlashAlphaIv(symbol: string, apiKey: string): Promise<number> {
  const url = `https://api.flashalpha.com/v1/iv?symbol=${symbol}&apikey=${apiKey}`;
  const data = await fetchJsonWithRateLimitRetry<FlashAlphaIvResponse>(url, symbol);
  return data.iv30d ?? data.impliedVolatility ?? 0;
}

export async function fetchFlashAlphaOptions(symbol: string, apiKey: string): Promise<OptionsData> {
  const url = `https://api.flashalpha.com/v1/options?symbol=${symbol}&apikey=${apiKey}`;
  const raw = await fetchJsonWithRateLimitRetry<FlashAlphaOptionsResponse>(url, symbol);

  const quotes: FlashAlphaQuote[] = raw.volSurface ?? raw.vol_surface ?? [];

  const volSurface: VolSurfacePoint[] = quotes.map(q => ({
    expiry: q.expiry,
    strike: q.strike,
    iv: q.iv,
    delta: q.delta,
  }));

  const candidateStrikes: CandidateStrike[] = quotes.map(q => ({
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

  return {
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
}
