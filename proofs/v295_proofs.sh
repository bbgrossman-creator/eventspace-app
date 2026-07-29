#!/usr/bin/env bash
# ============================================================================
# v295 SQL proofs — RP-1..RP-14 + RESIDUE  (15 gates)
#
# Runner owns migration timing: clones a pre-v295 ec, captures the delegate hash
# and pg_proc census, applies the migration INSIDE the clone. RP-13 and RESIDUE
# are impossible if ec is migrated first.
#
# CLOCK: refresh_now() after any write whose effect is observed — milestone and
# attendance resolution is bounded by recorded_at <= p_now.
# REASONS: every promise ceremony that replaces a value raises
# PROMISE_REASON_REQUIRED, so all fixture reasons are non-null.
# FIXTURES: offer_snapshots / offer_acceptances columns are host-verified; no
# information_schema discovery is used for them.
#
# Exit: 0 clean · 1 FAIL/UNPROVEN · 2 ABORT · 3 cleanup failure · 130 signal
# Run:  sudo bash proofs/v295_proofs.sh [supabase/v295_release_ceremony.sql]
# ============================================================================
set -u
MIG="${1:-supabase/v295_release_ceremony.sql}"
DB="v295_proof_$$"; TMPSQL=""
PASS=0; FAIL=0; UNPROVEN=0; CLEAN_FAIL=0

say() { printf '%s\n' "$*"; }
cleanup() {
  local rc=$?
  [ -n "$TMPSQL" ] && rm -f "$TMPSQL"
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
psf() { su postgres -c "psql -X -A -t -v ON_ERROR_STOP=1 -d $DB -f '$1'" 2>&1; }
psc() { local o; o=$(psq "$CTX select 'V:'||coalesce(($1)::text,'<null>')" | tail -1)
        case "$o" in V:*) printf '%s\n' "${o#V:}";; *) printf '%s\n' "PROBE-MISREAD[$o]";; esac; }
refusal() {  # $1 identity uid, $2 statement — echoes sqlerrm or NO_REFUSAL
  cat > "$TMPSQL" <<SQLEOF
select set_config('app.user_id','$1',false), set_config('request.jwt.claim.sub','$1',false);
do \$probe\$
begin
  perform $2;
  raise notice 'PROBE:NO_REFUSAL';
exception when others then raise notice 'PROBE:%', sqlerrm;
end
\$probe\$;
SQLEOF
  local o; o=$(psf "$TMPSQL" | grep -o 'PROBE:.*' | tail -1); printf '%s\n' "${o#PROBE:}"
}
claim()    { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); say "$1 PASS"
             else FAIL=$((FAIL+1)); say "$1 FAIL expected=[$2] actual=[$3] ${4:-}"; fi; }
contains() { case "$3" in *"$2"*) PASS=$((PASS+1)); say "$1 PASS";;
             *) FAIL=$((FAIL+1)); say "$1 FAIL expected to contain=[$2] actual=[$3] ${4:-}";; esac; }
unproven() { UNPROVEN=$((UNPROVEN+1)); say "$1 UNPROVEN — $2"; }
abort()    { say "ABORT: $*"; exit 2; }

[ -f "$MIG" ] || abort "migration not found: $MIG"
TMPSQL=$(mktemp /tmp/v295_XXXXXX.sql); chmod 644 "$TMPSQL"
su postgres -c "dropdb --if-exists $DB" >/dev/null 2>&1
su postgres -c "createdb -T ec $DB" || abort "cannot clone ec"

[ "$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='release_promise'" | tail -1)" = "0" ] \
  || abort "clone already carries v295"
hashof() { psq "select md5(pg_get_functiondef(p.oid)) from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.proname='$1' order by p.oid limit 1" | tail -1; }
H_REL_BEFORE=$(hashof release_occurrence)
PROC_BEFORE=$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" | tail -1)

MIGOUT=$(psf "$MIG"); case "$MIGOUT" in *ERROR*) abort "migration failed: $MIGOUT";; esac
say "migration applied inside clone"

TU=$(psq "select tu.tenant_id||' '||tu.user_id from public.tenant_users tu where tu.active order by tu.tenant_id limit 1" | tail -1)
TENANT=${TU%% *}; USER=${TU##* }
CTX="select set_config('app.user_id','$USER',false), set_config('request.jwt.claim.sub','$USER',false);"
ORPHAN=$(psq "select gen_random_uuid()::text" | tail -1)
ABSENT=$(psq "select gen_random_uuid()::text" | tail -1)
say "harness: tenant=$TENANT actor=$USER"
[ "$(psc "public.is_active_member()")" = "true" ] || abort "harness identity is not an active member"

# ── fixtures ───────────────────────────────────────────────────────────────
# Bookings FA..FF. An acceptance is created ONLY where a limb of the predicate
# must be satisfied; its absence is itself a fixture (RP-3).
#   FA no acceptance            -> RP-3 commitment refusal
#   FB acceptance, no refs      -> RP-4 clearance refusal, then RP-5 sign_off
#   FC acceptance               -> RP-6 waiver satisfies clearance
#   FD acceptance               -> RP-7 success, RP-8 already-released, RP-12 queue exit
#   FE acceptance, INCOMPLETE   -> RP-11 incomplete release is lawful
#   FF cancelled                -> RP-9
# offer_snapshots.version_id reuses an existing snapshot's value when one exists,
# so a foreign key on that column cannot make the fixture fail.
cat > "$TMPSQL" <<SQLEOF
$CTX
create table if not exists public.v295_fx(tag text primary key, occ uuid, booking uuid);
do \$fx\$
declare
  v_t uuid := '$TENANT'; b uuid; o uuid; v_acc_book uuid; v_ver uuid; snap uuid; tag text;
begin
  -- ── the accepted booking ────────────────────────────────────────────────
  -- release_occurrence resolves the acceptance BY BOOKING and materialises the
  -- event PER OCCURRENCE, so ONE unrescinded acceptance lawfully backs every
  -- occurrence opened on that booking. Preferred path therefore creates NOTHING
  -- in the offer tables — which is what the real constraints demand:
  --   offer_snapshots.version_id  UNIQUE + FK -> proposal_versions(id)
  --   offer_acceptances.snapshot_id UNIQUE + FK -> offer_snapshots(id)
  -- A fabricated version_id is unlawful, and one snapshot cannot back several
  -- acceptances. Reuse of an existing accepted booking sidesteps both.
  select a.booking_id into v_acc_book
    from public.offer_acceptances a
    left join public.acceptance_rescissions r on r.acceptance_id = a.id
   where a.tenant_id = v_t and r.id is null
   order by a.created_at
   limit 1;

  if v_acc_book is null then
    -- Fallback: an unused proposal_version can lawfully back exactly one new
    -- snapshot (UNIQUE), which can back exactly one new acceptance (UNIQUE).
    select pv.id into v_ver
      from public.proposal_versions pv
     where not exists (select 1 from public.offer_snapshots s where s.version_id = pv.id)
     limit 1;
    if v_ver is null then
      raise exception 'V295_FIXTURE_UNSATISFIABLE: no unrescinded acceptance exists for this tenant and no unused proposal_versions row is available to lawfully create one. Seed a proposal version or an acceptance; the claims must not be weakened.';
    end if;
    insert into public.bookings (tenant_id,contact_name,invoice_num,status)
      values (v_t,'V295-ACC','V295ACC-'||substr(gen_random_uuid()::text,1,8),'active')
      returning id into v_acc_book;
    insert into public.offer_snapshots
      (id,tenant_id,version_id,fingerprint,model,artifact_bytes,artifact_hash,artifact_meta,assets,published_at)
      values (gen_random_uuid(), v_t, v_ver, 'v295-fp-'||substr(gen_random_uuid()::text,1,10),
              '{"components":[]}'::jsonb, '\\x00'::bytea, 'v295-h', '{}'::jsonb, '[]'::jsonb, now())
      returning id into snap;
    insert into public.offer_acceptances
      (id,tenant_id,snapshot_id,fingerprint,booking_id,recorded_moment,created_at)
      values (gen_random_uuid(), v_t, snap, 'v295-af-'||substr(gen_random_uuid()::text,1,10),
              v_acc_book, now(), now());
  end if;

  -- FB..FE · four occurrences on the ACCEPTED booking. The commitment limb is
  -- satisfied for all four by that single acceptance; each releases (or refuses)
  -- independently because the event is keyed on the occurrence.
  foreach tag in array array['FB','FC','FD','FE'] loop
    o := (public.open_occurrence(v_acc_book,null,null)->>'occurrence_id')::uuid;
    insert into public.v295_fx values (tag,o,v_acc_book);
  end loop;

  -- FA · a booking with NO acceptance at all -> the commitment refusal (RP-3)
  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_t,'V295-A','V295A-'||substr(gen_random_uuid()::text,1,8),'active') returning id into b;
  o := (public.open_occurrence(b,null,null)->>'occurrence_id')::uuid;
  insert into public.v295_fx values ('FA',o,b);

  -- FF · cancelled (RP-9)
  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_t,'V295-F','V295F-'||substr(gen_random_uuid()::text,1,8),'active') returning id into b;
  o := (public.open_occurrence(b,null,null)->>'occurrence_id')::uuid;
  perform public.cancel_occurrence(p_occurrence=>o, p_reason=>'v295 fixture');
  insert into public.v295_fx values ('FF',o,b);
end
\$fx\$;
select 'FXOK';
SQLEOF
FXOUT=$(psf "$TMPSQL"); case "$FXOUT" in *FXOK*) : ;; *) abort "fixtures failed: $FXOUT";; esac
fx() { psc "(select occ::text from public.v295_fx where tag='$1')"; }
FA=$(fx FA); FB=$(fx FB); FC=$(fx FC); FD=$(fx FD); FE=$(fx FE); FF=$(fx FF)
for v in FA FB FC FD FE FF; do eval "val=\$$v"; case "$val" in *-*) : ;; *) abort "fixture $v unresolved: [$val]";; esac; done
say "fixtures ok"

SIG='(select count(*) from public.event)||"/"||(select count(*) from public.execution_evidence)'
SIG=$(printf '%s' "$SIG" | tr '"' "'")
sig() { psc "$SIG"; }

# ══ RP-14 · shape, before anything mutates ════════════════════════════════
claim RP-14 "v|true|search_path=public" \
"$(psc "(select p.provolatile::text||'|'||p.prosecdef::text||'|'||coalesce(array_to_string(p.proconfig,','),'-')
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='release_promise')")" \
  "the wrapper must be VOLATILE, SECURITY DEFINER, search_path pinned"

# ══ RP-2 · authorization ══════════════════════════════════════════════════
S0=$(sig)
ERR2=$(refusal "$ORPHAN" "public.release_promise('$FD'::uuid,'sig','clr',null)")
contains RP-2 "PROMISE_NOT_AUTHORIZED" "$ERR2" "a session without active membership must be refused"
claim RP-2b "$S0" "$(sig)" "an unauthorized attempt must write nothing"

# ══ RP-3/4/5 · each predicate limb, reachable THROUGH the wrapper ══════════
contains RP-3 "RELEASE_PREDICATE_UNSATISFIED" \
  "$(refusal "$USER" "public.release_promise('$FA'::uuid,'sig','clr',null)")" \
  "no unrescinded acceptance must refuse on the commitment limb"
contains RP-4 "clearance" \
  "$(refusal "$USER" "public.release_promise('$FB'::uuid,'sig',null,null)")" \
  "acceptance present but no clearance and no waiver must refuse on clearance"
contains RP-5 "sign_off" \
  "$(refusal "$USER" "public.release_promise('$FB'::uuid,null,'clr',null)")" \
  "acceptance and clearance present but no sign-off must refuse on sign_off"

# ══ RP-6 · a waiver satisfies the clearance limb ══════════════════════════
claim RP-6 "true" \
"$(psc "(public.release_promise('$FC'::uuid,'sig-c',null,'waiver-c')->>'event_id' is not null)::text")" \
  "a waiver ref must satisfy the clearance limb in place of a clearance ref"

# ══ RP-1 · actor derived, and no parameter admits one ═════════════════════
R7=$(psc "(public.release_promise('$FD'::uuid,'sig-d','clr-d',null)->>'event_id')")
claim RP-1 "release_promise/4|$USER|$USER" \
"$(psc "(select p.proname||'/'||p.pronargs::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='release_promise')")|$(psc "(select e.released_by from public.event e where e.id='$R7'::uuid)")|$(psc "(select ev.actor from public.execution_evidence ev where ev.event_ref='$R7'::uuid and ev.kind='released' limit 1)")" \
  "the signature admits no actor; released_by and the released-evidence actor are the session's own"

# ══ RP-7 · one event, three evidence facts ════════════════════════════════
claim RP-7 "1|1|1|1" \
"$(psc "((select count(*) from public.event e where e.occurrence_ref='$FD'::uuid)::text||'|'||
   (select count(*) from public.execution_evidence ev where ev.event_ref='$R7'::uuid and ev.kind='released')::text||'|'||
   (select count(*) from public.execution_evidence ev where ev.event_ref='$R7'::uuid and ev.kind='sign_off')::text||'|'||
   (select count(*) from public.execution_evidence ev where ev.event_ref='$R7'::uuid and ev.kind='clearance')::text)")" \
  "exactly one event and one each of released / sign_off / clearance evidence"

# ══ RP-8 · once only (I-31') ══════════════════════════════════════════════
contains RP-8 "RELEASE_ALREADY_RELEASED" \
  "$(refusal "$USER" "public.release_promise('$FD'::uuid,'sig-d2','clr-d2',null)")" \
  "a second release must refuse"
claim RP-8b "1" "$(psc "(select count(*) from public.event e where e.occurrence_ref='$FD'::uuid)")" \
  "still exactly one event after the refused second attempt"

# ══ RP-11 · an INCOMPLETE occurrence releases lawfully (v292a) ════════════
M11=$(psc "(jsonb_array_length(public.projection_occurrence_brief('$FE'::uuid, now())->'data'->'completeness'->'missing'))")
if [ "$M11" = "0" ] || [ "$M11" = "<null>" ]; then
  unproven RP-11 "fixture FE is not incomplete (missing=$M11); the v292a claim cannot be exercised"
else
  claim RP-11 "true" \
  "$(psc "(public.release_promise('$FE'::uuid,'sig-e','clr-e',null)->>'event_id' is not null)::text")" \
    "an occurrence with $M11 missing facts must release — completeness never gates release"
fi

# ══ RP-12 · the released occurrence leaves the Preparation Queue ══════════
claim RP-12 "1|0" \
"$(psc "((select count(*) from jsonb_array_elements(public.projection_preparation_queue(now())->'data'->'occurrences') r
           where r->>'occurrence'='$FB')::text||'|'||
   (select count(*) from jsonb_array_elements(public.projection_preparation_queue(now())->'data'->'occurrences') r
           where r->>'occurrence'='$FD')::text)")" \
  "an unreleased occurrence remains a member; the released one leaves by derivation (v294's exit condition)"

# ══ RP-9 · cancelled ══════════════════════════════════════════════════════
S9=$(sig)
contains RP-9 "OCCURRENCE_CANCELLED" \
  "$(refusal "$USER" "public.release_promise('$FF'::uuid,'sig','clr',null)")" \
  "a cancelled occurrence must refuse"
claim RP-9b "$S9" "$(sig)" "a refused cancelled release must write nothing"

# ══ RP-10 · absent / foreign ══════════════════════════════════════════════
S10=$(sig)
contains RP-10 "CEREMONY_NOT_FOUND" \
  "$(refusal "$USER" "public.release_promise('$ABSENT'::uuid,'sig','clr',null)")" \
  "an absent occurrence must refuse as not-found — no existence leak"
claim RP-10b "$S10" "$(sig)" "a not-found attempt must write nothing"

# ══ RP-13 · delegate untouched ════════════════════════════════════════════
claim RP-13 "$H_REL_BEFORE" "$(hashof release_occurrence)" \
  "release_occurrence must be byte-identical before and after the migration"

# ══ RESIDUE ═══════════════════════════════════════════════════════════════
psq "drop table if exists public.v295_fx" >/dev/null 2>&1
claim RESIDUE "$((PROC_BEFORE + 1))" \
"$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" | tail -1)" \
  "the migration must add exactly one function"

say "----------------------------------------"
say "v295 SQL proofs: $PASS PASS / $FAIL FAIL / $UNPROVEN UNPROVEN  (19 gates)"
say "  15 frozen claims RP-1..RP-14 + RESIDUE; four carry a paired"
say "  'nothing was written' assertion (RP-2b/8b/9b/10b), hence 19 gates."
if [ "$FAIL" -eq 0 ] && [ "$UNPROVEN" -eq 0 ] && [ "$PASS" -eq 19 ]; then
  say "RESULT: 19/19 PASS. SQL clone certification clean."; exit 0
else say "RESULT: blocked."; exit 1; fi
