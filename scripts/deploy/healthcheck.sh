#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_HEALTHCHECK_URL:-http://127.0.0.1:3001/api/v1/health}"
WEB_URL="${WEB_HEALTHCHECK_URL:-http://127.0.0.1:3000}"

for i in {1..30}; do
  if curl -fsS "$API_URL" >/dev/null && curl -fsS "$WEB_URL" >/dev/null; then
    echo "[healthcheck] API and Web OK at attempt $i"
    exit 0
  fi
  sleep 2
done

echo "[healthcheck] FAILED api=$API_URL web=$WEB_URL"
exit 1
