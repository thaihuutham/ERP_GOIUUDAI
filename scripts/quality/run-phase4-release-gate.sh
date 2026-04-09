#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

PHASE4_DB_PORT="${PHASE4_DB_PORT:-55432}"
PHASE4_SKIP_INFRA_CHECK_RAW="${PHASE4_SKIP_INFRA_CHECK:-false}"
PHASE4_SKIP_PRISMA_STATUS_RAW="${PHASE4_SKIP_PRISMA_STATUS:-false}"
PHASE4_SKIP_API_QUALITY_RAW="${PHASE4_SKIP_API_QUALITY:-false}"
PHASE4_SKIP_WEB_QUALITY_RAW="${PHASE4_SKIP_WEB_QUALITY:-false}"
PHASE4_SKIP_PHASE3_GATE_RAW="${PHASE4_SKIP_PHASE3_GATE:-false}"
PHASE4_SKIP_PROD_SMOKE_RAW="${PHASE4_SKIP_PROD_SMOKE:-false}"
PHASE4_SKIP_API_TARGETED_TESTS_RAW="${PHASE4_SKIP_API_TARGETED_TESTS:-false}"
PHASE4_API_TEST_TARGETS="${PHASE4_API_TEST_TARGETS:-test/payment-callback-rate-limit.guard.test.ts test/sales-checkout.service.test.ts}"

PHASE4_SKIP_INFRA_CHECK="$(echo "$PHASE4_SKIP_INFRA_CHECK_RAW" | tr '[:upper:]' '[:lower:]')"
PHASE4_SKIP_PRISMA_STATUS="$(echo "$PHASE4_SKIP_PRISMA_STATUS_RAW" | tr '[:upper:]' '[:lower:]')"
PHASE4_SKIP_API_QUALITY="$(echo "$PHASE4_SKIP_API_QUALITY_RAW" | tr '[:upper:]' '[:lower:]')"
PHASE4_SKIP_WEB_QUALITY="$(echo "$PHASE4_SKIP_WEB_QUALITY_RAW" | tr '[:upper:]' '[:lower:]')"
PHASE4_SKIP_PHASE3_GATE="$(echo "$PHASE4_SKIP_PHASE3_GATE_RAW" | tr '[:upper:]' '[:lower:]')"
PHASE4_SKIP_PROD_SMOKE="$(echo "$PHASE4_SKIP_PROD_SMOKE_RAW" | tr '[:upper:]' '[:lower:]')"
PHASE4_SKIP_API_TARGETED_TESTS="$(echo "$PHASE4_SKIP_API_TARGETED_TESTS_RAW" | tr '[:upper:]' '[:lower:]')"

log() {
  echo "[phase4-release-gate] $*"
}

load_local_env_if_present() {
  if [ -f ".env" ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
    log "Loaded local env from .env"
  fi
}

run_infra_checks() {
  if [ "$PHASE4_SKIP_INFRA_CHECK" = "true" ]; then
    log "Skip infra checks (PHASE4_SKIP_INFRA_CHECK=true)."
    return
  fi

  log "Check docker postgres container status."
  docker ps --format '{{.Names}}' | grep -q '^erp-postgres$'

  log "Check DB port listening on localhost:${PHASE4_DB_PORT}."
  lsof -nP -iTCP:"$PHASE4_DB_PORT" -sTCP:LISTEN >/dev/null
}

run_prisma_status() {
  if [ "$PHASE4_SKIP_PRISMA_STATUS" = "true" ]; then
    log "Skip prisma migrate status (PHASE4_SKIP_PRISMA_STATUS=true)."
    return
  fi

  log "Run prisma migrate status."
  npm run prisma:migrate:status --workspace @erp/api
}

run_api_quality() {
  if [ "$PHASE4_SKIP_API_QUALITY" = "true" ]; then
    log "Skip API quality checks (PHASE4_SKIP_API_QUALITY=true)."
    return
  fi

  log "Run API lint/build."
  npm run lint --workspace @erp/api
  npm run build --workspace @erp/api

  if [ "$PHASE4_SKIP_API_TARGETED_TESTS" = "true" ]; then
    log "Skip targeted API tests (PHASE4_SKIP_API_TARGETED_TESTS=true)."
    return
  fi

  log "Run targeted API tests: $PHASE4_API_TEST_TARGETS"
  # shellcheck disable=SC2086
  npm run test --workspace @erp/api -- $PHASE4_API_TEST_TARGETS
}

run_web_quality() {
  if [ "$PHASE4_SKIP_WEB_QUALITY" = "true" ]; then
    log "Skip Web quality checks (PHASE4_SKIP_WEB_QUALITY=true)."
    return
  fi

  log "Run Web lint/build."
  npm run lint --workspace @erp/web
  # Force production mode for deterministic Next.js build behavior even when local .env sets NODE_ENV=development.
  NODE_ENV=production npm run build --workspace @erp/web
}

run_phase3_gate() {
  if [ "$PHASE4_SKIP_PHASE3_GATE" = "true" ]; then
    log "Skip Phase 3 stabilization gate (PHASE4_SKIP_PHASE3_GATE=true)."
    return
  fi

  log "Run Phase 3 stabilization gate as release precondition."
  scripts/quality/run-phase3-stabilization.sh
}

run_prod_smoke() {
  if [ "$PHASE4_SKIP_PROD_SMOKE" = "true" ]; then
    log "Skip production-readiness smoke (PHASE4_SKIP_PROD_SMOKE=true)."
    return
  fi

  log "Run production-readiness smoke."
  scripts/deploy/smoke-production-readiness.sh
}

main() {
  log "Start Phase 4 release gate."
  load_local_env_if_present
  run_infra_checks
  run_prisma_status
  run_api_quality
  run_web_quality
  run_phase3_gate
  run_prod_smoke
  log "PASS Phase 4 release gate."
}

main "$@"
