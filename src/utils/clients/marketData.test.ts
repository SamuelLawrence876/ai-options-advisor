import { fetchMarketDataOptions } from './marketData';

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

const chainResponse = {
  s: 'ok',
  optionSymbol: ['MSFT260522C00445000', 'MSFT260522P00400000'],
  expiration: [1779480000, 1779480000],
  side: ['call', 'put'],
  strike: [445, 400],
  dte: [29, 29],
  bid: [7.7, 10.4],
  ask: [8, 11.2],
  mid: [7.85, 10.8],
  last: [8.15, 10.85],
  openInterest: [521, 959],
  volume: [68, 195],
  iv: [0.3772, 0.4014],
  delta: [0.2961, -0.3279],
  gamma: [0.0077, 0.0076],
  theta: [-0.2756, -0.2789],
  vega: [40.6063, 42.4404],
  underlyingPrice: [416.785, 416.785],
};

describe('MarketData client', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps option chain arrays into options data', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(chainResponse));

    const data = await fetchMarketDataOptions('MSFT', 'token', 30);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.marketdata.app/v1/options/chain/MSFT/?dte=30');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect(data.symbol).toBe('MSFT');
    expect(data.iv30d).toBeCloseTo(38.93);
    expect(data.hv30d).toBe(0);
    expect(data.ivRank).toBeCloseTo(40.14);
    expect(data.ivRankSource).toBe('CHAIN_PROXY');
    expect(data.volSurface[0]).toMatchObject({
      expiry: '2026-05-22',
      strike: 445,
      iv: 37.72,
      delta: 0.2961,
    });
    expect(data.candidateStrikes[0]).toMatchObject({
      optionType: 'call',
      mid: 7.85,
      openInterest: 521,
      theta: 0.2756,
    });
  });

  it('throws on provider no-data responses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ s: 'no_data' }));

    await expect(fetchMarketDataOptions('JPM', 'token', 30)).rejects.toThrow(
      'MarketData returned no_data for JPM: no data',
    );
  });

  it('waits and retries rate-limited requests', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ s: 'rate_limited' }, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse(chainResponse));

    await expect(fetchMarketDataOptions('MSFT', 'token', 30)).resolves.toMatchObject({
      symbol: 'MSFT',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
