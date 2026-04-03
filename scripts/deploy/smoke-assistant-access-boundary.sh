#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${SMOKE_API_BASE_URL:-http://127.0.0.1:3001/api/v1}"
TENANT_ID="${SMOKE_TENANT_ID:-${DEFAULT_TENANT_ID:-GOIUUDAI}}"
AUTH_ENABLED_RAW="${SMOKE_AUTH_ENABLED:-${AUTH_ENABLED:-false}}"
AUTH_ENABLED="$(echo "$AUTH_ENABLED_RAW" | tr '[:upper:]' '[:lower:]')"
AUTH_ROLE="${SMOKE_AUTH_ROLE:-ADMIN}"
AUTH_SUB="${SMOKE_AUTH_SUB:-assistant_smoke_bot}"
AUTH_EMAIL="${SMOKE_AUTH_EMAIL:-assistant-smoke@example.com}"
SMOKE_BEARER_TOKEN="${SMOKE_BEARER_TOKEN:-}"
SMOKE_JWT_SECRET="${SMOKE_JWT_SECRET:-${JWT_SECRET:-}}"

TMP_DIR="$(mktemp -d)"
LAST_STATUS=""
LAST_BODY_FILE=""

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  echo "[assistant-smoke] $*"
}

fail() {
  echo "[assistant-smoke][FAIL] $*" >&2
  exit 1
}

json_read_stdin() {
  local expression="$1"
  node -e '
const fs = require("node:fs");
const expr = process.argv[1];
const raw = fs.readFileSync(0, "utf8");
if (!raw.trim()) process.exit(0);
let data;
try {
  data = JSON.parse(raw);
} catch {
  process.exit(0);
}
const parts = expr.split(".");
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
' "$expression"
}

read_field() {
  local file="$1"
  local expression="$2"
  json_read_stdin "$expression" <"$file"
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

  if [ -n "$SMOKE_BEARER_TOKEN" ]; then
    log "Sử dụng SMOKE_BEARER_TOKEN có sẵn."
    return
  fi

  if [ -z "$SMOKE_JWT_SECRET" ]; then
    fail "Thiếu SMOKE_JWT_SECRET/JWT_SECRET để phát token smoke."
  fi

  SMOKE_BEARER_TOKEN="$(make_jwt_token "$SMOKE_JWT_SECRET" "$AUTH_ROLE" "$AUTH_SUB" "$AUTH_EMAIL" "$TENANT_ID")"
  log "Đã phát token smoke role=$AUTH_ROLE tenant=$TENANT_ID."
}

http_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

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

  if [ "$AUTH_ENABLED" = "true" ] && [ -n "$SMOKE_BEARER_TOKEN" ]; then
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
  echo "[assistant-smoke] response body:"
  cat "$LAST_BODY_FILE" || true
  fail "HTTP status $LAST_STATUS không nằm trong tập cho phép: $allowed"
}

extract_chat_artifact_field() {
  local file="$1"
  local field="$2"
  node -e '
const fs = require("node:fs");
const file = process.argv[1];
const field = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const artifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
const chatArtifact = artifacts.find((item) => item && item.artifactType === "CHAT");
if (!chatArtifact) process.exit(0);
if (field === "dispatchAttempts.length") {
  const attempts = Array.isArray(chatArtifact.dispatchAttempts) ? chatArtifact.dispatchAttempts.length : 0;
  process.stdout.write(String(attempts));
  process.exit(0);
}
const value = chatArtifact[field];
if (value === null || value === undefined) process.exit(0);
if (typeof value === "object") {
  process.stdout.write(JSON.stringify(value));
} else {
  process.stdout.write(String(value));
}
' "$file" "$field"
}

run_scope_mismatch_flow() {
  local nonce
  nonce="$(date +%s)"
  local channel_name="assistant-smoke-self-${nonce}"
  local run_id
  local chat_artifact_id
  local attempts_len
  local channel_id

  log "Kiểm tra quyền truy cập assistant."
  http_request GET "/assistant/access/me"
  if [ "$LAST_STATUS" != "200" ]; then
    echo "[assistant-smoke] response body:"
    cat "$LAST_BODY_FILE" || true
    fail "Không truy cập được /assistant/access/me. Hãy bật assistantAccessPolicy và quyền reports trước khi smoke."
  fi

  log "Tạo channel scope=self để ép mismatch với artifact scope rộng hơn."
  http_request POST "/assistant/channels" "$(cat <<JSON
{"name":"$channel_name","channelType":"WEBHOOK","endpointUrl":"http://127.0.0.1:9/assistant-smoke","scopeType":"self","scopeRefIds":["another_actor_${nonce}"],"allowedReportPacks":["sales"],"isActive":true}
JSON
)"
  assert_status_in "201"
  channel_id="$(read_field "$LAST_BODY_FILE" "id")"
  [ -n "$channel_id" ] || fail "Không lấy được channel id sau khi tạo channel."

  log "Tạo report run có chat artifact để kích hoạt dispatch."
  http_request POST "/assistant/reports/runs" '{"runType":"MANUAL","reportPacks":["sales"],"dispatchChat":true}'
  assert_status_in "201"
  run_id="$(read_field "$LAST_BODY_FILE" "runId")"
  chat_artifact_id="$(read_field "$LAST_BODY_FILE" "artifacts.chatArtifactId")"
  [ -n "$run_id" ] || fail "Không lấy được runId."
  [ -n "$chat_artifact_id" ] || fail "Không lấy được chatArtifactId."

  log "Đọc chi tiết run để xác nhận không dispatch khi mismatch scope."
  http_request GET "/assistant/reports/runs/$run_id"
  assert_status_in "200"

  attempts_len="$(extract_chat_artifact_field "$LAST_BODY_FILE" "dispatchAttempts.length")"
  channel_id="$(extract_chat_artifact_field "$LAST_BODY_FILE" "channelId")"
  attempts_len="${attempts_len:-0}"

  if [ "$attempts_len" != "0" ]; then
    echo "[assistant-smoke] response body:"
    cat "$LAST_BODY_FILE" || true
    fail "Expected dispatchAttempts=0 cho CHAT artifact khi scope mismatch, nhận=$attempts_len"
  fi

  if [ -n "$channel_id" ] && [ "$channel_id" != "null" ]; then
    echo "[assistant-smoke] response body:"
    cat "$LAST_BODY_FILE" || true
    fail "Expected channelId null/empty khi scope mismatch, nhận=$channel_id"
  fi

  log "PASS: scope mismatch được chặn đúng (không tạo dispatch attempt, không bind channel)."
}

main() {
  log "Bắt đầu assistant access-boundary smoke..."
  prepare_auth_token
  run_scope_mismatch_flow
  log "Hoàn tất assistant smoke."
}

main "$@"
