import { MarketContext, WatchlistItem } from '../../types';
import { fetchFlashAlphaOptions } from '../../utils/clients/flashAlpha';
import { info } from '../../utils/logger';
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
  const optionsData = await fetchFlashAlphaOptions(symbol, apiKey);

  await putJson(bucketName, `raw-data/${date}/${symbol}/options.json`, optionsData);

  info('fetch-options-data complete', { symbol, date, ivRank: optionsData.ivRank });

  return event;
};
