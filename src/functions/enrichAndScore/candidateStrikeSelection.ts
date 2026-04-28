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

function computeTargetWidth(atr14: number): number {
  return Math.max(3, Math.min(10, Math.round(atr14)));
}

// Scale OI minimum to maintain roughly constant notional liquidity across price points.
// Baseline: 500 contracts at $190 (AAPL) ≈ $9.5M notional.
function computeMinOi(price: number): number {
  return Math.max(50, Math.round(9_500_000 / (price * 100)));
}

function selectLongLeg(candidates: StrikeCandidate[]): StrikeCandidate | undefined {
  return candidates
    .filter(c => Math.abs(c.delta) >= 0.45 && Math.abs(c.delta) <= 0.65)
    .sort((a, b) => Math.abs(Math.abs(a.delta) - 0.5) - Math.abs(Math.abs(b.delta) - 0.5))[0];
}

function buildCallDebitSpread(
  callCandidates: StrikeCandidate[],
  price: number,
): CandidateTrade | undefined {
  const longCall = selectLongLeg(callCandidates);
  if (!longCall) return undefined;

  const shortCall = callCandidates
    .filter(
      c =>
        c.expiry === longCall.expiry &&
        c.strike > longCall.strike &&
        c.delta >= 0.2 &&
        c.delta <= 0.35,
    )
    .sort((a, b) => Math.abs(a.delta - 0.3) - Math.abs(b.delta - 0.3))[0];
  if (!shortCall) return undefined;

  const netDebit = longCall.mid - shortCall.mid;
  const bid = longCall.bid - shortCall.ask;
  const ask = longCall.ask - shortCall.bid;
  const width = shortCall.strike - longCall.strike;
  if (netDebit <= 0 || netDebit >= width || ask <= 0) return undefined;
  // Require at least 1:1 reward:risk (max profit >= net debit paid)
  if (width - netDebit < netDebit) return undefined;

  const maxLoss = computeMaxLoss('CALL_DEBIT_SPREAD', {
    strike: longCall.strike,
    premiumCollected: netDebit,
  });
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
    liquidityOk:
      Math.min(longCall.openInterest, shortCall.openInterest) > computeMinOi(price) &&
      spreadPct(bid, ask) < 10,
  };
}

function buildPutDebitSpread(
  putCandidates: StrikeCandidate[],
  price: number,
): CandidateTrade | undefined {
  const longPut = selectLongLeg(putCandidates);
  if (!longPut) return undefined;

  const shortPut = putCandidates
    .filter(
      c =>
        c.expiry === longPut.expiry &&
        c.strike < longPut.strike &&
        Math.abs(c.delta) >= 0.2 &&
        Math.abs(c.delta) <= 0.35,
    )
    .sort((a, b) => Math.abs(Math.abs(a.delta) - 0.3) - Math.abs(Math.abs(b.delta) - 0.3))[0];
  if (!shortPut) return undefined;

  const netDebit = longPut.mid - shortPut.mid;
  const bid = longPut.bid - shortPut.ask;
  const ask = longPut.ask - shortPut.bid;
  const width = longPut.strike - shortPut.strike;
  if (netDebit <= 0 || netDebit >= width || ask <= 0) return undefined;
  // Require at least 1:1 reward:risk (max profit >= net debit paid)
  if (width - netDebit < netDebit) return undefined;

  const maxLoss = computeMaxLoss('PUT_DEBIT_SPREAD', {
    strike: longPut.strike,
    premiumCollected: netDebit,
  });
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
    liquidityOk:
      Math.min(longPut.openInterest, shortPut.openInterest) > computeMinOi(price) &&
      spreadPct(bid, ask) < 10,
  };
}

function selectShortCall(candidates: StrikeCandidate[]): StrikeCandidate | undefined {
  return candidates
    .filter(c => c.delta >= 0.2 && c.delta <= 0.35)
    .sort((a, b) => Math.abs(a.delta - 0.27) - Math.abs(b.delta - 0.27))[0];
}

// Sorts long-leg candidates by closeness to targetWidth and picks the first one
// that provides a valid credit of at least 1/3 of the spread width.
function selectLongCall(
  candidates: StrikeCandidate[],
  shortCall: StrikeCandidate,
  targetWidth: number,
): StrikeCandidate | undefined {
  return candidates
    .filter(c => c.expiry === shortCall.expiry && c.strike > shortCall.strike)
    .sort((a, b) => {
      const distA = Math.abs(a.strike - shortCall.strike - targetWidth);
      const distB = Math.abs(b.strike - shortCall.strike - targetWidth);
      return distA - distB;
    })
    .find(longCall => {
      const width = longCall.strike - shortCall.strike;
      const credit = shortCall.mid - longCall.mid;
      return width > 0 && credit > 0 && credit < width && credit >= width * 0.33;
    });
}

function buildCallCreditSpread(
  callCandidates: StrikeCandidate[],
  technicals: TechnicalsData,
): CandidateTrade | undefined {
  const targetWidth = computeTargetWidth(technicals.atr14);
  const shortCall = selectShortCall(callCandidates);
  if (!shortCall) return undefined;

  const longCall = selectLongCall(callCandidates, shortCall, targetWidth);
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
      Math.min(shortCall.openInterest, longCall.openInterest) > computeMinOi(technicals.price) &&
      spreadPct(bid, ask) < 10,
  };
}

function selectShortPut(candidates: StrikeCandidate[]): StrikeCandidate | undefined {
  return candidates
    .filter(c => Math.abs(c.delta) >= 0.2 && Math.abs(c.delta) <= 0.35)
    .sort((a, b) => Math.abs(Math.abs(a.delta) - 0.27) - Math.abs(Math.abs(b.delta) - 0.27))[0];
}

// Sorts long-leg candidates by closeness to targetWidth and picks the first one
// that provides a valid credit of at least 1/3 of the spread width.
function selectLongPut(
  candidates: StrikeCandidate[],
  shortPut: StrikeCandidate,
  targetWidth: number,
): StrikeCandidate | undefined {
  return candidates
    .filter(c => c.expiry === shortPut.expiry && c.strike < shortPut.strike)
    .sort((a, b) => {
      const distA = Math.abs(shortPut.strike - a.strike - targetWidth);
      const distB = Math.abs(shortPut.strike - b.strike - targetWidth);
      return distA - distB;
    })
    .find(longPut => {
      const width = shortPut.strike - longPut.strike;
      const credit = shortPut.mid - longPut.mid;
      return width > 0 && credit > 0 && credit < width && credit >= width * 0.33;
    });
}

function buildPutCreditSpread(
  putCandidates: StrikeCandidate[],
  technicals: TechnicalsData,
): CandidateTrade | undefined {
  const targetWidth = computeTargetWidth(technicals.atr14);
  const shortPut = selectShortPut(putCandidates);
  if (!shortPut) return undefined;

  const longPut = selectLongPut(putCandidates, shortPut, targetWidth);
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
      Math.min(shortPut.openInterest, longPut.openInterest) > computeMinOi(technicals.price) &&
      spreadPct(bid, ask) < 10,
  };
}

function buildIronCondor(
  putCandidates: StrikeCandidate[],
  callCandidates: StrikeCandidate[],
  technicals: TechnicalsData,
): CandidateTrade | undefined {
  const targetWidth = computeTargetWidth(technicals.atr14);

  const shortPut = selectShortPut(putCandidates);
  if (!shortPut) return undefined;
  const longPut = selectLongPut(putCandidates, shortPut, targetWidth);
  if (!longPut) return undefined;

  const sameExpiryCalls = callCandidates.filter(c => c.expiry === shortPut.expiry);
  const shortCall = selectShortCall(sameExpiryCalls);
  if (!shortCall) return undefined;
  const longCall = selectLongCall(sameExpiryCalls, shortCall, targetWidth);
  if (!longCall) return undefined;

  const putCredit = shortPut.mid - longPut.mid;
  const callCredit = shortCall.mid - longCall.mid;
  const netCredit = putCredit + callCredit;

  const putWidth = shortPut.strike - longPut.strike;
  const callWidth = longCall.strike - shortCall.strike;
  const maxWidth = Math.max(putWidth, callWidth);

  if (netCredit <= 0 || netCredit >= maxWidth) return undefined;

  const bid = shortPut.bid + shortCall.bid - longPut.ask - longCall.ask;
  const ask = shortPut.ask + shortCall.ask - longPut.bid - longCall.bid;
  if (bid <= 0 || ask <= 0) return undefined;

  const sp = spreadPct(bid, ask);
  const oi = Math.min(
    shortPut.openInterest,
    longPut.openInterest,
    shortCall.openInterest,
    longCall.openInterest,
  );

  const maxLoss = computeMaxLoss('IRON_CONDOR', {
    spreadWidth: maxWidth,
    strike: shortPut.strike,
    premiumCollected: netCredit,
  });
  const bpr = computeBpr('IRON_CONDOR', technicals.price, maxLoss);
  const robpAnnualised = computeRobp(netCredit, bpr, shortPut.dte);
  const annualisedYield = computeAnnualisedYield(netCredit, shortPut.strike, shortPut.dte);

  return {
    strategy: 'IRON_CONDOR',
    expiry: shortPut.expiry,
    dte: shortPut.dte,
    strike: shortPut.strike,
    longStrike: longPut.strike,
    callStrike: shortCall.strike,
    callLongStrike: longCall.strike,
    delta: shortPut.delta,
    theta: shortPut.theta + shortCall.theta - longPut.theta - longCall.theta,
    premiumMid: netCredit,
    bid,
    ask,
    spreadPct: sp,
    openInterest: oi,
    maxLoss,
    bpr,
    annualisedYield,
    robpAnnualised,
    liquidityOk: oi > computeMinOi(technicals.price) && sp < 10,
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

  if (strategy === 'PUT_CREDIT_SPREAD') {
    return buildPutCreditSpread(putCandidates, technicals);
  }

  if (strategy === 'CALL_CREDIT_SPREAD') {
    return buildCallCreditSpread(callCandidates, technicals);
  }

  if (strategy === 'CALL_DEBIT_SPREAD') {
    return buildCallDebitSpread(callCandidates, technicals.price);
  }

  if (strategy === 'PUT_DEBIT_SPREAD') {
    return buildPutDebitSpread(putCandidates, technicals.price);
  }

  if (strategy === 'IRON_CONDOR') {
    return buildIronCondor(putCandidates, callCandidates, technicals);
  }

  let strike: StrikeCandidate | undefined;

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
  const minOi = computeMinOi(technicals.price);
  const liquidityOk = strike.openInterest > minOi && strikeSpreadPct < 10;

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
