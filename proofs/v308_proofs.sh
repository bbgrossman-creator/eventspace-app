#!/usr/bin/env bash
# ============================================================================
# v308 · AVAILABILITY DERIVATION — one-shot structural proofs
#
# The STRUCTURAL half. The behavioural half (the five corrections, Class-U
# precedence, routine-vs-override, alternation, ground fidelity) is
# supabase/tests/v308_permanent_proof.sql; the v306/v307a/v307b suites run as
# regressions and must be unchanged, because v308 touches no ceremony.
#
#   US-1  the v308 marker is installed; v306, v307a and v307b markers intact
#   US-2  all SEVEN Class-U declarations remain frozen — ordinal 0, class U,
#         null evaluator, in_scope_v306 false
#   US-3  the S/A evaluator still refuses to evaluate them: admissibility_evaluate
#         keeps its in_scope guard and never calls the v308 Class-U mechanism
#   US-4  action_evaluate derives from the authority — it calls
#         availability_class_u and admissibility_evaluate
#   US-5  availability no longer re-derives ceremony law: event_stage survives
#         ONLY on the non-ladder record_execution_evidence path
#   US-6  external shape preserved — available_actions and event_available_actions
#         keep their signatures and were not rewritten
#   US-7  the routine/override declaration: release_event carries the alternation
#         entry, and p_closeout_override is declared NOWHERE
#   US-8  the | grammar has exactly one parser and it round-trips
#   US-9  the converged gate — ordinary entries all-required, | group any-one
#   US-10 the dispatcher uses that one gate and keeps all seven typed branches
#   US-11 additive only — exactly five new functions, no table/index/trigger/
#         policy created or dropped
#   US-12 Y1 is a DECLARATION, not a special case: release_staffing_assignment
#         declares no event_not_closed rung; assign_staff and
#         correct_staffing_assignment do
# ============================================================================
set -uo pipefail
cd /mnt/c/Users/bbgro/Downloads/eventspace-deploy
. ec/lib/pg.sh

P=0; F=0
ok()  { P=$((P+1)); printf '  PASS  %-6s %s\n' "$1" "$2"; }
bad() { F=$((F+1)); printf '  FAIL  %-6s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

C=ec_v308p_$$
pg_drop "$C" >/dev/null 2>&1
pg_clone "${EC_PROOF_SRC:-ec}" "$C" >/dev/null 2>&1 || { echo "ABORT: clone failed"; exit 1; }
trap 'pg_drop "$C" >/dev/null 2>&1' EXIT

HAS=$(pg_q "$C" "select count(*)::text from pg_proc where proname='v308_availability' and pronamespace='public'::regnamespace")
if [ "$HAS" = "0" ]; then
  pg_file "$C" supabase/v308_availability_derivation.sql >/dev/null 2>&1 || { echo "ABORT: migration failed"; exit 1; }
  echo "  mode: applied"
else
  echo "  mode: preinstalled"
fi

def() { pg_q "$C" "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$1' order by p.oid limit 1"; }

MK=$(pg_q "$C" "select (select count(*) from pg_proc where proname='v308_availability')::text||'/'||(select count(*) from pg_proc where proname='v307b_class_u')::text||'/'||(select count(*) from pg_proc where proname='v307a_wiring')::text||'/'||(select count(*) from pg_proc where proname='v306_admissibility')::text")
chk US-1 "$MK" "1/1/1/1" "v308 marker installed; v306, v307a and v307b markers intact"

U=$(pg_q "$C" "select count(*)::text from public.admissibility_ladder() where condition_class='U' and ordinal=0 and evaluator is null and polarity is null and in_scope_v306=false")
chk US-2 "$U" "7" "all seven Class-U declarations remain frozen — declared, never evaluated"

EV=$(def admissibility_evaluate)
G=$(grep -c 'if not r.in_scope_v306 then continue' <<<"$EV")
Z=$(grep -c 'availability_class_u' <<<"$EV")
chk US-3 "$G/$Z" "1/0" "admissibility_evaluate keeps its in-scope guard and never calls the v308 Class-U mechanism"

AE=$(def action_evaluate)
A1=$(grep -c 'availability_class_u' <<<"$AE"); A2=$(grep -c 'admissibility_evaluate' <<<"$AE")
[ "$A1" -ge 1 ] && [ "$A2" -ge 1 ] && ok US-4 "action_evaluate derives from the authority (Class-U mechanism + admissibility_evaluate)" \
  || bad US-4 "action_evaluate does not call the authority — class_u=$A1 evaluate=$A2"

ES=$(grep -c 'event_stage' <<<"$AE")
chk US-5 "$ES" "1" "event_stage survives exactly once — the non-ladder record_execution_evidence path only"

SH=$(pg_q "$C" "select string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')->'||pg_get_function_result(p.oid), ' ' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('available_actions','event_available_actions')")
AA=$(def available_actions); EA=$(def event_available_actions)
TOUCH=$(( $(grep -c 'availability_class_u\|action_alternatives\|action_missing_required' <<<"$AA") + $(grep -c 'availability_class_u\|action_alternatives\|action_missing_required' <<<"$EA") ))
if [ "$SH" = "available_actions(p_target_type text, p_target_id uuid)->jsonb event_available_actions(p_event uuid)->jsonb" ] && [ "$TOUCH" = "0" ]; then
  ok US-6 "external shape preserved — both aggregates keep their signatures and were not rewritten"
else bad US-6 "shape or body changed — sig=[$SH] touched=$TOUCH"; fi

RF=$(pg_q "$C" "select case when 'clearance_ref|waiver_ref' = any(public.action_required_fields('release_event')) and 'signoff_ref' = any(public.action_required_fields('release_event')) then 'alt' else 'no' end")
OV=$(pg_q "$C" "select count(*)::text from (select unnest(public.action_required_fields(k)) f from (values ('release_event'),('start_service'),('close_event'),('record_execution_evidence'),('assign_staff'),('correct_staffing_assignment'),('release_staffing_assignment')) t(k)) x where x.f like '%closeout_override%'")
chk US-7 "$RF/$OV" "alt/0" "release_event declares the alternation; the authorized override is declared nowhere"

ALT=$(pg_q "$C" "select array_to_string(public.action_alternatives('clearance_ref|waiver_ref'),',')||'|'||array_to_string(public.action_alternatives('signoff_ref'),',')||'|'||coalesce(array_length(public.action_alternatives(''),1),0)::text")
chk US-8 "$ALT" "clearance_ref,waiver_ref|signoff_ref|0" "the | grammar round-trips through its single parser"

GATE=$(pg_q "$C" "select coalesce(public.action_missing_required('release_event', jsonb_build_object('signoff_ref','s','waiver_ref','w')),'ok')||'/'||coalesce(public.action_missing_required('release_event', jsonb_build_object('signoff_ref','s','clearance_ref','c')),'ok')||'/'||coalesce(public.action_missing_required('release_event', jsonb_build_object('signoff_ref','s')),'ok')||'/'||coalesce(public.action_missing_required('assign_staff', jsonb_build_object('staff','s','window_start','x')),'ok')")
chk US-9 "$GATE" "ok/ok/clearance_ref|waiver_ref/window_end" "the converged gate: | group is any-one, ordinary entries stay all-required"

PA=$(def perform_event_action)
PM=$(grep -c 'action_missing_required' <<<"$PA")
PB=$(grep -cE "p_action_key='(release_event|start_service|close_event|record_execution_evidence|assign_staff|correct_staffing_assignment|release_staffing_assignment)'" <<<"$PA")
chk US-10 "$PM/$PB" "1/7" "the dispatcher uses the one shared gate and keeps all seven typed ceremony branches"

NEW=$(pg_q "$C" "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('action_alternatives','action_missing_required','availability_class_u','availability_delegated_subject','v308_availability')")
DDL=$(grep -ciE '^\s*(create|drop|alter)\s+(table|index|trigger|policy|type)|^\s*(drop|alter)\s+function|^\s*(grant|revoke)\s' supabase/v308_availability_derivation.sql)
chk US-11 "$NEW/$DDL" "5/0" "additive only — five new functions, no table/index/trigger/policy/grant change"

Y1=$(pg_q "$C" "select (select count(*) from public.admissibility_ladder() where action_key='release_staffing_assignment' and condition='event_not_closed')::text||'/'||(select count(*) from public.admissibility_ladder() where action_key='assign_staff' and condition='event_not_closed')::text||'/'||(select count(*) from public.admissibility_ladder() where action_key='correct_staffing_assignment' and condition='event_not_closed')::text")
chk US-12 "$Y1" "0/1/1" "Y1 is a declaration: release_staffing_assignment carries no closed-event rung; the other two do and keep it"

echo
echo "  $P PASS / $F FAIL"
[ "$F" -eq 0 ] || exit 1
