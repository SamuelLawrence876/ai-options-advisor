import {
  CandidateTrade,
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
} from '../../utils/optionRisk';

type StrikeCandidate = OptionsData['candidateStrikes'][number];

function spreadPct(bid: number, ask: number): number {
  return ask > 0 ? ((ask - bid) / ask) * 100 : 100;
}

function selectLongLeg(candidates: StrikeCandidate[]): StrikeCandidate | undefined {
  return candidates
    .filter(c => Math.abs(c.delta) >= 0.45 && Math.abs(c.delta) <= 0.65)
    .sort((a, b) => Math.abs(Math.abs(a.delta) - 0.5) - Math.abs(Math.abs(b.delta) - 0.5))[0];
}

function buildCallDebitSpread(callCandidates: StrikeCandidate[]): CandidateTrade | undefined {
  const longCall = selectLongLeg(callCandidates);
  if (!longCall) return undefined;

  const shortCall = callCandidates
    .filter(c => c.expiry === longCall.expiry && c.strike > longCall.strike && c.delta >= 0.2 && c.delta <= 0.35)
    .sort((a, b) => Math.abs(a.delta - 0.3) - Math.abs(b.delta - 0.3))[0];
  if (!shortCall) return undefined;

  const netDebit = longCall.mid - shortCall.mid;
  const bid = longCall.bid - shortCall.ask;
  const ask = longCall.ask - shortCall.bid;
  const width = shortCall.strike - longCall.strike;
  if (netDebit <= 0 || netDebit >= width || ask <= 0) return undefined;

  const maxLoss = computeMaxLoss('CALL_DEBIT_SPREAD', { strike: longCall.strike, premiumCollected: netDebit });
  const bpr = computeBpr('CALL_DEBIT_SPREAD', 0, maxLoss);
  const robpAnnualised = computeRobp(width - netDebit, bpr, longCall.dte);
  const annualisedYield = computeAnnualisedYield(width - netDebit, width, longCall.dte);

  return {
    strategy: 'CALL_DEBIT_SPREAD',
    expiry: longCall.expiry,
    dte: longCall.dte,
    strike: longCall.strike,
    longStrike: shortCall.strike,
    delta: longCall.delta,
    theta: longCall.theta - shortCall.theta,
    premiumMid: netDebit,
    bid,
    ask,
    spreadPct: spreadPct(bid, ask),
    openInterest: Math.min(longCall.openInterest, shortCall.openInterest),
    maxLoss,
    bpr,
    annualisedYield,
    robpAnnualised,
    liquidityOk: Math.min(longCall.openInterest, shortCall.openInterest) > 500 && spreadPct(bid, ask) < 10,
  };
}

function buildPutDebitSpread(putCandidates: StrikeCandidate[]): CandidateTrade | undefined {
  const longPut = selectLongLeg(putCandidates);
  if (!longPut) return undefined;

  const shortPut = putCandidates
    .filter(c => c.expiry === longPut.expiry && c.strike < longPut.strike && Math.abs(c.delta) >= 0.2 && Math.abs(c.delta) <= 0.35)
    .sort((a, b) => Math.abs(Math.abs(a.delta) - 0.3) - Math.abs(Math.abs(b.delta) - 0.3))[0];
  if (!shortPut) return undefined;

  const netDebit = longPut.mid - shortPut.mid;
  const bid = longPut.bid - shortPut.ask;
  const ask = longPut.ask - shortPut.bid;
  const width = longPut.strike - shortPut.strike;
  if (netDebit <= 0 || netDebit >= width || ask <= 0) return undefined;

  const maxLoss = computeMaxLoss('PUT_DEBIT_SPREAD', { strike: longPut.strike, premiumCollected: netDebit });
  const bpr = computeBpr('PUT_DEBIT_SPREAD', 0, maxLoss);
  const robpAnnualised = computeRobp(width - netDebit, bpr, longPut.dte);
  const annualisedYield = computeAnnualisedYield(width - netDebit, width, longPut.dte);

  return {
    strategy: 'PUT_DEBIT_SPREAD',
    expiry: longPut.expiry,
    dte: longPut.dte,
    strike: longPut.strike,
    longStrike: shortPut.strike,
    delta: longPut.delta,
    theta: longPut.theta - shortPut.theta,
    premiumMid: netDebit,
    bid,
    ask,
    spreadPct: spreadPct(bid, ask),
    openInterest: Math.min(longPut.openInterest, shortPut.openInterest),
    maxLoss,
    bpr,
    annualisedYield,
    robpAnnualised,
    liquidityOk: Math.min(longPut.openInterest, shortPut.openInterest) > 500 && spreadPct(bid, ask) < 10,
  };
}

function selectShortCall(candidates: StrikeCandidate[]): StrikeCandidate | undefined {
  return candidates
    .filter(c => c.delta >= 0.25 && c.delta <= 0.3)
    .sort((a, b) => Math.abs(a.delta - 0.27) - Math.abs(b.delta - 0.27))[0];
}

function selectLongCall(
  candidates: StrikeCandidate[],
  shortCall: StrikeCandidate,
): StrikeCandidate | undefined {
  return candidates
    .filter(c => c.expiry === shortCall.expiry && c.strike > shortCall.strike)
    .sort((a, b) => a.strike - b.strike)
    .find(longCall => {
      const width = longCall.strike - shortCall.strike;
      const credit = shortCall.mid - longCall.mid;
      return width > 0 && credit > 0 && credit < width;
    });
}

function buildCallCreditSpread(
  callCandidates: StrikeCandidate[],
  technicals: TechnicalsData,
): CandidateTrade | undefined {
  const shortCall = selectShortCall(callCandidates);
  if (!shortCall) return undefined;

  const longCall = selectLongCall(callCandidates, shortCall);
  if (!longCall) return undefined;

  const premium = shortCall.mid - longCall.mid;
  const bid = shortCall.bid - longCall.ask;
  const ask = shortCall.ask - longCall.bid;
  const width = longCall.strike - shortCall.strike;
  if (premium <= 0 || premium >= width || bid <= 0 || ask <= 0) return undefined;

  const maxLoss = computeMaxLoss('CALL_CREDIT_SPREAD', {
    spreadWidth: width,
    strike: shortCall.strike,
    premiumCollected: premium,
  });
  const bpr = computeBpr('CALL_CREDIT_SPREAD', technicals.price, maxLoss);
  const robpAnnualised = computeRobp(premium, bpr, shortCall.dte);
  const annualisedYield = computeAnnualisedYield(premium, shortCall.strike, shortCall.dte);

  return {
    strategy: 'CALL_CREDIT_SPREAD',
    expiry: shortCall.expiry,
    dte: shortCall.dte,
    strike: shortCall.strike,
    longStrike: longCall.strike,
    delta: shortCall.delta,
    theta: shortCall.theta - longCall.theta,
    premiumMid: premium,
    bid,
    ask,
    spreadPct: spreadPct(bid, ask),
    openInterest: Math.min(shortCall.openInterest, longCall.openInterest),
    maxLoss,
    bpr,
    annualisedYield,
    robpAnnualised,
    liquidityOk:
      Math.min(shortCall.openInterest, longCall.openInterest) > 500 && spreadPct(bid, ask) < 10,
  };
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

  if (strategy === 'CALL_CREDIT_SPREAD') {
    return buildCallCreditSpread(callCandidates, technicals);
  }

  if (strategy === 'CALL_DEBIT_SPREAD') {
    return buildCallDebitSpread(callCandidates);
  }

  if (strategy === 'PUT_DEBIT_SPREAD') {
    return buildPutDebitSpread(putCandidates);
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
