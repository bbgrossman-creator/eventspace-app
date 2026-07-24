# EventCore — Work Architecture & DailyOps · Constitutional Review

**Scope.** Architectural review only. No SQL, no code, no implementation plan, no
UI. PL-1…PL-4 and v263–v279 remain authoritative and are not reopened. The Booking
Constitutional Addendum (A-1…H, I-48…I-54) is taken as approved direction.

**Grounding.** Performed against the actual repository. The proto-instances cited
in §1 were verified in code during the review, not recalled.

---

## 1 · Is "Derived Work" a missing constitutional concept?

**Yes — but it is missing in name, not in existence.** The system already computes
work in at least five places, each independently invented, none governed by law:

1. The **legacy priority engine** (workflow.ts): "🔥 Hold EXPIRED — collect deposit
   or release the date," "⏰ Hold expires in Nh," with priority ranks. This is a
   work projection — derived from facts plus the clock — written before the
   constitution existed.
2. **v276** `event_stage_detail.next_action`: "Start service." Derived work,
   event-scoped.
3. **v277** `event_workspace.next_actions` and `blockers`: derived attention items
   with reasons and causes.
4. **v278** staffing blockers: "1 of 2 carver position(s) open → Assign staff to
   this role." Derived work from coverage derivation.
5. The **Booking Addendum D-2** composed next-action ("the single next action"),
   already adopted as law for the Base pipeline.

The constitution has been converging on this concept for four consecutive
milestones without naming it. The review request's contribution is the naming and
the generalization — which is precisely how "status is a projection" entered the
constitution: the principle existed in fragments before it became law. The answer
to the first deliverable question is therefore: **Derived Work should be formally
recognized, and doing so is a codification of existing practice, not an invention.**

One correction to the request's vocabulary, and it matters: the request calls work
a "derived obligation." **That term must not be used.** `obligation` is already a
constitutional object — v275 obligations are *authoritative records* (culinary
prepare, equipment pull, staffing assign…), the opposite of derived. Work items
frequently derive *from* obligations ("assign kitchen staff" derives from an
unresolved staffing obligation), which makes the collision actively dangerous: one
word would name both a fact and its shadow. The constitutional term should be
**Work** (work item, work projection), never obligation.

---

## 2 · Two kinds of projection? Three.

Observation 5 proposes State Projections ("what is true?") and Work Projections
("what requires attention?"). The repository shows there is a third kind already in
law, and the taxonomy is only stable when it is named:

- **State projection** — *what is true?* — obligation state, event stage, coverage,
  hold force, commercial stage, financial state.
- **Capability projection** — *what can lawfully be done right now, by this actor?*
  — the v279 availability projection with its reason codes.
- **Work projection** — *what should be attended to right now, and why?* — the
  concept under review.

Capability is neither of the other two. `close_event: available` is not truth about
the event (it is truth about lawful actor capability *now*) and it is not work
(close being possible does not mean closing is needed). Conversely, work can exist
with no capability behind it: "call the customer about the expiring hold" is work,
but the call is not a system ceremony and never will be. The three answer different
questions, are derived from the same authoritative facts, and none may be stored.

The relationship between them is directional and clean: **work items may cite the
capability projection** ("this work is actionable here — the assign ceremony is
available") **and cite the state that generated them** ("because coverage shows a
shortage"), but a work item never *grants* capability and never *asserts* state. It
is a pointer with a reason, an urgency, and a provenance — nothing more.

---

## 3 · The laws Derived Work must obey

This is where the concept either preserves constitutional purity or quietly
destroys it. The failure mode is well known from every task-management system ever
built: derived alerts rot into a stored task table with status flags, and the table
becomes a second truth that disagrees with the first. The following laws prevent
that.

**3.1 · Work is never stored.** No work-item rows, no work status columns, no
caches that survive a read. A work projection is computed from authoritative facts,
the clock, and policy configuration, every time it is read. (Exactly the discipline
already proven for coverage and availability.)

**3.2 · Work identity is deterministic.** UIs need stable identity to render, group,
and deduplicate. Identity must be a natural key derived from the generating facts
(engagement, domain, kind, cause reference) — never a stored row id. Two reads of
the same situation produce the same work item; when the situation resolves, the
item ceases to exist rather than being marked done.

**3.3 · Work clears only through facts.** There are exactly two lawful ways a work
item disappears:
- the underlying condition resolves (*deposit recorded → the follow-up work no
  longer derives*), or
- a **response fact** is recorded and the derivation reads it (*"called customer
  regarding hold, actor, moment" → the call-work no longer derives, or derives
  again after the policy interval*).

Response facts are append-only evidence in the same family as everything else:
touchpoints, communications, deferrals. The system already has the right containers
— the Touchpoints and Communications systems separated in v135–v151 are precisely
where "I called them" belongs. A **deferral** ("snooze until Thursday, actor,
reason") is likewise an attributable append-only fact that the derivation reads —
not a mutable flag on a work item, because there is no work item to flag.

**3.4 · Authored Tasks are a different thing, and the distinction is load-bearing.**
The existing `tasks` table — user-created to-dos with a `done` flag — is legitimate
*authored* work: a human asserted "this needs doing," and a human asserts "it is
done." That is an authoritative record of intent, and its mutable flag is honest
because the human is the source of truth about it. **Derived Work is the opposite:
the facts are the source of truth, so no human may mark it done — they may only
change the facts.** DailyOps presents both, labeled by origin. Collapsing the two —
materializing derived work into the tasks table "for convenience" — is the single
most likely implementation error and should be constitutionally forbidden in
advance.

**3.5 · Policy thresholds are organizational configuration.** "Follow up after
seven days without deposit" contains a fact (no deposit fact exists), a clock, and a
threshold (seven days). The threshold is tenant configuration parameterizing the
derivation — like pipeline templates (I-53), it selects and shapes, it never
invents. Changing a threshold changes what work derives *from now on*, and that is
correct: work is a statement about the present, not history, so it has no
retroactivity problem.

---

## 4 · DailyOps, redefined

Observation 1 and 2 are correct, and the current architecture already half-agrees:
event-scoped DailyOps (v275) reads state projections and renders them; it owns
nothing. The elevation is:

> **DailyOps is the aggregation and presentation of work projections (and authored
> tasks) drawn from every constitutional domain, filtered by responsibility.**

It is a *reader*, structurally identical to the Event Workspace: the workspace
composes state projections about one event; DailyOps composes work projections
about everything. It owns no facts, performs no writes, and dispatches actions only
through the v279 router where a work item is actionable in-system.

The corrected dependency picture in the request is adopted as stated:

Engagement → Authoritative Facts → (State / Capability / Work projections) →
Responsibility filtering → Personal DailyOps · Executive DailyOps.

Event-scoped DailyOps survives unchanged as the special case "work projections
filtered to one event" — no reopening of v275/v276 is implied or permitted.

This review also supplies the constitutional groundwork for two already-deferred
milestones: **v281 (Assignment / Ownership / Work Queues)** and **v282
(Company-wide DailyOps)** are, respectively, the responsibility-mapping layer and
the aggregation layer of exactly this model. Nothing here accelerates them; it
defines the law they must implement when their turn comes.

---

## 5 · Responsibility is configuration — with one sharp edge

Observation 3 is correct and is the most consequential idea in the request. The
work is invariant across company sizes; only its routing changes. A one-person
caterer and a 500-person enterprise run the identical engine, differing only in a
responsibility mapping (person/role ↔ domains, departments, or finer scopes). The
small-company default — one person mapped to everything — produces exactly Ben's
merged personal queue with zero additional configuration. This is the same move as
I-53/I-54: organizational shape lives in configuration; the constitution stays
edition- and size-blind.

The sharp edge: **responsibility must not be conflated with authority.** They are
different objects with different laws:

- **Authority** — *may this actor perform this ceremony?* Constitutional,
  default-deny, evaluated server-side by the ceremonies and re-evaluated by the
  v279 dispatcher. Frozen law.
- **Responsibility** — *is this work routed to this person's attention?*
  Organizational configuration, affecting presentation only.

A person can be responsible without authority (a coordinator watches kitchen work
and escalates; they cannot perform staffing ceremonies) and authorized without
responsibility (the owner may close any event but does not want every event's work
in their queue). If responsibility ever *granted* capability, it would be the
second permission system v279 explicitly forbids. The two meet only in the UI: the
queue shows work per responsibility; buttons appear per the capability projection;
the dispatcher and ceremonies remain final regardless of either.

And one asymmetry worth stating as law because it is the opposite of the authority
default: **authority is default-deny, but work visibility is default-surface.**
Work whose responsibility maps to no one must escalate to the executive aggregate —
it may never silently vanish. An unauthorized action hidden is safety; an unowned
follow-up hidden is a lost customer.

The Executive DailyOps of Observation 4 follows with no additional machinery: it is
the responsibility filter set to "everything," grouped by domain of origin, with
provenance preserved on every item (which domain, which facts, which cause).

---

## 6 · Contradiction check

Searched for genuine contradictions with existing law; findings:

1. **No contradiction with the projection discipline** — provided the §3 laws hold.
   The dismissal/snooze path is the one place the model can breach "never stored,"
   and §3.3 closes it by routing every human response through append-only facts.
2. **A naming contradiction exists and is avoidable** — "derived obligation" vs
   v275 obligations (§1). Resolved by vocabulary law: the concept is Work.
3. **A potential contradiction with v279 exists and is avoidable** —
   responsibility-as-permission (§5). Resolved by the responsibility ≠ authority
   law.
4. **No contradiction with the Base-tier requirement** — the opposite. Base
   collapses to a single personal queue ("what needs my attention today"), which
   *reduces* cognitive load relative to today's scattered signals. The addendum's
   D-1/D-2/I-54 already permit this: DailyOps per edition is a rendering choice
   over the same projections.
5. **No contradiction with frozen Operations law** — v275–v279 objects are read,
   never modified. The existing next_actions/blockers become the first citizens of
   the named concept retroactively, without changing a line of them.

---

## 7 · Answers to the eight questions

1. **Is Derived Work a missing constitutional concept?** Yes — missing in name.
   Five unnamed instances already exist; formal recognition codifies practice.
2. **Should Work Projections exist alongside State Projections?** Yes, and alongside
   a third kind the system already has: Capability Projections (v279). Three kinds,
   one discipline: derived, never stored, never competing with truth.
3. **Should DailyOps be elevated above Operations?** Yes: DailyOps is the
   platform-wide aggregation and presentation of work (and authored tasks) from all
   domains, filtered by responsibility. Event-scoped DailyOps remains as the
   single-event special case. This is the constitutional definition of deferred
   v282.
4. **Is responsibility fundamentally different from constitutional domains?** Yes —
   it is organizational configuration, like pipeline templates and policy
   thresholds. Domains are law; responsibility is routing. And responsibility is
   also fundamentally different from *authority*, which stays default-deny and
   ceremony-enforced.
5. **Should personal DailyOps be generated dynamically from responsibility
   assignments?** Yes — a personal queue is the work projection filtered by the
   person's responsibility mapping, computed at read time. Nothing is stored per
   person.
6. **Does this preserve constitutional purity while scaling?** Yes, under the §3
   laws. The one-person caterer is the trivial responsibility mapping; the
   enterprise is a richer one; truth, ceremonies, and projections are identical.
7. **Are there constitutional contradictions?** Two avoidable ones (naming;
   responsibility-vs-authority), both resolved by explicit law; one rot-vector
   (stored work) closed by §3.1–3.4. No contradiction with frozen law.
8. **What should be added to the Booking Constitutional Addendum?** The section
   below, verbatim or near it, before any implementation begins.

---

## 8 · Proposed addendum additions

To be appended to the Booking Constitutional Addendum as **Section J · Work and
Responsibility**, with invariants continuing the existing numbering:

- **J-1.** Three projection kinds exist: State (what is true), Capability (what may
  lawfully be done now, per actor), and Work (what requires attention now, and
  why). All are derived; none is ever stored; none competes with authoritative
  facts.
- **J-2.** A Work item is a derived pointer carrying: domain of origin, cause
  reference(s) to authoritative facts, reason, urgency, deterministic natural-key
  identity, and — where actionable in-system — a citation of the capability
  projection. It asserts nothing and grants nothing.
- **J-3.** Work derives from authoritative facts, the clock, and tenant policy
  thresholds. Thresholds are organizational configuration parameterizing
  derivation; they select and shape, never invent.
- **J-4.** Work clears only through facts: resolution of the underlying condition,
  or an append-only response fact (touchpoint, communication, deferral) that the
  derivation reads. No done flag, snooze flag, or work row exists.
- **J-5.** Authored Tasks (human-created, human-completed) are authoritative records
  of intent and remain a separate system. Derived Work is never materialized into
  Tasks; DailyOps presents both, labeled by origin.
- **J-6.** DailyOps is the aggregation and presentation of Work projections and
  authored Tasks across all domains, filtered by responsibility. It owns no facts,
  performs no writes, and dispatches only through the action router. Event-scoped
  DailyOps is the single-event special case.
- **J-7.** Responsibility is organizational configuration mapping people to scopes
  of work for presentation. It is not authority, confers no ceremony capability,
  and creates no permission. Authority remains default-deny and ceremony-enforced.
- **J-8.** Work visibility is default-surface: work with no responsible party
  escalates to the executive aggregate and is never hidden by omission.

Invariants: **I-55** (three projection kinds, all derived, never stored), **I-56**
(work identity deterministic; work clears only through facts), **I-57** (response
facts append-only; no mutable work state exists anywhere), **I-58** (thresholds are
configuration; derivation is retroactivity-free because work describes the
present), **I-59** (derived work is never materialized into authored tasks),
**I-60** (responsibility ≠ authority; responsibility affects presentation only),
**I-61** (unowned work surfaces by default), **I-62** (DailyOps writes nothing and
routes all actions through the dispatcher).

Vocabulary law, recorded to prevent the §1 collision: the concept is named **Work**;
the word **obligation** remains reserved for v275 authoritative records.

---

## 9 · Verdict

The direction is correct and is a codification, not a departure: the constitution
has produced unnamed work projections in four consecutive shipped milestones plus
the pre-constitutional priority engine, and the request names the pattern, elevates
DailyOps to its natural role as the work-side counterpart of the Event Workspace,
and separates responsibility (configuration) from truth (law). Adopted with three
sharpenings — three projection kinds rather than two; the clearing-through-facts
law that keeps derived work from rotting into a task table; and the explicit
responsibility ≠ authority boundary that keeps it from becoming a second permission
system. With Section J and I-55…I-62 added to the addendum, v281 and v282 have
their law waiting for them, and nothing in PL-1…PL-4 or v263–v279 is touched.
