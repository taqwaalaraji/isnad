#!/usr/bin/env bash
# Apply the repository's SQL migrations to the self-hosted database, each once, in order.
# Records them in supabase_migrations.schema_migrations, the table the Supabase CLI uses, so
# `supabase migration list --db-url ...` agrees.
#
#   deploy/migrate.sh            # from the repository root on the VM
set -euo pipefail

cd "$(dirname "$0")/.."
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
psql() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key, statements text[], name text
);
SQL

applied=$(psql -At -c "select version from supabase_migrations.schema_migrations")
for file in supabase/migrations/*.sql; do
  base=$(basename "$file" .sql)
  version=${base%%_*}
  name=${base#*_}
  if grep -qx "$version" <<<"$applied"; then
    continue
  fi
  echo "applying $base"
  {
    echo "begin;"
    cat "$file"
    echo
    echo "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name');"
    echo "commit;"
  } | psql
done
echo "migrations up to date"
