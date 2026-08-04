#!/usr/bin/env bash
# ============================================================================
# v301 — SHARED BROWSER TRANSPORT · ONE-SHOT PROOF RUNNER
#
# TX-1..TX-10 + RESIDUE. v301 ships no SQL, so there is nothing to migrate and
# nothing to certify permanently. What must be proved is that the ONE transport
# every browser suite now shares actually holds its contract — above all that a
# PostgreSQL refusal still fails a test.
#
# ── WHY THE CONTROLS RUN AGAINST THE REAL WRAPPER ──────────────────────────
# The obvious design is a stub ec-pgadmin selected through EC_PGADMIN. It does
# not work, and the reason is the point of the v298a model: the sudoers grant
# names exactly /usr/local/sbin/ec-pgadmin, so `sudo -n -u postgres <stub>` is
# refused by sudo BEFORE any helper logic runs. A stub could only ever prove
# that sudo is locked down. So every control below drives the real wrapper and
# produces the real condition — a division by zero, a NOTICE, an unknown verb,
# a database outside the ec namespace.
#
# THE CENTRAL CONTROL IS TX-4. `ec-pgadmin sqlstdin` runs psql with
# ON_ERROR_STOP=0: a failing statement leaves psql EXITING 0. A transport that
# trusted the exit code would convert every ceremony refusal into a silently
# passing test. TX-4 proves the restoration is live by making psql exit 0 with
# an ERROR: on stderr and requiring the helper to throw anyway.
#
# Run:  bash proofs/v301_proofs.sh
# Exit: 0 all PASS · 1 any FAIL
# ============================================================================
set -uo pipefail
. "${EC_LIB_PG:-ec/lib/pg.sh}"
pg_require

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="$REPO/browser-tests/lib/pg.mjs"
CLONE="ec_v301_$$"
PASS=0; FAIL=0
declare -a FAILED

ok()  { PASS=$((PASS+1)); printf '  PASS  %-8s %s\n' "$1" "$2"; }
bad() { FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  FAIL  %-8s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

# run a node snippet with the helper imported as `pg`
node_run() { node --input-type=module -e "import * as pg from '$HELPER'; $1" 2>&1; }

cleanup() { pg_drop "$CLONE"; }
trap cleanup EXIT

echo "== v301 one-shot =="

# ── TX-1 · the estate has exactly ONE transport ────────────────────────────
# Comments may still describe the old mechanism; only executable lines count,
# so every check below strips comment lines before matching.
SUITES=$(grep -ln "makeFixtureDb" "$REPO"/browser-tests/accept-*.mjs | wc -l)
chk "TX-1a" "$SUITES" "7" "all seven database-touching suites import the shared helper"

LEGACY=$(grep -vh '^\s*//' "$REPO"/browser-tests/accept-*.mjs \
         | grep -cE '"su"|su postgres|sudo -u postgres|createdb -T|dropdb --if-exists' || true)
chk "TX-1b" "$LEGACY" "0" "no executable line in any suite still invokes a legacy transport"

COPIES=$(grep -vh '^\s*//' "$REPO"/browser-tests/accept-*.mjs | grep -c 'sqlstdin' || true)
chk "TX-1c" "$COPIES" "0" "no suite carries its own sqlstdin call — the helper is the only implementation"

# ── TX-2 · the contract surface ────────────────────────────────────────────
chk "TX-2" "$(node_run 'console.log(["PGADMIN","pg","psql","makeFixtureDb"].every(k=>k in pg))')" "true" \
    "the helper exports PGADMIN, pg, psql and makeFixtureDb"

# ── a real fixture database for the SQL-level controls ─────────────────────
pg_drop "$CLONE"; pg_clone ec "$CLONE" || { echo "ABORT: clone failed"; exit 1; }

# ── TX-3 · the happy path still returns rows ───────────────────────────────
chk "TX-3" "$(node_run "console.log(pg.psql('select 42', '$CLONE'))")" "42" \
    "a successful statement returns its trimmed output"

# ══ TX-4 · THE CENTRAL CONTROL ═════════════════════════════════════════════
# psql exits 0 here. Only the stderr inspection can catch it.
RAW_STATUS=$(printf 'select 1/0;\n' | sudo -n -u postgres /usr/local/sbin/ec-pgadmin sqlstdin "$CLONE" >/dev/null 2>&1; echo $?)
chk "TX-4a" "$RAW_STATUS" "0" \
    "sqlstdin really does exit 0 on a failed statement — the trap this transport exists to close"
chk "TX-4b" "$(node_run "try { pg.psql('select 1/0', '$CLONE'); console.log('ACCEPTED'); } catch { console.log('threw'); }")" "threw" \
    "the helper THROWS anyway — ON_ERROR_STOP=1 is restored, so a refusal cannot pass silently"

# ── TX-5 · the refusal text survives, on .stderr ───────────────────────────
chk "TX-5" "$(node_run "try { pg.psql('select 1/0', '$CLONE'); console.log('ACCEPTED'); } catch (e) { console.log(/division by zero/.test(e.stderr) && /division by zero/.test(e.message) ? 'carried' : 'lost:'+e.stderr); }")" "carried" \
    "the thrown Error carries .stderr verbatim — the channel PR-7/PR-8 render refusals through"

# ── TX-6 · a NOTICE is not an ERROR ────────────────────────────────────────
# psql echoes the DO command tag on stdout, so the row is the LAST line.
chk "TX-6" "$(node_run "try { console.log(pg.psql(\"do \\\$\\\$ begin raise notice 'harmless'; end \\\$\\\$; select 7\", '$CLONE').split('\n').pop()); } catch (e) { console.log('FALSE-POSITIVE'); }")" "7" \
    "a NOTICE on stderr is not mistaken for a refusal"

# ── TX-7 · wrapper-level failures are reported as such ─────────────────────
chk "TX-7a" "$(node_run "try { pg.pg('no_such_verb'); console.log('ACCEPTED'); } catch (e) { console.log(/unknown verb/.test(e.message) ? 'refused' : 'other:'+e.message); }")" "refused" \
    "an unknown verb is refused by the wrapper and surfaced by name"
chk "TX-7b" "$(node_run "try { pg.psql('select 1', 'postgres'); console.log('ACCEPTED'); } catch (e) { console.log(/outside the ec namespace/.test(e.message) ? 'refused' : 'other:'+e.message); }")" "refused" \
    "the namespace lock still holds — a non-ec database is refused, not queried"

# ── TX-8 · EC_PGADMIN is honoured ──────────────────────────────────────────
# Pointed at a path sudo will not accept, the helper must fail rather than
# silently fall back to the real wrapper. This is what makes the override real.
chk "TX-8" "$(EC_PGADMIN=/nonexistent/ec-pgadmin node_run "try { pg.pg('capability'); console.log('FELL-BACK'); } catch { console.log('honoured'); }")" "honoured" \
    "EC_PGADMIN redirects the wrapper path — no silent fallback to the real one"

# ── TX-9 · cleanup is registered, not appended ─────────────────────────────
# The suite THROWS after building its fixture. Every pre-v301 suite dropped on
# its last line and would have leaked the database here.
LEAK_DB="ec_v301leak_$$"
node_run "pg.makeFixtureDb('$LEAK_DB'); throw new Error('simulated suite failure');" >/dev/null 2>&1
chk "TX-9" "$(pg_exists "$LEAK_DB")" "0" \
    "a fixture database is reclaimed even when the suite dies mid-run"

# ── TX-10 · the fixture is a real clone of ec ──────────────────────────────
chk "TX-10" "$(node_run "const f = pg.makeFixtureDb('${CLONE}b'); const n = f.psql(\"select count(*) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='projection_occurrence_brief'\"); f.drop(); console.log(n);")" "1" \
    "makeFixtureDb clones ec — the certified schema is present in the fixture"

# ── RESIDUE ────────────────────────────────────────────────────────────────
pg_drop "${CLONE}b"
STRAY=$(pg_q ec "select count(*) from pg_database where datname like 'ec_v301%' and datname <> '$CLONE'")
chk "RESIDUE" "$STRAY" "0" "no stray v301 fixture databases remain"

echo
echo "== v301 one-shot: $PASS PASS / $FAIL FAIL =="
[ $FAIL -eq 0 ] || { printf 'failed: %s\n' "${FAILED[*]}"; exit 1; }
exit 0
