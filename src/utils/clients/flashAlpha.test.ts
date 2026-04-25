import { fetchFlashAlphaIv } from './flashAlpha';

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('FlashAlpha client', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws on non-rate-limit provider errors', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }));

    await expect(fetchFlashAlphaIv('AAPL', 'key')).rejects.toThrow(
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
});
