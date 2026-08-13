#!/usr/bin/env bash
# ============================================================================
# v310 · event_stage COMPATIBILITY — one-shot structural proofs
#
# The STRUCTURAL half. The behavioural half (vocabulary, E-1, the impossible
# contradiction, payload compatibility, narrative agreement) is
# supabase/tests/v310_permanent_proof.sql; v306..v309 run as regressions.
#
#   US-1  the v310 marker is installed; v306/v307a/v307b/v308/v309 intact
#   US-2  event_stage keeps its exact callable contract
#   US-3  event_stage derives from CANONICAL authorities — it calls the
#         execution-fact authority and asks the admissibility authority
#   US-4  the obsolete independent readiness rule is GONE: no pre-service
#         obligation scan and no v_pre_total-style guard survives in event_stage
#   US-5  L20 · the stage-keyed blocker selector is retired from BOTH
#         projections
#   US-6  L21 · PRESERVED — action_evaluate still carries exactly one
#         event_stage call, so v308's frozen one-shot US-5 remains true
#   US-7  frozen authority untouched — admissibility_evaluate,
#         admissibility_ladder, action_evaluate and availability_class_u know
#         nothing of v310
#   US-8  the seven Class-U declarations remain frozen
#   US-9  external shapes preserved — available_actions,
#         event_available_actions and availability_lifecycle_actions unchanged
#   US-10 DATABASE-ONLY — the release declares no application file
#   US-11 additive only — two new functions, no table/index/trigger/policy/grant
#   US-12 .stage survives in both ceremony success payloads
# ============================================================================
set -uo pipefail
cd /mnt/c/Users/bbgro/Downloads/eventspace-deploy
. ec/lib/pg.sh

P=0; F=0
ok()  { P=$((P+1)); printf '  PASS  %-6s %s\n' "$1" "$2"; }
bad() { F=$((F+1)); printf '  FAIL  %-6s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

C=ec_v310p_$$
pg_drop "$C" >/dev/null 2>&1
pg_clone "${EC_PROOF_SRC:-ec}" "$C" >/dev/null 2>&1 || { echo "ABORT: clone failed"; exit 1; }
trap 'pg_drop "$C" >/dev/null 2>&1' EXIT

HAS=$(pg_q "$C" "select count(*)::text from pg_proc where proname='v310_stage_compatibility' and pronamespace='public'::regnamespace")
if [ "$HAS" = "0" ]; then
  pg_file "$C" supabase/v310_stage_compatibility.sql >/dev/null 2>&1 || { echo "ABORT: migration failed"; exit 1; }
  echo "  mode: applied"
else
  echo "  mode: preinstalled"
fi

def() { pg_q "$C" "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$1' order by p.oid limit 1"; }

MK=$(pg_q "$C" "select (select count(*) from pg_proc where proname='v310_stage_compatibility')::text||'/'||(select count(*) from pg_proc where proname='v309_preview_consolidation')::text||'/'||(select count(*) from pg_proc where proname='v308_availability')::text||'/'||(select count(*) from pg_proc where proname='v307b_class_u')::text||'/'||(select count(*) from pg_proc where proname='v307a_wiring')::text||'/'||(select count(*) from pg_proc where proname='v306_admissibility')::text")
chk US-1 "$MK" "1/1/1/1/1/1" "v310 marker installed; v306, v307a, v307b, v308 and v309 markers intact"

SIG=$(pg_q "$C" "select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')->'||pg_get_function_result(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='event_stage'")
chk US-2 "$SIG" "event_stage(p_event uuid)->text" "event_stage keeps its exact callable contract"

ES=$(def event_stage)
C1=$(grep -c 'admissibility_execution_fact' <<<"$ES")
C2=$(grep -c 'stage_action_admissible' <<<"$ES")
[ "$C1" -ge 2 ] && [ "$C2" -ge 1 ] && ok US-3 "event_stage derives from canonical authorities (execution facts + the admissibility verdict)" \
  || bad US-3 "event_stage does not consult the canonical authorities — facts=$C1 verdict=$C2"

OLD=$(grep -c "culinary_prepare\|v_pre_total\|event_staffing_ready" <<<"$ES")
chk US-4 "$OLD" "0" "the obsolete independent readiness rule is gone — no pre-service scan, no v_pre_total guard"

SD=$(def event_stage_detail); WS=$(def event_workspace)
SEL=$(( $(grep -c "v_stage in ('released','in_prep')\|v_stage = 'in_service'\|v_stage='in_service'" <<<"$SD") + $(grep -c "v_stage='in_service'\|v_stage = 'in_service'" <<<"$WS") ))
chk US-5 "$SEL" "0" "L20 — the stage-keyed blocker selector is retired from both projections"

AE=$(def action_evaluate)
L21=$(grep -o 'event_stage(' <<<"$AE" | wc -l)
chk US-6 "$L21" "1" "L21 PRESERVED — action_evaluate still carries exactly one event_stage call (v308 US-5 stays true)"

EVAL=$(def admissibility_evaluate); LAD=$(def admissibility_ladder); CU=$(def availability_class_u)
V310REF=$(( $(grep -c 'v310\|stage_action_admissible' <<<"$EVAL") + $(grep -c 'v310\|stage_action_admissible' <<<"$LAD") + $(grep -c 'v310\|stage_action_admissible' <<<"$AE") + $(grep -c 'v310\|stage_action_admissible' <<<"$CU") ))
chk US-7 "$V310REF" "0" "frozen v306/v308/v309 authority is untouched — it knows nothing of v310"

U=$(pg_q "$C" "select count(*)::text from public.admissibility_ladder() where condition_class='U' and ordinal=0 and evaluator is null and in_scope_v306=false")
chk US-8 "$U" "7" "all seven Class-U declarations remain frozen"

SH=$(pg_q "$C" "select string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')->'||pg_get_function_result(p.oid), ' ' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('available_actions','event_available_actions','availability_lifecycle_actions')")
chk US-9 "$SH" "availability_lifecycle_actions(p_event uuid)->jsonb available_actions(p_target_type text, p_target_id uuid)->jsonb event_available_actions(p_event uuid)->jsonb" "external availability shapes preserved"

APPF=$(grep -cE '^(app_files|app_marker)' ec/manifests/v310.manifest)
GITAPP=$(grep '^git_files' ec/manifests/v310.manifest | grep -cE 'src/|browser-tests/')
chk US-10 "$APPF/$GITAPP" "0/0" "DATABASE-ONLY — the release declares no application file"

NEW=$(pg_q "$C" "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('stage_action_admissible','v310_stage_compatibility')")
DDL=$(grep -ciE '^\s*(create|drop|alter)\s+(table|index|trigger|policy|type)|^\s*(drop|alter)\s+function|^\s*(grant|revoke)\s' supabase/v310_stage_compatibility.sql)
chk US-11 "$NEW/$DDL" "2/0" "additive only — two new functions, no table/index/trigger/policy/grant change"

SS=$(def start_service); CE=$(def close_event)
PAY=$(( $(grep -c "'stage', public.event_stage" <<<"$SS") + $(grep -c "'stage', public.event_stage" <<<"$CE") ))
chk US-12 "$PAY" "2" ".stage survives on both ceremony success payloads — the compatibility contract is intact"

echo
echo "  $P PASS / $F FAIL"
[ "$F" -eq 0 ] || exit 1
