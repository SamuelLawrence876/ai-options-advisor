const LAB_BASE_URL = 'https://lab.flashalpha.com';
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_DELAY_MS = 2_000;

interface FlashAlphaStockSummaryResponse {
  symbol: string;
  ivRank?: number;
  iv_rank?: number;
  ivPercentile?: number;
  iv_percentile?: number;
  volatility?: {
    atm_iv?: number;
    hv_20?: number;
    hv_30?: number;
    hv_60?: number;
    iv_rank?: number;
    iv_percentile?: number;
  };
  exposure?: {
    gamma_flip?: number;
    call_wall?: number;
    put_wall?: number;
  } | null;
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
  apiKey?: string,
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: apiKey
        ? {
            'X-Api-Key': apiKey,
            'User-Agent': 'ai-options-advisor/0.1',
          }
        : {
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
      throw new Error(`FlashAlpha returned ${response.status} for ${symbol}${detail}`);
    }

    return (await response.json()) as T;
  }

  throw new Error(`FlashAlpha rate limit retries exhausted for ${symbol}`);
}

function requireNumber(value: number | undefined, field: string, symbol: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`FlashAlpha response for ${symbol} did not include ${field}`);
}

function stockSummaryUrl(symbol: string): string {
  return `${LAB_BASE_URL}/v1/stock/${encodeURIComponent(symbol)}/summary`;
}

export async function fetchFlashAlphaIv(symbol: string, apiKey: string): Promise<number> {
  const data = await fetchJsonWithRateLimitRetry<FlashAlphaStockSummaryResponse>(
    stockSummaryUrl(symbol),
    symbol,
    apiKey,
  );
  return requireNumber(data.volatility?.atm_iv, 'volatility.atm_iv', symbol);
}
