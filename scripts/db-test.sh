#!/usr/bin/env bash
# Apply the migrations to a scratch Postgres and run the RLS suite against it.
#
# This does not need a Supabase project: supabase/tests/00_harness.sql stands in
# for the `auth` schema and the anon/authenticated/service_role grants, so the
# policies are exercised exactly as PostgREST would exercise them.
#
#   ./scripts/db-test.sh                     # uses $PGHOST/$PGPORT or a local socket
#   PGHOST=/tmp/pgrun PGPORT=55432 ./scripts/db-test.sh
#
# Set DB_TEST_KEEP=1 to leave the scratch database in place for poking at.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db="${DB_TEST_DATABASE:-gymapp_test}"
psql_args=(-U "${PGUSER:-postgres}" -v ON_ERROR_STOP=1 -q)
[[ -n "${PGHOST:-}" ]] && psql_args+=(-h "$PGHOST")
[[ -n "${PGPORT:-}" ]] && psql_args+=(-p "$PGPORT")

run() { psql "${psql_args[@]}" "$@"; }

echo "→ recreating $db"
run -d postgres -c "drop database if exists \"$db\";" >/dev/null
run -d postgres -c "create database \"$db\";" >/dev/null

echo "→ harness (auth schema, roles, default grants)"
run -d "$db" -f "$root/supabase/tests/00_harness.sql" >/dev/null

echo "→ migrations"
for m in "$root"/supabase/migrations/*.sql; do
  echo "   $(basename "$m")"
  run -d "$db" -f "$m" >/dev/null
done

echo "→ RLS suite"
run -d "$db" -f "$root/supabase/tests/01_rls.sql"

if [[ "${DB_TEST_KEEP:-0}" != "1" ]]; then
  run -d postgres -c "drop database \"$db\";" >/dev/null
fi
echo "✓ database checks passed"
