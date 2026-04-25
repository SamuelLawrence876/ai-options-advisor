interface CboeVixResponse {
  data: {
    current_price: number;
    close: number;
    prev_day_close: number;
  };
}

export async function fetchCboeVix(): Promise<number> {
  const url = 'https://cdn.cboe.com/api/global/delayed_quotes/quotes/_VIX.json';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CBOE VIX HTTP ${response.status}`);
  }
  const data = (await response.json()) as CboeVixResponse;
  const price = data.data.current_price || data.data.close || data.data.prev_day_close;
  if (!price) {
    throw new Error('No CBOE VIX price available');
  }
  return price;
}
