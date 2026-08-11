#!/usr/bin/env bash
# ============================================================================
# v307a race proof — RACE-Y3 · concurrent double-release of one staffing assignment
#
# Two GENUINE parallel backends, each in its own transaction, aligned on a
# wall-clock barrier so both are live when they call
# release_staffing_assignment() on the SAME assignment.
#
# THE CONSTRAINT-FREE CASE (Y3, frozen v306 design): staffing_release has NO
# unique index on assignment_ref — the ceremony's `for update` on the DERIVED
# staffing_requirement is the ONLY protection against double release. This race
# proves that protocol against the WIRED ceremony (v307a): the loser must be
# refused through the authority's vocabulary, never by a constraint, and never
# succeed.
#
# PASS requires ALL FOUR:
#   · exactly one backend succeeded
#   · exactly one was refused with STAFFING_ALREADY_RELEASED
#   · exactly ONE row in public.staffing_release for that assignment
#   · no raw constraint/SQLSTATE error appears in either backend's output
#
# Two release rows is the failure this exists to catch: with no unique backstop,
# nothing downstream would ever detect the duplicate (Y3's whole point).
#
# Disposable clone. ec is never opened directly.
# Run: bash proofs/v307a_y3_race.sh
# Exit: 0 PASS · 1 FAIL · 2 ABORT · 3 cleanup failure · 4 INDETERMINATE ·
#       78 PostgreSQL certification privilege unavailable (pg_require) · 130 signal
# ============================================================================
set -u
. "${EC_LIB_PG:-ec/lib/pg.sh}" || exit 2
pg_require
DB="ec_y3_race_$$"
OUT_A="/tmp/y3_a_$$.out"; OUT_B="/tmp/y3_b_$$.out"
SEED="/tmp/y3_seed_$$.sql"
BARRIER="${BARRIER:-3}"
CLEAN_FAIL=0
CLONE_CREATED=0
say() { printf '%s\n' "$*"; }
cleanup() {
  local rc=$?
  rm -f "$OUT_A" "$OUT_B" "$SEED" /tmp/y3_ra_$$.sql /tmp/y3_rb_$$.sql
  if [ "$CLONE_CREATED" -eq 1 ]; then
    local out still
    out=$(pg_drop "$DB" 2>&1)
    [ -n "$out" ] && { say "CLEANUP-FAIL: $out"; CLEAN_FAIL=1; }
    still=$(pg_exists "$DB")
    [ "$still" != "0" ] && { say "CLEANUP-FAIL: clone remains"; CLEAN_FAIL=1; } || say "cleanup: clone removed"
  else
    say "cleanup: clone was not created"
  fi
  [ "$CLEAN_FAIL" -ne 0 ] && { [ "$rc" -eq 0 ] && rc=3; }
  exit "$rc"
}
trap 'say "INTERRUPTED"; exit 130' INT TERM HUP
trap cleanup EXIT
psq() { pg_q "$DB" "$1" 2>&1; }
psf() { pg_stdin "$DB" < "$1" 2>&1; }
abort() { say "ABORT: $*"; exit 2; }

pg_drop "$DB"
pg_clone ec "$DB" || abort "cannot clone ec"
CLONE_CREATED=1
[ "$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='release_staffing_assignment'" | tail -1)" = "1" ] \
  || abort "release_staffing_assignment absent from the clone"

TU=$(psq "select tu.tenant_id||' '||tu.user_id from public.tenant_users tu
           where tu.active and tu.role in ('admin','owner','manager','ops')
           order by tu.tenant_id limit 1" | tail -1)
TENANT=${TU%% *}; USER=${TU##* }
case "$TENANT" in *-*) : ;; *) abort "no active operating tenant_users row";; esac
CTX="select set_config('app.user_id','$USER',false), set_config('request.jwt.claim.sub','$USER',false);"

NK="y3race_$$"
cat > "$SEED" <<SQLEOF
$CTX
create table if not exists public.v307a_y3_fx(tag text primary key, asg uuid);
do \$fx\$
declare v_t uuid := '$TENANT'; b uuid; o uuid; ev uuid; ob uuid; req uuid; st uuid; a uuid;
begin
  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_t,'$NK','Y3R-'||substr(gen_random_uuid()::text,1,8),'active') returning id into b;
  o := (public.open_occurrence(b,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by)
    values (v_t,b,o,gen_random_uuid(),'$NK') returning id into ev;
  insert into public.obligation (tenant_id,event_ref,scope,origin_ref,origin_kind,kind,department,required_outcome,natural_key,timing)
    values (v_t,ev,'event',gen_random_uuid(),'release','staffing_assign','staffing','cover','$NK',
            jsonb_build_object('window_end',(now()+interval '48 hours')::text)) returning id into ob;
  insert into public.staffing_requirement (tenant_id,event_ref,origin_obligation_ref,role,quantity,department,natural_key,window_start,window_end)
    values (v_t,ev,ob,'server',1,'staffing','$NK-req',now(),now()+interval '4 hours') returning id into req;
  insert into public.staff (tenant_id,name,active) values (v_t,'$NK staff',true) returning id into st;
  a := (public.assign_staff(req,st,now(),now()+interval '2 hours','$NK')->>'assignment_id')::uuid;
  insert into public.v307a_y3_fx values ('Y',a);
end
\$fx\$;
select 'SEEDOK';
SQLEOF
SEEDOUT=$(psf "$SEED"); case "$SEEDOUT" in *SEEDOK*) : ;; *) abort "seed failed: $SEEDOUT";; esac
AID=$(psq "$CTX select 'V:'||(select asg::text from public.v307a_y3_fx where tag='Y')" | tail -1); AID=${AID#V:}
case "$AID" in *-*) : ;; *) abort "could not resolve the seeded assignment: [$AID]";; esac

# non-vacuity: it must be UNRELEASED before the race
PRE=$(psq "$CTX select 'V:'||(select count(*)::text from public.staffing_release where assignment_ref='$AID'::uuid)" | tail -1)
[ "${PRE#V:}" = "0" ] || abort "the seeded assignment is already released"

say "== RACE-Y3 =="
say "assignment=$AID  actor=$USER  barrier=${BARRIER}s"
mk() {
  cat <<SQLEOF
begin;
$CTX
select pg_sleep($BARRIER);
select 'RESULT:OK ' || (public.release_staffing_assignment('$AID'::uuid,'y3-race','race')->>'released');
commit;
SQLEOF
}
mk > /tmp/y3_ra_$$.sql; mk > /tmp/y3_rb_$$.sql
chmod 644 /tmp/y3_ra_$$.sql /tmp/y3_rb_$$.sql
pg_stdin "$DB" < /tmp/y3_ra_$$.sql > "$OUT_A" 2>&1 & PID_A=$!
pg_stdin "$DB" < /tmp/y3_rb_$$.sql > "$OUT_B" 2>&1 & PID_B=$!
wait $PID_A; wait $PID_B

OK_A=$(grep -c 'RESULT:OK' "$OUT_A" || true); OK_B=$(grep -c 'RESULT:OK' "$OUT_B" || true)
CF_A=$(grep -c 'STAFFING_ALREADY_RELEASED' "$OUT_A" || true); CF_B=$(grep -c 'STAFFING_ALREADY_RELEASED' "$OUT_B" || true)
RAW_A=$(grep -cE 'violates|constraint|23[0-9]{3}' "$OUT_A" || true); RAW_B=$(grep -cE 'violates|constraint|23[0-9]{3}' "$OUT_B" || true)
SUCCESS=$((OK_A + OK_B)); CONFLICT=$(( (CF_A > 0 ? 1 : 0) + (CF_B > 0 ? 1 : 0) )); RAW=$((RAW_A + RAW_B))
RELS=$(psq "$CTX select 'V:'||(select count(*)::text from public.staffing_release where assignment_ref='$AID'::uuid)" | tail -1); RELS=${RELS#V:}

say "backend A: ok=$OK_A already_released=$CF_A raw_constraint=$RAW_A"
say "backend B: ok=$OK_B already_released=$CF_B raw_constraint=$RAW_B"
say "staffing_release rows for this assignment: $RELS"

if [ "$SUCCESS" -eq 1 ] && [ "$CONFLICT" -eq 1 ] && [ "$RELS" = "1" ] && [ "$RAW" -eq 0 ]; then
  say "RACE-Y3 PASS: exactly one backend released the assignment, the other was refused as STAFFING_ALREADY_RELEASED through the requirement lock, exactly one release row exists, and no raw constraint error substituted for the vocabulary"
  exit 0
elif [ "$SUCCESS" -eq 2 ] || [ "$RELS" != "1" ]; then
  say "RACE-Y3 FAIL: double release — the constraint-free Y3 protocol did not hold (releases=$RELS)"
  say "--- A ---"; sed 's/^/    /' "$OUT_A"; say "--- B ---"; sed 's/^/    /' "$OUT_B"
  exit 1
elif [ "$SUCCESS" -eq 0 ]; then
  say "RACE-Y3 INDETERMINATE: neither backend succeeded — rerun; raise BARRIER if it recurs."
  say "--- A ---"; sed 's/^/    /' "$OUT_A"; say "--- B ---"; sed 's/^/    /' "$OUT_B"
  exit 4
else
  say "RACE-Y3 FAIL: unexpected combination — success=$SUCCESS conflict=$CONFLICT releases=$RELS raw=$RAW"
  say "--- A ---"; sed 's/^/    /' "$OUT_A"; say "--- B ---"; sed 's/^/    /' "$OUT_B"
  exit 1
fi
