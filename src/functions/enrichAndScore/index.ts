import {
  EnrichedTicker,
  FundamentalsData,
  MarketContext,
  OptionsData,
  TechnicalsData,
  WatchlistItem,
} from '../../types';
import { info } from '../../utils/logger';
import { getJson, putJson } from '../../utils/aws/s3';
import { earningsProximity, selectCandidateStrike, selectStrategy } from './strategy';

interface EnrichAndScoreEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

export const handler = async (event: EnrichAndScoreEvent): Promise<EnrichedTicker> => {
  const bucketName = process.env.BUCKET_NAME!;
  const { ticker, date, marketContext } = event;
  const symbol = ticker.symbol;

  info('enrich-and-score started', { symbol, date });

  const [options, fundamentals, technicals] = await Promise.all([
    getJson<OptionsData>(bucketName, `raw-data/${date}/${symbol}/options.json`),
    getJson<FundamentalsData>(bucketName, `raw-data/${date}/${symbol}/fundamentals.json`),
    getJson<TechnicalsData>(bucketName, `raw-data/${date}/${symbol}/technicals.json`),
  ]);

  const vrp = options.iv30d - options.hv30d;
  const ivRankSignal = options.ivRank >= 50 ? 'SELL_ENVIRONMENT' : 'SKIP';
  const sectorIv = marketContext.sectorIvs[ticker.sector ?? ''] ?? 0;
  const ivVsSector =
    sectorIv === 0
      ? 'INLINE'
      : options.iv30d > sectorIv * 1.1
        ? 'ABOVE'
        : options.iv30d < sectorIv * 0.9
          ? 'BELOW'
          : 'INLINE';

  const earningsInWindow =
    fundamentals.earningsDte !== undefined && fundamentals.earningsDte <= ticker.maxDte;
  const exDivInWindow =
    fundamentals.exDivDte !== undefined && fundamentals.exDivDte <= ticker.maxDte;
  const earningsClear = !earningsInWindow;
  const proximity = earningsProximity(fundamentals.earningsDte);

  const near52wHigh = technicals.distanceFromHigh52wPct < 5;
  const atrPct = technicals.atrPct;

  const strategy = selectStrategy(
    technicals.trend,
    options.ivRank,
    earningsClear,
    atrPct,
    ticker.strategyPref,
    ticker.sharesHeld,
  );

  const candidateTrade = selectCandidateStrike(options, fundamentals, technicals, ticker, strategy);
  const premiumCoversAtr = candidateTrade ? candidateTrade.premiumMid > technicals.atr14 : false;

  const liquidityOk = candidateTrade?.liquidityOk ?? false;

  const enriched: EnrichedTicker = {
    ticker,
    date,
    vrp,
    ivRankSignal,
    ivVsSector,
    earningsInWindow,
    earningsProximity: proximity,
    exDivInWindow,
    near52wHigh,
    atrPct,
    premiumCoversAtr,
    liquidityOk,
    suggestedStrategy: strategy,
    candidateTrade,
    marketContext,
    rawOptions: options,
    rawFundamentals: fundamentals,
    rawTechnicals: technicals,
  };

  await putJson(bucketName, `enriched/${date}/${symbol}.json`, enriched);

  info('enrich-and-score complete', { symbol, strategy, ivRank: options.ivRank });

  return enriched;
};
