# options-advisor

A weekly AI-powered report that tells you which options trades on your personal stock watchlist are worth making — and why — ranked by return on buying power.

See [PLAN.md](./PLAN.md) for the full build plan.

---

## What it does

## Project structure

```
infrastructure/
  bin/app.ts                              CDK entry point
  lib/
    config.ts                             Stack name, region, Secrets Manager paths
    main-stack.ts                         Wires all constructs together
    constructs/
      data/
        storage.ts                        S3 data bucket with lifecycle rules
        tables.ts                         4 DynamoDB tables
      secrets/
        secrets.ts                        API key secrets (FlashAlpha, Alpha Vantage)
      functions/
        fetch-options-data.ts             Lambda: IV rank, Greeks, vol surface
        fetch-fundamentals.ts             Lambda: earnings, dividends, analyst ratings
        fetch-technicals.ts               Lambda: trend, moving averages, ATR
        fetch-market-context.ts           Lambda: VIX, SPY/QQQ, sector ETF IV
        enrich-and-score.ts               Lambda: score each ticker, compute ROBP
        run-llm-analysis.ts               Lambda: Claude analysis via Bedrock
        generate-report.ts                Lambda: render HTML report
        deliver-report.ts                 Lambda: store to S3 and send via email
      state-machine/
        state-machine.ts                  Step Functions orchestrator
      scheduler/
        scheduler.ts                      EventBridge cron — Monday 06:00 UTC
src/
  functions/                              Lambda handler implementations
  utils/logger.ts                         Structured JSON logger
.github/workflows/                        CI/CD
```

---

## S3 bucket layout

```
options-analysis-{account}-{region}-{stage}/
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

Raw data is never overwritten mid-run — if a run fails you can reprocess from S3 without re-fetching from paid APIs. `raw-data/` expires after 90 days in production (14 days in dev).

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Run tests

```bash
npm test
```

### 3. Bootstrap and deploy

```bash
login                           # authenticate to AWS
npx cdk bootstrap               # first time only, per account/region
npx cdk deploy                  # production stack
npx cdk deploy -c stackType=dev # dev stack
```

### 4. Populate API keys

After the first deploy, add your keys to Secrets Manager:

```bash
aws secretsmanager put-secret-value \
  --secret-id /options-advisor/production/flash-alpha-api-key \
  --secret-string '{"apiKey":"YOUR_KEY"}'

aws secretsmanager put-secret-value \
  --secret-id /options-advisor/production/alpha-vantage-api-key \
  --secret-string '{"apiKey":"YOUR_KEY"}'
```

### 5. Seed the watchlist

Add tickers to the `production-watchlist` DynamoDB table:

```json
{
  "symbol": "AAPL",
  "strategy_pref": "COVERED_CALL",
  "cost_basis": 165.00,
  "target_yield_pct": 1.5,
  "max_dte": 45,
  "min_dte": 21,
  "active": true,
  "notes": "hold 200 shares"
}
```

---

## CI/CD

| Workflow | Trigger | What happens |
|---|---|---|
| `ci.yml` | Every push and PR | Lint, type-check, unit tests |
| `deploy.yml` | Merge to `main` | Deploy dev, then production |

Workflows use AWS OIDC — no long-lived access keys stored in GitHub. Create two GitHub Environments (`dev`, `production`) each with an `AWS_DEPLOY_ROLE_ARN` secret.

---

## API accounts needed

| Provider | Used for | Cost |
|---|---|---|
| FlashAlpha | Options data — IV rank, Greeks, vol surface, key levels | Free (5 req/day) → Growth tier for >5 tickers |
| Alpha Vantage | Price history, fundamentals, earnings calendar | Free (25 req/day) — enough for ~15 tickers |
| AWS Bedrock | Claude inference | Pay-per-token — negligible at weekly cadence |
| AWS SES | Email delivery | Near-free at this volume |

---

## Adding a new Lambda

1. Create `src/functions/{functionName}/index.ts` and export a `handler`
2. Create `infrastructure/lib/constructs/functions/{function-name}.ts` with a `NodejsFunction` construct and the required IAM grants
3. Instantiate it in `main-stack.ts` and pass `fn` into `PipelineStateMachine` props
