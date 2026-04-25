import {
  CandidateTrade,
  EarningsProximity,
  FundamentalsData,
  OptionsData,
  StrategyRecommendation,
  TechnicalsData,
  WatchlistItem,
} from '../../types';
import {
  computeAnnualisedYield,
  computeBpr,
  computeMaxLoss,
  computeRobp,
} from '../../utils/metrics';

export function earningsProximity(earningsDte: number | undefined): EarningsProximity {
  if (earningsDte === undefined) return 'CLEAR';
  if (earningsDte < 14) return 'DANGER';
  if (earningsDte < 21) return 'CAUTION';
  return 'CLEAR';
}

export function selectStrategy(
  trend: string,
  ivRank: number,
  earningsClear: boolean,
  atrPct: number,
  strategyPref: string,
  sharesHeld: number | undefined,
): StrategyRecommendation {
  if (!earningsClear) return 'SKIP';
  if (ivRank < 50) return 'SKIP';

  if (strategyPref === 'COVERED_CALL' && (sharesHeld ?? 0) > 0) return 'COVERED_CALL';
  if (trend === 'BULLISH' && ivRank >= 50) return 'PUT_CREDIT_SPREAD';
  if (trend === 'NEUTRAL' && ivRank >= 50) {
    if ((trend === 'NEUTRAL' || trend === 'BULLISH') && ivRank >= 60 && atrPct < 2) {
      return 'IRON_CONDOR';
    }
    return 'COVERED_CALL';
  }
  return 'CSP';
}

export function selectCandidateStrike(
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
    c =>
      c.optionType === 'put' &&
      c.dte >= minDte &&
      c.dte <= maxDte &&
      Math.abs(c.dte - targetDte) < 15,
  );

  const callCandidates = options.candidateStrikes.filter(
    c =>
      c.optionType === 'call' &&
      c.dte >= minDte &&
      c.dte <= maxDte &&
      Math.abs(c.dte - targetDte) < 15,
  );

  let strike: (typeof options.candidateStrikes)[0] | undefined;

  if (strategy === 'COVERED_CALL') {
    strike = callCandidates
      .filter(c => Math.abs(c.delta) >= 0.25 && Math.abs(c.delta) <= 0.35)
      .sort((a, b) => Math.abs(Math.abs(a.delta) - 0.3) - Math.abs(Math.abs(b.delta) - 0.3))[0];
  } else {
    strike = putCandidates
      .filter(c => Math.abs(c.delta) >= 0.25 && Math.abs(c.delta) <= 0.3)
      .sort((a, b) => Math.abs(Math.abs(a.delta) - 0.27) - Math.abs(Math.abs(b.delta) - 0.27))[0];
  }

  if (!strike) return undefined;

  const premium = strike.mid;
  const spreadPct = strike.ask > 0 ? ((strike.ask - strike.bid) / strike.ask) * 100 : 100;
  const liquidityOk = strike.openInterest > 500 && spreadPct < 10;

  const spreadWidth = 5;
  if (strategy === 'PUT_CREDIT_SPREAD' && premium >= spreadWidth) return undefined;

  const maxLoss = computeMaxLoss(strategy, {
    costBasis: ticker.costBasis,
    spreadWidth,
    strike: strike.strike,
    premiumCollected: premium,
  });
  const bpr = computeBpr(strategy, technicals.price, maxLoss);
  const robpAnnualised = computeRobp(premium, bpr, strike.dte);
  const annualisedYield = computeAnnualisedYield(premium, strike.strike, strike.dte);

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
  };
}
