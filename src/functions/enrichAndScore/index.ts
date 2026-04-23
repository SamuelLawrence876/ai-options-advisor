import {
  CandidateTrade,
  EarningsProximity,
  EnrichedTicker,
  FundamentalsData,
  MarketContext,
  OptionsData,
  StrategyRecommendation,
  TechnicalsData,
  WatchlistItem,
} from '../../types';
import { info } from '../../utils/logger';
import {
  computeAnnualisedYield,
  computeBpr,
  computeMaxLoss,
  computeRobp,
} from '../../utils/metrics';
import { getJson, putJson } from '../../utils/s3';

interface EnrichAndScoreEvent {
  ticker: WatchlistItem;
  date: string;
  marketContext: MarketContext;
}

function earningsProximity(earningsDte: number | undefined): EarningsProximity {
  if (earningsDte === undefined) return 'CLEAR';
  if (earningsDte < 14) return 'DANGER';
  if (earningsDte < 21) return 'CAUTION';
  return 'CLEAR';
}

function selectStrategy(
  trend: string,
  ivRank: number,
  earningsClear: boolean,
  atrPct: number,
  strategyPref: string,
): StrategyRecommendation {
  if (!earningsClear) return 'SKIP';
  if (ivRank < 50) return 'SKIP';

  if (strategyPref === 'COVERED_CALL' && trend === 'NEUTRAL') return 'COVERED_CALL';
  if (trend === 'BULLISH' && ivRank >= 50) return 'PUT_CREDIT_SPREAD';
  if (trend === 'NEUTRAL' && ivRank >= 50) return 'COVERED_CALL';
  if ((trend === 'NEUTRAL' || trend === 'BULLISH') && ivRank >= 60 && atrPct < 2) {
    return 'IRON_CONDOR';
  }
  return 'CSP';
}

function selectCandidateStrike(
  options: OptionsData,
  fundamentals: FundamentalsData,
  technicals: TechnicalsData,
  ticker: WatchlistItem,
  strategy: StrategyRecommendation,
): CandidateTrade | undefined {
  if (strategy === 'SKIP' || strategy === 'WATCH') return undefined;

  const targetDte = Math.round((ticker.minDte + ticker.maxDte) / 2);
  const minDte = ticker.minDte;
  const maxDte = ticker.maxDte;

  const putCandidates = options.candidateStrikes.filter(
    (c) =>
      c.optionType === 'put' &&
      c.dte >= minDte &&
      c.dte <= maxDte &&
      Math.abs(c.dte - targetDte) < 15,
  );

  const callCandidates = options.candidateStrikes.filter(
    (c) =>
      c.optionType === 'call' &&
      c.dte >= minDte &&
      c.dte <= maxDte &&
      Math.abs(c.dte - targetDte) < 15,
  );

  let strike: (typeof options.candidateStrikes)[0] | undefined;

  if (strategy === 'COVERED_CALL') {
    strike = callCandidates
      .filter((c) => Math.abs(c.delta) >= 0.25 && Math.abs(c.delta) <= 0.35)
      .sort((a, b) => Math.abs(Math.abs(a.delta) - 0.3) - Math.abs(Math.abs(b.delta) - 0.3))[0];
  } else {
    strike = putCandidates
      .filter((c) => Math.abs(c.delta) >= 0.25 && Math.abs(c.delta) <= 0.30)
      .sort((a, b) => Math.abs(Math.abs(a.delta) - 0.27) - Math.abs(Math.abs(b.delta) - 0.27))[0];
  }

  if (!strike) return undefined;

  const premium = strike.mid;
  const spreadPct = strike.ask > 0 ? ((strike.ask - strike.bid) / strike.ask) * 100 : 100;
  const liquidityOk = strike.openInterest > 500 && spreadPct < 10;

  const spreadWidth = 5;
  const maxLoss = computeMaxLoss(strategy, {
    costBasis: ticker.costBasis,
    spreadWidth,
    strike: strike.strike,
    premiumCollected: premium,
  });
  const bpr = computeBpr(strategy, technicals.price, maxLoss);
  const robpAnnualised = computeRobp(premium, bpr, strike.dte);
  const annualisedYield = computeAnnualisedYield(premium, strike.strike, strike.dte);

  const priceTargetDistance =
    fundamentals.meanPriceTarget && technicals.price > 0
      ? ((fundamentals.meanPriceTarget - technicals.price) / technicals.price) * 100
      : undefined;

  return {
    strategy,
    expiry: strike.expiry,
    dte: strike.dte,
    strike: strike.strike,
    delta: strike.delta,
    theta: strike.theta,
    premiumMid: premium,
    bid: strike.bid,
    ask: strike.ask,
    spreadPct,
    openInterest: strike.openInterest,
    maxLoss,
    bpr,
    annualisedYield,
    robpAnnualised,
    liquidityOk,
    ...(priceTargetDistance !== undefined && { priceTargetDistance }),
  } as CandidateTrade;
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
    sectorIv === 0 ? 'INLINE' : options.iv30d > sectorIv * 1.1 ? 'ABOVE' : options.iv30d < sectorIv * 0.9 ? 'BELOW' : 'INLINE';

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
  );

  const candidateTrade = selectCandidateStrike(options, fundamentals, technicals, ticker, strategy);
  const premiumCoversAtr = candidateTrade
    ? candidateTrade.premiumMid > technicals.atr14
    : false;

  const liquidityOk = candidateTrade?.liquidityOk ?? false;

  if (fundamentals.meanPriceTarget && technicals.price > 0) {
    const dist = ((fundamentals.meanPriceTarget - technicals.price) / technicals.price) * 100;
    (fundamentals as FundamentalsData & { priceTargetDistance: number }).priceTargetDistance = dist;
  }

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
