#!/usr/bin/env bash
# ============================================================================
# v307b · CLASS-U CLOSURE — one-shot structural proofs
#
# The STRUCTURAL half. The behavioral half (refusals, precedence, cross-tenant,
# wrapper coherence, zero-writes) is supabase/tests/v307b_permanent_proof.sql;
# the v306 differential and v307a equivalence suites run as regressions.
#
#   US-1  the v307b marker is installed; v306 and v307a markers still present
#   US-2  ordinal 0 now holds exactly SEVEN rungs, all Class-U
#   US-3  exclusion registry = 8 (7 U + 1 W), every entry named
#   US-4  exactly four EXECUTION_NOT_AUTHORIZED rungs, each with its per-ceremony
#         detail template (ruling v307b-R1: one code, ceremony as ground)
#   US-5  totality — every ceremony refusal code is a declared rung (incl. the new code)
#   US-6  evaluate still NEVER returns a Class-U verdict (Amendment Four C intact)
#   US-7  all SEVEN ceremonies carry an inline authorizer — 3 can_manage_staffing,
#         4 is_active_member — no bypass among the wired ceremonies
#   US-8  Class-U is FIRST: in each of the four, the authorizer precedes the lock
#   US-9  in-scope ordinals remain contiguous from 1 (no renumbering)
#   US-10 delegation declaration unchanged (release_event -> release_occurrence only)
#   US-11 the three RELEASE_PREDICATE_UNSATISFIED variants remain distinct
#   US-12 the M-A acceptance guard is carried intact in release_occurrence
# ============================================================================
set -uo pipefail
cd /mnt/c/Users/bbgro/Downloads/eventspace-deploy
. ec/lib/pg.sh

P=0; F=0
ok()  { P=$((P+1)); printf '  PASS  %-6s %s\n' "$1" "$2"; }
bad() { F=$((F+1)); printf '  FAIL  %-6s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

C=ec_v307bp_$$
pg_drop "$C" >/dev/null 2>&1
pg_clone "${EC_PROOF_SRC:-ec}" "$C" >/dev/null 2>&1 || { echo "ABORT: clone failed"; exit 1; }
trap 'pg_drop "$C" >/dev/null 2>&1' EXIT

HAS=$(pg_q "$C" "select count(*)::text from pg_proc where proname='v307b_class_u' and pronamespace='public'::regnamespace")
if [ "$HAS" = "0" ]; then
  pg_file "$C" supabase/v307b_class_u.sql >/dev/null 2>&1 || { echo "ABORT: migration failed"; exit 1; }
  echo "  mode: applied"
else
  echo "  mode: preinstalled"
fi

def() { pg_q "$C" "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$1' order by p.oid limit 1"; }

MK=$(pg_q "$C" "select (select count(*) from pg_proc where proname='v307b_class_u')::text||'/'||(select count(*) from pg_proc where proname='v307a_wiring')::text||'/'||(select count(*) from pg_proc where proname='v306_admissibility')::text")
chk US-1 "$MK" "1/1/1" "v307b marker installed; v306 and v307a markers intact"

Z=$(pg_q "$C" "select count(*)::text||'·'||coalesce(string_agg(distinct condition_class,','),'none') from public.admissibility_ladder() where ordinal=0")
chk US-2 "$Z" "7·U" "ordinal 0 holds exactly seven rungs, all Class-U"

EX=$(pg_q "$C" "select count(*)::text||'·'||(select count(*) from public.admissibility_ladder() where not in_scope_v306 and condition_class='U')::text||'·'||(select count(*) from public.admissibility_ladder() where not in_scope_v306 and condition_class='W')::text||'·'||(select count(*) from public.admissibility_ladder() where not in_scope_v306 and refusal_code is null)::text from public.admissibility_ladder() where not in_scope_v306")
chk US-3 "$EX" "8·7·1·0" "exclusion registry = 8 (7 U + 1 W), every entry named"

EN=$(pg_q "$C" "select count(*)::text from public.admissibility_ladder() where refusal_code='EXECUTION_NOT_AUTHORIZED' and condition_class='U' and ordinal=0 and ground_template = 'EXECUTION_NOT_AUTHORIZED: '||action_key and action_key in ('start_service','close_event','release_event','release_occurrence')")
chk US-4 "$EN" "4" "four EXECUTION_NOT_AUTHORIZED rungs, one code, per-ceremony detail (v307b-R1)"

MISSING=$(pg_q "$C" "
  with ceremony_codes as (
    select distinct m[1] as code
      from pg_proc p,
           lateral regexp_matches(p.prosrc, 'raise exception ''([A-Z_]+)', 'g') m
     where p.pronamespace='public'::regnamespace
       and p.proname in ('start_service','close_event','release_event','release_occurrence',
                         'assign_staff','correct_staffing_assignment','release_staffing_assignment')
  )
  select coalesce(string_agg(c.code, ','), 'none')
    from ceremony_codes c
   where not exists (select 1 from public.admissibility_ladder() l where l.refusal_code = c.code)")
chk US-5 "$MISSING" "none" "totality holds — every ceremony refusal code (incl. the new one) is a declared rung"

UOUT=$(pg_q "$C" "
  select count(*)::text
    from (select unnest(array['start_service','close_event','release_event','release_occurrence',
                              'assign_staff','correct_staffing_assignment','release_staffing_assignment']) a) x,
         lateral public.admissibility_evaluate(x.a, '00000000-0000-0000-0000-000000000000'::uuid) e
   where e.refusal_code in ('EXECUTION_NOT_AUTHORIZED','STAFFING_NOT_AUTHORIZED') or e.condition_class = 'U'")
chk US-6 "$UOUT" "0" "evaluate never returns a Class-U verdict — declared, not evaluated (Amendment Four C)"

AUTH=$(pg_q "$C" "select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and prosrc ~ 'can_manage_staffing' and proname in ('assign_staff','correct_staffing_assignment','release_staffing_assignment'))::text||'/'||(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and prosrc ~ 'is_active_member' and proname in ('start_service','close_event','release_event','release_occurrence'))::text")
chk US-7 "$AUTH" "3/4" "all seven ceremonies carry an inline authorizer — no bypass among the wired ceremonies"

UFIRST=0
for fn in start_service close_event release_event release_occurrence; do
  D=$(def $fn)
  A=$(awk '/is_active_member/{print NR; exit}' <<<"$D")
  L=$(awk '/for update/{print NR; exit}' <<<"$D")
  [ -n "$A" ] && [ -n "$L" ] && [ "$A" -lt "$L" ] && UFIRST=$((UFIRST+1))
done
chk US-8 "$UFIRST" "4" "Class-U is FIRST — the authorizer precedes the lock in all four ceremonies"

GAPS=$(pg_q "$C" "
  select count(*)::text from (
    select action_key, min(ordinal) mn, max(ordinal) mx, count(*) n
      from public.admissibility_ladder() where ordinal > 0
     group by action_key
  ) t where t.mn <> 1 or t.mx <> t.n")
chk US-9 "$GAPS" "0" "in-scope ordinals remain contiguous from 1 — the reserved-seat guarantee held"

DEL=$(pg_q "$C" "select coalesce(string_agg(distinct action_key||'->'||delegates_to,','),'none') from public.admissibility_ladder() where delegates_to is not null")
chk US-10 "$DEL" "release_event->release_occurrence" "delegation declaration unchanged"

RPU=$(pg_q "$C" "select count(distinct ground_template)::text from public.admissibility_ladder() where refusal_code='RELEASE_PREDICATE_UNSATISFIED'")
chk US-11 "$RPU" "3" "the three RELEASE_PREDICATE_UNSATISFIED variants remain distinct"

RO=$(def release_occurrence)
GP=$(awk 'BEGIN{g=0;i=0} /if v_acc is null/{if(!g)g=NR} /insert into public.event/{if(!i)i=NR} END{print (g>0 && i>0 && g<i) ? "ok" : "bad"}' <<<"$RO")
chk US-12 "$GP" "ok" "the M-A acceptance guard is carried intact ahead of the materialisation"

echo
echo "  $P PASS / $F FAIL"
[ "$F" -eq 0 ] || exit 1
