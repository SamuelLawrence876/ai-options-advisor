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

type StrikeCandidate = OptionsData['candidateStrikes'][number];

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

  const canSellCoveredCall = (sharesHeld ?? 0) >= 100;

  if (strategyPref === 'COVERED_CALL' && canSellCoveredCall) return 'COVERED_CALL';
  if (trend === 'BULLISH' && ivRank >= 50) return 'PUT_CREDIT_SPREAD';
  if (trend === 'NEUTRAL' && ivRank >= 50) {
    if ((trend === 'NEUTRAL' || trend === 'BULLISH') && ivRank >= 60 && atrPct < 2) {
      return 'IRON_CONDOR';
    }
    return canSellCoveredCall ? 'COVERED_CALL' : 'CSP';
  }
  return 'CSP';
}

function spreadPct(bid: number, ask: number): number {
  return ask > 0 ? ((ask - bid) / ask) * 100 : 100;
}

function selectShortPut(candidates: StrikeCandidate[]): StrikeCandidate | undefined {
  return candidates
    .filter(c => Math.abs(c.delta) >= 0.25 && Math.abs(c.delta) <= 0.3)
    .sort((a, b) => Math.abs(Math.abs(a.delta) - 0.27) - Math.abs(Math.abs(b.delta) - 0.27))[0];
}

function selectLongPut(
  candidates: StrikeCandidate[],
  shortPut: StrikeCandidate,
): StrikeCandidate | undefined {
  return candidates
    .filter(c => c.expiry === shortPut.expiry && c.strike < shortPut.strike)
    .sort((a, b) => b.strike - a.strike)
    .find(longPut => {
      const width = shortPut.strike - longPut.strike;
      const credit = shortPut.mid - longPut.mid;
      return width > 0 && credit > 0 && credit < width;
    });
}

function buildPutCreditSpread(
  putCandidates: StrikeCandidate[],
  technicals: TechnicalsData,
): CandidateTrade | undefined {
  const shortPut = selectShortPut(putCandidates);
  if (!shortPut) return undefined;

  const longPut = selectLongPut(putCandidates, shortPut);
  if (!longPut) return undefined;

  const premium = shortPut.mid - longPut.mid;
  const bid = shortPut.bid - longPut.ask;
  const ask = shortPut.ask - longPut.bid;
  const width = shortPut.strike - longPut.strike;
  if (premium <= 0 || premium >= width || bid <= 0 || ask <= 0) return undefined;

  const maxLoss = computeMaxLoss('PUT_CREDIT_SPREAD', {
    spreadWidth: width,
    strike: shortPut.strike,
    premiumCollected: premium,
  });
  const bpr = computeBpr('PUT_CREDIT_SPREAD', technicals.price, maxLoss);
  const robpAnnualised = computeRobp(premium, bpr, shortPut.dte);
  const annualisedYield = computeAnnualisedYield(premium, shortPut.strike, shortPut.dte);

  return {
    strategy: 'PUT_CREDIT_SPREAD',
    expiry: shortPut.expiry,
    dte: shortPut.dte,
    strike: shortPut.strike,
    longStrike: longPut.strike,
    delta: shortPut.delta,
    theta: shortPut.theta - longPut.theta,
    premiumMid: premium,
    bid,
    ask,
    spreadPct: spreadPct(bid, ask),
    openInterest: Math.min(shortPut.openInterest, longPut.openInterest),
    maxLoss,
    bpr,
    annualisedYield,
    robpAnnualised,
    liquidityOk:
      Math.min(shortPut.openInterest, longPut.openInterest) > 500 && spreadPct(bid, ask) < 10,
  };
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

  let strike: StrikeCandidate | undefined;

  if (strategy === 'PUT_CREDIT_SPREAD') {
    return buildPutCreditSpread(putCandidates, technicals);
  }

  if (strategy === 'COVERED_CALL') {
    strike = callCandidates
      .filter(c => Math.abs(c.delta) >= 0.25 && Math.abs(c.delta) <= 0.35)
      .sort((a, b) => Math.abs(Math.abs(a.delta) - 0.3) - Math.abs(Math.abs(b.delta) - 0.3))[0];
  } else {
    strike = selectShortPut(putCandidates);
  }

  if (!strike) return undefined;

  const premium = strike.mid;
  const strikeSpreadPct = spreadPct(strike.bid, strike.ask);
  const liquidityOk = strike.openInterest > 500 && strikeSpreadPct < 10;

  const maxLoss = computeMaxLoss(strategy, {
    costBasis: ticker.costBasis,
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
    spreadPct: strikeSpreadPct,
    openInterest: strike.openInterest,
    maxLoss,
    bpr,
    annualisedYield,
    robpAnnualised,
    liquidityOk,
  };
}
