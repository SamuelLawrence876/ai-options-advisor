const BASE_URL = 'https://finnhub.io/api/v1';

export function buildFinnhubUrl(path: string, params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);
  return `${BASE_URL}${path}?${searchParams.toString()}`;
}
