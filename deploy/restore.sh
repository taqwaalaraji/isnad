#!/usr/bin/env bash
# Restore a backup made by backup.sh. Stops Isnad and Supabase Storage while it runs.
#
#   deploy/restore.sh /var/backups/isnad/db-20261021T021500Z.dump /var/backups/isnad/storage-20261021T021500Z.tar.gz
set -euo pipefail

db_dump="${1:?path to db-*.dump}"
storage_archive="${2:-}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
SUPABASE_DIR="${SUPABASE_DIR:-/opt/supabase/docker}"
cd "$(dirname "$0")"

read -r -p "This replaces the current database${storage_archive:+ and storage files}. Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "cancelled"; exit 1; }

docker compose stop web worker api bot
docker exec -i "$DB_CONTAINER" pg_restore -U postgres -d postgres --clean --if-exists --no-owner \
  --single-transaction < "$db_dump"

if [ -n "$storage_archive" ]; then
  (cd "$SUPABASE_DIR" && docker compose stop storage)
  mv "$SUPABASE_DIR/volumes/storage" "$SUPABASE_DIR/volumes/storage.before-restore.$(date +%s)"
  tar -C "$SUPABASE_DIR/volumes" -xzf "$storage_archive"
  (cd "$SUPABASE_DIR" && docker compose start storage)
fi

docker compose start web worker api bot
echo "restored; check https://\$SITE_DOMAIN and the worker logs"
