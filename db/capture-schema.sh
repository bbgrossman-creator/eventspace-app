#!/usr/bin/env bash
# ============================================================================
# EventCore — SCHEMA CAPTURE · maintenance action, NOT a release
#
# Mechanically captures the live authoritative definitions in `ec` into
# version control. READ-ONLY against ec by construction: pg_dump --schema-only
# and catalog SELECTs. No migration, no session setting, no write.
#
# Produces, under db/captured/:
#   README.md       what this is and — more importantly — what it is not
#   schema.sql      pg_dump --schema-only --no-owner --no-privileges
#   functions.sql   every public routine via pg_get_functiondef, name-ordered
#   inventory.txt   diffable census: routines + tables with constraint counts
#
# Verification stays inside its scope:
#   presence     — the constitutional functions appear in functions.sql (FATAL)
#   determinism  — a second census extraction is byte-identical      (FATAL)
#   parse        — best-effort load into a THROWAWAY db with
#                  check_function_bodies=off; failures resolving absent
#                  tables/types are EXPECTED and are NOT defects    (REPORTED)
#
# This does NOT claim replayability, does NOT reconstruct history, and moves
# no certification floor.
#
# Run:  bash db/capture-schema.sh          (from the repo root, in WSL)
# Exit: 0 captured+verified · 1 verification failure · 2 abort
# ============================================================================
set -u

DB="${CAPTURE_DB:-ec}"
ADMIN="${CAPTURE_ADMIN:-sudo -u postgres}"
OUT="db/captured"
PARSE_DB="capture_parse_$$"

say() { printf '%s\n' "$*"; }
abort() { say "ABORT: $*"; exit 2; }

pgq() {  # catalog SELECT, tuples only
  $ADMIN psql -X -A -t -v ON_ERROR_STOP=1 -d "$DB" -c "$1" 2>&1
}

# ── preflight ───────────────────────────────────────────────────────────────
[ -d db ] || abort "run from the repository root (db/ not found)"
EXISTS=$($ADMIN psql -X -A -t -d postgres -c \
  "select count(*) from pg_database where datname='$DB'" 2>&1 | tail -1)
[ "$EXISTS" = "1" ] || abort "database '$DB' not found ($EXISTS)"
SERVER=$(pgq "select current_setting('server_version')" | tail -1)
MOMENT=$(date -u +"%Y-%m-%d %H:%M:%SZ")
HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")
mkdir -p "$OUT"
say "== schema capture · db=$DB · server=$SERVER · repo HEAD=$HEAD =="

# ── 1 · schema.sql ──────────────────────────────────────────────────────────
$ADMIN pg_dump --schema-only --no-owner --no-privileges "$DB" > "$OUT/schema.sql" \
  || abort "pg_dump failed"
say "schema.sql     : $(wc -l < "$OUT/schema.sql") lines"

# ── 2 · functions.sql — name-ordered, one definition per routine ────────────
# prokind f (function) and p (procedure); aggregates/windows have no
# pg_get_functiondef and belong to pg_dump's output anyway.
pgq "select string_agg(
        '-- ' || p.proname || E'\n' || pg_get_functiondef(p.oid) || ';',
        E'\n\n' order by p.proname, p.oid)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f','p')" > "$OUT/functions.sql" \
  || abort "function extraction failed"
NFUN=$(grep -c "^CREATE OR REPLACE" "$OUT/functions.sql")
say "functions.sql  : $NFUN routine definitions"

# ── 3 · inventory.txt — the diffable census ─────────────────────────────────
census() {
  # Each query runs under ON_ERROR_STOP; a nonzero rc aborts the capture. A
  # failed catalog query must never masquerade as an empty census — that is the
  # v294 silent-zero class, and the cure is checking rc, not output.
  local r1 t1
  r1=$(pgq "select 'ROUTINE '||p.proname||' kind='||p.prokind::text
          ||' vol='||p.provolatile::text||' secdef='||p.prosecdef::text
          ||' config='||coalesce(array_to_string(p.proconfig,','),'-')
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.prokind in ('f','p')
        order by p.proname, p.oid") || return 1
  case "$r1" in *ERROR*) say "census ROUTINE query failed: $r1"; return 1;; esac
  t1=$(pgq "select 'TABLE '||c.relname||' constraints='||
              (select count(*) from pg_constraint x where x.conrelid=c.oid)::text
         from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r'
        order by c.relname") || return 1
  case "$t1" in *ERROR*) say "census TABLE query failed: $t1"; return 1;; esac
  printf '%s\n%s\n' "$r1" "$t1"
}
census > "$OUT/inventory.txt" || abort "census failed"
NROUT=$(grep -c "^ROUTINE" "$OUT/inventory.txt"); NTAB=$(grep -c "^TABLE" "$OUT/inventory.txt")
say "inventory.txt  : $NROUT routines, $NTAB tables"
[ "$NROUT" -eq 0 ] && { say "CENSUS FAIL    : zero routines is impossible in $DB — refusing to commit a hollow census"; exit 1; }
[ "$NROUT" -eq "$NFUN" ] || say "note           : census counts $NROUT vs $NFUN definitions (procedures vs functions split can differ; investigate if large)"

# ── 4 · verification · presence of the constitutional core (FATAL) ─────────
CORE="release_occurrence responsibility_state responsibility_feed action_actor
      is_active_member tenant_operational_timezone canonical_operational_window
      generate_obligations release_promise projection_preparation_queue
      projection_occurrence_brief"
MISSING=""
for f in $CORE; do
  grep -q "^-- $f\$" "$OUT/functions.sql" || MISSING="$MISSING $f"
done
if [ -n "$MISSING" ]; then
  say "PRESENCE FAIL  : constitutional function(s) absent from capture:$MISSING"
  exit 1
fi
say "presence       : all $(echo $CORE | wc -w) constitutional functions captured"

# ── 5 · verification · determinism (FATAL) ──────────────────────────────────
census > "/tmp/capture_census2_$$" || abort "second census failed"
if ! diff -q "$OUT/inventory.txt" "/tmp/capture_census2_$$" >/dev/null; then
  say "DETERMINISM FAIL: two extractions minutes apart differ — is something writing to $DB?"
  diff "$OUT/inventory.txt" "/tmp/capture_census2_$$" | head -10
  rm -f "/tmp/capture_census2_$$"; exit 1
fi
rm -f "/tmp/capture_census2_$$"
say "determinism    : second extraction byte-identical"

# ── 6 · verification · parse attempt (REPORTED, never fatal) ───────────────
# Loads functions.sql into an EMPTY throwaway db with body checking off.
# Failures resolving tables, types or extensions that do not exist there are
# EXPECTED and prove nothing is wrong. This checks the text is well-formed SQL;
# it explicitly does NOT demonstrate replayability.
$ADMIN createdb "$PARSE_DB" 2>/dev/null
PARSE_ERR=$($ADMIN psql -X -q -v ON_ERROR_STOP=0 -d "$PARSE_DB" \
  -c "set check_function_bodies to off" -f "$OUT/functions.sql" 2>&1 \
  | grep -c "^ERROR" || true)
$ADMIN dropdb --if-exists "$PARSE_DB" >/dev/null 2>&1
say "parse attempt  : $((NFUN - PARSE_ERR)) of $NFUN created in an empty db; $PARSE_ERR failed on absent dependencies (EXPECTED — this is not replayability and does not claim to be)"

# ── 7 · README — the artifact that keeps this honest ────────────────────────
cat > "$OUT/README.md" <<EOF
# db/captured — mechanical schema capture

**What this is.** A read-only capture of the live authoritative definitions in
\`$DB\`, taken **$MOMENT** against PostgreSQL $SERVER at repository HEAD
\`$HEAD\`. Until this capture, every function predating v292b existed *only* in
the running database.

**What this is NOT.**
- **Not a replayable chain.** Nothing here is proven to rebuild a working
  database. Dependency order, extensions, roles, RLS and data are unaddressed.
- **Not migrations.** History is not reconstructed; \`db/CHAIN.txt\` does not
  begin here.
- **Not certified.** No claim, no proof, no floor movement. The standing floor
  is unaffected.

**Contents.**
| File | What | How |
|---|---|---|
| \`schema.sql\` | full schema | \`pg_dump --schema-only --no-owner --no-privileges\` |
| \`functions.sql\` | $NFUN public routines, name-ordered | \`pg_get_functiondef\` per routine |
| \`inventory.txt\` | census: $NROUT routines (volatility/secdef/config), $NTAB tables (constraint counts) | catalog query, deterministic |

**Refreshing.** Re-run \`bash db/capture-schema.sh\` from the repo root. The
census is deterministic, so \`git diff db/captured/inventory.txt\` after a
refresh is an honest statement of what changed in the database since $MOMENT.
EOF
say "README.md      : written (capture moment $MOMENT)"

say ""
say "== CAPTURE COMPLETE — commit with exactly: =="
say "   git add db/capture-schema.sh db/captured/README.md db/captured/schema.sql db/captured/functions.sql db/captured/inventory.txt"
exit 0
