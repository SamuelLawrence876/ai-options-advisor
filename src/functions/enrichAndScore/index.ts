import {
  EnrichedTicker,
  FundamentalsData,
  MarketContext,
  OptionsData,
  TechnicalsData,
  WatchlistItem,
} from '../../types';
import { info } from '../../utils/logger';
import { getIvSnapshots } from '../../utils/aws/ivSnapshotRepository';
import { getJson, putJson } from '../../utils/aws/s3Json';
import { computeIvRank } from '../../utils/impliedVolatility';
import { candidateRejectionReasons } from './candidateRejectionReasons';
import { selectCandidateStrike } from './candidateStrikeSelection';
import { computeEarningsInWindow, earningsProximity } from './earningsProximity';
import { selectStrategy } from './strategySelection';

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
    ivRankSource: historicalIvRank === undefined ? 'CHAIN_PROXY' : 'HISTORICAL',
  };

  // Guard against hv30d=0 (its default when technicals are unavailable), which
  // would make VRP appear spuriously positive (iv30d - 0 = iv30d).
  const vrp = effectiveOptions.hv30d > 0 ? effectiveOptions.iv30d - effectiveOptions.hv30d : 0;
  const sellThreshold = effectiveOptions.ivRankSource === 'HISTORICAL' ? 50 : 60;
  const buyThreshold = 35;
  const ivRankSignal =
    effectiveOptions.ivRank >= sellThreshold
      ? 'SELL_ENVIRONMENT'
      : effectiveOptions.ivRank <= buyThreshold
        ? 'BUY_ENVIRONMENT'
        : 'SKIP';

  // Early gate: only skip if earnings are guaranteed to overlap every possible expiry
  const earningsClear =
    fundamentals.earningsDte === undefined || fundamentals.earningsDte > ticker.minDte;

  const near52wHigh = technicals.distanceFromHigh52wPct < 5;
  const atrPct = technicals.atrPct;

  const preScreenStrategy = selectStrategy(
    technicals.trend,
    effectiveOptions.ivRank,
    effectiveOptions.ivRankSource ?? 'CHAIN_PROXY',
    earningsClear,
    atrPct,
    ticker.strategyPref,
    ticker.sharesHeld,
  );

  const candidateTrade = selectCandidateStrike(
    effectiveOptions,
    technicals,
    ticker,
    preScreenStrategy,
  );

  // Evaluate earnings and ex-div against the actual selected expiry, not the max window
  const tradeDte = candidateTrade?.dte ?? ticker.maxDte;
  const earningsInWindow = computeEarningsInWindow(fundamentals.earningsDte, tradeDte);
  const exDivInWindow = fundamentals.exDivDte !== undefined && fundamentals.exDivDte <= tradeDte;
  const proximity = earningsProximity(fundamentals.earningsDte, candidateTrade?.dte);

  const rejectionReasons =
    preScreenStrategy === 'SKIP'
      ? []
      : candidateRejectionReasons(candidateTrade, ticker, earningsInWindow, exDivInWindow);
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
