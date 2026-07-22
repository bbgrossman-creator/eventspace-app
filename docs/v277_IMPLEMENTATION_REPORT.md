# EventCore — v277 Event Operations Workspace · IMPLEMENTATION REPORT

Third Execution OS slice — the first deliberately user-visible workspace. It
composes the certified v275 spine and v276 lifecycle into one operational surface,
from the certified/corrected v276 baseline, in the order constitution → SQL read
model → proof → application → mounted UI → browser acceptance. No frozen Proposal
Lifecycle object and no v275/v276 object was modified.

## Governing law preserved

The relation is authoritative; status is a projection. The workspace renders one
authoritative SQL projection and invokes authorized ceremonies. It computes no
lifecycle, readiness, obligation state, completion, or blockers in React. No
mutable UI-owned operational truth exists.

## What was built

**SQL (one composed READ projection; no tables, no write ceremony):**
- `supabase/v277_workspace.sql` — `event_workspace(uuid)`, assembling all seven
  workspace sections from the certified relations and functions
  (event, obligation, execution_evidence, obligation_state, event_stage,
  event_stage_detail). Fully derived; stores nothing.

**Application:** `src/lib/execution/spine.ts` — `getEventWorkspace` + the workspace
types (one call returns the whole workspace).

**UI (mounted + browser-verified):** `src/components/execution/EventWorkspace.tsx`
— the seven-section workspace. `EventOperations` (already mounted on the booking
page) now renders `EventWorkspace` once released. The seven sections: operational
header · lifecycle rail (v276) with authorized actions · readiness by department ·
operational workboard (grouped by real department) · a first-class blockers
section · Next Actions (only currently-available ceremonies) · recent activity
from the evidence ledger.

## Why there is no v277 migration table or race file

Per the SQL-restraint requirement: v277 introduces **no durable state** and **no
new write ceremony**. The workspace is a compositional read projection over the
already-certified relations, so:
- there is no production migration beyond the additive read function
  (`v277_workspace.sql`), and
- **no `v277_race.sql` is constitutionally necessary** — no concurrency-sensitive
  write path was added. All workspace actions invoke the existing, already
  race-certified v275/v276 ceremonies (record_execution_evidence, start_service,
  close_event); their concurrency is covered by v275/v276 races.

## Verification

- **Proof — 12/12 PASS** (`v277_proof.sql`, WS-1…WS-12), rerunnable, zero residue.
  Load-bearing: readiness total equals the live obligation population (header and
  per-category); every blocker cause_ref is a real still-unresolved obligation;
  exception count derived; recent activity sourced from the ledger; header stage
  and lifecycle agree with `event_stage`/`event_stage_detail`; forged legacy status
  cannot alter the projection; cross-tenant read → null; no durable summary table
  exists; empty/partial states render deterministically.
- **Browser acceptance — 13/13 PASS** (`accept-workspace.mjs`) against the REAL
  mounted `EventOperations → EventWorkspace` tree in headless Chromium: all seven
  sections render; the lifecycle rail shows the SQL-derived stage; readiness
  categories show correct counts; obligations group by real departments; blockers
  identify the actual blocking work; Start Service / Close Event appear only when
  permitted; a successful action invokes the ceremony and refreshes the projection;
  a rejected ceremony surfaces its failure code without advancing the UI; recent
  evidence renders; a cross-tenant (null) projection renders no operational data;
  usable at tablet width. The v276 acceptance (`accept-event-ops.mjs`, 5/5) was
  updated for the evolved layout (blockers moved to their own section) and remains
  green.
- **Regression** — PL v265–v273 + v275 (26) + v276 (18) + v277 (12) all PASS on
  the v277 stack. TypeScript: all execution components (incl. `EventWorkspace`)
  compile clean under strict mode.

## Deployment order

Additive after the v276 stack:
1. `supabase/v277_workspace.sql` (the `event_workspace` read projection + grants)
2. Application (`src/lib/execution/spine.ts` workspace client)
3. UI (`src/components/execution/EventWorkspace.tsx`; `EventOperations` renders it)
4. Canon `docs/PUBLICATION.md` §6.48

## Proof instructions

Against a database built through v276 + `v277_workspace.sql`:
```
psql -d ec -f supabase/tests/v277_proof.sql
```
Self-rolling-back (`V277_PROOF_ROLLBACK`); expect 12 PASS / 0 FAIL, zero residue.

## Browser-test instructions

```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-workspace.mjs   # v277 → 13 passed
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-event-ops.mjs   # v276 regression → 5 passed
```

## Race instructions

None for v277 — no concurrency-sensitive write path was introduced (see above).
The v275/v276 races remain the certification for the ceremonies the workspace
invokes.

## Regression results

- v277 proof 12/12; browser 13/13 (+ v276 5/5).
- PL v265–v273 + v275 + v276: all PASS on the v277 stack.
- TypeScript clean; no PL/v275/v276 SQL object, ceremony, invariant, proof, or
  race modified.

## Exact write-set inventory

SQL: `supabase/v277_workspace.sql`.
Tests: `supabase/tests/v277_proof.sql`.
Application: `src/lib/execution/spine.ts` (workspace client + types).
UI: `src/components/execution/EventWorkspace.tsx` (new); `EventOperations.tsx`
(now renders `EventWorkspace`).
Browser: `browser-tests/accept-workspace.mjs` (new), `browser-tests/event-ops.harness.tsx`
(workspace fixtures), `browser-tests/mock-supabase.ts` (event_workspace + reject path),
`browser-tests/accept-event-ops.mjs` (updated one assertion for the evolved layout).
Docs: `docs/PUBLICATION.md` §6.48, `docs/v277_IMPLEMENTATION_REPORT.md`.

## Untouched frozen files

All PL-1…PL-4 objects, ceremonies, proofs, races; invariants I-15…I-30. All v275
and v276 SQL objects, ceremonies, proofs, and races (event, obligation,
execution_evidence, release_event, generate_obligations, record_execution_evidence,
obligation_state, event_readiness, obligation_nk_complete, event_stage,
event_stage_detail, start_service, close_event). v277 only *adds* the
`event_workspace` read function and UI; it modifies no existing SQL routine. The
one existing UI file changed is `EventOperations.tsx` (now renders the workspace);
`EventLifecycle.tsx` and `DailyOpsEvent.tsx` remain in the tree, their logic now
composed by the workspace projection.
