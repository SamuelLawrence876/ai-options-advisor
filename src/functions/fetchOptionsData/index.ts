import { MarketContext, OptionsData, WatchlistItem } from '../../types';
import { fetchMarketDataOptions } from '../../utils/clients/marketData';
import { info } from '../../utils/logger';
import { getJson, putJson } from '../../utils/aws/s3Json';
import { getSecretValue } from '../../utils/aws/secrets';

interface FetchOptionsDataEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

export const handler = async (event: FetchOptionsDataEvent): Promise<FetchOptionsDataEvent> => {
  const bucketName = process.env.BUCKET_NAME!;
  const marketDataArn = process.env.MARKET_DATA_SECRET_ARN!;

  const { ticker, date } = event;
  const symbol = ticker.symbol;
  const optionsKey = `raw-data/${date}/${symbol}/options.json`;

  info('fetch-options-data started', { symbol, date });

  const cachedOptions = await getJson<OptionsData>(bucketName, optionsKey).catch(() => undefined);
  if (cachedOptions) {
    info('fetch-options-data cache hit', { symbol, date, ivRank: cachedOptions.ivRank });
    return event;
  }

  const token = await getSecretValue(marketDataArn);
  const targetDte = Math.round((ticker.minDte + ticker.maxDte) / 2);
  const optionsData = await fetchMarketDataOptions(symbol, token, targetDte);

  await putJson(bucketName, optionsKey, optionsData);

  info('fetch-options-data complete', { symbol, date, ivRank: optionsData.ivRank });

  return event;
};
