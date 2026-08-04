#!/usr/bin/env bash
# ============================================================================
# v303 — OCCURRENCE READINESS (ATL-1) · ONE-SHOT PROOF RUNNER
#
# RD-1..RD-13 + RESIDUE. This runner proves the MIGRATION's properties — that the
# change is purely ADDITIVE and that nothing downstream moved — which is the whole
# basis for keeping occurrence_brief at v1. The readiness SEMANTICS are proved
# permanently in supabase/tests/v303_permanent_proof.sql (RS-1..RS-20).
#
# THE CENTRAL CLAIMS ARE RD-4 AND RD-5. They are checked by SUBTRACTION:
# `data - readiness_state` and `counts - readiness_blockers` must be byte-identical
# across the migration. A single moved byte anywhere else fails them, and with them
# the v1 ruling — because the version guarantee IS "nothing an existing reader
# consumes has changed".
#
# RD-7 and RD-8 close the other half: the two projections that COMPOSE the brief
# must be byte-identical. projection_occurrences_for_operational_day hard-asserts
# occurrence_brief v1 and raises V292D_COMPOSED_VERSION_MISMATCH otherwise, so if
# v303 had moved the version this would fail loudly rather than silently.
#
# Run:  bash proofs/v303_proofs.sh
# Exit: 0 all PASS · 1 any FAIL
# ============================================================================
set -uo pipefail
. "${EC_LIB_PG:-ec/lib/pg.sh}"
pg_require

CLONE="ec_v303_$$"
MIG="supabase/v303_readiness.sql"
PASS=0; FAIL=0
declare -a FAILED

ok()  { PASS=$((PASS+1)); printf '  PASS  %-10s %s\n' "$1" "$2"; }
bad() { FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  FAIL  %-10s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

cleanup() { pg_drop "$CLONE"; }
trap cleanup EXIT

echo "== v303 one-shot =="

PRE_MARK=$(pg_q ec "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.proname='v303_readiness'")
if [ "$PRE_MARK" != "0" ]; then
  echo "ABORT: ec already carries v303_readiness ($PRE_MARK) — the clone would be"
  echo "       post-corrective and every RD claim would be vacuous. Use --verify."
  exit 1
fi
pg_drop "$CLONE"
pg_clone ec "$CLONE" || { echo "ABORT: clone failed (active connections to ec?)"; exit 1; }
echo "clone: $CLONE (pre-corrective, marker absent)"

PRE_ROUTINES=$(pg_q "$CLONE" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                               where n.nspname='public' and p.prokind in ('f','p')")

# ── fixture · one released occurrence with work, one dated for the day lens ──
read -r TENANT UID_ <<<"$(pg_q "$CLONE" \
  "select tu.tenant_id||' '||tu.user_id from public.tenant_users tu
    where tu.active order by tu.tenant_id limit 1")"
[ -n "${UID_:-}" ] || { echo "ABORT: no active tenant_users row in the clone"; exit 1; }
qi() { pg_q "$CLONE" "select set_config('app.user_id','$UID_','f'), set_config('request.jwt.claim.sub','$UID_','f'); $1" | tail -n +2; }

DAY=$(pg_q "$CLONE" "select (now() + interval '9 days')::date::text")
OCC=$(qi "with b as (
            insert into public.bookings (tenant_id, contact_name, invoice_num, status)
            values ('$TENANT','RD303','RD303-'||substr(gen_random_uuid()::text,1,8),'active')
            returning id)
          select public.open_occurrence((select id from b), null, null)->>'occurrence_id'")
qi "select public.set_schedule_milestone('$OCC'::uuid,'operating_date','$DAY'::date,null,null,null,null)" >/dev/null
BOOK=$(qi "select booking_id from public.engagement_occurrence where id='$OCC'::uuid")
qi "insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by)
    values ('$TENANT','$BOOK','$OCC'::uuid,gen_random_uuid(),'rd303')" >/dev/null
qi "insert into public.obligation (tenant_id,event_ref,scope,origin_ref,origin_kind,kind,
        department,required_outcome,natural_key,timing)
    select '$TENANT', e.id, 'event', gen_random_uuid(), 'release', 'culinary_prepare',
           'culinary', 'RD plate', 'rd303_'||substr(gen_random_uuid()::text,1,8),
           jsonb_build_object('window_end', (now() - interval '1 hour')::text)
      from public.event e where e.occurrence_ref='$OCC'::uuid" >/dev/null
echo "fixture: occurrence $OCC on $DAY (released, one lapsed responsibility)"

AT="'2030-01-01T00:00:00Z'::timestamptz"
brief()  { qi "select (public.projection_occurrence_brief('$OCC'::uuid, $AT)$1)::text"; }

# ── PRE capture ────────────────────────────────────────────────────────────
PRE_DATA=$(brief   "->'data' - 'readiness_state'")
PRE_COUNTS=$(brief "->'counts' - 'readiness_blockers'")
PRE_HAS=$(qi "select (public.projection_occurrence_brief('$OCC'::uuid, $AT)->'data') ? 'readiness_state'")
PRE_DAY=$(qi   "select (public.projection_occurrences_for_operational_day('$DAY'::date, $AT)->'data')::text")
PRE_QUEUE=$(qi "select (public.projection_preparation_queue($AT)->'data')::text")

chk "RD-1" "$PRE_HAS" "f" "before the migration the brief carries NO readiness_state — the gap this release closes is real"

# ── apply ──────────────────────────────────────────────────────────────────
APPLY=$(pg_file "$CLONE" "$MIG" 2>&1); RC=$?
chk "RD-2" "$RC" "0" "the migration applies cleanly to a pre-corrective clone"
if [ "$RC" -ne 0 ]; then
  printf '%s\n' "$APPLY" | tail -8
  echo; echo "ABORT: the migration did not apply — every claim below would be vacuous."
  echo "== v303 one-shot: $PASS PASS / $FAIL FAIL =="
  exit 1
fi

# ── POST capture ───────────────────────────────────────────────────────────
POST_DATA=$(brief   "->'data' - 'readiness_state'")
POST_COUNTS=$(brief "->'counts' - 'readiness_blockers'")
POST_HAS=$(qi "select (public.projection_occurrence_brief('$OCC'::uuid, $AT)->'data') ? 'readiness_state'")
POST_DAY=$(qi   "select (public.projection_occurrences_for_operational_day('$DAY'::date, $AT)->'data')::text")
POST_QUEUE=$(qi "select (public.projection_preparation_queue($AT)->'data')::text")

chk "RD-3" "$POST_HAS" "t" "after the migration the brief carries readiness_state"

# ── THE ADDITIVE CLAIM · proved by subtraction ─────────────────────────────
chk "RD-4" "$([ "$PRE_DATA" = "$POST_DATA" ] && echo identical || echo moved)" "identical" \
    "data MINUS readiness_state is byte-identical — data.readiness, completeness, risk, exceptions and every other key are untouched"
chk "RD-5" "$([ "$PRE_COUNTS" = "$POST_COUNTS" ] && echo identical || echo moved)" "identical" \
    "counts MINUS readiness_blockers is byte-identical — at_risk, exceptions, by_state and the rest were not touched"

# ── THE VERSION RULING ─────────────────────────────────────────────────────
chk "RD-6" "$(qi "select public.projection_occurrence_brief('$OCC'::uuid, $AT)->>'version'")" "1" \
    "the brief is still occurrence_brief v1 — readiness is TRUTH under R-13, but a NEW key changes nothing an existing reader consumes"
chk "RD-7" "$([ "$PRE_DAY" = "$POST_DAY" ] && echo identical || echo moved)" "identical" \
    "projection_occurrences_for_operational_day is byte-identical — its composed v1 guard never fired"
chk "RD-8" "$([ "$PRE_QUEUE" = "$POST_QUEUE" ] && echo identical || echo moved)" "identical" \
    "projection_preparation_queue is byte-identical — the unguarded composer is unaffected too"

# ── POSTURE · read purity is structural ────────────────────────────────────
chk "RD-9" "$(pg_q "$CLONE" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                              where n.nspname='public' and p.provolatile='s' and p.prosecdef
                                and array_to_string(p.proconfig,',') like '%search_path%'
                                and p.proname in ('occurrence_phase','occurrence_department_readiness',
                                                  'occurrence_readiness','projection_occurrence_brief')")" "4" \
    "all four functions are STABLE + SECURITY DEFINER with search_path pinned — a readiness resolver that could write would be a contradiction"

# ── THE VERDICT IS LIVE, not merely present ────────────────────────────────
chk "RD-10" "$(qi "select public.projection_occurrence_brief('$OCC'::uuid, $AT)->'data'->'readiness_state'->>'verdict'")" "blocked" \
    "the lapsed responsibility makes the occurrence blocked through the brief — the model is wired end to end, not just installed"

# ── CONTAINMENT · the legacy vocabulary did not spread ─────────────────────
chk "RD-11" "$(pg_q "$CLONE" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                               where n.nspname='public' and p.prokind='f'
                                 and p.proname in ('occurrence_phase','occurrence_department_readiness','occurrence_readiness')
                                 and pg_get_functiondef(p.oid) like '%obligation_state%'")" "0" \
    "no readiness resolver consults obligation_state — the canonical model is built on responsibility_state alone"

# ── IDEMPOTENCE ────────────────────────────────────────────────────────────
chk "RD-12" "$(pg_file "$CLONE" "$MIG" 2>&1 | grep -o 'V303_ALREADY_APPLIED' | head -1)" "V303_ALREADY_APPLIED" \
    "re-applying refuses by name rather than silently re-running"

chk "RD-13" "$(pg_q "$CLONE" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                               where n.nspname='public' and p.proname='v303_readiness'")" "1" \
    "the deployed marker is present exactly once"

# ── RESIDUE ────────────────────────────────────────────────────────────────
DELTA=$(pg_q "$CLONE" "select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                where n.nspname='public' and p.prokind in ('f','p')) - $PRE_ROUTINES")
chk "RESIDUE" "$DELTA" "4" "pg_proc census +4 exactly (three resolvers and the marker) — CREATE OR REPLACE created no overload"

echo
echo "== v303 one-shot: $PASS PASS / $FAIL FAIL =="
[ $FAIL -eq 0 ] || { printf 'failed: %s\n' "${FAILED[*]}"; exit 1; }
exit 0
