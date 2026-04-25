import { OhlcvBar } from '../../types';

interface YahooChartResult {
  timestamp: number[];
  indicators: {
    quote: {
      open: number[];
      high: number[];
      low: number[];
      close: number[];
      volume: number[];
    }[];
  };
}

interface YahooChartResponse {
  chart: {
    result: YahooChartResult[] | null;
    error: { code: string; description: string } | null;
  };
}

export async function fetchYahooOhlcv(
  symbol: string,
  fromDate: string,
  toDate: string,
): Promise<OhlcvBar[]> {
  const from = Math.floor(new Date(fromDate).getTime() / 1000);
  const to = Math.floor(new Date(toDate).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=1d`;

  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Yahoo Finance HTTP ${response.status} for ${symbol}: ${body}`);
  }

  const data = (await response.json()) as YahooChartResponse;
  if (data.chart.error) {
    throw new Error(`Yahoo Finance error for ${symbol}: ${data.chart.error.description}`);
  }

  const result = data.chart.result?.[0];
  if (!result?.timestamp?.length) {
    throw new Error(`No Yahoo Finance OHLCV data for ${symbol}`);
  }

  const quote = result.indicators.quote[0];
  return result.timestamp
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: quote.open[i] ?? 0,
      high: quote.high[i] ?? 0,
      low: quote.low[i] ?? 0,
      close: quote.close[i] ?? 0,
      volume: quote.volume[i] ?? 0,
    }))
    .filter(b => b.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}
