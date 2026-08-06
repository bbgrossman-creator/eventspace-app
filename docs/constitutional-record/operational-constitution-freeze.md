# The Operational Constitution Freeze

*A closure ceremony. This document declares the constitutional state of EventCore's operational spine. It designs nothing.*

---

## Preamble

Four documents define EventCore: the **Atlas Constitution** (ontology), the **Product Constitution** (product philosophy), the **Interaction Constitution** (interaction grammar), and the **Dependency Map** (operational causality). The Traceability Matrix audited all four and found the operational spine complete, the commercial and knowledge halves incomplete, and three defects — one blocking, two documentary.

This document draws the boundary. What is inside is settled and may be built. What is outside is deliberately unfinished and must not be improvised into existence during implementation.

**Three corrections are recorded as errata rather than designs**, because each states what is already true rather than deciding anything new:

- **E‑1 · `event` is a work container, not the Event File.** The repository's `event` row is created by release, is keyed one-to-one to an occurrence, and is never surfaced as an identity. It is the materialisation of work for a service. Any future reading of `event` as the Event File is drift, and this erratum exists to prevent it.
- **E‑2 · "The Book" is a dangling reference.** PC‑2.2 cross-references *"The Book and the Library are places, not operators (Articles 6 and 8)"* — but Article 6 governs Knowledge and Article 8 the Day axis. The Book has no article. It is **not** part of this freeze. The reference must be struck or the capability given an article; until then it does not exist constitutionally.
- **E‑3 · Four duplicate authorities are grandfathered, not blessed.** `obligation_state`, `event_stage`/`event_stage_detail`/`event_readiness`, `event_workspace.readiness_by_category`, and `projection_feed.at_risk` predate the canonical model. This freeze names the canonical authority in each case and declares the others **superseded pending retirement**. They are retirement debt, not precedent.

---

# Part I · The frozen operational constitution

Seventeen concepts. Each is constitutionally settled. Implementation may realise them; it may not redecide them.

## F‑1 · Event File identity

**Owner** — the Event File itself. No workspace owns it.
**Governing** — PC‑4; Dependency Map I & IV; UI‑1.1, UI‑2.1–2.3.
**Why complete** — one continuous identity from inquiry to settlement is ruled; the booking is the file and occurrences are its services; both halves exist and are certified individually. Only a resolver naming the relationship remains, and that is implementation.
**Must preserve** — one identity, never split, never merged. Acceptance changes state and creates no aggregate. `event` is a work container (E‑1). The operator never experiences two event objects.

## F‑2 · Services / Occurrences

**Owner** — `engagement_occurrence`.
**Governing** — Atlas OC‑1…OC‑25 (one event per occurrence, structurally enforced); PC‑4.4; Dependency Map IV.
**Why complete** — certified at 27 claims, and the grain split is ruled: commercial work at file grain, operational work at service grain.
**Must preserve** — a service is never a second Event File. It carries no client, no proposal, no commercial identity. Cross-service dependencies remain **inside** one file. Operational work may branch; commercial identity may not.

## F‑3 · Operational dependency graph

**Owner** — the promise, translated by doctrine.
**Governing** — the Dependency Map in full; Atlas `obligation.dependencies` and `obligation_nk_complete`; PC‑5.8.
**Why complete** — the promise is the specification; dependency and workflow are distinguished and ruled; dependency resolution is certified.
**Must preserve** — **dependency is structural; workflow is operational; the two are never merged.** Workspaces receive requirements, not instructions. Every event-specific requirement traces to the promise; standing obligations trace to operating at all. Nothing is transcribed.

## F‑4 · Readiness

**Owner** — composed from facts each workspace authors. `responsibility_state` remains the sole authority at its grain.
**Governing** — Atlas R‑13; PC‑7.3, PC‑7.5, PC‑9.7, PC‑9.12; Dependency Map VII; certified at twenty permanent claims with negative controls.
**Why complete** — it is the only capability in this freeze that is already certified end to end.
**Must preserve** — lifecycle and readiness are separate axes. `ready` means **unimpeded**, never complete; completion is the phase `settled`. Only `impedes` moves a verdict — never risk, completeness, ownership or lateness. Every verdict decomposes structurally to its grounds. Composition is bottom-up. Cancelled and settled yield `not_applicable`.

## F‑5 · Priority

**Owner** — doctrine, by ruling.
**Governing** — PC‑9.15; Dependency Map VII.
**Why complete** — the mechanism, the separation from readiness, and the binding constraints are settled. **One value remains: the ranking itself.** Supplying that ruling is the completion of this article, not a reopening of it.
**Must preserve** — priority is prescriptive; readiness is descriptive; neither derives from the other. Every impeding code outranks every non-impeding one. The order is total, strict, and stated in exactly one place. Readiness verdicts are byte-identical before and after priority exists.

## F‑6 · Next Action

**Owner** — derived; authored by nobody.
**Governing** — PC‑7.4; Dependency Map VII; UI‑1.3, UI‑9.3.
**Why complete** — fully specified as a selection over grounds the payload already carries, and the interaction pattern already exists in v4.
**Must preserve** — one action, phrased as an instruction, carrying the ground that selected it. Never a list. Never a button. It authors no truth. Grounds that cannot be acted upon are excluded from selection.

## F‑7 · Event axis

**Owner** — the Event File.
**Governing** — PC‑8.2; UI‑1.1, UI‑2.4.
**Why complete** — identity follows the promise; the vertical cut is the primary event-centred experience.
**Must preserve** — the file is always visible; the lens is always named; the scope is always stated.

## F‑8 · Day axis

**Owner** — nobody. It is a projection.
**Governing** — PC‑8; Dependency Map VII; UI‑3.3.
**Why complete** — its purpose, its relationship to the Event axis, and its prohibition are all ruled.
**Must preserve** — **the Day stores nothing and authors nothing.** Both axes consume the same canonical truth. Nothing may be true in one and false in the other. Either entrance reaches the same station.

## F‑9 · Kitchen

**Owner** — Kitchen. Department: `culinary`.
**Governing** — PC‑2, PC‑3; Atlas R‑12; Dependency Map II & VII.
**Why complete** — it is the terminus of the menu branch; its ownership, authorship and prohibitions are ruled.
**Must preserve** — owns production; authors prepped, cooked, packed, released, purchasing, cost, allergen handling; never changes price, rentals or rosters. Its clock is the production day.

## F‑10 · Warehouse

**Owner** — Warehouse. Department: `equipment`.
**Governing** — PC‑2, PC‑3; Dependency Map II & VII.
**Why complete** — terminus of the design and equipment branches, distinguished from procurement by the **return leg**.
**Must preserve** — owns everything that is not food, including what must come back. Shortages and damages are its facts. Settlement cannot complete while its obligations are open.

## F‑11 · Setup

**Owner** — Setup. Department: `venue`.
**Governing** — PC‑2, PC‑3; Dependency Map II & VII.
**Why complete** — terminus of the design branch *at a place* rather than at an object.
**Must preserve** — owns the room. Its blockers are frequently external and must be shown as such rather than presented as our lateness.

## F‑12 · Transport

**Owner** — Transport. Department: `logistics`.
**Governing** — PC‑2, PC‑3; Dependency Map II & VII.
**Why complete** — it is the edge between two locations, not a branch terminus, and is inherently cross-event.
**Must preserve** — owns movement, never contents. Its primary axis is the day.

## F‑13 · Staffing

**Owner** — Staffing. Department: `staffing`.
**Governing** — PC‑2, PC‑3; **Ruling 3**; Dependency Map II & VII.
**Why complete** — ruled as canonical, covering all labour categories, with its workflow named.
**Must preserve** — it is the **cross-section** of the graph, not a branch of it. It is never folded into Kitchen, Setup or Event Management. It owns all labour: culinary, service, captains, bartenders, drivers, setup crew.

## F‑14 · Event Management

**Owner** — coordination.
**Governing** — PC‑2, PC‑3; Dependency Map VII (cross-edges); UI‑5.2.
**Why complete** — its defining constraint is ruled, which is the part that matters.
**Must preserve** — **accountability without authorship.** It may display any workspace's state and may change none of it. It owns the run of show, compliance obligations, vendor and venue liaison, the Count Ceremony and the debrief.

## F‑15 · Owner

**Owner** — the portfolio.
**Governing** — PC‑2, PC‑7 (Ruling 7); UI‑1.5.
**Why complete** — its prohibition is ruled precisely, which is the whole of its constitutional content.
**Must preserve** — **rollups never store.** Owner aggregates and displays facts authored elsewhere. It authors **intent only** — targets, thresholds, policy. It never produces an operational verdict or a health score. If it needs an answer nobody gives, a workspace must start giving it.

## F‑16 · Count Ceremony

**Owner** — Event Management.
**Governing** — PC‑7.7; Atlas `attendance_commitment` with basis, certified (OB‑9, OB‑10).
**Why complete** — the four counts are named and distinguished, the basis vocabulary is certified, and the ceremony discipline is ruled.
**Must preserve** — contracted, guaranteed, final and actual are four different numbers and are never conflated. The guaranteed count binds price; the final count binds production. A count change shows its blast radius **before** it commits and reaches every workspace as an announced handoff.

## F‑17 · Station model

**Owner** — doctrine.
**Governing** — PC‑2, PC‑3; Ruling 3; Atlas R‑12 (closed five departments).
**Why complete** — nine stations are ruled; five departments are closed and certified; and the relation follows from PC‑2's ownership statements — Kitchen↔culinary, Warehouse↔equipment, Setup↔venue, Transport↔logistics, Staffing↔staffing, with Sales, Event Management, Money and Owner holding no department.
**Must preserve** — both vocabularies are closed. No station owns the Event File. Stations sleep; they never disappear. The station↔department relation is doctrine, not data, and must be recorded explicitly at implementation rather than inferred again.

---

# Part II · Explicitly excluded

Outside the freeze by intent. **Implementation may not improvise any of these into existence.**

## Commercial

Money in every form: pricing, invoices, payments, payables, receivables, cost reconciliation, financial settlement. The ontology of commitment and acceptance beyond the certified release predicate. Amendments and their commercial consequence.

**Why excluded** — PC‑3 defines Money's completion in terms of four objects no document defines. This is the single major constitutional gap identified in the audit.

**Settlement** sits here by inheritance. Its eight closure obligations are enumerated precisely by Ruling 6, and its operational half is constitutionally settled — but two obligations are financial, so settlement cannot complete inside this freeze.

## Knowledge

Composition governance. Promotion authority — who may promote an extracted candidate into governed knowledge. Library governance. The doctrine/experience distinction as an implemented split. Instantiation governance. Proposal Studio and its tracks. The blueprint/component/publication subsystem's relationship to the Knowledge Library.

**Why excluded** — extraction without a promotion gate would fill the Library with incident, and the substrate subsystem is governed by none of the four constitutional documents.

## Product refinement

The six unlegislated interaction patterns: empty states, error and refusal, loading, consequential forms, the Day view layout, and "what changed since I last looked." Vendor workflow. Conditional promise elements. Feasibility — its composition rule is complete, but its inputs, the capacity facts each workspace would author, are undefined. Hostile environments. Bulk action. Multi-location. The client portal.

**Feasibility carries a caveat**: defining capacity may prove to be ontology rather than refinement. If so, it is reclassified, not improvised.

## Operator validation

Whether nine workspaces are too many at small scale. Whether the debrief ritual actually happens. Whether the Library survives being empty on day one. Whether the priority order matches what operators reach for. Whether services-beneath-one-file matches how caterers think about a simcha. Whether `ready` reads as unimpeded rather than complete.

**These cannot be resolved by design.** They require operators using the product.

---

# Part III · The freeze contract

## F‑C1 · Implementation may

- extend implementation of any frozen concept;
- improve performance, reliability and operator ergonomics;
- improve usability within the Interaction Constitution;
- add proofs, claims, tests and certification;
- retire the four grandfathered duplicate authorities (E‑3).

## F‑C2 · Implementation may not

- **change constitutional ownership.** No capability moves between workspaces.
- **introduce a second truth.** Nothing may be true in one place and false in another.
- **introduce a duplicate authority.** E‑3's four are grandfathered as retirement debt; they are not precedent, and no fifth may join them.
- **redesign the interaction language.** The Interaction Constitution governs, and its Article 11 extension test binds every new pattern.
- **invent ontology.** If a concept needs a definition that does not exist, implementation stops and the question returns as constitutional work.
- **implement anything in Part II.** Excluded is not "not yet reached"; it is "deliberately unfinished."

## F‑C3 · Precedence

Where implementation and this freeze conflict, the freeze governs. Where the freeze and the Atlas Constitution conflict, Atlas governs — Atlas is ontology, and this document is boundary.

---

# Part IV · Reopening criteria

The operational constitution may be reopened only on one of four grounds, each requiring evidence rather than argument.

**F‑R1 · Demonstrated contradiction.** Two frozen articles cannot both be honoured. The reopening must name both and show the case in which they conflict.

**F‑R2 · Implementation impossibility.** A frozen article cannot be built as written — not that it is difficult, expensive, or awkward, but that no correct implementation exists. The attempt must be shown.

**F‑R3 · Operator evidence.** Real operators, using the product, behave in a way the model cannot express. Evidence is observed use, not anticipated preference.

**F‑R4 · Constitutional inconsistency.** A frozen article contradicts the Atlas Constitution, the Product Constitution, the Interaction Constitution or the Dependency Map. The inconsistency must be located by citation.

## F‑R5 · Explicitly rejected as grounds

**Elegance is not a reopening criterion.** That a different architecture appears cleaner, more symmetrical, more modern, more general, or more like some other system is **not grounds to reopen anything in Part I.** The cost of an architecture is not paid at design time; it is paid by operators relearning a product that keeps changing beneath them, and by engineers rebuilding work that was already correct.

Also rejected: unfamiliarity with the reasoning, preference for a different vocabulary, the availability of a new technique, and the fact that a decision was made before the person now reviewing it arrived.

**A reopening under F‑R1–F‑R4 amends this document formally.** It does not proceed by implementation quietly diverging.

---

# Part V · Implementation charter

## F‑I1 · The phase has changed

EventCore now **implements ratified decisions**. It does not continue architectural exploration. The question in front of an engineer is no longer *"what should this be?"* but *"is this built, proved and true to what was ruled?"*

## F‑I2 · Every release is one of three kinds, declared

**Implementation** — realises a frozen article. Introduces no ontology, no ownership change, no interaction pattern. Judged by whether it is faithful and proved. *Example shape: the Event File identity resolver; the station registry; next action.*

**Product refinement** — improves how a frozen capability is used, within the Interaction Constitution. May legislate one unlegislated pattern under Article 11, once and deliberately. Introduces no ontology.

**Constitutional work** — resolves something in Part II, or amends Part I under F‑R1–F‑R4. **Produces a document before it produces code**, and that document is ratified before implementation begins.

**A release is exactly one kind.** A release that mixes them is a release in which the constitutional change was not reviewed, because it arrived wearing an implementation's clothes. This is the single most important discipline in this charter.

## F‑I3 · Order of work

Implementation of the operational spine may proceed immediately and in any order the engineering judgment prefers, with one constraint: **retirement of the grandfathered duplicate authorities (E‑3) should not be deferred indefinitely.** Every release that passes them by increases the chance of a fifth joining them.

## F‑I4 · Money is a constitutional exercise, not an implementation

Money must be designed constitutionally **before** it is built, not while it is. Its ontology — what a price, an invoice, a payment, a payable and a cost are, and who may assert each — is a document, ratified, and only then implemented.

---

# Final constitutional declaration

> **The operational constitution is now frozen and implementation may proceed within these constitutional boundaries.**

The seventeen articles of Part I are settled. They are traceable from ontology through product philosophy and operator interaction to operational dependency, and one of them — Readiness — is already certified with twenty permanent claims. The capabilities in Part II are deliberately outside this freeze and remain constitutional work.

**Future operational releases must treat this document as constitutional law until it is formally amended.** An amendment requires evidence under F‑R1 through F‑R4, a document, and ratification — in that order. No implementation may amend it by divergence.

Three errata are recorded and take effect with this freeze: **E‑1**, that `event` is a work container and not the Event File; **E‑2**, that The Book has no article and does not exist constitutionally until given one or struck; and **E‑3**, that four duplicate authorities are grandfathered as retirement debt and set no precedent.

One ruling remains open inside the freeze: **the priority ranking (F‑5)**. Supplying it completes that article. It is not a reopening.

The constitutional phase for EventCore's operational spine is closed.