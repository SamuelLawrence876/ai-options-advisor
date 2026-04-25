import { fetchFlashAlphaIv, fetchFlashAlphaOptions } from './flashAlpha';

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('FlashAlpha client', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws on non-rate-limit provider errors', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }));

    await expect(fetchFlashAlphaOptions('AAPL', 'key')).rejects.toThrow(
      'FlashAlpha returned 404 for AAPL: not found',
    );
  });

  it('waits and retries rate-limited requests', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse({ volatility: { atm_iv: 24.5 } }));

    await expect(fetchFlashAlphaIv('AAPL', 'key')).resolves.toBe(24.5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps documented quote and summary responses into options data', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse([
          {
            type: 'C',
            expiry: '2099-05-16',
            strike: 190,
            bid: 2.1,
            ask: 2.2,
            mid: 2.15,
            implied_vol: 0.315,
            delta: 0.3,
            theta: -0.058,
            vega: 0.21,
            open_interest: 6140,
            volume: 521,
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          symbol: 'AAPL',
          iv_rank: 62,
          iv_percentile: 58,
          volatility: { atm_iv: 28.4, hv_20: 19.1 },
          exposure: { gamma_flip: 185, call_wall: 200, put_wall: 175 },
        }),
      );

    const data = await fetchFlashAlphaOptions('AAPL', 'key');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://lab.flashalpha.com/optionquote/AAPL',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Api-Key': 'key' }),
      }),
    );
    expect(data.ivRank).toBe(62);
    expect(data.ivPercentile).toBe(58);
    expect(data.iv30d).toBe(28.4);
    expect(data.hv30d).toBe(19.1);
    expect(data.volSurface[0]).toMatchObject({ expiry: '2099-05-16', strike: 190, iv: 31.5 });
    expect(data.candidateStrikes[0]).toMatchObject({
      optionType: 'call',
      mid: 2.15,
      openInterest: 6140,
    });
    expect(data.gammaFlip).toBe(185);
  });
});
