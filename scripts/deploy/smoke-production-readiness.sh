#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${SMOKE_API_BASE_URL:-http://127.0.0.1:3001/api/v1}"
WEB_BASE_URL="${SMOKE_WEB_BASE_URL:-http://127.0.0.1:3000}"
TENANT_ID="${SMOKE_TENANT_ID:-${DEFAULT_TENANT_ID:-GOIUUDAI}}"
SMOKE_BEARER_TOKEN="${SMOKE_BEARER_TOKEN:-}"
SMOKE_JWT_SECRET="${SMOKE_JWT_SECRET:-${JWT_SECRET:-}}"
SMOKE_ENV_FILES="${SMOKE_ENV_FILES:-config/.env:.env}"
SMOKE_AUTH_ROLE_ADMIN="${SMOKE_AUTH_ROLE_ADMIN:-ADMIN}"
SMOKE_AUTH_ROLE_MANAGER="${SMOKE_AUTH_ROLE_MANAGER:-MANAGER}"
SMOKE_AUTH_ROLE_STAFF="${SMOKE_AUTH_ROLE_STAFF:-STAFF}"
SMOKE_AUTH_SUB_PREFIX="${SMOKE_AUTH_SUB_PREFIX:-phase4_smoke}"
SMOKE_PAYMENT_CALLBACK_PATH="${SMOKE_PAYMENT_CALLBACK_PATH:-/integrations/payments/bank-events}"
SMOKE_PAYMENT_CALLBACK_PAYLOAD="${SMOKE_PAYMENT_CALLBACK_PAYLOAD:-}"
SMOKE_PAYMENT_CALLBACK_SIGNATURE="${SMOKE_PAYMENT_CALLBACK_SIGNATURE:-}"
SMOKE_PAYMENT_CALLBACK_TIMESTAMP="${SMOKE_PAYMENT_CALLBACK_TIMESTAMP:-}"
SMOKE_PAYMENT_CALLBACK_IDEMPOTENCY_KEY="${SMOKE_PAYMENT_CALLBACK_IDEMPOTENCY_KEY:-phase4-smoke-$(date +%s)}"
SMOKE_PAYMENT_CALLBACK_EXPECTED_STATUS="${SMOKE_PAYMENT_CALLBACK_EXPECTED_STATUS:-200 201 202}"
SMOKE_PAYMENT_CALLBACK_REJECT_STATUS="${SMOKE_PAYMENT_CALLBACK_REJECT_STATUS:-400 401 403}"
SMOKE_PAYMENT_CALLBACK_REQUIRED_RAW="${SMOKE_PAYMENT_CALLBACK_REQUIRED:-false}"
SMOKE_PAYMENT_CALLBACK_REQUIRED="$(echo "$SMOKE_PAYMENT_CALLBACK_REQUIRED_RAW" | tr '[:upper:]' '[:lower:]')"

TMP_DIR="$(mktemp -d)"
LAST_STATUS=""
LAST_BODY_FILE=""
SMOKE_RUNTIME_AUTH_MODE="public"
SMOKE_BEARER_TOKEN_SOURCE="none"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  echo "[phase4-prod-smoke] $*"
}

fail() {
  echo "[phase4-prod-smoke][FAIL] $*" >&2
  exit 1
}

handle_missing_callback_route() {
  local callback_path="$1"
  if [ "$SMOKE_PAYMENT_CALLBACK_REQUIRED" = "true" ]; then
    echo "[phase4-prod-smoke] response body:"
    cat "$LAST_BODY_FILE" || true
    fail "Payment callback route không tồn tại (HTTP 404): $callback_path"
  fi
  log "Payment callback route chưa sẵn sàng (HTTP 404): $callback_path. Skip check (SMOKE_PAYMENT_CALLBACK_REQUIRED=false)."
}

load_jwt_secret_from_env_files() {
  if [ -n "$SMOKE_JWT_SECRET" ]; then
    return
  fi

  local candidates=()
  IFS=':' read -r -a candidates <<< "$SMOKE_ENV_FILES"

  local file_path
  for file_path in "${candidates[@]}"; do
    [ -f "$file_path" ] || continue

    local raw_line
    raw_line="$(grep -E '^[[:space:]]*JWT_SECRET=' "$file_path" | tail -n 1 || true)"
    [ -n "$raw_line" ] || continue

    local parsed
    parsed="$(printf '%s' "$raw_line" | sed -E "s/^[^=]+=//; s/^[[:space:]]+//; s/[[:space:]]+$//; s/^['\"]//; s/['\"]$//")"
    [ -n "$parsed" ] || continue

    SMOKE_JWT_SECRET="$parsed"
    log "Đã nạp JWT secret từ file env local: $file_path"
    return
  done
}

make_jwt_token() {
  local secret="$1"
  local role="$2"
  local sub="$3"
  local email="$4"
  local tenant="$5"
  node -e '
const crypto = require("node:crypto");
const [secret, role, sub, email, tenant] = process.argv.slice(1);
const header = { alg: "HS256", typ: "JWT" };
const now = Math.floor(Date.now() / 1000);
const payload = {
  sub,
  userId: sub,
  email,
  role,
  tenantId: tenant,
  iat: now,
  exp: now + 3600
};
const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const unsignedToken = `${encode(header)}.${encode(payload)}`;
const signature = crypto.createHmac("sha256", secret).update(unsignedToken).digest("base64url");
process.stdout.write(`${unsignedToken}.${signature}`);
' "$secret" "$role" "$sub" "$email" "$tenant"
}

build_role_token() {
  local role="$1"
  load_jwt_secret_from_env_files
  if [ -z "$SMOKE_JWT_SECRET" ]; then
    fail "Thiếu JWT secret để phát token role=$role"
  fi

  local normalized_role
  normalized_role="$(echo "$role" | tr '[:lower:]' '[:upper:]')"
  local normalized_role_lower
  normalized_role_lower="$(echo "$normalized_role" | tr '[:upper:]' '[:lower:]')"
  local sub="${SMOKE_AUTH_SUB_PREFIX}_${normalized_role_lower}"
  local email="${normalized_role_lower}@local.erp"
  make_jwt_token "$SMOKE_JWT_SECRET" "$normalized_role" "$sub" "$email" "$TENANT_ID"
}

ensure_admin_token() {
  local force_refresh="${1:-false}"

  if [ "$force_refresh" != "true" ] && [ -n "$SMOKE_BEARER_TOKEN" ]; then
    SMOKE_BEARER_TOKEN_SOURCE="provided"
    return
  fi

  SMOKE_BEARER_TOKEN="$(build_role_token "$SMOKE_AUTH_ROLE_ADMIN")"
  SMOKE_BEARER_TOKEN_SOURCE="generated"
  log "Đã phát token smoke role=$SMOKE_AUTH_ROLE_ADMIN tenant=$TENANT_ID."
}

status_in() {
  local allowed="$1"
  case " $allowed " in
    *" $LAST_STATUS "*) return 0 ;;
  esac
  return 1
}

assert_status_in() {
  local allowed="$1"
  if status_in "$allowed"; then
    return
  fi
  echo "[phase4-prod-smoke] response body:"
  cat "$LAST_BODY_FILE" || true
  fail "HTTP status $LAST_STATUS không nằm trong tập cho phép: $allowed"
}

api_request_basic() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local auth_mode="${4:-public}"
  local token_override="${5:-}"

  local url="${API_BASE_URL}${path}"
  local body_file="$TMP_DIR/response_$(date +%s%N).json"
  local -a curl_cmd=(
    curl
    -sS
    -X "$method"
    "$url"
    -H "Content-Type: application/json"
    -H "x-tenant-id: $TENANT_ID"
    -o "$body_file"
    -w "%{http_code}"
  )

  if [ "$auth_mode" = "auth" ]; then
    local token="$token_override"
    if [ -z "$token" ]; then
      token="$SMOKE_BEARER_TOKEN"
    fi
    if [ -z "$token" ]; then
      fail "Thiếu token cho request auth: $method $path"
    fi
    curl_cmd+=( -H "Authorization: Bearer $token" )
  fi

  if [ -n "$body" ]; then
    curl_cmd+=( -d "$body" )
  fi

  LAST_STATUS="$("${curl_cmd[@]}")"
  LAST_BODY_FILE="$body_file"
}

web_request() {
  local body_file="$TMP_DIR/web_$(date +%s%N).html"
  LAST_STATUS="$(curl -sS "$WEB_BASE_URL" -o "$body_file" -w "%{http_code}")"
  LAST_BODY_FILE="$body_file"
}

run_health_checks() {
  log "Kiểm tra health API/Web."
  api_request_basic GET "/health" "" public
  assert_status_in "200"

  web_request
  assert_status_in "200"
}

detect_auth_mode() {
  log "Detect auth boundary qua GET /settings/center (public)."
  api_request_basic GET "/settings/center" "" public

  if status_in "200"; then
    SMOKE_RUNTIME_AUTH_MODE="public"
    log "Auth mode: public (settings/center HTTP 200)."
    return
  fi

  if status_in "401 403"; then
    SMOKE_RUNTIME_AUTH_MODE="auth"
    log "Auth mode: enforced (settings/center HTTP $LAST_STATUS)."
    ensure_admin_token
    api_request_basic GET "/settings/center" "" auth

    if ! status_in "200"; then
      # Fallback: token được cung cấp sẵn có thể đã hết hạn/sai tenant.
      if [ "$SMOKE_BEARER_TOKEN_SOURCE" = "provided" ]; then
        log "Token cung cấp sẵn không hợp lệ (HTTP $LAST_STATUS), thử phát token admin mới và retry 1 lần."
        ensure_admin_token true
        api_request_basic GET "/settings/center" "" auth
      fi
    fi

    assert_status_in "200"
    return
  fi

  echo "[phase4-prod-smoke] response body:"
  cat "$LAST_BODY_FILE" || true
  fail "settings/center trả về HTTP $LAST_STATUS, không thuộc expected boundary (200|401|403)."
}

run_permission_boundary_checks() {
  if [ "$SMOKE_RUNTIME_AUTH_MODE" != "auth" ]; then
    log "Permission boundary: skip chi tiết role vì runtime auth đang public."
    return
  fi

  log "Permission boundary: admin phải qua được authz ở endpoint admin-only (/settings)."
  api_request_basic GET "/settings" "" auth
  assert_status_in "200 400"

  if [ -z "$SMOKE_JWT_SECRET" ]; then
    load_jwt_secret_from_env_files
  fi

  if [ -z "$SMOKE_JWT_SECRET" ]; then
    log "Permission boundary role check: skip vì không có JWT secret để phát token MANAGER/STAFF."
    return
  fi

  local manager_token
  manager_token="$(build_role_token "$SMOKE_AUTH_ROLE_MANAGER")"
  local staff_token
  staff_token="$(build_role_token "$SMOKE_AUTH_ROLE_STAFF")"

  log "Permission boundary: MANAGER phải bị chặn endpoint admin-only (/settings)."
  api_request_basic GET "/settings" "" auth "$manager_token"
  assert_status_in "403"

  log "Permission boundary: STAFF phải bị chặn endpoint admin-only (/settings)."
  api_request_basic GET "/settings" "" auth "$staff_token"
  assert_status_in "403"
}

run_payment_callback_checks() {
  local callback_path="$SMOKE_PAYMENT_CALLBACK_PATH"
  local callback_url="${API_BASE_URL}${callback_path}"
  local body_file="$TMP_DIR/payment_callback_$(date +%s%N).json"

  if [ -n "$SMOKE_PAYMENT_CALLBACK_PAYLOAD" ] && [ -n "$SMOKE_PAYMENT_CALLBACK_SIGNATURE" ] && [ -n "$SMOKE_PAYMENT_CALLBACK_TIMESTAMP" ]; then
    log "Payment callback flow: chạy success check với payload/signature cung cấp sẵn."
    LAST_STATUS="$(curl -sS -X POST "$callback_url" \
      -H "Content-Type: application/json" \
      -H "x-tenant-id: $TENANT_ID" \
      -H "x-signature: $SMOKE_PAYMENT_CALLBACK_SIGNATURE" \
      -H "x-timestamp: $SMOKE_PAYMENT_CALLBACK_TIMESTAMP" \
      -H "x-idempotency-key: $SMOKE_PAYMENT_CALLBACK_IDEMPOTENCY_KEY" \
      -d "$SMOKE_PAYMENT_CALLBACK_PAYLOAD" \
      -o "$body_file" \
      -w "%{http_code}")"
    LAST_BODY_FILE="$body_file"

    if status_in "404"; then
      handle_missing_callback_route "$callback_path"
      return
    fi

    assert_status_in "$SMOKE_PAYMENT_CALLBACK_EXPECTED_STATUS"
    return
  fi

  log "Payment callback flow: kiểm tra boundary với signature invalid (expected reject)."
  local fallback_payload
  fallback_payload='{"intentCode":"phase4-smoke-intent","transactionRef":"phase4-smoke-ref","amount":1000,"currency":"VND","status":"SUCCESS","paidAt":"2026-01-01T00:00:00.000Z"}'

  LAST_STATUS="$(curl -sS -X POST "$callback_url" \
    -H "Content-Type: application/json" \
    -H "x-tenant-id: $TENANT_ID" \
    -H "x-signature: invalid-signature" \
    -H "x-timestamp: $(date +%s)" \
    -H "x-idempotency-key: $SMOKE_PAYMENT_CALLBACK_IDEMPOTENCY_KEY" \
    -d "$fallback_payload" \
    -o "$body_file" \
    -w "%{http_code}")"
  LAST_BODY_FILE="$body_file"

  if status_in "404"; then
    handle_missing_callback_route "$callback_path"
    return
  fi

  assert_status_in "$SMOKE_PAYMENT_CALLBACK_REJECT_STATUS"
}

main() {
  log "Start Phase 4 production readiness smoke."
  run_health_checks
  detect_auth_mode
  run_permission_boundary_checks
  run_payment_callback_checks
  log "PASS Phase 4 production readiness smoke."
}

main "$@"
