#!/usr/bin/env bash
# Runs migrations + demo seed + permission tests on a throwaway local PostgreSQL
# (16+) with Supabase platform stubs. Usage: supabase/tests/run_local.sh
# Needs initdb/pg_ctl/psql on PATH (or PG_BIN set). Exits non-zero on any failure.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SUPA="$(dirname "$HERE")"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PG_BIN:$PATH"
WORK="$(mktemp -d)"; PORT="${PGPORT_TEST:-54329}"
RUN_AS=(); if [ "$(id -u)" = "0" ]; then id pgtest >/dev/null 2>&1 || useradd -m pgtest; chown -R pgtest "$WORK"; RUN_AS=(sudo -u pgtest); fi
"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null
[ -n "${KEEP:-}" ] && echo "KEEP: psql -h $WORK -p $PORT -U postgres" || trap '"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$HERE/local/platform_stubs.sql"
for f in "$SUPA"/migrations/*.sql; do
  # extensions provided by the stubs above
  sed -E '/^create extension if not exists (pgmq|pg_cron|pg_net)/d' "$f" | "${PSQL[@]}" -f - >/dev/null || { echo "migration failed: $f"; exit 1; }
done
"${PSQL[@]}" -f "$SUPA/seed/demo_school.sql" >/dev/null
"${PSQL[@]}" -t -A -f "$HERE/permissions_test.sql" | grep -E 'PASS|FAIL' | tee "$WORK/out.txt"
echo "$(grep -c PASS "$WORK/out.txt") checks passed"
