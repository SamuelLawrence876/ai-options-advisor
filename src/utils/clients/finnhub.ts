import { OhlcvBar } from '../../types';

const BASE_URL = 'https://finnhub.io/api/v1';

interface FinnhubCandleResponse {
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
  t: number[];
  s: string;
}

interface FinnhubQuoteResponse {
  c: number;
  pc: number;
}

interface FinnhubEarningsEvent {
  symbol: string;
  date: string;
}

interface FinnhubEarningsCalendarResponse {
  earningsCalendar: FinnhubEarningsEvent[];
}

export async function fetchFinnhubOhlcv(
  symbol: string,
  fromDate: string,
  toDate: string,
  apiKey: string,
): Promise<OhlcvBar[]> {
  const from = Math.floor(new Date(fromDate).getTime() / 1000);
  const to = Math.floor(new Date(toDate).getTime() / 1000);
  const url = `${BASE_URL}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${apiKey}`;
  const response = await fetch(url);
  const data = (await response.json()) as FinnhubCandleResponse;
  if (data.s !== 'ok' || !data.t?.length) {
    throw new Error(`No Finnhub candle data for ${symbol}: status=${data.s}`);
  }
  return data.t
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: data.o[i] ?? 0,
      high: data.h[i] ?? 0,
      low: data.l[i] ?? 0,
      close: data.c[i] ?? 0,
      volume: data.v[i] ?? 0,
    }))
    .filter(b => b.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<number> {
  const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const response = await fetch(url);
  const data = (await response.json()) as FinnhubQuoteResponse;
  const price = data.c > 0 ? data.c : data.pc;
  if (!price) {
    throw new Error(`No Finnhub quote for ${symbol}`);
  }
  return price;
}

export async function fetchFinnhubEarningsCalendar(
  fromDate: string,
  toDate: string,
  apiKey: string,
): Promise<Record<string, string>> {
  const url = `${BASE_URL}/calendar/earnings?from=${fromDate}&to=${toDate}&token=${apiKey}`;
  const response = await fetch(url);
  const data = (await response.json()) as FinnhubEarningsCalendarResponse;
  const result: Record<string, string> = {};
  for (const event of data.earningsCalendar ?? []) {
    if (event.symbol && event.date && !result[event.symbol]) {
      result[event.symbol] = event.date;
    }
  }
  return result;
}
