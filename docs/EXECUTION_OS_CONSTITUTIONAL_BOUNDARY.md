# EventCore — Execution OS · CONSTITUTIONAL BOUNDARY (v274)

*The constitutional layer of the Execution OS, grounded in the ratified v274
decisions and continuing the Proposal-Lifecycle invariant series past I-30. This
fixes the law the Execution OS build (v275+) must satisfy and prove. No SQL, no
application code. It extends — never reopens — the frozen PL-1…PL-4 surface. The
governing standard is unchanged: real database enforcement, genuine concurrency
where concurrency is claimed, durable-state assertions over return codes, and
proofs that fail if the protection is removed.*

---

## PART I — POSITION AND BOUNDARY

The Proposal Lifecycle (PL-1…PL-4) answers *what a commitment is*. The Execution
OS answers *what the platform does with a commitment*. It sits **above** the
frozen commitment layer and **derives from** it; it is net-new construction, not
an amendment.

**May not touch (frozen):** proposals, proposal_versions, publication,
offer_snapshots, offer_endpoints, offer_acceptances, acceptance_selection_sets,
acceptance_rescissions, and their ceremonies, locks, and invariants I-15…I-30.
The Execution OS **reads** `offer_accepted` / `acceptance_rescinded` as
authoritative facts; it never writes the commitment layer.

**Extends (the deployed seams):** the append-only ledger *pattern*
(`engagement_ledger` → a peer operational evidence ledger); the obligation-as-
projection engine (`obligations.ts`); the data-driven lens registry
(`lenses.ts`); the permission/RLS grammar (`permissions.ts`, tenant RLS).

**Supersedes-in-place (the legacy stratum), never extends:** `tasks(done)`,
`OpsWorkspace`, `workflow(s).ts`, mutable `activity_log` authority — retired only
after a certified equivalent replaces each, per v274 decision 6.

**The relation is authoritative. Status is a projection.** This is the single
law every invariant below is a specialization of.

---

## PART II — THE NEW CONSTITUTIONAL OBJECTS

- **Canonical Event** — the operational root. Materialized exactly once by
  Operational Release; retains provenance to the originating released commitment.
  Carries identity + provenance only. Its lifecycle stage, readiness, and
  operational state are projections (I-31, I-34).
  *Two roles, kept distinct to fix the uniqueness key precisely:* the event is
  **unique over the released engagement** — the booking/engagement identity that
  was released (this is the UNIQUE key, so amendments never spawn a duplicate);
  the **originating released commitment** — the specific accepted offer whose
  release first materialized the event — is recorded as **provenance**, not as
  the key. Later accepted commitments on the same engagement attach additively;
  they do not re-key or duplicate the event.
- **Operational Release** — the default-deny authority ceremony that materializes
  the event and licenses obligation generation. Records that the currently
  applicable commercial / contractual / financial / operational predicates are
  satisfied or validly waived, citing the underlying evidence (I-32, I-37).
- **Executable Obligation** — an immutable record of a required operational
  outcome, carrying its origin (the approved decision that generated it). Identity
  and provenance are durable; state is projected (I-33, I-34, I-36).
- **Execution Evidence** — append-only operational facts (assignment, scan,
  inspection, completion, exception, clearance…), each citing its obligation or
  event. The operational analogue of the engagement ledger; the source of truth
  from which obligation and event state are projected (I-34, I-35).
- **DailyOps Projection** — the orchestration surface: a derivation over
  obligations + evidence + dependencies + deadlines, in company / event / personal
  scope. Stores no authority (I-38).

---

## PART III — INVARIANTS (I-31 … I-41)

**I-31 — Canonical event singularity.** Exactly one canonical event exists per
released engagement. Operational Release materializes it once; later accepted
corrections, amendments, replacements, or additional approved decisions attach
**additively** to the same event and must never spawn a duplicate. A build must
prove that a second release, or a downstream amendment, resolves to the *same*
event identity — one authoritative event record, no department copy (SPEC 01).

**I-32 — Operational Release is default-deny, layered, evidence-grounded.**
Release succeeds only when a policy-defined predicate over **immutable facts** is
satisfied — an unrescinded `offer_accepted`, financial clearance (or an
authorized waiver), and operational sign-off, with the Agreement predicate
reserved (Part V). Release **never** reads mutable booking/workflow status for
authority. Absent a satisfied predicate, release refuses. A build must prove
release cannot be manufactured by mutating a status flag.

**I-33 — Obligation provenance permanence.** Every executable obligation retains
its originating approved decision (release, acceptance, selection, or an
authorized manual origin). Identity + provenance are immutable, insert-and-select
only (the v269 discipline). An obligation with no resolvable origin cannot exist.

**I-34 — Obligation & event state is a projection.** Obligation lifecycle
(`blocked | ready | active | complete | exception`, and event stage) is **derived**
from (a) dependency predicates over facts and (b) append-only execution evidence.
It is never a stored mutable truth. A build must prove no state value exists that
the evidence + dependencies do not entail, and that replaying evidence
reconstructs the projected state exactly (the I-30 analogue for operations).

**I-35 — Execution evidence permanence.** Execution evidence is append-only.
Completed operational evidence is never mutated or deleted. Corrections are
additive and preserve four distinct outcomes: **satisfied**, **invalidated**
(no longer required), **superseded** (replaced by a new obligation), **cancelled**
(through an authorized business ceremony). A build must prove a correction adds a
fact and leaves prior evidence byte-identical (the I-27 analogue).

**I-36 — Deterministic, idempotent generation.** Obligation generation is a
deterministic function of (event, approved decision, generation rules). Re-running
it produces no duplicates: obligations are keyed by a natural identity over
(event, originating decision, obligation kind, resource role). A late change
regenerates additively — new/changed obligations appear, obsolete ones are
*invalidated* (I-35), completed evidence is untouched. A build must prove
regeneration is idempotent and non-destructive under replay.

**I-37 — Financial clearance is evidence, not a flag.** Deposit receipt, approved
credit, authorized waiver, or another recognized financial ceremony contributes
an immutable clearance fact; the projected clearance result is derived from these
facts. No mutable "paid" boolean carries release authority.

**I-38 — DailyOps derives; completion invokes a ceremony.** A DailyOps state is a
projection of authoritative facts (acceptance, release, assignment, scan,
inspection, completion, exception, deadline, dependency, communication-requiring-
action). Completing a DailyOps action **invokes the authoritative domain ceremony
or write path** that records evidence; DailyOps then recalculates. DailyOps is
never itself the authoritative evidence store and never a second source of truth.
"One derivation, many renderings" (the deployed `obligations.ts` law) governs.

**I-39 — Single event truth.** Every operational object points back to the
canonical event and, where applicable, the exact approved decision that created
it. No department maintains a disconnected event copy; reports are views of the
live record. A build must prove there is exactly one event record for a released
engagement and that operational objects resolve to it.

**I-40 — Operational tenant isolation & provenance traceability.** Every
execution object and evidence fact is tenant-scoped under the deployed RLS/role
model (no owner bypass), and every material operational value is traceable to its
source, author, time, originating decision, and authority — the audit/provenance
standard (SPEC 62) extended from commitments to operations.

**I-41 — Work-item class distinctness.** DailyOps may surface multiple work-item
classes (operational obligation | manual task | approval | decision request |
exception | communication follow-up | project milestone). These remain
distinguishable by **authority, provenance, lifecycle, and completion evidence**;
a manual task never masquerades as a provenance-bearing operational obligation,
and system-generated work never loses its origin. A build must prove class
identity is structural, not cosmetic.

These continue I-15…I-30. Together they define the correctness surface the
Execution OS build must demonstrate to the PL-4 standard.

---

## PART IV — AUTHORITY & PROJECTION MAPS

**Operational Release predicate (I-32), policy-driven (v274 decision 3):**

| Layer | Authorizing fact (immutable) | v275 status |
|-------|------------------------------|-------------|
| Customer commitment | unrescinded `offer_accepted` | required |
| Contractual agreement | Agreement fact (PL-5) | **reserved predicate** — policy may require; unbuilt slot |
| Financial clearance | deposit / credit / authorized-waiver evidence (I-37) | required (or waiver) |
| Operational sign-off | authorized operator release attestation | required |

Whether Agreement is required is **policy**, not a hardcoded optional — PL-5
later satisfies the reserved predicate with no redesign.

**Projection derivations (I-34):**

- *Event stage* ← release fact + downstream evidence (never a stored stage flag).
- *Obligation state* ← dependency predicates + assignment/scan/inspection/
  completion/exception evidence.
- *Readiness* ← per-department roll-up of obligation states + blockers +
  deadlines (SPEC 65); explanatory, never a bare percentage.
- *Clearance* ← financial evidence facts (I-37).
- *DailyOps* ← the union of the above in company/event/personal scope (I-38).

---

## PART V — DEFERRED SEAMS (reserved, not built)

- **Agreement (PL-5)** — reserved as a release predicate (Part IV); additive.
- **Attested acceptance** — the PL-4 reserved capability; unaffected here.
- **Manual/project work-item classes beyond the operational obligation** (Asana-
  parity: projects, portfolios, recurring, templates) — reserved under the I-41
  work-item grammar; the first slices build only the operational-obligation class.
- **Communication/media-derived actions** — reserved; an inbound message may
  *suggest* a decision/change request that becomes a DailyOps review action, but
  never silently alters an approved commitment (SPEC 05, DailyOps requirement).

No deferred seam may be silently resolved by an early slice; each is recorded and
scheduled.

---

*End of boundary. The Execution OS is constitutionally specified and ready for
the implementation plan and the first vertical slice, both of which must satisfy
and prove I-31…I-41 without reopening I-15…I-30.*
