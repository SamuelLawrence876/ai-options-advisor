interface AlphaVantageEarningsCalendar {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: string;
  currency: string;
}

export interface AlphaVantageAnalystRatings {
  symbol: string;
  targetPrice?: string;
  strongBuy?: string;
  buy?: string;
  hold?: string;
  sell?: string;
  strongSell?: string;
  analystRatingsBuy?: string;
  analystRatingsSell?: string;
  analystRatingsHold?: string;
  analystRatingsStrongSell?: string;
  analystRatingsStrongBuy?: string;
}

export interface AlphaVantageOverview {
  Symbol: string;
  DividendDate?: string;
  ExDividendDate?: string;
  DividendYield?: string;
  ForwardPE?: string;
  AnalystTargetPrice?: string;
  '52WeekHigh'?: string;
  '52WeekLow'?: string;
}

export function daysBetween(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export async function fetchEarningsCalendar(
  symbol: string,
  apiKey: string,
): Promise<AlphaVantageEarningsCalendar | undefined> {
  const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${symbol}&horizon=3month&apikey=${apiKey}`;
  const response = await fetch(url);
  const text = await response.text();
  const lines = text.trim().split('\n').slice(1);
  for (const line of lines) {
    const parts = line.split(',');
    if (parts[0] === symbol && parts.length >= 4) {
      return {
        symbol: parts[0],
        name: parts[1],
        reportDate: parts[2],
        fiscalDateEnding: parts[3],
        estimate: parts[4] ?? '',
        currency: parts[5] ?? 'USD',
      };
    }
  }
  return undefined;
}

export async function fetchCompanyOverview(
  symbol: string,
  apiKey: string,
): Promise<AlphaVantageOverview> {
  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;
  const response = await fetch(url);
  return response.json() as Promise<AlphaVantageOverview>;
}

export async function fetchAnalystRatings(
  symbol: string,
  apiKey: string,
): Promise<AlphaVantageAnalystRatings | undefined> {
  const url = `https://www.alphavantage.co/query?function=ANALYTICS_FIXED_WINDOW&SYMBOLS=${symbol}&RANGE=1month&INTERVAL=WEEKLY&OHLC=close&CALCULATIONS=MEAN,STDDEV&apikey=${apiKey}`;
  try {
    const response = await fetch(url);
    return await (response.json() as Promise<AlphaVantageAnalystRatings>);
  } catch {
    return undefined;
  }
}
