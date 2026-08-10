#!/usr/bin/env bash
# ============================================================================
# v304 · CANONICAL NEXT ACTION — one-shot proofs
#
# Proves F-6 conformance and A9 fidelity on a disposable clone.
# Read-only against canonical ec; every mutation happens on the clone.
# ============================================================================
set -uo pipefail
cd /mnt/c/Users/bbgro/Downloads/eventspace-deploy
. ec/lib/pg.sh

P=0; F=0
ok()  { P=$((P+1)); printf '  PASS  %-10s %s\n' "$1" "$2"; }
bad() { F=$((F+1)); printf '  FAIL  %-10s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

C=ec_v304p_$$
pg_drop "$C" >/dev/null 2>&1
pg_clone "${EC_PROOF_SRC:-ec}" "$C" >/dev/null 2>&1 || { echo "ABORT: clone failed"; exit 1; }

RHASH="select coalesce(string_agg(md5(public.occurrence_readiness(o.id)::text), ',' order by o.id),'none') from public.engagement_occurrence o"

# Both certification states are valid: ec may or may not already carry v304,
# because gate 02 installs it. The migration preflight is CORRECT to refuse a
# second apply, so the proof adapts rather than the preflight weakening.
HAS=$(pg_q "$C" "select count(*)::text from pg_proc where proname='v304_next_action' and pronamespace='public'::regnamespace")
BEFORE=$(pg_q "$C" "$RHASH")
if [ "$HAS" = "0" ]; then
  MODE="applied"
  pg_file "$C" supabase/v304_next_action.sql >/dev/null 2>&1 || { echo "ABORT: migration failed"; pg_drop "$C"; exit 1; }
else
  MODE="preinstalled"
fi
MID=$(pg_q "$C" "$RHASH")
# exercise the projection over every occurrence, then re-read readiness
pg_q "$C" "select count(*)::text from public.engagement_occurrence o where public.occurrence_next_action(o.id) is not null" >/dev/null
echo "  mode: $MODE"

echo "=== v304 ONE-SHOT PROOFS ==="

# NA-1 marker
chk "NA-1" "$(pg_q "$C" "select public.v304_next_action()")" "v304" "deployed marker present"

# NA-2 exact signature
chk "NA-2" "$(pg_q "$C" "select pg_get_function_arguments(p.oid) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='occurrence_next_action'")" \
    "p_occurrence uuid, p_now timestamp with time zone DEFAULT now()" "signature takes p_now (as-of propagation)"

# NA-3 no existence leak
chk "NA-3" "$(pg_q "$C" "select coalesce(public.occurrence_next_action('00000000-0000-0000-0000-000000000000'::uuid)::text,'NULL')")" \
    "NULL" "returns null for an unknown occurrence"

# NA-4 no legacy dependency
chk "NA-4" "$(pg_q "$C" "select count(*)::text from regexp_matches((select prosrc from pg_proc where proname='occurrence_next_action' and pronamespace='public'::regnamespace),'obligation_state|event_stage|event_stage_detail|event_readiness|event_workspace|action_evaluate','g')")" \
    "0" "body references no legacy function"

# NA-5 A9 stated in exactly one place (F-5)
chk "NA-5" "$(pg_q "$C" "select count(*)::text from regexp_matches((select prosrc from pg_proc where proname='occurrence_next_action' and pronamespace='public'::regnamespace),'when c.code = ''overdue''','g')")" \
    "1" "A9 order stated in exactly one place"

# NA-6 exclusions — the CLAUSE, not the count of names (they also appear in the
# explanatory comment, which is why a name-frequency test would be meaningless)
chk "NA-6" "$(pg_q "$C" "select count(*)::text from regexp_matches((select prosrc from pg_proc where proname='occurrence_next_action' and pronamespace='public'::regnamespace),'not in \(''not_due'', ''release_fact_missing''\)','g')")" \
    "1" "exclusion clause present exactly once, naming both excluded grounds"

# NA-7 all eleven ranks, each exactly once
chk "NA-7" "$(pg_q "$C" "select count(distinct m[1])::text from regexp_matches((select prosrc from pg_proc where proname='occurrence_next_action' and pronamespace='public'::regnamespace),'then (\d{1,2})$','gn') m")" \
    "11" "eleven distinct ranks present"

# NA-8 never a list (PC-7.4).
# NOT a count of `limit 1` — there are legitimately two: one selects a single
# blocking responsibility by T2, one is the final selection. Counting them was a
# proxy that broke when the T2 selector was added. The real structural guarantee
# is that the result is assigned into SCALAR variables: a select-into of four
# scalars cannot yield a list, whatever the query shape.
chk "NA-8" "$(pg_q "$C" "select count(*)::text from regexp_matches((select prosrc from pg_proc where proname='occurrence_next_action' and pronamespace='public'::regnamespace),'into v_rank, v_code, v_subject, v_ground','g')")" \
    "1" "result assigned to scalars — structurally never a list"

# NA-9 authors no truth (PC-9.12)
chk "NA-9" "$(pg_q "$C" "select count(*)::text from regexp_matches(lower((select prosrc from pg_proc where proname='occurrence_next_action' and pronamespace='public'::regnamespace)),'insert |update |delete ','g')")" \
    "0" "stores nothing — no write in body"

# NA-10 stable, not volatile
chk "NA-10" "$(pg_q "$C" "select provolatile::text from pg_proc where proname='occurrence_next_action' and pronamespace='public'::regnamespace")" \
    "s" "STABLE — derived and re-derivable"

# NA-11 readiness byte-identical across install AND across use (F-5).
# BEFORE -> MID spans the migration when one runs; MID -> AFTER spans exercising
# the projection over every occurrence. Both must be inert. In the preinstalled
# state BEFORE==MID trivially and the call-invariance half still binds, so no
# assertion is skipped in either certification state.
AFTER=$(pg_q "$C" "$RHASH")
chk "NA-11" "$BEFORE|$MID" "$MID|$AFTER" "readiness byte-identical across install and across use ($MODE)"

# NA-12 at most one result per occurrence, over every live occurrence
chk "NA-12" "$(pg_q "$C" "select count(*)::text from public.engagement_occurrence o where jsonb_typeof(public.occurrence_next_action(o.id)) = 'array'")" \
    "0" "never returns an array — one action or null"

# NA-13 every returned action carries its ground and subject (F-6, PC-9.7)
chk "NA-13" "$(pg_q "$C" "select count(*)::text from public.engagement_occurrence o where public.occurrence_next_action(o.id) is not null and (public.occurrence_next_action(o.id)->'ground' is null or public.occurrence_next_action(o.id)->>'code' is null)")" \
    "0" "every returned action carries code and ground"

# NA-14 negative control: an excluded ground is never the selected code
chk "NA-14" "$(pg_q "$C" "select count(*)::text from public.engagement_occurrence o where public.occurrence_next_action(o.id)->>'code' in ('not_due','release_fact_missing')")" \
    "0" "negative control — excluded grounds never selected"

pg_drop "$C"
echo
echo "  $P PASS / $F FAIL"
[ $F -eq 0 ]
