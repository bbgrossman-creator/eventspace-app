# EventCore — Execution OS · IMPLEMENTATION PLAN (v274)

*Documentation-only. This fixes what the Execution OS build will construct, in
what order, and exactly what each slice must prove — grounded in the ratified
v274 decisions and the constitutional boundary (I-31…I-41). It contains no SQL,
no application code, no migrations, no proofs, no races. It is the plan the v275+
implementation program executes, to the PL-4 standard.*

---

## PART A — THE BUILD OBJECTS (constitutional layer first)

Each object is described here; none is implemented in v274. The order within a
slice is always **constitution → SQL invariant → proof → application → UI**.

1. **`event`** — the canonical operational record (I-31, I-39). Identity +
   provenance to the originating released commitment; tenant-scoped; unique over
   the released engagement; no mutable stage column (stage is projected).
2. **`operational_release`** — the default-deny release ceremony (I-32, I-37).
   Evaluates the layered predicate over immutable facts under thread-first lock;
   materializes the event once; licenses generation. Reserved Agreement predicate.
3. **`obligation`** — the executable obligation record (I-33, I-36). Immutable
   identity + `origin_ref` + kind + department + required outcome + declared
   dependencies + resource requirements + timing; natural-key unique
   `(event, origin_decision, kind, resource_role)`; insert+select-only.
4. **`execution_evidence`** — the operational evidence ledger (I-34, I-35). Peer
   of `engagement_ledger`; append-only; kinds: assignment, scan, inspection,
   completion, exception, clearance, sign-off; each cites its obligation/event.
5. **Obligation generator** — the deterministic, idempotent function
   (I-36) mapping an approved decision + rules → obligation set; regeneration
   additive and non-destructive.
6. **Projection derivations** — obligation state, event stage, readiness,
   clearance, DailyOps (I-34, I-38); pure over evidence + dependencies; extend the
   deployed `obligations.ts` "one derivation, many renderings."
7. **DailyOps surface** — company/event/personal scopes over obligations +
   evidence (I-38, I-41); read-only; every completion invokes a domain ceremony.

The obligation generator reads existing seams: `component_requirements.category`
(staff/equipment/rental/vehicle), section categories, and the accepted selection
set — it never invents operational knowledge it does not have (missing knowledge
becomes an explicit unresolved obligation / decision-debt, per the honesty rule).

---

## PART B — RECOMMENDED VERSION SEQUENCE (v275 onward)

Additive, each under the standing bar (unit + tsc baseline + gates + Chromium +
biting variants + DB proofs + genuine races) before the next. Phased so the
spine is proven before the domains, and the domains before the platform breadth.

**Phase 0 — the execution spine (v275–v278)**
- **v275 — First vertical slice.** `event` + `operational_release` +
  `obligation` + `execution_evidence` + generator, exercised end-to-end on ONE
  enriched component (the staffed carving/sushi station), across culinary +
  equipment + staffing + setup + breakdown; obligation state + readiness kernel;
  DailyOps *event* scope. (Detailed in Part C / `EXECUTION_OS_FIRST_SLICE`.)
- **v276 — Event lifecycle & stage engine (SPEC 02).** Stage as a projection of
  release + evidence; no mutable stage flag; supersede the legacy `workflow`
  pipeline behind the projection.
- **v277 — Freeze control & operational versioning (SPEC 03).** Configurable
  freeze points as evidence gates over menu/guest/staffing/equipment/timeline;
  late-change → additive regeneration (I-36) proven.
- **v278 — Dependency graph, readiness (full), next action, notifications
  (SPEC 35–38, 65, 66, 60).** The timing/dependency engine; risk projection from
  `blocked`/`blockedBy`; escalation.

**Phase 1 — the departments (v279–v285)**
- **v279 — Staffing (SPEC 30–34):** workforce profile, demand, scheduling/
  assignment as evidence, time/labor.
- **v280 — Production execution (SPEC 19–21):** planning + task execution as
  evidence-projected status; food safety.
- **v281 — Equipment & warehouse (SPEC 22–29):** equipment master, requirement
  rules (from the `category` seam), availability/conflict, locations, pick/pack,
  staging; mobile scanning (SPEC 58).
- **v282 — Role workspaces + DailyOps company/personal scopes (SPEC 57, 61,
  DailyOps).** Populate the reserved lens keys; separation-of-duties.
- **v283 — Transportation & dispatch (SPEC 39–42).**
- **v284 — Venue execution (SPEC 43–47):** load-in/chain-of-custody, setup,
  run-of-show, service, incident (supersede legacy `activity_log`).
- **v285 — Breakdown, return, recovery (SPEC 48–52):** "returned ≠ available" as
  a projection rule.

**Phase 2 — culinary & financial depth (v286–v288)**
- **v286 — Menu/recipe/dietary/kashrus (SPEC 10–13):** the culinary definition
  and subrecipe engine; dietary/allergen/kashrus (high value for the kosher
  market); demand aggregation → purchasing → food inventory (SPEC 16–18).
- **v287 — Costing/pricing operational depth (SPEC 14–15):** operational cost
  classes and pricing, preserving the PL-3 design-money boundary.
- **v288 — Reconciliation, billing, payroll, analytics (SPEC 53–56).**

**Phase 3 — intelligence & the reserved seams (v289+)**
- **v289+ — Scenario planning, command surface, integration breadth (SPEC 59,
  63, 67).**
- **Agreement (PL-5)** — the reserved legal layer; satisfies the reserved release
  predicate; scheduled independently.
- **Attested Acceptance** — the PL-4 reserved capability; scheduled independently.

Sequencing is a recommendation; slices are additive and may be reordered within a
phase, but Phase 0 (the spine) precedes all domains.

---

## PART C — THE FIRST VERTICAL SLICE (v275) — recommendation

**The staffed carving / sushi station.** The smallest footprint that exercises the
entire spine (I-31…I-41) end to end, chosen because a single enriched component
legitimately generates work across culinary, equipment, staffing, setup, and
breakdown, with real cross-department dependencies and readiness.

**Scope (one released event, one enriched component):**
- Release one event from an accepted offer carrying a carving/sushi-station
  selection (the layered predicate; financial clearance as evidence; sign-off).
- Generate obligations with provenance across ≥ 5 outcomes: prepare the culinary
  component; pull/stage the station equipment; assign a station chef (staffing);
  set up at venue; break down and return.
- Derive obligation state + a readiness roll-up; surface all of it through
  DailyOps *event* scope, role-filtered, each item showing origin, dependency,
  blocker, owner, and next action.
- Where operational knowledge is absent (no recipe engine yet, no equipment
  master yet), emit an **explicit unresolved obligation / decision-debt**, never a
  fabricated fact.

**What it must prove (to the PL-4 standard):** I-31 (one event, amendment
additive), I-32 (release default-deny; forged status does not release), I-33
(provenance permanent), I-34 (state = projection; replay reconstructs), I-35
(evidence append-only; correction additive), I-36 (regeneration idempotent;
guest-count change additive, completed evidence untouched), I-37 (clearance as
evidence), I-38 (DailyOps derives; completion invokes a ceremony), I-39 (single
event truth), I-40 (tenant isolation, no leak), I-41 (work-item class
distinctness).

---

## PART D — WRITE-SET INVENTORIES (planned; v275 slice)

*Named here as the plan; authored in v275, not v274.*

**Migration write-set (SQL):**
`v275_execution_spine.sql` — `event`, `operational_release`, `obligation`,
`execution_evidence` tables with tenant RLS (select+insert-only on the immutable
ones, no update/delete policy); the natural-key UNIQUE on `obligation`; the
released-engagement UNIQUE on `event`; FKs `event_ref`/`origin_ref`; grants to
the app roles. No change to any PL-1…PL-4 object.

**Function write-set (ceremonies):**
`release_event()` (default-deny predicate, thread-first lock, event
materialization, generation trigger); `record_execution_evidence()` (append-only,
per kind); `generate_obligations()` (deterministic, idempotent upsert-by-natural-
key with additive invalidation). All SECURITY DEFINER with `current_tenant_id()`
authorization; refusal codes named and non-disclosing.

**Application write-set (TS):**
extend `obligations.ts` derivation with the operational modules (keep
`computed:false` honesty); a readiness derivation; DailyOps event-scope service;
the generator's rule inputs reading `component_requirements.category` and the
selection set. No parallel workflow engine.

**Proof write-set:**
`v275_proof.sql` — the I-31…I-41 claim families (RL/EV/OB/PR/IM/TI/BY/DO),
disposable, self-rolling-back, production-faithful identity harness; the
load-bearing negative controls (forged status does not release; regeneration
idempotent; correction additive).

**Race write-set:**
`v275_race.sql` — genuine two-backend pairs: release × release (one event),
release × rescission (no silent deletion), generation × generation (one
obligation per key), evidence × evidence (no lost update). Throwaway-database only.

**Authority write-set:**
the release predicate policy (per-tenant); the RLS/role extensions for the new
tables; the lens/permission registrations for the event-scope DailyOps surface —
reusing `permissions.ts`, extending, not reinventing.

---

## PART E — QUALITY BAR (unchanged from PL-4)

Every slice ships: real database enforcement; genuine concurrency where
concurrency is claimed; durable-state assertions over return codes; negative
controls that fail if the protection is removed; the full standing bar (unit
suites, tsc baseline, es5/strict gates, Chromium suites, biting variants) green
with no regression; a proof and a race artifact; a canon entry; and traceability
from each invariant to its enforcing SQL, proof, race, and visible consequence.

No slice reopens I-15…I-30. No slice introduces mutable lifecycle state that
duplicates a constitutional relationship. The relation remains authoritative;
status remains a projection.
