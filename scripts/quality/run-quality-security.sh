#!/usr/bin/env bash
set -euo pipefail

AUDIT_STRICT_RAW="${AUDIT_STRICT:-false}"
AUDIT_STRICT="$(echo "$AUDIT_STRICT_RAW" | tr '[:upper:]' '[:lower:]')"

log() {
  echo "[quality] $*"
}

warn() {
  echo "[quality][warn] $*" >&2
}

log "run lint"
npm run lint

log "run api tests"
npm run test --workspace @erp/api

log "run build"
NEXT_TELEMETRY_DISABLED=1 npm run build

log "run security audit (high severity, prod deps)"
if npm audit --audit-level=high --omit=dev; then
  log "audit passed"
else
  if [ "$AUDIT_STRICT" = "true" ]; then
    echo "[quality][fail] npm audit found high severity vulnerabilities (AUDIT_STRICT=true)." >&2
    exit 1
  fi
  warn "npm audit found high severity vulnerabilities (AUDIT_STRICT=false)."
fi

log "quality+security pipeline completed"
