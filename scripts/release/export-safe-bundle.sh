#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IGNORE_FILE="$ROOT_DIR/.releaseignore"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
ARTIFACT_NAME="${RELEASE_BUNDLE_NAME:-erp-retail-safe-${TIMESTAMP}}"
OUTPUT_DIR="${1:-$ROOT_DIR/release}"

if [ ! -f "$IGNORE_FILE" ]; then
  echo "[release-export] missing ignore file: $IGNORE_FILE"
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "[release-export] rsync is required"
  exit 1
fi

WORKDIR="$(mktemp -d)"
STAGING_DIR="$WORKDIR/$ARTIFACT_NAME"
ARCHIVE_PATH="$OUTPUT_DIR/${ARTIFACT_NAME}.tar.gz"

mkdir -p "$STAGING_DIR" "$OUTPUT_DIR"

rsync -a --delete \
  --exclude-from="$IGNORE_FILE" \
  "$ROOT_DIR/" "$STAGING_DIR/"

tar -C "$WORKDIR" -czf "$ARCHIVE_PATH" "$ARTIFACT_NAME"

echo "[release-export] created: $ARCHIVE_PATH"
echo "[release-export] excluded patterns from: $IGNORE_FILE"
