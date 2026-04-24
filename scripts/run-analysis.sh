#!/usr/bin/env bash
set -euo pipefail

# Manual trigger for the options analysis pipeline.
#
# Usage:
#   ./scripts/run-analysis.sh                          # prod, today's date, wait for result
#   ./scripts/run-analysis.sh --stage dev              # dev stack
#   ./scripts/run-analysis.sh --date 2026-04-21        # specific date
#   ./scripts/run-analysis.sh --no-wait                # fire and forget
#   ./scripts/run-analysis.sh --stage dev --date 2026-04-21 --no-wait

STAGE="production"
DATE="$(date -u +%Y-%m-%d)"
WAIT=true
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
REPORTS_DIR="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo ".")/reports"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)  STAGE="$2";  shift 2 ;;
    --date)   DATE="$2";   shift 2 ;;
    --no-wait) WAIT=false; shift   ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

STATE_MACHINE_NAME="${STAGE}-options-analysis"

echo "Looking up state machine: ${STATE_MACHINE_NAME}"

STATE_MACHINE_ARN=$(aws stepfunctions list-state-machines \
  --region "${REGION}" \
  --query "stateMachines[?name=='${STATE_MACHINE_NAME}'].stateMachineArn | [0]" \
  --output text)

if [[ -z "${STATE_MACHINE_ARN}" || "${STATE_MACHINE_ARN}" == "None" ]]; then
  echo "Error: state machine '${STATE_MACHINE_NAME}' not found in region ${REGION}." >&2
  echo "Have you deployed? Try: npm run deploy:dev or npm run deploy" >&2
  exit 1
fi

EXECUTION_NAME="manual-${DATE}-$(date -u +%H%M%S)"
INPUT="{\"date\":\"${DATE}\"}"

echo "Starting execution: ${EXECUTION_NAME}"
echo "  State machine: ${STATE_MACHINE_ARN}"
echo "  Input: ${INPUT}"
echo ""

EXECUTION_ARN=$(aws stepfunctions start-execution \
  --region "${REGION}" \
  --state-machine-arn "${STATE_MACHINE_ARN}" \
  --name "${EXECUTION_NAME}" \
  --input "${INPUT}" \
  --query "executionArn" \
  --output text)

CONSOLE_URL="https://${REGION}.console.aws.amazon.com/states/home?region=${REGION}#/executions/details/${EXECUTION_ARN}"

echo "Execution started:"
echo "  ARN: ${EXECUTION_ARN}"
echo "  Console: ${CONSOLE_URL}"
echo ""

if [[ "${WAIT}" == "false" ]]; then
  echo "Running in background (--no-wait). Check the console link above for status."
  exit 0
fi

echo "Waiting for completion (Ctrl+C to detach without stopping the run)..."
echo ""

POLL_INTERVAL=15
ELAPSED=0

while true; do
  STATUS=$(aws stepfunctions describe-execution \
    --region "${REGION}" \
    --execution-arn "${EXECUTION_ARN}" \
    --query "status" \
    --output text)

  printf "\r  [%3ds] Status: %-12s" "${ELAPSED}" "${STATUS}"

  case "${STATUS}" in
    SUCCEEDED)
      echo ""
      echo ""
      echo "✓ Analysis complete."
      echo ""
      echo "  Console:  ${CONSOLE_URL}"
      echo ""

      BUCKET=$(aws s3api list-buckets \
        --query "Buckets[?contains(Name,'options-analysis') && contains(Name,'${STAGE}')].Name | [0]" \
        --output text)
      REPORT_KEY="reports/${DATE}/full-report.md"
      LOCAL_DIR="${REPORTS_DIR}/${DATE}"
      LOCAL_FILE="${LOCAL_DIR}/full-report.md"

      mkdir -p "${LOCAL_DIR}"
      if aws s3 cp "s3://${BUCKET}/${REPORT_KEY}" "${LOCAL_FILE}" --region "${REGION}" 2>/dev/null; then
        echo "  Report downloaded to: ${LOCAL_FILE}"
      else
        echo "  Could not download report — check S3 manually:"
        echo "    s3://${BUCKET}/${REPORT_KEY}"
      fi
      echo ""
      exit 0
      ;;
    FAILED|ABORTED|TIMED_OUT)
      echo ""
      echo ""
      echo "✗ Execution ended with status: ${STATUS}"
      echo ""
      ERROR=$(aws stepfunctions describe-execution \
        --region "${REGION}" \
        --execution-arn "${EXECUTION_ARN}" \
        --query "cause" \
        --output text 2>/dev/null || echo "(no cause available)")
      echo "  Cause: ${ERROR}"
      echo "  Console: ${CONSOLE_URL}"
      echo ""
      exit 1
      ;;
    RUNNING)
      sleep "${POLL_INTERVAL}"
      ELAPSED=$((ELAPSED + POLL_INTERVAL))
      ;;
    *)
      echo ""
      echo "Unexpected status: ${STATUS}"
      exit 1
      ;;
  esac
done
