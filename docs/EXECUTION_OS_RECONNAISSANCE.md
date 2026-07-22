# EventCore — Execution OS · RECONNAISSANCE (v274)

*Grounded reconciliation of the EventCore Catering Execution OS Master Functional
Specification (71 specs, 18 parts, + the DailyOps Governing Orchestration
Requirement) against the actually-deployed v273 baseline. This document inspects
the real schema, services, and UI — it does not reconstruct from memory. It is
one component of the **v274 PL-4 Constitutional Closeout & Execution OS
Transition** package, and the foundation for the Constitutional Boundary,
Traceability Matrix, and Implementation Plan. No production code is proposed
here.*

Baseline note: v273 is the **final PL-4 implementation baseline**. v274 is the
**documentation-only PL-4 Constitutional Closeout & Execution OS Transition**
package, of which this reconnaissance is one component. The first Execution OS
**implementation** slice is **v275**. v274 contains no SQL, code, migrations,
proofs, or races.

---

## 0. Method & sources read

- **Master Spec:** all 71 SPECs across Parts I–XVIII, plus the two DailyOps
  governing clarifications.
- **Constitution:** PL-4 constitution / reconciliation addendum / implementation
  plan / reconnaissance; `PL-4_CERTIFICATION.md`; `PUBLICATION.md` canon.
- **Deployed source (v273):** every migration `f0 → v273` (44 constitutional/
  design tables + a pre-v163 legacy tenant table set); the TypeScript domain
  (`src/lib/*`, ~90 modules) and application (`src/app/*`, ~25 routes;
  `src/components/*`).

---

## 1. Headline finding — the deployed system is **three strata**, not one

Inspection shows the v273 baseline is not a single system but three layers of
different ages and constitutional maturity. Naming them precisely is the whole
key to the reconciliation, because the Master Spec's operational capabilities
land differently on each.

**(A) Constitutional Commitment Layer — v263–v273, frozen.** proposals →
proposal_versions → publication → offer_snapshots → offer_acceptances →
acceptance_selection_sets → acceptance_rescissions, all over the append-only
`engagement_ledger`, with tenant isolation, thread-first locking, replay
integrity, and the PL-4 certification. **This is the authoritative source of
approved customer commitments.** Execution must derive from it; it must not be
reopened.

**(B) Design Studio — v177–v258, mature.** blueprints, component identities/
definitions/instantiation, layers, choice_groups, presentation resolver, photos,
section categories, the **data-driven lens registry** (`lenses.ts`) and the
**obligation-as-projection** engine (`obligations.ts`). This is where the
Execution OS's *architectural seams already exist, dormant*.

**(C) Pre-constitutional Operational Shell — pre-v163, a `CONFIG.gs` port.**
`bookings`, `tasks` (with a mutable `done` boolean), `touchpoints`, `charges`,
`payments`, `activity_log`, `communications`, `rooms`, `staff`, `vendors`,
`booking_files`, `email_automations`, plus `workflow.ts`/`workflows.ts` (a
linear `Status` pipeline keyed by operating model) and `OpsWorkspace.tsx` (a
task-list "Daily Ops" surface). **This stratum is mutable-status by
construction** — the exact anti-pattern the constitution supersedes. It is the
closest existing thing to the Execution OS, and it is built the wrong way.

The Execution OS is therefore **mostly net-new construction on top of (A)**,
using the dormant seams in (B) as its skeleton, and **superseding-in-place** the
relevant parts of (C) rather than extending them — exactly as PL-3 subsumed the
legacy `sendVersion`.

### The constitutional bridge already exists (this is the pivotal asset)

`src/lib/obligations.ts` (v196) already states the Execution OS's core law, in
its own words: *"An obligation is a PROJECTION OF UNRESOLVED STATE. Not a row.
Nobody creates one; nobody completes one… There is no `done` — a checkbox on a
projection would be a second copy of the truth."* States are `blocked | ready |
(gone)`, computed never stored; `computed:false ≠ empty` (an unbuilt module is
*unknown*, not *clean*); and it already declares **"the task rail, Daily Ops,
and admin oversight ALL call this one derivation."* Its module enum is
`events | production | operations | photography | finance` — only `events` is
implemented; the rest honestly return `{computed:false}`. `lenses.ts` mirrors
this with wire-stable, reserved `production`/`operations` lens keys (the
constitution's "`operations` survives until Warehouse and Staffing ship").

**Consequence:** the DailyOps "Governing Orchestration Requirement" is not a new
philosophy to impose — it is already the deployed philosophy, waiting for its
data model. The Execution OS extends this bridge; it does not replace it and
does not need a parallel workflow engine.

---

## 2. Grounded inventory (what exists, precisely)

| Stratum | Objects (deployed) | Constitutional status |
|---------|--------------------|-----------------------|
| Commitment (A) | proposals, proposal_versions, offer_snapshots, offer_endpoints, offer_acceptances, acceptance_selection_sets, acceptance_rescissions, engagement_ledger, review_decisions, staged_artifact_packages, tenants, tenant_users, tenant_settings | frozen, authoritative |
| Studio (B) | blueprints & identities/revisions/compositions/instantiations, component_definitions/identities/config, component_items/requirements/layers, choice_groups, section_types, guest_categories, version_adjustments/guests/sections, photos/photo_library, publication_themes, relationships, `lenses.ts`, `obligations.ts`, `productionLens.ts` (read-only kitchen projection) | mature; dormant seams |
| Legacy (C) | bookings, tasks(`done`), touchpoints, charges, payments, activity_log, communications, rooms, staff, vendors, booking_files, email_automations, menu_templates, catalog_items, `workflow(s).ts`, `OpsWorkspace.tsx` | pre-constitutional, mutable-status |

`event_components`/`event_debriefs`/`event_type_scaffolds` are **proposal-design
constructs**, not an operational event record. There is **no** canonical event
record, obligation record, recipe, ingredient, equipment master, rental,
inventory, warehouse location, packing/container, vehicle, timeline/dependency
graph, staffing/scheduling, agreement, or operational-release object anywhere in
the deployed source. `bookings`/`tasks`/`touchpoints` DDL predates v163 and is
not in the migration tree (app-managed).

---

## 3. Capability reconciliation matrix — all 71 SPECs

Status legend: **FULL** exists fully · **PART** partial · **ALIAS** exists under
another name · **DORMANT** reserved/declared, no data model · **UI** UI-only ·
**ABSENT** net-new · **CONFLICT** contradicts the constitutional model and must
be superseded, not extended.

### Part I — System Foundation
| SPEC | Capability | Status | Locus / verdict |
|------|-----------|--------|-----------------|
| 01 | Canonical Event Record | **ABSENT** | no operational event; `bookings` (C) is the engagement root, proposal-thread is the commitment root. **Boundary decision — §4.** |
| 02 | Lifecycle & Stage Engine | **CONFLICT** | legacy `workflow(s).ts` linear `Status` pipeline (C) exists but is mutable-status and sales-only; the Master Spec's 20 stages incl. **Operationally Released** are net-new gated stages. Supersede-in-place. |
| 03 | Versioning / Approval / Freeze | **PART** | proposal/version + seal + fingerprint + `content_revision` witness (A) give versioning & freeze *for the offer*; menu/guest/staffing/equipment/timeline versioning & configurable freeze points are ABSENT. |

### Part II — Sales & Client
| SPEC | Capability | Status | Locus / verdict |
|------|-----------|--------|-----------------|
| 04 | Inquiry & Lead Capture | **PART/UI** | `inquiry_drafts`, `bookings`, `src/app/customers` (C) + lead sources; capacity/duplicate/aging automation ABSENT. |
| 05 | CRM & Communication History | **PART** | `relationships`, `communications`, `touchpoints`, `vendors`, `src/app/rolodex` (B/C); unified multi-channel history & preference-vs-decision distinction PART. |
| 06 | Venue Intelligence | **ABSENT** | `rooms` + `business_type='venue'` setting only; no venue profile/restrictions/travel model. |

### Part III — Proposal, Design, Approval
| SPEC | Capability | Status | Locus / verdict |
|------|-----------|--------|-----------------|
| 07 | Proposal Composition | **FULL** | the Studio (B) is exactly this hierarchy; `component_requirements.category` (staff/equipment/rental/vehicle) is the **operational-knowledge seam**. |
| 08 | Choices / Client Decisions | **FULL** | choice_groups + frozen min/max + selection sets + decision-debt via `obligations.ts` (A/B). Provisional-vs-confirmed demand: PART. |
| 09 | Contract, Signature, Payment | **PART/CONFLICT** | legacy `charges`/`payments` (C), no e-sign/clause library; **Agreement is constitutionally reserved (PL-5, unbuilt).** Authority decision — §5. |

### Part IV — Menu & Culinary
| SPEC 10 Menu Knowledge | **ABSENT** | `menu_templates`/`menuEngine.ts` are proposal-menu display, not a culinary definition/recipe model. |
| SPEC 11 Recipe/Subrecipe Engine | **ABSENT** | net-new. |
| SPEC 12 Dietary/Allergen/Kashrus | **ABSENT** | net-new (high value for Ben's kosher market). |
| SPEC 13 Culinary Presentation Schemes | **ABSENT** | net-new; will consume Studio component + the equipment model. |

### Part V — Costing, Pricing, Profitability
| SPEC 14 Costing Engine | **PART** | `finance.ts`/`pricingEngine.ts`/`billingHours.ts` (B) do design-money costing; operational cost classes (labor/transport/rental/spoilage) ABSENT. Finance scoped to design-money per PL-3 — **preserve.** |
| SPEC 15 Pricing Engine | **PART** | `pricing.ts`/`pricingEngine.ts`/`menuCharges.ts`/`tax.ts` (B); operational pricing (rush/zone/overtime/late-change) ABSENT. |

### Part VI — Forecasting, Purchasing, Inventory
| SPEC 16 Demand Aggregation | **ABSENT** · SPEC 17 Purchasing | **ABSENT** · SPEC 18 Receiving & Food Inventory | **ABSENT** | all net-new; depend on recipe (11) + released events (02). |

### Part VII — Production Execution
| SPEC 19 Production Planning | **ABSENT** (seam: `productionLens.ts` read-only kitchen projection, B) · SPEC 20 Production Task Execution | **ABSENT** — note its statuses (`not ready…complete`) must be **projections of execution evidence**, not stored (§6/§7) · SPEC 21 Food Safety/QA | **ABSENT** |

### Part VIII — Equipment, Rentals, Warehouse
| SPEC 22 Equipment Master | **ABSENT** · 23 Equipment Requirement Rules | **ABSENT** (seam: `component_requirements.category`, B) · 24 Rental Mgmt | **ABSENT** · 25 Availability/Conflict | **ABSENT** · 26 Warehouse Locations | **ABSENT** · 27 Pull/Pick Planning | **ABSENT** · 28 Packing Architecture | **ABSENT** · 29 Staging | **ABSENT** | entire part net-new. |

### Part IX — Staffing & Labor
| SPEC 30 Workforce Profile | **PART/UI** | legacy `staff` + `src/app/staff` + `staffApproval.ts` (C) — thin; skills/certs/rates/eligibility ABSENT · 31 Staffing Demand | **ABSENT** · 32 Scheduling/Assignment | **ABSENT** · 33 Time/Attendance/Payroll | **PART** (`billingHours.ts`, B) · 34 Dynamic Labor Orchestration | **ABSENT** |

### Part X — Time & Dependency
| SPEC 35 Event Timeline | **ABSENT** · 36 Dependency Graph | **ABSENT** — *the core Execution OS engine* · 37 Timing Templates | **ABSENT** · 38 Risk & Exception Engine | **ABSENT** (seam: obligation `blocked`+`blockedBy`, B) |

### Part XI — Transportation & Dispatch
| SPEC 39 Vehicle/Fleet | **ABSENT** · 40 Load Planning | **ABSENT** · 41 Routing/Departure | **ABSENT** · 42 Dispatch | **ABSENT** | net-new. |

### Part XII — Venue Execution
| SPEC 43 Load-In/Chain-of-Custody | **ABSENT** · 44 Setup Plan | **ABSENT** · 45 Live Run-of-Show | **ABSENT** · 46 Service Execution | **ABSENT** · 47 Incident/Change Log | **PART** (legacy `activity_log`, C — supersede) |

### Part XIII — Breakdown, Return, Recovery
| SPEC 48 Breakdown | **ABSENT** · 49 Return Manifest | **ABSENT** · 50 Warehouse Return Intake | **ABSENT** · 51 Cleaning/Sanitation | **ABSENT** · 52 Maintenance/Repair | **ABSENT** | net-new; "returned ≠ available" is a projection rule. |

### Part XIV — Financial & Operational Close
| SPEC 53 Event Reconciliation | **ABSENT** · 54 Billing Adjustments | **PART** (`charges`, C) · 55 Payroll/Payables | **PART** (`billingHours.ts`) · 56 Analytics | **ABSENT** (`event_debriefs` is a seam) |

### Part XV — Platform Capabilities
| SPEC 57 Role-Based Workspaces | **PART** | lens+permission grammar (`ops.view`, capabilities.ts, permissions.ts, B) is the seam; the role set is ABSENT · 58 Mobile/Scanning | **ABSENT** · 59 Search & Command | **PART/UI** (`src/app/search`) · 60 Notifications/Escalation | **ABSENT** · 61 Permissions/Sep-of-Duties | **PART** (RLS + `permissions.ts`, A/B — strong seam) · 62 Audit & Provenance | **FULL (for commitments)** (`engagement_ledger` is exactly this; must extend to operational evidence) · 63 Integration Layer | **PART** (`googleCalendar.ts`, `sendEmail.ts`) |

### Part XVI — Execution Intelligence
| SPEC 64 Obligation Generator | **PART** | `obligations.ts` derives *sales* obligations from proposal state (B); the **approved-decision → resourced/timed/assigned operational obligation with retained provenance** is ABSENT. **This is the heart of v275+.** |
| SPEC 65 Readiness Engine | **PART** | `obligations.ts` blocked/ready + `blockedBy` is the readiness kernel; per-department readiness & risk projection ABSENT. |
| SPEC 66 Recommended Next Action | **ABSENT** (kernel present in obligation ordering) · SPEC 67 Scenario Planning | **ABSENT** |

### Part XVII — Nonfunctional
| SPEC 68 Reliability | **PART** (atomic ceremonies, idempotent replay — A) · 69 Performance | **PART** · 70 Usability | **PART** (lens role-filtering, B) · 71 Security/Privacy | **FULL** (tenant isolation, RLS, least-privilege — A) |

### DailyOps (Governing Orchestration Requirement)
| DailyOps schema | **ABSENT** (0 tables) · DailyOps *renderer concept* | **PART** (`obligations.ts` + `OpsWorkspace.tsx`/`TodoPanel.tsx`) · Company/Event/Personal scopes | **ABSENT** · Work-item classes (obligation/task/approval/decision/exception/comm/milestone) | **ABSENT** · Stores authority or projects? | **projects only** (correct) |

**Reconciliation tally:** of 71 SPECs — FULL ≈ 3 (07, 08, 62/71 partial-full), PART ≈ 18, CONFLICT-supersede 2 (02, and legacy task/incident bits), ABSENT ≈ 48. Nothing in the Master Spec **contradicts** the frozen PL constitution; the only CONFLICTs are the *legacy* stratum (C), which the constitution was always going to supersede.

---

## 4. Canonical event boundary (Question B) — analysis + recommendation

**The facts.** Today: `bookings` (C) is the engagement/CRM root (a lead can be a
booking with no proposal). The **proposal thread** (proposals→versions) is the
commitment root and hangs off `booking_id`. The **accepted offer**
(offer_acceptances over an offer_snapshot) is the approved-commitment fact. There
is no operational event.

**The requirement.** SPEC 01: *one authoritative event record*, shared by all
departments, every operational object pointing back to it and to the exact
approved decision; *no department may keep a disconnected copy.*

**The tension.** A booking is not yet an event to execute (leads, tentative
holds, unaccepted proposals are bookings). An operational event should exist only
once there is something approved to execute — and it must bind to the immutable
acceptance, not to mutable booking status.

**Recommendation (for Ben's ratification):** introduce a **new `event` identity
that is *derived from and 1:1 with an approved commitment*, not a rename of
`bookings`.** The event record is **materialized by an operational-release
ceremony** (Question C) whose authorizing fact is an `offer_accepted` ledger
entry (and, when PL-5 ships, an Agreement). `bookings` remains the CRM/engagement
root; `event` is the operational spine every obligation points back to. This
keeps one authoritative event record (SPEC 01) **without** reopening PL-4 and
**without** overloading the CRM booking with execution state. The event carries
no mutable truth of its own — its identity + provenance are a record; its
lifecycle stage is a projection of ledger facts (§6).

**RATIFIED (v274 decision 1), with refinement:** the event is materialized
**exactly once** by Operational Release. It is **not** strictly 1:1 with every
accepted commitment: one *originating released* commitment creates the event;
later accepted corrections, amendments, replacements, or additional approved
decisions **attach additively to the same canonical event** and must never spawn
a duplicate. Singularity is enforced over the *released engagement*, not over
each acceptance (see I-31, boundary doc).

---

## 5. Operational authority (Question C) — analysis + recommendation

The Master Spec is explicit that execution authority is **layered, not a status
flag**: SPEC 02 defines *Operationally Released* as a distinct gated stage; SPEC
09 states *"No operational release may rely merely on a proposal marked
'booked'."* The five concepts the mission names — customer commitment,
contractual agreement, financial clearance, operational approval, operational
release — are genuinely distinct.

**Deployed reality:** only **customer commitment** exists constitutionally
(`offer_accepted`). **Agreement** is reserved (PL-5, unbuilt). **Financial
clearance** exists only as legacy `payments` (C, non-constitutional).
**Operational approval/release** do not exist.

**Recommendation (for Ben's ratification):** execution derives from an
**Operational Release** — a new authority-gated, default-deny ceremony (in the
PL-4 ceremony tradition) whose preconditions are a *layered predicate* over
immutable facts: (1) an un-rescinded `offer_accepted`; (2) — when PL-5 exists —
an Agreement fact; (3) a financial-clearance fact (deposit received or an
authorized waiver, recorded as evidence, not a mutable flag); (4) an operator
sign-off fact. Release **materializes the event** (§4) and **licenses obligation
generation** (§6). Until PL-5 ships, release may proceed from Acceptance +
clearance + sign-off, with the Agreement precondition reserved as a seam (exactly
how attested acceptance is reserved). Crucially: **execution never reads mutable
status for authority** — release is a recorded ceremony, and every downstream
obligation cites it as provenance. *Genuine constitutional question (§8-Q2).*

---

## 6. Obligation model & DailyOps reconciliation (Questions D, E, G + DailyOps)

The deployed `obligations.ts` philosophy and the Master Spec's obligation model
(SPEC 20/64/65) appear to conflict — the former says "never a row, no `done`,"
the latter wants obligations with assignment, actual start/finish, photos,
exception reasons. **They reconcile cleanly once "obligation" is split into its
two real parts:**

- **Obligation identity + provenance = an immutable record** (SPEC 64's "every
  generated obligation must retain its origin"): id, tenant, **event**,
  **originating approved decision** (the release/acceptance/selection it derives
  from), kind, department, required outcome, declared dependencies, resource
  requirements, timing. Insert+select-only, append-only — the v269 evidence
  discipline. Regeneration is idempotent by a deterministic natural key over
  (event, decision, kind); a superseded obligation is **invalidated additively**,
  never mutated or deleted (Question E — "do not silently mutate completed
  operational evidence").
- **Obligation *state* = a projection** (`obligations.ts` law, unchanged):
  `blocked | ready | active | complete | exception` is **derived** from (a)
  dependency predicates over other facts and (b) the **execution evidence**
  recorded against the obligation (assignment facts, scan facts, inspection
  facts, completion facts, exception facts). Never stored as truth. This is
  exactly the constitution's "status is a projection of the relation."

**Execution evidence = new append-only facts**, department-owned, each citing its
obligation — the operational analogue of `engagement_ledger`. Completing a
DailyOps action **invokes the domain ceremony that writes the evidence**; DailyOps
then recalculates the projection. This satisfies SPEC 20's rich statuses *and*
the constitution: the evidence is the truth, the status is derived, provenance is
retained end-to-end.

**DailyOps** is therefore the **projection/orchestration layer over
obligations + evidence** — precisely the `obligations.ts` "one derivation, many
renderings" already deployed, extended to three scopes (Company/Event/Personal),
multiple work-item classes (operational obligation | manual task | approval |
decision request | exception | communication follow-up | project milestone —
distinguishable by authority, provenance, lifecycle, completion evidence), and
recalculation on evidence write. **It requires extension, not structural
correction, and no parallel engine.** The legacy `OpsWorkspace`/`tasks(done)`
surface (C) is **superseded-in-place** — its UI intent is right, its mutable
`done` model is the anti-pattern the projection model replaces.

**State-vs-relation reconciliation (Question G):** every Master-Spec status
vocabulary (pick, production, dispatch, setup…) is admitted **only as a
projection of evidence**. A scan/inspection/completion is evidence; the status is
derived; no status becomes a second truth. "Returned ≠ available" (SPEC 50) is a
projection rule, not a stored flag.

---

## 7. Existing objects to EXTEND, not duplicate

- **`engagement_ledger`** → the provenance/evidence pattern for operational facts
  (extend the pattern with an operational evidence ledger; do not fork truth).
- **`obligations.ts`** → the obligation *state* derivation (add the operational
  modules; keep `computed:false` honesty).
- **`lenses.ts` registry** → department workspaces (SPEC 57): populate the
  reserved `production`/`operations` keys; add warehouse/staffing/transport/venue
  as registered lenses, wire-stable keys.
- **`component_requirements.category`** (staff/equipment/rental/vehicle) →
  the SPEC 07/23 operational-knowledge seam that obligation generation reads.
- **`permissions.ts` + RLS** → SPEC 61 separation-of-duties (extend, don't
  reinvent).
- **`event_debriefs`** → SPEC 56 analytics / reconciliation seam.
- **`bookings`** → remains the CRM engagement root (do **not** overload with
  execution; the new `event` is separate — §4).

**Supersede-in-place (do not extend):** `workflow(s).ts` linear status pipeline
(→ SPEC 02 stage engine as evidence-projected), `tasks(done)` + `OpsWorkspace`
(→ DailyOps over obligations), legacy `activity_log` (→ incident evidence).

---

## 8. Constitutional questions — ALL RATIFIED (v274 decisions 1–6)

1. **Event identity (§4):** ratify a *new `event` identity derived 1:1 from an
   approved commitment*, with `bookings` remaining the CRM root — vs. growing
   `bookings` into the event. (Recommend: new derived identity.)
2. **Operational authority (§5):** ratify **Operational Release** as a new
   default-deny ceremony layering acceptance + (reserved) agreement + financial
   clearance + sign-off — vs. deriving execution from Acceptance alone.
   (Recommend: layered release; Agreement reserved like attested acceptance.)
3. **Agreement sequencing:** is PL-5 Agreement a *prerequisite* of first
   execution, or may v275+ proceed from Acceptance + Release with Agreement
   reserved? (Recommend: proceed; reserve Agreement — it is additive.)
4. **Financial clearance as evidence:** confirm deposit/clearance enters as an
   immutable **evidence fact** (not a mutable booking flag), consistent with
   ledger primacy. (Recommend: yes.)
5. **Obligation invalidation semantics (Question E):** confirm that late
   changes/rescission **invalidate additively** (new fact) and never mutate or
   delete completed operational evidence. (Recommend: yes — I-27 analogue.)
6. **Legacy supersession scope:** confirm v275+ may supersede-in-place the legacy
   `tasks(done)`/`OpsWorkspace`/`workflow` surface rather than preserve it.
   (Recommend: yes, gradually, behind the obligation model.)

None of these reopens the frozen PL-4 surface; all are net-new authority above it.

---

## 9. Stop-condition check & v275 recommendation

- Master Spec contradicts PL constitution? **No.** (Only legacy stratum C
  conflicts, and it was always to be superseded.)
- Booking/event identity reconcilable safely? **Yes** (§4, additively).
- Operational authority ambiguous? **Resolvable** (§5) — pending Ben's ratify.
- Obligation regeneration destroys evidence? **No**, under §6 (additive
  invalidation).
- Multiple sources of event truth? **Avoided** by §4/§6 (one event, evidence is
  truth, status projected).
- v273 source incomplete / docs absent? **No** — both prerequisites present.

**Recommendation: v275 MAY begin safely — Questions 1–6 are now RATIFIED (see
v274 decisions), fixing the operational spine.** which fix the operational spine
the entire sequence hangs on. The remaining deliverables
(CONSTITUTIONAL_BOUNDARY, IMPLEMENTATION_PLAN, TRACEABILITY_MATRIX, the v275-onward
sequence, the first vertical slice, and the write-set inventories) are drafted
against those two ratifications and become deterministic the moment they are
settled. The recommended first slice is the **staffed carving/sushi station**
(Question H) — one released event, one operationally-enriched component,
generating culinary + equipment + staffing + setup + breakdown obligations with
provenance, dependencies, readiness, owners, and blockers, surfaced through
DailyOps — because it exercises the obligation-record + evidence + projection
spine end-to-end on the smallest realistic footprint.
