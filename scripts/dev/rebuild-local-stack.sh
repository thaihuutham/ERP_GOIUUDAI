#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

RESET_DB=0
NO_CACHE=0
WITH_LINT=0
SEED_OVERRIDE=""   # "" = auto, "yes" = force seed, "no" = skip seed

API_IMAGE="${API_IMAGE:-erp-retail-api}"
WEB_IMAGE="${WEB_IMAGE:-erp-retail-web}"
HOST_DB_URL="${HOST_DB_URL:-postgresql://erp:erp@127.0.0.1:55432/erp_retail}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3001/api/v1}"
WEB_BASE_URL="${WEB_BASE_URL:-http://127.0.0.1:3000}"

usage() {
  cat <<'USAGE'
Usage: scripts/dev/rebuild-local-stack.sh [options]

Options:
  --reset-db   Drop docker volumes before rebuild (DANGEROUS: wipe local data)
  --seed       Force seeding demo data after migration
  --no-seed    Skip seeding demo data (even on --reset-db)
  --no-cache   Build images without Docker cache
  --with-lint  Run API + Web lint after services are healthy
  -h, --help   Show this help

By default, demo data is seeded automatically when --reset-db is used
(since the database is wiped). Use --seed to force seeding on a
non-reset rebuild, or --no-seed to skip it entirely.

Environment overrides:
  API_IMAGE, WEB_IMAGE, HOST_DB_URL, API_BASE_URL, WEB_BASE_URL
USAGE
}

log() {
  printf '[rebuild-local] %s\n' "$*"
}

wait_for_postgres() {
  local attempts=40
  local sleep_secs=2
  local i
  for i in $(seq 1 "$attempts"); do
    if docker exec erp-postgres pg_isready -U erp -d erp_retail >/dev/null 2>&1; then
      log "Postgres is ready."
      return 0
    fi
    sleep "$sleep_secs"
  done
  log "Postgres did not become ready in time."
  return 1
}

wait_for_http_ok() {
  local url="$1"
  local label="$2"
  local attempts=40
  local sleep_secs=2
  local i
  for i in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "$label is ready: $url"
      return 0
    fi
    sleep "$sleep_secs"
  done
  log "$label not ready in time: $url"
  return 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --reset-db)
      RESET_DB=1
      ;;
    --seed)
      SEED_OVERRIDE="yes"
      ;;
    --no-seed)
      SEED_OVERRIDE="no"
      ;;
    --no-cache)
      NO_CACHE=1
      ;;
    --with-lint)
      WITH_LINT=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

# Resolve whether to seed: explicit flag wins, otherwise auto-seed on --reset-db
SHOULD_SEED=0
if [ "$SEED_OVERRIDE" = "yes" ]; then
  SHOULD_SEED=1
elif [ "$SEED_OVERRIDE" = "no" ]; then
  SHOULD_SEED=0
elif [ "$RESET_DB" -eq 1 ]; then
  SHOULD_SEED=1
fi

if ! command -v docker >/dev/null 2>&1; then
  log "Docker not found in PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  log "Docker daemon is not reachable."
  exit 1
fi

log "Stopping current stack..."
if [ "$RESET_DB" -eq 1 ]; then
  log "--reset-db enabled: removing volumes."
  docker compose down -v --remove-orphans
else
  docker compose down --remove-orphans
fi

log "Removing old app images (if present): $API_IMAGE, $WEB_IMAGE"
docker image rm -f "$API_IMAGE" "$WEB_IMAGE" >/dev/null 2>&1 || true

log "Building app images..."
if [ "$NO_CACHE" -eq 1 ]; then
  docker compose build --no-cache api web
else
  docker compose build api web
fi

log "Starting infra services..."
docker compose up -d postgres redis meilisearch minio
wait_for_postgres

log "Applying Prisma migrations to runtime DB..."
DATABASE_URL="$HOST_DB_URL" npm run prisma:migrate:deploy --workspace @erp/api
DATABASE_URL="$HOST_DB_URL" npm run prisma:migrate:status --workspace @erp/api

# ── Seed demo data ─────────────────────────────────────────────────
if [ "$SHOULD_SEED" -eq 1 ]; then
  log "Seeding demo data..."
  DATABASE_URL="$HOST_DB_URL" npm run seed:demo --workspace @erp/api
  log "Demo data seeded successfully."
else
  log "Skipping demo data seed (use --seed to force, or --reset-db to auto-seed)."
fi

log "Starting app services..."
docker compose up -d api web

wait_for_http_ok "$API_BASE_URL/health" "API healthcheck"
wait_for_http_ok "$WEB_BASE_URL" "Web frontend"
wait_for_http_ok "$API_BASE_URL/catalog/products?includeArchived=false&limit=1" "Catalog API smoke"

if [ "$WITH_LINT" -eq 1 ]; then
  log "Running lint checks..."
  npm run lint --workspace @erp/api
  npm run lint --workspace @erp/web
fi

log "Done. Stack rebuilt, DB migrated, smoke checks passed."
