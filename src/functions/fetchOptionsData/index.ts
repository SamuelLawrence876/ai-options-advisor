import { MarketContext, OptionsData, WatchlistItem } from '../../types';
import { fetchFlashAlphaOptions } from '../../utils/clients/flashAlpha';
import { error, info } from '../../utils/logger';
import { putJson } from '../../utils/aws/s3';
import { getSecretValue } from '../../utils/aws/secrets';

interface FetchOptionsDataEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

export const handler = async (event: FetchOptionsDataEvent): Promise<FetchOptionsDataEvent> => {
  const bucketName = process.env.BUCKET_NAME!;
  const flashAlphaArn = process.env.FLASH_ALPHA_SECRET_ARN!;

  const { ticker, date } = event;
  const symbol = ticker.symbol;

  info('fetch-options-data started', { symbol, date });

  const apiKey = await getSecretValue(flashAlphaArn);

  let optionsData: OptionsData | undefined;
  try {
    optionsData = await fetchFlashAlphaOptions(symbol, apiKey);
  } catch (err) {
    error(`FlashAlpha fetch failed for ${symbol} — writing SKIP placeholder`, err as Error);
  }

  if (!optionsData) {
    const placeholder: OptionsData = {
      symbol,
      ivRank: 0,
      ivPercentile: 0,
      iv30d: 0,
      hv30d: 0,
      volSurface: [],
      candidateStrikes: [],
      fetchedAt: new Date().toISOString(),
    };
    await putJson(bucketName, `raw-data/${date}/${symbol}/options.json`, placeholder);
    info('fetch-options-data wrote SKIP placeholder', { symbol, date });
    return event;
  }

  await putJson(bucketName, `raw-data/${date}/${symbol}/options.json`, optionsData);

  info('fetch-options-data complete', { symbol, date, ivRank: optionsData.ivRank });

  return event;
};
