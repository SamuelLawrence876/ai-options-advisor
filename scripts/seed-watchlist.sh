#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/seed-watchlist.sh                  # seeds production table
#   ./scripts/seed-watchlist.sh dev              # seeds dev table
#   ./scripts/seed-watchlist.sh production       # seeds production table
#
# Requires: AWS CLI authenticated (run `login` first), correct region set.

STAGE="${1:-production}"
TABLE="${STAGE}-watchlist"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "Seeding table: ${TABLE} (region: ${REGION})"

put_item() {
  local item="$1"
  aws dynamodb put-item \
    --table-name "${TABLE}" \
    --region "${REGION}" \
    --item "${item}"
}

# ── Tickers ──────────────────────────────────────────────────────────────────
# Adjust symbol, costBasis, sharesHeld, strategyPref, and notes to match your
# actual positions and targets.
#
# strategyPref: "COVERED_CALL" | "CSP" | "PUT_CREDIT_SPREAD" | "IRON_CONDOR" | "ANY"
# targetYieldPct: minimum annualised premium yield you'll bother with
# minDte / maxDte: preferred expiry window in days
# active: set to false to pause a ticker without deleting it
# ─────────────────────────────────────────────────────────────────────────────

# Apple — hold shares, sell covered calls
put_item '{
  "symbol":        {"S": "AAPL"},
  "strategyPref":  {"S": "COVERED_CALL"},
  "sharesHeld":    {"N": "100"},
  "costBasis":     {"N": "165.00"},
  "targetYieldPct":{"N": "8"},
  "minDte":        {"N": "21"},
  "maxDte":        {"N": "45"},
  "active":        {"BOOL": true},
  "sector":        {"S": "Technology"},
  "notes":         {"S": "Core long position — only sell calls above cost basis"}
}'

# Microsoft — sell puts or put spreads on dips
put_item '{
  "symbol":        {"S": "MSFT"},
  "strategyPref":  {"S": "PUT_CREDIT_SPREAD"},
  "targetYieldPct":{"N": "10"},
  "minDte":        {"N": "21"},
  "maxDte":        {"N": "45"},
  "active":        {"BOOL": true},
  "sector":        {"S": "Technology"},
  "notes":         {"S": "Prefer $5-wide spreads below 50d MA support"}
}'

# NVIDIA — any strategy, high IV name
put_item '{
  "symbol":        {"S": "NVDA"},
  "strategyPref":  {"S": "ANY"},
  "targetYieldPct":{"N": "12"},
  "minDte":        {"N": "21"},
  "maxDte":        {"N": "45"},
  "active":        {"BOOL": true},
  "sector":        {"S": "Technology"},
  "notes":         {"S": "High beta — prefer defined-risk structures, watch earnings closely"}
}'

# JPMorgan — covered calls or CSPs, financial sector
put_item '{
  "symbol":        {"S": "JPM"},
  "strategyPref":  {"S": "ANY"},
  "targetYieldPct":{"N": "8"},
  "minDte":        {"N": "21"},
  "maxDte":        {"N": "45"},
  "active":        {"BOOL": true},
  "sector":        {"S": "Financials"},
  "notes":         {"S": "Watch dividend dates — ex-div can affect call premium"}
}'

# ExxonMobil — energy sector, high dividend yield
put_item '{
  "symbol":        {"S": "XOM"},
  "strategyPref":  {"S": "COVERED_CALL"},
  "targetYieldPct":{"N": "7"},
  "minDte":        {"N": "21"},
  "maxDte":        {"N": "45"},
  "active":        {"BOOL": true},
  "sector":        {"S": "Energy"},
  "notes":         {"S": "Energy vol spikes on oil moves — good premium when IV elevated"}
}'

# UnitedHealth — healthcare, steady IV
put_item '{
  "symbol":        {"S": "UNH"},
  "strategyPref":  {"S": "ANY"},
  "targetYieldPct":{"N": "8"},
  "minDte":        {"N": "21"},
  "maxDte":        {"N": "45"},
  "active":        {"BOOL": true},
  "sector":        {"S": "Healthcare"},
  "notes":         {"S": "Policy risk can spike IV — good sell environment"}
}'

# Amazon — any strategy, large-cap tech
put_item '{
  "symbol":        {"S": "AMZN"},
  "strategyPref":  {"S": "PUT_CREDIT_SPREAD"},
  "targetYieldPct":{"N": "10"},
  "minDte":        {"N": "21"},
  "maxDte":        {"N": "45"},
  "active":        {"BOOL": true},
  "sector":        {"S": "Consumer Discretionary"},
  "notes":         {"S": "No margin for CSPs at this price — defined-risk only"}
}'

# Meta — any strategy, high IV social media
put_item '{
  "symbol":        {"S": "META"},
  "strategyPref":  {"S": "ANY"},
  "targetYieldPct":{"N": "12"},
  "minDte":        {"N": "21"},
  "maxDte":        {"N": "45"},
  "active":        {"BOOL": true},
  "sector":        {"S": "Technology"},
  "notes":         {"S": "IV often elevated — watch for regulatory news"}
}'

# Berkshire Hathaway B — low IV stable name, covered calls only
put_item '{
  "symbol":        {"S": "BRK.B"},
  "strategyPref":  {"S": "COVERED_CALL"},
  "targetYieldPct":{"N": "5"},
  "minDte":        {"N": "21"},
  "maxDte":        {"N": "45"},
  "active":        {"BOOL": true},
  "sector":        {"S": "Financials"},
  "notes":         {"S": "Low IV baseline — only worth it when IV rank above 50"}
}'

# Palantir — high IV speculative, iron condor candidate
put_item '{
  "symbol":        {"S": "PLTR"},
  "strategyPref":  {"S": "ANY"},
  "targetYieldPct":{"N": "15"},
  "minDte":        {"N": "21"},
  "maxDte":        {"N": "45"},
  "active":        {"BOOL": true},
  "sector":        {"S": "Technology"},
  "notes":         {"S": "High IV — iron condors viable when IV rank > 60 and no catalyst"}
}'

echo ""
echo "Done. Seeded 10 tickers into ${TABLE}."
echo ""
echo "To verify:"
echo "  aws dynamodb scan --table-name ${TABLE} --region ${REGION} --query 'Items[*].{symbol:symbol.S,strategy:strategyPref.S,active:active.BOOL}' --output table"
echo ""
echo "To add a human context note before the next run:"
echo "  aws dynamodb put-item --table-name ${STAGE}-human-context --region ${REGION} \\"
echo '    --item '"'"'{"pk":{"S":"AAPL"},"timestamp":{"S":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"},"context":{"S":"Your insight here"},"expires":{"S":"'"$(date -u -d '+7 days' +%Y-%m-%d 2>/dev/null || date -u -v+7d +%Y-%m-%d)"'"},"source":{"S":"manual"}}'"'"
