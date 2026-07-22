# EventCore — v276 Event Lifecycle & Stage Projection · IMPLEMENTATION REPORT

Second Execution OS slice, implemented to the v276 mission in the order
constitution → SQL → proofs → race → application → UI, from the certified v275
baseline. The frozen PL layer (I-15…I-30) and the v275 spine are untouched.

## Governing law preserved

The relation is authoritative; status is a projection. Event stage is derived
entirely from immutable evidence, obligation state, dependencies, and two
authorized lifecycle ceremonies. **No** mutable `event.stage`, `event.status`,
`booking.status`, workflow flag, or UI-owned lifecycle value exists.

## Lifecycle predicate specification (derived, most-advanced-first)

- **closed** — an `event_closed` fact exists (written only by `close_event`).
- **in_service** — a `service_start` fact exists (written only by `start_service`).
- **ready** — every pre-service obligation (culinary_prepare, equipment_pull,
  staffing_assign, venue_setup) is resolved (complete|invalidated) with no
  pre-service exception.
- **in_prep** — at least one preparation action has begun (an obligation is
  active|complete, or any assignment/scan/inspection/completion evidence exists).
- **released** — materialized by Operational Release with no preparation evidence.

## What was built

**SQL (additive, after v275):**
- `v276_lifecycle.sql` — extends the evidence-kind check with two authorized
  lifecycle facts (`service_start`, `event_closed`); `event_stage` (the
  authoritative derivation) and `event_stage_detail` (stage · why · established_by
  · blockers · next_action · readiness).
- `v276_ceremonies.sql` — `start_service` (default-deny; ready gate load-bearing)
  and `close_event` (default-deny; refuses on breakdown-pending / open-exception /
  unresolved closeout; requires an explicit authorized closeout override recorded
  as evidence — never a fabricated close).

**Application:** `src/lib/execution/spine.ts` extended with `getEventStageDetail`,
`getEventStage`, `startService`, `closeEvent` (the app renders the SQL derivation;
no second lifecycle calculation in React).

**UI (mounted + browser-verified):** `src/components/execution/EventLifecycle.tsx`
— the stage rail, reason, established-by facts, named blockers, next authorized
action, and lifecycle action buttons. It is composed with the v275 `ReleaseAction`
and `DailyOpsEvent` by a new parent `src/components/execution/EventOperations.tsx`,
which is **mounted on the deployed booking page** (`src/app/bookings/[id]/page.tsx`,
directly after the `EngagementSpine` card). Before release it shows Operational
Release; once released it shows the derived lifecycle rail and the event-scope
DailyOps. All TS/React files compile clean under strict mode, and the mounted tree
is verified in real headless Chromium (see UI Integration below).

## UI integration & browser verification

A prior draft of this report listed `EventLifecycle.tsx` without identifying a
mount point; that was corrected. The component is now integrated and rendered:

1. **Where the user sees it:** on the booking detail page, in an "Event Operations"
   card placed right after the constitutional `EngagementSpine` card.
2. **What renders it:** `src/app/bookings/[id]/page.tsx` imports and renders
   `<EventOperations bookingId={b.id} actor="ops" />`, which composes
   `ReleaseAction` (pre-release) and `EventLifecycle` + `DailyOpsEvent` (post-release).
3. **Navigation:** open a booking (Bookings → a booking) → the Event Operations
   card. No accepted/released event yet → the Release surface; released → the
   lifecycle rail + DailyOps.
4. **Start Service / Close Event:** both are visible, authorized actions in the
   lifecycle rail — Start Service appears at `ready`, Close Event at `in_service`
   (with the required closeout-override field). Each invokes its ceremony.
5. **Browser verification:** `browser-tests/accept-event-ops.mjs` renders the REAL
   mounted `EventOperations` tree in headless Chromium over fixtures and asserts
   the DOM + interactions — **5/5 PASS**: EO-1 unreleased shows an actionable
   Release control; EO-2 a `ready` event shows the rail at `ready` and a Start
   Service control that invokes `start_service`; EO-3 an `in_service` event shows
   the explicit closeout blocker and a Close Event control that invokes
   `close_event`; EO-4 DailyOps renders obligations grouped by department with
   decision-debt flagged; EO-5 the parent surface is present in every released
   mode. Only the network/data layer is mocked (a harness `mock-supabase`); the DB
   authority is proven separately by the SQL proofs and races.

## Closeout seam (explicit, not fabricated)

v276 lacks the return / inspection / financial-settlement domains (v285+/v288).
`close_event` does not silently treat them complete: it requires an authorized
closeout override, recorded verbatim in the `event_closed` evidence, and refuses
`CLOSE_CLOSEOUT_UNRESOLVED` without it. The missing requirement is represented,
not invented.

## Verification (production-faithful database)

- **Proof — 18/18 PASS**, rerunnable, zero residue (families LC/BY/PR/TI). Walks
  one event released → in_prep → ready → in_service → closed. Load-bearing
  negatives: ready gate (`SERVICE_NOT_READY`), `CLOSE_BREAKDOWN_PENDING`,
  `CLOSE_CLOSEOUT_UNRESOLVED`, `CLOSE_NOT_IN_SERVICE`, forged legacy status cannot
  change the stage, exception recomputes the stage while the prior completion stays
  byte-identical, cross-tenant stage read → null and ceremonies → CEREMONY_NOT_FOUND,
  no stored stage/status column (structural).
- **Race — 5/5 PASS in both launch orders**, no deadlock, no lost evidence, one
  deterministic stage: prep×prep (in_prep), readiness×invalidation (ready),
  service-start×rescission (in_service), close×close (one event_closed, loser
  `CLOSE_ALREADY_CLOSED`, closed), completion×exception (deterministic exception).
- **Regression** — PL v265–v273 + v275 (26) + v276 (18) all PASS; v275's
  generation/proofs/races untouched (v275 GG race still 6 obligations, green).
- **TypeScript** — all six execution TS/React files compile clean under strict.

## Deployment order

Additive after the v275 stack:
1. `supabase/v276_lifecycle.sql` (evidence-kind extension + stage projections)
2. `supabase/v276_ceremonies.sql` (`start_service`, `close_event`) + grants
3. Application/UI (`src/lib/execution/spine.ts` additions, `EventLifecycle.tsx`)
4. Canon `docs/PUBLICATION.md` §6.47

## Proof instructions

Against a database built through v275 + v276 migrations:
```
psql -d ec -f supabase/tests/v276_proof.sql
```
Self-rolling-back (`V276_PROOF_ROLLBACK`); expect 18 PASS / 0 FAIL, zero residue.

## Race instructions

Throwaway database only:
```
psql -d ecrace -f supabase/tests/v276_race.sql   # installs helpers
for S in PP RI SR CC EE; do
  psql -d ecrace -c "select race276_setup('$S')"
  psql -d ecrace -c "select race276_arm('$S')"
  psql -d ecrace -c "select race276_a('$S')" &
  psql -d ecrace -c "select race276_b('$S')" & wait
  psql -d ecrace -c "select race276_verdict('$S')"
done
```
Expect PASS for all five in both launch orders.

## Browser verification instructions

Genuine headless-Chromium render of the mounted `EventOperations` tree:
```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-event-ops.mjs
```
Expect `accept-event-ops: 5 passed, 0 failed` (EO-1…EO-5).

## Regression results

- v276 proof: 18 PASS / 0 FAIL; races 5/5 both orders.
- PL v265–v273 + v275: all PASS on the v276 stack; v275 GG race green (6, no dup).
- TypeScript: clean; no PL/v275 SQL object, ceremony, invariant, proof, or race
  modified. v276 is purely additive.

## Exact write-set inventory

Migrations: `supabase/v276_lifecycle.sql`. Ceremonies: `supabase/v276_ceremonies.sql`.
Tests: `supabase/tests/v276_proof.sql`, `supabase/tests/v276_race.sql`.
Application: `src/lib/execution/spine.ts` (lifecycle additions).
UI: `src/components/execution/EventLifecycle.tsx`,
`src/components/execution/EventOperations.tsx` (the mounted parent), plus the
data-* test hooks added to `EventLifecycle.tsx`, `DailyOpsEvent.tsx`,
`ReleaseAction.tsx`.
UI mount: `src/app/bookings/[id]/page.tsx` (import + `<EventOperations>` after the
`EngagementSpine` card).
Browser verification: `browser-tests/event-ops.harness.tsx`,
`browser-tests/event-ops.html`, `browser-tests/mock-supabase.ts`,
`browser-tests/accept-event-ops.mjs`.
Docs: `docs/PUBLICATION.md` §6.47, `docs/v276_IMPLEMENTATION_REPORT.md`.

## Untouched frozen files

All PL-1…PL-4 objects (proposals, proposal_versions, publication, offer_snapshots,
offer_endpoints, offer_acceptances, acceptance_selection_sets,
acceptance_rescissions), ceremonies, proofs, and races; invariants I-15…I-30. All
v275 objects and functions (`event`, `obligation`, `execution_evidence`,
`release_event`, `generate_obligations`, `record_execution_evidence`,
`obligation_state`, `event_readiness`, `obligation_nk_complete`); v275 proofs and
races. v276 only *extends* the evidence-kind check (additive) and *adds* functions;
it modifies no existing routine. The one existing application file touched is
`src/app/bookings/[id]/page.tsx`, an **additive UI mount only** (an import and one
`<EventOperations>` card after `EngagementSpine`); no existing behavior, data path,
or component on that page was altered. It is a legacy app surface, not a frozen
constitutional file.
