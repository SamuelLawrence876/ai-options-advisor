# options-advisor

📈 A weekday AI-powered options report for a personal stock watchlist.

The pipeline collects market data, enriches each ticker into structured trade signals, asks Claude via Amazon Bedrock for analysis, and delivers a Markdown report ranked by return on buying power.

See [PLAN.md](./PLAN.md) for the broader design notes and future roadmap.

---

## ✨ What It Does

`options-advisor` is a scheduled AWS pipeline for premium-selling trade research. It does not place trades, connect to a broker, or manage live positions. It prepares a decision-support report so you can review candidate trades manually.

Each run:

1. 🌎 Loads active tickers from DynamoDB and fetches market context.
2. 📊 Pulls options, fundamentals, technicals, VIX, SPY/QQQ trend, sector IV, and earnings calendar data.
3. 🧮 Enriches every ticker with signals such as IV rank, volatility risk premium, earnings risk, ATR, liquidity, candidate strikes, and return on buying power.
4. 🤖 Sends viable candidates to Claude through Bedrock for per-ticker analysis.
5. 🧠 Runs a portfolio-level synthesis that ranks the best opportunities.
6. 📝 Writes a Markdown report to S3.
7. 📬 Sends the report by SES email and stores report metadata plus IV snapshots in DynamoDB.

The default schedule is Monday-Friday at 06:00 UTC.

---

## 🧱 Architecture

The current implementation is TypeScript on AWS CDK v2.

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

Core AWS services:

- 🪣 S3 stores raw market data, enriched ticker data, and generated reports.
- 🧾 DynamoDB stores the watchlist, report metadata, IV history, and human context.
- 🔐 Secrets Manager stores external API keys.
- 🪜 Step Functions orchestrates the pipeline.
- ⚡ Lambda runs each pipeline step.
- 🧠 Bedrock invokes Claude for analysis.
- 📮 SES sends the finished report by email.
- ⏰ EventBridge triggers the weekday run.

---

## 📁 Project Structure

```text
infrastructure/
  bin/app.ts                              CDK entry point
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
        fetch-options-data.ts             Lambda construct for FlashAlpha options data
        fetch-fundamentals.ts             Lambda construct for Finnhub fundamentals
        fetch-technicals.ts               Lambda construct for Finnhub and Polygon technicals
        fetch-market-context.ts           Lambda construct for market regime data
        enrich-and-score.ts               Lambda construct for scoring and candidate selection
        run-llm-analysis.ts               Lambda construct for Bedrock/Claude analysis
        generate-report.ts                Lambda construct for Markdown report generation
        deliver-report.ts                 Lambda construct for SES delivery and DynamoDB writes
      state-machine/
        state-machine.ts                  Step Functions pipeline definition
      scheduler/
        scheduler.ts                      EventBridge cron, Monday-Friday 06:00 UTC
src/
  functions/                              Lambda handler implementations
  types/                                  Shared domain types
  utils/                                  AWS helpers, API clients, metrics, dates, dossier formatting
acceptance/                               AWS-backed acceptance tests and fixtures
scripts/                                  Manual run and watchlist seed scripts
.github/workflows/                        CI, deployment, and PR environment workflows
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
  "sector": "Technology",
  "notes": "Core long position, only sell calls above cost basis"
}
```

Supported `strategyPref` values:

- `COVERED_CALL`
- `CSP`
- `PUT_CREDIT_SPREAD`
- `IRON_CONDOR`
- `ANY`

Set `active` to `false` to pause a ticker without deleting it.

---

## 🔐 Secrets

The stack references existing Secrets Manager secrets by name. Create these before deploying, or make sure they already exist in the target account and region.

Production secret names:

```text
/options-advisor/production/flash-alpha-api-key
/options-advisor/production/market-data-api-token
/options-advisor/production/finnhub-api-key
/options-advisor/production/polygon-api-key
```

Dev secret names:

```text
/options-advisor/dev/flash-alpha-api-key
/options-advisor/dev/market-data-api-token
/options-advisor/dev/finnhub-api-key
/options-advisor/dev/polygon-api-key
```

Example:

```bash
login

aws secretsmanager create-secret \
  --name /options-advisor/dev/flash-alpha-api-key \
  --secret-string 'YOUR_FLASHALPHA_KEY' \
  --region us-east-1

aws secretsmanager create-secret \
  --name /options-advisor/dev/market-data-api-token \
  --secret-string 'YOUR_MARKETDATA_TOKEN' \
  --region us-east-1

aws secretsmanager create-secret \
  --name /options-advisor/dev/finnhub-api-key \
  --secret-string 'YOUR_FINNHUB_KEY' \
  --region us-east-1

aws secretsmanager create-secret \
  --name /options-advisor/dev/polygon-api-key \
  --secret-string 'YOUR_POLYGON_KEY' \
  --region us-east-1
```

If a secret already exists, update it with `aws secretsmanager put-secret-value`.

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
npm install
```

The project is configured for Node.js 24 and npm 11+.

### 2. Run local checks

```bash
npm run lint
npm run check-types
npm test
npm run test:infra
```

Useful test commands:

```bash
npm run test:acceptance
npm run test:acceptance:pipeline
npm run test:acceptance:lambdas
```

Acceptance tests use deployed AWS resources, so authenticate first and set the relevant stage/region environment variables when needed.

### 3. Bootstrap CDK

```bash
login
npx cdk bootstrap
```

### 4. Deploy

Production:

```bash
npm run deploy
```

Dev:

```bash
npm run deploy:dev
```

Equivalent raw CDK commands:

```bash
npx cdk deploy --context stackType=prod
npx cdk deploy --context stackType=dev
```

### 5. Seed the Watchlist

The seed script writes the stock symbols from `scripts/watchlist.json` into the stage watchlist table.

Production:

```bash
npm run seed
```

Dev:

```bash
npm run seed:dev
```

Add or remove stocks by editing the symbol list in `scripts/watchlist.json`, then rerun the seed script.

### 6. Run an Analysis Manually

Production, today’s date:

```bash
npm run analyse
```

Dev:

```bash
npm run analyse:dev
```

Specific date:

```bash
./scripts/run-analysis.sh --stage dev --date 2026-04-25
```

By default, the script waits for Step Functions to finish and downloads the generated report into `reports/{YYYY-MM-DD}.md`.

---

## 📡 Data Providers

Current providers used by the code:

- ⚡ FlashAlpha: options chain data, IV rank, IV percentile, 30-day IV, historical volatility, candidate strikes, Greeks, and sector ETF IV.
- 🐦 Finnhub: current quotes, earnings calendar, dividends, analyst recommendations, and price targets.
- 📐 Polygon: OHLCV history for technical indicators and market trend calculations.
- 🧠 AWS Bedrock: Claude analysis and portfolio synthesis.
- 📬 AWS SES: email delivery.

Alpha Vantage is not used by the current implementation.

---

## 🧠 Analysis Flow

The pipeline first builds a market context object containing VIX regime, SPY/QQQ trend, overall market trend, and sector IVs.

For each active ticker, it then stores:

- `options.json`: IV rank, IV percentile, IV/HV, vol surface, candidate strikes, Greeks, bid/ask, open interest, and volume.
- `fundamentals.json`: earnings date, ex-dividend date, dividend yield, price target, and analyst consensus.
- `technicals.json`: price, 20/50-day moving averages, trend classification, ATR, and 52-week range.

`enrich-and-score` combines those inputs into an enriched ticker record, including:

- Volatility risk premium.
- IV rank signal.
- IV versus sector.
- Earnings and ex-dividend risk.
- ATR and 52-week high proximity.
- Suggested strategy.
- Candidate trade.
- Buying power requirement.
- Annualised yield.
- Annualised return on buying power.
- Liquidity flag.

`run-llm-analysis` skips Bedrock calls for clear `SKIP` candidates, then asks Claude to analyze viable trades. A second Claude call synthesizes the portfolio-level ranking.

---

## 📬 Report Delivery

`generate-report` writes a Markdown report to:

```text
reports/{YYYY-MM-DD}.md
```

`deliver-report` then:

1. Reads the Markdown report from S3.
2. Creates a 7-day pre-signed S3 URL.
3. Sends the report by SES email.
4. Writes report metadata to DynamoDB.
5. Stores IV history snapshots for future comparison.

The email sender and recipient are configured in `infrastructure/lib/config.ts`.

---

## 🛠️ Scripts

Useful npm scripts:

```bash
npm run build
npm run lint
npm run lint:fix
npm run check-types
npm test
npm run test:infra
npm run test:acceptance
npm run deploy
npm run deploy:dev
npm run diff
npm run diff:dev
npm run seed
npm run seed:dev
npm run analyse
npm run analyse:dev
```

Shell scripts:

- `scripts/seed-watchlist.sh`: seeds a watchlist table for `production` or `dev`.
- `scripts/run-analysis.sh`: starts the Step Functions state machine and optionally waits for completion.

---

## 🔄 CI/CD

GitHub Actions workflows:

- `ci.yml`: runs lint, type-check, unit tests, and infrastructure tests on pull requests to `main` and pushes to non-main branches.
- `deploy.yml`: runs on pushes to `main`, deploys dev, runs acceptance tests, then deploys production.
- `pr.yml`: contains scaffolding for PR-specific ephemeral environments.

Workflows use AWS OIDC, so long-lived AWS access keys are not stored in GitHub.

Required GitHub environments:

- `dev`
- `production`
- `ephemeral`, if using the PR workflow

Each environment needs an `AWS_DEPLOY_ROLE_ARN` secret.

Note: the current CDK app explicitly distinguishes production from dev. Review `pr.yml` before relying on ephemeral stacks, because that workflow passes an `ephemeral` context value while `infrastructure/bin/app.ts` currently maps non-production deployments to the dev stage.

---

## ➕ Adding a New Lambda

1. Create `src/functions/{functionName}/index.ts` and export a `handler`.
2. Create `infrastructure/lib/constructs/functions/{function-name}.ts` with a `NodejsFunction`.
3. Grant only the S3, DynamoDB, Secrets Manager, Bedrock, or SES permissions the function needs.
4. Instantiate the construct in `infrastructure/lib/main-stack.ts`.
5. Pass the function into `PipelineStateMachine` props if it belongs in the pipeline.
6. Wire the Step Functions state in `infrastructure/lib/constructs/state-machine/state-machine.ts`.
7. Add focused unit tests and, for pipeline behavior, acceptance coverage.

---

## ⚠️ Current Boundaries

This project is a research and reporting assistant. It does not execute trades, manage orders, rebalance a portfolio, or guarantee that external API data is complete or timely.

Always review the generated report manually before making trading decisions.
