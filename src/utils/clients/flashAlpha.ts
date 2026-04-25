import { CandidateStrike, OptionsData, VolSurfacePoint } from '../../types';

const LAB_BASE_URL = 'https://lab.flashalpha.com';
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_DELAY_MS = 2_000;

interface FlashAlphaStockSummaryResponse {
  symbol: string;
  ivRank?: number;
  iv_rank?: number;
  ivPercentile?: number;
  iv_percentile?: number;
  volatility?: {
    atm_iv?: number;
    hv_20?: number;
    hv_30?: number;
    hv_60?: number;
    iv_rank?: number;
    iv_percentile?: number;
  };
  exposure?: {
    gamma_flip?: number;
    call_wall?: number;
    put_wall?: number;
  } | null;
}

interface FlashAlphaOptionQuote {
  strike: number;
  expiry: string;
  type: 'C' | 'P' | 'Call' | 'Put' | 'call' | 'put';
  delta: number;
  theta: number;
  vega: number;
  bid: number;
  ask: number;
  mid?: number;
  implied_vol?: number;
  open_interest?: number;
  openInterest?: number;
  volume: number;
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

async function fetchJsonWithRateLimitRetry<T>(
  url: string,
  symbol: string,
  apiKey?: string,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: apiKey
        ? {
            'X-Api-Key': apiKey,
            'User-Agent': 'ai-options-advisor/0.1',
          }
        : {
            'User-Agent': 'ai-options-advisor/0.1',
          },
    });

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

function requireNumber(value: number | undefined, field: string, symbol: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`FlashAlpha response for ${symbol} did not include ${field}`);
}

function optionType(type: FlashAlphaOptionQuote['type']): 'call' | 'put' {
  return type.toLowerCase().startsWith('c') ? 'call' : 'put';
}

function dte(expiry: string): number {
  return Math.max(Math.round((new Date(expiry).getTime() - Date.now()) / 86400000), 0);
}

function stockSummaryUrl(symbol: string): string {
  return `${LAB_BASE_URL}/v1/stock/${encodeURIComponent(symbol)}/summary`;
}

export async function fetchFlashAlphaIv(symbol: string, apiKey: string): Promise<number> {
  const data = await fetchJsonWithRateLimitRetry<FlashAlphaStockSummaryResponse>(
    stockSummaryUrl(symbol),
    symbol,
    apiKey,
  );
  return requireNumber(data.volatility?.atm_iv, 'volatility.atm_iv', symbol);
}

export async function fetchFlashAlphaOptions(symbol: string, apiKey: string): Promise<OptionsData> {
  const quotes = await fetchJsonWithRateLimitRetry<FlashAlphaOptionQuote[] | FlashAlphaOptionQuote>(
    `${LAB_BASE_URL}/optionquote/${encodeURIComponent(symbol)}`,
    symbol,
    apiKey,
  );
  const summary = await fetchJsonWithRateLimitRetry<FlashAlphaStockSummaryResponse>(
    stockSummaryUrl(symbol),
    symbol,
    apiKey,
  );
  const quoteArray = Array.isArray(quotes) ? quotes : [quotes];

  const volSurface: VolSurfacePoint[] = quoteArray.map(q => ({
    expiry: q.expiry,
    strike: q.strike,
    iv: requireNumber(q.implied_vol, 'optionquote[].implied_vol', symbol) * 100,
    delta: q.delta,
  }));

  const candidateStrikes: CandidateStrike[] = quoteArray.map(q => ({
    expiry: q.expiry,
    dte: dte(q.expiry),
    strike: q.strike,
    optionType: optionType(q.type),
    delta: q.delta,
    theta: q.theta,
    vega: q.vega,
    bid: q.bid,
    ask: q.ask,
    mid: q.mid ?? (q.bid + q.ask) / 2,
    openInterest: q.open_interest ?? q.openInterest ?? 0,
    volume: q.volume,
  }));

  return {
    symbol,
    ivRank: requireNumber(
      summary.ivRank ?? summary.iv_rank ?? summary.volatility?.iv_rank,
      'iv_rank',
      symbol,
    ),
    ivPercentile: requireNumber(
      summary.ivPercentile ?? summary.iv_percentile ?? summary.volatility?.iv_percentile,
      'iv_percentile',
      symbol,
    ),
    iv30d: requireNumber(summary.volatility?.atm_iv, 'volatility.atm_iv', symbol),
    hv30d: requireNumber(
      summary.volatility?.hv_30 ?? summary.volatility?.hv_20 ?? summary.volatility?.hv_60,
      'historical volatility',
      symbol,
    ),
    volSurface,
    candidateStrikes,
    gammaFlip: summary.exposure?.gamma_flip,
    callWall: summary.exposure?.call_wall,
    putWall: summary.exposure?.put_wall,
    fetchedAt: new Date().toISOString(),
  };
}
