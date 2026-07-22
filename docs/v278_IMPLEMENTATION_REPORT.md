# EventCore — v278 Staffing Assignment & Coverage · IMPLEMENTATION REPORT

The first operational vertical slice. From the certified v277 baseline, in the
order constitution → SQL relations → ceremonies → projections → integration →
proof → race → application → mounted UI → browser acceptance → regression. No
frozen Proposal Lifecycle object and no v275/v276/v277 object was reopened except
the three additive, backward-compatible integration points the v278 mandate
requires (event_stage, start_service, event_workspace).

## New invariants

- **I-42** staffing requirements DERIVE from released operational truth (deterministic,
  natural-keyed from released staffing obligations; editable proposal content cannot
  alter a released requirement; the sealed source is itself immutable).
- **I-43** staffing assignments are EXPLICIT authoritative relations, never JSON.
- **I-44** staffing history is PERMANENT — correction/removal are append-only facts;
  no hard delete; the original assignment always survives.
- **I-45** staffing coverage is DERIVED (required/assigned/shortage/over projected;
  no stored covered/staffed/status column).
- **I-46** scheduling conflicts are PROJECTED with half-open overlap semantics
  ([start,end); adjacent windows do not overlap).
- **I-47** staffing authority is TENANT-SCOPED and DEFAULT-DENY.

## Staff source

The person assigned resolves to the EXISTING authoritative tenant staff roster
`public.staff` (used across the app: `from("staff")`, `interface Staff`; present in
production via v189). v278 introduces **no second employee directory**. A
compatibility guard (`create table if not exists public.staff`) ensures the roster
exists on a fresh deploy and is a no-op where it already exists; the assignment
holds a soft `staff_ref` validated against the roster in the ceremony.

## What was built

**SQL relations** — `supabase/v278_staffing.sql`: `staffing_requirement`,
`staffing_assignment`, `staffing_release` (append-only, insert+select RLS, no
update/delete policy = the immutability backstop) + the staff compat guard.

**Ceremonies** — `supabase/v278_ceremonies.sql` (established pattern): `can_manage_staffing`,
`generate_staffing_requirements` (deterministic/idempotent, quantity from the frozen
model), `assign_staff`, `correct_staffing_assignment`, `release_staffing_assignment`.

**Projections** — `supabase/v278_projections.sql`: `staffing_assignment_active`,
`staff_overlap_count` (half-open), `requirement_coverage`, `event_staffing_ready`,
`event_staffing_summary`, `eligible_staff`.

**Integration (additive, backward-compatible)** — `supabase/v278_integration.sql`:
`event_stage` ready predicate and `start_service` now also require staffing coverage;
`event_workspace` gains a first-class `staffing` section, merges staffing coverage
blockers, and exposes `can_manage_staffing` in the header. All vacuous when an event
has no staffing requirements, so v275/v276/v277 are unchanged.

**Application** — `src/lib/execution/spine.ts`: staffing types + `getEligibleStaff`,
`assignStaff`, `correctStaffingAssignment`, `releaseStaffingAssignment`.

**UI (mounted + browser-verified)** — `src/components/execution/StaffingSection.tsx`,
rendered inside `EventWorkspace` (Booking → Event Operations → workspace). Renders
the derived coverage per requirement (role, required/assigned, shortage, conflicts,
each assignee + window) and, for authorized users only, a thin assign/remove control
that routes directly to the ceremonies and refreshes the whole projection.

## Deployment order

Additive after the v277 stack:
1. `supabase/v278_staffing.sql`
2. `supabase/v278_projections.sql`
3. `supabase/v278_ceremonies.sql`
4. `supabase/v278_integration.sql`
5. grants; then application + UI; then canon §6.49

Because v278 adds SQL migrations, the run-needed files are presented individually
alongside the zip: `v278_staffing.sql`, `v278_projections.sql`, `v278_ceremonies.sql`,
`v278_integration.sql` (production migrations), and `v278_proof.sql`, `v278_race.sql`
(verification only — never deployed to production).

## Proof instructions

Against a database built through v277 + the four v278 migrations:
```
psql -d ec -f supabase/tests/v278_proof.sql        # 22 PASS / 0 FAIL, self-rolling-back
```

## Race instructions

A race file IS constitutionally necessary — v278 adds concurrency-sensitive write
ceremonies. On a THROWAWAY database only (it COMMITs):
```
psql -d ecrace -f supabase/tests/v278_race.sql     # installs race278_* helpers
for S in DUP FP CFR ACR ACL; do
  psql -d ecrace -c "select race278_setup('$S')"; psql -d ecrace -c "select race278_arm('$S')"
  psql -d ecrace -c "select race278_a('$S')" & psql -d ecrace -c "select race278_b('$S')" & wait
  psql -d ecrace -c "select race278_verdict('$S')"
done
```
All 5 pairs PASS in both launch orders.

## Browser-test instructions

```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-staffing.mjs   # v278 → 10 passed
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-workspace.mjs  # v277 → 13 passed
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-event-ops.mjs  # v276 → 5 passed
```

## Regression results

- v278 proof 22/22; races 5/5 both orders; browser 10/10.
- Full standing bar on the v278 stack: PL v271 (15), v272 (37), v273 (35), v275 (26),
  v276 (18), v277 (12), v278 (22) — all PASS. v277 (13) + v276 (5) browser green.
- TypeScript clean under strict; no PL/v275/v276/v277 proof or race modified.

## Exact write-set inventory

SQL: `v278_staffing.sql`, `v278_projections.sql`, `v278_ceremonies.sql`,
`v278_integration.sql`.
Tests: `tests/v278_proof.sql`, `tests/v278_race.sql`.
Application: `src/lib/execution/spine.ts` (staffing client + types; WsHeader +
can_manage_staffing; EventWorkspace + staffing).
UI: `src/components/execution/StaffingSection.tsx` (new); `EventWorkspace.tsx`
(renders StaffingSection).
Browser: `browser-tests/accept-staffing.mjs` (new); `event-ops.harness.tsx`
(staffing fixtures); `mock-supabase.ts` (eligible_staff / assign_staff /
release / correct handlers).
Docs: `docs/PUBLICATION.md` §6.49, `docs/v278_IMPLEMENTATION_REPORT.md`.

## Untouched frozen files

All PL-1…PL-4 objects, ceremonies, proofs, races; invariants I-15…I-30. All v275
and v276 SQL objects except the two additive integration replacements (event_stage,
start_service) required by the mandate — both preserve prior behavior exactly when
an event has no staffing requirements (proven by the unchanged v275/v276 proofs). The
v277 `event_workspace` is extended additively (staffing section + header flag); the
v277 proof remains green. `obligation_state`, `event_readiness`, `event_stage_detail`,
`release_event`, `generate_obligations`, `record_execution_evidence`, `close_event`
are unchanged.
