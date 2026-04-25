import {
  EnrichedTicker,
  FundamentalsData,
  MarketContext,
  OptionsData,
  TechnicalsData,
  WatchlistItem,
} from '../../types';
import { info } from '../../utils/logger';
import { getIvSnapshots } from '../../utils/aws/dynamodb';
import { getJson, putJson } from '../../utils/aws/s3';
import { computeIvRank } from '../../utils/metrics';
import {
  candidateRejectionReasons,
  earningsProximity,
  selectCandidateStrike,
  selectStrategy,
} from './strategy';

interface EnrichAndScoreEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

export const handler = async (event: EnrichAndScoreEvent): Promise<EnrichedTicker> => {
  const bucketName = process.env.BUCKET_NAME!;
  const ivHistoryTable = process.env.IV_HISTORY_TABLE!;
  const { ticker, date, marketContext } = event;
  const symbol = ticker.symbol;

  info('enrich-and-score started', { symbol, date });

  const [options, fundamentals, technicals] = await Promise.all([
    getJson<OptionsData>(bucketName, `raw-data/${date}/${symbol}/options.json`),
    getJson<FundamentalsData>(bucketName, `raw-data/${date}/${symbol}/fundamentals.json`),
    getJson<TechnicalsData>(bucketName, `raw-data/${date}/${symbol}/technicals.json`),
  ]);

  const ivHistory = await getIvSnapshots(ivHistoryTable, symbol, date);
  const historicalIvRank = computeIvRank(
    options.iv30d,
    ivHistory.map(snapshot => snapshot.iv30d),
  );
  const effectiveOptions: OptionsData = {
    ...options,
    hv30d: technicals.hv30d ?? options.hv30d,
    ivRank: historicalIvRank ?? options.ivRank,
    ivPercentile: historicalIvRank ?? options.ivPercentile,
    ivRankSource: historicalIvRank === undefined ? 'CHAIN_PROXY' : 'HISTORICAL',
  };

  const vrp = effectiveOptions.iv30d - effectiveOptions.hv30d;
  const ivRankSignal = effectiveOptions.ivRank >= 50 ? 'SELL_ENVIRONMENT' : 'SKIP';

  const earningsInWindow =
    fundamentals.earningsDte !== undefined && fundamentals.earningsDte <= ticker.maxDte;
  const exDivInWindow =
    fundamentals.exDivDte !== undefined && fundamentals.exDivDte <= ticker.maxDte;
  const earningsClear = !earningsInWindow;
  const proximity = earningsProximity(fundamentals.earningsDte);

  const near52wHigh = technicals.distanceFromHigh52wPct < 5;
  const atrPct = technicals.atrPct;

  const preScreenStrategy = selectStrategy(
    technicals.trend,
    effectiveOptions.ivRank,
    earningsClear,
    atrPct,
    ticker.strategyPref,
    ticker.sharesHeld,
  );

  const candidateTrade = selectCandidateStrike(
    effectiveOptions,
    fundamentals,
    technicals,
    ticker,
    preScreenStrategy,
  );
  const rejectionReasons =
    preScreenStrategy === 'SKIP'
      ? []
      : candidateRejectionReasons(candidateTrade, ticker, exDivInWindow);
  const strategy = rejectionReasons.length > 0 ? 'SKIP' : preScreenStrategy;
  const premiumCoversAtr = candidateTrade ? candidateTrade.premiumMid > technicals.atr14 : false;

  const liquidityOk = candidateTrade?.liquidityOk ?? false;
  const summarizedOptions: OptionsData = {
    ...effectiveOptions,
    volSurface: [],
    candidateStrikes: candidateTrade
      ? [
          {
            expiry: candidateTrade.expiry,
            dte: candidateTrade.dte,
            strike: candidateTrade.strike,
            optionType:
              candidateTrade.strategy === 'COVERED_CALL' || candidateTrade.delta > 0
                ? 'call'
                : 'put',
            delta: candidateTrade.delta,
            theta: candidateTrade.theta,
            vega: 0,
            bid: candidateTrade.bid,
            ask: candidateTrade.ask,
            mid: candidateTrade.premiumMid,
            openInterest: candidateTrade.openInterest,
            volume: 0,
          },
        ]
      : [],
  };

  const enriched: EnrichedTicker = {
    ticker,
    date,
    vrp,
    ivRankSignal,
    candidateRejectionReasons: rejectionReasons,
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
    rawOptions: summarizedOptions,
    rawFundamentals: fundamentals,
    rawTechnicals: technicals,
  };

  await putJson(bucketName, `enriched/${date}/${symbol}.json`, enriched);

  info('enrich-and-score complete', {
    symbol,
    strategy,
    preScreenStrategy,
    candidateRejected: rejectionReasons.length > 0,
    ivRank: effectiveOptions.ivRank,
    ivRankSource: effectiveOptions.ivRankSource,
  });

  return enriched;
};
