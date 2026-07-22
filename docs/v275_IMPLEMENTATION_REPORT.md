# EventCore — v275 Execution OS Spine · IMPLEMENTATION REPORT

First Execution OS vertical slice, implemented exactly to the approved v275 Build
Specification, in the order constitution → SQL → proofs → race → application → UI.
The frozen Proposal Lifecycle (PL-1…PL-4, I-15…I-30) is untouched throughout.

## What was built

**SQL (additive, after v273):**
- `v275_execution_spine.sql` — `event`, `obligation`, `execution_evidence`. All
  tenant-scoped, insert+select-only RLS (no update/delete policy), no mutable
  status/stage columns. `event` UNIQUE over the released engagement; `obligation`
  UNIQUE over its deterministic natural_key.
- `v275_ceremonies.sql` — `release_event` (default-deny, layered),
  `generate_obligations` (deterministic, idempotent, additive invalidation),
  `record_execution_evidence` (append-only write path).
- `v275_projections.sql` — `obligation_state`, `event_readiness`,
  `obligation_nk_complete`: the authoritative SQL derivation (one derivation).

**Application (TypeScript):** `src/lib/execution/spine.ts` (typed ceremony +
projection client), `src/lib/execution/dailyOps.ts` (event-scope view assembly);
`src/lib/obligations.ts` extended by a comment-only execution bridge (behavior
and type unchanged — the 54 unit suites are unaffected).

**UI (React):** `src/components/execution/ReleaseAction.tsx` (explained-checklist
release), `DailyOpsEvent.tsx` (event-scope obligations by department with origin/
blocker/owner/state/next-action), `ObligationDetail.tsx` (origin/dependency/
append-only evidence). All six TS/React files compile clean under strict mode.

## Faithful implementation decisions (no architecture reopened)

1. **Generation reads the FROZEN snapshot model**, not live design tables. The
   offer is frozen at publish; reading live `component_requirements` could drift
   from what was accepted. The operationally-enriched component carries its
   requirement categories (staff/equipment/rental) in the frozen model, and
   generation derives obligations from that immutable source — honoring the
   frozen-commitment invariant. Consuming the live requirements *catalog* as a
   richer rule input (keyed off the frozen selection) is a later slice.
2. **The authoritative obligation-state derivation lives in SQL**, not TS. This
   keeps "one derivation, many renderings" (no second copy of the arithmetic) and
   makes the projection provable at the SQL layer, so no UI depends on an unproven
   assumption. The app calls `obligation_state`/`event_readiness` and renders.
3. **Financial clearance is evidence provided at release** (a clearance ref or an
   authorized waiver), recorded immutably; the financial ceremony that *issues*
   clearance is a later slice (non-scope). The predicate is a real gate: release
   refuses without it.
4. **Decision-debt, not fabrication:** where recipe/equipment/staffing knowledge
   is not yet modeled, generation emits an explicit `unresolved: …` obligation.

## Verification (production-faithful database)

- **Proof — 26/26 PASS**, rerunnable, zero residue (families RL/BY/OB/EV/PR/DO/
  IM/TI). Load-bearing negatives: a forged `bookings.spine_state='in_execution'`
  does NOT release (release reads the acceptance relation, not status); each
  release layer refuses when unmet; regeneration is idempotent; an off-config
  obligation is invalidated additively (fact added, row not deleted); update/
  delete reach zero rows under `authenticated`; cross-tenant → CEREMONY_NOT_FOUND.
- **Race — 4/4 PASS in both launch orders**, no deadlock: release×release (one
  event, loser RELEASE_ALREADY_RELEASED); release×rescission (lawful, no silent
  event deletion); generate×generate (one obligation per natural_key); evidence×
  evidence (both facts recorded, no lost update).
- **Regression — PL v265–v273 (155 claims) + v275 (26) all PASS** on the v275
  stack. No PL object touched.
- One released carving station generates **6 obligations across 4 departments**
  (culinary, equipment ×2, staffing, venue setup + breakdown) with provenance,
  dependencies, readiness, owners, and blockers, surfaced through DailyOps.

## Deployment order

Additive after the v273 baseline:
1. `supabase/v275_execution_spine.sql`
2. grants (included) + `supabase/v275_ceremonies.sql`
3. `supabase/v275_projections.sql`
4. Application TS + UI React (`src/lib/execution/*`, `src/components/execution/*`,
   the `obligations.ts` comment bridge)
5. Canon `docs/PUBLICATION.md` §6.46

## Proof instructions

Against a database built through v273 + the three v275 migrations:
```
psql -d ec -f supabase/tests/v275_proof.sql
```
Self-rolling-back (ends with `V275_PROOF_ROLLBACK`); expect 26 PASS / 0 FAIL and
zero residual rows. Rerunnable.

## Race instructions

Throwaway database only (separate backends must see committed rows):
```
createdb ecrace   # build through v273 + v275_* migrations, then:
psql -d ecrace -f supabase/tests/v275_race.sql   # installs helpers
for S in RR RX GG EE; do
  psql -d ecrace -c "select race275_setup('$S')"
  psql -d ecrace -c "select race275_arm('$S')"
  psql -d ecrace -c "select race275_a('$S')" &
  psql -d ecrace -c "select race275_b('$S')" & wait
  psql -d ecrace -c "select race275_verdict('$S')"
done
```
Expect PASS for all four in both launch orders.

## Regression report

- PL constitutional proofs v265–v273: **155 PASS / 0 FAIL** on the v275 stack.
- v275 proof: **26 PASS / 0 FAIL**; races **4/4** both orders.
- TypeScript: all six new files compile clean under strict mode; `obligations.ts`
  change is comment-only (type/behavior identical → unit suites unaffected).
- No PL-1…PL-4 SQL object, ceremony, invariant, proof, or race modified; v275 is
  purely additive.

## Scope carried forward (recorded, not silently resolved)

DailyOps company/personal scopes and the non-operational work-item classes
(v282+); the department domains — staffing (v279), production (v280), equipment/
warehouse (v281), transportation (v283), venue execution (v284), breakdown/return
(v285); menu/recipe/dietary + forecasting (v286); costing/pricing depth (v287);
reconciliation/analytics (v288). Agreement (PL-5) satisfies the reserved release
predicate; attested acceptance remains reserved. Legacy `tasks(done)`/`OpsWorkspace`
superseded only for released events until full supersession later.
