#!/usr/bin/env bash
# ============================================================================
# v302 — CERTIFICATION MECHANICS · ONE-SHOT PROOF RUNNER
#
# VM-1..VM-3  the --verify decision, all three branches
# OD-20d/e    the v292d composed version guard, proved BEHAVIOURALLY
# RESIDUE     canonical ec untouched
#
# ── WHY THE BRANCH CLAIMS DRIVE REAL MANIFESTS ─────────────────────────────
# certify-release.sh resolves its manifest from a fixed path with no env
# override, so a synthetic manifest would have to be written into
# ec/manifests/ — polluting the certified directory to test it. Three real
# releases already occupy the three branches exactly:
#
#   v300  migration + one_shot  → --verify must SKIP   (unchanged behaviour)
#   v301  one_shot, NO migration → --verify must RUN    (the correction)
#   v296  neither                → --verify unchanged   (nothing to run)
#
# Each claim asserts on GATE 01's text, NOT on the certification's exit code.
# That is deliberate: this proof is about the branch decision, and coupling it
# to whether some unrelated browser suite in v300 happened to pass would make
# it fail for reasons it does not test.
#
# ── WHY THE GUARD CLAIM USES A CLONE ───────────────────────────────────────
# OD-20d must make the brief emit version 2 to see the guard fire. That is a
# CREATE OR REPLACE on projection_occurrence_brief. It runs on a disposable
# clone and never on canonical ec: a rolled-back DDL swap on the live
# certification database is a risk with no upside when a clone is free.
#
# Run:  bash proofs/v302_proofs.sh
# Exit: 0 all PASS · 1 any FAIL
# ============================================================================
set -uo pipefail
. "${EC_LIB_PG:-ec/lib/pg.sh}"
pg_require

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLONE="ec_v302_$$"
LOGS="$(mktemp -d)"
PASS=0; FAIL=0
declare -a FAILED

ok()  { PASS=$((PASS+1)); printf '  PASS  %-8s %s\n' "$1" "$2"; }
bad() { FAIL=$((FAIL+1)); FAILED+=("$1"); printf '  FAIL  %-8s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

cleanup() { pg_drop "$CLONE"; rm -rf "$LOGS"; }
trap cleanup EXIT

echo "== v302 one-shot =="

# gate 01 of a --verify run, as one line
gate01() {
  ( cd "$REPO" && ./certify-release.sh "$1" --verify --local-only ) >"$LOGS/$1.log" 2>&1 || true
  sed -n '/^\[01\]/,/^\[02\]/p' "$LOGS/$1.log" | tr '\n' ' ' | tr -s ' '
}

# ══ VM-1 · migration + one_shot — the skip must be PRESERVED ═══════════════
G=$(gate01 v300)
chk "VM-1a" "$(printf '%s' "$G" | grep -c 'SKIPPED in --verify')" "1" \
    "v300 (migration + one_shot): --verify still skips the release one-shot"
chk "VM-1b" "$(printf '%s' "$G" | grep -c 'release one-shot proof')" "0" \
    "and its one-shot is not executed — a migrating release's proof would abort against a migrated database"

# ══ VM-2 · one_shot, NO migration — the correction ═════════════════════════
G=$(gate01 v301)
chk "VM-2a" "$(printf '%s' "$G" | grep -c 'release one-shot proof')" "1" \
    "v301 (one_shot, no migration): --verify now EXECUTES the release one-shot"
chk "VM-2b" "$(printf '%s' "$G" | grep -c 'SKIPPED in --verify')" "0" \
    "and does not claim to have skipped it"
chk "VM-2c" "$(printf '%s' "$G" | grep -c 'expected 15 PASS')" "1" \
    "and asserts the manifest's expect — the count is proved, not printed"

# ══ VM-3 · neither — unchanged ═════════════════════════════════════════════
G=$(gate01 v296)
chk "VM-3" "$(printf '%s' "$G" | grep -c 'release one-shot proof')" "0" \
    "v296 (neither migration nor one_shot): nothing is run, exactly as before"

# ══ OD-20d/e · THE COMPOSED VERSION GUARD, BEHAVIOURALLY ═══════════════════
pg_drop "$CLONE"; pg_clone ec "$CLONE" || { echo "ABORT: clone failed"; exit 1; }

read -r TENANT UID_ <<<"$(pg_q "$CLONE" \
  "select tu.tenant_id||' '||tu.user_id from public.tenant_users tu where tu.active order by tu.tenant_id limit 1")"
[ -n "${UID_:-}" ] || { echo "ABORT: no active tenant_users row"; exit 1; }
qi() { pg_qq "$CLONE" "select set_config('app.user_id','$UID_','f'), set_config('request.jwt.claim.sub','$UID_','f'); $1" | tail -n +2; }

DAY=$(pg_q "$CLONE" "select (now() + interval '13 days')::date::text")
OCC=$(qi "with b as (
            insert into public.bookings (tenant_id, contact_name, invoice_num, status)
            values ('$TENANT','OD20','OD20-'||substr(gen_random_uuid()::text,1,8),'active')
            returning id)
          select public.open_occurrence((select id from b), null, null)->>'occurrence_id'")
qi "select public.set_schedule_milestone('$OCC'::uuid,'operating_date','$DAY'::date,null,null,null,null)" >/dev/null

# the day must actually compose this occurrence, or the claim is vacuous
MEMBERS=$(qi "select jsonb_array_length(public.projection_occurrences_for_operational_day('$DAY'::date, now())->'data'->'occurrences')")
chk "OD-20d0" "$MEMBERS" "1" \
    "the fixture occurrence composes through the day projection — the guard is on the path being tested"

# swap the brief to emit version 2. Identity signature preserved, so this is a
# REPLACE and the composed projection still resolves the same function.
qi "create or replace function public.projection_occurrence_brief(
      p_occurrence uuid, p_now timestamptz default now())
    returns jsonb language sql stable security definer set search_path = public as \$fn\$
      select jsonb_build_object(
        'projection','occurrence_brief', 'version', 2, 'as_of', p_now,
        'scope', jsonb_build_object('occurrence', p_occurrence),
        'data', jsonb_build_object('identity', jsonb_build_object('occurrence', p_occurrence)),
        'counts', '{}'::jsonb, 'provenance', jsonb_build_object('truth_version','stub'))
    \$fn\$" >/dev/null

RAISED=$(qi "select public.projection_occurrences_for_operational_day('$DAY'::date, now())" 2>&1 \
          | grep -o 'V292D_COMPOSED_VERSION_MISMATCH' | head -1)
chk "OD-20d" "$RAISED" "V292D_COMPOSED_VERSION_MISMATCH" \
    "a brief at version 2 makes the composed day projection RAISE — the guard fires rather than emitting nulls"

# CONTROL: the raise must be caused by the VERSION, not by the swap itself.
qi "create or replace function public.projection_occurrence_brief(
      p_occurrence uuid, p_now timestamptz default now())
    returns jsonb language sql stable security definer set search_path = public as \$fn\$
      select jsonb_build_object(
        'projection','occurrence_brief', 'version', 1, 'as_of', p_now,
        'scope', jsonb_build_object('occurrence', p_occurrence),
        'data', jsonb_build_object('identity', jsonb_build_object('occurrence', p_occurrence)),
        'counts', '{}'::jsonb, 'provenance', jsonb_build_object('truth_version','stub'))
    \$fn\$" >/dev/null

OKV1=$(qi "select public.projection_occurrences_for_operational_day('$DAY'::date, now())->>'projection'" 2>&1 | tail -1)
chk "OD-20e" "$OKV1" "occurrences_for_operational_day" \
    "the SAME stub at version 1 composes cleanly — the refusal was the version, not the replacement"

# ══ RESIDUE · canonical ec never received the swap ═════════════════════════
chk "RESIDUE-a" "$(pg_q ec "select (public.projection_occurrence_brief(gen_random_uuid(), now()) is null)::text")" "true" \
    "canonical ec still answers I-40 for an absent occurrence — the real brief, not a stub"
chk "RESIDUE-b" "$(pg_q ec "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                             where n.nspname='public' and p.proname='v300_brief_risk'")" "1" \
    "and still carries v300 — no DDL from this proof reached the certification database"
chk "RESIDUE-c" "$(pg_q ec "select count(*) from pg_database where datname like 'ec_v302%' and datname <> '$CLONE'")" "0" \
    "no stray v302 fixture databases remain"

echo
echo "== v302 one-shot: $PASS PASS / $FAIL FAIL =="
[ $FAIL -eq 0 ] || { printf 'failed: %s\n' "${FAILED[*]}"; exit 1; }
exit 0
