#!/bin/bash
# ============================================================================
# v293 SQL proofs — WC-1 .. WC-11 + RESIDUE   (12 gates)
#
# ORDERING IS LOAD-BEARING. The runner owns migration timing: it clones ec while
# ec is still PRE-v293, captures the delegate hashes and the pg_proc census,
# applies the migration INSIDE the clone, then runs every claim. WC-9 (delegate
# immutability) and RESIDUE (+2 exactly) are impossible if ec is migrated first.
#
# Outcomes: PASS / FAIL / UNPROVEN. Only FAIL and UNPROVEN are non-clean; both
# block. ABORT is a wrong-state clone and is distinct from a failed claim.
# Exit: 0 clean · 1 FAIL or UNPROVEN · 2 ABORT · 3 cleanup failure · 130 signal
#
# Run: sudo bash proofs/v293_proofs.sh [migration.sql]
# ============================================================================
set -u
MIG="${1:-supabase/v293_work_ceremonies.sql}"
DB="v293_proof_$$"
TMPSQL=""
PASS=0; FAIL=0; UNPROVEN=0; CLEAN_FAIL=0

say() { printf '%s\n' "$*"; }

cleanup() {
  local rc=$?
  if [ -n "$TMPSQL" ]; then
    rm -f "$TMPSQL"
    [ -e "$TMPSQL" ] && { say "CLEANUP-FAIL: temp file remains: $TMPSQL"; CLEAN_FAIL=1; }
  fi
  local out still
  out=$(su postgres -c "dropdb --if-exists $DB" 2>&1)
  [ -n "$out" ] && { say "CLEANUP-FAIL: dropdb reported: $out"; CLEAN_FAIL=1; }
  still=$(su postgres -c "psql -X -A -t -d postgres -c \"select count(*) from pg_database where datname='$DB'\"" 2>&1 | tail -1)
  if [ "$still" != "0" ]; then
    say "CLEANUP-FAIL: clone $DB still present (count=[$still])"; CLEAN_FAIL=1
  else
    say "cleanup: clone $DB confirmed removed"
  fi
  if [ "$CLEAN_FAIL" -ne 0 ]; then say "CLEANUP FAILED"; [ "$rc" -eq 0 ] && rc=3; fi
  exit "$rc"
}
on_signal() { say ""; say "INTERRUPTED by signal — attempting cleanup"; exit 130; }
trap on_signal INT TERM HUP
trap cleanup EXIT

psq() { su postgres -c "psql -X -A -t -v ON_ERROR_STOP=1 -d $DB -c \"$1\"" 2>&1; }
psf() { su postgres -c "psql -X -A -t -v ON_ERROR_STOP=1 -d $DB -f '$1'" 2>&1; }

# Scalar read WITH identity. CTX emits its own result row, so a sentinel plus
# tail -1 is required — a bare read returns the set_config row.
psc() {
  local o
  o=$(psq "$CTX select 'V:'||coalesce(($1)::text,'<null>')" | tail -1)
  case "$o" in V:*) printf '%s\n' "${o#V:}";; *) printf '%s\n' "PROBE-MISREAD[$o]";; esac
}
# Scalar read under an ARBITRARY identity (used for the unauthorized probe).
pscid() {
  local o
  o=$(psq "select set_config('app.user_id','$1',false),
                  set_config('request.jwt.claim.sub','$1',false);
           select 'V:'||coalesce(($2)::text,'<null>')" | tail -1)
  case "$o" in V:*) printf '%s\n' "${o#V:}";; *) printf '%s\n' "PROBE-MISREAD[$o]";; esac
}

# Refusal probe. Runs a statement inside a trapped DO block and echoes sqlerrm,
# or NO_REFUSAL. Written to a temp file: dollar-quoting cannot survive two
# levels of bash string nesting (the D1 defect from v292d1).
refusal() {  # $1 = identity uid, $2 = statement to perform
  local o
  cat > "$TMPSQL" <<SQLEOF
select set_config('app.user_id','$1',false),
       set_config('request.jwt.claim.sub','$1',false);
do \$probe\$
begin
  perform $2;
  raise notice 'PROBE:NO_REFUSAL';
exception when others then
  raise notice 'PROBE:%', sqlerrm;
end
\$probe\$;
SQLEOF
  o=$(psf "$TMPSQL" | grep -o 'PROBE:.*' | tail -1)
  printf '%s\n' "${o#PROBE:}"
}

claim()    { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); say "$1 PASS"
             else FAIL=$((FAIL+1)); say "$1 FAIL expected=[$2] actual=[$3] ${4:-}"; fi; }
contains() { case "$3" in *"$2"*) PASS=$((PASS+1)); say "$1 PASS";;
             *) FAIL=$((FAIL+1)); say "$1 FAIL expected to contain=[$2] actual=[$3] ${4:-}";; esac; }
unproven() { UNPROVEN=$((UNPROVEN+1)); say "$1 UNPROVEN — $2"; }
abort()    { say "ABORT: $*"; exit 2; }

[ -f "$MIG" ] || abort "migration file not found: $MIG"
TMPSQL=$(mktemp /tmp/v293_probe_XXXXXX.sql) || abort "cannot create temp file"
chmod 644 "$TMPSQL"

su postgres -c "dropdb --if-exists $DB" >/dev/null 2>&1
su postgres -c "createdb -T ec $DB" || abort "cannot clone ec"

# ── Preconditions ───────────────────────────────────────────────────────────
say "== preconditions =="
WRAPPERS=$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public'
                  and p.proname in ('claim_responsibility','complete_responsibility')" | tail -1)
[ "$WRAPPERS" = "0" ] || abort "clone already contains a v293 wrapper (count=$WRAPPERS)"
for d in action_actor is_active_member transfer_responsibility_ownership record_execution_evidence; do
  [ "$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.prokind='f' and p.proname='$d'" | tail -1)" != "0" ] \
    || abort "delegate missing from clone: $d"
done
say "preconditions ok"

# ── Baselines ───────────────────────────────────────────────────────────────
hashof() { psq "select md5(pg_get_functiondef(p.oid)) from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.proname='$1' order by p.oid limit 1" | tail -1; }
H_OWN_BEFORE=$(hashof transfer_responsibility_ownership)
H_EVI_BEFORE=$(hashof record_execution_evidence)
PROC_BEFORE=$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public'" | tail -1)

# ── Apply the migration inside the clone ────────────────────────────────────
MIGOUT=$(psf "$MIG")
case "$MIGOUT" in *ERROR*) abort "migration failed inside clone: $MIGOUT";; esac
[ "$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public'
            and p.proname in ('claim_responsibility','complete_responsibility')" | tail -1)" = "2" ] \
  || abort "migration applied but both wrappers are not present"
say "migration applied inside clone"

# ── Identity ────────────────────────────────────────────────────────────────
TU=$(psq "select tu.tenant_id||' '||tu.user_id from public.tenant_users tu
          where tu.active order by tu.tenant_id limit 1" | tail -1)
TENANT=${TU%% *}; USER=${TU##* }
CTX="select set_config('app.user_id','$USER',false),
            set_config('request.jwt.claim.sub','$USER',false);"
ORPHAN=$(psq "select gen_random_uuid()::text" | tail -1)
say "harness: tenant=$TENANT actor=$USER orphan=$ORPHAN"
[ "$(psc "public.is_active_member()")" = "true" ] || abort "harness identity is not an active member"
[ "$(pscid "$ORPHAN" "public.is_active_member()")" = "false" ] || abort "orphan uid resolves as an active member"

# ── Fixtures ────────────────────────────────────────────────────────────────
# Standing responsibilities per the lawful v286 SC-3 / v287b pattern: knowledge
# origin, pinned revision, no event anchor. Deterministic natural keys so ids
# can be resolved back without returning them from a DO block.
cat > "$TMPSQL" <<SQLEOF
$CTX
do \$fx\$
declare v_t uuid := '$TENANT'; b uuid; occ uuid; ev uuid;
begin
  insert into public.obligation (tenant_id,event_ref,scope,origin_ref,origin_kind,
    origin_revision,kind,department,required_outcome,natural_key,timing)
  values
   (v_t,null,'standing',gen_random_uuid(),'knowledge',gen_random_uuid(),
    'prep','culinary','v293 unowned','v293_unowned',
    jsonb_build_object('window_end',(now()+interval '6 hours')::text)),
   (v_t,null,'standing',gen_random_uuid(),'knowledge',gen_random_uuid(),
    'prep','culinary','v293 owned','v293_owned',
    jsonb_build_object('window_end',(now()+interval '6 hours')::text)),
   (v_t,null,'standing',gen_random_uuid(),'knowledge',gen_random_uuid(),
    'prep','culinary','v293 complete','v293_complete',
    jsonb_build_object('window_end',(now()+interval '6 hours')::text)),
   (v_t,null,'standing',gen_random_uuid(),'knowledge',gen_random_uuid(),
    'prep','culinary','v293 dup','v293_dup',
    jsonb_build_object('window_end',(now()+interval '6 hours')::text)),
   (v_t,null,'standing',gen_random_uuid(),'knowledge',gen_random_uuid(),
    'stage','equipment','v293 standing complete','v293_standing',
    jsonb_build_object('window_end',(now()+interval '6 hours')::text)),
   (v_t,null,'standing',gen_random_uuid(),'knowledge',gen_random_uuid(),
    'prep','culinary','v293 lapsed','v293_lapsed',
    jsonb_build_object('window_end',(now()-interval '6 hours')::text)),
   (v_t,null,'standing',gen_random_uuid(),'knowledge',gen_random_uuid(),
    'prep','culinary','v293 unauth','v293_unauth',
    jsonb_build_object('window_end',(now()+interval '6 hours')::text));

  -- an event-scoped responsibility, via the certified release path's own
  -- derivation (v287b harness pattern)
  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_t,'v293fx','V293-'||substr(gen_random_uuid()::text,1,10),'active')
    returning id into b;
  insert into public.engagement_occurrence (tenant_id,booking_id,ordinal,opened_by)
    values (v_t,b,1,'v293fx') returning id into occ;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,
    origin_commitment_ref,released_by)
    values (v_t,b,occ,gen_random_uuid(),'v293fx') returning id into ev;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    values (v_t,ev,'released','v293fx','{}'::jsonb);
  perform public.derive_responsibilities(ev);
end
\$fx\$;
SQLEOF
FXOUT=$(psf "$TMPSQL")
case "$FXOUT" in *ERROR*) abort "fixtures failed: $FXOUT";; esac

rid() { psc "(select o.id from public.obligation o where o.natural_key='$1')"; }
R_UNOWNED=$(rid v293_unowned); R_OWNED=$(rid v293_owned)
R_COMPLETE=$(rid v293_complete); R_DUP=$(rid v293_dup)
R_STANDING=$(rid v293_standing); R_LAPSED=$(rid v293_lapsed)
R_UNAUTH=$(rid v293_unauth)
R_EVENT=$(psc "(select o.id from public.obligation o
                 join public.event e on e.id=o.event_ref
                where e.released_by='v293fx' order by o.natural_key limit 1)")
case "$R_EVENT" in ''|'<null>'|PROBE-MISREAD*) abort "event-scoped fixture produced no obligation: [$R_EVENT]";; esac
ABSENT=$(psq "select gen_random_uuid()::text" | tail -1)
say "fixtures ok"

# ══ WC-10 · shape, before anything mutates ═════════════════════════════════
claim WC-10 "v|true|search_path=public|v|true|search_path=public" \
"$(psc "(select string_agg(p.provolatile::text||'|'||p.prosecdef::text||'|'||
          coalesce(array_to_string(p.proconfig,','),'(none)'), '|' order by p.proname)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in ('claim_responsibility','complete_responsibility'))")" \
"both wrappers must be VOLATILE, SECURITY DEFINER, search_path pinned"

# ══ WC-1 · actor is derived, and no parameter can carry one ════════════════
ARGS=$(psc "(select string_agg(p.proname||'/'||p.pronargs::text, ',' order by p.proname)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in ('claim_responsibility','complete_responsibility'))")
CLAIM1=$(psc "public.claim_responsibility('$R_UNOWNED'::uuid)->>'owner'")
LEDGER1=$(psc "(select ro.owner||'/'||ro.actor from public.responsibility_owner ro
                 where ro.responsibility_ref='$R_UNOWNED'::uuid order by ro.seq desc limit 1)")
claim WC-1 "claim_responsibility/1,complete_responsibility/2|$USER|$USER/$USER" \
           "$ARGS|$CLAIM1|$LEDGER1" \
  "signatures admit no actor parameter; owner and actor are the session's own"

# ══ WC-2 · assign from unowned ═════════════════════════════════════════════
claim WC-2 "assign|$USER|1" \
"$(psc "(select ro.action||'|'||ro.owner||'|'||count(*) over () from public.responsibility_owner ro
          where ro.responsibility_ref='$R_UNOWNED'::uuid order by ro.seq desc limit 1)")" \
  "a claim from unowned records exactly one assign"

# ══ WC-3 · claiming an owned row refuses, and writes nothing ═══════════════
psc "public.claim_responsibility('$R_OWNED'::uuid)" >/dev/null
BEFORE3=$(psc "(select count(*) from public.responsibility_owner where responsibility_ref='$R_OWNED'::uuid)")
ERR3=$(refusal "$USER" "public.claim_responsibility('$R_OWNED'::uuid)")
AFTER3=$(psc "(select count(*) from public.responsibility_owner where responsibility_ref='$R_OWNED'::uuid)")
contains WC-3 "OWNERSHIP_CONFLICT" "$ERR3" "claiming an owned row must refuse via the certified CAS"
claim WC-3b "$BEFORE3" "$AFTER3" "a refused claim must write nothing"

# ══ WC-4 · no active membership ⇒ refusal, nothing written ═════════════════
LB4=$(psc "(select count(*) from public.responsibility_owner)")
EB4=$(psc "(select count(*) from public.execution_evidence)")
ERR4A=$(refusal "$ORPHAN" "public.claim_responsibility('$R_UNAUTH'::uuid)")
ERR4B=$(refusal "$ORPHAN" "public.complete_responsibility('$R_UNAUTH'::uuid)")
LA4=$(psc "(select count(*) from public.responsibility_owner)")
EA4=$(psc "(select count(*) from public.execution_evidence)")
contains WC-4 "WORK_NOT_AUTHORIZED" "$ERR4A" "unauthorized claim"
contains WC-4b "WORK_NOT_AUTHORIZED" "$ERR4B" "unauthorized completion"
claim WC-4c "$LB4|$EB4" "$LA4|$EA4" "an unauthorized attempt must write nothing"

# ══ WC-5 · completion recorded, discharged derived ═════════════════════════
psc "public.complete_responsibility('$R_COMPLETE'::uuid, jsonb_build_object('verb','Made'))" >/dev/null
claim WC-5 "1|completion|$USER|discharged" \
"$(psc "(select count(*)::text||'|'||max(e.kind)||'|'||max(e.actor)||'|'||
          public.responsibility_state('$R_COMPLETE'::uuid)
   from public.execution_evidence e
  where e.obligation_ref='$R_COMPLETE'::uuid and e.kind='completion')")" \
  "one completion fact, actor derived, state derived discharged"

# ══ WC-6 · duplicate completion refused (recorded decision) ════════════════
psc "public.complete_responsibility('$R_DUP'::uuid)" >/dev/null
ERR6=$(refusal "$USER" "public.complete_responsibility('$R_DUP'::uuid)")
contains WC-6 "COMPLETION_ALREADY_RECORDED" "$ERR6" "the wrapper's duplicate guard"
claim WC-6b "1" \
"$(psc "(select count(*) from public.execution_evidence
          where obligation_ref='$R_DUP'::uuid and kind='completion')")" \
  "exactly one completion fact survives a duplicate attempt"

# ══ WC-7 · standing and event-scoped both complete ════════════════════════
psc "public.complete_responsibility('$R_STANDING'::uuid)" >/dev/null
psc "public.complete_responsibility('$R_EVENT'::uuid)" >/dev/null
claim WC-7 "<null>|discharged|discharged" \
"$(psc "(select coalesce((select o.event_ref::text from public.obligation o
                           where o.id='$R_STANDING'::uuid),'<null>')||'|'||
          public.responsibility_state('$R_STANDING'::uuid)||'|'||
          public.responsibility_state('$R_EVENT'::uuid))")" \
  "a standing row has no event anchor and still completes; so does an event-scoped row"

# ══ WC-8 · absent responsibility: not-found, no leak, nothing written ══════
LB8=$(psc "(select count(*) from public.responsibility_owner)")
EB8=$(psc "(select count(*) from public.execution_evidence)")
ERR8A=$(refusal "$USER" "public.claim_responsibility('$ABSENT'::uuid)")
ERR8B=$(refusal "$USER" "public.complete_responsibility('$ABSENT'::uuid)")
LA8=$(psc "(select count(*) from public.responsibility_owner)")
EA8=$(psc "(select count(*) from public.execution_evidence)")
contains WC-8 "RESP_NOT_FOUND" "$ERR8A" "claim on an absent row"
contains WC-8b "CEREMONY_NOT_FOUND" "$ERR8B" "completion on an absent row"
claim WC-8c "$LB8|$EB8" "$LA8|$EA8" "a not-found attempt must write nothing"

# ══ WC-9 · delegates byte-identical ═══════════════════════════════════════
claim WC-9 "$H_OWN_BEFORE|$H_EVI_BEFORE" "$(hashof transfer_responsibility_ownership)|$(hashof record_execution_evidence)" \
  "transfer_responsibility_ownership and record_execution_evidence must be untouched"

# ══ WC-11 · a lapsed row completes and derives discharged ═════════════════
PRE11=$(psc "public.responsibility_state('$R_LAPSED'::uuid)")
if [ "$PRE11" != "lapsed" ]; then
  unproven WC-11 "fixture did not reach 'lapsed' (state=$PRE11); the late-completion path cannot be exercised"
else
  psc "public.complete_responsibility('$R_LAPSED'::uuid)" >/dev/null
  claim WC-11 "lapsed|discharged" "$PRE11|$(psc "public.responsibility_state('$R_LAPSED'::uuid)")" \
    "completion evidence precedes the lapse test — late completion is lawful"
fi

# ══ RESIDUE · exactly two new functions ═══════════════════════════════════
PROC_AFTER=$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public'" | tail -1)
claim RESIDUE "$((PROC_BEFORE + 2))" "$PROC_AFTER" "the migration must add exactly two functions"

say "----------------------------------------"
say "v293 SQL proofs: $PASS PASS / $FAIL FAIL / $UNPROVEN UNPROVEN  (18 gates expected)"
if [ "$FAIL" -eq 0 ] && [ "$UNPROVEN" -eq 0 ] && [ "$PASS" -eq 18 ]; then exit 0; else exit 1; fi
