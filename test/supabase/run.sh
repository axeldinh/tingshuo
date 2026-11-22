#!/usr/bin/env bash
# Checks supabase/schema.sql on a throwaway local Postgres (needs Postgres installed: initdb, pg_ctl, psql).
#   npm run test:schema
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$here/../.."
bin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
PATH="${bin:+$bin:}$PATH"; pg="${bin:+$bin/}"
command -v initdb >/dev/null || { echo "Postgres not found (initdb). Install it to run this check."; exit 1; }
dir="$(mktemp -d)"; port=54329
as=(); if [ "$(id -u)" = 0 ]; then chown postgres "$dir"; as=(su postgres -c); fi
run() { if [ ${#as[@]} -gt 0 ]; then "${as[@]}" "$*"; else bash -c "$*"; fi; }
trap 'run "${pg}pg_ctl -D $dir/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$dir"' EXIT
run "${pg}initdb -D $dir/data -A trust -U postgres" >/dev/null
run "${pg}pg_ctl -D $dir/data -o \"-k $dir -p $port -c listen_addresses=\" -l $dir/log start -w" >/dev/null
psql=(psql -h "$dir" -p $port -U postgres -v ON_ERROR_STOP=1 -q -X)
"${psql[@]}" -f "$here/auth-stub.sql"
PGOPTIONS="-c client_min_messages=warning" "${psql[@]}" -f "$root/supabase/schema.sql"
PGOPTIONS="-c client_min_messages=warning" "${psql[@]}" -f "$root/supabase/schema.sql"   # twice: running it again must work
"${psql[@]}" -f "$here/schema-test.sql" 2>&1 | grep -E "NOTICE|ERROR" | sed 's/^.*NOTICE: */✓ /'
