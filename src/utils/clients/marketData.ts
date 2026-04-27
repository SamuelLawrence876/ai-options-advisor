import { CandidateStrike, OptionsData, VolSurfacePoint } from '../../types';

const BASE_URL = 'https://api.marketdata.app/v1/options/chain';
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_DELAY_MS = 2_000;

interface MarketDataChainResponse {
  s: string;
  optionSymbol?: string[];
  expiration?: number[];
  side?: Array<'call' | 'put'>;
  strike?: number[];
  dte?: number[];
  bid?: number[];
  ask?: number[];
  mid?: number[];
  last?: number[];
  openInterest?: number[];
  volume?: number[];
  iv?: number[];
  delta?: number[];
  gamma?: number[];
  theta?: number[];
  vega?: number[];
  underlyingPrice?: number[];
  errmsg?: string;
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
  token: string,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
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
      throw new Error(`MarketData returned ${response.status} for ${symbol}${detail}`);
    }

    return (await response.json()) as T;
  }

  throw new Error(`MarketData rate limit retries exhausted for ${symbol}`);
}

function requireArray<T>(
  response: MarketDataChainResponse,
  field: keyof MarketDataChainResponse,
  symbol: string,
): T[] {
  const value = response[field];
  if (Array.isArray(value)) return value as T[];
  throw new Error(`MarketData response for ${symbol} did not include ${String(field)}`);
}

function expiryDate(expiration: number): string {
  return new Date(expiration * 1000).toISOString().slice(0, 10);
}

function percentile(values: number[], percentileRank: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(Math.floor((percentileRank / 100) * sorted.length), sorted.length - 1);
  return sorted[index];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function fetchMarketDataOptions(
  symbol: string,
  token: string,
  targetDte: number,
): Promise<OptionsData> {
  const params = new URLSearchParams({ dte: String(targetDte) });
  const response = await fetchJsonWithRateLimitRetry<MarketDataChainResponse>(
    `${BASE_URL}/${encodeURIComponent(symbol)}/?${params.toString()}`,
    symbol,
    token,
  );

  if (response.s !== 'ok') {
    throw new Error(
      `MarketData returned ${response.s} for ${symbol}: ${response.errmsg ?? 'no data'}`,
    );
  }

  const optionSymbols = requireArray<string>(response, 'optionSymbol', symbol);
  const expirations = requireArray<number>(response, 'expiration', symbol);
  const sides = requireArray<'call' | 'put'>(response, 'side', symbol);
  const strikes = requireArray<number>(response, 'strike', symbol);
  const dtes = requireArray<number>(response, 'dte', symbol);
  const bids = requireArray<number>(response, 'bid', symbol);
  const asks = requireArray<number>(response, 'ask', symbol);
  const mids = requireArray<number>(response, 'mid', symbol);
  const openInterests = requireArray<number>(response, 'openInterest', symbol);
  const volumes = requireArray<number>(response, 'volume', symbol);
  const ivs = requireArray<number>(response, 'iv', symbol);
  const deltas = requireArray<number>(response, 'delta', symbol);
  const thetas = requireArray<number>(response, 'theta', symbol);
  const vegas = requireArray<number>(response, 'vega', symbol);

  const candidateStrikes: CandidateStrike[] = optionSymbols.map((_, index) => ({
    expiry: expiryDate(expirations[index]),
    dte: dtes[index],
    strike: strikes[index],
    optionType: sides[index],
    delta: deltas[index],
    theta: Math.abs(thetas[index]),
    vega: vegas[index],
    bid: bids[index],
    ask: asks[index],
    mid: mids[index],
    openInterest: openInterests[index],
    volume: volumes[index],
  }));

  const volSurface: VolSurfacePoint[] = candidateStrikes.map((candidate, index) => ({
    expiry: candidate.expiry,
    strike: candidate.strike,
    iv: ivs[index] * 100,
    delta: candidate.delta,
  }));

  // iv30d uses only near-ATM strikes (|delta| 0.40–0.60) to match the industry
  // standard and avoid inflation from OTM skew. Full liquid set is still used
  // for the proxy rank, which benefits from a wider sample.
  const liquidIndices = ivs
    .map((iv, index) => ({ iv, index }))
    .filter(({ iv, index }) => Number.isFinite(iv) && iv > 0 && bids[index] > 0 && asks[index] > 0);

  const atmIvs = liquidIndices
    .filter(({ index }) => Math.abs(deltas[index]) >= 0.40 && Math.abs(deltas[index]) <= 0.60)
    .map(({ iv }) => iv * 100);

  const liquidIvs = liquidIndices.map(({ iv }) => iv * 100);

  const iv30d = average(atmIvs.length >= 2 ? atmIvs : liquidIvs);
  const ivRankProxy = Math.min(Math.max(percentile(liquidIvs, 75), 0), 100);

  return {
    symbol,
    ivRank: ivRankProxy,
    ivPercentile: ivRankProxy,
    ivRankSource: 'CHAIN_PROXY',
    iv30d,
    hv30d: 0,
    volSurface,
    candidateStrikes,
    fetchedAt: new Date().toISOString(),
  };
}
