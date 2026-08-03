#!/bin/bash
# ============================================================================
# v293 race proof — RACE-WC1 · concurrent claim of one unowned responsibility
#
# Two GENUINE parallel Postgres backends, not two sequential statements. Each
# opens its own transaction, waits on a shared wall-clock barrier so both are
# inside a live transaction simultaneously, then calls claim_responsibility()
# on the SAME unowned row.
#
# The mechanism under test is the delegate's row lock plus compare-and-swap:
#   transfer_responsibility_ownership does `... for update` on the obligation,
#   then compares the ledger's current owner against p_expected_prior (null).
# Whichever backend takes the lock first inserts and commits; the other blocks,
# then re-reads under READ COMMITTED, sees the new owner, and the CAS refuses.
#
# PASS requires all three:
#   · exactly one backend succeeded
#   · exactly one backend was refused with OWNERSHIP_CONFLICT
#   · the ownership ledger holds exactly one act for that responsibility
#
# Two successes is the failure this proof exists to catch: it would mean the
# CAS did not protect the row and the second claim silently stole the work.
#
# Disposable clone. ec is never touched.
# Run: bash proofs/v293_race.sh
# Exit: 0 PASS · 1 FAIL · 2 ABORT · 3 cleanup failure · 4 INDETERMINATE ·
#       78 PostgreSQL certification privilege unavailable (pg_require) · 130 signal
# ============================================================================
set -u
# --- privileged access: ec/lib/pg.sh is the ONLY path to PostgreSQL ----------
. "${EC_LIB_PG:-ec/lib/pg.sh}" || exit 2
pg_require                      # noninteractive capability gate; never prompts
# ---------------------------------------------------------------------------
DB="ec_v293_race_$$"
OUT_A="/tmp/v293_race_a_$$.out"
OUT_B="/tmp/v293_race_b_$$.out"
SEED="/tmp/v293_race_seed_$$.sql"
BARRIER="${BARRIER:-3}"       # seconds each backend waits inside its transaction
CLEAN_FAIL=0
CLONE_CREATED=0

say() { printf '%s\n' "$*"; }

cleanup() {
  local rc=$?
  rm -f "$OUT_A" "$OUT_B" "$SEED" /tmp/v293_race_a_$$.sql /tmp/v293_race_b_$$.sql
  if [ "$CLONE_CREATED" -eq 1 ]; then
    local out still
    out=$(pg_drop "$DB" 2>&1)
    [ -n "$out" ] && { say "CLEANUP-FAIL: clone removal reported: $out"; CLEAN_FAIL=1; }
    still=$(pg_exists "$DB")
    if [ "$still" != "0" ]; then
      say "CLEANUP-FAIL: clone $DB still present (count=[$still])"; CLEAN_FAIL=1
    else
      say "cleanup: clone $DB confirmed removed"
    fi
  else
    say "cleanup: clone was not created"
  fi
  if [ "$CLEAN_FAIL" -ne 0 ]; then say "CLEANUP FAILED"; [ "$rc" -eq 0 ] && rc=3; fi
  exit "$rc"
}
on_signal() { say ""; say "INTERRUPTED by signal — attempting cleanup"; exit 130; }
trap on_signal INT TERM HUP
trap cleanup EXIT

psq() { pg_q "$DB" "$1" 2>&1; }
psf() { pg_stdin "$DB" < "$1" 2>&1; }
abort() { say "ABORT: $*"; exit 2; }

pg_drop "$DB"
pg_clone ec "$DB" || abort "cannot clone ec"
CLONE_CREATED=1

# ── the ceremony must already exist in the clone ────────────────────────────
[ "$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='claim_responsibility'" | tail -1)" = "1" ] \
  || abort "claim_responsibility absent from the clone — apply v293 to ec first"

# ── identity and one unowned standing responsibility ────────────────────────
TU=$(psq "select tu.tenant_id||' '||tu.user_id from public.tenant_users tu
          where tu.active order by tu.tenant_id limit 1" | tail -1)
TENANT=${TU%% *}; USER=${TU##* }
case "$TENANT" in *-*) : ;; *) abort "no active tenant_users row in the clone";; esac
CTX="select set_config('app.user_id','$USER',false), set_config('request.jwt.claim.sub','$USER',false);"

NK="v293race_$$"
cat > "$SEED" <<SQLEOF
$CTX
insert into public.obligation
  (tenant_id, event_ref, scope, origin_ref, origin_kind, origin_revision,
   kind, department, required_outcome, natural_key, timing)
values ('$TENANT', null, 'standing', gen_random_uuid(), 'knowledge', gen_random_uuid(),
        'prep', 'culinary', 'v293 race probe', '$NK',
        jsonb_build_object('window_end', (now() + interval '6 hours')::text));
SQLEOF
SEEDOUT=$(psf "$SEED")
case "$SEEDOUT" in *ERROR*) abort "seed failed: $SEEDOUT";; esac

RID=$(psq "$CTX select 'V:'||(select o.id::text from public.obligation o where o.natural_key='$NK')" | tail -1)
RID=${RID#V:}
case "$RID" in *-*) : ;; *) abort "could not resolve the seeded responsibility: [$RID]";; esac

# non-vacuity: it must actually be unowned before the race
OWNER0=$(psq "$CTX select 'V:'||coalesce(public.responsibility_current_owner('$RID'::uuid),'<null>')" | tail -1)
[ "${OWNER0#V:}" = "<null>" ] || abort "the seeded responsibility is already owned: [${OWNER0#V:}]"

say "== RACE-WC1 =="
say "responsibility=$RID  actor=$USER  barrier=${BARRIER}s"

# ── two genuine backends, aligned on a wall-clock barrier ───────────────────
# The sleep sits INSIDE each transaction, so both are live and contending when
# the claim fires. Without it, the second psql would simply run after the first
# had finished and the test would be sequential, not concurrent.
mk() {  # $1 = output file
  cat <<SQLEOF
begin;
$CTX
select pg_sleep($BARRIER);
select 'RESULT:OK ' || (public.claim_responsibility('$RID'::uuid)->>'ownership_id');
commit;
SQLEOF
}
mk > /tmp/v293_race_a_$$.sql
mk > /tmp/v293_race_b_$$.sql
chmod 644 /tmp/v293_race_a_$$.sql /tmp/v293_race_b_$$.sql

pg_stdin "$DB" < /tmp/v293_race_a_$$.sql > "$OUT_A" 2>&1 &
PID_A=$!
pg_stdin "$DB" < /tmp/v293_race_b_$$.sql > "$OUT_B" 2>&1 &
PID_B=$!
wait $PID_A; wait $PID_B

# ── analyse ────────────────────────────────────────────────────────────────
OK_A=$(grep -c 'RESULT:OK' "$OUT_A" || true)
OK_B=$(grep -c 'RESULT:OK' "$OUT_B" || true)
CF_A=$(grep -c 'OWNERSHIP_CONFLICT' "$OUT_A" || true)
CF_B=$(grep -c 'OWNERSHIP_CONFLICT' "$OUT_B" || true)
SUCCESS=$((OK_A + OK_B))
CONFLICT=$(( (CF_A > 0 ? 1 : 0) + (CF_B > 0 ? 1 : 0) ))

LEDGER=$(psq "$CTX select 'V:'||(select count(*)::text from public.responsibility_owner ro
                                  where ro.responsibility_ref='$RID'::uuid)" | tail -1)
LEDGER=${LEDGER#V:}
ACTION=$(psq "$CTX select 'V:'||coalesce((select ro.action from public.responsibility_owner ro
                                           where ro.responsibility_ref='$RID'::uuid
                                           order by ro.seq desc limit 1),'<none>')" | tail -1)
ACTION=${ACTION#V:}

say "backend A: ok=$OK_A conflict=$CF_A"
say "backend B: ok=$OK_B conflict=$CF_B"
say "ledger acts for this responsibility: $LEDGER   last action: $ACTION"

if [ "$SUCCESS" -eq 1 ] && [ "$CONFLICT" -eq 1 ] && [ "$LEDGER" = "1" ] && [ "$ACTION" = "assign" ]; then
  say "RACE-WC1 PASS: exactly one backend claimed the responsibility, the other was refused as OWNERSHIP_CONFLICT, and the ownership ledger holds exactly one assign"
  exit 0
elif [ "$SUCCESS" -eq 2 ]; then
  say "RACE-WC1 FAIL: BOTH backends claimed the same unowned responsibility — the compare-and-swap did not protect the row"
  say "--- backend A ---"; sed 's/^/    /' "$OUT_A"
  say "--- backend B ---"; sed 's/^/    /' "$OUT_B"
  exit 1
elif [ "$SUCCESS" -eq 0 ]; then
  say "RACE-WC1 INDETERMINATE: neither backend succeeded — the transactions may not have interleaved, or both failed for an unrelated reason. Rerun; raise BARRIER if it recurs."
  say "--- backend A ---"; sed 's/^/    /' "$OUT_A"
  say "--- backend B ---"; sed 's/^/    /' "$OUT_B"
  exit 4
else
  say "RACE-WC1 FAIL: unexpected combination — success=$SUCCESS conflict=$CONFLICT ledger=$LEDGER action=$ACTION"
  say "--- backend A ---"; sed 's/^/    /' "$OUT_A"
  say "--- backend B ---"; sed 's/^/    /' "$OUT_B"
  exit 1
fi
