import { buildDiscordMessages, sendDiscordReport } from './discord';

describe('buildDiscordMessages', () => {
  it('builds a header message and report chunks within the Discord limit', () => {
    const report = ['# Options Analysis', 'A'.repeat(1850), 'B'.repeat(100)].join('\n');
    const messages = buildDiscordMessages(report, 'https://example.com/report', '2026-04-25', 3);

    expect(messages[0]).toEqual({
      content:
        'Options Analysis - 2026-04-25 - 3 top picks\nFull report: https://example.com/report',
    });
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every(message => message.content.length <= 2000)).toBe(true);
  });
});

describe('sendDiscordReport', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts each Discord payload to the webhook', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendDiscordReport(
      'https://discord.test/webhook',
      '# Report',
      'https://example.com/report',
      '2026-04-25',
      1,
    );

    expect(fetchMock).toHaveBeenCalledWith('https://discord.test/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content:
          'Options Analysis - 2026-04-25 - 1 top picks\nFull report: https://example.com/report',
      }),
    });
    expect(fetchMock).toHaveBeenCalledWith('https://discord.test/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# Report' }),
    });
  });

  it('throws when Discord rejects a payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue('bad payload'),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendDiscordReport(
        'https://discord.test/webhook',
        '# Report',
        'https://example.com/report',
        '2026-04-25',
        1,
      ),
    ).rejects.toThrow('Discord webhook failed with 400: bad payload');
  });
});
