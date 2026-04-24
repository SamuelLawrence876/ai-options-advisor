import { OhlcvBar } from '../../types';

interface PolygonAggResult {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface PolygonAggsResponse {
  results?: PolygonAggResult[];
  status: string;
  resultsCount?: number;
}

function toPolygonTicker(symbol: string): string {
  if (symbol === '^VIX') return 'I:VIX';
  return symbol;
}

export async function fetchPolygonOhlcv(
  symbol: string,
  fromDate: string,
  toDate: string,
  apiKey: string,
): Promise<OhlcvBar[]> {
  const ticker = toPolygonTicker(symbol);
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=365&apiKey=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Polygon HTTP ${response.status} for ${symbol}: ${body}`);
  }

  const data = (await response.json()) as PolygonAggsResponse;
  if (!data.results?.length) {
    throw new Error(`No Polygon OHLCV data for ${symbol}: status=${data.status}`);
  }

  return data.results
    .map(r => ({
      date: new Date(r.t).toISOString().slice(0, 10),
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    }))
    .filter(b => b.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}
