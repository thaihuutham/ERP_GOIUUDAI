#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${DEPLOY_WORKDIR:-/opt/erp-retail}"
BRANCH="${DEPLOY_BRANCH:-main}"
ENV_FILE="${DEPLOY_ENV_FILE:-$WORKDIR/.deploy.env}"

echo "[deploy] workdir=$WORKDIR branch=$BRANCH env_file=$ENV_FILE"

if [ ! -d "$WORKDIR/.git" ]; then
  echo "[deploy] missing git repo at $WORKDIR"
  exit 1
fi

cd "$WORKDIR"

echo "[deploy] fetch latest"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

require_single_line_env() {
  local name="$1"
  local value="$2"
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    echo "[deploy] invalid $name: multiline values are not allowed"
    exit 1
  fi
}

NODE_ENV_VALUE="${NODE_ENV:-production}"
AUTH_ENABLED_VALUE="${AUTH_ENABLED:-true}"
DATABASE_URL_VALUE="${DATABASE_URL:-postgresql://erp:erp@postgres:5432/erp_retail}"
REDIS_URL_VALUE="${REDIS_URL:-redis://redis:6379}"
DEFAULT_TENANT_ID_VALUE="${DEFAULT_TENANT_ID:-tenant_demo_company}"
API_PORT_VALUE="${API_PORT:-3001}"
WEB_PORT_VALUE="${WEB_PORT:-3000}"
NEXT_PUBLIC_API_BASE_URL_VALUE="${NEXT_PUBLIC_API_BASE_URL:-http://api:3001/api/v1}"
AI_OPENAI_COMPAT_BASE_URL_VALUE="${AI_OPENAI_COMPAT_BASE_URL:-}"
AI_OPENAI_COMPAT_API_KEY_VALUE="${AI_OPENAI_COMPAT_API_KEY:-}"
AI_OPENAI_COMPAT_MODEL_VALUE="${AI_OPENAI_COMPAT_MODEL:-gpt-4o-mini}"
AI_OPENAI_COMPAT_TIMEOUT_MS_VALUE="${AI_OPENAI_COMPAT_TIMEOUT_MS:-45000}"
ZALO_OA_WEBHOOK_SECRET_VALUE="${ZALO_OA_WEBHOOK_SECRET:-}"
ZALO_OA_OUTBOUND_URL_VALUE="${ZALO_OA_OUTBOUND_URL:-}"
ZALO_OA_ACCESS_TOKEN_VALUE="${ZALO_OA_ACCESS_TOKEN:-}"
ZALO_OA_API_BASE_URL_VALUE="${ZALO_OA_API_BASE_URL:-https://openapi.zalo.me/v3.0/oa}"
ZALO_OA_OUTBOUND_TIMEOUT_MS_VALUE="${ZALO_OA_OUTBOUND_TIMEOUT_MS:-20000}"
JWT_SECRET_VALUE="${JWT_SECRET:-}"

if [ "$AUTH_ENABLED_VALUE" = "true" ] && { [ -z "$JWT_SECRET_VALUE" ] || [ "$JWT_SECRET_VALUE" = "change_me_to_a_long_secret" ]; }; then
  echo "[deploy] error: AUTH_ENABLED=true requires a non-default JWT_SECRET."
  exit 1
fi
JWT_SECRET_VALUE="${JWT_SECRET_VALUE:-change_me_to_a_long_secret}"

require_single_line_env "NODE_ENV" "$NODE_ENV_VALUE"
require_single_line_env "AUTH_ENABLED" "$AUTH_ENABLED_VALUE"
require_single_line_env "DATABASE_URL" "$DATABASE_URL_VALUE"
require_single_line_env "REDIS_URL" "$REDIS_URL_VALUE"
require_single_line_env "DEFAULT_TENANT_ID" "$DEFAULT_TENANT_ID_VALUE"
require_single_line_env "API_PORT" "$API_PORT_VALUE"
require_single_line_env "WEB_PORT" "$WEB_PORT_VALUE"
require_single_line_env "NEXT_PUBLIC_API_BASE_URL" "$NEXT_PUBLIC_API_BASE_URL_VALUE"
require_single_line_env "JWT_SECRET" "$JWT_SECRET_VALUE"
require_single_line_env "AI_OPENAI_COMPAT_BASE_URL" "$AI_OPENAI_COMPAT_BASE_URL_VALUE"
require_single_line_env "AI_OPENAI_COMPAT_API_KEY" "$AI_OPENAI_COMPAT_API_KEY_VALUE"
require_single_line_env "AI_OPENAI_COMPAT_MODEL" "$AI_OPENAI_COMPAT_MODEL_VALUE"
require_single_line_env "AI_OPENAI_COMPAT_TIMEOUT_MS" "$AI_OPENAI_COMPAT_TIMEOUT_MS_VALUE"
require_single_line_env "ZALO_OA_WEBHOOK_SECRET" "$ZALO_OA_WEBHOOK_SECRET_VALUE"
require_single_line_env "ZALO_OA_OUTBOUND_URL" "$ZALO_OA_OUTBOUND_URL_VALUE"
require_single_line_env "ZALO_OA_ACCESS_TOKEN" "$ZALO_OA_ACCESS_TOKEN_VALUE"
require_single_line_env "ZALO_OA_API_BASE_URL" "$ZALO_OA_API_BASE_URL_VALUE"
require_single_line_env "ZALO_OA_OUTBOUND_TIMEOUT_MS" "$ZALO_OA_OUTBOUND_TIMEOUT_MS_VALUE"

echo "[deploy] write runtime env file"
umask 077
cat >"$ENV_FILE" <<EOF
NODE_ENV=$NODE_ENV_VALUE
AUTH_ENABLED=$AUTH_ENABLED_VALUE
DATABASE_URL=$DATABASE_URL_VALUE
REDIS_URL=$REDIS_URL_VALUE
DEFAULT_TENANT_ID=$DEFAULT_TENANT_ID_VALUE
API_PORT=$API_PORT_VALUE
WEB_PORT=$WEB_PORT_VALUE
NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL_VALUE
JWT_SECRET=$JWT_SECRET_VALUE
AI_OPENAI_COMPAT_BASE_URL=$AI_OPENAI_COMPAT_BASE_URL_VALUE
AI_OPENAI_COMPAT_API_KEY=$AI_OPENAI_COMPAT_API_KEY_VALUE
AI_OPENAI_COMPAT_MODEL=$AI_OPENAI_COMPAT_MODEL_VALUE
AI_OPENAI_COMPAT_TIMEOUT_MS=$AI_OPENAI_COMPAT_TIMEOUT_MS_VALUE
ZALO_OA_WEBHOOK_SECRET=$ZALO_OA_WEBHOOK_SECRET_VALUE
ZALO_OA_OUTBOUND_URL=$ZALO_OA_OUTBOUND_URL_VALUE
ZALO_OA_ACCESS_TOKEN=$ZALO_OA_ACCESS_TOKEN_VALUE
ZALO_OA_API_BASE_URL=$ZALO_OA_API_BASE_URL_VALUE
ZALO_OA_OUTBOUND_TIMEOUT_MS=$ZALO_OA_OUTBOUND_TIMEOUT_MS_VALUE
EOF
chmod 600 "$ENV_FILE"

echo "[deploy] build and restart containers"
docker compose --env-file "$ENV_FILE" build
docker compose --env-file "$ENV_FILE" up -d

echo "[deploy] run health check"
"$WORKDIR/scripts/deploy/healthcheck.sh"

echo "[deploy] success"
