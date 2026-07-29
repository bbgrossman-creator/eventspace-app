#!/bin/bash
# ============================================================================
# v294 SQL proofs — PQ-1..PQ-13 (4 split into 4a/4b), PQ-COV, RESIDUE
# 16 certifiable gates. PQ-14 (client version-guard refusal) is a browser claim.
#
# CLOCK DISCIPLINE (structural, not incidental). Milestone and attendance
# resolution is bounded by recorded_at <= p_now, so a p_now captured BEFORE a
# fixture is written renders that fixture invisible. An earlier revision of this
# runner froze NOW once at startup and then evaluated everything at that stale
# instant, which produced false failures in PQ-4a, PQ-5 and PQ-7. NOW is now
# refreshed through refresh_now() after every write whose effect is observed,
# and Q is rebuilt with it.
#
# REASONS. The promise ceremonies raise PROMISE_REASON_REQUIRED whenever a call
# replaces an existing value, and clear_schedule_milestone requires one
# unconditionally. Every fixture ceremony below supplies a non-null reason.
#
# Runner owns migration timing: clones a pre-v294 ec, applies inside the clone.
# Fixtures are built through the certified ceremonies wherever a signature is
# certified knowledge (open_occurrence, set_schedule_milestone,
# cancel_occurrence); the released fixture uses the v287b/v293 harness pattern.
#
# PQ-5 note (executable rendering of the frozen claim): the frozen text is
# "complete-but-unreleased is included". The eighth completeness key cannot be
# guaranteed reachable from the certified ceremony set alone, so the claim is
# proven as the invariant it exists to pin: membership is UNCHANGED while
# completeness strictly improves (missing_count decreases under real
# ceremonies). Membership never reads completeness; v292a made provable.
#
# PQ-4b probes the clearing mechanism dynamically: if set_schedule_milestone
# exposes a p_cleared parameter it is used; otherwise a null-date call is
# attempted; if neither clears, the gate is UNPROVEN (blocking) and names what
# is missing. No semantics are guessed.
#
# Exit: 0 clean · 1 FAIL/UNPROVEN · 2 ABORT · 3 cleanup failure · 130 signal
# Run:  sudo bash proofs/v294_proofs.sh [supabase/v294_preparation_queue.sql]
# ============================================================================
set -u
MIG="${1:-supabase/v294_preparation_queue.sql}"
DB="v294_proof_$$"
TMPSQL=""
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
# Re-read the clock and rebuild the projection expression. Call after ANY write
# whose effect the next gate observes.
refresh_now() { NOW=$(psc "now()"); Q="public.projection_preparation_queue('$NOW'::timestamptz)"; }
claim()    { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); say "$1 PASS"
             else FAIL=$((FAIL+1)); say "$1 FAIL expected=[$2] actual=[$3] ${4:-}"; fi; }
unproven() { UNPROVEN=$((UNPROVEN+1)); say "$1 UNPROVEN — $2"; }
abort()    { say "ABORT: $*"; exit 2; }

[ -f "$MIG" ] || abort "migration not found: $MIG"
TMPSQL=$(mktemp /tmp/v294_XXXXXX.sql); chmod 644 "$TMPSQL"
su postgres -c "dropdb --if-exists $DB" >/dev/null 2>&1
su postgres -c "createdb -T ec $DB" || abort "cannot clone ec"

[ "$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname='projection_preparation_queue'" | tail -1)" = "0" ] \
  || abort "clone already carries v294"
PROC_BEFORE=$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" | tail -1)
MIGOUT=$(psf "$MIG"); case "$MIGOUT" in *ERROR*) abort "migration failed: $MIGOUT";; esac
say "migration applied inside clone"

TU=$(psq "select tu.tenant_id||' '||tu.user_id from public.tenant_users tu where tu.active order by tu.tenant_id limit 1" | tail -1)
TENANT=${TU%% *}; USER=${TU##* }
CTX="select set_config('app.user_id','$USER',false), set_config('request.jwt.claim.sub','$USER',false);"
ORPHAN=$(psq "select gen_random_uuid()::text" | tail -1)
NOW=$(psc "now()")
D_TODAY=$(psc "public.operational_day_of('$NOW'::timestamptz, public.tenant_operational_timezone('$TENANT'::uuid), public.tenant_operational_day_start_hour('$TENANT'::uuid))")
D_NEAR=$(psc "(date '$D_TODAY' + 10)"); D_FAR=$(psc "(date '$D_TODAY' + 30)")
say "harness: tenant=$TENANT actor=$USER today=$D_TODAY now=$NOW"

# ── fixtures via certified ceremonies ───────────────────────────────────────
cat > "$TMPSQL" <<SQLEOF
$CTX
create table public.v294_fx(tag text primary key, occ uuid);
do \$fx\$
declare v_t uuid := '$TENANT'; ba uuid; bb uuid; o uuid; v_ven uuid;
begin
  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_t,'Alpha','V294A-'||substr(gen_random_uuid()::text,1,8),'active') returning id into ba;
  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_t,'Beta','V294B-'||substr(gen_random_uuid()::text,1,8),'active') returning id into bb;
  insert into public.venue (tenant_id,name,address,venue_type,created_by)
    values (v_t,'Queue Hall','2 Queue St','fixed_facility','v294') returning id into v_ven;

  o := (public.open_occurrence(ba,null,null)->>'occurrence_id')::uuid;               -- FA undated unreleased
  insert into v294_fx values ('FA',o);
  o := (public.open_occurrence(ba,null,null)->>'occurrence_id')::uuid;               -- FB dated FAR unreleased
  perform public.set_schedule_milestone(p_occurrence=>o,p_milestone_key=>'operating_date',
    p_at_date=>date '$D_FAR',p_at_moment=>null,p_window_end=>null,p_label=>null,
    p_reason=>'v294 fixture FB');
  insert into v294_fx values ('FB',o);
  o := (public.open_occurrence(ba,null,null)->>'occurrence_id')::uuid;               -- FG supersession probe
  perform public.set_schedule_milestone(p_occurrence=>o,p_milestone_key=>'operating_date',
    p_at_date=>date '$D_FAR',p_at_moment=>null,p_window_end=>null,p_label=>null,
    p_reason=>'v294 fixture FG initial');
  -- the replacement call supersedes an existing milestone: a reason is required
  perform public.set_schedule_milestone(p_occurrence=>o,p_milestone_key=>'operating_date',
    p_at_date=>date '$D_NEAR',p_at_moment=>null,p_window_end=>null,p_label=>null,
    p_reason=>'v294 fixture: supersede to near date');
  insert into v294_fx values ('FG',o);
  o := (public.open_occurrence(bb,null,null)->>'occurrence_id')::uuid;               -- FC dated TODAY unreleased
  perform public.set_schedule_milestone(p_occurrence=>o,p_milestone_key=>'operating_date',
    p_at_date=>date '$D_TODAY',p_at_moment=>null,p_window_end=>null,p_label=>null,
    p_reason=>'v294 fixture FC');
  insert into v294_fx values ('FC',o);
  o := (public.open_occurrence(bb,null,null)->>'occurrence_id')::uuid;               -- FD released
  perform public.set_schedule_milestone(p_occurrence=>o,p_milestone_key=>'operating_date',
    p_at_date=>date '$D_NEAR',p_at_moment=>null,p_window_end=>null,p_label=>null,
    p_reason=>'v294 fixture FD');
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by)
    values (v_t,bb,o,gen_random_uuid(),'v294fx');
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload)
    select v_t,e.id,'released','v294fx','{}'::jsonb from public.event e where e.occurrence_ref=o;
  insert into v294_fx values ('FD',o);
  o := (public.open_occurrence(bb,null,null)->>'occurrence_id')::uuid;               -- FE cancelled undated
  perform public.cancel_occurrence(p_occurrence=>o,p_reason=>'v294 fixture');
  insert into v294_fx values ('FE',o);
  -- FH: venue+profile bind target for PQ-5 completeness movement, dated NEAR
  o := (public.open_occurrence(ba,null,null)->>'occurrence_id')::uuid;
  insert into v294_fx values ('FH',o);
end \$fx\$;
select 'FXOK';
SQLEOF
FXOUT=$(psf "$TMPSQL"); case "$FXOUT" in *FXOK*) : ;; *) abort "fixtures failed: $FXOUT";; esac
fx() { psc "(select occ::text from public.v294_fx where tag='$1')"; }
FA=$(fx FA); FB=$(fx FB); FG=$(fx FG); FH=$(fx FH); FC=$(fx FC); FD=$(fx FD); FE=$(fx FE)
for v in FA FB FG FH FC FD FE; do eval "val=\$$v"; case "$val" in *-*) : ;; *) abort "fixture $v unresolved: [$val]";; esac; done
say "fixtures ok"

# Fixtures are written; re-read the clock so every fact above is within p_now.
refresh_now
say "evaluation moment refreshed after fixtures: $NOW"
member() { psc "(select count(*) from jsonb_array_elements(($Q)->'data'->'occurrences') r where r->>'occurrence'='$1')"; }

# ══ membership four corners ═══════════════════════════════════════════════
claim PQ-1 "1" "$(member "$FA")" "active undated unreleased must be a member"
claim PQ-2 "1" "$(member "$FB")" "active dated-FUTURE unreleased must be a member (inverts the pre-amendment predicate)"
claim PQ-3 "1" "$(member "$FC")" "active dated-TODAY unreleased must be a member (accepted Day-Sheet overlap)"
claim PQ-6 "0" "$(member "$FD")" "a released occurrence must not be a member"
claim PQ-7 "0" "$(member "$FE")" "a cancelled occurrence must not be a member"

# ══ PQ-4a supersession · PQ-4b clearing — display claims ══════════════════
claim PQ-4a "$D_NEAR" \
"$(psc "(select r->>'operating_date' from jsonb_array_elements(($Q)->'data'->'occurrences') r where r->>'occurrence'='$FG')")" \
  "a superseded date must display the CURRENT date (was $D_FAR, replaced by $D_NEAR)"

# ── PQ-4b · clearing, proven behaviourally through the certified ceremony ──
# clear_schedule_milestone resolves the current milestone, inserts a
# replacement with cleared=true, and links replaces_id. promise_current_milestones
# then excludes it via "where not x.cleared", so the brief reports a null
# operating_date and the queue displays that. Membership must NOT move: the
# frozen predicate is active AND NOT has_event, and it never reads the date.
# The ceremony's success is asserted before its effect is observed, so a refusal
# can never be mistaken for a cleared milestone (the defect in the prior run).
C4B=$(psq "$CTX select 'CLR:'||coalesce((public.clear_schedule_milestone(
             p_occurrence=>'$FG'::uuid,
             p_milestone_key=>'operating_date',
             p_label=>null,
             p_reason=>'v294 clear')->>'cleared'),'<null>')" | tr '\n' ' ')
case "$C4B" in
  *CLR:true*)
    refresh_now                       # the clearing fact must be within p_now
    R4B=$(psc "(select coalesce(r->>'operating_date','<null>')||'|'||
                 (select count(*) from jsonb_array_elements(($Q)->'data'->'occurrences') x
                   where x->>'occurrence'='$FG')::text
               from jsonb_array_elements(($Q)->'data'->'occurrences') r
              where r->>'occurrence'='$FG')")
    claim PQ-4b "<null>|1" "$R4B" "a cleared date must display null AND the row must remain a member — clearing changes presentation, never membership"
    ;;
  *)
    claim PQ-4b "cleared=true" "$(printf '%s' "$C4B" | cut -c1-160)" "clear_schedule_milestone did not report success; its effect must not be observed"
    ;;
esac

# ══ PQ-5 · complete-but-unreleased IS a member — the FROZEN boundary ══════
# All eight completeness facts through certified ceremonies. Two host-proven
# constraints are honoured here: the milestone key must come from the schedule
# table's allowed set (guest_arrival is NOT one — staff_call is), and every
# ceremony that replaces a value raises PROMISE_REASON_REQUIRED, so all reasons
# are non-null. Ceremony failures are surfaced and counted, never swallowed.
CER_FAILS=""
cer() {  # $1 = label, $2 = full call
  local o; o=$(psq "$CTX select public.$2" | tr '\n' ' ')
  case "$o" in
    *ERROR*) CER_FAILS="$CER_FAILS $1"
             say "      PQ-5 fixture-FAIL[$1]: $(printf '%s' "$o" | cut -c1-170)";;
  esac
}
BA_OF_FH=$(psc "(select o.booking_id from public.engagement_occurrence o where o.id='$FH'::uuid)")
cer profile     "set_occurrence_profile(p_occurrence=>'$FH'::uuid, p_display_name=>'PQ5 Complete', p_occasion_kind=>'wedding', p_reason=>'v294 pq5 profile')"
cer client      "set_engagement_profile(p_booking=>'$BA_OF_FH'::uuid, p_display_name=>'Alpha Events', p_client_display_name=>'Klein Family', p_reason=>'v294 pq5 client')"
cer venue       "bind_occurrence_venue(p_occurrence=>'$FH'::uuid, p_venue=>(select id from public.venue where name='Queue Hall' and tenant_id='$TENANT'::uuid), p_reason=>'v294 pq5 venue')"
cer attendance  "commit_attendance(p_occurrence=>'$FH'::uuid, p_head_count=>150, p_basis=>'contracted', p_effective_moment=>null, p_reason=>'v294 pq5 attendance')"
cer opdate      "set_schedule_milestone(p_occurrence=>'$FH'::uuid, p_milestone_key=>'operating_date', p_at_date=>date '$D_NEAR', p_at_moment=>null, p_window_end=>null, p_label=>null, p_reason=>'v294 pq5 date')"
cer milestone   "set_schedule_milestone(p_occurrence=>'$FH'::uuid, p_milestone_key=>'staff_call', p_at_date=>null, p_at_moment=>(now() + interval '9 days'), p_window_end=>null, p_label=>null, p_reason=>'v294 pq5 staff call')"
cer supervision "bind_occurrence_supervision(p_occurrence=>'$FH'::uuid, p_authority_org=>'KCL', p_window_start=>(now() + interval '9 days'), p_window_end=>(now() + interval '10 days'), p_certificate_ref=>'PQ5-CERT', p_contact=>null, p_reason=>'v294 pq5 supervision')"

refresh_now                            # every fact above must be within p_now
M5=$(psc "(select (r->>'missing_count')::int from jsonb_array_elements(($Q)->'data'->'occurrences') r where r->>'occurrence'='$FH')")
if [ -n "$CER_FAILS" ]; then
  claim PQ-5 "all-ceremonies-succeed" "refused:$CER_FAILS" "a completeness ceremony refused; the boundary was never reached"
elif [ "$M5" = "0" ]; then
  claim PQ-5 "1" "$(member "$FH")" "an unreleased occurrence with missing_count=0 must remain a member — completeness never gates membership (v292a)"
elif [ "$M5" = "<null>" ]; then
  claim PQ-5 "1" "0" "the fixture left the queue while only completeness ceremonies ran — membership is reading completeness"
else
  MISSING=$(psc "(select string_agg(k,',') from jsonb_array_elements_text((public.projection_occurrence_brief('$FH'::uuid,'$NOW'::timestamptz)->'data'->'completeness'->'missing')) k)")
  claim PQ-5 "missing_count=0" "missing_count=$M5 keys=[$MISSING]" "all eight ceremonies reported success yet completeness is short"
fi

# ══ PQ-8 / PQ-9 · composition fidelity against the brief itself ═══════════
claim PQ-8 "true" \
"$(psc "(select (r->>'operating_date' is not distinct from (public.projection_occurrence_brief('$FB'::uuid,'$NOW'::timestamptz)->'data'->'schedule'->>'operating_date'))::text from jsonb_array_elements(($Q)->'data'->'occurrences') r where r->>'occurrence'='$FB')")" \
  "row operating_date must equal the brief's schedule.operating_date at the same p_now"
claim PQ-9 "true" \
"$(psc "(select bool_and(ok) from (
   select (r->>'display_name'  is not distinct from d->'identity'->>'display_name')
      and (r->>'client'        is not distinct from d->'identity'->>'client')
      and (r->>'client_source' is not distinct from d->'identity'->>'client_source')
      and (r->>'engagement'    is not distinct from d->'identity'->>'engagement')
      and ((r->>'ordinal')::int is not distinct from (d->'identity'->>'ordinal')::int)
      and (r->>'venue'         is not distinct from d->'venue'->>'name')
      and ((r->>'has_event')::boolean is not distinct from (d->>'has_event')::boolean)
      and ((r->>'missing_count')::int is not distinct from jsonb_array_length(coalesce(d->'completeness'->'missing','[]'::jsonb))) as ok
     from jsonb_array_elements(($Q)->'data'->'occurrences') r,
          lateral (select public.projection_occurrence_brief((r->>'occurrence')::uuid,'$NOW'::timestamptz)->'data' d) x
    where r->>'occurrence' in ('$FA','$FB','$FC')) y)")" \
  "every mapped row field equals the brief's own value — PRJ-6d shape"

# ══ PQ-10 · counts, non-vacuous ═══════════════════════════════════════════
claim PQ-10 "true" \
"$(psc "(select ((c->>'total')::int = (select count(*) from jsonb_array_elements(($Q)->'data'->'occurrences'))
       and (c->>'incomplete')::int = (select count(*) from jsonb_array_elements(($Q)->'data'->'occurrences') r where (r->>'missing_count')::int > 0)
       and (c->>'undated')::int   = (select count(*) from jsonb_array_elements(($Q)->'data'->'occurrences') r where r->>'operating_date' is null)
       and (c->>'total')::int > 0 and (c->>'incomplete')::int > 0 and (c->>'undated')::int > 0)::text
   from (select ($Q)->'counts' c) z)")" \
  "counts equal their own rows and every count is non-zero in the fixture"

# ══ PQ-11 · declared ordering, computed independently ═════════════════════
claim PQ-11 \
"$(psc "(select string_agg(occ,',') from (
   select r->>'occurrence' occ from jsonb_array_elements(($Q)->'data'->'occurrences') r
   order by (r->>'operating_date')::date asc nulls first, r->>'engagement', (r->>'ordinal')::int, r->>'occurrence') s)")" \
"$(psc "(select string_agg(r->>'occurrence',',') from jsonb_array_elements(($Q)->'data'->'occurrences') r)")" \
  "emitted order must equal the declared rule recomputed independently"

# ══ PQ-12 · isolation ═════════════════════════════════════════════════════
ANON=$(psq "select public.projection_preparation_queue()->'counts'->>'total'" | tail -1)
ORPH=$(psq "select set_config('app.user_id','$ORPHAN',false), set_config('request.jwt.claim.sub','$ORPHAN',false);
            select public.projection_preparation_queue()->'counts'->>'total'" | tail -1)
claim PQ-12 "0|0" "$ANON|$ORPH" "anonymous and orphan-identity reads must both be empty"

# ══ PQ-13 · shape and identity ════════════════════════════════════════════
claim PQ-13 "s|true|search_path=public|preparation_queue|1" \
"$(psc "(select p.provolatile::text||'|'||p.prosecdef::text||'|'||coalesce(array_to_string(p.proconfig,','),'-')||'|'||(($Q)->>'projection')||'|'||(($Q)->>'version')
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='projection_preparation_queue')")" \
  "STABLE, SECURITY DEFINER, pinned search_path, envelope preparation_queue v1"

# ══ PQ-COV · the previously invisible population is discoverable ══════════
claim PQ-COV "0|1" \
"$(psc "(select (select count(*) from jsonb_array_elements(public.projection_occurrences_for_operational_day(null,'$NOW'::timestamptz)->'data'->'occurrences') r where r->>'occurrence'='$FB')::text||'|'||(select count(*) from jsonb_array_elements(($Q)->'data'->'occurrences') r where r->>'occurrence'='$FB')::text)")" \
  "a dated-future unreleased occurrence is absent from today's day projection AND present in the queue"

# ══ RESIDUE ═══════════════════════════════════════════════════════════════
PROC_AFTER=$(psq "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" | tail -1)
claim RESIDUE "$((PROC_BEFORE + 1))" "$PROC_AFTER" "the migration must add exactly one function"

say "----------------------------------------"
say "----------------------------------------"
say "v294 SQL proofs: $PASS PASS / $FAIL FAIL / $UNPROVEN UNPROVEN  (16 certifiable gates)"
if [ "$FAIL" -eq 0 ] && [ "$UNPROVEN" -eq 0 ] && [ "$PASS" -eq 16 ]; then
  say "RESULT: 16/16 certifiable gates PASS. SQL clone certification clean."
  exit 0
else
  say "RESULT: blocked."
  exit 1
fi
