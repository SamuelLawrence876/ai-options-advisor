import { buildFinnhubUrl } from './finnhubRequest';

interface FinnhubEarningsEvent {
  symbol: string;
  date: string;
}

interface FinnhubEarningsCalendarResponse {
  earningsCalendar: FinnhubEarningsEvent[];
}

export async function fetchFinnhubEarningsCalendar(
  fromDate: string,
  toDate: string,
  apiKey: string,
): Promise<Record<string, string>> {
  const url = buildFinnhubUrl('/calendar/earnings', {
    from: fromDate,
    to: toDate,
    token: apiKey,
  });
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
