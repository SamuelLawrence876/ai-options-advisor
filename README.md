# options-advisor

📈 A weekday automated options report for a personal stock watchlist.

The pipeline collects market data, enriches each ticker into structured trade signals, asks Claude via Amazon Bedrock for analysis, and delivers a Markdown report ranked by return on buying power.

See [PLAN.md](./PLAN.md) for the broader design notes and future roadmap.

---

## ✨ What It Does

`options-advisor` is a scheduled Amazon Web Services pipeline for premium-selling trade research. It does not place trades, connect to a broker, or manage live positions. It prepares a decision-support report so you can review candidate trades manually.

Each run:

1. 🌎 Loads active tickers from DynamoDB and fetches market context.
2. 📊 Pulls options, fundamentals, technicals, VIX, SPY/QQQ trend, and earnings calendar data.
3. 🧮 Enriches every ticker with signals such as implied volatility rank, volatility risk premium, earnings risk, average true range, liquidity, candidate strikes, and return on buying power.
4. 🤖 Sends viable candidates to Claude through Bedrock for per-ticker analysis.
5. 🧠 Runs a portfolio-level synthesis that ranks the best opportunities.
6. 📝 Writes a Markdown report to S3.
7. 📬 Sends the report by Simple Email Service, posts it to Discord when configured, and stores report metadata plus implied volatility snapshots in DynamoDB.

The default schedule is Monday-Friday at 06:00 UTC.

---

## 🧱 Architecture

The current implementation is TypeScript on AWS Cloud Development Kit v2.

```text
EventBridge Scheduler
  -> Step Functions state machine
    -> fetch-market-context
    -> per-ticker parallel data fetch
      -> fetch-options-data
      -> fetch-fundamentals
      -> fetch-technicals
    -> enrich-and-score
    -> run-llm-analysis, stage 1 per ticker
    -> run-llm-analysis, stage 2 portfolio synthesis
    -> generate-report
    -> deliver-report
```

Core Amazon Web Services services:

- 🪣 S3 stores raw market data, enriched ticker data, and generated reports.
- 🧾 DynamoDB stores the watchlist, report metadata, implied volatility history, and human context.
- 🔐 Secrets Manager stores external API keys.
- 🪜 Step Functions orchestrates the pipeline.
- ⚡ Lambda runs each pipeline step.
- 🧠 Bedrock invokes Claude for analysis.
- 📮 Simple Email Service sends the finished report by email.
- 💬 Discord receives the finished report through a webhook when the webhook secret exists.
- ⏰ EventBridge triggers the weekday run.

---

## 📁 Project Structure

```text
infrastructure/
  bin/app.ts                              Cloud Development Kit entry point
  lib/
    config.ts                             Stack name, region, email addresses, secret paths
    main-stack.ts                         Wires storage, tables, secrets, Lambdas, state machine, scheduler
    utils/naming.ts                       Stage-prefixed resource names
    constructs/
      data/
        storage.ts                        S3 bucket with lifecycle rules
        tables.ts                         DynamoDB tables
      secrets/
        secrets.ts                        References API key secrets
      functions/
        fetch-options-data.ts             Lambda construct for MarketData.app options data
        fetch-fundamentals.ts             Lambda construct for Finnhub fundamentals
        fetch-technicals.ts               Lambda construct for Finnhub and Polygon technicals
        fetch-market-context.ts           Lambda construct for market regime data
        enrich-and-score.ts               Lambda construct for scoring and candidate selection
        run-llm-analysis.ts               Lambda construct for Bedrock/Claude analysis
        generate-report.ts                Lambda construct for Markdown report generation
        deliver-report.ts                 Lambda construct for Simple Email Service delivery and DynamoDB writes
      state-machine/
        state-machine.ts                  Step Functions pipeline definition
      scheduler/
        scheduler.ts                      EventBridge cron, Monday-Friday 06:00 UTC
src/
  functions/                              Lambda handler implementations
  types/                                  Shared domain types
  utils/                                  Amazon Web Services helpers, clients, metrics, dates, dossier formatting
acceptance/                               Amazon Web Services-backed acceptance tests and fixtures
scripts/                                  Manual run and watchlist seed scripts
.github/workflows/                        Continuous integration, deployment, and pull request environment workflows
```

---

## 🪣 S3 Bucket Layout

Buckets are named:

```text
options-analysis-{account}-{region}-{stage}
```

The current code writes these keys:

```text
raw-data/
  {YYYY-MM-DD}/
    market-context.json
    earnings-calendar.json
    {TICKER}/
      options.json
      fundamentals.json
      technicals.json
enriched/
  {YYYY-MM-DD}/
    {TICKER}.json
reports/
  {YYYY-MM-DD}.md
```

Raw data is intentionally preserved for the run date so failed downstream steps can be replayed without refetching paid API data. `raw-data/` expires after 90 days in production and 14 days in dev.

Prompts are currently compiled into `src/functions/runLlmAnalysis/prompts.ts`; they are not loaded from S3.

---

## 🧾 DynamoDB Tables

Tables are stage-prefixed:

- `production-watchlist` or `dev-watchlist`
- `production-iv-history` or `dev-iv-history`
- `production-reports` or `dev-reports`
- `production-human-context` or `dev-human-context`

Production tables use point-in-time recovery and retain data when the stack is removed. Dev tables are destroyed with the stack.

### Watchlist Item Shape

Watchlist items use camelCase fields:

```json
{
  "symbol": "AAPL",
  "strategyPref": "COVERED_CALL",
  "sharesHeld": 100,
  "costBasis": 165,
  "targetYieldPct": 8,
  "minDte": 21,
  "maxDte": 45,
  "active": true,
  "notes": "Core long position, only sell calls above cost basis"
}
```

Supported `strategyPref` values:

- `COVERED_CALL`
- `CSP` — cash-secured put
- `PUT_CREDIT_SPREAD`
- `ANY`

Set `active` to `false` to pause a ticker without deleting it.

---

## 🔐 Secrets

The stack references existing Secrets Manager secrets by name. Create these before deploying.

Production:

```text
/options-advisor/production/market-data-api-token
/options-advisor/production/finnhub-api-key
/options-advisor/production/polygon-api-key
/options-advisor/production/discord-webhook-url
```

Dev:

```text
/options-advisor/dev/market-data-api-token
/options-advisor/dev/finnhub-api-key
/options-advisor/dev/polygon-api-key
/options-advisor/dev/discord-webhook-url
```

---

## 📡 Data Providers

Current providers used by the code:

- 📈 MarketData.app: options chain data, chain-proxy implied volatility rank, implied volatility percentile, 30-day implied volatility, candidate strikes, Greeks, bid/ask, open interest, and volume.
- 🐦 Finnhub: current quotes, earnings calendar, dividends, analyst recommendations, and price targets.
- 📐 Polygon: open, high, low, close, and volume history for technical indicators and market trend calculations.
- 🧠 AWS Bedrock: Claude analysis and portfolio synthesis.
- 📬 Simple Email Service: email delivery.

Alpha Vantage is not used by the current implementation.

---

## 🧠 Pipeline Walkthrough

This section describes what each step actually does, including the thresholds, formulas, and decisions that drive the report.

---

### Step 1 — fetch-market-context

Runs once per pipeline execution before any per-ticker work.

- Fetches the VIX spot price from CBOE.
- Fetches daily open, high, low, close, and volume bars for SPY and QQQ from Polygon.
- Computes 20-day and 50-day moving averages from the bar history.
- Classifies each index trend:
  - `BULL`: price and 20-day moving average both above 50-day moving average.
  - `BEAR`: price and 20-day moving average both below 50-day moving average.
  - `NEUTRAL`: mixed.
- Sets `marketTrend` to `BULL`, `BEAR`, or `NEUTRAL` based on combined SPY/QQQ signal.
- Classifies VIX regime:
  - `LOW`: VIX < 15
  - `NORMAL`: 15 ≤ VIX < 25
  - `ELEVATED`: 25 ≤ VIX < 35
  - `EXTREME`: VIX ≥ 35

The resulting `market-context.json` is passed to every downstream step.

---

### Step 2 — Per-ticker data fetch (parallel)

Three lambdas run in parallel for each active watchlist ticker.

#### 2a. fetch-options-data (MarketData.app)

Queries `/v1/options/chain/{symbol}/?dte={targetDte}` where:

```
targetDte = round((minDte + maxDte) / 2)
```

With the default window of `minDte=21, maxDte=45`, `targetDte=33`. The API returns all strikes from the nearest expiry to that days-to-expiration target.

From the full chain response:

- **`candidateStrikes`**: every strike returned — puts and calls, all deltas. No delta filtering here.
- **`iv30d`**: average implied volatility of near-at-the-money options only (`|delta|` 0.40–0.60). Uses the broader liquid set as fallback if fewer than 2 at-the-money options exist.
- **`ivRank` (chain-proxy)**: 75th-percentile implied volatility across all liquid strikes. A single-snapshot approximation — not a 52-week rank. Stored as `ivRankSource: 'CHAIN_PROXY'`.

Every run fetches fresh from the API; there is no caching.

#### 2b. fetch-fundamentals (Finnhub)

- Earnings date and days-to-earnings (`earningsDte`).
- Ex-dividend date and days-to-ex-div (`exDivDte`).
- Analyst consensus (STRONG_BUY → STRONG_SELL), mean price target, distance from current price.
- Short interest percentage and days-to-cover.
- Unusual options activity flag and direction.

#### 2c. fetch-technicals (Finnhub + Polygon)

- Current price, 52-week high and low, distance from 52-week high.
- Open, high, low, close, and volume bars → 20-day and 50-day moving averages (closing-price averages).
- Trend classification (same BULLISH/BEARISH/NEUTRAL logic as market context, but for the individual stock).
- `atr14`: 14-day average true range.
- `atrPct`: `atr14` / price × 100.
- `hv30d`: annualised 30-day historical volatility from log returns of daily closes.

---

### Step 3 — enrich-and-score

This is the mechanical heart of the pipeline. It combines the three raw data sources into a single enriched record and makes all strategy decisions without involving a large language model.

#### 3a. Implied volatility rank resolution

Looks up the DynamoDB `iv-history` table for up to 52 weeks of daily `iv30d` snapshots for this ticker.

- **5 or more historical data points**: computes a true implied volatility rank by positioning today's `iv30d` within the historical min–max range. Sets `ivRankSource: 'HISTORICAL'`.
- **Fewer than 5 data points**: falls back to the chain-proxy rank from MarketData. Sets `ivRankSource: 'CHAIN_PROXY'`.

This matters because the sell threshold differs:

| Source        | Sell threshold | Buy threshold |
| ------------- | -------------- | ------------- |
| `HISTORICAL`  | 50             | 35            |
| `CHAIN_PROXY` | 60             | 35            |

The chain-proxy threshold is higher (60 vs 50) because the single-snapshot approximation tends to overestimate rank relative to a true 52-week calculation.

#### 3b. Volatility risk premium

```
volatility_risk_premium = iv30d − hv30d
```

Only computed when `hv30d > 0`. A missing or zero historical volatility would make the premium spuriously positive (it would just equal `iv30d`). A positive volatility risk premium means options are priced above realised vol — this favours premium selling.

#### 3c. Implied volatility rank signal

```
ivRank ≥ sellThreshold  →  SELL_ENVIRONMENT
ivRank ≤ 35             →  BUY_ENVIRONMENT
otherwise               →  SKIP  (neutral zone)
```

#### 3d. Event risk

- `earningsInWindow`: `earningsDte ≤ maxDte` (default 45). Blocks all strategies — earnings inside the expiry window makes premium selling too risky.
- `exDivInWindow`: `exDivDte ≤ maxDte`. Blocks covered calls only (early assignment risk).
- `earningsProximity`: `DANGER` (≤ 7 days to expiration), `CAUTION` (≤ 14 days to expiration), `CLEAR`.

#### 3e. Strategy selection

Strategy is chosen mechanically from implied volatility rank, trend, and position context. No large language model involvement here.

```
if earningsInWindow → SKIP

if ivRank ≥ sellThreshold (SELL_ENVIRONMENT):
  strategyPref == 'COVERED_CALL' && sharesHeld ≥ 100  → COVERED_CALL
  trend == 'BULLISH'                                   → PUT_CREDIT_SPREAD
  trend == 'BEARISH'                                   → CALL_CREDIT_SPREAD
  else (NEUTRAL, no shares)                            → CSP  // cash-secured put

if ivRank ≤ 35 (BUY_ENVIRONMENT):
  trend == 'BULLISH'  → CALL_DEBIT_SPREAD
  trend == 'BEARISH'  → PUT_DEBIT_SPREAD
  else (NEUTRAL)      → SKIP

// Neutral zone (between buy and sell thresholds):
trend == 'NEUTRAL'  → IRON_CONDOR
else                → SKIP
```

#### 3f. Candidate strike selection

Filters `candidateStrikes` to the days-to-expiration window: `minDte ≤ dte ≤ maxDte` and within 15 days of `targetDte`. Then builds the trade for the selected strategy:

**Target spread width (credit spreads and iron condor):**

```
targetWidth = max(3, min(10, round(atr14)))
```

The 14-day average true range is used as a proxy for a one-sigma daily move. A $4 average-true-range stock gets a 4-wide spread.

**Short leg (credit spreads, cash-secured put, iron condor):**

- Filters to `|delta|` in `[0.20, 0.35]`.
- Sorts by closeness to delta 0.27 (roughly 27% probability of expiring in-the-money).
- Picks the best fit.

**Long leg (credit spreads, iron condor):**

- Filters to same expiry, on the out-of-the-money side of the short leg.
- Sorts by closeness to `targetWidth` distance from the short strike.
- Must satisfy: `credit ≥ width × 0.33` — the long leg can consume at most 67% of the short premium. This enforces a minimum reward-to-risk ratio on the spread.

**Long leg (debit spreads):**

- Filters to `|delta|` in `[0.45, 0.65]` (near at-the-money).
- Picks closest to delta 0.50.
- Short leg: `|delta|` in `[0.20, 0.35]`, closest to 0.30.
- Requires `width − netDebit ≥ netDebit` (1:1 minimum reward:risk).

**Iron condor:** combines a put credit spread below at-the-money and a call credit spread above at-the-money on the same expiry. Needs all four legs to satisfy their individual 33% credit constraints.

#### 3g. Risk metrics

For each candidate trade, the code computes:

| Metric                        | Formula                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `maxLoss`                     | Credit: `(width − premium) × 100`. Cash-secured put / covered call: `(strike − premium) × 100`. Debit: `netDebit × 100`. |
| `bpr` (buying power required) | Credit/debit spreads and iron condor: equals `maxLoss`. Covered call: `price × 100`. Cash-secured put: equals `maxLoss`. |
| `annualisedYield`             | `premium / strike × (365 / dte) × 100` — yield on notional.                                                              |
| `robpAnnualised`              | `premium / bpr × (365 / dte) × 100` — return on buying power. **This is the primary ranking metric.**                    |
| `premiumCoversAtr`            | `premiumMid > atr14` — does premium collected exceed a typical daily move?                                               |

#### 3h. Liquidity check

```
minOi = max(50, round(9_500_000 / (price × 100)))
liquidityOk = openInterest > minOi  AND  spreadPct < 10%
```

The open interest threshold is price-scaled to target roughly $9.5M notional (the equivalent of 500 contracts on a $190 stock). For high-priced stocks like NVDA ($850) this works out to ~112 contracts, not 500.

For multi-leg strategies the minimum open interest across all legs is used.

#### 3i. Rejection reasons and final strategy

After candidate selection, `candidateRejectionReasons` checks (in order):

1. No candidate found → `"No mechanically valid candidate trade was found in the option chain."`
2. Any metric non-finite or ≤ 0 → `"Candidate has invalid risk, premium, or return math."`
3. `!liquidityOk` → `"Liquidity below threshold: open interest X, bid/ask spread Y%."`
4. `annualisedYield < targetYieldPct` (if set on the watchlist item) → `"Annualised yield X% is below target Y%."`
5. Covered call + `exDivInWindow` → `"Ex-dividend date falls inside the expiry window for this covered call."`

If any rejection reason is present, `suggestedStrategy` is overridden to `SKIP`. The rejection reasons are stored in the enriched record and surface directly in the report.

---

### Step 4 — run-llm-analysis, stage 1 (per ticker)

For each ticker, one of two paths:

**SKIP path (no Bedrock call):**

If `suggestedStrategy == 'SKIP'`, a structured reason is built from the enriched data (in priority order):

1. Earnings inside the expiry window.
2. Mechanical rejection reason (liquidity, yield, etc.).
3. Implied volatility rank in the neutral zone.
4. Implied volatility rank in the buy zone with no directional trend.
5. Fallback: "Data unavailable."

**Viable path (Bedrock call):**

1. Builds a structured dossier with: implied volatility rank and signal, volatility risk premium, trend, average true range, earnings/ex-div calendar, analyst targets, short interest, market regime, and the full candidate trade (strategy, strikes, Greeks, premium, bid/ask, max loss, buying power required, return on buying power).
2. Sends the dossier to Claude with a system prompt that anchors Claude to the mechanically-computed metrics. Claude is explicitly told not to invent different strikes, expiries, or risk figures.
3. Claude returns JSON: `recommendation`, `confidence`, `reasoning`, `risks`, `flags`, and optionally adjusted strike/expiry.
4. `withCandidateMetrics` overrides all numeric fields (maxLoss, buying power required, yield, return on buying power) with the code-computed values from the enriched record. Claude's numbers are discarded; its role is qualitative analysis only.

---

### Step 5 — run-llm-analysis, stage 2 (portfolio synthesis)

Receives all per-ticker analyses in one call.

1. Sends the full array of `TickerAnalysis` objects plus market context to Claude.
2. Claude selects the top 3–5 opportunities ranked by `robpAnnualised`, writes a plain-English trade description for each (using exact strikes from the data), and notes any macro, sector, or correlation risks.
3. `withTopPickMetrics` filters the result: a top pick is only kept if a corresponding `TickerAnalysis` exists with positive `maxLoss`, `buyingPowerRequired`, `annualisedYield`, and `robpAnnualised`. This prevents Claude from including repaired or invented trades in the final ranking.

---

### Step 6 — generate-report

Renders the Markdown report using the synthesis and ticker analyses:

- **Market regime block**: VIX, regime label, SPY/QQQ prices and trends.
- **Executive summary**: Claude's portfolio-level narrative.
- **Top opportunities**: medal-ranked picks (🥇🥈🥉 then #4, #5), each showing strategy emoji, trade description, yield, return on buying power, max loss, buying power, reasoning, and risks.
- **Full watchlist table**: every ticker analysed, with strategy, confidence, yield, return on buying power, rationale, and flags.
- **Flags section**: upcoming earnings, skipped positions with reasons, sector/correlation warnings, macro note.

Strategy emojis: 📞 COVERED_CALL, 🐂 PUT_CREDIT_SPREAD, 🐻 CALL_CREDIT_SPREAD, 🚀 CALL_DEBIT_SPREAD, 🌊 PUT_DEBIT_SPREAD, 🦅 IRON_CONDOR, 🛡️ CSP (cash-secured put).

The report is written to `reports/{YYYY-MM-DD}.md` in S3.

---

### Step 7 — deliver-report

1. Reads the Markdown report from S3.
2. Creates a 7-day pre-signed S3 URL.
3. Sends the report by Simple Email Service email.
4. Posts the report to Discord via webhook (when the webhook secret exists).
5. Writes report metadata to DynamoDB (`reports` table): date, S3 key, top picks array, status `COMPLETE`.
6. Writes implied volatility history snapshots to DynamoDB (`iv-history` table) — one row per ticker with `iv30d`, `ivRank`, `hv30d`, and `vrp`. These snapshots accumulate over time and are used by `enrich-and-score` to compute true historical implied volatility rank once 5+ data points exist.

---

### Signal quick-reference

| Signal                                     | Threshold                                     | Effect                                             |
| ------------------------------------------ | --------------------------------------------- | -------------------------------------------------- |
| Implied volatility rank (historical)       | ≥ 50                                          | SELL_ENVIRONMENT                                   |
| Implied volatility rank (chain-proxy)      | ≥ 60                                          | SELL_ENVIRONMENT                                   |
| Implied volatility rank (either)           | ≤ 35                                          | BUY_ENVIRONMENT                                    |
| Implied volatility rank between thresholds | —                                             | Neutral zone → IRON_CONDOR (NEUTRAL trend) or SKIP |
| Earnings inside window                     | `earningsDte ≤ maxDte`                        | Hard SKIP regardless of implied volatility         |
| Near 52-week high                          | `distanceFromHigh52wPct < 5%`                 | Flag only, not a SKIP                              |
| Premium covers average true range          | `premiumMid > atr14`                          | Flag only                                          |
| Liquidity (open interest)                  | `> max(50, round(9_500_000 / (price × 100)))` | Fails liquidityOk                                  |
| Liquidity (spread)                         | `< 10%`                                       | Fails liquidityOk                                  |
| Min credit (spread)                        | `≥ width × 0.33`                              | Long-leg selector skips candidates below this      |
| Min reward:risk (debit)                    | `width − netDebit ≥ netDebit`                 | Spread rejected if not 1:1                         |

---

## 🔄 Continuous Integration and Deployment

GitHub Actions workflows:

- `ci.yml`: runs lint, type-check, unit tests, and infrastructure tests on pull requests to `main` and pushes to non-main branches.
- `deploy.yml`: runs on pushes to `main`, deploys dev, runs acceptance tests, then deploys production.
- `pr.yml`: deploys pull-request-specific ephemeral environments using a branch-derived stage name.

Workflows use AWS OpenID Connect, so long-lived AWS access keys are not stored in GitHub.

Required GitHub environments:

- `dev`
- `production`
- `ephemeral`, if using the pull request workflow

Each environment needs an `AWS_DEPLOY_ROLE_ARN` secret.

Ephemeral stacks use the pull request workflow's derived stage name for stack names, DynamoDB tables, S3 buckets, and secret paths.

---

## ⚠️ Current Boundaries

This project is a research and reporting assistant. It does not execute trades, manage orders, rebalance a portfolio, or guarantee that external API data is complete or timely.

Always review the generated report manually before making trading decisions.
