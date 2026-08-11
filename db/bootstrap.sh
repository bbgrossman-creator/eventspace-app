#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# EventCore — certification database bootstrap
#
# Builds the `ec` and `eczr` certification databases from scratch, in the
# verified order recorded in db/CHAIN.txt.
#
#   ./db/bootstrap.sh              # build both ec and eczr
#   ./db/bootstrap.sh ec           # build only ec
#   ./db/bootstrap.sh ec eczr      # explicit
#
# Every file is applied inside its own transaction (psql -1 -v ON_ERROR_STOP=1),
# so a failure aborts the run and leaves NO partial objects behind. This matters:
# applying without -1 lets a half-failed file deposit stray tables, which is how
# two databases built from the same chain end up structurally different.
#
# Run from the repository root.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAIN="$REPO/db/CHAIN.txt"
PSQL="${PSQL:-psql}"
CREATEDB="${CREATEDB:-createdb}"
DROPDB="${DROPDB:-dropdb}"

[[ -f "$CHAIN" ]] || { echo "FATAL: $CHAIN not found"; exit 1; }

DBS=("$@")
[[ ${#DBS[@]} -eq 0 ]] && DBS=(ec eczr)

# ── preflight: every chain file must exist BEFORE any database is touched ────
mapfile -t FILES < <(grep -v '^[[:space:]]*#' "$CHAIN" | sed 's/[[:space:]]*$//' | grep -v '^$')
MISSING=()
for f in "${FILES[@]}"; do
  [[ -f "$REPO/$f" ]] || MISSING+=("$f")
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "INCOMPLETE CHECKOUT"
  echo "  root : $REPO"
  echo "  chain: ${#FILES[@]} files required, ${#MISSING[@]} missing"
  echo
  printf '    %s\n' "${MISSING[@]:0:10}"
  [[ ${#MISSING[@]} -gt 10 ]] && echo "    ... and $((${#MISSING[@]} - 10)) more"
  echo
  echo "  db/CHAIN.txt names ${#FILES[@]} files: db/base.sql, db/deps.sql, and 74"
  echo "  migrations under supabase/. All of them must be present."
  echo
  echo "  Run this from a complete EventCore repository root, or use the"
  echo "  standalone package, which bundles the whole chain."
  exit 1
fi

for DB in "${DBS[@]}"; do
  echo "═══ building $DB ═══"
  $DROPDB --if-exists "$DB"
  $CREATEDB "$DB"

  applied=0
  while IFS= read -r f; do
    [[ -z "$f" || "$f" == \#* ]] && continue
    if ! $PSQL -q -1 -v ON_ERROR_STOP=1 -d "$DB" -f "$REPO/$f" >/tmp/ec_bootstrap.log 2>&1; then
      echo "FAILED: $f"
      tail -20 /tmp/ec_bootstrap.log
      exit 1
    fi
    applied=$((applied + 1))
  done < "$CHAIN"

  fns=$($PSQL -qtA -d "$DB" -c \
    "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
  tbls=$($PSQL -qtA -d "$DB" -c \
    "select count(*) from information_schema.tables where table_schema='public'")
  tenants=$($PSQL -qtA -d "$DB" -c "select count(*) from public.tenant_users where active")

  echo "  applied $applied files · $fns functions · $tbls tables · $tenants active tenant users"
  if [[ "$tenants" -lt 2 ]]; then
    echo "  WARNING: v289 EQ-10 (tenant isolation) needs two active tenants;"
    echo "           with fewer, v289_proof.sql reports SKIPPED rather than passing."
  fi
done

echo
echo "Done. Verify with:  ./db/verify.sh"
