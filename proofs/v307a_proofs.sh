#!/usr/bin/env bash
# ============================================================================
# v307a · CEREMONY WIRING — one-shot structural proofs
#
# The STRUCTURAL half: the seven ceremonies consume the authority, keep their
# locks in place, do not duplicate authority logic, and do not close Class-U
# (that is v307b). The BEHAVIORAL half (equivalence + Y3/R1 guards) is
# supabase/tests/v307a_permanent_proof.sql; the full 38-claim ceremony-vs-authority
# differential runs as the v306_permanent_proof regression against the migrated
# ceremonies.
#
#   WS-1  the v307a marker is installed
#   WS-2  all seven ceremonies reference admissibility_evaluate
#   WS-3  start_service keeps its `for update` (lock owns CEREMONY_NOT_FOUND)
#   WS-4  close_event keeps its `for update`
#   WS-5  release_event keeps its `for update` on bookings
#   WS-6  release_occurrence keeps its `for update` on engagement_occurrence
#   WS-7  assign_staff keeps Class-U inline AND its requirement `for update`
#   WS-8  correct_staffing: U inline, UNLOCKED existence, requirement `for update` (Y2/Y3)
#   WS-9  release_staffing: U inline, UNLOCKED existence, requirement `for update` (Y2/Y3)
#   WS-10 the three staffing ceremonies still gate on can_manage_staffing (U untouched)
#   WS-11 the four non-staffing ceremonies add NO authorization (Class-U deferred to v307b)
#   WS-12 no wired ceremony re-declares an S/A refusal literal the authority owns
#   WS-13 R1 preserved — release_occurrence keeps the write-time RELEASE_ALREADY_RELEASED guard
# ============================================================================
set -uo pipefail
cd /mnt/c/Users/bbgro/Downloads/eventspace-deploy
. ec/lib/pg.sh

P=0; F=0
ok()  { P=$((P+1)); printf '  PASS  %-6s %s\n' "$1" "$2"; }
bad() { F=$((F+1)); printf '  FAIL  %-6s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

C=ec_v307ap_$$
pg_drop "$C" >/dev/null 2>&1
pg_clone "${EC_PROOF_SRC:-ec}" "$C" >/dev/null 2>&1 || { echo "ABORT: clone failed"; exit 1; }
trap 'pg_drop "$C" >/dev/null 2>&1' EXIT

HAS=$(pg_q "$C" "select count(*)::text from pg_proc where proname='v307a_wiring' and pronamespace='public'::regnamespace")
if [ "$HAS" = "0" ]; then
  pg_file "$C" supabase/v307a_wiring.sql >/dev/null 2>&1 || { echo "ABORT: migration failed"; exit 1; }
  echo "  mode: applied"
else
  echo "  mode: preinstalled"
fi

def() { pg_q "$C" "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$1' order by p.oid limit 1"; }

chk WS-1 "$(pg_q "$C" "select count(*)::text from pg_proc where proname='v307a_wiring' and pronamespace='public'::regnamespace")" "1" "v307a marker installed"

WIRED=$(pg_q "$C" "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and prosrc ~ 'admissibility_evaluate' and proname in ('start_service','close_event','release_event','release_occurrence','assign_staff','correct_staffing_assignment','release_staffing_assignment')")
chk WS-2 "$WIRED" "7" "all seven ceremonies consume admissibility_evaluate"

grep -q 'for update' <<<"$(def start_service)"      && ok WS-3 "start_service keeps its lock"      || bad WS-3 "start_service lost its for-update"
grep -q 'for update' <<<"$(def close_event)"        && ok WS-4 "close_event keeps its lock"        || bad WS-4 "close_event lost its for-update"
grep -q 'for update' <<<"$(def release_event)"      && ok WS-5 "release_event keeps its lock"      || bad WS-5 "release_event lost its for-update"
grep -q 'for update' <<<"$(def release_occurrence)" && ok WS-6 "release_occurrence keeps its lock" || bad WS-6 "release_occurrence lost its for-update"

AS=$(def assign_staff)
{ grep -q 'can_manage_staffing' <<<"$AS" && grep -q 'staffing_requirement' <<<"$AS" && grep -q 'for update' <<<"$AS"; } \
  && ok WS-7 "assign_staff keeps Class-U + requirement lock" || bad WS-7 "assign_staff structure changed"

# correct/release_staffing: existence select on staffing_assignment is UNLOCKED (no 'for update'
# on that line), and the ONLY 'for update' is on staffing_requirement.
for fn in correct_staffing_assignment release_staffing_assignment; do
  D=$(def $fn)
  u_lock_on_req=$(grep -c 'staffing_requirement where id=v_req and tenant_id=v_tenant for update' <<<"$D")
  asg_line_locked=$(grep 'from public.staffing_assignment where id=p_assignment' <<<"$D" | grep -c 'for update')
  has_u=$(grep -c 'can_manage_staffing' <<<"$D")
  if [ "$u_lock_on_req" = "1" ] && [ "$asg_line_locked" = "0" ] && [ "$has_u" -ge 1 ]; then
    [ "$fn" = "correct_staffing_assignment" ] && ok WS-8 "$fn: U inline, unlocked existence, derived requirement lock" \
                                              || ok WS-9 "$fn: U inline, unlocked existence, derived requirement lock"
  else
    [ "$fn" = "correct_staffing_assignment" ] && bad WS-8 "$fn lock structure changed (reqlock=$u_lock_on_req asglock=$asg_line_locked u=$has_u)" \
                                              || bad WS-9 "$fn lock structure changed (reqlock=$u_lock_on_req asglock=$asg_line_locked u=$has_u)"
  fi
done

USTAFF=$(pg_q "$C" "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and prosrc ~ 'can_manage_staffing' and proname in ('assign_staff','correct_staffing_assignment','release_staffing_assignment')")
chk WS-10 "$USTAFF" "3" "the three staffing ceremonies still gate on can_manage_staffing (Class-U untouched)"

UNONSTAFF=$(pg_q "$C" "select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and prosrc ~ 'can_[a-z_]+\(' and proname in ('start_service','close_event','release_event','release_occurrence')")
chk WS-11 "$UNONSTAFF" "0" "the four non-staffing ceremonies add no authorization (Class-U deferred to v307b)"

# WS-12 · no wired ceremony re-declares an S/A refusal literal the authority owns.
# start_service owns SERVICE_* / START_SERVICE_* only via the authority now.
SS=$(def start_service)
LEAK=0
for lit in SERVICE_NOT_READY SERVICE_STAFFING_UNCOVERED SERVICE_ALREADY_STARTED START_SERVICE_EVENT_CLOSED; do
  grep -q "$lit" <<<"$SS" && LEAK=$((LEAK+1))
done
chk WS-12 "$LEAK" "0" "start_service no longer re-declares any authority-owned S refusal literal"

grep -q 'RELEASE_ALREADY_RELEASED' <<<"$(def release_occurrence)" \
  && ok WS-13 "R1 preserved — release_occurrence keeps the write-time RELEASE_ALREADY_RELEASED guard" \
  || bad WS-13 "R1 write guard missing from release_occurrence"

# WS-14 · M-A guard (Fable v307a audit): the acceptance re-select is guarded
# before the NOT NULL materialisation insert — the post-evaluation rescission
# window refuses through the vocabulary, never as a 23502.
RO=$(def release_occurrence)
GP=$(awk 'BEGIN{g=0;i=0} /if v_acc is null/{if(!g)g=NR} /insert into public.event/{if(!i)i=NR} END{print (g>0 && i>0 && g<i) ? "ok" : "bad ("g","i")"}' <<<"$RO")
[ "$GP" = "ok" ] && ok WS-14 "M-A acceptance guard present before the materialisation insert" \
                 || bad WS-14 "M-A guard missing or misplaced: $GP"

echo
echo "  $P PASS / $F FAIL"
[ "$F" -eq 0 ] || exit 1
