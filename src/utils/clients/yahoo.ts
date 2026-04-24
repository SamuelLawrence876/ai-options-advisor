import { OhlcvBar } from '../../types';

interface YahooChartResponse {
  chart: {
    result?: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }>;
    error?: unknown;
  };
}

function toYahooSymbol(symbol: string): string {
  return symbol.replace(/\./g, '-');
}

export async function fetchYahooOhlcv(symbol: string, range: string): Promise<OhlcvBar[]> {
  const encoded = encodeURIComponent(toYahooSymbol(symbol));
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=${range}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = (await response.json()) as YahooChartResponse;
  const result = data.chart.result?.[0];
  if (!result)
    throw new Error(`No Yahoo Finance data for ${symbol}: ${JSON.stringify(data.chart.error)}`);

  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];

  return timestamp
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
