#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${SMOKE_API_BASE_URL:-http://127.0.0.1:3001/api/v1}"
TENANT_ID="${SMOKE_TENANT_ID:-${DEFAULT_TENANT_ID:-GOIUUDAI}}"
AUTH_ENABLED_RAW="${SMOKE_AUTH_ENABLED:-${AUTH_ENABLED:-false}}"
AUTH_ENABLED="$(echo "$AUTH_ENABLED_RAW" | tr '[:upper:]' '[:lower:]')"
AUTH_ROLE="${SMOKE_AUTH_ROLE:-ADMIN}"
AUTH_SUB="${SMOKE_AUTH_SUB:-auth_rbac_smoke_bot}"
AUTH_EMAIL="${SMOKE_AUTH_EMAIL:-auth-rbac-smoke@example.com}"
SMOKE_BEARER_TOKEN="${SMOKE_BEARER_TOKEN:-}"
SMOKE_JWT_SECRET="${SMOKE_JWT_SECRET:-${JWT_SECRET:-}}"
SMOKE_ENFORCED_MODULES="${SMOKE_ENFORCED_MODULES:-sales,finance,crm,hr,scm,assets,projects,reports}"
SMOKE_REQUIRE_AUTH="$AUTH_ENABLED"

PHASE2_MODULE_ORDER=("sales" "finance" "crm" "hr" "scm" "assets" "projects" "reports")

TMP_DIR="$(mktemp -d)"
LAST_STATUS=""
LAST_BODY_FILE=""

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  echo "[auth-rbac-smoke] $*"
}

fail() {
  echo "[auth-rbac-smoke][FAIL] $*" >&2
  exit 1
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

load_jwt_secret_from_env_files() {
  if [ -n "$SMOKE_JWT_SECRET" ]; then
    return
  fi

  local candidates=()
  local extra_files="${SMOKE_ENV_FILES:-}"
  if [ -n "$extra_files" ]; then
    IFS=':' read -r -a candidates <<< "$extra_files"
  else
    candidates=("config/.env" ".env")
  fi

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

ensure_auth_token() {
  if [ -n "$SMOKE_BEARER_TOKEN" ]; then
    return
  fi

  load_jwt_secret_from_env_files

  if [ -z "$SMOKE_JWT_SECRET" ]; then
    fail "Thiếu SMOKE_JWT_SECRET/JWT_SECRET để chạy smoke ở chế độ auth."
  fi

  SMOKE_BEARER_TOKEN="$(make_jwt_token "$SMOKE_JWT_SECRET" "$AUTH_ROLE" "$AUTH_SUB" "$AUTH_EMAIL" "$TENANT_ID")"
  log "Đã phát token smoke role=$AUTH_ROLE tenant=$TENANT_ID."
}

prepare_auth_token() {
  if [ "$AUTH_ENABLED" != "true" ]; then
    log "AUTH_ENABLED=false, smoke chạy ở chế độ public."
    return
  fi

  if [ -n "$SMOKE_BEARER_TOKEN" ]; then
    log "Sử dụng SMOKE_BEARER_TOKEN đã cấp."
    return
  fi

  ensure_auth_token
}

http_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local auth_mode="${4:-auth}"

  local url="$API_BASE_URL$path"
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
    if [ -z "$SMOKE_BEARER_TOKEN" ]; then
      fail "Thiếu token để gọi endpoint auth: $method $path"
    fi
    curl_cmd+=(-H "Authorization: Bearer $SMOKE_BEARER_TOKEN")
  fi

  if [ -n "$body" ]; then
    curl_cmd+=(-d "$body")
  fi

  LAST_STATUS="$("${curl_cmd[@]}")"
  LAST_BODY_FILE="$body_file"
}

assert_status_in() {
  local allowed="$1"
  case " $allowed " in
    *" $LAST_STATUS "*) return 0 ;;
  esac
  echo "[auth-rbac-smoke] response body:"
  cat "$LAST_BODY_FILE" || true
  fail "HTTP status $LAST_STATUS không nằm trong tập cho phép: $allowed"
}

status_in() {
  local allowed="$1"
  case " $allowed " in
    *" $LAST_STATUS "*) return 0 ;;
  esac
  return 1
}

contains_value() {
  local needle="$1"
  shift
  local value
  for value in "$@"; do
    if [ "$value" = "$needle" ]; then
      return 0
    fi
  done
  return 1
}

normalize_modules_csv() {
  local raw_csv="$1"
  local lowered
  lowered="$(echo "$raw_csv" | tr '[:upper:]' '[:lower:]' | tr ';' ',')"
  IFS=',' read -r -a raw_items <<< "$lowered"

  local requested=()
  local item
  for item in "${raw_items[@]}"; do
    local trimmed
    trimmed="$(echo "$item" | xargs)"
    [ -n "$trimmed" ] || continue

    if ! contains_value "$trimmed" "${PHASE2_MODULE_ORDER[@]}"; then
      fail "Module '$trimmed' không thuộc baseline smoke Phase 2."
    fi

    if ! contains_value "$trimmed" "${requested[@]-}"; then
      requested+=("$trimmed")
    fi
  done

  if [ "${#requested[@]}" -eq 0 ]; then
    fail "SMOKE_ENFORCED_MODULES rỗng."
  fi

  local output=""
  for item in "${PHASE2_MODULE_ORDER[@]}"; do
    if contains_value "$item" "${requested[@]-}"; then
      if [ -z "$output" ]; then
        output="$item"
      else
        output="${output},${item}"
      fi
    fi
  done
  echo "$output"
}

module_probe_path() {
  local module_key="$1"
  case "$module_key" in
    sales) echo "/sales/orders?take=1" ;;
    finance) echo "/finance/invoices?take=1" ;;
    crm) echo "/crm/customers?take=1" ;;
    hr) echo "/hr/employees?take=1" ;;
    scm) echo "/scm/vendors?take=1" ;;
    assets) echo "/assets?take=1" ;;
    projects) echo "/projects?take=1" ;;
    reports) echo "/reports/overview" ;;
    *)
      fail "Chưa định nghĩa probe path cho module '$module_key'."
      ;;
  esac
}

run_health_checks() {
  log "Kiểm tra health endpoint."
  http_request GET "/health" "" public
  assert_status_in "200"
}

run_auth_boundary_checks() {
  log "Kiểm tra auth boundary thực tế từ endpoint settings/center (public request)."
  http_request GET "/settings/center" "" public

  if status_in "200"; then
    SMOKE_REQUIRE_AUTH="false"
    log "settings/center truy cập public (HTTP 200)."
    return
  fi

  if status_in "401 403"; then
    SMOKE_REQUIRE_AUTH="true"
    log "settings/center yêu cầu auth (HTTP $LAST_STATUS). Chuyển sang smoke auth mode."
    ensure_auth_token
    http_request GET "/settings/center" "" auth
    assert_status_in "200"
    return
  fi

  echo "[auth-rbac-smoke] response body:"
  cat "$LAST_BODY_FILE" || true
  fail "settings/center trả về HTTP $LAST_STATUS, không thuộc expected boundary (200 | 401 | 403)."
}

run_mismatch_probe() {
  log "Kiểm tra IAM mismatch report endpoint."
  if [ "$SMOKE_REQUIRE_AUTH" = "true" ]; then
    http_request GET "/settings/permissions/iam-v2/mismatch-report?limit=20" "" auth
  else
    http_request GET "/settings/permissions/iam-v2/mismatch-report?limit=20" "" public
  fi
  assert_status_in "200"
}

run_module_probes() {
  local modules_csv="$1"
  IFS=',' read -r -a modules <<< "$modules_csv"
  local module_key
  for module_key in "${modules[@]}"; do
    local probe_path
    probe_path="$(module_probe_path "$module_key")"
    log "Probe module '$module_key' via GET $probe_path"
    if [ "$SMOKE_REQUIRE_AUTH" = "true" ]; then
      http_request GET "$probe_path" "" auth
    else
      http_request GET "$probe_path" "" public
    fi
    assert_status_in "200"
  done
}

main() {
  local normalized_modules
  normalized_modules="$(normalize_modules_csv "$SMOKE_ENFORCED_MODULES")"

  log "Bắt đầu smoke auth/rbac modules: $normalized_modules"
  prepare_auth_token
  run_health_checks
  run_auth_boundary_checks
  run_mismatch_probe
  run_module_probes "$normalized_modules"
  log "PASS auth/rbac smoke."
}

main "$@"
