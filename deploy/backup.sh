#!/usr/bin/env bash
# Nightly backup: the database (pg_dump, custom format) and the Storage files.
# Schedule with cron, e.g.  15 2 * * *  /opt/isnad/deploy/backup.sh >> /var/log/isnad-backup.log 2>&1
# Copy BACKUP_DIR off the VM (rclone, restic, provider snapshots): a backup on the same disk
# doesn't survive losing the disk.
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
SUPABASE_DIR="${SUPABASE_DIR:-/opt/supabase/docker}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/isnad}"
KEEP_DAYS="${KEEP_DAYS:-14}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$BACKUP_DIR"
umask 077

docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres -Fc --no-owner \
  > "$BACKUP_DIR/db-$stamp.dump.partial"
mv "$BACKUP_DIR/db-$stamp.dump.partial" "$BACKUP_DIR/db-$stamp.dump"

tar -C "$SUPABASE_DIR/volumes" -czf "$BACKUP_DIR/storage-$stamp.tar.gz.partial" storage
mv "$BACKUP_DIR/storage-$stamp.tar.gz.partial" "$BACKUP_DIR/storage-$stamp.tar.gz"

find "$BACKUP_DIR" -name 'db-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'storage-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) backup $stamp done: $(du -sh "$BACKUP_DIR" | cut -f1) kept"
