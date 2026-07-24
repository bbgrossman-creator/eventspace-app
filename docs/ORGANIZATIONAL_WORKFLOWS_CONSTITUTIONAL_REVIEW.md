# EventCore — Organizational Workflows, Responsibility & Personal DailyOps · Constitutional Review

**Scope.** Architectural review only. No SQL, no UI, no migrations, no milestone
plans. Accepted as constitutional direction and not reopened: PL-1…PL-4, v263–v279,
the Booking Constitutional Addendum (A–H, I-48…I-54), and the Work Architecture
review (Section J, I-55…I-62).

**Grounding.** Performed against the repository. The decisive citation: v275 law
already requires `department in ('culinary','equipment','staffing','venue',
'logistics')` on every obligation — verified in `v275_execution_spine.sql` during
this review.

---

## 1 · The central finding: "Lines of Work" names two different things — and both already exist in law

The request's list — Commercial, Scheduling, Finance, Kitchen, Warehouse,
Transportation, Staffing, Execution — mixes two constitutionally distinct kinds:

**Domains** (Commercial, Scheduling, Financial, Operations): bodies of
*authoritative truth*. Each owns its own records, its own ceremonies, its own
boundaries. Fixed at four by the Booking Addendum. Commercial genuinely owns
proposals and acceptances; Financial genuinely owns settlement facts. These are
law.

**Departments** (Kitchen, Warehouse, Transportation, Staffing, Venue):
*specializations within the Operations domain*. And they are not a proposal — they
are already constitutional: every v275 obligation carries a mandatory `department`
dimension, and the mapping is exact — Kitchen is `culinary`, Warehouse is
`equipment`, Transportation is `logistics`, Staffing is `staffing`, plus `venue`.
The deferred Kitchen OS / Warehouse OS / Transportation OS milestones are the
future deepening of these existing dimensions, not new domains.

Two entries in the list dissolve on inspection: "Finance" *is* the Financial
domain, and "Execution" *is* the Operations domain itself — confirming that the
list was naming scopes of two different ranks.

This distinction is not pedantry; it prevents a real contradiction. If Kitchen were
elevated to a domain co-equal with Commercial, the domain law would break: Kitchen
owns no independent authoritative truth. Every kitchen fact is an Operations fact
(an obligation or evidence record carrying `department='culinary'`), derived from
the released event, written by Operations ceremonies, gated by Operations law. A
"Kitchen domain" would either duplicate Operations records (competing truth) or be
an empty label. The same holds for Warehouse and Transportation.

**Resolution — the concept the request is actually reaching for:** a **Work
Scope** ("Line of Work" is an acceptable synonym): *any named scope over which work
is grouped, a workspace exists, and responsibility may be assigned.* Work Scopes
come in exactly two constitutional kinds:

- the **four domains** (fixed, constitutional), and
- the **operational departments** (the department dimension within Operations —
  constitutionally present, extended only by Operations law, never promoted to
  domains).

So the answer to deliverable question 2 first, because everything follows from it:
**Lines of Work are a refinement, not a new parallel system** — the union of
domains and departments, both already in law. What this review adds is the *name*
for that union and the laws governing work grouping, workspaces, and layering over
it.

---

## 2 · Department workflows: derived stage ladders, not state machines

Observation 2's pipelines (Kitchen: Released → Recipe Complete → Prep Scheduled →
Prep Started → Prep Complete; Warehouse: Packing List Ready → Picking → Packed →
Loaded → Returned; …) look like lifecycles, and the constitutional question is
what kind of thing they may be. The answer is already settled by precedent:

**A department workflow is a derived stage projection over department-scoped
obligations and evidence — exactly as `event_stage` is a derived projection over
event-scoped facts.** "Packed" is not a status anyone sets; it is the derivation
"every packing obligation for this event carries completion evidence." The
existing machinery is sufficient in kind: obligations (with department), evidence
kinds (assignment, scan, inspection, completion), and derivation. Where the
deferred department milestones need richer facts (a picking scan, a truck-load
record), they add *evidence kinds and obligations*, never stored stage columns.

And the visible ladders themselves fall under existing presentation law: a
department's displayed pipeline is a **template rendering** governed by I-53 — it
may select, relabel, and collapse derived states; it may never invent a state or
accept a write. Ben's kitchen and a hotel's banquet kitchen may show different
ladders over the same derivations.

This is the single most important guardrail this review adds, because Observation
2 is exactly where implementations rot: five departments × a stored status column
each would recreate the legacy booking pipeline five times over. The law must
forbid it before Kitchen OS is ever written.

---

## 3 · One work projection, three filters — not three systems

Observation 3's three DailyOps levels are correct as *renderings* and dangerous as
*systems*. The constitutionally clean statement:

**There is one work projection. Every DailyOps view is that projection under a
standard filter:**

- **Scope DailyOps** (Kitchen DailyOps, Commercial DailyOps…) = the work
  projection filtered to one Work Scope.
- **Personal DailyOps** = the work projection filtered by a person's
  responsibility mapping (which is a set of scopes, per J-7).
- **Executive DailyOps** = the work projection unfiltered, grouped by scope, with
  provenance preserved (J-8's default-surface law lands here).

One derivation, many renderings — the same principle that governs coverage and the
workspace. This is strictly cleaner than a monolithic DailyOps *and* cleaner than
per-department DailyOps implementations: the layering is in the filter, never in
the derivation. If three teams ever build three work derivations, the model has
failed.

Two refinements to the levels as sketched:

**Personal DailyOps as default entry (Observation 4): yes — as presentation law,
not constitutional law.** "What do I need to do today?" is how operators think, and
the personal queue is the correct default landing for operational users — and it
is *already* the Base-tier experience the prior reviews defined, so this
generalizes Base rather than adding to it. But defaults are edition/presentation
decisions (the D-family), and the law should say only: the personal queue is
composed dynamically from responsibility at read time, and departmental workspaces
remain independently navigable. Which surface greets a user is configuration.

**Executive DailyOps (Observation 6): yes — and it is more than a bigger queue for
a precise reason.** The sketched executive view ("Kitchen: 4 prep delays ·
Finance: $42,000 outstanding") composes *two* projection kinds per scope: work
summaries (counts of derived work) **and state summaries** ($42,000 outstanding is
financial *state*, not work). So the executive dashboard is constitutionally a
**per-scope composition of state projections and work projections** — an
organizational-health rendering. It stores nothing, asserts nothing, and preserves
provenance on every line.

---

## 4 · Provenance becomes law

Observation 5 / question 8: yes, and J-2 already requires most of it (domain of
origin, cause references). This review tightens it to include the scope:

**Every work item carries its originating Work Scope and cause references to the
authoritative facts that generated it.** The drill-through ("Follow up Goldberg
proposal" → Commercial workspace; "Pack rentals" → Warehouse workspace) is then
pure presentation: navigate to the scope the item already names, focused on the
cited facts. The personal queue aggregates; the originating scope's workspace
remains where facts are inspected and ceremonies are dispatched (through the
router, per I-62). No work item is ever actionable *only* in the queue in a way it
is not actionable in its home workspace.

---

## 5 · The layering, corrected

Observation 8's four layers are close, with two corrections that matter
constitutionally.

**First:** Responsibility is not a layer between projections and presentation —
because it must never filter *state* or *capability*. Event stage is not
per-person; the availability projection is per-actor by *authority*, not by
responsibility (J-7). Responsibility parameterizes the presentation of **work
only**. Placing it as a full layer invites the error of responsibility-filtered
truth.

**Second:** the sketch describes only the read path. The write path — ceremonies
and the action router — is absent, and any architectural statement that omits it
invites presentation-layer writes.

The constitutionally correct picture:

**Three data layers and one configuration plane.**

- **Layer 1 — Authoritative Facts.** Domain records, written only by ceremonies.
- **Layer 2 — Derivation.** State, Capability, and Work projections; computed,
  never stored (I-55).
- **Layer 3 — Presentation.** Workspaces (per scope), Personal DailyOps, Executive
  DailyOps, pipelines. Reads projections; dispatches only through the router.
- **Configuration plane** (beside layers 2–3, never touching layer 1):
  responsibility mappings, policy thresholds (J-3), pipeline and ladder templates
  (I-53), edition settings (I-54). Configuration parameterizes derivation and
  presentation; it never writes facts, never grants authority, never becomes
  truth.

The write path runs Presentation → router → ceremonies → Facts, and nowhere else.

---

## 6 · Answers to the ten questions

1. **Formally recognize Lines of Work as constitutional operational workflows?**
   Recognize **Work Scopes** — and note both kinds already exist in law: the four
   domains (fixed) and the operational departments (the v275 department
   dimension). Their *workflows* are derived stage projections, not new
   constitutional state machines.
2. **Distinct from domains or a refinement?** A refinement. Domains own truth;
   departments are dimensions within Operations. Promoting departments to domains
   would create competing truth and is rejected.
3. **Should each derive its own Work Projections?** Each scope's work is the one
   work projection *filtered by scope* — same derivation, scoped view. Departments
   contribute work through their obligations/evidence/coverage exactly as domains
   contribute work through their facts.
4. **Personal DailyOps dynamically composed from responsibility?** Yes — computed
   at read time from the responsibility mapping; nothing stored per person (J-7,
   I-60).
5. **Personal DailyOps as primary workspace for most users?** Yes as default entry
   — recorded as presentation/edition law, not constitutional law. It is the
   generalized Base experience.
6. **Departmental workspaces independently navigable with their own workflows?**
   Yes — as scope-filtered workspaces whose ladders are derived-stage template
   renderings under I-53. They add no write paths.
7. **Executive DailyOps as organizational health rather than a bigger list?** Yes —
   a per-scope composition of state summaries *and* work summaries, structure
   preserved, provenance intact, nothing stored.
8. **Provenance as law?** Yes — every work item carries originating scope + cause
   references; drill-through is presentation.
9. **Scalability across the four organization sizes?** Yes. Scopes exist
   identically everywhere; only the responsibility mapping's shape changes (one
   person ↔ everything; divisions ↔ scopes ↔ teams). No constitutional object
   varies by organization size — proposed as an explicit invariant below, which is
   the strongest form of "never different software for different sizes."
10. **Contradictions introduced?** Two were latent in the request and are resolved
    by this review: departments-as-domains (competing truth — resolved by the
    two-kind scope model) and department stage machines (stored status — resolved
    by derived-ladder law). One is inherited and re-affirmed: responsibility must
    not filter state/capability or grant authority (J-7 extended by the layering
    correction). With those closed, no contradiction with frozen law remains.
    One boundary deliberately deferred: *item-level* claiming ("I'm on this task")
    is v281's question; if it ever exists, it must be an append-only claim fact
    under J-4, never work state — noted now so v281 inherits the constraint.

---

## 7 · Proposed addendum additions — Section K · Work Scopes and Organization

- **K-1.** A **Work Scope** is a named scope over which work is grouped, a
  workspace may exist, and responsibility may be assigned. Work Scopes are of
  exactly two kinds: the four domains, and the operational departments (the
  department dimension of Operations). "Line of Work" is a synonym.
- **K-2.** Departments own no independent authoritative truth. Their facts are
  Operations facts carrying the department dimension; their ceremonies are
  Operations ceremonies; department deepening (Kitchen/Warehouse/Transportation
  OS) adds obligation kinds and evidence kinds, never records outside Operations.
- **K-3.** A department workflow is a derived stage projection over
  department-scoped obligations and evidence. No department stage is ever stored.
  Displayed ladders are template renderings under I-53.
- **K-4.** There is one work projection. Scope DailyOps, Personal DailyOps, and
  Executive DailyOps are that projection under standard filters (scope;
  responsibility; all-grouped-by-scope). Parallel work derivations are forbidden.
- **K-5.** Every work item carries its originating Work Scope and cause references.
  Drill-through to the originating workspace is presentation; ceremonies dispatch
  only through the router from any surface.
- **K-6.** Executive DailyOps is a per-scope composition of state summaries and
  work summaries with provenance preserved. It stores nothing and writes nothing.
- **K-7.** The architecture is three data layers — Facts, Derivation, Presentation
  — plus a configuration plane (responsibility, thresholds, templates, editions)
  that parameterizes derivation and presentation of work and never touches facts,
  authority, or state truth. The sole write path is presentation → router →
  ceremonies → facts.
- **K-8.** Personal DailyOps is composed at read time from the responsibility
  mapping and is the default operational entry as presentation law; departmental
  workspaces remain independently navigable.

Invariants: **I-63** (Work Scopes are two kinds; departments are never domains),
**I-64** (no stored department stage; department workflows are derived; ladders are
templates), **I-65** (one work projection; every DailyOps is a filter of it),
**I-66** (work-item provenance — scope + cause references — is mandatory),
**I-67** (responsibility filters work presentation only; it never filters state or
capability and never grants authority; item-level claims, if ever introduced, are
append-only facts under J-4), **I-68** (executive views are compositions of
projections and store nothing), **I-69** (no constitutional object varies by
organization size or structure; organizational shape lives entirely in the
configuration plane).

---

## 8 · Verdict

The organizational model should become constitutional law — in the corrected form.
The request's instinct is right and its examples prove themselves: the work is
constant, the organization is configuration, and the system already contains both
halves (four domains in the addendum; five departments in v275's mandatory
dimension). What this review contributes is the rank distinction that prevents
departments from becoming competing-truth domains, the derived-ladder law that
prevents five new stored pipelines, the one-projection-many-filters law that
prevents three DailyOps implementations, and the three-layers-plus-configuration-
plane picture that keeps responsibility away from truth and all writes on the
router. With Section K and I-63…I-69 adopted, the deferred v281/v282 and the
department OS milestones inherit complete law before a line of any of them is
written — and EventCore's guiding principle holds in its strongest form: not
merely *the same software* for every company size, but *no constitutional object
that could even express* a size difference.
