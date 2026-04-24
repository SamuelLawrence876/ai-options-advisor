import {
  EnrichedTicker,
  MarketContext,
  PortfolioSynthesis,
  TickerAnalysis,
  TopPick,
  VixRegime,
  MarketTrend,
  StrategyRecommendation,
} from '../../types';

const REGIME_EMOJI: Record<VixRegime, string> = {
  LOW: '🟢',
  NORMAL: '🔵',
  ELEVATED: '🟡',
  EXTREME: '🔴',
};

const REGIME_LABELS: Record<VixRegime, string> = {
  LOW: 'LOW VOLATILITY — Premium environment cautious',
  NORMAL: 'NORMAL VOLATILITY — Good premium-selling environment',
  ELEVATED: 'ELEVATED VOLATILITY — Strong premium environment, size carefully',
  EXTREME: 'EXTREME VOLATILITY — Size down significantly, defined-risk only',
};

const TREND_EMOJI: Record<MarketTrend, string> = {
  BULL: '📈',
  BEAR: '📉',
  NEUTRAL: '➡️',
};

const STRATEGY_EMOJI: Record<StrategyRecommendation, string> = {
  COVERED_CALL: '📞',
  PUT_CREDIT_SPREAD: '📉',
  CSP: '💵',
  IRON_CONDOR: '🦅',
  SKIP: '⏭️',
  WATCH: '👀',
};

const CONFIDENCE_EMOJI: Record<string, string> = {
  HIGH: '🟢',
  MEDIUM: '🟡',
  LOW: '🔴',
};

function fmt(n: number | null | undefined, decimals = 1, prefix = ''): string {
  if (n === null || n === undefined) return '—';
  return `${prefix}${n.toFixed(decimals)}`;
}

function buildMarketRegimeSection(marketContext: MarketContext): string {
  const regimeEmoji = REGIME_EMOJI[marketContext.vixRegime];
  const regimeLabel = REGIME_LABELS[marketContext.vixRegime];
  const marketEmoji = TREND_EMOJI[marketContext.marketTrend];

  return [
    '## 📊 Market Regime',
    '',
    `${regimeEmoji} **VIX ${marketContext.vix.toFixed(2)}** — ${regimeLabel}`,
    `> 20-day VIX avg: **${marketContext.vix20dAvg.toFixed(2)}**`,
    '',
    `| Index | Price     | Trend |`,
    `|-------|-----------|-------|`,
    `| SPY   | $${marketContext.spyPrice.toFixed(2)} | ${TREND_EMOJI[marketContext.spyTrend]} ${marketContext.spyTrend} |`,
    `| QQQ   | $${marketContext.qqqPrice.toFixed(2)} | ${TREND_EMOJI[marketContext.qqqTrend]} ${marketContext.qqqTrend} |`,
    '',
    `${marketEmoji} **Overall market trend: ${marketContext.marketTrend}**`,
  ].join('\n');
}

function buildTopPickSection(pick: TopPick, index: number): string {
  const stratEmoji = STRATEGY_EMOJI[pick.strategy] ?? '📋';
  const confEmoji = CONFIDENCE_EMOJI[pick.confidence] ?? '⚪';
  const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;

  return [
    `### ${medal} ${pick.symbol} — ${stratEmoji} ${pick.strategy.replace(/_/g, ' ')} ${confEmoji} ${pick.confidence}`,
    '',
    `> 💬 *${pick.tradeDescription}*`,
    '',
    `| 📈 Ann. Yield | ⭐ ROBP (Ann.) | 💀 Max Loss | 💰 Buying Power |`,
    `|--------------|----------------|------------|-----------------|`,
    `| **${fmt(pick.annualisedYield)}%** | **${fmt(pick.robpAnnualised)}%** | $${fmt(pick.maxLoss, 0)} | $${fmt(pick.buyingPower, 0)} |`,
    '',
    `💡 **Reasoning:** ${pick.reasoning}`,
    ...(pick.risks.length > 0 ? [`⚠️ **Risks:** ${pick.risks.join(' · ')}`] : []),
  ].join('\n');
}

function buildWatchlistTable(analyses: TickerAnalysis[]): string {
  const header =
    '| Ticker | Strategy | Conf | Ann. Yield | ROBP ★ | Max Loss | Buying Power | Rationale | Flags |';
  const divider =
    '|--------|----------|------|------------|--------|----------|--------------|-----------|-------|';
  const rows = analyses.map(a => {
    const stratEmoji = STRATEGY_EMOJI[a.recommendation] ?? '';
    const confEmoji = CONFIDENCE_EMOJI[a.confidence] ?? '';
    const flags = a.flags.length > 0 ? a.flags.join(', ') : '—';
    return `| **${a.symbol}** | ${stratEmoji} ${a.recommendation.replace(/_/g, ' ')} | ${confEmoji} ${a.confidence} | ${fmt(a.annualisedYield)}% | ${fmt(a.robpAnnualised)}% | $${fmt(a.maxLoss, 0)} | $${fmt(a.buyingPowerRequired, 0)} | ${a.reasoning.replace(/\|/g, '/')} | ${flags} |`;
  });
  return [header, divider, ...rows].join('\n');
}

function buildFlagsSection(
  analyses: TickerAnalysis[],
  synthesis: PortfolioSynthesis,
  enrichedTickers: EnrichedTicker[],
): string {
  const lines: string[] = ['## ⚠️ Flags & Warnings'];

  const earningsWarnings = enrichedTickers.filter(
    e => e.rawFundamentals?.earningsDte !== undefined && e.rawFundamentals.earningsDte <= 14,
  );
  if (earningsWarnings.length > 0) {
    lines.push('', '### 📅 Upcoming Earnings (Next 14 Days)');
    earningsWarnings.forEach(e =>
      lines.push(
        `- 🚨 **${e.ticker.symbol}** — earnings in ${e.rawFundamentals.earningsDte} days *(${e.rawFundamentals.earningsDate})*`,
      ),
    );
  }

  const skips = analyses.filter(a => a.recommendation === 'SKIP');
  if (skips.length > 0) {
    lines.push('', '### ⏭️ Skipped Positions');
    skips.forEach(a => lines.push(`- **${a.symbol}** — ${a.reasoning}`));
  }

  if (synthesis.sectorConcentrationWarnings.length > 0) {
    lines.push('', '### 🏢 Sector Concentration');
    synthesis.sectorConcentrationWarnings.forEach(w => lines.push(`- ⚠️ ${w}`));
  }

  if (synthesis.correlatedRiskWarnings.length > 0) {
    lines.push('', '### 🔗 Correlated Risk');
    synthesis.correlatedRiskWarnings.forEach(w => lines.push(`- ⚠️ ${w}`));
  }

  if (synthesis.macroNote) {
    lines.push('', '### 🌍 Macro Note', '', `> ${synthesis.macroNote}`);
  }

  return lines.join('\n');
}

function buildPortfolioNotes(synthesis: PortfolioSynthesis): string {
  if (synthesis.robpVsYieldDivergences.length === 0) return '';
  return [
    '## 💼 Portfolio Notes',
    '',
    '**📊 ROBP vs Yield Divergences:**',
    ...synthesis.robpVsYieldDivergences.map(d => `- ${d}`),
  ].join('\n');
}

export function buildReport(
  synthesis: PortfolioSynthesis,
  tickerAnalyses: TickerAnalysis[],
  enrichedTickers: EnrichedTicker[],
  date: string,
  marketContext: MarketContext,
): string {
  const sections: string[] = [
    `# 📋 Options Analysis — ${date}`,
    `*⏱️ Generated: ${new Date().toISOString()} · 🔍 ${tickerAnalyses.length} positions analysed*`,
    '',
    '---',
    '',
    buildMarketRegimeSection(marketContext),
    '',
    '---',
    '',
    '## 🧠 Executive Summary',
    '',
    synthesis.executiveSummary,
    '',
    '---',
    '',
    '## 🎯 Top Opportunities',
    '',
    '*Ranked by ⭐ ROBP (return on buying power) annualised — not raw yield*',
    '',
    ...synthesis.topPicks.map((pick, i) => buildTopPickSection(pick, i) + '\n'),
    '---',
    '',
    '## 📋 Full Watchlist',
    '',
    buildWatchlistTable(tickerAnalyses),
    '',
    '---',
    '',
    buildFlagsSection(tickerAnalyses, synthesis, enrichedTickers),
  ];

  const portfolioNotes = buildPortfolioNotes(synthesis);
  if (portfolioNotes) {
    sections.push('', '---', '', portfolioNotes);
  }

  return sections.join('\n');
}
