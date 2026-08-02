#!/usr/bin/env bash
# ============================================================================
# v297 — Venue As-Of Integrity Corrective · ONE-SHOT PROOF RUNNER
#
# AF-1..AF-20 + RESIDUE, per v297_FROZEN_CONTRACT.md (Amendments A–D).
#
# The runner owns migration timing: it clones ec, captures PRE state, applies
# supabase/v297_venue_asof_integrity.sql, then captures POST. The clone must be
# pre-corrective; if ec already carries the marker the run aborts (v295 lesson).
#
# FIXTURE LAW discovered from the captured ceremonies:
#   · bindings CANNOT be future-dated (bind_* insert without created_at/recorded_at,
#     so the column DEFAULT always wins) — the as-of boundary is bracketed by
#     MOVING p_now around the recorded timestamp, never by writing a future row
#   · walkthroughs and observations CAN be future-dated (p_conducted_at /
#     p_observed_at are caller-supplied with no default)
#   · every fixture fact is written through a real ceremony under a real tenant
#     member identity — no hand-built rows except the documented redirect in AF-17
#
# Run:  bash proofs/v297_proofs.sh
# Exit: 0 all PASS · 1 any FAIL
# ============================================================================
set -uo pipefail
# --- privileged access: ec/lib/pg.sh is the ONLY path to PostgreSQL ----------
. "${EC_LIB_PG:-ec/lib/pg.sh}"
pg_require                      # noninteractive capability gate; never prompts
# ---------------------------------------------------------------------------

CLONE="ec_v297_$$"
MIG="supabase/v297_venue_asof_integrity.sql"
PASS=0; FAIL=0
declare -a FAILED

ok()   { PASS=$((PASS+1)); printf '  PASS  %-10s %s\n' "$1" "$2"; }
bad()  { FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  FAIL  %-10s %s\n' "$1" "$2"; }
chk()  { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

# NB: psql -A -t still emits the command tag (INSERT 0 1) on stdout, so every
# helper strips tags — without this, "returning id" yields "<uuid>\nINSERT 0 1"
# and every downstream interpolation is malformed (found by the local replica).
notag() { grep -vE '^(INSERT|UPDATE|DELETE|SELECT|COPY) [0-9]+' | grep -v '^$'; }
q()  { pg_q "$CLONE" "$1"; }
# identity-bearing query: both GUCs, same invocation (the recurring harness lesson)
qi() { pg_q "$CLONE" "select set_config('app.user_id','$UID_','f'), set_config('request.jwt.claim.sub','$UID_','f'); $1" | tail -n +2; }

cleanup() { pg_drop "$CLONE"; }
trap cleanup EXIT

echo "== v297 one-shot =="

# ── clone, and refuse a post-corrective source ─────────────────────────────
PRE_MARK=$(pg_q ec "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='venue_asof_integrity'")
if [ "$PRE_MARK" != "0" ]; then
  echo "ABORT: ec already carries venue_asof_integrity ($PRE_MARK) — clone would be"
  echo "       post-corrective and every AF claim would be vacuous. Use --verify."
  exit 1
fi
pg_drop "$CLONE"
pg_clone ec "$CLONE" || { echo "ABORT: clone failed (active connections to ec?)"; exit 1; }
echo "clone: $CLONE (pre-corrective, marker absent)"

# ── identity: discover a real active tenant member ─────────────────────────
# the real substrate is tenant_users(tenant_id,user_id,active,role); can_manage_venues
# additionally requires role in (admin,owner,manager,ops) — a member without one
# would fail every ceremony with VENUE_NOT_AUTHORIZED
UID_=$(q "select tu.user_id from public.tenant_users tu where tu.active
            and tu.role in ('admin','owner','manager','ops') order by tu.tenant_id limit 1")
TEN=$(q "select tu.tenant_id from public.tenant_users tu where tu.user_id='$UID_' and tu.active limit 1")
[ -n "$UID_" ] && [ -n "$TEN" ] || { echo "ABORT: no active tenant_users row with a venue-managing role"; exit 1; }
echo "identity: user=$UID_ tenant=$TEN"

# ── PRE-migration capture (AF-1, AF-18 control) ────────────────────────────
q "create table _pre_routines as
     select p.proname as n, pg_get_function_identity_arguments(p.oid) as a, md5(p.prosrc) as h
       from pg_proc p join pg_namespace nsp on nsp.oid=p.pronamespace
      where nsp.nspname='public' and p.prokind in ('f','p')" >/dev/null

# ── ALL-PAST fixture, built through ceremonies (AF-18 subject) ─────────────
SFX=$$
qi "
  select create_venue('AF18 Venue $SFX','fixed_facility','1 Past Lane');
" >/dev/null
V18=$(q "select id from venue where name='AF18 Venue $SFX'")
qi "
  select record_walkthrough('$V18','initial_survey', now() - interval '30 days');
" >/dev/null
W18=$(q "select id from venue_walkthrough where venue_id='$V18'")
qi "
  select record_observation('$V18','ceiling_height','quantity','{\"amount\":12,\"unit\":\"ft\"}'::jsonb,
                            'measurement', now() - interval '20 days', '$W18');
  select record_observation('$V18','dock_count','quantity','{\"amount\":2,\"unit\":\"count\"}'::jsonb,
                            'direct_observation', now() - interval '10 days', '$W18');
" >/dev/null
B18=$(q "insert into bookings (tenant_id, contact_name, invoice_num)
         values ('$TEN','AF18 $SFX','AF18-$SFX') returning id")
O18=$(q "insert into engagement_occurrence (tenant_id, booking_id, ordinal, opened_by)
         values ('$TEN','$B18',1,'proof') returning id")
qi "select bind_occurrence_venue('$O18','$V18');" >/dev/null

# non-vacuity: the fixture must actually produce content, or AF-18 proves nothing
NV_OBS=$(q "select count(*) from venue_observation where venue_id='$V18'")
NV_WT=$(q "select count(*) from venue_walkthrough where venue_id='$V18'")
NV_PROF=$(qi "select jsonb_array_length(venue_profile('$V18', now()))")
NV_BIND=$(qi "select count(*) from occurrence_current_venue('$O18', now())")
NV_FIND=$(qi "select jsonb_typeof(venue_knowledge_findings('$V18', now()))")
if [ "${NV_OBS:-0}" -lt 2 ] || [ "${NV_WT:-0}" -lt 1 ] || [ "${NV_PROF:-0}" -lt 2 ] \
   || [ "${NV_BIND:-0}" != "1" ] || [ "${NV_FIND:-x}" != "array" ]; then
  bad "AF-18pre" "fixture is VACUOUS (obs=$NV_OBS wt=$NV_WT profile=$NV_PROF binding=$NV_BIND findings=$NV_FIND) — comparison would prove nothing"
else
  ok "AF-18pre" "fixture is populated and every AF-18 read resolves"
fi

cap18() {
  local out
  out=$(qi "select coalesce((select string_agg(source||'|'||venue_id::text,',') from occurrence_current_venue('$O18', now())),'none')
      || '#' || venue_profile('$V18', now())::text
      || '#' || venue_knowledge_findings('$V18', now())::text
      || '#' || venue_verification_requirement('$V18', now())::text")
  case "$out" in *ERROR*|"") echo "CAPTURE_FAILED:$out";; *) echo "$out";; esac
}
# determinism precondition: two identical calls must agree, else byte-comparison is flaky
D1=$(cap18); D2=$(cap18)
case "$D1" in CAPTURE_FAILED*) bad "AF-18a" "pre-migration capture ERRORED — comparison would be vacuous: $D1";;
  *) chk "AF-18a" "$([ "$D1" = "$D2" ] && echo same || echo differs)" "same" "pre-migration reads are deterministic";; esac
PRE18="$D1"

# ── APPLY THE MIGRATION ────────────────────────────────────────────────────
pg_file "$CLONE" "$MIG" || { echo "ABORT: migration failed"; exit 1; }
echo "migration applied"

# ── AF-1 · exactly seven bodies changed, one added, none removed ───────────
CHANGED=$(q "select count(*) from _pre_routines r join pg_proc p on p.proname=r.n
              and pg_get_function_identity_arguments(p.oid)=r.a
              join pg_namespace nsp on nsp.oid=p.pronamespace and nsp.nspname='public'
             where md5(p.prosrc) <> r.h")
CHANGED_N=$(q "select coalesce(string_agg(distinct r.n,','order by r.n),'') from _pre_routines r join pg_proc p on p.proname=r.n
              and pg_get_function_identity_arguments(p.oid)=r.a
              join pg_namespace nsp on nsp.oid=p.pronamespace and nsp.nspname='public'
             where md5(p.prosrc) <> r.h")
chk "AF-1a" "$CHANGED" "7" "exactly seven routine bodies changed"
chk "AF-1b" "$CHANGED_N" "current_observation,occurrence_current_venue,venue_contradictions,venue_knowledge_findings,venue_profile,venue_profile_read,venue_verification_requirement" "and they are the §2 seven"
ADDED=$(q "select count(*) from pg_proc p join pg_namespace nsp on nsp.oid=p.pronamespace
            where nsp.nspname='public' and p.prokind in ('f','p')
              and not exists (select 1 from _pre_routines r where r.n=p.proname
                              and r.a=pg_get_function_identity_arguments(p.oid))")
chk "AF-1c" "$ADDED" "1" "exactly one routine added (the marker)"
REMOVED=$(q "select count(*) from _pre_routines r where not exists
             (select 1 from pg_proc p join pg_namespace nsp on nsp.oid=p.pronamespace
               where nsp.nspname='public' and p.proname=r.n
                 and pg_get_function_identity_arguments(p.oid)=r.a)")
chk "AF-1d" "$REMOVED" "0" "no routine removed"
chk "AF-1e" "$(q "select venue_asof_integrity()")" "v297" "marker returns v297"

# ── AF-2 · posture preserved on all seven ──────────────────────────────────
POSTURE=$(q "select count(*) from pg_proc p join pg_namespace nsp on nsp.oid=p.pronamespace
             where nsp.nspname='public' and p.provolatile='s' and p.prosecdef
               and array_to_string(p.proconfig,',') like '%search_path%'
               and p.proname in ('occurrence_current_venue','current_observation','venue_profile_read',
                   'venue_knowledge_findings','venue_profile','venue_contradictions','venue_verification_requirement')")
chk "AF-2" "$POSTURE" "7" "all seven remain STABLE + SECDEF + search_path pinned"

# ── AF-18b/c · backward compatibility, then divergence control ─────────────
POST18=$(cap18)
case "$POST18" in CAPTURE_FAILED*) bad "AF-18b" "post-migration capture ERRORED: $POST18";; esac
chk "AF-18b" "$([ "$PRE18" = "$POST18" ] && echo identical || echo differs)" "identical" "all-past fixture: pre == post (non-vacuous)"
qi "select record_observation('$V18','ceiling_height','quantity','{\"amount\":99,\"unit\":\"ft\"}'::jsonb,
                              'measurement', now() + interval '5 days', '$W18');" >/dev/null
DIV=$(qi "select venue_profile('$V18', now() + interval '10 days')::text")
BASE=$(qi "select venue_profile('$V18', now())::text")
chk "AF-18c" "$([ "$DIV" != "$BASE" ] && echo diverges || echo same)" "diverges" "divergence control: a future fact changes a later as-of read"
qi "select supersede_observation((select id from venue_observation where venue_id='$V18'
      and observed_at > now() limit 1),'AF-18c cleanup');" >/dev/null

# ── binding fixture · boundary bracketed by MOVING p_now ───────────────────
qi "select create_venue('AF-BIND A $SFX','fixed_facility'); select create_venue('AF-BIND B $SFX','fixed_facility');" >/dev/null
VA=$(q "select id from venue where name='AF-BIND A $SFX'"); VB=$(q "select id from venue where name='AF-BIND B $SFX'")
BK=$(q "insert into bookings (tenant_id, contact_name, invoice_num) values ('$TEN','AF-BIND $SFX','AFB-$SFX') returning id")
OC=$(q "insert into engagement_occurrence (tenant_id, booking_id, ordinal, opened_by) values ('$TEN','$BK',1,'proof') returning id")
qi "select bind_engagement_venue('$BK','$VA');" >/dev/null
T1=$(q "select created_at from engagement_venue_binding where booking_id='$BK' order by seq limit 1")

chk "AF-3" "$(qi "select count(*) from occurrence_current_venue('$OC', '$T1'::timestamptz - interval '1 second')")" "0" \
    "engagement binding invisible before its created_at"
chk "AF-4" "$(qi "select source from occurrence_current_venue('$OC', '$T1'::timestamptz)")" "engagement" \
    "and visible at created_at"

qi "select bind_engagement_venue('$BK','$VB','AF-6 correction');" >/dev/null
T2=$(q "select created_at from engagement_venue_binding where booking_id='$BK' order by seq desc limit 1")
# anchored AT T1: binding A exists, the superseding B (created T2 > T1) does not
chk "AF-6" "$(qi "select venue_id from occurrence_current_venue('$OC', '$T1'::timestamptz)")" "$VA" \
    "a later superseding binding does not hide the valid one at an earlier as-of"

qi "select bind_occurrence_venue('$OC','$VA');" >/dev/null
T3=$(q "select recorded_at from occurrence_venue_binding where occurrence_id='$OC' order by seq desc limit 1")
chk "AF-5pre" "$(q "select ('$T1'::timestamptz < '$T2'::timestamptz and '$T2'::timestamptz < '$T3'::timestamptz)")" "t" \
    "binding timestamps are strictly ordered T1<T2<T3 (the as-of anchors are meaningful)"
# anchored AT T2: both engagement bindings recorded, occurrence binding (T3 > T2) not yet
chk "AF-5a" "$(qi "select source from occurrence_current_venue('$OC', '$T2'::timestamptz)")" "engagement" \
    "occurrence binding invisible before recorded_at (falls back to engagement)"
chk "AF-5b" "$(qi "select source from occurrence_current_venue('$OC', '$T3'::timestamptz)")" "occurrence" \
    "and governs at recorded_at"

# ── walkthrough census · observable through the elsif branch ───────────────
qi "select create_venue('AF-WALK $SFX','fixed_facility');" >/dev/null
VW=$(q "select id from venue where name='AF-WALK $SFX'")
FAM_S=$(qi "select public.attribute_family('ceiling_height')")
qi "select set_staleness_policy('$FAM_S', 1460, 'advisory', true);" >/dev/null
qi "select record_walkthrough('$VW','initial_survey', now() + interval '7 days');" >/dev/null
chk "AF-7" "$(qi "select venue_verification_requirement('$VW', now())->>'verification'")" "walkthrough_required" \
    "a future walkthrough is NOT counted before conducted_at (walked=0 path)"
chk "AF-8" "$(qi "select venue_verification_requirement('$VW', now() + interval '8 days')->>'verification'")" "targeted_verification" \
    "and IS counted after conducted_at"

# ── observation participation ──────────────────────────────────────────────
qi "select create_venue('AF-OBS $SFX','fixed_facility');" >/dev/null
VO=$(q "select id from venue where name='AF-OBS $SFX'")
qi "select record_walkthrough('$VO','initial_survey', now() - interval '2 days');" >/dev/null
WO=$(q "select id from venue_walkthrough where venue_id='$VO'")
qi "select record_observation('$VO','ceiling_height','quantity','{\"amount\":9,\"unit\":\"ft\"}'::jsonb,
                              'measurement', now() + interval '3 days', '$WO');" >/dev/null
chk "AF-9" "$(qi "select venue_profile_read('$VO', null, 'ceiling_height', now())->>'status'")" "unobserved" \
    "a future observation does not govern before observed_at"
chk "AF-10" "$(qi "select venue_profile_read('$VO', null, 'ceiling_height', now() + interval '4 days')->>'status'")" "observed" \
    "and governs after observed_at"
chk "AF-13" "$(qi "select jsonb_array_length(venue_profile('$VO', now()))")" "0" \
    "a future observation does not make an attribute enumerable"

# ── AF-11 · a future observation must not CLEAR staleness ──────────────────
qi "select create_venue('AF-STALE $SFX','fixed_facility');" >/dev/null
VS=$(q "select id from venue where name='AF-STALE $SFX'")
qi "select record_walkthrough('$VS','initial_survey', now() - interval '400 days');" >/dev/null
WS=$(q "select id from venue_walkthrough where venue_id='$VS'")
FAM_E=$(qi "select public.attribute_family('oven_condition')")
qi "select set_staleness_policy('$FAM_E', 30, 'advisory', false);" >/dev/null
qi "select record_observation('$VS','oven_condition','enum','{\"v\":\"working\"}'::jsonb,
                              'measurement', now() - interval '200 days', '$WS');
    select record_observation('$VS','oven_condition','enum','{\"v\":\"working\"}'::jsonb,
                              'measurement', now() + interval '5 days', '$WS');" >/dev/null
chk "AF-11" "$(qi "select count(*) from jsonb_array_elements(venue_knowledge_findings('$VS', now())) e where e->>'kind'='stale'")" "1" \
    "a future observation does not clear staleness at an earlier as-of"

# ── AF-12 · a future observation must not SUPPRESS an unobserved finding ───
qi "select create_venue('AF-SUP $SFX','fixed_facility');" >/dev/null
VU=$(q "select id from venue where name='AF-SUP $SFX'")
qi "select record_walkthrough('$VU','initial_survey', now() - interval '1 day');" >/dev/null
WU=$(q "select id from venue_walkthrough where venue_id='$VU'")
qi "select record_observation('$VU','ceiling_height','quantity','{\"amount\":10,\"unit\":\"ft\"}'::jsonb,
                              'measurement', now() + interval '3 days', '$WU');" >/dev/null
chk "AF-12" "$(qi "select count(*) from jsonb_array_elements(venue_knowledge_findings('$VU', now())) e
                    where e->>'kind'='unobserved' and e->>'family'='$FAM_S'")" "1" \
    "a future observation does not suppress the unobserved/verify_required finding"

# ── AF-14 · contradiction must not surface from a future observation ───────
qi "select create_venue('AF-CON $SFX','fixed_facility');" >/dev/null
VC=$(q "select id from venue where name='AF-CON $SFX'")
qi "select record_walkthrough('$VC','initial_survey', now() - interval '5 days');" >/dev/null
WC=$(q "select id from venue_walkthrough where venue_id='$VC'")
qi "select record_observation('$VC','elevator_capacity','quantity','{\"amount\":1500,\"unit\":\"lbs\"}'::jsonb,
                              'measurement', now() - interval '4 days', '$WC');
    select record_observation('$VC','elevator_capacity','quantity','{\"amount\":2000,\"unit\":\"lbs\"}'::jsonb,
                              'venue_rep_statement', now() + interval '2 days', '$WC');" >/dev/null
chk "AF-14" "$(qi "select coalesce(venue_profile_read('$VC', null, 'elevator_capacity', now())->>'contradiction','none')")" "none" \
    "a future lower-class observation does not surface as a contradiction"
chk "AF-15a" "$(qi "select venue_profile_read('$VC', null, 'elevator_capacity', now() + interval '3 days')->>'source_class'")" "measurement" \
    "precedence intact: source class beats recency across classes"

# ── AF-15b · recency within one class ──────────────────────────────────────
qi "select record_observation('$VC','dock_width','quantity','{\"amount\":8,\"unit\":\"ft\"}'::jsonb,
                              'measurement', now() - interval '9 days', '$WC');
    select record_observation('$VC','dock_width','quantity','{\"amount\":10,\"unit\":\"ft\"}'::jsonb,
                              'measurement', now() - interval '1 day', '$WC');" >/dev/null
chk "AF-15b" "$(qi "select venue_profile_read('$VC', null, 'dock_width', now())->'value'->>'amount'")" "10" \
    "recency wins within one source class"

# ── AF-16 · supersession / effective / expires / condition unchanged ───────
SUP=$(q "select id from venue_observation where venue_id='$VC' and attribute_key='dock_width' order by observed_at desc limit 1")
qi "select supersede_observation('$SUP','AF-16');" >/dev/null
chk "AF-16a" "$(qi "select venue_profile_read('$VC', null, 'dock_width', now())->'value'->>'amount'")" "8" \
    "supersession still excludes the superseded observation"
qi "select record_observation('$VC','noise_curfew','boolean','{\"v\":true}'::jsonb,'measurement',
      now() - interval '3 days', '$WC', null, null, null, null, null,
      now() - interval '2 days', now() - interval '1 day');" >/dev/null
chk "AF-16b" "$(qi "select venue_profile_read('$VC', null, 'noise_curfew', now())->>'status'")" "unobserved" \
    "expires_at still filters (expired observation does not govern)"

# ── AF-17 · redirect/merge resolution unchanged ────────────────────────────
# fixture-only direct write: merge_venues' signature is not part of this release's
# contract surface, and resolve_venue reads redirect_to
qi "select create_venue('AF-RDR OLD $SFX','fixed_facility');" >/dev/null
VR=$(q "select id from venue where name='AF-RDR OLD $SFX'")
q "update venue set redirect_to='$VC' where id='$VR'" >/dev/null
chk "AF-17" "$(qi "select resolve_venue('$VR')")" "$VC" "redirect resolution unchanged"

# ── AF-19 · renovation as-of behaviour unchanged (coalesce path untouched) ─
qi "select create_venue('AF-RENO $SFX','fixed_facility');" >/dev/null
VN=$(q "select id from venue where name='AF-RENO $SFX'")
qi "select record_walkthrough('$VN','initial_survey', now() - interval '100 days');" >/dev/null
WN=$(q "select id from venue_walkthrough where venue_id='$VN'")
qi "select record_observation('$VN','ceiling_height','quantity','{\"amount\":11,\"unit\":\"ft\"}'::jsonb,
                              'measurement', now() - interval '90 days', '$WN');
    select record_observation('$VN','renovation_event','text','{\"v\":\"rebuild\"}'::jsonb,
                              'direct_observation', now() - interval '80 days', '$WN');" >/dev/null
chk "AF-19a" "$(qi "select count(*) from jsonb_array_elements(venue_knowledge_findings('$VN', now())) e
                     where e->>'kind'='renovation_reverification'")" "1" \
    "a past renovation still invalidates older knowledge"
qi "select record_observation('$VN','renovation_event','text','{\"v\":\"future\"}'::jsonb,
                              'direct_observation', now() + interval '60 days', '$WN');" >/dev/null
chk "AF-19b" "$(qi "select count(*) from jsonb_array_elements(venue_knowledge_findings('$VN', now())) e
                     where e->>'kind'='renovation_reverification'")" "1" \
    "a future renovation adds no finding at an earlier as-of (coalesce path already correct)"

# ── AF-20 · the by-id exemptions are provable: delegation intact ───────────
VPR=$(q "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='venue_profile_read'")
VKF=$(q "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='venue_knowledge_findings'")
D1=$(echo "$VPR" | grep -c "current_observation(")
D2=$(echo "$VPR" | grep -c "where id = v_gov")
D3=$(echo "$VKF" | grep -c "venue_profile_read(")
D4=$(echo "$VKF" | grep -c "prof->>'observation_id'")
chk "AF-20a" "$([ "$D1" -ge 1 ] && [ "$D2" -ge 1 ] && echo intact || echo broken)" "intact" \
    "venue_profile_read still derives v_gov from current_observation and fetches by it"
chk "AF-20b" "$([ "$D3" -ge 1 ] && [ "$D4" -ge 1 ] && echo intact || echo broken)" "intact" \
    "venue_knowledge_findings still takes observation_id from venue_profile_read"

# ── AF-21 · tenant isolation (orphan actor — the v295 harness pattern) ─────
ORPHAN=$(q "select gen_random_uuid()")
qo() { pg_qq "$CLONE" "select set_config('app.user_id','$ORPHAN','f'), set_config('request.jwt.claim.sub','$ORPHAN','f'); $1" | tail -n +2; }
chk "AF-21a" "$(qo "select venue_profile('$V18', now())::text")" "[]" \
    "an actor outside the tenant reads no venue knowledge"
chk "AF-21b" "$(qo "select record_observation('$V18','leak','text', to_jsonb(1),'measurement', now())" \
                | grep -o 'VENUE_NOT_AUTHORIZED' | head -1)" "VENUE_NOT_AUTHORIZED" \
    "and every venue ceremony refuses that actor"

# ── RESIDUE ────────────────────────────────────────────────────────────────
DELTA=$(q "select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.prokind in ('f','p'))
           - (select count(*) from _pre_routines)")
chk "RESIDUE" "$DELTA" "1" "pg_proc census +1 exactly (the marker)"

echo
echo "== v297 one-shot: $PASS PASS / $FAIL FAIL =="
[ $FAIL -eq 0 ] || { printf 'failed: %s\n' "${FAILED[*]}"; exit 1; }
exit 0
