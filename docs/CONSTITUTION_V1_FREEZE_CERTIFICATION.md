# EventCore — Constitutional Freeze Certification Report (Version 1.0)

**Nature of this document.** The closing audit of the constitutional design
process. Its mandate was falsification: find a genuine contradiction, ambiguity,
redundancy, or over-modeling, or certify the constitution for permanent freeze.
The audit was performed against the full corpus — PL-1…PL-4, the implemented law
of v263–v279, and the Booking Constitutional Addendum with Sections A–H, J, K, and
L (I-48…I-71) — and against the repository, with exact citations verified during
the audit rather than recalled.

---

## 1 · Executive verdict

**The constitution is internally coherent, complete, minimal, and ready to freeze
as Version 1.0 — after five freeze-time clarifications are incorporated.**

None of the five is a new concept, a reopened decision, or a design change. Each
is a wording repair or a classification of law that already exists. Three of them
correct defects found *in the constitutional documents themselves* (including two
in clauses this reviewer wrote), and one corrects the freeze request's own
restatement of the architecture. The audit found **no contradiction that survives
these clarifications**, no concept requiring removal, and no missing concept whose
absence creates a contradiction. The vocabulary should be frozen, all future work
should shift to implementation and design under the frozen law, and amendments
should thereafter require a demonstrated contradiction.

The five clarifications, in full, are in §3. The question-by-question audit
follows in §4. The freeze declaration and amendment procedure are in §5–6.

---

## 2 · Method

Each constitutional clause was tested three ways: against every other clause
(consistency), against the shipped v263–v279 law it must coexist with
(compatibility), and against the concrete operational cases raised across the five
reviews (adequacy). Where a suspicion arose, the exact text and the exact code
were pulled and cited. Findings below reference clause numbers and, where
relevant, file locations verified during the audit.

---

## 3 · Findings — five freeze-time clarifications

### C-1 · The layering is three layers plus a plane — and the freeze request itself misstates it

The freeze request's Question 4 restates the architecture as four linear strata:
*Facts → Derivation → Configuration → Presentation.* That restatement contradicts
the adopted law. K-7 deliberately rejects configuration as a stratum: it is a
**plane beside** derivation and presentation, precisely so that configuration can
never sit *between* facts and their projections — the position from which
responsibility-filtered truth and lens-aware derivation would become expressible.
The Lenses review (§5) reaffirmed this and the freeze document must not
accidentally repeal it by restatement.

**Clarification:** the canonical architecture in the frozen constitution is:
*Authoritative Facts → Derivation (State, Capability, Work) → Presentation*, with
a **Configuration Plane** (responsibility, thresholds, templates, lenses,
editions) parameterizing derivation and presentation from the side, and the sole
write path running Presentation → router → ceremonies → Facts. Any four-layer
linear rendering of this is non-normative.

### C-2 · A-2's wording is contradicted by Section J's facts

A-2 states (verified verbatim): *"Everything that 'happens to a booking' is a
recorded fact in one of four domains."* Section J then lawfully created facts that
belong to **no single domain**: response facts (touchpoints, communications,
deferrals — J-4) and authored Tasks (J-5). A deferral of commercial work is not
Commercial-domain truth; a task may concern anything. As written, A-2 and J-4/J-5
contradict.

**Clarification (amends A-2 by one sentence, changes no behavior):** facts attach
to the Engagement either as **domain facts** (owned by one of the four domains) or
as **response and intent facts** (touchpoints, communications, deferrals, authored
Tasks) that carry scope and cause provenance referencing the domain facts or work
they concern. Response and intent facts remain append-only (or human-completed, for
Tasks per J-5), are written by their own small ceremonies, and never constitute a
fifth domain — they are annotations *about* engagement truth, located *by*
provenance.

### C-3 · K-7's configuration clause is narrower than shipped, lawful practice

K-7 states (verified verbatim) that the configuration plane "parameterizes
derivation and presentation **of work** and never touches facts, authority, or
**state truth**." But shipped, lawful, and *correct* practice already has
configuration parameterizing a **state** projection: the availability/conflict
derivation takes the tenant's changeover buffer and service-hours policy as
parameters (verified in workflow.ts — `bufferMin` from changeover policy applied
inside the overlap predicate). Whether two events conflict genuinely depends on a
tenant's changeover policy; that is not a violation, it is the projection's law
admitting a named parameter. As written, K-7 forbids something the constitution
elsewhere requires (the Addendum's own availability projection).

**Clarification (amends K-7's scope, changes no behavior):** configuration may
parameterize **any** derivation *where that projection's own law admits a named
tenant parameter* — work thresholds (J-3), availability buffers and policy hours,
templates and ladders (I-53/K-3), lenses (L-1). Configuration still never
contradicts a fact, never grants authority, never stores derived output, and never
selects *which facts exist* — it tunes derivation functions, it does not
participate in truth.

### C-4 · The one-Work-Projection law needs its subsumption clause

K-4 declares one work projection and forbids parallel derivations. But frozen,
shipped law already contains work derivations that predate it: v276's
`next_action`, v277's `next_actions` and `blockers`, v278's staffing blockers
(verified — `'next_actions'` is computed inside the shipped `event_workspace`
body), and the Addendum's D-2 composed Base next-action. Read strictly, K-4
retroactively indicts frozen law; read loosely, it licenses forks. Neither is
acceptable in a frozen constitution.

**Clarification (transitional law, reopens nothing):** the shipped event-scoped
next-action and blocker derivations are **lawful precursors** of the Work
Projection. When the unified Work Projection is implemented, they are **subsumed**:
each becomes a rendering of the one projection (replaced in place per repository
convention, additively, with regression preserved per E-3), and D-2's Base
next-action is defined as *the highest-ranked item of the one Work Projection
under the appropriate lens* — never a separate derivation. From the moment of
subsumption, K-4 binds absolutely; until then, no **new** work derivation may be
created outside the unified one.

### C-5 · Completeness requires naming the stratum that already exists beneath the domains

Question 2 asks whether every authoritative fact has a constitutional home, and
Question 7 whether any responsibility lies outside the four domains. Answered
honestly: **yes, some does — and it always has.** Tenancy and membership
(`tenant_users`), identity and authority evaluation (`current_tenant_id`,
`can_manage_staffing`, `is_active_member`), and routing metadata
(`action_invocation`, proven in v279 to be non-domain, non-truth) are authoritative
records and law, and they belong to no domain. They are not engagement truth at
all — they are the **platform substrate** the domains stand on, frozen as
implemented law since v263–v279.

**Clarification (classification only — zero new objects):** the four domains
partition **engagement truth**. Beneath them sits the platform substrate —
tenancy, identity, authority, and routing metadata — which is constitutional,
already frozen, owned by no domain, and governed by its own already-proven laws
(default-deny authority, tenant isolation, ledger-never-truth). Naming it makes
the completeness claim true instead of approximately true. Nothing is added;
something that exists is finally on the map.

### Minor finding · vocabulary hygiene (folded into the freeze, not numbered)

Two sanctioned synonyms — "Line of Work" for Work Scope (K-1) and "context" for
lens (Section L) — should be demoted to non-normative at freeze. Frozen
constitutions should have one name per concept; synonyms are how drift starts.
Reserved-word law is reaffirmed: **obligation** names v275 authoritative records
only; **Work** names the derived concept; the engagement lens is named for the
**Engagement**, never the Event.

---

## 4 · The audit, question by question

**Q1 · Internal consistency.** Two textual contradictions found and resolved
(C-2, C-3); one contradiction *in the freeze request's own restatement* found and
resolved (C-1); one strict-reading conflict between K-4 and frozen shipped law
resolved by transition (C-4). No principle-level contradiction exists: authority
vs responsibility, scope vs lens, derived vs authored work, domain vs department —
each pair audited, each cleanly disjoint. Definitions were checked for double
assignment; none conflict after C-2.

**Q2 · Completeness.** Complete after C-2 and C-5. Every fact family now has a
home: domain facts in the four domains; response/intent facts located by
provenance; substrate facts in the named substrate. Every derived concept
(state, capability, work; stages, coverage, availability, provenance, hold force,
financial state) has a defined derivation basis. No orphan concepts found.

**Q3 · Minimality.** The vocabulary is minimal. Removal candidates were tested:
Scheduling (the thinnest domain) cannot fold into Commercial — a hold with no
proposal is independent truth, and the expired-hold defect is the standing proof
of what treating capacity claims as commercial stages costs. Capability cannot
fold into Work (an available action is not attention; the Lenses review's
falsification method reconfirmed the three-kind taxonomy). The only removals
recommended are the two synonyms (§3, minor). No section merely restates another:
overlaps found (I-53 ↔ K-3 ↔ L-1's template component) are citations and
applications, and L-1 properly unifies templates as the rendering component of a
lens.

**Q4 · Layer integrity.** Clean after C-1 and C-3, with the leak inventory
re-checked: the legacy status column is already sentenced by E-1 (demoted, then
read-only, then vestigial — the availability corrective patch is its first
enforcement); presentation writes are confined to the router path (I-62, K-7);
configuration cannot reach facts or authority (C-3's amended clause); lenses
cannot reach derivation (I-70). The one live leak in production remains the known
availability defect — already adjudicated as a severable corrective patch under
existing law, not a constitutional matter.

**Q5 · Scalability.** Invariant across all four organization sizes with zero
size-expressible constitutional objects (I-69), responsibility as configuration
(J-7), lenses as configuration (L-1/L-5), and the trivial-mapping default for the
one-person operator. Nothing in the freeze corpus can express a size difference;
this is the strongest form of the requirement and it holds.

**Q6 · Work.** One Work Projection remains sufficient and, after C-4, becomes
airtight: department workflows are derived ladders that *contribute* work, never
derive their own (K-3/I-64); every DailyOps — scope, personal, executive,
event-scoped — is re-certified as a filter or grouping of the one projection
(K-4/J-6/K-6); executive views compose but never store (I-68); nothing may mark
derived work done (J-4/I-57); authored Tasks remain separate (J-5/I-59).

**Q7 · Domains.** Four domains remain sufficient for **engagement truth** — the
audit attempted to place every known responsibility and found only the substrate
(C-5) outside them, which is beneath, not beside. No fifth domain is needed:
response/intent facts are annotations (C-2), departments are dimensions (I-63),
and every future operational deepening lands inside Operations.

**Q8 · Operations.** Kitchen, Warehouse, Transportation, Staffing, Venue remain
departments — re-verified against the implemented dimension (`department in
('culinary','equipment','staffing','venue','logistics')` on every v275
obligation). Operations remains the sole owner of execution; the department OS
milestones are bound in advance by K-2/K-3/I-64 to add obligation kinds, evidence
kinds, and derived ladders only.

**Q9 · Provenance.** Complete for every lawful lens: originating scope, cause
references, and the engagement reference (L-3) cover scope, engagement,
organization, and — via cause references and configuration — date, resource,
account, and person lenses. The audit sought a lawful lens that provenance cannot
key and found none; per L-2, any future lens must pivot on carried provenance or
applied configuration, so the completeness is self-maintaining. No additional
provenance element is constitutionally required.

**Q10 · Future evolution.** All future growth proceeds through implementation
under frozen law: ceremonies and evidence models (hold ceremonies, settlement
facts, price confirmation, department evidence kinds), projections (the unified
Work Projection, financial state, hold force, provenance), workspaces and lenses,
and the deferred operational systems (v280+, department OS work) — every one of
which now has its governing law written before its first line of code. That
inversion — law before implementation, proven at each slice — is the process that
produced this constitution, and it continues *under* it rather than *upon* it.

---

## 5 · Certification

Subject to incorporation of clarifications C-1 through C-5 and the vocabulary
demotion, this audit certifies that the EventCore constitutional architecture is:

- **internally consistent** — no contradiction survives the clarifications;
- **complete** — every authoritative fact, derived concept, and responsibility has
  a constitutional home, including the substrate;
- **minimal** — no concept is removable without loss; no section restates another;
  elegance is achieved by the falsification of the last proposed abstraction
  (Context), not by its adoption;
- **layered with integrity** — three layers, one plane, one write path, no leaks
  beyond the already-sentenced legacy column;
- **scale-invariant** — constitutionally incapable of expressing an organizational
  size difference.

**The constitutional vocabulary should be frozen. EventCore has reached
Constitution Version 1.0.**

---

## 6 · The freeze, and what comes after

**Amendment procedure (recommended as the final constitutional act):** the frozen
constitution may be amended only upon a *demonstrated contradiction* — a concrete
case that existing law cannot resolve — recorded as a numbered amendment with its
own falsification review. Alternative designs, elegance, and new abstractions are
explicitly insufficient grounds; the Context review is the template for how such
proposals are to be received: examined seriously, and adopted only for what
survives.

**Recommendation on future reviews: adopted in full.** All subsequent work shifts
from constitutional architecture to operational system design, workspace design,
and implementation under the frozen law — beginning, in order of standing
priority: the severable availability corrective patch (already adjudicated);
the Scheduling facts and ceremonies (I-49/I-50 with their named proof claims and
race obligations); the unified Work Projection with the C-4 subsumption; the
financial facts (I-52); provenance and confirmation (I-51); and the presentation
work (pipelines, lenses, DailyOps) that renders it all. Each slice arrives with
its law already written, its invariants already numbered, and its proof bar
already set.

The constitutional design process that began with a booking pipeline that could
lie now ends with an architecture in which nothing visible *can* lie: facts are
authoritative, everything seen is derived, everything organizational is
configuration, and the only doors into truth are ceremonies. That is the endpoint
this process was for.

**Constitution Version 1.0 — CERTIFIED FOR FREEZE (with clarifications C-1…C-5
incorporated).**
