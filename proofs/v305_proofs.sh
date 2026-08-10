#!/usr/bin/env bash
# ============================================================================
# v305 · CANONICAL EXECUTION FACTS — one-shot proofs
#
# Idempotent across both certification states: ec may or may not already carry
# v305, because gate 02 installs it. The migration preflight is CORRECT to
# refuse a second apply, so this proof adapts rather than the preflight
# weakening. Read-only against canonical ec; every mutation on a disposable
# clone, always dropped.
# ============================================================================
set -uo pipefail
cd /mnt/c/Users/bbgro/Downloads/eventspace-deploy
. ec/lib/pg.sh

P=0; F=0
ok()  { P=$((P+1)); printf '  PASS  %-8s %s\n' "$1" "$2"; }
bad() { F=$((F+1)); printf '  FAIL  %-8s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

C=ec_v305p_$$
pg_drop "$C" >/dev/null 2>&1
pg_clone "${EC_PROOF_SRC:-ec}" "$C" >/dev/null 2>&1 || { echo "ABORT: clone failed"; exit 1; }
trap 'pg_drop "$C" >/dev/null 2>&1' EXIT

SRC="select prosrc from pg_proc where proname='occurrence_execution_facts' and pronamespace='public'::regnamespace"
# readiness AND lifecycle together — both must be inert
INV="select coalesce(string_agg(md5(public.occurrence_readiness(o.id)::text)||md5(coalesce(public.occurrence_phase(o.id),'')), ',' order by o.id),'none') from public.engagement_occurrence o"

HAS=$(pg_q "$C" "select count(*)::text from pg_proc where proname='v305_execution_facts' and pronamespace='public'::regnamespace")
BEFORE=$(pg_q "$C" "$INV")
if [ "$HAS" = "0" ]; then
  MODE="applied"
  pg_file "$C" supabase/v305_execution_facts.sql >/dev/null 2>&1 || { echo "ABORT: migration failed"; exit 1; }
else
  MODE="preinstalled"
fi
MID=$(pg_q "$C" "$INV")
# exercise the projection over every occurrence, then re-read the invariants
pg_q "$C" "select count(*)::text from public.engagement_occurrence o where public.occurrence_execution_facts(o.id) is not null" >/dev/null
AFTER=$(pg_q "$C" "$INV")
echo "  mode: $MODE"

echo "=== v305 ONE-SHOT PROOFS ==="

chk "EF-1" "$(pg_q "$C" "select public.v305_execution_facts()")" "v305" "deployed marker present"

chk "EF-2" "$(pg_q "$C" "select pg_get_function_arguments(oid) from pg_proc where proname='occurrence_execution_facts' and pronamespace='public'::regnamespace")" \
    "p_occurrence uuid, p_now timestamp with time zone DEFAULT now()" "p_now propagated in the signature"

chk "EF-3" "$(pg_q "$C" "select provolatile::text from pg_proc where proname='occurrence_execution_facts' and pronamespace='public'::regnamespace")" \
    "s" "STABLE — derived and re-derivable"

chk "EF-4" "$(pg_q "$C" "select coalesce(public.occurrence_execution_facts('00000000-0000-0000-0000-000000000000'::uuid)::text,'NULL')")" \
    "NULL" "null for an unknown occurrence — no existence leak"

chk "EF-5" "$(pg_q "$C" "select count(*)::text from regexp_matches(($SRC),'event_stage|event_stage_detail|event_workspace|event_readiness|action_evaluate|obligation_state','g')")" \
    "0" "zero legacy references"

chk "EF-6" "$(pg_q "$C" "select count(*)::text from regexp_matches(lower(($SRC)),'insert |update |delete ','g')")" \
    "0" "authors nothing — no write in body"

# NEGATIVE CONTROL. Dependency Map line 338: progress derives from workflow,
# and workflow is not structure. No collapsed token may appear.
chk "EF-7" "$(pg_q "$C" "select count(*)::text from regexp_matches(lower(($SRC)),'''(in_service|in_progress|ready|pending|released|closed|stage|progress)''','g')")" \
    "0" "NEGATIVE CONTROL — no workflow token in the SQL body"

chk "EF-8" "$BEFORE|$MID" "$MID|$AFTER" "readiness AND lifecycle byte-identical across install and across use ($MODE)"

chk "EF-9" "$(pg_q "$C" "select count(*)::text from public.engagement_occurrence o, lateral jsonb_object_keys(coalesce(public.occurrence_execution_facts(o.id)->'by_kind','{}'::jsonb)) k where k in ('in_service','in_progress','ready','pending','released','closed','stage','progress')")" \
    "0" "NEGATIVE CONTROL — no workflow token emitted as a JSON key"

chk "EF-10" "$(pg_q "$C" "select count(*)::text from public.engagement_occurrence o where public.occurrence_execution_facts(o.id) is not null and (public.occurrence_execution_facts(o.id)->>'grain') <> 'occurrence'")" \
    "0" "grain declared on every result"

echo
echo "  $P PASS / $F FAIL"
[ $F -eq 0 ]
