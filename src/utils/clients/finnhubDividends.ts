import { buildFinnhubUrl } from './finnhubRequest';

interface FinnhubDividendEvent {
  symbol: string;
  date: string;
  amount: number;
}

interface FinnhubBasicFinancials {
  metric?: {
    dividendYieldIndicatedAnnual?: number;
  };
}

export async function fetchFinnhubUpcomingDividend(
  symbol: string,
  fromDate: string,
  toDate: string,
  apiKey: string,
): Promise<string | undefined> {
  const url = buildFinnhubUrl('/stock/dividend', {
    symbol,
    from: fromDate,
    to: toDate,
    token: apiKey,
  });
  const response = await fetch(url);
  const data = (await response.json()) as FinnhubDividendEvent[];
  return Array.isArray(data) && data.length > 0 ? data[0].date : undefined;
}

export async function fetchFinnhubDividendYield(
  symbol: string,
  apiKey: string,
): Promise<number | undefined> {
  const url = buildFinnhubUrl('/stock/metric', { symbol, metric: 'all', token: apiKey });
  const response = await fetch(url);
  const data = (await response.json()) as FinnhubBasicFinancials;
  return data?.metric?.dividendYieldIndicatedAnnual;
}
