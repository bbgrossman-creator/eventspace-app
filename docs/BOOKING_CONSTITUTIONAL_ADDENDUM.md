# EventCore — Booking Constitutional Addendum

**Standing.** This addendum is constitutional law for the commercial half of the
system, adopted from the Booking Workflow Constitutional Review. It defines the
Engagement, the four domains, their ceremonies and projections, and the presentation
law that governs every edition. It contains no implementation. Every subsequent
slice — hold ceremonies, availability correction, financial projections, pipeline
presentation — must trace to a numbered statement in this document.

It changes no frozen law. PL-1…PL-4 and v263–v279 stand as written; this addendum
extends the same principles to the domains those versions did not yet govern.

**One item is severable and urgent.** The availability predicate defect (conflict
detection trusting stored status over the hold deadline — Review §2.1) is a
corrective patch under existing law (I-45-family: projections derive, status never
competes with truth). It requires nothing from this addendum and must not wait for
it.

---

## A · The Engagement

**A-1.** The **Engagement** is the root identity of a commercial relationship about
an occasion: one party, one occasion, one thread of record. The existing `bookings`
row is the Engagement root. Nothing replaces it.

**A-2.** The Engagement is an identity, not a state machine. It has no authoritative
lifecycle of its own. Everything that "happens to a booking" is a recorded fact in
one of four domains, and every state anyone sees is a projection over those facts.

**A-3.** Facts attach to the Engagement through ceremonies. No domain fact is
written by UI flows, imports, or direct table access.

**A-4.** Domains are independent unless a boundary statement below says otherwise.
An Engagement may hold a date with no proposal, carry a proposal with no hold, or
settle finances after operational closure. No universal ordering exists across
domains; ordering exists only *within* a domain where its own law creates it.

---

## B · The four domains

Each domain is defined by: its question, its authoritative records, its ceremonies
(the only writers), and its projections (derived, never stored).

### B-1 · Commercial — "What are we agreeing to?"

**Records (existing, frozen):** immutable proposal versions; offer snapshots;
acceptances; rescissions. The sealed version ledger is the sole commercial history.

**Ceremonies (existing, frozen):** seal/present under PL-1…PL-3; `accept_offer`;
`rescind_acceptance`.

**Ceremony (new, small):** *confirm carried price* — records that a human affirmed
an inherited value in a specific version. This is the only new commercial fact this
addendum creates.

**Projections:** commercial stage (drafting → presented → accepted | rescinded),
derived from the PL ledger; price provenance — **Originated / Carried / Modified are
derived by walking sealed versions and are never stored; Confirmed is read from the
confirmation fact.** No mutable provenance flag may exist.

**Boundary:** Acceptance closes the domain. After an unrescinded acceptance, the
commercial record is read-only history and the frozen accepted model is the sole
commercial truth downstream (finance, obligations, staffing quantities).

### B-2 · Scheduling — "What capacity is claimed?"

**Records (new):** hold facts — placed (party, window, room, deadline, actor),
extended (new deadline, actor, attributable), released (append-only). A confirmed
date is a scheduling fact of the Engagement, distinct from any hold.

**Ceremonies (new):** *place hold*, *extend hold*, *release hold* — the established
ceremony pattern (default-deny, tenant-scoped, thread-first lock, named refusals).
Competing claims on one slot are race-sensitive and require genuine two-backend
certification when implemented.

**Projections:** hold force — **active | expiring | lapsed, derived from the
deadline and extension/release facts at read time; never read from a stored
status.** Availability and conflicts derive from hold force plus confirmed dates. A
lapsed hold participates in nothing: not availability, not conflicts, not
alternate-date suggestion, not first-refusal.

**Boundary:** Scheduling is not the beginning of the commercial lifecycle and is not
a stage of any pipeline. It is a parallel domain. A hold is optional; a date claim
confers no commercial state and no operational state.

### B-3 · Operations — "What must happen, and is it happening?"

**Records, ceremonies, projections (existing, frozen):** v275–v279 in their
entirety — event, obligations, execution evidence, staffing relations; release /
start / close / evidence / staffing ceremonies; obligation state, event stage,
readiness, coverage, workspace, available actions, routed dispatch.

**This addendum adds nothing to Operations and reopens nothing.**

**Boundary:** Operational Release opens the domain. Its predicate (unrescinded
commitment + clearance + sign-off) already binds Operations to Commercial and
Financial facts; that predicate is the constitutional handoff and is already law.

### B-4 · Financial — "What is owed and what is settled?"

**Records:** deposit facts, payment facts, guest-count confirmation facts —
append-only evidence attached to the Engagement. (Today these live partly in legacy
columns; when implemented as facts, legacy columns become compatibility inputs, per
§E.)

**Ceremonies (new, when implemented):** *record deposit*, *record payment*,
*confirm count* — same pattern, same discipline.

**Projections:** financial state (deposit pending/held, count unconfirmed/confirmed,
invoice derived from the frozen accepted model + settlement facts, unpaid/paid).
The invoice is a derivation and an artifact, never a stage.

**Boundaries:** a deposit fact serves two masters — the financial projection and the
release predicate's clearance leg — without belonging to Operations. The financial
domain routinely remains open after operational closure; this is lawful and is why
no single line can represent an Engagement.

---

## C · Boundary law (cross-domain)

**C-1.** Acceptance is the sole commercial→operations boundary. Release is the sole
operations opening. They are distinct moments; the interval between them (deposit
collection, planning, count confirmation) is ordinary and unbounded.

**C-2.** No projection in one domain may write, or be stored as, state in another.
Cross-domain influence flows only through ceremony predicates reading facts (as the
release predicate already does).

**C-3.** Completion is domain-specific: operational completion is the derived
`closed` stage; financial completion is the derived `paid` state; commercial
completion is acceptance. "Complete" as a single Engagement state does not exist in
law — only in presentation (§D).

---

## D · Presentation law (editions and pipelines)

**D-1.** The constitutional model is identical in every edition. Editions differ
only in which projections a surface renders. No edition has different schema,
ceremonies, authority, or law. Complexity is additive by edition, never by
architecture.

**D-2.** The **Base pipeline is a projection**: a composed rendering of "the
furthest lawful point across the four domains, plus the single next action." It is
computed at read time and can therefore never disagree with truth. No stored enum
may back it.

**D-3 · Pipeline templates.** The Base pipeline is **configurable by business
type**, under one strict rule:

> **A pipeline template may select, relabel, and collapse derived domain states. It
> may never invent a state, reorder law, or accept a write.**

A template is a named mapping from derived states to display steps — venue, caterer,
and planner templates are different selections and labels over the same four
projections. Because a template contains no logic and no storage, it cannot become a
second workflow engine, cannot lie, and cannot fork the constitution per industry.
Template choice is tenant configuration; template *content* is server-defined
mapping, not user-authored workflow. (A user-authored workflow designer remains
explicitly out of scope, as in v279.)

**D-4.** Pro renders the four domains as parallel lanes with their derived states
and histories. Enterprise additionally renders the Execution OS surfaces that
already exist (workspace, actions, coverage, DailyOps). Neither adds law.

**D-5.** Every next-action suggestion shown in any edition must originate from a
derived projection (the composed next-action, the workspace next-actions, or the
available-actions projection) — never from client-side stage reasoning. (This
extends the v279 rule — no duplicated stage law in TypeScript — to the commercial
surfaces.)

---

## E · Compatibility law

**E-1.** The stored booking status column is demoted to a write-through display
cache during migration, then read-only, then vestigial. It is never again an input
to any predicate. (The availability corrective patch enacts the first instance of
this rule immediately.)

**E-2.** The legacy `menu` JSON and related columns are compatibility inputs for
pre-constitutional bookings only. No current-architecture path treats them as
authoritative. Legacy bookings are never force-migrated into invented proposal
versions; they remain readable forever through compatibility projections.

**E-3.** Nothing is deleted while load-bearing. Legacy surfaces are removed only
after their projection-backed replacements pass browser acceptance on every
consumer.

---

## F · Invariants introduced by this addendum

- **I-48** The Engagement is an identity; every visible Engagement state is a
  projection over domain facts. No authoritative Engagement lifecycle exists.
- **I-49** Hold facts are ceremony-recorded and append-only; hold force is derived
  from the deadline and extension/release facts at read time.
- **I-50** Availability and conflict projections derive from hold force and
  confirmed dates; no stored status participates. A lapsed hold blocks nothing.
- **I-51** Price provenance is derived from the sealed version ledger; only the
  confirmation act is a recorded fact; no mutable provenance flag exists.
- **I-52** Financial settlement facts are append-only evidence; financial state is
  derived; the invoice is a derivation of the frozen accepted model plus settlement
  facts.
- **I-53** Pipeline presentations are projections. A pipeline template may select,
  relabel, and collapse derived states; it may never invent a state or accept a
  write.
- **I-54** Editions differ only in rendered projections — never in schema,
  ceremonies, authority, or law.

Proof obligations attach when each slice implements: I-49/I-50 carry named proof
claims ("a lapsed hold never blocks scheduling") and race certification for
competing claims on one slot; I-51 carries a determinism proof over version walks;
I-52 carries append-only and derivation proofs in the staffing style.

---

## G · What this addendum does not do

It does not reopen PL-1…PL-4 or v263–v279. It does not implement anything. It does
not define UI. It does not create a workflow designer, user-authored pipelines, a
second permission system, or any new stored state beyond the enumerated facts (hold
facts, settlement facts, the price-confirmation fact). It does not absorb v280+
milestones.

---

## H · Traceability

Review §2.1 → severable corrective patch (pre-addendum law). Review §1.3/§3 → A-1…
A-4, B-1…B-4, C-1…C-3. Review §4 + accepted refinement (configurable pipelines) →
D-1…D-5, I-53/I-54. Review §6.1–6.5 → B-1 provenance law, I-51. Review §6.6 → B-2,
I-49/I-50. Review §6.7/§5 → E-1…E-3. Implementation slices that follow must cite
these statement numbers in their reports.
