# The EventCore Constitutional Framework

*The constitution of the constitutions. Read this before any other constitutional document.*

---

# Article I · Purpose

## I.1 · Why the corpus exists

EventCore is a system in which many people, in many roles, act on one shared truth. The hard part of such a system is never a feature. It is **agreement about who may say what is true**, and about what happens at the seams where one kind of truth becomes another.

Specifications answer *what shall be built*. They cannot answer *who is entitled to assert this, and what does it mean when they do*. A specification can be met perfectly and still leave two subsystems each certain of a different count. Constitutions exist because the failures that destroy operational software are failures of authority, not of implementation.

## I.2 · Why constitutions rather than specifications

Four properties distinguish a constitution from a specification, and EventCore needs all four.

**It is durable.** A specification is satisfied and superseded. A constitution outlives the release that first honoured it.

**It is binding upward.** Implementation derives from a constitution; a constitution is never inferred from what was built. Where those disagree, the implementation is wrong.

**It is exclusive.** A specification may overlap another and merely duplicate effort. Two constitutions claiming the same question produce two truths — the failure mode this entire architecture exists to prevent.

**It is amendable only deliberately.** A specification changes when convenient. A constitution changes when evidence requires it, through a stated procedure, in the open.

## I.3 · What constitutional law means inside EventCore

A constitutional statement is one that would remain true if every line of code were deleted. That *ready* means unimpeded; that a counterparty's act may never be performed on their behalf; that doctrine cannot be false, only outdated — none of these is a design decision. They are the terms on which the business is intelligible at all.

Constitutional law therefore **binds engineering, product and design equally**. It is not a review gate. It is the ground on which those disciplines stand.

---

# Article II · The constitutional corpus

Seven documents. Three assert truth; one explains propagation; three direct construction. Their constitutional roles follow.

## Atlas Constitution

**Question** — *What is true about our own subjects, and who may say so?*
**Jurisdiction** — assertions about subjects inside the institution: work, evidence, states, ownership, tenancy, and observed **experience**.
**Authority** — supreme over the truth of any claim it governs. No document may contradict it.
**Governs** — what makes an operational fact true; when work is discharged; who owns a responsibility; what evidence is; the truth-versus-presentation line; how observations are superseded; what is answerable as of a moment.
**Does not govern** — anything with a counterparty; anything that is an artefact rather than a claim; why the product exists; how anything is displayed.

**Constitutional role: the ground.** Every other document presupposes it.

## Engagement Constitution

**Question** — *What has been undertaken between the institution and another party, on what terms, and has it been discharged?*
**Jurisdiction** — undertakings with a counterparty: offers, terms, options, acceptance, rescission, money owed, payment.
**Authority** — sole over what binds us to anyone outside the institution.
**Governs** — what binds and when; what a term is and when it may change; what is owed in money and in which direction; what a counterparty may do that we may not; when an undertaking ends.
**Does not govern** — how we fulfil; what we know; cost; the client's history.

**Constitutional role: the institution's outward-facing boundary.** The only place an actor outside the institution can change what is true.

## Knowledge Constitution

**Question** — *What does the institution hold as approved and reusable, who may approve it, and what happens when it is used?*
**Jurisdiction** — approved reusable artefacts: doctrine, Compositions, candidates.
**Authority** — sole over what the institution holds as its own way of doing things.
**Governs** — what doctrine is; who may approve; when history becomes knowledge; what freezes and what stays current when doctrine is used.
**Does not govern** — observations (Atlas); undertakings (Engagement); why the Library matters (Product).

**Constitutional role: the institution's memory.** The only document governing things that cannot be wrong — only outdated.

## Product Constitution

**Question** — *What is the product, and what belongs in it?*
**Jurisdiction** — purpose, operators, workspaces, the Event File as the product's central object, the axes, the permanent principles.
**Authority** — decides what belongs in EventCore. **It defines; it does not make true.**
**Governs** — why the product exists; who the operators are; what each owns, authors, observes and may never change; what a workspace is and when it is complete; the test by which a proposed feature is judged.
**Does not govern** — what makes any of it true; how any of it is met by an operator; how it is built.

**Constitutional role: the arbiter of belonging.** A capability may be perfectly true and still not belong.

## Interaction Constitution

**Question** — *How does an operator meet what the other documents establish?*
**Jurisdiction** — layout, navigation, hierarchy, colour, density, disclosure, action placement, vocabulary, and the extension test governing new patterns.
**Authority** — sole over expression. Binding on all UI work.
**Governs** — how identity, scope, next action and handoff are shown; what colour means; how a new interaction pattern may be introduced.
**Does not govern** — what is shown, whether a capability should exist, or what is true.

**Constitutional role: the guarantee of familiarity.** It exists so architecture may deepen without operators relearning the product.

## Dependency Map

**Question** — *How does an authored promise become work throughout the business?*
**Jurisdiction** — operational causality.
**Authority** — **explanatory. It asserts no truth and creates no authority.** Its force is that it constrains what may coherently be designed.
**Governs** — why a promise becomes work; why work appears where it does; why one promise element reaches different workspaces differently; the distinction between dependency and workflow.
**Does not govern** — what is true, what binds, what belongs, or how anything appears.

**Constitutional role: the bridge.** The only document that explains rather than decides, and the reason the workspaces are derivable rather than chosen.

## Operational Constitution Freeze

**Question** — *What is settled, what is deliberately unfinished, and on what terms may implementation proceed?*
**Jurisdiction** — the boundary between constitutional architecture and implementation.
**Authority** — governs readiness, not content. It settles nothing new and defines nothing.
**Governs** — which capabilities are settled; what is excluded and why; what implementation may and may not do; the four grounds for reopening; how a release declares its kind.
**Does not govern** — the content of anything it freezes.

**Constitutional role: the seal.** It is the only document that can say *now build*.

---

# Article III · Jurisdiction

Every constitutional question belongs to exactly one document. The matrix below is exhaustive for the questions the corpus can be asked; each appears once.

| Constitutional question | Governing document |
|---|---|
| What makes a fact about our own operations true? | Atlas |
| Who owns a responsibility, and may it be unowned? | Atlas |
| When is work discharged, lapsed, void or superseded? | Atlas |
| What counts as evidence? | Atlas |
| What is an observation, and when is it superseded? | Atlas |
| Is a change truth or presentation? | Atlas |
| What is answerable as of a moment? | Atlas |
| What is a subject, and how is it identified? | Atlas |
| What binds us to another party? | Engagement |
| What is a term, and when may it change? | Engagement |
| What is an option, and when does it lapse? | Engagement |
| Who may accept, decline or rescind? | Engagement |
| What is owed in money, and in which direction? | Engagement |
| When is an account discharged? | Engagement |
| What is a counterparty? | Engagement |
| What is doctrine, and can it be wrong? | Knowledge |
| Who may approve reusable knowledge? | Knowledge |
| When does history become institutional knowledge? | Knowledge |
| What happens when doctrine is used? | Knowledge |
| What freezes and what stays current? | Knowledge |
| Why does EventCore exist? | Product |
| Who are the operators, and what does each own? | Product |
| What is a workspace, and when is it complete? | Product |
| What is the Event File, as a product object? | Product |
| Does a proposed capability belong? | Product |
| How is a capability met by an operator? | Interaction |
| What does a colour, a chip or a pipeline mean? | Interaction |
| May a new interaction pattern be introduced? | Interaction |
| Why does a promise become work? | Dependency Map |
| Why does work appear in this workspace and not that one? | Dependency Map |
| Is this a dependency or a workflow? | Dependency Map |
| Is this capability settled enough to build? | Operational Freeze |
| On what grounds may settled law be reopened? | Operational Freeze |
| What kind of release is this? | Operational Freeze |

## III.1 · Why no document duplicates another

Truth is partitioned by three tests that are **mutually exclusive and jointly exhaustive**:

> **Is there a counterparty?** → Engagement.
> **Is it a claim about a subject?** → Atlas.
> **Is it a thing we hold?** → Knowledge.

No truth in a catering business escapes all three, and none satisfies two. A claim about a subject has no counterparty; an undertaking is not a thing we hold; an artefact asserts nothing.

The remaining four documents govern something other than truth, and cannot collide with the three or with each other: Product decides **belonging**, Interaction decides **expression**, Dependency explains **propagation**, the Freeze declares **readiness**. Four different verbs, applied to the same subject matter, producing no contest.

## III.2 · Two pairs that look like duplication and are not

**Product PC‑4 and Freeze F‑1 both concern the Event File.** Product *defines* it; the Freeze *declares it settled*. Definition and readiness are different statements.

**Product PC‑6 and the Knowledge Constitution both concern the Library.** Product says *why institutional memory matters*; Knowledge says *what makes an artefact authoritative and who may approve it*. Purpose and authority are different statements.

---

# Article IV · Order of interpretation

## IV.1 · What the order is for — and what it is not

Because jurisdiction is exclusive (Article III), **a genuine conflict between two documents is impossible.** If two appear to conflict, one of them is speaking outside its jurisdiction.

The order of interpretation is therefore **first a diagnostic and only second a precedence rule**. Its primary use is to locate the error; precedence resolves the residue.

## IV.2 · The derivation

Precedence follows from what kind of statement each document makes, and each level is derived from the level above it.

**Level 1 — Atlas · Engagement · Knowledge. Peers.**
They come first because every other document presupposes that truths exist and have owners. Product describes a product made of truths; Interaction expresses truths; Dependency relates truths; the Freeze declares which are ready. Nothing can be built on a contested truth.

**They do not rank against each other, and ranking them would be an error** — it would imply an overlap the three tests deny. Where two appear to claim one truth, the resolution is the three tests, never precedence.

**Level 2 — Dependency Map.**
It sits above the directive documents because it describes structure that design cannot overrule: one cannot design a product in which consequences do not follow. It sits below Level 1 because it asserts nothing — it explains relations between truths it does not own.

**Level 3 — Product Constitution.**
Above Interaction because Interaction expresses Product and says so of itself. Below Dependency because Product may not assign a consequence to a workspace the graph does not deliver it to.

**Level 4 — Interaction Constitution.**
Below Product because it governs *how*, never *whether*. Where Product requires something the interaction language cannot express, the requirement stands and Interaction's extension test governs the manner of expression — the two are not in conflict; they answer different questions.

**Level 5 — Operational Constitution Freeze.**
Last, because it governs **when**, not **what**. It cannot make something true, well-designed or belonging. It can only say whether what the levels above have settled may now be built. Its own text already places it here: it defers to Atlas and governs implementation.

**Level 6 — Implementation.**
Derives from all of the above and amends none of them.

## IV.3 · The resulting order

```
1  Atlas · Engagement · Knowledge   (peers — truth)
2  Dependency Map                   (propagation)
3  Product Constitution             (belonging)
4  Interaction Constitution         (expression)
5  Operational Constitution Freeze  (readiness)
6  Implementation                   (realisation)
```

This differs from the ordering offered as an example in one respect, and the difference is deliberate: **the Dependency Map ranks second, not sixth.** An explanatory document that binds nothing would be inert; the Dependency Map earns its position because a product design that violates causality is incoherent regardless of how well it is expressed.

## IV.4 · The procedure on apparent conflict

1. **Locate the question** in the Article III matrix.
2. **Read only the governing document.** The other is speaking outside its jurisdiction and is, on this question, without authority.
3. **If the question is absent from the matrix**, it is unlocated. Silence is not permission (VII.4); locating it is constitutional work.
4. **Only if a question genuinely falls to two documents** does precedence apply — and that outcome is itself evidence of a jurisdictional defect requiring amendment under Article VI.

---

# Article V · Constitutional boundaries

Authority flows in one direction at every seam. Each statement below is one-directional and none is reciprocal.

**Atlas defines truth. Product does not redefine it.** Product may say a workspace owns a class of fact; it may not say what makes one of those facts true.

**Engagement defines what binds. Operations do not alter it.** A workspace may record that reality diverged from a term; it may never change the term.

**Knowledge defines what is authoritative. Engagement does not approve it, and operations do not revise it by practice.** Practice becomes policy only through promotion.

**Dependency explains propagation. It asserts nothing.** It may show that a consequence must reach a workspace; it may not declare that consequence true.

**Product decides belonging. Interaction does not.** A capability's absence from the interface is not evidence that it does not belong.

**Interaction expresses. It does not decide what is expressed.** Its extension test constrains manner, never requirement.

**The Freeze declares readiness. It defines nothing.** It cannot settle a question that was never answered; it can only record that one was.

## V.1 · The two transfers

Two seams transfer authority rather than merely bounding it. Both are absolute; neither leaves shared custody.

**Release** — Engagement to Atlas. An accepted undertaking becomes internal work. Acceptance binds outcome; release commits method.

**Instantiation** — Knowledge to Engagement. Approved doctrine becomes a term and is frozen at its version. Knowledge retains no authority over the copy, and would otherwise be able to alter what a counterparty agreed to.

**Both transfers are specified from both sides**, by the two constitutions concerned, in agreeing terms. That is deliberate: a boundary described only from one side is a boundary one party can move.

---

# Article VI · Amendment

## VI.1 · By document

| Document | Bar | What triggers amendment |
|---|---|---|
| **Atlas · Engagement · Knowledge** | **highest** — ratification required | a demonstrated contradiction, or a truth that fails all three tests |
| **Dependency Map** | **correction, not decision** | a dependency shown to be wrong, or one discovered. It is descriptive; it cannot be amended by preference |
| **Product** | **high** — ratification for purpose, operators, ownership, principles | a change to what belongs, who owns it, or why the product exists |
| **Interaction** | **self-governing extension** under its own Article 11; ratification to change a rule | legislating an unlegislated pattern, once and deliberately |
| **Operational Freeze** | **F‑R1–F‑R4 only** | contradiction, impossibility, operator evidence, or constitutional inconsistency. **Elegance is expressly rejected** |
| **This Framework** | **highest** | a change to the corpus's membership, jurisdiction or interpretation |

## VI.2 · By kind of change

**Implementation only** — realises settled law without redefining it. No ontology, no ownership change, no new interaction pattern.

**Product refinement** — improves how a settled capability is used, within the Interaction Constitution. May legislate one unlegislated pattern. Introduces no ontology and moves no ownership.

**Constitutional work** — locates a new truth, moves ownership, alters a jurisdiction, or amends any document above. **Produces a ratified document before it produces code.** A release is exactly one kind; a release that mixes them is one in which the constitutional change was never reviewed.

## VI.3 · Growth of the corpus

**The corpus may be corrected and may shrink. It grows only on proof.** A new constitution requires demonstrating a jurisdiction none of the seven covers — which requires a truth failing all three tests of III.1. No such truth has been found, and the burden of finding one rests entirely on the proposer.

## VI.4 · Amendment is answerable as of a moment

Each truth constitution requires that its truths be answerable as of a date. The corpus holds itself to the same standard: **what was constitutional on a given date must remain knowable.** Amendments are appended and dated; superseded articles are retained.

---

# Article VII · Interpretation

Derived from how the corpus was built, not restated from within it.

**VII.1 · Exclusive jurisdiction.** Every question has exactly one governing document. *Derived from:* Article III's construction. *Consequence:* an apparent conflict is a jurisdictional error, and the remedy is relocation, not arbitration.

**VII.2 · Prefer reduction to expansion.** *Derived from:* the corpus's own method — Engagement reduced sixteen candidate objects to seven and ten ceremonies to ten; Knowledge reduced fourteen objects to three and ten ceremonies to six. *Consequence:* a proposal that adds an object bears the burden of showing it cannot be merged.

**VII.3 · Read for authority, not vocabulary.** The same word appears across documents in different senses — *event*, *promise*, *ready*, *obligation*, *composition*, *account*. **Meaning is fixed by the governing document, never by the word.** *Derived from:* the erratum that `event` is a work container rather than the Event File. *Consequence:* a citation must name the document, not merely the term.

**VII.4 · Silence is not permission.** A question no document governs is not free; it is **unlocated**. *Derived from:* the audit's finding that four subsystems had escaped governance while working correctly. *Consequence:* discovering an ungoverned capability is a constitutional finding, not a licence.

**VII.5 · Derivation flows downward only.** Implementation derives from constitutions; no constitution is ever inferred from what was built. *Derived from:* the Freeze's prohibition on amendment by divergence. *Consequence:* where code and constitution disagree, the code is wrong, however long it has worked.

**VII.6 · Custody is not authority.** Holding a thing does not confer the right to govern it. *Derived from:* the Library holding experience that Atlas governs. *Consequence:* "it lives here" is never an argument about jurisdiction.

**VII.7 · Transfer is absolute.** Where authority transfers — at release, at instantiation — it transfers wholly. There is no shared custody and no residual right. *Derived from:* the two transfers of V.1. *Consequence:* a doctrine revision can never reach a signed promise.

**VII.8 · A judgment is never a fact.** Composed judgments — readiness, feasibility, priority, any rollup — are derived and re-derivable, never stored as though asserted. *Derived from:* the readiness/priority separation and the prohibition on storing rollups. *Consequence:* a persisted judgment is a second truth by construction.

---

# Article VIII · Constitutional completeness

The corpus was attacked on five fronts.

## VIII.1 · Missing jurisdictions

**Attempted:** find a truth failing all three tests.

- *A contract server, hired for one night.* Outside the institution — a counterparty. **Engagement.** *(That the Staffing workspace spans two jurisdictions for employees and contractors is not a defect: workspaces are not jurisdictions.)*
- *The priority ranking.* A thing we hold, cannot be wrong, only outdated. **Knowledge**, as doctrine — consulted as method, therefore live, which is exactly the Freeze's treatment of it.
- *A joint client with two signatories.* The party's identity and composition is a subject we assert about — **Atlas**; the relation is **Engagement**. The requirement that an act be evidenced by the counterparty holds however the counterparty is composed.
- *A second kitchen.* A subject we assert about — **Atlas**.
- *The corpus itself.* Governed by **this document**, which is why it exists and why the corpus is not an object of one of its own members.

**No truth was found that fails all three tests.** No jurisdiction is missing.

## VIII.2 · Duplicate authorities

**Within the corpus: none.** The two apparent duplications are resolved in III.2 as definition-versus-readiness and purpose-versus-authority.

**Within the repository: four**, named and grandfathered by the Freeze as retirement debt. They are implementation defects governed by settled law, not constitutional defects.

## VIII.3 · Circular dependencies

**One mutual reference exists and is deliberate.** Knowledge specifies instantiation as a transfer *to* Engagement; Engagement specifies instantiated doctrine as frozen *within* it. Both describe one boundary from two sides, in agreeing terms.

This is not circularity. **A boundary described from only one side is a boundary one party can move.** No further mutual reference exists: nothing references the Freeze, and Atlas references nothing.

The apparent circularity between Product asserting the workspaces and the Dependency Map deriving them is corroboration, not dependence — Product would stand if the Dependency Map were deleted.

## VIII.4 · Constitutional gaps

The Freeze's exclusions are **deliberate**, not gaps. Two edges are **located but unplaced**:

- **Undertakings above the Event File** — a client account holds standing terms. The three tests locate them (Engagement, over a subject Atlas identifies); what awaits is the account's placement as a product object. **Product refinement.**
- **Multi-location** — located by the tests (Atlas subjects); unaddressed by Product. **Product refinement.**

Neither prevents derivation of implementation for anything settled.

## VIII.5 · Hidden assumptions

Three were found and all survive examination.

**That time is linear and knowable** — each truth constitution carries an as-of law; the assumption is explicit, not hidden.
**That the institution is singular** — surfaced in VIII.4 and located.
**That a counterparty is one party** — surfaced in VIII.1 and located.

**No constitutional defect was found.**

---

# Article IX · Constitutional index

*The permanent first page of the corpus.*

| Document | Constitutional question | Owner | Scope | Depends on |
|---|---|---|---|---|
| **Framework** *(this)* | How do the constitutions relate, and how are they amended? | the corpus | membership, jurisdiction, interpretation, amendment | none |
| **Atlas** | What is true about our own subjects, and who may say so? | truth | work, evidence, states, ownership, experience, tenancy, as-of | none |
| **Engagement** | What has been undertaken with another party, and has it been discharged? | undertakings | offers, terms, options, acceptance, money owed, payment | Atlas (discipline); Knowledge (instantiation) |
| **Knowledge** | What do we hold as approved and reusable, and what happens when it is used? | artefacts | doctrine, Compositions, candidates, approval, promotion, instantiation | Engagement (transfer target) |
| **Product** | What is the product, and what belongs in it? | belonging | purpose, operators, workspaces, Event File, axes, principles | Atlas; Engagement; Knowledge |
| **Interaction** | How does an operator meet all of it? | expression | layout, navigation, hierarchy, colour, density, action, vocabulary | Product |
| **Dependency Map** | How does a promise become work? | propagation | promise components, cross-dependencies, service grain, dependency vs workflow | Atlas; Engagement; Knowledge; Product |
| **Operational Freeze** | What is settled, and on what terms may it be built? | readiness | seventeen frozen articles, exclusions, freeze contract, reopening, charter | all six |

**Reading order for a new reviewer:** this Framework, then Atlas, then Engagement and Knowledge in either order, then Product, then the Dependency Map, then Interaction, then the Freeze.

**Reading order to answer a question:** the Article III matrix, then the one document it names.

---

# Final verdict

## Is the constitutional architecture of EventCore complete?

**Yes.**

Seven documents. Three partition truth by tests that are mutually exclusive and jointly exhaustive; four govern belonging, expression, propagation and readiness — four different verbs that cannot contest one another. Every constitutional question in Article III appears exactly once. The corpus survived attack on five fronts: no missing jurisdiction, no duplicate authority within the corpus, no circular dependency, no undeliberate gap, and three assumptions that proved located rather than hidden.

## Does every constitutional question have exactly one governing authority?

**Yes.** Article III demonstrates it by enumeration; III.1 demonstrates it by construction. The four duplicate authorities that remain are in the **repository**, not the corpus — named, grandfathered, and scheduled for retirement under settled law.

## Can future engineering proceed by deriving implementation from these constitutions?

**Yes**, for everything the Operational Freeze declares settled — which is the entire operational spine, one article of which is already certified with twenty permanent claims.

For what the Freeze excludes, the position is now materially different from when it was written. **Money has a jurisdiction and canonical objects. Promotion authority is located. The Book was struck. The `event` naming is corrected.** Those exclusions are no longer gaps in the architecture; they are unbuilt capabilities whose governing law now exists.

---

**The constitutional phase of EventCore is complete.**

Future work should proceed through **implementation** — deriving behaviour from settled law; **refinement** — improving how settled capabilities are used, within the Interaction Constitution; **certification** — proving that implementation is faithful to what was ruled; and **operator validation** — the only remaining source of evidence the corpus cannot supply itself.

The corpus is complete not because nothing will change, but because **change now has a place to happen.** A new capability is located by three tests. A disagreement is resolved by citation. A defect is corrected by amendment, in the open, with evidence. That is what a constitution is for, and it is the only thing this corpus was ever meant to guarantee.

Continued constitutional expansion from this point would not discover architecture. It would only postpone the work.