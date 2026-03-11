#!/bin/sh

set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL must be set" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump must be installed and on PATH" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

OUTPUT_FILE="$BACKUP_DIR/nexus-postgres-$STAMP.sql.gz"

echo "Creating logical backup at $OUTPUT_FILE"
pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip > "$OUTPUT_FILE"

echo "Backup complete: $OUTPUT_FILE"