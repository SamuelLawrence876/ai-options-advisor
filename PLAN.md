# Options Analysis System — Build Plan

## What We're Building

A scheduled AWS pipeline that collects options market data, event data, technical context, and macro signals across a personal watchlist — enriches it into clean trade signals — feeds it to Claude via Bedrock — and delivers a structured weekly report of ranked options selling opportunities with full reasoning.

**Not in scope (yet):** autonomous execution, broker API integration, live position tracking.

---

## Guiding Principles

- The LLM does the reasoning. Lambdas do the fetching and mechanical pre-computation.
- Every piece of data fed to the LLM has a specific job. Nothing goes in just because it's available.
- The system should be runnable manually at any point, not just on schedule.
- Prompts are stored in S3, not hardcoded — they can be updated without a deploy.
- Human insight can be injected before the LLM run via a simple input mechanism.
- Ranking is always by return on buying power (ROBP), never raw yield — a high-yield capital-intensive trade ranks below a modest-yield capital-efficient one if ROBP says so.

---

## Phase 1 — Foundation

**Goal:** Watchlist config, storage, and a single working data fetch end to end.

### 1.1 — CDK Project Setup

Set up the monorepo package following existing patterns. Single CDK stack to start: `OptionsAnalysisStack`.

Constructs to scaffold:

- `StorageConstruct` — S3 bucket + DynamoDB tables
- `SchedulerConstruct` — EventBridge cron rule (weekly, Monday 06:00 UTC — before US pre-market)
- Placeholder Step Functions state machine

### 1.2 — DynamoDB Tables

**Watchlist Table**
Stores your universe of tickers and per-position context.

```
PK: TICKER
─────────────────────────────────────────
symbol            string      e.g. "AAPL"
strategy_pref     string      "COVERED_CALL" | "ANY"
cost_basis        number      optional — your entry price if you hold shares
target_yield_pct  number      minimum annualised premium yield to bother with
max_dte           number      default 45
min_dte           number      default 21
active            boolean     toggle tickers in/out without deleting
notes             string      free text — e.g. "hold 200 shares"
```

**IV History Table**
Daily IV snapshots per ticker. Lets you build your own IV rank over time, independent of API limits.

```
PK: TICKER
SK: DATE (YYYY-MM-DD)
─────────────────────────────────────────
iv_30d            number
iv_rank           number
iv_percentile     number
hv_30d            number
vrp               number      iv_30d minus hv_30d
```

**Report Table**
Metadata index of every report generated. Full report content lives in S3.

```
PK: REPORT_DATE (YYYY-MM-DD)
─────────────────────────────────────────
s3_key            string
tickers_analysed  list
top_picks         list        ticker + strategy for quick lookup
status            string      "COMPLETE" | "PARTIAL" | "FAILED"
```

**Human Context Table**
Optional inputs you inject before a run.

```
PK: TICKER | "GLOBAL"
SK: TIMESTAMP
─────────────────────────────────────────
context           string      free text insight
expires           string      date after which this entry is ignored
source            string      "manual" always for now
```

### 1.3 — S3 Bucket Structure

```
options-analysis-{account}-{region}/
  raw-data/
    {YYYY-MM-DD}/
      {TICKER}/
        options.json
        fundamentals.json
        technicals.json
        market-context.json
  enriched/
    {YYYY-MM-DD}/
      {TICKER}.json
  prompts/
    system-prompt.txt
    ticker-analysis-template.txt
    portfolio-synthesis-template.txt
  reports/
    {YYYY-MM-DD}/
      full-report.html
      summary.json
```

Raw data is always preserved. If a run fails midway, you can reprocess from S3 without re-fetching from paid APIs.

### 1.4 — FlashAlpha Integration Lambda (`fetch-options-data`)

Single Lambda. Input: ticker symbol. Output: raw JSON to S3.

Data to fetch per ticker:

- IV rank + IV percentile
- Current IV (30d)
- Historical vol (30d)
- Vol surface (strikes + expiries grid)
- BSM Greeks for candidate strikes (delta, theta, vega)
- Bid/ask, open interest, volume for candidate strikes
- Key levels (gamma flip, call wall, put wall)

Store raw response verbatim to `raw-data/{date}/{ticker}/options.json`.

API budget note: FlashAlpha free tier is 5 calls/day. For a watchlist larger than 5 tickers you will need their Growth tier or a fallback to ThetaData ($25/mo). Design the Lambda to support multiple provider configs from the start.

---

## Phase 2 — Data Collection

**Goal:** All three remaining data categories fetching and storing reliably.

### 2.1 — Fundamentals Lambda (`fetch-fundamentals`)

Fetches event and sentiment data. Most critical inputs.

Data to collect:

**Earnings**

- Next earnings date
- Days until earnings (DTE to earnings)
- Historical earnings move (average % move over last 4 prints) — useful for contextualising IV

Source: Alpha Vantage earnings calendar endpoint. yfinance as fallback.

**Dividends**

- Next ex-dividend date
- Days until ex-div
- Annual dividend yield

Source: Alpha Vantage or yfinance.

**Short Interest**

- Short interest as % of float
- Days to cover

Source: Quandl FINRA short interest (free, 2-day lag). Acceptable for weekly cadence.

**Analyst Ratings**

- Consensus rating
- Mean price target
- Number of recent upgrades/downgrades (last 30 days)
- Distance between current price and mean price target (%)

Source: Alpha Vantage analyst ratings or FMP (Financial Modelling Prep — free tier available).

**Unusual Options Activity Flag**

- Boolean: has there been unusual options volume in the last 5 days?
- Direction: call-biased or put-biased?

Source: Unusual Whales API (paid) or manual flag via human context table for now. This is a nice-to-have for v1.

### 2.2 — Technicals Lambda (`fetch-technicals`)

Fetches price history and computes technical signals. This Lambda does more computation than the others.

Data to fetch:

- Daily OHLCV for past 252 trading days (1 year)

Data to compute:

- Current price
- 52-week high and low
- Distance from 52-week high (%)
- 20-day and 50-day simple moving average
- Trend classification: BULLISH / NEUTRAL / BEARISH

Trend classification logic:

```
Price > 50d MA and 20d MA > 50d MA → BULLISH
Price < 50d MA and 20d MA < 50d MA → BEARISH
Otherwise → NEUTRAL
```

- ATR (14-day Average True Range)
- ATR as % of price — normalised measure of daily movement

Source: Alpha Vantage daily adjusted (free tier: 25 calls/day, 500/month — sufficient for a 20-ticker watchlist).

### 2.3 — Market Context Lambda (`fetch-market-context`)

Runs once per cycle, not per ticker. Fetches macro and regime data.

Data to collect:

- VIX current level
- VIX 20-day average (is VIX elevated vs its recent baseline?)
- VIX regime classification: LOW (<15) / NORMAL (15–25) / ELEVATED (25–35) / EXTREME (>35)
- SPY price and 20/50d MA trend
- QQQ price and 20/50d MA trend
- Market trend classification: BULL / NEUTRAL / BEAR

Sector ETF IV (per ticker's sector):

- XLK (tech), XLF (financials), XLE (energy), XLV (healthcare), XLY (consumer disc), XLP (consumer staples), XLI (industrials), XLB (materials), XLU (utilities), XLRE (real estate)
- Fetch current IV for the relevant sector ETF for each ticker in your watchlist

Source: Alpha Vantage for price data. FlashAlpha for sector ETF IV.

---

## Phase 3 — Enrichment

**Goal:** A single Lambda that takes all raw data for a ticker and produces a clean, LLM-ready signal object.

### 3.1 — Enrichment Lambda (`enrich-and-score`)

Input: all raw JSON files from S3 for a given ticker + date.
Output: enriched signal object written to `enriched/{date}/{ticker}.json`.

Computations:

**Vol signals**

```
vrp = current_iv - hv_30d
iv_rank_signal = iv_rank >= 50 ? "SELL_ENVIRONMENT" : "SKIP"
iv_vs_sector = current_iv vs sector_etf_iv (above/below/inline)
```

**Event flags**

```
earnings_in_window = earnings_dte <= target_dte
earnings_proximity = earnings_dte < 14 ? "DANGER" : earnings_dte < 21 ? "CAUTION" : "CLEAR"
exdiv_in_window = exdiv_dte <= target_dte
```

**Technical signals**

```
near_52w_high = distance_from_high < 5% ? true : false
atr_pct = atr / price * 100
premium_covers_atr = selected_premium > atr ? true : false
```

**Liquidity check**

```
liquidity_ok = open_interest > 500 AND spread_pct < 10%
```

**First-pass strategy suggestion**

```
if trend == BULLISH and iv_rank >= 50 and earnings_clear → CSP or PUT_CREDIT_SPREAD
if trend == NEUTRAL and iv_rank >= 50 and earnings_clear → COVERED_CALL
if trend == NEUTRAL/BULLISH and iv_rank >= 60 and atr_low → IRON_CONDOR
if iv_rank < 50 → SKIP
if earnings_in_window → SKIP (override everything)
```

This suggestion is a starting point. The LLM can and will override it with reasoning.

**Candidate strike selection**
For each viable strategy, compute the specific strike(s) the LLM should evaluate:

- Covered call: closest strike above current price with delta 0.25–0.35
- Put credit spread: short strike at delta 0.25–0.30, long strike 5–10 points below
- CSP: strike at delta 0.25–0.30

Also compute annualised yield for each candidate:

```
annualised_yield = (premium / (strike * 100)) * (365 / dte) * 100
```

**Risk-adjusted metrics**
These are computed per candidate trade and are the primary ranking signal. Raw yield is presented for context but never used for ranking.

```
// Max loss — worst case capital at risk
max_loss (covered call)     = (cost_basis - premium_collected) * 100
                              // shares can go to zero; premium is partial offset
max_loss (put credit spread) = (spread_width - premium_collected) * 100
                              // e.g. $5 spread, $1.20 credit → max loss = $380
max_loss (CSP)              = (strike - premium_collected) * 100
                              // obligated to buy shares at strike

// Buying power required — capital the broker holds against the position
bpr (covered call)          = share_price * 100
                              // full share cost unless on margin
bpr (put credit spread)     = max_loss
                              // defined risk = BPR for spreads
bpr (CSP)                   = max_loss
                              // cash held to cover assignment

// Return on buying power — the apples-to-apples comparison metric
robp = premium_collected / bpr

// Annualised ROBP — the primary ranking field
robp_annualised = robp * (365 / dte) * 100
```

Why this matters in practice: a covered call collecting $380 on $18,200 of buying power (2.1% ROBP) ranks well below a put spread collecting $120 on $380 of buying power (31.6% ROBP), even though the covered call has a higher raw dollar premium and may show a higher annualised yield on a notional basis. Without ROBP the ranking is actively misleading.

---

## Phase 4 — LLM Analysis

**Goal:** Per-ticker analysis + portfolio-level synthesis via Bedrock (Claude).

### 4.1 — Prompt Templates (stored in S3)

**System prompt** — sets the persona and analytical framework. Defines what a good covered call opportunity looks like, what the LLM should always check, and how to format output. Stored in S3 so it can be updated without a deploy.

**Ticker analysis template** — structured dossier format (see below). One per ticker.

**Portfolio synthesis template** — fed all per-ticker outputs plus macro context. Produces the final ranked report.

### 4.2 — Ticker Dossier Format

The enriched data is formatted into this structure before being sent to the LLM:

```
═══════════════════════════════════════
TICKER: {SYMBOL} | {COMPANY_NAME}
PRICE: ${price} | SECTOR: {sector}
═══════════════════════════════════════

VOLATILITY
──────────
IV Rank:        {iv_rank} / 100  [{iv_rank_signal}]
IV Percentile:  {iv_percentile}%
Current IV:     {current_iv}%
30d HV:         {hv_30d}%
VRP:            {vrp > 0 ? "+" : ""}{vrp}%  [{vrp > 0 ? "POSITIVE ✓" : "NEGATIVE ✗"}]
Sector ETF IV:  {sector_etf_iv}%  ({iv_vs_sector})

TREND & TECHNICALS
──────────────────
Trend:          {trend_classification}
Price vs 20d MA: {above/below} by {pct}%
Price vs 50d MA: {above/below} by {pct}%
52w High:       ${52w_high}  ({distance_from_high}% away)
52w Low:        ${52w_low}
ATR (14d):      ${atr} ({atr_pct}% of price)

EVENT CALENDAR
──────────────
Earnings:       {earnings_date}  ({earnings_dte} DTE)  [{earnings_proximity}]
Ex-Dividend:    {exdiv_date or "None in window"}
Analyst Target: ${mean_pt}  ({pt_distance}% from current)  [{consensus}]
Short Interest: {short_interest}%  ({days_to_cover}d to cover)
Unusual Activity: {unusual_activity_flag}

MARKET REGIME
─────────────
VIX:            {vix}  [{vix_regime}]
Market Trend:   {market_trend}
Sector Trend:   {sector_trend}

CANDIDATE TRADE
───────────────
Strategy (pre-screen): {suggested_strategy}
Expiry:         {target_expiry}  ({target_dte} DTE)
Strike:         ${strike}
Delta:          {delta}
Theta:          ${theta}/day
Premium (mid):  ${premium}
Bid/Ask:        ${bid} / ${ask}  (spread: {spread_pct}%)
Open Interest:  {open_interest}
Max Loss:       ${max_loss}
Buying Power:   ${bpr}
Ann. Yield:     {annualised_yield}%  (on notional)
ROBP (Ann.):    {robp_annualised}%  ← primary ranking metric
Liquidity:      {liquidity_ok ? "OK ✓" : "POOR ✗"}

POSITION CONTEXT
────────────────
Shares Held:    {shares_held or "None"}
Cost Basis:     ${cost_basis or "N/A"}
Notes:          {watchlist_notes}

HUMAN CONTEXT (if any)
──────────────────────
{human_context_entries or "None this cycle"}
```

### 4.3 — LLM Analysis Lambda (`run-llm-analysis`)

**Stage 1 — Per-ticker calls**

One Bedrock call per ticker. Ask Claude to return structured JSON:

```json
{
  "symbol": "AAPL",
  "recommendation": "COVERED_CALL | PUT_CREDIT_SPREAD | CSP | IRON_CONDOR | SKIP | WATCH",
  "confidence": "HIGH | MEDIUM | LOW",
  "adjusted_strike": 197.5,
  "adjusted_expiry": "2026-05-16",
  "reasoning": "2-3 sentence plain English explanation",
  "risks": ["risk 1", "risk 2", "risk 3"],
  "flags": ["any specific warnings"],
  "annualised_yield": 12.4,
  "max_loss": 380,
  "buying_power_required": 380,
  "robp_annualised": 84.3
}
```

Structured output means the synthesis stage and report formatter can process results reliably.

**Stage 2 — Portfolio synthesis call**

One Bedrock call with all per-ticker results + macro context. Ask Claude to:

- Rank the top 3–5 opportunities by ROBP (annualised) — not raw yield
- Note where ROBP ranking differs materially from yield ranking, and why that matters
- Flag any sector concentration (>2 positions in the same sector)
- Flag any correlated risk (e.g. multiple semiconductor names)
- Note the overall market regime and whether this is a good week for premium selling broadly
- Produce an executive summary paragraph

Output: structured JSON consumed by the report formatter.

### 4.4 — Human Context Injection

Before Stage 1 runs, the Lambda checks the Human Context DynamoDB table for any entries where:

- PK matches the ticker being analysed, OR
- PK is "GLOBAL"
- AND the entry hasn't expired

Any matching entries are appended to the ticker dossier in the HUMAN CONTEXT section. The system prompt instructs Claude to treat human context as high-weight, time-sensitive signal that may not yet be reflected in market data.

---

## Phase 5 — Reporting & Delivery

**Goal:** A clean, actionable report delivered on schedule.

### 5.1 — Report Lambda (`generate-report`)

Takes the portfolio synthesis JSON and renders it as a formatted HTML email.

Report structure:

**Header**

- Report date
- Market regime banner (colour coded — green/amber/red based on VIX regime + market trend)
- One-line executive summary

**Top Opportunities This Week**
For each top pick (ranked by ROBP):

- Ticker + company name
- Recommended trade structure in plain English ("Sell the MSFT $415/$410 put spread, 28 DTE, collect $1.20")
- Max loss + buying power required
- Annualised yield (on notional) + ROBP annualised — both shown, ROBP is the ranking basis
- Confidence level
- Key reasoning (2–3 sentences)
- Risks to watch

**Full Watchlist Review**
Table format — every ticker with: recommendation, confidence, ann. yield, ROBP (ann.), max loss, buying power, one-line rationale, key flag if any.

**Flags & Warnings**

- Upcoming earnings on any watchlist names (next 14 days)
- Any SKIP recommendations with explanation of what needs to change
- Sector concentration warnings
- Macro notes

**Data Freshness Footer**
Timestamps of each data source fetch. Lets you see immediately if any source failed or returned stale data.

### 5.2 — Delivery Lambda (`deliver-report`)

- Store full HTML report to S3 `reports/{date}/full-report.html`
- Generate pre-signed URL (7-day expiry)
- Send HTML email via SES with the report inline + S3 link for archiving
- Optional: post a Slack summary (top 3 picks only) via SNS → Lambda → Slack webhook

---

## Phase 6 — Step Functions Orchestration

**Goal:** Wire everything into a single reliable state machine triggered on schedule.

### State Machine Flow

```
[Start]
    │
    ▼
[Fetch Market Context]          ← runs once, not per ticker
    │
    ▼
[Load Active Watchlist]         ← reads DynamoDB, returns ticker list
    │
    ▼
[Map: Per-Ticker Collection]    ← runs in parallel for all tickers
    │   ├── fetch-options-data
    │   ├── fetch-fundamentals
    │   └── fetch-technicals
    │
    ▼
[Map: Per-Ticker Enrichment]    ← enrich-and-score for each ticker
    │
    ▼
[Map: Per-Ticker LLM Analysis]  ← Stage 1 Bedrock calls
    │
    ▼
[Portfolio Synthesis]           ← Stage 2 Bedrock call
    │
    ▼
[Generate Report]
    │
    ▼
[Deliver Report]
    │
    ▼
[Update IV History Table]       ← store today's IV snapshots for future IV rank calculation
    │
    ▼
[End]
```

### Error Handling

- Each Map state catches individual ticker failures — one bad API response doesn't abort the whole run
- Failed tickers are noted in the report data freshness section
- If >50% of tickers fail data collection, the state machine aborts and sends an alert rather than generating a low-quality report
- All Lambda errors go to CloudWatch with structured logging

### EventBridge Schedule

```
cron(0 6 ? * MON *)    ← every Monday 06:00 UTC
```

Also wire up a manual trigger — an SNS topic or Lambda URL — so you can kick off a run on demand without waiting for the schedule.

---

## Build Order

### Week 1 — Storage & Config

- CDK stack scaffold
- DynamoDB tables + S3 bucket
- Watchlist seeded with 5–10 tickers
- FlashAlpha account + API key in Secrets Manager
- Alpha Vantage account + API key in Secrets Manager

### Week 2 — Data Collection

- `fetch-options-data` Lambda working, storing to S3
- `fetch-fundamentals` Lambda working, storing to S3
- `fetch-technicals` Lambda working, storing to S3
- `fetch-market-context` Lambda working, storing to S3
- All four testable independently via manual invoke

### Week 3 — Enrichment + LLM

- `enrich-and-score` Lambda working end to end for a single ticker
- System prompt and ticker template drafted in S3
- `run-llm-analysis` Stage 1 working for a single ticker
- Validate output JSON structure

### Week 4 — Orchestration & Report

- Stage 2 portfolio synthesis working
- `generate-report` Lambda producing clean HTML
- SES delivery working
- Step Functions state machine wiring everything together
- EventBridge schedule active

### Week 5 — Polish

- Human context injection working (DynamoDB → dossier)
- Error handling and partial failure logic
- IV history table being populated each run
- Manual trigger endpoint
- End-to-end test with full watchlist

---

## API Accounts Needed

| Provider      | Purpose                                        | Cost                                                |
| ------------- | ---------------------------------------------- | --------------------------------------------------- |
| FlashAlpha    | IV rank, Greeks, vol surface, key levels       | Free (5/day) → Growth tier if >5 tickers            |
| Alpha Vantage | Price history, fundamentals, earnings calendar | Free tier (25 req/day) — sufficient for ~15 tickers |
| ThetaData     | Fallback / alternative options data            | $25/mo if needed                                    |
| AWS SES       | Email delivery                                 | Near-free at this volume                            |
| AWS Bedrock   | Claude via API                                 | Pay per token — negligible at weekly cadence        |

---

## What's Explicitly Out Of Scope

- Broker API integration or trade execution
- Real-time monitoring or intraday triggers
- Backtesting or historical strategy analysis
- Position tracking or P&L reporting
- Mobile app or web UI

These are all natural Phase 2 additions once the core reporting loop is proven.
