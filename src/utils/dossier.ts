import { EnrichedTicker, HumanContextEntry, MarketContext } from '../types';

export function formatDossier(
  enriched: EnrichedTicker,
  marketContext: MarketContext,
  humanContext: HumanContextEntry[],
): string {
  const { ticker, rawOptions, rawFundamentals, rawTechnicals, candidateTrade } = enriched;
  const t = rawTechnicals;
  const o = rawOptions;
  const f = rawFundamentals;
  const ct = candidateTrade;

  const lines: string[] = [
    '═══════════════════════════════════════',
    `TICKER: ${ticker.symbol}`,
    `PRICE: $${t.price.toFixed(2)} | SECTOR: ${ticker.sector ?? 'N/A'}`,
    '═══════════════════════════════════════',
    '',
    'VOLATILITY',
    '──────────',
    `IV Rank:        ${o.ivRank.toFixed(0)} / 100  [${enriched.ivRankSignal}; ${o.ivRankSource ?? 'CHAIN_PROXY'}]`,
    `IV Percentile:  ${o.ivPercentile.toFixed(0)}%`,
    `Current IV:     ${o.iv30d.toFixed(1)}%`,
    `30d HV:         ${o.hv30d.toFixed(1)}%`,
    `VRP:            ${enriched.vrp >= 0 ? '+' : ''}${enriched.vrp.toFixed(1)}%  [${enriched.vrp >= 0 ? 'POSITIVE ✓' : 'NEGATIVE ✗'}]`,
    '',
    'TREND & TECHNICALS',
    '──────────────────',
    `Trend:          ${t.trend}`,
    `Price vs 20d MA: ${t.priceVsMa20Pct >= 0 ? 'above' : 'below'} by ${Math.abs(t.priceVsMa20Pct).toFixed(1)}%`,
    `Price vs 50d MA: ${t.priceVsMa50Pct >= 0 ? 'above' : 'below'} by ${Math.abs(t.priceVsMa50Pct).toFixed(1)}%`,
    `52w High:       $${t.high52w.toFixed(2)}  (${t.distanceFromHigh52wPct.toFixed(1)}% away)`,
    `52w Low:        $${t.low52w.toFixed(2)}`,
    `ATR (14d):      $${t.atr14.toFixed(2)} (${t.atrPct.toFixed(2)}% of price)`,
    '',
    'EVENT CALENDAR',
    '──────────────',
    `Earnings:       ${f.earningsDate ?? 'N/A'}  (${f.earningsDte ?? '?'} DTE)  [${enriched.earningsProximity}]`,
    `Ex-Dividend:    ${f.exDivDate ?? 'None in window'}`,
    `Analyst Target: $${f.meanPriceTarget?.toFixed(2) ?? 'N/A'}  (${f.priceTargetDistance?.toFixed(1) ?? '?'}% from current)  [${f.analystConsensus ?? 'N/A'}]`,
    `Short Interest: ${f.shortInterestPct?.toFixed(1) ?? 'N/A'}%  (${f.daysToCover?.toFixed(1) ?? '?'}d to cover)`,
    `Unusual Activity: ${f.unusualActivityFlag ? `YES — ${f.unusualActivityDirection ?? 'unknown'}-biased` : 'None'}`,
    '',
    'MARKET REGIME',
    '─────────────',
    `VIX:            ${marketContext.vix.toFixed(2)}  [${marketContext.vixRegime}]`,
    `Market Trend:   ${marketContext.marketTrend}`,
    `Sector Trend:   N/A`,
    '',
  ];

  if (ct) {
    lines.push(
      'CANDIDATE TRADE',
      '───────────────',
      `Strategy (pre-screen): ${enriched.suggestedStrategy}`,
      `Expiry:         ${ct.expiry}  (${ct.dte} DTE)`,
      `Strike:         $${ct.strike.toFixed(2)}`,
      ...(ct.longStrike ? [`Long Strike:    $${ct.longStrike.toFixed(2)}`] : []),
      `Delta:          ${ct.delta.toFixed(3)}`,
      `Theta:          $${ct.theta.toFixed(3)}/day`,
      `Premium (mid):  $${ct.premiumMid.toFixed(2)}`,
      `Bid/Ask:        $${ct.bid.toFixed(2)} / $${ct.ask.toFixed(2)}  (spread: ${ct.spreadPct.toFixed(1)}%)`,
      `Open Interest:  ${ct.openInterest}`,
      `Max Loss:       $${ct.maxLoss.toFixed(0)}`,
      `Buying Power:   $${ct.bpr.toFixed(0)}`,
      `Ann. Yield:     ${ct.annualisedYield.toFixed(1)}%  (on notional)`,
      `ROBP (Ann.):    ${ct.robpAnnualised.toFixed(1)}%  ← primary ranking metric`,
      `Liquidity:      ${ct.liquidityOk ? 'OK ✓' : 'POOR ✗'}`,
      '',
    );
  } else {
    lines.push(
      'CANDIDATE TRADE',
      '───────────────',
      `Strategy (pre-screen): ${enriched.suggestedStrategy}`,
      'No viable candidate strike — SKIP',
      '',
    );
  }

  lines.push(
    'POSITION CONTEXT',
    '────────────────',
    `Shares Held:    ${ticker.sharesHeld ?? 'None'}`,
    `Cost Basis:     ${ticker.costBasis ? `$${ticker.costBasis.toFixed(2)}` : 'N/A'}`,
    `Notes:          ${ticker.notes ?? 'None'}`,
    '',
    'HUMAN CONTEXT (if any)',
    '──────────────────────',
  );

  if (humanContext.length === 0) {
    lines.push('None this cycle');
  } else {
    humanContext.forEach(entry => {
      lines.push(`[${entry.timestamp.slice(0, 10)} | ${entry.pk}] ${entry.context}`);
    });
  }

  return lines.join('\n');
}
