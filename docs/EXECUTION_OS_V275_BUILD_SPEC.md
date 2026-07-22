# EventCore — v275 BUILD SPECIFICATION

*The first Execution OS vertical slice: the staffed carving/sushi station. This is
a build blueprint, not an implementation — no SQL, TypeScript, React, migrations,
proofs, or races are generated here. It is detailed to the point that
implementation is mechanical. It satisfies and proves invariants I-31…I-41 against
the constitutional boundary without reopening I-15…I-30. Build order is
constitution → SQL → proofs → application → UI.*

---

## 1. Objectives

1. Stand up the **execution spine** — canonical event, operational release,
   executable obligation, execution evidence — as constitutional infrastructure.
2. Prove the spine end-to-end on the **smallest realistic footprint**: one
   released event, one operationally-enriched component (a staffed carving/sushi
   station), generating obligations across **five outcomes in ≥3 departments**
   (culinary, equipment, staffing, plus setup and breakdown) with provenance,
   dependencies, readiness, owners, and blockers.
3. Establish the **DailyOps event-scope** surface as a pure projection over
   obligations + evidence, where completing an action invokes a domain ceremony.
4. Demonstrate that **status is never authority**: a forged status cannot release,
   generation is idempotent, and every operational state is replay-reconstructible.

## 2. Scope

- New SQL objects: `event`, `obligation`, `execution_evidence` (three tables); the
  ceremonies `release_event`, `record_execution_evidence`, `generate_obligations`.
- Obligation **generation** for exactly one enriched component class (staffed
  station), reading the accepted **selection set** and
  `component_requirements.category` (staff/equipment/rental) — the deployed seams.
- Projection derivations: obligation state, event stage (minimal), readiness
  roll-up (kernel) — implemented by **extending `obligations.ts`**, not a new
  engine.
- DailyOps **event scope** only: one event's obligations, states, blockers,
  owners, next action — role-filtered through the existing lens/permission grammar.
- Proof + race artifacts + canon entry + full standing-bar regression.

## 3. Non-scope (explicitly deferred, recorded seams)

- **Attested acceptance** and **Agreement/PL-5** — reserved; the Agreement release
  predicate is a policy slot, off by default in v275.
- **DailyOps company/personal scopes** and the non-operational work-item classes
  (manual task, approval, decision request, communication follow-up, project
  milestone) — v282+; v275 builds only the **operational-obligation** class.
- **Domain depth:** no recipe engine, equipment master, warehouse locations,
  scheduling engine, timeline/dependency full graph, transportation. Where such
  knowledge is absent, v275 emits an **explicit unresolved obligation /
  decision-debt** — never a fabricated fact.
- **Legacy retirement:** the legacy `tasks(done)`/`OpsWorkspace`/`workflow`
  surface is **not deleted** in v275; the new event's DailyOps view supersedes it
  *for that event only*, behind the lens grammar (full supersession is later).
- No PL-1…PL-4 object, ceremony, or invariant is modified.

## 4. SQL objects to introduce

`v275_execution_spine.sql` (additive; PL surface untouched). All tables
tenant-scoped; RLS `tenant_id = current_tenant_id()` **select + insert only**
(no update/delete policy) — the v269 immutability discipline.

**`public.event`** — the canonical operational record (I-31, I-39).
- `id uuid pk`
- `tenant_id uuid not null` (RLS)
- `engagement_ref uuid not null` — the **booking/engagement identity**; the
  singularity key
- `origin_commitment_ref uuid not null` — provenance: the `offer_acceptances.id`
  whose release materialized the event (**not** the key)
- `released_at timestamptz not null`, `released_by text not null`
- **`unique (tenant_id, engagement_ref)`** — one event per released engagement
  (amendments attach additively; never a duplicate)
- **No stage/status column** — event stage is projected (I-34).

**`public.obligation`** — the executable obligation (I-33, I-36).
- `id uuid pk`, `tenant_id uuid not null`
- `event_ref uuid not null references public.event(id)` (I-39)
- `origin_ref uuid not null` — the approved decision (acceptance / selection /
  release) this derives from (I-33)
- `origin_kind text not null check (origin_kind in ('selection','release','manual_authorized'))`
- `kind text not null` — outcome class (e.g. `culinary_prepare`,
  `equipment_pull`, `staffing_assign`, `venue_setup`, `venue_breakdown`)
- `department text not null check (department in ('culinary','equipment','staffing','venue','logistics'))`
- `required_outcome text not null` — imperative, specific
- `resource_role text` — the resource identity within the kind (e.g. station id)
- `dependencies jsonb not null default '[]'` — declared predecessor obligation
  natural-keys (structural, resolved to ids at read)
- `timing jsonb` — `{due, window_start, window_end}` (nullable; absent ⇒ untimed)
- `natural_key text not null` — deterministic:
  `sha256(event_ref · origin_ref · kind · coalesce(resource_role,''))`
- **`unique (tenant_id, natural_key)`** — idempotent generation backstop (I-36)
- **No status/invalidated column** — obligation state (incl. invalidation) is
  projected from evidence (I-34, I-35).

**`public.execution_evidence`** — the operational evidence ledger (I-34, I-35);
peer of `engagement_ledger`.
- `id uuid pk`, `tenant_id uuid not null`
- `event_ref uuid not null references public.event(id)`
- `obligation_ref uuid references public.obligation(id)` — null for event-level
  facts (release, clearance, sign_off)
- `kind text not null check (kind in ('released','clearance','sign_off','assignment','scan','inspection','completion','exception','invalidated','superseded','cancelled'))`
- `actor text not null`, `moment timestamptz not null default now()`
- `payload jsonb not null default '{}'`
- `prior_ref uuid references public.execution_evidence(id)` — for corrections
  citing the prior fact (I-35)
- indexes on `(tenant_id, event_ref)`, `(tenant_id, obligation_ref)`.

Grants: `select, insert` to `app_user, authenticated`; `execute` on the ceremony
functions; **no** update/delete grants on the immutable tables.

## 5. Ceremonies

All SECURITY DEFINER, `search_path=public`, authorization by
`current_tenant_id()` (no definer bypass), **thread-first lock** (booking →
proposal → version) matching the PL-4 order.

**`release_event(p_booking, p_actor, p_signoff_ref, p_waiver_ref default null) → jsonb`**
(I-31, I-32, I-37, I-39)
1. Resolve the booking's accepted, unrescinded offer under the tenant; refuse
   `CEREMONY_NOT_FOUND` (no leak).
2. Thread-first lock.
3. **Predicate (default-deny, layered):** (a) an `offer_accepted` fact exists and
   is not rescinded; (b) a **clearance** fact exists for the event *or*
   `p_waiver_ref` names an authorized waiver (I-37); (c) `p_signoff_ref` present.
   Any layer unmet ⇒ `RELEASE_PREDICATE_UNSATISFIED` (names the missing layer).
   The Agreement layer is a **reserved policy slot**, off by default in v275.
4. Materialize the event (insert; `unique(tenant_id, engagement_ref)` backstop);
   if it exists, `RELEASE_ALREADY_RELEASED`.
5. Write `execution_evidence` facts: `released`, `sign_off`, and `clearance`
   (or waiver) — append-only.
6. Call `generate_obligations(event_id)`.
7. Return `{event_id, generated_count}`. Atomic — all or nothing.
**Never reads mutable booking/workflow status for authority.**

**`generate_obligations(p_event) → int`** (I-33, I-36)
- Read the released event's accepted **selection set** + the selected component's
  `component_requirements` rows (with `category`).
- For the staffed-station component, deterministically derive the obligation set:
  `culinary_prepare`, `equipment_pull` (per required equipment/rental category),
  `staffing_assign` (per required staff role), `venue_setup`, `venue_breakdown`,
  with declared `dependencies` (pull ≺ setup ≺ service ≺ breakdown; assign ≺
  setup).
- **Upsert by `natural_key`** (`insert … on conflict (tenant_id, natural_key) do
  nothing`) — idempotent (I-36).
- **Regeneration (amendment):** obligations no longer entailed by the current
  accepted configuration receive an `invalidated` evidence fact (I-35); newly
  entailed ones are inserted; **existing rows and completed evidence are never
  mutated or deleted.**
- Missing operational knowledge (no recipe/equipment master) ⇒ emit the
  obligation with an `unresolved` marker in `required_outcome` (decision-debt),
  never a fabricated resource.

**`record_execution_evidence(p_event, p_obligation, p_kind, p_actor, p_payload, p_prior default null) → uuid`**
(I-34, I-35, I-38)
- Validate the obligation/event resolves under the tenant; append one immutable
  fact; corrections cite `p_prior`. This is the write path every DailyOps
  completion invokes. No projection is stored here.

## 6. Evidence model

- **Truth lives in `execution_evidence`** — append-only, one fact per operational
  event-in-the-world. Kinds: `released`, `clearance`, `sign_off` (event-level);
  `assignment`, `scan`, `inspection`, `completion`, `exception` (obligation-level
  progress); `invalidated`, `superseded`, `cancelled` (correction outcomes).
- **Corrections are additive** (I-35): a late change writes `invalidated` /
  `superseded` / `cancelled` citing the prior fact via `prior_ref`; the original
  `completion` stays byte-identical and visible in history.
- **The four outcomes are structurally distinct:** satisfied (`completion`),
  invalidated (`invalidated`), superseded (`superseded` → a new obligation),
  cancelled (`cancelled` via an authorized business ceremony).
- No mutable status cell exists anywhere; there is nothing to overwrite.

## 7. Projection model

Pure derivations over evidence + dependencies; **extend `obligations.ts`'s "one
derivation, many renderings."** No stored projection carries truth; any
materialized cache is written atomically with its grounding fact and is
replay-reconstructible (I-34, the I-30 analogue).

- **Obligation state** `blocked | ready | active | complete | exception`:
  `blocked` if any dependency's obligation is not `complete` (names the blocker,
  `blockedBy`); `ready` if dependencies met and no progress evidence; `active` on
  an `assignment`/`scan` without `completion`; `complete` on `completion` not
  later `invalidated`; `exception` on an `exception` fact. Invalidated obligations
  drop out of the live set (gone), retained in history.
- **Event stage** (minimal): `released → in_prep → ready → in_service → closed`,
  derived from the roll-up of obligation states + evidence; **no stage column**.
- **Readiness roll-up** (kernel): per department, counts of blocked/ready/active/
  complete + the naming of blockers; explanatory, never a bare percentage;
  `computed:false` for departments with no obligations yet (honesty rule).

## 8. DailyOps behavior

- **Event scope only** (v275). A pure projection over one event's obligations +
  evidence + dependencies + timing, role-filtered through the existing lens /
  `permissions.ts` grammar (populate the reserved `production`/`operations`/
  staffing lens keys as read-only views).
- Each item shows: **origin** (why it exists — the approved decision),
  **dependency/blocker** (what it waits on), **owner**, **state**, **next action**.
- **Completion invokes a domain ceremony** (I-38): every action button calls
  `record_execution_evidence` (or a domain-specific wrapper), then the projection
  recalculates. DailyOps stores **no** status of its own and is never a second
  source of truth.
- Missing-knowledge items render as explicit unresolved obligations (decision-
  debt), not blanks.

## 9. Required proofs

`v275_proof.sql` — disposable, self-rolling-back, production-faithful identity
harness (discover an active tenant member; no fabricated tenants; constrained-role
RLS checks; zero residue). Claim families, each S/R/D/N (+C where concurrency is
in §10):

- **RL (I-31/32/37/39):** release succeeds on a satisfied predicate; refuses on
  each unmet layer (named); **forging booking/workflow status does NOT release**
  (load-bearing N); second release → `RELEASE_ALREADY_RELEASED`; the event is
  unique per engagement; an amendment resolves the **same** event id.
- **OB (I-33/36):** generation is idempotent (run twice → identical set, zero
  duplicates); every obligation resolves an origin; regeneration after a guest/
  config change is **additive**, completed evidence untouched.
- **EV (I-34/35):** obligation state derives from evidence; replay reconstructs
  the projected state exactly; a correction adds a fact and leaves prior evidence
  byte-identical; the four outcomes are distinguishable.
- **PR (I-34):** no state exists that evidence+dependencies do not entail; no
  stored obligation status column exists (structural).
- **DO (I-38):** a DailyOps completion produces exactly one domain evidence fact
  and no DailyOps-owned status; the projection matches replay.
- **IM (I-33/35/40):** update/delete on event/obligation/evidence reach zero rows
  under role `authenticated`; records byte-identical after attempts.
- **TI (I-40):** cross-tenant release/evidence → `CEREMONY_NOT_FOUND` (no leak);
  rows invisible under the constrained role.
- **BY (I-32/34):** the status-forge negative control (shared with RL) plus:
  removing the dependency predicate makes a blocked obligation wrongly ready
  (proves the predicate is load-bearing).

## 10. Required race certification

`v275_race.sql` — genuine two-backend, throwaway-database only, both launch orders,
shared clock barrier, verdicts assert no deadlock / one outcome / no split state:

- **RR release × release** (same booking) → exactly one event, one `released`
  fact, loser `RELEASE_ALREADY_RELEASED`.
- **RX release × rescission** (of the underlying acceptance) → if rescinded first,
  release refuses; if released first, a later rescission is handled by amendment,
  **never a silent event deletion**.
- **GG generation × generation** (same event) → one obligation per natural key
  (UNIQUE backstop), no duplicates, no deadlock.
- **EE evidence × evidence** (same obligation) → both facts recorded (append-only,
  no lost update); the projection resolves one effective state.

## 11. UI touch points

- **Release action** — surfaced on the event/booking when the predicate is
  computable; shows an **explained checklist** (commitment ✓ · clearance ✓/waiver
  · sign-off), each unmet layer naming what is missing; calls `release_event`.
- **DailyOps event view** — the projection surface (§8): grouped by department,
  each item with origin/dependency/blocker/owner/state/next-action; role-filtered.
- **Obligation detail** — origin link ("from: approved carving station"),
  dependency chain, evidence history (append-only, corrections visible), the
  action that writes the next evidence fact.
- **Reuse, don't reinvent:** the lens registry, `permissions.ts`, and the
  `obligations.ts` badge/`computed:false` honesty. The legacy `OpsWorkspace`
  stays for non-v275 events.

## 12. Deployment order

1. `v275_execution_spine.sql` (tables + RLS + UNIQUE + FKs) — additive, after
   v273.
2. Grants (select/insert on the three tables; execute on the ceremonies).
3. Ceremony functions (`release_event`, `generate_obligations`,
   `record_execution_evidence`).
4. Application: `obligations.ts` extension + readiness kernel + generation rule
   inputs + DailyOps event-scope service.
5. UI: release action, DailyOps event view, obligation detail.
6. Canon entry **§6.46**.
Present the migration + the run-needed files (proof, race) individually alongside
the zip, per the release protocol.

## 13. Regression requirements

- v265–v273 proofs **pass** on the v275 stack; v271/v272 races regress.
- Full standing bar green, **no regression:** 54/54 unit suites; TypeScript
  diagnostic set unchanged except the additive new modules; es5/strict gates at
  baseline; eight Chromium suites (98) + production (7) + route (7); five variants
  biting.
- **No PL-1…PL-4 object, ceremony, invariant, or proof is modified** — verified by
  diff against the v273 baseline (only additive files + the canon entry differ).

## 14. Success criteria

- All of **I-31…I-41 proven** for the slice (proofs §9 green, rerunnable, zero
  residue) and **race-certified** (§10, both orders, no deadlock).
- One released event generates **≥5 obligations across ≥3 departments** with
  provenance, dependencies, readiness, owners, and blockers, surfaced through the
  DailyOps event view.
- **Forging a status does not release**; **regeneration is idempotent and
  non-destructive**; **every operational state is replay-reconstructible**.
- Missing knowledge appears as explicit decision-debt, never fabricated fact.
- Standing bar green, no PL regression; canon §6.46 written.

## 15. Exact write-set inventory

**Migrations (SQL):**
- `supabase/v275_execution_spine.sql` — `event`, `obligation`,
  `execution_evidence`; RLS (select+insert-only); `unique(tenant_id,
  engagement_ref)`, `unique(tenant_id, natural_key)`; FKs; grants.
- `supabase/v275_ceremonies.sql` — `release_event`, `generate_obligations`,
  `record_execution_evidence` (or folded into the spine migration; presented
  individually regardless).

**Proof / race (SQL, run-needed, presented individually):**
- `supabase/tests/v275_proof.sql` — families RL/OB/EV/PR/DO/IM/TI/BY.
- `supabase/tests/v275_race.sql` — RR/RX/GG/EE, throwaway-db only.

**Application (TypeScript):**
- `src/lib/obligations.ts` — extend `ObligationModule`/derivation with the
  operational modules (keep `computed:false`); no parallel engine.
- `src/lib/execution/generate.ts` — the generation rule inputs (reads selection
  set + `component_requirements.category`).
- `src/lib/execution/readiness.ts` — the readiness roll-up kernel.
- `src/lib/execution/dailyOps.ts` — the event-scope projection service.
- `src/lib/execution/event.ts` — release + evidence client wrappers.

**UI (React):**
- `src/components/execution/ReleaseAction.tsx` — the explained-checklist release.
- `src/components/execution/DailyOpsEvent.tsx` — the event-scope surface.
- `src/components/execution/ObligationDetail.tsx` — origin/dependency/evidence.
- Lens registrations for the read-only operational views (reuse `lenses.ts`).

**Docs:**
- `docs/PUBLICATION.md` — canon **§6.46** (Execution OS · Spine slice 1).

**Untouched (verified):** all `supabase/v263…v273*.sql`, all PL-1…PL-4 tests, the
commitment-layer services, and the frozen certification.

---

*This blueprint is complete and deterministic. Implementation of v275 follows it
in the order of §12, proving §9/§10 and satisfying §14, without reopening the
frozen commitment layer.*
