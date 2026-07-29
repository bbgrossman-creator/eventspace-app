#!/usr/bin/env bash
# ============================================================================
# v295 race proof — RACE-RP1 · concurrent release of one occurrence
#
# Two GENUINE parallel backends, each in its own transaction, aligned on a
# wall-clock barrier so both are live when they call release_promise() on the
# SAME occurrence with a fully satisfied predicate.
#
# The mechanism under test is release_occurrence's once-per-occurrence
# materialisation: `insert into event ... on conflict (tenant_id, occurrence_ref)
# do nothing returning id`, then `if v_event is null then raise
# RELEASE_ALREADY_RELEASED`. Whichever backend inserts first wins; the other's
# insert is swallowed by the conflict clause, returns null, and refuses.
#
# PASS requires ALL FOUR:
#   · exactly one backend succeeded
#   · exactly one was refused with RELEASE_ALREADY_RELEASED
#   · exactly ONE row in public.event for that occurrence
#   · exactly ONE 'released' evidence row
#
# Two successes is the failure this exists to catch: an occurrence materialised
# twice would break I-31' and derive two independent responsibility sets.
#
# Disposable clone. ec is never opened directly.
# Run: sudo bash proofs/v295_race.sh
# Exit: 0 PASS · 1 FAIL · 2 ABORT · 3 cleanup failure · 4 INDETERMINATE · 130 signal
# ============================================================================
set -u
DB="v295_race_$$"
OUT_A="/tmp/v295_a_$$.out"; OUT_B="/tmp/v295_b_$$.out"
SEED="/tmp/v295_seed_$$.sql"
BARRIER="${BARRIER:-3}"
CLEAN_FAIL=0
say() { printf '%s\n' "$*"; }
cleanup() {
  local rc=$?
  rm -f "$OUT_A" "$OUT_B" "$SEED" /tmp/v295_ra_$$.sql /tmp/v295_rb_$$.sql
  local out still
  out=$(su postgres -c "dropdb --if-exists $DB" 2>&1)
  [ -n "$out" ] && { say "CLEANUP-FAIL: $out"; CLEAN_FAIL=1; }
  still=$(su postgres -c "psql -X -A -t -d postgres -c \"select count(*) from pg_database where datname='$DB'\"" 2>&1 | tail -1)
  [ "$still" != "0" ] && { say "CLEANUP-FAIL: clone remains"; CLEAN_FAIL=1; } || say "cleanup: clone removed"
  [ "$CLEAN_FAIL" -ne 0 ] && { [ "$rc" -eq 0 ] && rc=3; }
  exit "$rc"
}
trap 'say "INTERRUPTED"; exit 130' INT TERM HUP
trap cleanup EXIT
psq() { su postgres -c "psql -X -A -t -v ON_ERROR_STOP=1 -d $DB -c \"$1\"" 2>&1; }
psf() { su postgres -c "psql -X -A -t -d $DB -f '$1'" 2>&1; }
abort() { say "ABORT: $*"; exit 2; }

su postgres -c "dropdb --if-exists $DB" >/dev/null 2>&1
su postgres -c "createdb -T ec $DB" || abort "cannot clone ec"
[ "$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='release_promise'" | tail -1)" = "1" ] \
  || abort "release_promise absent from the clone — apply v295 to ec first"

TU=$(psq "select tu.tenant_id||' '||tu.user_id from public.tenant_users tu where tu.active order by tu.tenant_id limit 1" | tail -1)
TENANT=${TU%% *}; USER=${TU##* }
case "$TENANT" in *-*) : ;; *) abort "no active tenant_users row";; esac
CTX="select set_config('app.user_id','$USER',false), set_config('request.jwt.claim.sub','$USER',false);"

NK="v295race_$$"
cat > "$SEED" <<SQLEOF
$CTX
create table if not exists public.v295_race_fx(tag text primary key, occ uuid);
do \$fx\$
declare v_t uuid := '$TENANT'; b uuid; o uuid; snap uuid; v_ver uuid;
begin
  -- Same lawful strategy as the one-shot: the acceptance resolves BY BOOKING,
  -- the event is keyed on the OCCURRENCE. offer_snapshots.version_id is UNIQUE
  -- and FK-bound to proposal_versions; offer_acceptances.snapshot_id is UNIQUE.
  select a.booking_id into b
    from public.offer_acceptances a
    left join public.acceptance_rescissions r on r.acceptance_id = a.id
   where a.tenant_id = v_t and r.id is null
   order by a.created_at
   limit 1;

  if b is null then
    select pv.id into v_ver
      from public.proposal_versions pv
     where not exists (select 1 from public.offer_snapshots s where s.version_id = pv.id)
     limit 1;
    if v_ver is null then
      raise exception 'V295_RACE_FIXTURE_UNSATISFIABLE: no unrescinded acceptance and no unused proposal_versions row';
    end if;
    insert into public.bookings (tenant_id,contact_name,invoice_num,status)
      values (v_t,'$NK','V295R-'||substr(gen_random_uuid()::text,1,8),'active') returning id into b;
    insert into public.offer_snapshots
      (id,tenant_id,version_id,fingerprint,model,artifact_bytes,artifact_hash,artifact_meta,assets,published_at)
      values (gen_random_uuid(), v_t, v_ver, '$NK-fp', '{"components":[]}'::jsonb,
              '\\x00'::bytea, '$NK-h', '{}'::jsonb, '[]'::jsonb, now())
      returning id into snap;
    insert into public.offer_acceptances
      (id,tenant_id,snapshot_id,fingerprint,booking_id,recorded_moment,created_at)
      values (gen_random_uuid(), v_t, snap, '$NK-af', b, now(), now());
  end if;

  o := (public.open_occurrence(b,null,null)->>'occurrence_id')::uuid;
  insert into public.v295_race_fx values ('R',o);
end
\$fx\$;
select 'SEEDOK';
SQLEOF
SEEDOUT=$(psf "$SEED"); case "$SEEDOUT" in *SEEDOK*) : ;; *) abort "seed failed: $SEEDOUT";; esac
RID=$(psq "$CTX select 'V:'||(select occ::text from public.v295_race_fx where tag='R')" | tail -1); RID=${RID#V:}
case "$RID" in *-*) : ;; *) abort "could not resolve the seeded occurrence: [$RID]";; esac

# non-vacuity: it must be UNRELEASED before the race
PRE=$(psq "$CTX select 'V:'||(select count(*)::text from public.event e where e.occurrence_ref='$RID'::uuid)" | tail -1)
[ "${PRE#V:}" = "0" ] || abort "the seeded occurrence is already released"

say "== RACE-RP1 =="
say "occurrence=$RID  actor=$USER  barrier=${BARRIER}s"

mk() {
  cat <<SQLEOF
begin;
$CTX
select pg_sleep($BARRIER);
select 'RESULT:OK ' || (public.release_promise('$RID'::uuid,'race-signoff','race-clearance',null)->>'event_id');
commit;
SQLEOF
}
mk > /tmp/v295_ra_$$.sql; mk > /tmp/v295_rb_$$.sql
chmod 644 /tmp/v295_ra_$$.sql /tmp/v295_rb_$$.sql
su postgres -c "psql -X -A -t -d $DB -f /tmp/v295_ra_$$.sql" > "$OUT_A" 2>&1 & PID_A=$!
su postgres -c "psql -X -A -t -d $DB -f /tmp/v295_rb_$$.sql" > "$OUT_B" 2>&1 & PID_B=$!
wait $PID_A; wait $PID_B

OK_A=$(grep -c 'RESULT:OK' "$OUT_A" || true); OK_B=$(grep -c 'RESULT:OK' "$OUT_B" || true)
CF_A=$(grep -c 'RELEASE_ALREADY_RELEASED' "$OUT_A" || true); CF_B=$(grep -c 'RELEASE_ALREADY_RELEASED' "$OUT_B" || true)
SUCCESS=$((OK_A + OK_B)); CONFLICT=$(( (CF_A > 0 ? 1 : 0) + (CF_B > 0 ? 1 : 0) ))
EVENTS=$(psq "$CTX select 'V:'||(select count(*)::text from public.event e where e.occurrence_ref='$RID'::uuid)" | tail -1); EVENTS=${EVENTS#V:}
RELEV=$(psq "$CTX select 'V:'||(select count(*)::text from public.execution_evidence ev
   join public.event e on e.id=ev.event_ref where e.occurrence_ref='$RID'::uuid and ev.kind='released')" | tail -1); RELEV=${RELEV#V:}

say "backend A: ok=$OK_A already_released=$CF_A"
say "backend B: ok=$OK_B already_released=$CF_B"
say "events for this occurrence: $EVENTS   released-evidence rows: $RELEV"

if [ "$SUCCESS" -eq 1 ] && [ "$CONFLICT" -eq 1 ] && [ "$EVENTS" = "1" ] && [ "$RELEV" = "1" ]; then
  say "RACE-RP1 PASS: exactly one backend released the occurrence, the other was refused as RELEASE_ALREADY_RELEASED, and exactly one event with one released-evidence row exists"
  exit 0
elif [ "$SUCCESS" -eq 2 ] || [ "$EVENTS" != "1" ]; then
  say "RACE-RP1 FAIL: the occurrence materialised more than once — I-31' did not hold"
  say "--- A ---"; sed 's/^/    /' "$OUT_A"; say "--- B ---"; sed 's/^/    /' "$OUT_B"
  exit 1
elif [ "$SUCCESS" -eq 0 ]; then
  say "RACE-RP1 INDETERMINATE: neither backend succeeded — the transactions may not have interleaved. Rerun; raise BARRIER if it recurs."
  say "--- A ---"; sed 's/^/    /' "$OUT_A"; say "--- B ---"; sed 's/^/    /' "$OUT_B"
  exit 4
else
  say "RACE-RP1 FAIL: unexpected combination — success=$SUCCESS conflict=$CONFLICT events=$EVENTS released_evidence=$RELEV"
  say "--- A ---"; sed 's/^/    /' "$OUT_A"; say "--- B ---"; sed 's/^/    /' "$OUT_B"
  exit 1
fi
