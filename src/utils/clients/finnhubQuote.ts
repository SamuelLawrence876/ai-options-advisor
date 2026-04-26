import { buildFinnhubUrl } from './finnhubRequest';

interface FinnhubQuoteResponse {
  c: number;
  pc: number;
}

export async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<number> {
  const url = buildFinnhubUrl('/quote', { symbol, token: apiKey });
  const response = await fetch(url);
  const data = (await response.json()) as FinnhubQuoteResponse;
  const price = data.c > 0 ? data.c : data.pc;
  if (!price) {
    throw new Error(`No Finnhub quote for ${symbol}`);
  }
  return price;
}
