#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${IAM_API_BASE_URL:-${SMOKE_API_BASE_URL:-http://127.0.0.1:3001/api/v1}}"
TENANT_ID="${IAM_TENANT_ID:-${SMOKE_TENANT_ID:-${DEFAULT_TENANT_ID:-GOIUUDAI}}}"
AUTH_ENABLED_RAW="${IAM_AUTH_ENABLED:-${SMOKE_AUTH_ENABLED:-${AUTH_ENABLED:-false}}}"
AUTH_ENABLED="$(echo "$AUTH_ENABLED_RAW" | tr '[:upper:]' '[:lower:]')"
AUTH_ROLE="${IAM_AUTH_ROLE:-ADMIN}"
AUTH_SUB="${IAM_AUTH_SUB:-iam_rollout_bot}"
AUTH_EMAIL="${IAM_AUTH_EMAIL:-iam-rollout@example.com}"
DEV_ROLE="${IAM_DEV_ROLE:-$AUTH_ROLE}"
DEV_USER_ID="${IAM_DEV_USER_ID:-$AUTH_SUB}"
DEV_EMAIL="${IAM_DEV_EMAIL:-$AUTH_EMAIL}"
IAM_BEARER_TOKEN="${IAM_BEARER_TOKEN:-${SMOKE_BEARER_TOKEN:-}}"
IAM_JWT_SECRET="${IAM_JWT_SECRET:-${SMOKE_JWT_SECRET:-${JWT_SECRET:-}}}"

PHASE2_MODULE_ORDER=("sales" "finance" "crm" "hr" "scm" "assets" "projects" "reports")

TMP_DIR="$(mktemp -d)"
LAST_STATUS=""
LAST_BODY_FILE=""
CURRENT_MODE=""
CURRENT_ENABLED=""
CURRENT_MODULES_CSV=""

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
IAM v2 rollout utility (Phase 2)

Usage:
  scripts/deploy/iam-v2-rollout.sh status
  scripts/deploy/iam-v2-rollout.sh shadow sales
  scripts/deploy/iam-v2-rollout.sh shadow sales,finance
  scripts/deploy/iam-v2-rollout.sh enforce sales,finance,crm
  scripts/deploy/iam-v2-rollout.sh rollback-shadow
  scripts/deploy/iam-v2-rollout.sh rollback-module sales
  scripts/deploy/iam-v2-rollout.sh off

Environment (optional):
  IAM_API_BASE_URL      default: http://127.0.0.1:3001/api/v1
  IAM_TENANT_ID         default: DEFAULT_TENANT_ID or GOIUUDAI
  IAM_AUTH_ENABLED      default: AUTH_ENABLED
  IAM_BEARER_TOKEN      optional pre-issued Bearer token
  IAM_JWT_SECRET        optional secret to auto-issue token when auth enabled
  IAM_AUTH_ROLE         default: ADMIN
  IAM_AUTH_SUB          default: iam_rollout_bot
  IAM_AUTH_EMAIL        default: iam-rollout@example.com
EOF
}

log() {
  echo "[iam-rollout] $*"
}

fail() {
  echo "[iam-rollout][FAIL] $*" >&2
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

prepare_auth_token() {
  if [ "$AUTH_ENABLED" != "true" ]; then
    log "AUTH_ENABLED=false, gọi API không cần token."
    return
  fi

  if [ -n "$IAM_BEARER_TOKEN" ]; then
    log "Dùng IAM_BEARER_TOKEN đã cấp sẵn."
    return
  fi

  if [ -z "$IAM_JWT_SECRET" ]; then
    fail "AUTH_ENABLED=true nhưng thiếu IAM_JWT_SECRET/JWT_SECRET để phát token."
  fi

  IAM_BEARER_TOKEN="$(make_jwt_token "$IAM_JWT_SECRET" "$AUTH_ROLE" "$AUTH_SUB" "$AUTH_EMAIL" "$TENANT_ID")"
  log "Đã phát token nội bộ cho role=$AUTH_ROLE tenant=$TENANT_ID."
}

http_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local auth_mode="${4:-auth}"

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

  if [ "$auth_mode" = "auth" ] && [ "$AUTH_ENABLED" = "true" ]; then
    if [ -z "$IAM_BEARER_TOKEN" ]; then
      fail "Thiếu token để gọi API auth: $method $path"
    fi
    curl_cmd+=(-H "Authorization: Bearer $IAM_BEARER_TOKEN")
  elif [ "$auth_mode" = "auth" ]; then
    # AUTH disabled mode still uses dev headers to resolve role in JwtAuthGuard.
    curl_cmd+=(
      -H "x-erp-dev-role: $DEV_ROLE"
      -H "x-erp-dev-user-id: $DEV_USER_ID"
      -H "x-erp-dev-email: $DEV_EMAIL"
    )
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
  echo "[iam-rollout] response body:"
  cat "$LAST_BODY_FILE" || true
  fail "HTTP status $LAST_STATUS không nằm trong tập cho phép: $allowed"
}

json_read_file() {
  local file="$1"
  local expression="$2"
  node -e '
const fs = require("node:fs");
const [file, expression] = process.argv.slice(1);
const raw = fs.readFileSync(file, "utf8");
if (!raw.trim()) process.exit(0);
let data;
try {
  data = JSON.parse(raw);
} catch {
  process.exit(0);
}
const parts = expression.split(".");
let current = data;
for (const part of parts) {
  if (!part) continue;
  if (current === null || current === undefined) {
    current = undefined;
    break;
  }
  if (/^\d+$/.test(part)) {
    current = current[Number(part)];
  } else {
    current = current[part];
  }
}
if (current === null || current === undefined) process.exit(0);
if (typeof current === "object") {
  process.stdout.write(JSON.stringify(current));
} else {
  process.stdout.write(String(current));
}
' "$file" "$expression"
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
      fail "Module '$trimmed' không thuộc rollout order Phase 2."
    fi

    if ! contains_value "$trimmed" "${requested[@]-}"; then
      requested+=("$trimmed")
    fi
  done

  if [ "${#requested[@]}" -eq 0 ]; then
    fail "Danh sách module rỗng. Hãy truyền tối thiểu 1 module."
  fi

  local ordered=()
  for item in "${PHASE2_MODULE_ORDER[@]}"; do
    if contains_value "$item" "${requested[@]-}"; then
      ordered+=("$item")
    fi
  done

  local output=""
  for item in "${ordered[@]}"; do
    if [ -z "$output" ]; then
      output="$item"
    else
      output="${output},${item}"
    fi
  done
  echo "$output"
}

csv_to_json_array() {
  local csv="$1"
  node -e '
const raw = process.argv[1] ?? "";
const values = raw.split(",").map((item) => item.trim()).filter(Boolean);
process.stdout.write(JSON.stringify(values));
' "$csv"
}

load_current_iam() {
  http_request GET "/settings/domains/access_security" "" auth
  assert_status_in "200"

  CURRENT_MODE="$(json_read_file "$LAST_BODY_FILE" "data.iamV2.mode")"
  CURRENT_ENABLED="$(json_read_file "$LAST_BODY_FILE" "data.iamV2.enabled")"
  CURRENT_MODULES_CSV="$(node -e '
const fs = require("node:fs");
const file = process.argv[1];
const raw = fs.readFileSync(file, "utf8");
let data = {};
try {
  data = JSON.parse(raw);
} catch {
  process.stdout.write("");
  process.exit(0);
}
const modules = Array.isArray(data?.data?.iamV2?.enforcementModules)
  ? data.data.iamV2.enforcementModules.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
  : [];
process.stdout.write(modules.join(","));
' "$LAST_BODY_FILE")"
}

print_current_status() {
  load_current_iam
  node -e '
const fs = require("node:fs");
const file = process.argv[1];
const raw = fs.readFileSync(file, "utf8");
let data = {};
try {
  data = JSON.parse(raw);
} catch {
  process.stdout.write("{}\n");
  process.exit(0);
}
const iam = data?.data?.iamV2 ?? {};
process.stdout.write(`${JSON.stringify(iam, null, 2)}\n`);
' "$LAST_BODY_FILE"
}

print_mismatch_summary() {
  local module_key="${1:-}"
  local path="/settings/permissions/iam-v2/mismatch-report?limit=20"
  if [ -n "$module_key" ]; then
    path="${path}&moduleKey=${module_key}"
  fi

  http_request GET "$path" "" auth
  assert_status_in "200"

  local total_mismatches
  total_mismatches="$(json_read_file "$LAST_BODY_FILE" "totalMismatches")"
  local total_groups
  total_groups="$(json_read_file "$LAST_BODY_FILE" "totalGroups")"
  log "Mismatch summary: totalMismatches=${total_mismatches:-0}, totalGroups=${total_groups:-0}"
}

apply_iam_update() {
  local mode="$1"
  local enabled="$2"
  local modules_csv="$3"
  local reason="$4"

  local modules_json
  modules_json="$(csv_to_json_array "$modules_csv")"
  local payload
  payload="$(node -e '
const [mode, enabledRaw, modulesRaw, reason] = process.argv.slice(1);
const enabled = enabledRaw === "true";
const modules = JSON.parse(modulesRaw);
process.stdout.write(JSON.stringify({
  reason,
  iamV2: {
    enabled,
    mode,
    enforcementModules: modules
  }
}));
' "$mode" "$enabled" "$modules_json" "$reason")"

  http_request PUT "/settings/domains/access_security" "$payload" auth
  assert_status_in "200"
}

remove_module_from_csv() {
  local csv="$1"
  local target="$2"
  local output=""
  local item
  IFS=',' read -r -a items <<< "$csv"
  for item in "${items[@]}"; do
    local trimmed
    trimmed="$(echo "$item" | xargs)"
    [ -n "$trimmed" ] || continue
    if [ "$trimmed" = "$target" ]; then
      continue
    fi
    if [ -z "$output" ]; then
      output="$trimmed"
    else
      output="${output},${trimmed}"
    fi
  done
  echo "$output"
}

main() {
  local action="${1:-status}"
  local modules_arg="${2:-}"

  if [ "$action" = "--help" ] || [ "$action" = "-h" ]; then
    usage
    exit 0
  fi

  prepare_auth_token

  case "$action" in
    status)
      log "Current iamV2 config:"
      print_current_status
      print_mismatch_summary
      ;;
    shadow|enforce)
      [ -n "$modules_arg" ] || fail "Thiếu module list. Ví dụ: shadow sales,finance"
      local normalized_modules
      normalized_modules="$(normalize_modules_csv "$modules_arg")"
      local next_mode
      next_mode="$(echo "$action" | tr '[:lower:]' '[:upper:]')"
      apply_iam_update "$next_mode" "true" "$normalized_modules" "Phase 2 IAM v2 rollout ${next_mode} modules=${normalized_modules}"
      log "Updated iamV2 config:"
      print_current_status
      print_mismatch_summary "$(echo "$normalized_modules" | cut -d',' -f1)"
      ;;
    rollback-shadow)
      load_current_iam
      apply_iam_update "SHADOW" "true" "$CURRENT_MODULES_CSV" "Rollback IAM v2 to SHADOW"
      log "Updated iamV2 config:"
      print_current_status
      print_mismatch_summary
      ;;
    rollback-module)
      [ -n "$modules_arg" ] || fail "Thiếu module cần rollback. Ví dụ: rollback-module sales"
      local target_module
      target_module="$(normalize_modules_csv "$modules_arg")"
      if echo "$target_module" | grep -q ','; then
        fail "rollback-module chỉ nhận đúng 1 module."
      fi

      load_current_iam
      if [ -z "$CURRENT_MODULES_CSV" ]; then
        fail "enforcementModules hiện đang rỗng (= all-modules). Hãy pin danh sách module cụ thể trước khi rollback từng module."
      fi

      local next_modules
      next_modules="$(remove_module_from_csv "$CURRENT_MODULES_CSV" "$target_module")"
      if [ "$next_modules" = "$CURRENT_MODULES_CSV" ]; then
        log "Module '$target_module' chưa nằm trong enforcementModules. Không có thay đổi."
        print_current_status
        exit 0
      fi

      local next_mode
      next_mode="${CURRENT_MODE:-SHADOW}"
      local next_enabled
      next_enabled="${CURRENT_ENABLED:-true}"
      apply_iam_update "$next_mode" "$next_enabled" "$next_modules" "Rollback module ${target_module} khỏi IAM v2 enforcement list"
      log "Updated iamV2 config:"
      print_current_status
      print_mismatch_summary
      ;;
    off)
      load_current_iam
      apply_iam_update "OFF" "false" "$CURRENT_MODULES_CSV" "Disable IAM v2 rollout"
      log "Updated iamV2 config:"
      print_current_status
      ;;
    *)
      usage
      fail "Action không hợp lệ: $action"
      ;;
  esac
}

main "$@"
