#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[phase3-form-guard] $*"
}

fail() {
  echo "[phase3-form-guard][FAIL] $*" >&2
  exit 1
}

assert_no_matches() {
  local pattern="$1"
  shift
  local label="$1"
  shift
  local -a paths=("$@")

  local result
  result="$(rg -n "$pattern" "${paths[@]}" -S || true)"
  if [ -n "$result" ]; then
    echo "$result"
    fail "Detected anti-pattern: $label"
  fi
}

log "Check user-facing prompt() anti-pattern in UI."
assert_no_matches "window\\.prompt\\(" "window.prompt in user-facing flow" \
  apps/web/components \
  apps/web/app

log "Check json field-type anti-pattern in user-facing form schemas."
assert_no_matches "type:\\s*['\\\"]json['\\\"]" "field type json in form schemas" \
  apps/web/components \
  apps/web/lib \
  apps/api/src

log "PASS: no Phase 3 form-guard anti-pattern detected."
