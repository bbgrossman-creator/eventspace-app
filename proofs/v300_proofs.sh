#!/usr/bin/env bash
# ============================================================================
# v300 — Occurrence Brief Risk Disclosure · ONE-SHOT PROOF RUNNER
#
# RK-1..RK-13 + RESIDUE. This runner proves the MIGRATION's property — that the
# change is purely ADDITIVE — which is the whole basis for keeping the brief at
# occurrence_brief v1. The risk SEMANTICS are proved permanently in
# supabase/tests/v300_permanent_proof.sql (OB-21..OB-25).
#
# The runner owns migration timing: it clones ec, builds a fixture, captures
# PRE, applies supabase/v300_occurrence_brief_risk.sql, then captures POST. The
# clone must be pre-corrective; if ec already carries the marker the run aborts
# (the v295 lesson).
#
# The additive claim is checked by SUBTRACTION, not by inspection: `data - 'risk'`
# must be byte-identical across the migration. A single moved byte anywhere else
# in the payload fails RK-4, and with it the v1 ruling.
#
# Run:  bash proofs/v300_proofs.sh
# Exit: 0 all PASS · 1 any FAIL
# ============================================================================
set -uo pipefail
# --- privileged access: ec/lib/pg.sh is the ONLY path to PostgreSQL ----------
. "${EC_LIB_PG:-ec/lib/pg.sh}"
pg_require                      # noninteractive capability gate; never prompts
# ---------------------------------------------------------------------------

CLONE="ec_v300_$$"
MIG="supabase/v300_occurrence_brief_risk.sql"
PASS=0; FAIL=0
declare -a FAILED

ok()  { PASS=$((PASS+1)); printf '  PASS  %-10s %s\n' "$1" "$2"; }
bad() { FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  FAIL  %-10s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

q()  { pg_q "$CLONE" "$1"; }
# identity-bearing query: both GUCs, same invocation (the recurring harness lesson)
qi() { pg_q "$CLONE" "select set_config('app.user_id','$UID_','f'), set_config('request.jwt.claim.sub','$UID_','f'); $1" | tail -n +2; }

cleanup() { pg_drop "$CLONE"; }
trap cleanup EXIT

echo "== v300 one-shot =="

# ── clone, and refuse a post-corrective source ─────────────────────────────
PRE_MARK=$(pg_q ec "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='v300_brief_risk'")
if [ "$PRE_MARK" != "0" ]; then
  echo "ABORT: ec already carries v300_brief_risk ($PRE_MARK) — the clone would be"
  echo "       post-corrective and every RK claim would be vacuous. Use --verify."
  exit 1
fi
pg_drop "$CLONE"
pg_clone ec "$CLONE" || { echo "ABORT: clone failed (active connections to ec?)"; exit 1; }
echo "clone: $CLONE (pre-corrective, marker absent)"

q "create temp table _pre_routines as
     select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prokind in ('f','p')" >/dev/null 2>&1
PRE_ROUTINES=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.prokind in ('f','p')")

# ── fixture · one engagement, one dated occurrence ─────────────────────────
read -r TENANT UID_ <<<"$(pg_q "$CLONE" \
  "select tu.tenant_id||' '||tu.user_id from public.tenant_users tu
    where tu.active order by tu.tenant_id limit 1")"
[ -n "${UID_:-}" ] || { echo "ABORT: no active tenant_users row in the clone"; exit 1; }

DAY=$(q "select (now() + interval '10 days')::date::text")
OCC=$(qi "with b as (
            insert into public.bookings (tenant_id, contact_name, invoice_num, status)
            values ('$TENANT','RK300','RK300-'||substr(gen_random_uuid()::text,1,8),'active')
            returning id)
          select public.open_occurrence((select id from b), null, null)->>'occurrence_id'")
qi "select public.set_schedule_milestone('$OCC'::uuid,'operating_date','$DAY'::date,null,null,null,null)" >/dev/null
echo "fixture: occurrence $OCC on $DAY"

# ── PRE capture ────────────────────────────────────────────────────────────
PRE_BRIEF=$(qi   "select public.projection_occurrence_brief('$OCC'::uuid, '2030-01-01T00:00:00Z'::timestamptz)::text")
PRE_DATA=$(qi    "select (public.projection_occurrence_brief('$OCC'::uuid,'2030-01-01T00:00:00Z'::timestamptz)->'data' - 'risk')::text")
PRE_COUNTS=$(qi  "select (public.projection_occurrence_brief('$OCC'::uuid,'2030-01-01T00:00:00Z'::timestamptz)->'counts')::text")
PRE_EXC=$(qi     "select (public.projection_occurrence_brief('$OCC'::uuid,'2030-01-01T00:00:00Z'::timestamptz)->'data'->'exceptions')::text")
PRE_HASRISK=$(qi "select (public.projection_occurrence_brief('$OCC'::uuid,'2030-01-01T00:00:00Z'::timestamptz)->'data') ? 'risk'")
PRE_DAY=$(qi     "select (public.projection_occurrences_for_operational_day('$DAY'::date,'2030-01-01T00:00:00Z'::timestamptz)->'data')::text")
PRE_QUEUE=$(qi   "select (public.projection_preparation_queue('2030-01-01T00:00:00Z'::timestamptz)->'data')::text")

chk "RK-1" "$PRE_HASRISK" "f" "before the migration the brief carries NO risk key — the gap this release closes is real"

# ── apply ──────────────────────────────────────────────────────────────────
APPLY=$(pg_file "$CLONE" "$MIG" 2>&1); RC=$?
chk "RK-2" "$RC" "0" "the migration applies cleanly to a pre-corrective clone"
# FATAL. Every additive claim below compares PRE against POST; if the migration
# never ran they are identical by construction and would all pass vacuously.
# The first run of this proof did exactly that — 8 green on a failed apply.
if [ "$RC" -ne 0 ]; then
  printf '%s\n' "$APPLY" | tail -8
  echo; echo "ABORT: the migration did not apply — RK-3..RESIDUE would be vacuous."
  echo "== v300 one-shot: $PASS PASS / $FAIL FAIL =="
  exit 1
fi

# ── POST capture ───────────────────────────────────────────────────────────
POST_BRIEF=$(qi   "select public.projection_occurrence_brief('$OCC'::uuid,'2030-01-01T00:00:00Z'::timestamptz)::text")
POST_DATA=$(qi    "select (public.projection_occurrence_brief('$OCC'::uuid,'2030-01-01T00:00:00Z'::timestamptz)->'data' - 'risk')::text")
POST_COUNTS=$(qi  "select (public.projection_occurrence_brief('$OCC'::uuid,'2030-01-01T00:00:00Z'::timestamptz)->'counts')::text")
POST_EXC=$(qi     "select (public.projection_occurrence_brief('$OCC'::uuid,'2030-01-01T00:00:00Z'::timestamptz)->'data'->'exceptions')::text")
POST_HASRISK=$(qi "select (public.projection_occurrence_brief('$OCC'::uuid,'2030-01-01T00:00:00Z'::timestamptz)->'data') ? 'risk'")
POST_DAY=$(qi     "select (public.projection_occurrences_for_operational_day('$DAY'::date,'2030-01-01T00:00:00Z'::timestamptz)->'data')::text")
POST_QUEUE=$(qi   "select (public.projection_preparation_queue('2030-01-01T00:00:00Z'::timestamptz)->'data')::text")

chk "RK-3" "$POST_HASRISK" "t" "after the migration the brief carries a risk key"

# ── THE ADDITIVE CLAIM · proved by subtraction ─────────────────────────────
chk "RK-4" "$([ "$PRE_DATA" = "$POST_DATA" ] && echo identical || echo moved)" "identical" \
    "data MINUS risk is byte-identical across the migration — nothing but the new key moved"
chk "RK-5" "$([ "$PRE_COUNTS" = "$POST_COUNTS" ] && echo identical || echo moved)" "identical" \
    "counts are byte-identical — counts.at_risk and counts.exceptions were not touched"
chk "RK-6" "$([ "$PRE_EXC" = "$POST_EXC" ] && echo identical || echo moved)" "identical" \
    "data.exceptions is byte-identical — the ruling's untouched key is untouched"

# ── THE VERSION RULING · the brief stays v1, so composed guards keep passing ─
chk "RK-7" "$(qi "select public.projection_occurrence_brief('$OCC'::uuid,'2030-01-01T00:00:00Z'::timestamptz)->>'version'")" "1" \
    "the brief is still occurrence_brief v1 — an additive disclosure is not a contract change"
chk "RK-8" "$(qi "select public.projection_occurrence_brief('$OCC'::uuid,'2030-01-01T00:00:00Z'::timestamptz)->>'projection'")" "occurrence_brief" \
    "and still names itself occurrence_brief"
chk "RK-9" "$([ "$PRE_DAY" = "$POST_DAY" ] && echo identical || echo moved)" "identical" \
    "projection_occurrences_for_operational_day is byte-identical — its composed v1 guard never fired"
chk "RK-10" "$([ "$PRE_QUEUE" = "$POST_QUEUE" ] && echo identical || echo moved)" "identical" \
    "projection_preparation_queue is byte-identical — the unguarded composer is unaffected too"

# ── POSTURE · the replacement kept the function's constitutional properties ──
chk "RK-11" "$(q "select p.provolatile::text||p.prosecdef::text||(array_to_string(p.proconfig,',') like '%search_path%')::text
                    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname='projection_occurrence_brief'")" "struetrue" \
    "the brief is still STABLE + SECURITY DEFINER + search_path pinned — read purity is structural"

# ── IDEMPOTENCE · re-application refuses rather than double-applying ────────
REAPPLY=$(pg_file "$CLONE" "$MIG" 2>&1 | grep -o 'V300_ALREADY_APPLIED' | head -1)
chk "RK-12" "$REAPPLY" "V300_ALREADY_APPLIED" \
    "re-applying refuses by name rather than silently re-running"

chk "RK-13" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname='v300_brief_risk'")" "1" \
    "the deployed marker is present exactly once"

# ── RESIDUE ────────────────────────────────────────────────────────────────
DELTA=$(q "select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.prokind in ('f','p')) - $PRE_ROUTINES")
chk "RESIDUE" "$DELTA" "1" "pg_proc census +1 exactly (the marker) — CREATE OR REPLACE created no overload"

echo
echo "== v300 one-shot: $PASS PASS / $FAIL FAIL =="
[ $FAIL -eq 0 ] || { printf 'failed: %s\n' "${FAILED[*]}"; exit 1; }
exit 0
