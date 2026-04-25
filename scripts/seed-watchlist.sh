#!/usr/bin/env bash
set -euo pipefail

STAGE="production"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT_DIR}" ]]; then
  ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
fi
WATCHLIST_FILE="${WATCHLIST_FILE:-${ROOT_DIR}/scripts/watchlist.json}"

usage() {
  echo "Usage: $0 [production|dev] [--stage production|dev] [--file path/to/watchlist.json]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    production|dev)
      STAGE="$1"
      shift
      ;;
    --stage)
      STAGE="$2"
      shift 2
      ;;
    --file)
      WATCHLIST_FILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "${WATCHLIST_FILE}" ]]; then
  echo "Watchlist file not found: ${WATCHLIST_FILE}" >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

TABLE="${STAGE}-watchlist"
REQUEST_DIR="$(mktemp -d)"
trap 'rm -rf "${REQUEST_DIR}"' EXIT

echo "Seeding table: ${TABLE} (region: ${REGION})"
echo "Watchlist file: ${WATCHLIST_FILE}"

COUNT="$(
  node - "${WATCHLIST_FILE}" "${REQUEST_DIR}" "${TABLE}" <<'NODE'
const fs = require('fs');
const [watchlistFile, requestDir, tableName] = process.argv.slice(2);
const defaults = {
  strategyPref: 'ANY',
  minDte: 21,
  maxDte: 45,
  active: true,
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function attributeValue(value, key) {
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number' && Number.isFinite(value)) return { N: String(value) };
  if (typeof value === 'boolean') return { BOOL: value };
  fail(`Unsupported value for ${key}`);
}

function toPutRequest(item) {
  const result = {};
  for (const [key, value] of Object.entries(item)) {
    if (value === undefined || value === null || value === '') continue;
    result[key] = attributeValue(value, key);
  }
  return { PutRequest: { Item: result } };
}

const watchlist = JSON.parse(fs.readFileSync(watchlistFile, 'utf8'));
if (!Array.isArray(watchlist)) fail('Watchlist file must contain a JSON array');
if (watchlist.length === 0) fail('Watchlist file must contain at least one ticker');

const seen = new Set();
const items = watchlist.map((entry, index) => {
  const rawSymbol = typeof entry === 'string' ? entry : entry?.symbol;
  if (typeof rawSymbol !== 'string' || rawSymbol.trim() === '') fail(`Item ${index + 1} must include a symbol`);
  const normalizedSymbol = rawSymbol.trim().toUpperCase();
  if (seen.has(normalizedSymbol)) fail(`Duplicate symbol: ${normalizedSymbol}`);
  seen.add(normalizedSymbol);
  if (typeof entry === 'string') return { symbol: normalizedSymbol, ...defaults };
  if (typeof entry !== 'object' || Array.isArray(entry)) fail(`Item ${index + 1} must be a symbol string or object`);
  return { ...defaults, ...entry, symbol: normalizedSymbol };
});

for (let index = 0; index < items.length; index += 25) {
  const chunk = items.slice(index, index + 25).map(toPutRequest);
  fs.writeFileSync(
    `${requestDir}/batch-${String(index / 25).padStart(3, '0')}.json`,
    JSON.stringify({ [tableName]: chunk }),
  );
}

process.stdout.write(String(items.length));
NODE
)"

write_batch() {
  local request_file="$1"
  local attempt=1
  local response_file
  local retry_file
  local unprocessed_count

  while true; do
    response_file="${REQUEST_DIR}/response-${RANDOM}.json"
    retry_file="${REQUEST_DIR}/retry-${RANDOM}.json"

    aws dynamodb batch-write-item \
      --region "${REGION}" \
      --request-items "file://${request_file}" \
      --output json >"${response_file}"

    unprocessed_count="$(
      node - "${response_file}" "${retry_file}" "${TABLE}" <<'NODE'
const fs = require('fs');
const [responseFile, retryFile, tableName] = process.argv.slice(2);
const response = JSON.parse(fs.readFileSync(responseFile, 'utf8'));
const unprocessed = response.UnprocessedItems || {};
const requests = unprocessed[tableName] || [];
if (requests.length > 0) {
  fs.writeFileSync(retryFile, JSON.stringify({ [tableName]: requests }));
}
process.stdout.write(String(requests.length));
NODE
    )"

    if [[ "${unprocessed_count}" == "0" ]]; then
      return 0
    fi

    if [[ "${attempt}" -ge 5 ]]; then
      echo "DynamoDB still had ${unprocessed_count} unprocessed writes after ${attempt} attempts" >&2
      return 1
    fi

    sleep "${attempt}"
    request_file="${retry_file}"
    attempt=$((attempt + 1))
  done
}

for request_file in "${REQUEST_DIR}"/batch-*.json; do
  write_batch "${request_file}"
done

echo "Done. Seeded ${COUNT} tickers into ${TABLE}."
echo "Verify with:"
echo "  aws dynamodb scan --table-name ${TABLE} --region ${REGION} --query 'Items[*].{symbol:symbol.S,strategy:strategyPref.S,active:active.BOOL}' --output table"
