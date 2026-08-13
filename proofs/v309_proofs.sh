#!/usr/bin/env bash
# ============================================================================
# v309 · THE DUPLICATE PREVIEWS RETIRE — one-shot structural proofs
#
# The STRUCTURAL half. The behavioural half (agreement, no-lost-action, declared
# grounds, one-source, shape preservation) is
# supabase/tests/v309_permanent_proof.sql; v306/v307a/v307b/v308 run as
# regressions and must be unchanged, because v309 moves no authority.
#
#   US-1  the v309 marker is installed; v306/v307a/v307b/v308 markers intact
#   US-2  event_workspace holds NO inline availability computation — it calls
#         the projection and no longer derives next_actions from a stage
#   US-3  event_stage_detail calls the projection and the declared kind reader
#   US-4  no literal obligation-kind list survives in either projection
#   US-5  the v308 authority is untouched — action_evaluate, availability_class_u,
#         admissibility_evaluate and admissibility_ladder know nothing of v309
#   US-6  the seven Class-U declarations remain frozen
#   US-7  external shapes preserved — available_actions and event_available_actions
#         keep their signatures and were not rewritten
#   US-8  additive only — four new functions, no table/index/trigger/policy/grant
#   US-9  the declared readers reproduce the retired literals exactly
#   US-10 application custody — every declared app file carries the release marker
# ============================================================================
set -uo pipefail
cd /mnt/c/Users/bbgro/Downloads/eventspace-deploy
. ec/lib/pg.sh

P=0; F=0
ok()  { P=$((P+1)); printf '  PASS  %-6s %s\n' "$1" "$2"; }
bad() { F=$((F+1)); printf '  FAIL  %-6s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

C=ec_v309p_$$
pg_drop "$C" >/dev/null 2>&1
pg_clone "${EC_PROOF_SRC:-ec}" "$C" >/dev/null 2>&1 || { echo "ABORT: clone failed"; exit 1; }
trap 'pg_drop "$C" >/dev/null 2>&1' EXIT

HAS=$(pg_q "$C" "select count(*)::text from pg_proc where proname='v309_preview_consolidation' and pronamespace='public'::regnamespace")
if [ "$HAS" = "0" ]; then
  pg_file "$C" supabase/v309_preview_consolidation.sql >/dev/null 2>&1 || { echo "ABORT: migration failed"; exit 1; }
  echo "  mode: applied"
else
  echo "  mode: preinstalled"
fi

def() { pg_q "$C" "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$1' order by p.oid limit 1"; }

MK=$(pg_q "$C" "select (select count(*) from pg_proc where proname='v309_preview_consolidation')::text||'/'||(select count(*) from pg_proc where proname='v308_availability')::text||'/'||(select count(*) from pg_proc where proname='v307b_class_u')::text||'/'||(select count(*) from pg_proc where proname='v307a_wiring')::text||'/'||(select count(*) from pg_proc where proname='v306_admissibility')::text")
chk US-1 "$MK" "1/1/1/1/1" "v309 marker installed; v306, v307a, v307b and v308 markers intact"

WS=$(def event_workspace)
W1=$(grep -c 'availability_lifecycle_actions' <<<"$WS")
W2=$(grep -c "v_stage='ready'\|v_bd_pending" <<<"$WS")
chk US-2 "$W1/$W2" "1/0" "event_workspace calls the projection and holds no inline availability computation"

SD=$(def event_stage_detail)
S1=$(grep -c 'availability_lifecycle_actions' <<<"$SD")
S2=$(grep -c 'availability_obligation_kinds' <<<"$SD")
chk US-3 "$S1/$S2" "1/2" "event_stage_detail renders the projection and reads its kinds from the ladder"

LIT=$(( $(grep -c "culinary_prepare','equipment_pull\|culinary_prepare','equipment_pull" <<<"$WS") + $(grep -c "culinary_prepare" <<<"$SD") ))
chk US-4 "$LIT" "0" "no literal obligation-kind list survives in either projection"

AE=$(def action_evaluate); CU=$(def availability_class_u); EVAL=$(def admissibility_evaluate); LAD=$(def admissibility_ladder)
V309REF=$(( $(grep -c 'v309\|availability_lifecycle_actions' <<<"$AE") + $(grep -c 'v309\|availability_lifecycle_actions' <<<"$CU") + $(grep -c 'v309\|availability_lifecycle_actions' <<<"$EVAL") + $(grep -c 'v309\|availability_lifecycle_actions' <<<"$LAD") ))
chk US-5 "$V309REF" "0" "the v308 authority is untouched — it knows nothing of v309"

U=$(pg_q "$C" "select count(*)::text from public.admissibility_ladder() where condition_class='U' and ordinal=0 and evaluator is null and in_scope_v306=false")
chk US-6 "$U" "7" "all seven Class-U declarations remain frozen"

SH=$(pg_q "$C" "select string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')->'||pg_get_function_result(p.oid), ' ' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('available_actions','event_available_actions')")
AA=$(def available_actions); EA=$(def event_available_actions)
TOUCH=$(( $(grep -c 'availability_lifecycle_actions' <<<"$AA") + $(grep -c 'availability_lifecycle_actions' <<<"$EA") ))
if [ "$SH" = "available_actions(p_target_type text, p_target_id uuid)->jsonb event_available_actions(p_event uuid)->jsonb" ] && [ "$TOUCH" = "0" ]; then
  ok US-7 "external shapes preserved — both aggregates keep their signatures and were not rewritten"
else bad US-7 "shape or body changed — sig=[$SH] touched=$TOUCH"; fi

NEW=$(pg_q "$C" "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('availability_lifecycle_actions','availability_obligation_kinds','availability_declared_ground','v309_preview_consolidation')")
DDL=$(grep -ciE '^\s*(create|drop|alter)\s+(table|index|trigger|policy|type)|^\s*(drop|alter)\s+function|^\s*(grant|revoke)\s' supabase/v309_preview_consolidation.sql)
chk US-8 "$NEW/$DDL" "4/0" "additive only — four new functions, no table/index/trigger/policy/grant change"

KINDS=$(pg_q "$C" "select array_to_string(public.availability_obligation_kinds('start_service'),',')||'|'||array_to_string(public.availability_obligation_kinds('close_event'),',')")
chk US-9 "$KINDS" "culinary_prepare,equipment_pull,staffing_assign,venue_setup|venue_breakdown" "the declared readers reproduce the retired literals exactly"

APPN=0
for f in src/components/execution/EventWorkspace.tsx src/components/execution/EventLifecycle.tsx src/components/execution/ActionPanel.tsx src/lib/execution/spine.ts; do
  grep -q 'v309-canonical-availability' "$f" && APPN=$((APPN+1))
done
chk US-10 "$APPN" "4" "application custody — every declared app file carries the release marker"

echo
echo "  $P PASS / $F FAIL"
[ "$F" -eq 0 ] || exit 1
