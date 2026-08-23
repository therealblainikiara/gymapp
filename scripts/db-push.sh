#!/usr/bin/env bash
# Apply supabase/migrations to a real Supabase project.
#
# Two ways to run it — pick whichever credential you have:
#
#   1. Direct connection string (no Supabase CLI needed):
#        DATABASE_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres' \
#          ./scripts/db-push.sh
#      Find it in Dashboard → Settings → Database → Connection string → URI.
#
#   2. Supabase CLI, if the project is linked (`supabase link --project-ref <ref>`):
#        ./scripts/db-push.sh --cli
#
# Migrations are applied in filename order inside a single transaction each, so
# a failure leaves the database on the last good migration rather than half-way
# through a broken one.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" == "--cli" ]]; then
  command -v supabase >/dev/null || {
    echo "The Supabase CLI is not installed. See https://supabase.com/docs/guides/cli" >&2
    exit 1
  }
  exec supabase db push --workdir "$root"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  cat >&2 <<'USAGE'
Set DATABASE_URL, or pass --cli to use a linked Supabase CLI project.

  DATABASE_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres' \
    ./scripts/db-push.sh

The publishable key cannot do this: creating tables and policies needs the
database password (or a CLI access token), not the browser's API key.
USAGE
  exit 1
fi

echo "→ applying migrations"
for m in "$root"/supabase/migrations/*.sql; do
  echo "   $(basename "$m")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -q -f "$m"
done
echo "✓ migrations applied"
echo
echo "Next: Dashboard → Authentication → URL Configuration"
echo "  Site URL:      \${NEXT_PUBLIC_SITE_URL}"
echo "  Redirect URLs: \${NEXT_PUBLIC_SITE_URL}/auth/callback"
