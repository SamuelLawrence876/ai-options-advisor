import {
  EnrichedTicker,
  MarketContext,
  PortfolioSynthesis,
  TickerAnalysis,
  TopPick,
  VixRegime,
} from '../../types';
import { info } from '../../utils/logger';
import { putHtml } from '../../utils/s3';

interface GenerateReportEvent {
  synthesis: PortfolioSynthesis;
  tickerAnalyses: TickerAnalysis[];
  enrichedTickers: EnrichedTicker[];
  date: string;
  marketContext: MarketContext;
}

interface GenerateReportResult {
  reportKey: string;
  synthesis: PortfolioSynthesis;
  tickerAnalyses: TickerAnalysis[];
  enrichedTickers: EnrichedTicker[];
  date: string;
  marketContext: MarketContext;
}

const REGIME_COLORS: Record<VixRegime, { bg: string; text: string; label: string }> = {
  LOW: { bg: '#16a34a', text: '#ffffff', label: 'LOW VOLATILITY — Premium environment cautious' },
  NORMAL: { bg: '#2563eb', text: '#ffffff', label: 'NORMAL VOLATILITY — Good premium-selling environment' },
  ELEVATED: { bg: '#d97706', text: '#ffffff', label: 'ELEVATED VOLATILITY — Strong premium environment, size carefully' },
  EXTREME: { bg: '#dc2626', text: '#ffffff', label: 'EXTREME VOLATILITY — Size down significantly, defined-risk only' },
};

function confidenceBadge(confidence: string): string {
  const colors: Record<string, string> = {
    HIGH: '#16a34a',
    MEDIUM: '#d97706',
    LOW: '#6b7280',
  };
  const bg = colors[confidence] ?? '#6b7280';
  return `<span style="background:${bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">${confidence}</span>`;
}

function strategyBadge(strategy: string): string {
  const colors: Record<string, string> = {
    COVERED_CALL: '#7c3aed',
    PUT_CREDIT_SPREAD: '#0891b2',
    CSP: '#0284c7',
    IRON_CONDOR: '#6d28d9',
    SKIP: '#6b7280',
    WATCH: '#b45309',
  };
  const bg = colors[strategy] ?? '#6b7280';
  return `<span style="background:${bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${strategy.replace('_', ' ')}</span>`;
}

function fmt(n: number | null | undefined, decimals = 1, prefix = ''): string {
  if (n === null || n === undefined) return '—';
  return `${prefix}${n.toFixed(decimals)}`;
}

function buildTopPickCard(pick: TopPick, index: number): string {
  return `
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:16px;background:#ffffff;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
      <span style="background:#1e40af;color:#fff;width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${index + 1}</span>
      <strong style="font-size:18px;">${pick.symbol}</strong>
      ${strategyBadge(pick.strategy)}
      ${confidenceBadge(pick.confidence)}
    </div>
    <p style="font-family:monospace;background:#f3f4f6;padding:10px 14px;border-radius:6px;margin:0 0 12px;font-size:14px;">${pick.tradeDescription}</p>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;">
      <div style="background:#f9fafb;padding:10px;border-radius:6px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Ann. Yield</div>
        <div style="font-size:20px;font-weight:700;color:#111827;">${fmt(pick.annualisedYield)}%</div>
      </div>
      <div style="background:#dbeafe;padding:10px;border-radius:6px;text-align:center;">
        <div style="font-size:11px;color:#1e40af;text-transform:uppercase;letter-spacing:0.05em;">ROBP (Ann.) ★</div>
        <div style="font-size:20px;font-weight:700;color:#1e40af;">${fmt(pick.robpAnnualised)}%</div>
      </div>
      <div style="background:#f9fafb;padding:10px;border-radius:6px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Max Loss</div>
        <div style="font-size:20px;font-weight:700;color:#dc2626;">$${fmt(pick.maxLoss, 0)}</div>
      </div>
      <div style="background:#f9fafb;padding:10px;border-radius:6px;text-align:center;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Buying Power</div>
        <div style="font-size:20px;font-weight:700;color:#111827;">$${fmt(pick.buyingPower, 0)}</div>
      </div>
    </div>
    <p style="margin:0 0 8px;color:#374151;font-size:14px;">${pick.reasoning}</p>
    ${
      pick.risks.length > 0
        ? `<div style="margin-top:8px;"><span style="font-size:12px;font-weight:600;color:#6b7280;">RISKS: </span><span style="font-size:12px;color:#6b7280;">${pick.risks.join(' · ')}</span></div>`
        : ''
    }
  </div>`;
}

function buildWatchlistTable(analyses: TickerAnalysis[]): string {
  const rows = analyses
    .map(
      (a) => `
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 12px;font-weight:600;">${a.symbol}</td>
        <td style="padding:10px 12px;">${strategyBadge(a.recommendation)}</td>
        <td style="padding:10px 12px;">${confidenceBadge(a.confidence)}</td>
        <td style="padding:10px 12px;text-align:right;">${fmt(a.annualisedYield)}%</td>
        <td style="padding:10px 12px;text-align:right;color:#1e40af;font-weight:600;">${fmt(a.robpAnnualised)}%</td>
        <td style="padding:10px 12px;text-align:right;">$${fmt(a.maxLoss, 0)}</td>
        <td style="padding:10px 12px;text-align:right;">$${fmt(a.buyingPowerRequired, 0)}</td>
        <td style="padding:10px 12px;font-size:12px;color:#6b7280;max-width:280px;">${a.reasoning}</td>
        <td style="padding:10px 12px;font-size:12px;color:#dc2626;">${a.flags.join(', ')}</td>
      </tr>`,
    )
    .join('');

  return `
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
        <th style="padding:10px 12px;text-align:left;">Ticker</th>
        <th style="padding:10px 12px;text-align:left;">Strategy</th>
        <th style="padding:10px 12px;text-align:left;">Confidence</th>
        <th style="padding:10px 12px;text-align:right;">Ann. Yield</th>
        <th style="padding:10px 12px;text-align:right;">ROBP (Ann.) ★</th>
        <th style="padding:10px 12px;text-align:right;">Max Loss</th>
        <th style="padding:10px 12px;text-align:right;">Buying Power</th>
        <th style="padding:10px 12px;text-align:left;">Rationale</th>
        <th style="padding:10px 12px;text-align:left;">Flags</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildFlagsSection(
  analyses: TickerAnalysis[],
  synthesis: PortfolioSynthesis,
  enrichedTickers: EnrichedTicker[],
  date: string,
): string {
  const earningsWarnings = enrichedTickers
    .filter((e) => e.rawFundamentals.earningsDte !== undefined && e.rawFundamentals.earningsDte <= 14)
    .map(
      (e) =>
        `<li><strong>${e.ticker.symbol}</strong> — earnings in ${e.rawFundamentals.earningsDte} days (${e.rawFundamentals.earningsDate})</li>`,
    );

  const skips = analyses
    .filter((a) => a.recommendation === 'SKIP')
    .map(
      (a) =>
        `<li><strong>${a.symbol}</strong> — ${a.reasoning}</li>`,
    );

  const sectorWarnings = synthesis.sectorConcentrationWarnings.map((w) => `<li>${w}</li>`);
  const correlatedWarnings = synthesis.correlatedRiskWarnings.map((w) => `<li>${w}</li>`);

  return `
  <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:20px;margin-bottom:24px;">
    <h3 style="margin:0 0 16px;color:#92400e;">⚠ Flags & Warnings</h3>
    ${earningsWarnings.length > 0 ? `<div style="margin-bottom:12px;"><strong style="color:#b45309;">Upcoming earnings (next 14 days):</strong><ul style="margin:4px 0 0;padding-left:20px;">${earningsWarnings.join('')}</ul></div>` : ''}
    ${skips.length > 0 ? `<div style="margin-bottom:12px;"><strong style="color:#b45309;">SKIPs — what needs to change:</strong><ul style="margin:4px 0 0;padding-left:20px;">${skips.join('')}</ul></div>` : ''}
    ${sectorWarnings.length > 0 ? `<div style="margin-bottom:12px;"><strong style="color:#b45309;">Sector concentration:</strong><ul style="margin:4px 0 0;padding-left:20px;">${sectorWarnings.join('')}</ul></div>` : ''}
    ${correlatedWarnings.length > 0 ? `<div style="margin-bottom:12px;"><strong style="color:#b45309;">Correlated risk:</strong><ul style="margin:4px 0 0;padding-left:20px;">${correlatedWarnings.join('')}</ul></div>` : ''}
    ${synthesis.macroNote ? `<div><strong style="color:#b45309;">Macro:</strong> ${synthesis.macroNote}</div>` : ''}
  </div>`;
}

export const handler = async (event: GenerateReportEvent): Promise<GenerateReportResult> => {
  const bucketName = process.env.BUCKET_NAME!;
  const { synthesis, tickerAnalyses, enrichedTickers, date, marketContext } = event;

  info('generate-report started', { date, topPickCount: synthesis.topPicks?.length ?? 0 });

  const regimeStyle = REGIME_COLORS[marketContext.vixRegime];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Options Analysis — ${date}</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0;background:#f9fafb;color:#111827;">
  <div style="max-width:900px;margin:0 auto;padding:24px;">

    <div style="background:#1e40af;color:#ffffff;padding:24px;border-radius:8px 8px 0 0;margin-bottom:0;">
      <h1 style="margin:0 0 4px;font-size:24px;">Options Analysis Report</h1>
      <p style="margin:0;opacity:0.8;">${date} · ${tickerAnalyses.length} positions analysed</p>
    </div>

    <div style="background:${regimeStyle.bg};color:${regimeStyle.text};padding:12px 24px;margin-bottom:24px;border-radius:0 0 8px 8px;">
      <strong>VIX ${marketContext.vix.toFixed(2)}</strong> — ${regimeStyle.label}
    </div>

    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <h2 style="margin:0 0 12px;font-size:16px;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Executive Summary</h2>
      <p style="margin:0;font-size:15px;line-height:1.6;">${synthesis.executiveSummary}</p>
    </div>

    <h2 style="font-size:18px;margin:0 0 16px;">Top Opportunities This Week</h2>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Ranked by ROBP (return on buying power) annualised ★ — not raw yield</p>
    ${synthesis.topPicks.map((pick, i) => buildTopPickCard(pick, i)).join('')}

    ${synthesis.robpVsYieldDivergences.length > 0 ? `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:24px;">
      <strong style="color:#1e40af;">ROBP vs Yield divergences:</strong>
      <ul style="margin:8px 0 0;padding-left:20px;font-size:14px;">
        ${synthesis.robpVsYieldDivergences.map((d) => `<li>${d}</li>`).join('')}
      </ul>
    </div>` : ''}

    <h2 style="font-size:18px;margin:24px 0 16px;">Full Watchlist Review</h2>
    <div style="overflow-x:auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
      ${buildWatchlistTable(tickerAnalyses)}
    </div>

    ${buildFlagsSection(tickerAnalyses, synthesis, enrichedTickers, date)}

    <div style="background:#f3f4f6;border-radius:8px;padding:16px;font-size:12px;color:#6b7280;">
      <strong>Data freshness</strong> · Report generated: ${new Date().toISOString()} ·
      Market data: ${marketContext.fetchedAt} ·
      Tickers: ${tickerAnalyses.map((a) => a.symbol).join(', ')}
    </div>

  </div>
</body>
</html>`;

  const reportKey = `reports/${date}/full-report.html`;
  await putHtml(bucketName, reportKey, html);

  info('generate-report complete', { date, reportKey });

  return { reportKey, synthesis, tickerAnalyses, enrichedTickers, date, marketContext };
};
