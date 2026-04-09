#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "$REPO_ROOT"

PHASE3_SKIP_FORM_GUARD_RAW="${PHASE3_SKIP_FORM_GUARD:-false}"
PHASE3_SKIP_API_SMOKE_RAW="${PHASE3_SKIP_API_SMOKE:-false}"
PHASE3_SKIP_E2E_RAW="${PHASE3_SKIP_E2E:-false}"
PHASE3_SKIP_FORM_GUARD="$(echo "$PHASE3_SKIP_FORM_GUARD_RAW" | tr '[:upper:]' '[:lower:]')"
PHASE3_SKIP_API_SMOKE="$(echo "$PHASE3_SKIP_API_SMOKE_RAW" | tr '[:upper:]' '[:lower:]')"
PHASE3_SKIP_E2E="$(echo "$PHASE3_SKIP_E2E_RAW" | tr '[:upper:]' '[:lower:]')"

PHASE3_SMOKE_MODULES="${PHASE3_SMOKE_MODULES:-sales,finance,crm,hr,scm,assets,projects,reports}"
PHASE3_PLAYWRIGHT_PORT="${PLAYWRIGHT_PORT:-4310}"
PHASE3_E2E_WORKERS="${PHASE3_E2E_WORKERS:-1}"
PHASE3_REMOTE_IDLE_TIMEOUT_MS="${NEXT_PUBLIC_REMOTE_IDLE_TIMEOUT_MS:-1000}"
PHASE3_E2E_SPECS_DEFAULT="apps/web/e2e/tests/crm-sales-finance-core-flow.spec.ts apps/web/e2e/tests/hr-attendance-board.spec.ts apps/web/e2e/tests/hr-regulation-board.spec.ts apps/web/e2e/tests/scm-operations-board.spec.ts apps/web/e2e/tests/workflows-module.spec.ts apps/web/e2e/tests/dashboard-reports-availability.spec.ts apps/web/e2e/tests/audit-module.spec.ts apps/web/e2e/tests/settings-center-reports.spec.ts"
PHASE3_E2E_SPECS="${PHASE3_E2E_SPECS:-$PHASE3_E2E_SPECS_DEFAULT}"

log() {
  echo "[phase3-stabilization] $*"
}

run_form_guard() {
  if [ "$PHASE3_SKIP_FORM_GUARD" = "true" ]; then
    log "Skip form guard (PHASE3_SKIP_FORM_GUARD=true)."
    return
  fi

  log "Run Phase 3 form guard checks."
  scripts/quality/check-phase3-form-guards.sh
}

run_api_smoke() {
  if [ "$PHASE3_SKIP_API_SMOKE" = "true" ]; then
    log "Skip API smoke (PHASE3_SKIP_API_SMOKE=true)."
    return
  fi

  log "Run auth/rbac smoke with modules=$PHASE3_SMOKE_MODULES"
  SMOKE_ENFORCED_MODULES="$PHASE3_SMOKE_MODULES" scripts/deploy/smoke-auth-rbac-modules.sh
}

run_e2e_regression() {
  if [ "$PHASE3_SKIP_E2E" = "true" ]; then
    log "Skip web e2e regression (PHASE3_SKIP_E2E=true)."
    return
  fi

  log "Run web e2e regression Phase 3 (workers=$PHASE3_E2E_WORKERS, port=$PHASE3_PLAYWRIGHT_PORT)."
  # shellcheck disable=SC2086
  CI=1 \
  PLAYWRIGHT_PORT="$PHASE3_PLAYWRIGHT_PORT" \
  NEXT_PUBLIC_REMOTE_IDLE_TIMEOUT_MS="$PHASE3_REMOTE_IDLE_TIMEOUT_MS" \
  npx playwright test $PHASE3_E2E_SPECS \
    --workers="$PHASE3_E2E_WORKERS" \
    --config=apps/web/e2e/playwright.config.ts \
    --reporter=line
}

main() {
  log "Start Phase 3 stabilization gate."
  run_form_guard
  run_api_smoke
  run_e2e_regression
  log "PASS Phase 3 stabilization gate."
}

main "$@"
