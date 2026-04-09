#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${SMOKE_API_BASE_URL:-http://127.0.0.1:3001/api/v1}"
TENANT_ID="${SMOKE_TENANT_ID:-${DEFAULT_TENANT_ID:-GOIUUDAI}}"
AUTH_ENABLED_RAW="${SMOKE_AUTH_ENABLED:-${AUTH_ENABLED:-false}}"
AUTH_ENABLED="$(echo "$AUTH_ENABLED_RAW" | tr '[:upper:]' '[:lower:]')"
AUTH_ROLE="${SMOKE_AUTH_ROLE:-USER}"
AUTH_SUB="${SMOKE_AUTH_SUB:-smoke_bot}"
AUTH_EMAIL="${SMOKE_AUTH_EMAIL:-smoke-bot@example.com}"
SMOKE_BEARER_TOKEN="${SMOKE_BEARER_TOKEN:-}"
SMOKE_JWT_SECRET="${SMOKE_JWT_SECRET:-${JWT_SECRET:-}}"

SMOKE_WEBHOOK_SECRET="${SMOKE_WEBHOOK_SECRET:-${ZALO_OA_WEBHOOK_SECRET:-}}"
SMOKE_OA_ACCOUNT_ID="${SMOKE_OA_ACCOUNT_ID:-}"
SMOKE_OA_EXTERNAL_THREAD_ID="${SMOKE_OA_EXTERNAL_THREAD_ID:-smoke_oa_thread_$(date +%s)}"
SMOKE_OA_CONTENT="${SMOKE_OA_CONTENT:-[SMOKE] OA outbound verification message.}"
SMOKE_OA_OUTBOUND_URL="${SMOKE_OA_OUTBOUND_URL:-${ZALO_OA_OUTBOUND_URL:-}}"
SMOKE_OA_ACCESS_TOKEN="${SMOKE_OA_ACCESS_TOKEN:-${ZALO_OA_ACCESS_TOKEN:-}}"
SMOKE_OA_API_BASE_URL="${SMOKE_OA_API_BASE_URL:-${ZALO_OA_API_BASE_URL:-https://openapi.zalo.me/v3.0/oa}}"
SMOKE_SKIP_OA_OUTBOUND="${SMOKE_SKIP_OA_OUTBOUND:-false}"
SMOKE_SKIP_AI_QUALITY="${SMOKE_SKIP_AI_QUALITY:-false}"

TMP_DIR="$(mktemp -d)"
LAST_STATUS=""
LAST_BODY_FILE=""

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  echo "[smoke] $*"
}

fail() {
  echo "[smoke][FAIL] $*" >&2
  exit 1
}

json_read_stdin() {
  local expression="$1"
  node -e '
const fs = require("node:fs");
const expr = process.argv[1];
const raw = fs.readFileSync(0, "utf8");
if (!raw.trim()) {
  process.exit(0);
}
let data;
try {
  data = JSON.parse(raw);
} catch {
  process.exit(0);
}
const parts = expr.split(".");
let current = data;
for (const part of parts) {
  if (part.length === 0) continue;
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
if (current === null || current === undefined) {
  process.exit(0);
}
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

make_hmac_signature() {
  local secret="$1"
  local payload="$2"
  node -e '
const crypto = require("node:crypto");
const secret = process.argv[1];
const payload = process.argv[2];
process.stdout.write(crypto.createHmac("sha256", secret).update(payload).digest("hex"));
' "$secret" "$payload"
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

http_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local auth_mode="${4:-auth}"
  shift 4 || true
  local extra_headers=("$@")

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

  if [ "$auth_mode" = "auth" ] && [ "$AUTH_ENABLED" = "true" ]; then
    if [ -z "$SMOKE_BEARER_TOKEN" ]; then
      fail "AUTH_ENABLED=true nhưng chưa có SMOKE_BEARER_TOKEN/SMOKE_JWT_SECRET để gọi $method $path"
    fi
    curl_cmd+=(-H "Authorization: Bearer $SMOKE_BEARER_TOKEN")
  fi

  local header
  for header in "${extra_headers[@]-}"; do
    [ -n "$header" ] || continue
    curl_cmd+=(-H "$header")
  done

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
  echo "[smoke] response body:"
  cat "$LAST_BODY_FILE" || true
  fail "HTTP status $LAST_STATUS không nằm trong tập cho phép: $allowed"
}

prepare_auth_token() {
  if [ "$AUTH_ENABLED" != "true" ]; then
    log "AUTH_ENABLED=false, bỏ qua bước phát token."
    return
  fi

  if [ -n "$SMOKE_BEARER_TOKEN" ]; then
    log "Sử dụng SMOKE_BEARER_TOKEN được cung cấp sẵn."
    return
  fi

  if [ -z "$SMOKE_JWT_SECRET" ]; then
    fail "Thiếu SMOKE_JWT_SECRET/JWT_SECRET để phát token smoke."
  fi

  SMOKE_BEARER_TOKEN="$(make_jwt_token "$SMOKE_JWT_SECRET" "$AUTH_ROLE" "$AUTH_SUB" "$AUTH_EMAIL" "$TENANT_ID")"
  log "Đã phát token smoke nội bộ cho role=$AUTH_ROLE tenant=$TENANT_ID."
}

check_webhook_signature_path() {
  if [ -z "$SMOKE_WEBHOOK_SECRET" ]; then
    log "SKIP webhook signature check vì chưa có SMOKE_WEBHOOK_SECRET/ZALO_OA_WEBHOOK_SECRET."
    return
  fi

  local payload='{"zaloAccountId":"smoke_missing_oa_account","externalThreadId":"smoke_signature_thread","senderType":"CUSTOMER","content":"smoke signature check"}'
  local valid_signature
  valid_signature="$(make_hmac_signature "$SMOKE_WEBHOOK_SECRET" "$payload")"

  log "Kiểm tra OA webhook signature: chữ ký sai phải bị từ chối."
  http_request POST "/zalo/oa/webhook/messages" "$payload" public "x-zalo-signature: invalid_signature"
  assert_status_in "401"

  log "Kiểm tra OA webhook signature: chữ ký đúng phải qua bước verify (không còn 401)."
  http_request POST "/zalo/oa/webhook/messages" "$payload" public "x-zalo-signature: $valid_signature"
  if [ "$LAST_STATUS" = "401" ]; then
    echo "[smoke] response body:"
    cat "$LAST_BODY_FILE" || true
    fail "Webhook vẫn trả 401 dù chữ ký hợp lệ."
  fi
}

run_ai_quality_smoke() {
  local nonce
  nonce="$(date +%s)"
  local external_thread_id="smoke_qc_thread_${nonce}"
  local thread_payload
  local thread_id
  local job_payload
  local job_id
  local run_id
  local run_status
  local eval_count
  local run_error

  log "Tạo thread smoke để buộc pipeline quality gọi AI endpoint."
  thread_payload="$(cat <<JSON
{"channel":"OTHER","externalThreadId":"$external_thread_id","customerDisplayName":"Smoke Customer"}
JSON
)"
  http_request POST "/conversations/threads" "$thread_payload" auth
  assert_status_in "201"
  thread_id="$(read_field "$LAST_BODY_FILE" "id")"
  [ -n "$thread_id" ] || fail "Không lấy được thread id từ response create thread."

  http_request POST "/conversations/threads/$thread_id/messages" \
    '{"senderType":"CUSTOMER","senderName":"Smoke Customer","content":"Xin chao, toi muon kiem tra chat luong tu van.","contentType":"TEXT"}' \
    auth
  assert_status_in "201"

  job_payload="$(cat <<JSON
{"name":"Smoke AI QC $nonce","isActive":false,"intervalMinutes":120,"lookbackHours":24,"maxConversationsPerRun":5,"batchSize":1,"channelFilterJson":{"channels":["OTHER"],"accountIds":[]}}
JSON
)"
  http_request POST "/conversation-quality/jobs" "$job_payload" auth
  assert_status_in "201"
  job_id="$(read_field "$LAST_BODY_FILE" "id")"
  [ -n "$job_id" ] || fail "Không lấy được job id từ response create job."

  http_request POST "/conversation-quality/jobs/$job_id/run-now" '{}' auth
  assert_status_in "201"
  run_id="$(read_field "$LAST_BODY_FILE" "runId")"
  [ -n "$run_id" ] || fail "Không lấy được run id từ response run-now."

  http_request GET "/conversation-quality/runs/$run_id" "" auth
  assert_status_in "200"
  run_status="$(read_field "$LAST_BODY_FILE" "status")"
  eval_count="$(read_field "$LAST_BODY_FILE" "evaluations.length")"
  run_error="$(read_field "$LAST_BODY_FILE" "errorMessage")"

  if [ "$run_status" != "SUCCESS" ]; then
    echo "[smoke] run status=$run_status error=$run_error"
    fail "Conversation-quality run không SUCCESS (kiểm tra AI_OPENAI_COMPAT_*)."
  fi

  if [ -z "$eval_count" ] || [ "$eval_count" = "0" ]; then
    fail "Conversation-quality run SUCCESS nhưng không có evaluation nào."
  fi

  log "AI quality smoke pass: run=$run_id evaluations=$eval_count."
}

resolve_oa_account_id() {
  if [ -n "$SMOKE_OA_ACCOUNT_ID" ]; then
    return
  fi

  if [ -z "$SMOKE_OA_ACCESS_TOKEN" ] || [ -z "$SMOKE_OA_OUTBOUND_URL" ]; then
    return
  fi

  local payload
  payload="$(cat <<JSON
{"accountType":"OA","displayName":"Smoke OA Account","metadataJson":{"accessToken":"$SMOKE_OA_ACCESS_TOKEN","outboundUrl":"$SMOKE_OA_OUTBOUND_URL","oaOutboundUrl":"$SMOKE_OA_OUTBOUND_URL","oaApiBaseUrl":"$SMOKE_OA_API_BASE_URL"}}
JSON
)"
  http_request POST "/zalo/accounts" "$payload" auth
  assert_status_in "201"
  SMOKE_OA_ACCOUNT_ID="$(read_field "$LAST_BODY_FILE" "id")"
}

check_oa_outbound() {
  local skip_oa
  skip_oa="$(echo "$SMOKE_SKIP_OA_OUTBOUND" | tr '[:upper:]' '[:lower:]')"
  if [ "$skip_oa" = "true" ]; then
    log "SKIP OA outbound check theo cấu hình SMOKE_SKIP_OA_OUTBOUND=true."
    return
  fi

  resolve_oa_account_id

  if [ -z "$SMOKE_OA_ACCOUNT_ID" ]; then
    log "SKIP OA outbound check vì chưa có SMOKE_OA_ACCOUNT_ID và chưa đủ dữ liệu auto-create account."
    return
  fi

  local payload
  payload="$(cat <<JSON
{"externalThreadId":"$SMOKE_OA_EXTERNAL_THREAD_ID","content":"$SMOKE_OA_CONTENT"}
JSON
)"

  http_request POST "/zalo/accounts/$SMOKE_OA_ACCOUNT_ID/oa/messages/send" "$payload" auth
  assert_status_in "201"
  local success
  success="$(read_field "$LAST_BODY_FILE" "success")"
  if [ "$success" != "true" ]; then
    echo "[smoke] response body:"
    cat "$LAST_BODY_FILE" || true
    fail "OA outbound endpoint không trả success=true."
  fi

  log "OA outbound smoke pass: account=$SMOKE_OA_ACCOUNT_ID."
}

main() {
  log "API_BASE_URL=$API_BASE_URL"
  prepare_auth_token
  check_webhook_signature_path
  local skip_ai
  skip_ai="$(echo "$SMOKE_SKIP_AI_QUALITY" | tr '[:upper:]' '[:lower:]')"
  if [ "$skip_ai" = "true" ]; then
    log "SKIP AI quality check theo cấu hình SMOKE_SKIP_AI_QUALITY=true."
  else
    run_ai_quality_smoke
  fi
  check_oa_outbound
  log "CRM Conversations smoke checks completed."
}

main "$@"
