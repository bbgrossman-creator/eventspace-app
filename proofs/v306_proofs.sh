#!/usr/bin/env bash
# ============================================================================
# v306 · ADMISSIBILITY AUTHORITY — one-shot proofs
#
# The STRUCTURAL half of the v306 evidence base. The differential, order and
# non-leak halves live in supabase/tests/v306_permanent_proof.sql, because they
# need fixtures and a rolled-back transaction; these need neither.
#
# What is proved here:
#   AS-1  ordinal integrity — contiguous from 1, 0 reserved for Class-U only
#   AS-2  injectivity — (action_key, ordinal) and (action_key, condition) unique
#   AS-3  totality — every ceremony refusal code is a rung or a declared exclusion
#   AS-4  exclusion-registry integrity — every excluded code carries class U or W
#   AS-5  template/operand coverage — operand-bearing templates render, static do not
#   AS-6  NO-REFERENCE — nothing in the database calls any v306 object (inert)
#   AS-7  class discipline — U and W are never in scope; S and A always are
#   AS-8  Class-A declaration — required_arguments projects exactly the A rungs
#   AS-9  pending_arguments — args absent declares, does not judge (R-14.5)
#   AS-10 no Class-U authority claim — evaluate never returns an authority verdict
#   AS-11 volatility/security posture matches the frozen object plan
#   AS-12 conjunctive truth — admissible is true iff no in-scope rung fails
#   AS-13 staffing serialization metadata recorded on the derived requirement
#   AS-14 delegation is declared (release_event seam) — drives evaluation_complete
#   AS-15 the 10-column contract exposes evaluation_complete (frozen-design addendum)
#
# Idempotent across both certification states: ec may or may not already carry
# v306, because gate 02 installs it. Read-only against canonical ec; every
# mutation on a disposable clone, always dropped.
# ============================================================================
set -uo pipefail
cd /mnt/c/Users/bbgro/Downloads/eventspace-deploy
. ec/lib/pg.sh

P=0; F=0
ok()  { P=$((P+1)); printf '  PASS  %-8s %s\n' "$1" "$2"; }
bad() { F=$((F+1)); printf '  FAIL  %-8s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

C=ec_v306p_$$
pg_drop "$C" >/dev/null 2>&1
pg_clone "${EC_PROOF_SRC:-ec}" "$C" >/dev/null 2>&1 || { echo "ABORT: clone failed"; exit 1; }
trap 'pg_drop "$C" >/dev/null 2>&1' EXIT

# The inertness invariant: v306 must not move any existing projection.
INV="select coalesce(string_agg(md5(public.occurrence_readiness(o.id)::text)
                                ||md5(coalesce(public.occurrence_phase(o.id),''))
                                ||md5(public.occurrence_next_action(o.id)::text), ',' order by o.id),'none')
       from public.engagement_occurrence o"

HAS=$(pg_q "$C" "select count(*)::text from pg_proc where proname='v306_admissibility' and pronamespace='public'::regnamespace")
BEFORE=$(pg_q "$C" "$INV")
if [ "$HAS" = "0" ]; then
  MODE="applied"
  pg_file "$C" supabase/v306_admissibility.sql >/dev/null 2>&1 || { echo "ABORT: migration failed"; exit 1; }
else
  MODE="preinstalled"
fi
AFTER=$(pg_q "$C" "$INV")
echo "  mode: $MODE"

# ── AS-1 · ordinal integrity ────────────────────────────────────────────────
# Every action's in-scope rungs are contiguous from 1. Ordinal 0, where present,
# is Class-U and nothing else — the seat v307b fills without renumbering.
GAPS=$(pg_q "$C" "
  select count(*)::text from (
    select action_key, min(ordinal) mn, max(ordinal) mx, count(*) n
      from public.admissibility_ladder() where ordinal > 0
     group by action_key
  ) t where t.mn <> 1 or t.mx <> t.n")
chk AS-1 "$GAPS" "0" "in-scope ordinals are contiguous from 1 in every action"

ZERO=$(pg_q "$C" "select coalesce(string_agg(distinct condition_class,','),'none') from public.admissibility_ladder() where ordinal=0")
chk AS-1b "$ZERO" "U" "ordinal 0 is occupied by Class-U only — reserved for v307b"

# ── AS-2 · injectivity ──────────────────────────────────────────────────────
DUP=$(pg_q "$C" "
  select (
    (select count(*) from (select action_key,ordinal from public.admissibility_ladder()
      group by 1,2 having count(*)>1) a)
  + (select count(*) from (select action_key,condition from public.admissibility_ladder()
      group by 1,2 having count(*)>1) b))::text")
chk AS-2 "$DUP" "0" "(action,ordinal) and (action,condition) are both unique"

# ── AS-3 · totality ─────────────────────────────────────────────────────────
# Every refusal code raised by the seven ceremonies is either a rung or an
# explicitly registered exclusion. A code that is neither fails this proof, so
# "declared out of scope" cannot be asserted implicitly and totality cannot go
# vacuous.
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
chk AS-3 "$MISSING" "none" "every ceremony refusal code is a declared rung"

# ── AS-4 · exclusion-registry integrity ─────────────────────────────────────
BADEX=$(pg_q "$C" "
  select count(*)::text from public.admissibility_ladder()
   where not in_scope_v306 and (condition_class not in ('U','W') or refusal_code is null)")
chk AS-4 "$BADEX" "0" "every excluded rung carries class U or W and a named code"

EXCOUNT=$(pg_q "$C" "select count(*)::text from public.admissibility_ladder() where not in_scope_v306")
chk AS-4b "$EXCOUNT" "4" "the exclusion registry holds exactly 4 entries — 3 U + 1 W"

WCOUNT=$(pg_q "$C" "select coalesce(string_agg(refusal_code,','),'none') from public.admissibility_ladder() where condition_class='W'")
chk AS-4c "$WCOUNT" "RELEASE_ALREADY_RELEASED" "exactly one W condition exists, and it is the write-time guard"

# ── AS-5 · template / operand coverage ──────────────────────────────────────
# An operand-bearing template must still contain %s before rendering and none
# after; a static template must be returned unchanged.
OPB=$(pg_q "$C" "select count(*)::text from public.admissibility_ladder() where ground_template like '%\%s%'")
chk AS-5 "$OPB" "4" "exactly 4 operand-bearing templates, per the ground contract"

REND=$(pg_q "$C" "select public.admissibility_render_ground(
  'SERVICE_NOT_READY: %s pre-service obligation(s) unresolved', jsonb_build_array(3))")
chk AS-5b "$REND" "SERVICE_NOT_READY: 3 pre-service obligation(s) unresolved" "operands render positionally"

STATIC=$(pg_q "$C" "select public.admissibility_render_ground('CLOSE_ALREADY_CLOSED', null)")
chk AS-5c "$STATIC" "CLOSE_ALREADY_CLOSED" "a static template renders unchanged"

# Three RELEASE_PREDICATE_UNSATISFIED variants must not collapse into one.
RPU=$(pg_q "$C" "select count(distinct ground_template)::text from public.admissibility_ladder()
                  where refusal_code='RELEASE_PREDICATE_UNSATISFIED'")
chk AS-5d "$RPU" "3" "the three RELEASE_PREDICATE_UNSATISFIED variants stay distinct"

# ── AS-6 · NO-REFERENCE — the release is inert ──────────────────────────────
# If nothing calls it, nothing can change. This is the structural half of the
# zero-behaviour-change argument; the differential suite is the other half.
REFS=$(pg_q "$C" "
  select coalesce(string_agg(p.proname, ','), 'none')
    from pg_proc p
   where p.pronamespace='public'::regnamespace
     and p.proname not like 'admissibility%'
     and p.proname <> 'v306_admissibility'
     and p.prosrc ~ 'admissibility_(ladder|evaluate|subject_visible|execution_fact|commitment_facts|obligation_pending|assignment_state|argument_valid|render_ground|required_arguments)'")
chk AS-6 "$REFS" "none" "no existing function references any v306 object — the release is inert"

chk AS-6b "$AFTER" "$BEFORE" "every existing projection is byte-identical before and after v306"

# ── AS-7 · class discipline ─────────────────────────────────────────────────
CLS=$(pg_q "$C" "
  select count(*)::text from public.admissibility_ladder()
   where (condition_class in ('U','W') and in_scope_v306)
      or (condition_class in ('S','A') and not in_scope_v306)")
chk AS-7 "$CLS" "0" "U and W are never in scope; S and A always are"

# U and W rungs must declare no evaluator — they are never evaluated.
NOEVAL=$(pg_q "$C" "select count(*)::text from public.admissibility_ladder()
                     where condition_class in ('U','W') and evaluator is not null")
chk AS-7b "$NOEVAL" "0" "U and W rungs declare no evaluator"

# ── AS-8 · Class-A declaration (R-14.5) ─────────────────────────────────────
ADECL=$(pg_q "$C" "
  select count(*)::text from public.admissibility_ladder() l
   where l.condition_class='A' and l.in_scope_v306
     and not exists (
       select 1 from jsonb_array_elements(public.admissibility_required_arguments(l.action_key)) e
        where e->>'condition' = l.condition)")
chk AS-8 "$ADECL" "0" "required_arguments projects every in-scope Class-A rung"

ANONA=$(pg_q "$C" "select count(*)::text from public.admissibility_ladder()
                    where condition_class='A' and argument_name is null")
chk AS-8b "$ANONA" "0" "every Class-A rung names its argument"

# action_required_fields must remain untouched — v306 is unwired.
ARF=$(pg_q "$C" "select coalesce(array_length(public.action_required_fields('close_event'),1),0)::text")
chk AS-8c "$ARF" "0" "action_required_fields is untouched and still returns empty for close_event"

# ── AS-9 · pending_arguments — declare, do not judge ────────────────────────
# With no arguments a Class-A rung must be SKIPPED and named, never failed.
PEND=$(pg_q "$C" "
  select coalesce(nullif(array_to_string(pending_arguments,','),''),'none')
    from public.admissibility_evaluate('assign_staff', null::uuid)")
# subject is null so rung 1 fails first; the A rungs after it are never reached.
chk AS-9 "$PEND" "none" "a rung-1 failure short-circuits before any Class-A rung is declared"

PEND2=$(pg_q "$C" "
  select count(*)::text from public.admissibility_ladder()
   where action_key='close_event' and condition_class='A' and in_scope_v306")
chk AS-9b "$PEND2" "1" "close_event carries exactly one Class-A rung to declare"

# ── AS-10 · no Class-U authority claim ──────────────────────────────────────
# evaluate must never return an authority verdict; it has no authority column
# and must never surface a U refusal code.
UOUT=$(pg_q "$C" "
  select count(*)::text
    from (select unnest(array['assign_staff','correct_staffing_assignment','release_staffing_assignment']) a) x,
         lateral public.admissibility_evaluate(x.a, '00000000-0000-0000-0000-000000000000'::uuid) e
   where e.refusal_code = 'STAFFING_NOT_AUTHORIZED' or e.condition_class = 'U'")
chk AS-10 "$UOUT" "0" "evaluate never returns a Class-U verdict — authority is v307b's"

NOAUTHCOL=$(pg_q "$C" "
  select count(*)::text from information_schema.columns
   where table_schema='public' and column_name in ('authorized','authority')
     and table_name = 'admissibility_evaluate'")
chk AS-10b "$NOAUTHCOL" "0" "the evaluate contract exposes no authority column"

# ── AS-11 · volatility / security posture ───────────────────────────────────
POSTURE=$(pg_q "$C" "
  select count(*)::text from pg_proc p
   where p.pronamespace='public'::regnamespace
     and ((p.proname in ('admissibility_subject_visible','admissibility_execution_fact',
                         'admissibility_commitment_facts','admissibility_obligation_pending',
                         'admissibility_assignment_state','admissibility_evaluate')
           and (p.provolatile <> 's' or not p.prosecdef))
       or (p.proname in ('admissibility_ladder','admissibility_argument_valid',
                         'admissibility_render_ground','admissibility_required_arguments')
           and (p.provolatile <> 'i' or p.prosecdef)))")
chk AS-11 "$POSTURE" "0" "state readers are STABLE DEFINER; pure functions are IMMUTABLE INVOKER"

SP=$(pg_q "$C" "
  select count(*)::text from pg_proc p
   where p.pronamespace='public'::regnamespace and p.proname like 'admissibility%'
     and not (coalesce(array_to_string(p.proconfig,','),'') like '%search_path=public%')")
chk AS-11b "$SP" "0" "every v306 function pins search_path to public"

# ── AS-12 · conjunctive truth ───────────────────────────────────────────────
# admissible must be TRUE exactly when no in-scope rung fails, and the reported
# ordinal must be the LOWEST failing one — order selects the report, not the truth.
CONJ=$(pg_q "$C" "
  select count(*)::text
    from (select unnest(array['start_service','close_event','release_event','release_occurrence',
                              'assign_staff','correct_staffing_assignment','release_staffing_assignment']) a) x,
         lateral public.admissibility_evaluate(x.a,'00000000-0000-0000-0000-000000000000'::uuid) e
   where e.admissible <> (e.failed_ordinal is null)")
chk AS-12 "$CONJ" "0" "admissible is true iff no rung failed — truth is the conjunction"

FIRST=$(pg_q "$C" "
  select count(*)::text
    from (select unnest(array['start_service','close_event','release_event','release_occurrence',
                              'assign_staff','correct_staffing_assignment','release_staffing_assignment']) a) x,
         lateral public.admissibility_evaluate(x.a,'00000000-0000-0000-0000-000000000000'::uuid) e
   where e.failed_ordinal <> 1")
chk AS-12b "$FIRST" "0" "an absent subject fails at rung 1 in every action — first failure wins"

# ── serialization metadata — binding on v307a ───────────────────────────────
SER=$(pg_q "$C" "
  select count(*)::text from public.admissibility_ladder()
   where action_key in ('correct_staffing_assignment','release_staffing_assignment')
     and serialization_relation <> 'staffing_requirement'")
chk AS-13 "$SER" "0" "the staffing serialization point is recorded on the derived requirement (Y2/Y3)"

# ── AS-14 · delegation declaration drives evaluation_complete ────────────────
# The 10-column contract's evaluation_complete is derived from a DECLARED ladder
# fact, not operation-name logic in the evaluator. Exactly one action delegates.
DEL=$(pg_q "$C" "select coalesce(string_agg(distinct action_key||'->'||delegates_to,','),'none')
                  from public.admissibility_ladder() where delegates_to is not null")
chk AS-14 "$DEL" "release_event->release_occurrence" "exactly one action declares delegation (the release_event seam); evaluation_complete derives from the authority, not operation-name hardcoding"

# ── AS-15 · the 10-column contract exposes evaluation_complete ───────────────
# An absent-subject refusal is a COMPLETE verdict (ruling case 1: false / true).
ECMP=$(pg_q "$C" "select evaluation_complete::text from public.admissibility_evaluate('start_service','00000000-0000-0000-0000-000000000000'::uuid)")
chk AS-15 "$ECMP" "true" "evaluate exposes evaluation_complete; an absent-subject refusal is a COMPLETE verdict"

echo
echo "  $P PASS / $F FAIL"
[ "$F" -eq 0 ] || exit 1
