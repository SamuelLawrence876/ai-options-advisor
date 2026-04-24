import { CandidateStrike, OptionsData, VolSurfacePoint } from '../../types';

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

export async function fetchFlashAlphaIv(symbol: string, apiKey: string): Promise<number> {
  const url = `https://api.flashalpha.com/v1/iv?symbol=${symbol}&apikey=${apiKey}`;
  const response = await fetch(url);
  const data = (await response.json()) as FlashAlphaIvResponse;
  return data.iv30d ?? data.impliedVolatility ?? 0;
}

export async function fetchFlashAlphaOptions(symbol: string, apiKey: string): Promise<OptionsData> {
  const url = `https://api.flashalpha.com/v1/options?symbol=${symbol}&apikey=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FlashAlpha returned ${response.status} for ${symbol}`);
  }
  const raw = (await response.json()) as FlashAlphaOptionsResponse;

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
