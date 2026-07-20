# AMENDMENT-001 — Canonical Specification Numbering & the Lens Contract
**Status: Rev A, for adoption review. Review document only — no code, no
migrations, no registry changes. On approval, the proposed texts in §A.3 and
§B.1 are applied verbatim to their target documents and this amendment is
recorded in each target's header line per its own convention.**

**Rev A — adversarial review corrections, all eight sustained findings
applied.** (1) The numbering rule now distinguishes *reservation* from
*binding*, so this amendment is the final permissible correction rather than
the rule's first violation; "retitled" replaced with "reservation corrected
before binding" throughout. (2) The Lens ontology moves to
`KNOWLEDGE_ARCHITECTURE.md` §10 — KA defines what a Lens is; UI_GRAMMAR §2a
governs how it behaves; SPEC-003 will say which lenses exist. (3) Clause 3
rewritten: the prohibition is against *independent truth*, not persistence —
disposable projections and provenance-bearing snapshots are legitimate;
"derived state cannot lie" corrected to what is actually true (cannot
drift; can still be wrong). (4) Clause 10 narrowed to external retrieval;
deterministic surfacing of subject-intrinsic state is explicitly not
prohibited. (5) Clause 4 rewritten around domain-authoritative writing
paths, eliminating the "existing authorized services" loophole and the
implication that today's two paths are the only ones EventCore may ever
have. (6) Clause 6 splits lens *availability* (three-term intersection)
from *rendering honesty* (object state) — an empty warehouse no longer
hides the lens whose job is to report the emptiness. (7) Track 0 restricted
to sockets whose controlling specification explicitly authorizes
registration-only additions — building a registry no longer creates Track 0
by itself. (8) "One kind of reader" replaced with the graph turned for one
kind of work; lens composition defined narrowly so ordinary rich lenses
cannot be accused of it. Minor: registry table reduced to identifiers and
subjects with shipment status demoted to an informational snapshot; the
new-material arithmetic corrected; implementation symbols demoted to
evidence citations.

*EventCore · RFC amendment package · July 2026 · follows the RFC convention
(`VISION.md`, "How these documents are used"): every clause below cites the
section it amends or the doctrine it makes explicit. Implementation symbols
cited anywhere in this amendment (`LensContribution`, registry function
names, table names) are evidence that sockets and precedents exist — never
constitutional dependencies. Every rule here remains binding verbatim if a
symbol is renamed.*

---

## 0. Scope and non-goals

Two subjects, deliberately narrow:

**A.** Resolve the specification-numbering collision between
`KNOWLEDGE_ARCHITECTURE.md` §11 and `ROADMAP-knowledge-model.md`, and record
the rule that prevents its recurrence.

**B.** Give the Lens a constitutional existence: a minimal ontology in
`KNOWLEDGE_ARCHITECTURE.md` §10 and a behavioral contract expanding one
existing sentence — *"Lenses (Design, Customer, Production, …) change
presentation, never truth"* — in `UI_GRAMMAR.md`.

Non-goals, named so nobody helpfully adds them during review: this amendment
does **not** draft SPEC-003, does not design any operational lens, does not
specify the cross-event Operations Workspace, does not authorize
recommendations or proactive retrieval of any kind, does not authorize
tenant-defined lenses, and does not design lens composition. Where those
subjects appear below, they appear as *reservations* — problems named and
parked, not answered.

---

# PART A — Canonical specification numbering

## A.1 The collision, stated precisely

`KNOWLEDGE_ARCHITECTURE.md` §11 (frozen February 2026) lists:

> **SPEC-003 — Production Lens** · **SPEC-005 — Additional operational
> layers** — warehouse, photography, staffing, transportation; each a
> registration, per SPEC-001 §1.6.

`ROADMAP-knowledge-model.md` (later, post-Gap-Analysis) assigns:

> **SPEC-005 — Media Graph** · **SPEC-005a — Prose homes** · SPEC-006
> Item Knowledge · SPEC-007 Computable Derivations · SPEC-008 Inventory &
> Rental Mapping · SPEC-009 Structured Outcomes · SPEC-010 Cross-Definition
> Relationships — and demotes layer registrations to **Track 0**: "not a
> spec; a standing work stream."

Both documents are in active use. Every future citation of "SPEC-005" is
ambiguous until one yields.

## A.2 Resolution: the Roadmap numbering prevails

Three arguments, in descending weight:

1. **The Roadmap numbering is already load-bearing in accepted documents.**
   `READINESS-004` (accepted) reasons about "SPEC-005, media promotion" in
   finding F-1; `IMPLEMENTATION-004` builds `act_produced_artifacts` so
   "SPEC-005 adds a kind value instead of a table"; the F-3 convention
   reserves `media:*` citation prefixes for SPEC-005/006. Reassigning the
   number would falsify the citations of documents that have already
   governed shipped work. History is never overwritten — including the
   history of what a number meant when an accepted document used it.
2. **KA §11's own convention already decides this.** The §11 entry carries
   the note: *"unwritten specs are referenced by concept; a number binds
   only when the spec is drafted — numbered predictions rot like versioned
   ones."* Neither "SPEC-003 — Production Lens" nor "SPEC-005 — Additional
   operational layers" was ever drafted. They were reservations with
   provisional subjects, and the convention says they do not bind. The
   Roadmap's assignments are the deliberate, post-analysis act; §11's were
   placeholders the convention itself declines to defend.
3. **"Additional operational layers" was never spec-shaped.** SPEC-001 §1.3
   made layer addition a zero-DDL registration by design ("Adding
   Photography = one registration file. If adding a layer touches any file
   outside its registration, this architecture has failed"). The Roadmap's
   Track 0 is not a renumbering of that entry — it is the recognition that
   the entry described work the architecture had already made too small to
   deserve a spec. Superseding it is a correction of category, not merely
   of number.

## A.3 Proposed amendment text — `KNOWLEDGE_ARCHITECTURE.md` §11

The following edits are applied to §11. Section numbers elsewhere in the
document are untouched (section numbers are citation targets; amendments
edit within sections, never renumber them).

**A.3.1 — Replace the SPEC-003 entry with:**

> - **SPEC-003 — Operational Lenses** — reserved; binds when drafted and
>   accepted. Reservation corrected from "Production Lens" before binding
>   (AMENDMENT-001): no specification by that name was ever drafted, and
>   the production/kitchen lens is the first *instance* of the general
>   concept this specification will define. Existing references to "the
>   Production lens (SPEC-003)" in shipped documents (SPEC-001, SPEC-002)
>   remain accurate as written — the kitchen lens is inside the corrected
>   reservation's scope — and are not retroactively edited.

**A.3.2 — Replace the SPEC-005 entry with:**

> - **SPEC-005 — Media Graph** · **SPEC-005a — Prose homes** — reserved,
>   per `ROADMAP-knowledge-model.md`. Reservation corrected before binding
>   (AMENDMENT-001): the former provisional subject at this number,
>   "Additional operational layers," described Track 0 work, not a
>   specification (its prior wording is preserved in the amendment record).
>   The former "Layer slices" entry in this section is henceforth read as
>   Track 0 work as well; its content — each layer ships with its Library
>   projection, each lights its badge — stands as the description of what
>   a registration delivers.

**A.3.3 — Append two paragraphs to §11:**

> **The numbering registry.** Specification numbers are canonical
> identifiers and this section is their registry of record. An entry here
> may **reserve** a number and a provisional subject; the number **binds**
> only when its specification is drafted and accepted. Before binding, a
> reservation may be corrected by constitutional amendment, with its prior
> wording preserved in the amendment record. After binding, neither the
> number nor its subject is reused, renumbered, or reassigned; a superseded
> bound specification retains its identifier permanently. Sequencing and
> priority of reserved specifications are *guidance*, owned by roadmap
> documents and legitimately reorderable by business triggers; the
> identifiers themselves are constitutional. Concepts referenced but
> unnumbered take their numbers at drafting, per the standing convention
> above.
>
> **Track 0 — registrations are not specifications.** Track 0 consists
> **only** of additions through a declarative socket whose controlling
> specification explicitly authorizes new entries without further model or
> constitutional decisions. Today's authorized sockets: layer registrations
> (SPEC-001 §1.3), layer-scoped move kinds (SPEC-002 §1.2), and promotion
> kinds (SPEC-004 via READINESS F-4). Track 0 work is continuous,
> concurrent with any specification, and content-driven — a registration
> lands when someone has real content for it, never speculatively (an
> empty home invites junk). Track 0 is defined by a specification's
> explicit authorization, never by implementation pattern: building a new
> registry does not create Track 0 work, and if proposed "registration"
> work requires new storage, a new model, or a constitutional decision, it
> was never Track 0 — it is a specification, and it takes a number.

## A.4 The canonical sequence for future citations

**A.4.1 — The registry (constitutional: identifiers and subjects only).**

| Identifier | Subject |
|---|---|
| SPEC-001 | Component Knowledge Foundation — bound |
| SPEC-002 | Component Instantiation & Configuration — bound |
| SPEC-003 | Operational Lenses — reserved |
| SPEC-004 | Promotion & Organizational Learning — bound |
| SPEC-005 / 005a | Media Graph / Prose homes — reserved |
| SPEC-006 | Item Knowledge — reserved |
| SPEC-007 | Computable Derivations — reserved |
| SPEC-008 | Inventory & Rental Mapping — reserved |
| SPEC-009 | Structured Outcomes — reserved |
| SPEC-010 | Cross-Definition Relationships — reserved |
| Track 0 | Registrations through explicitly authorized sockets — not specifications |
| *(unnumbered)* | Operations Workspace (EventCore OS) — referenced by concept |

**A.4.2 — Informational snapshot (July 2026; amendment record only — this
table does not enter constitutional text and is expected to rot).**
SPEC-001 shipped v200 (Rev D). SPEC-002 shipped v201–v203; Rev D/E
hardening v205–v206. SPEC-004 Rev B: v207–v209 shipped; v210 back-reference
pending. Roadmap guidance, not canon: `warehouse` is the first Track 0
registration when content exists; SPEC-008 jumps the queue if Partini
signs.

## A.5 SPEC-003 identified, not drafted

SPEC-003 — Operational Lenses — will define the registered lens set for a
single event's operational work (kitchen, warehouse, staffing, photography,
finance), citing KA §10's Lens definition and UI_GRAMMAR §2a's contract
(Part B), and making concrete the registration socket SPEC-001 §5 already
reserved. It is identified here so the reservation's subject is
unambiguous; not one clause of it is drafted in this amendment. The
cross-event Operations Workspace is explicitly *not* SPEC-003's subject
(see B.5).

---

# PART B — The constitutional Lens contract

## B.0 What this part does, and where each piece lives

`UI_GRAMMAR.md` §2 contains the entire current doctrine of lenses in one
sentence, now asked to bear the weight of every operational surface the
product moves toward. This part gives the Lens a constitutional existence
in two homes with a clean division of labor:

- **`KNOWLEDGE_ARCHITECTURE.md` §10** — *what a Lens is*: its relation to
  the object graph, ownership, and the capability model (B.1.1);
- **`UI_GRAMMAR.md` §2a** — *how a Lens behaves under use* (B.1.2–B.1.4);
- **SPEC-003** (future) — *which operational lenses exist* and what each
  projects.

The honest framing, established in review: almost nothing below is new. The
constitution already holds that objects exist independently of features,
that documents are projections, that every layer is equally real, and that
features discover objects rather than own them. This contract does not
introduce a worldview; it makes an existing one precise enough to cite.

## B.1 Proposed amendment texts

**B.1.1 — `KNOWLEDGE_ARCHITECTURE.md` §10, appended paragraph** (and the
amendment recorded in the document's header line):

> **Lenses.** A Lens is a registered projection over canonical objects,
> serving one declared operational concern — the graph, turned for one
> kind of work. A Lens is available through the intersection of its
> registration, the organization's capabilities, and the person's
> permissions; within an available Lens, what renders is determined by the
> objects' actual state. A Lens owns no objects, no storage, and no truth.
> Its behavioral contract is `UI_GRAMMAR.md` §2a.

**B.1.2 — `UI_GRAMMAR.md` header line.** Append:

> *amended July 2026: §2a (the Lens contract) added; §2's lens sentence
> expanded, not replaced — per AMENDMENT-001, jointly with
> KNOWLEDGE_ARCHITECTURE §10 (Lenses).*

**B.1.3 — `UI_GRAMMAR.md` §2, final bullet.** The existing sentence stands
and gains a pointer:

> - **Lenses** (Design, Customer, Production, …) change presentation, never
>   truth. The grammar below is identical in every lens that permits
>   editing. *What a Lens is: `KNOWLEDGE_ARCHITECTURE.md` §10. How every
>   Lens behaves: §2a.*

**B.1.4 — New section, inserted after §2 as §2a** (interleaved, not
renumbered: section numbers are citation targets — KA §10 and SPEC-001 §6
cite "UI_GRAMMAR §3" and must remain true).

---

> ## 2a. The Lens contract
>
> *Every Lens defined by `KNOWLEDGE_ARCHITECTURE.md` §10 obeys this
> contract. Expands §2's lens sentence; grounded in VISION ("The design is
> an object graph"; "Every layer is equally real"; "Features discover
> objects; they do not own them") and ENGINEERING_PRINCIPLES (derived
> state; no duplicated truth; grammar grows by declaration). This section
> defines how any lens behaves; it designs none.*
>
> **A Lens turns the graph for one kind of work.** Design, Customer,
> Kitchen, Warehouse, Staffing, Photography, Finance — each presents the
> same objects for a different job, often to the same person at different
> moments of the same day. A lens owns its presentation entirely; it owns
> no objects, no storage, and no truth. Kitchen, Warehouse, and Finance
> looking at one event are not looking at three records kept in agreement
> — they are looking at the same record, turned. There is nothing to keep
> in sync, because there is only one thing.
>
> 1. **Projection, never truth.** A lens changes selection, emphasis,
>    organization, computation, and presentation. It never changes what is
>    true, and it never holds a private variant of it. A lens that
>    persists its own version of canonical state — a kitchen quantity that
>    can disagree with the design's quantity — is a duplicated source of
>    truth and is refused at review, whatever it is called.
>
> 2. **Withhold, never falsify.** A lens shows only what its work needs
>    (§1); withholding the rest is its job, not a defect — the Customer
>    lens hiding cost *is* the field rule. But a lens may never contradict
>    canonical state, render an edited value as original, present derived
>    content as recorded fact, or redefine a term privately. The line:
>    omission serves the reader; misstatement deceives them.
>
> 3. **Computation is free; independent truth is not.** A lens may
>    deterministically derive — totals, rollups, schedules, per-cover
>    breakdowns, timelines — from the canonical objects its registration
>    declares and the person's current subject selects. A derived value
>    never becomes an independent source of truth: it is recomputed from
>    canonical inputs, or, where performance, audit, or historical
>    stillness requires persistence, stored only as a disposable
>    projection or a provenance-bearing snapshot whose derivation and
>    authority are explicit — the frozen baseline is the precedent: a
>    snapshot with named provenance, never a pointer to anything mutable.
>    Properly derived state cannot drift from its inputs; it can still be
>    wrong, which is why derivations show their work (§5). Wherever a lens
>    states a claim about knowledge, the constrained vocabulary
>    (`KNOWLEDGE_ARCHITECTURE.md` §9) applies unchanged.
>
> 4. **Lenses read; domain actions write through their authoritative
>    paths.** A lens owns no persistence command and gains no privileged
>    route to storage. A user action initiated from any lens invokes the
>    canonical command or writing path designated by the specification
>    that owns the affected domain — today, the move grammar with its one
>    applier and the one revision-authoring path; future domains supply
>    their own authoritative paths by the same rule. A lens may expose an
>    authorized verb; it may not define a parallel implementation of that
>    verb, call storage directly, or grow a lens-specific service that
>    bypasses the owning domain's invariants — any of these is
>    review-blocking. Which verbs an editing lens speaks is declared by
>    its registration; the grammar of §6–§11 governs them identically in
>    every lens that permits editing (§2, unchanged).
>
> 5. **Read-only is visible.** §6's rule, extended to every lens: a lens
>    over an executed event, an unpermissioned object, or a locked version
>    says so on its face. Evidence rendered in an operational lens is
>    readable and visibly non-writable — a silently read-only surface is
>    indistinguishable from a broken one.
>
> 6. **Availability is an intersection; rendering is honest.** A lens is
>    available exactly when it is registered, the organization's
>    capabilities allow it (absent, not disabled — §3), and the person's
>    permissions admit them; no term reasons about the others, and
>    enforcement is layered as ever — the UI renders the intersection, the
>    API enforces capability and permission again, because a hidden lens
>    is not a security boundary. Within an available lens, the objects'
>    *actual state* determines what renders: missing content is an
>    explicit, honest empty state — never simulated
>    (`KNOWLEDGE_ARCHITECTURE.md` §4, `layer_badges` truthfulness) — and
>    absence never hides the lens whose job may be precisely to report the
>    absence.
>
> 7. **Lenses grow by registration, never by exception.** A lens declares
>    itself — what it projects, which capability gates it, which verbs (if
>    any) it speaks — in the same declarative idiom the platform's other
>    registrations use. Adding a lens must not require editing other
>    lenses, central switch statements, or the surfaces that host lenses.
>    If it does, the abstraction has failed and the failure is fixed
>    first.
>
> 8. **Anatomy is per-lens.** Stage · Inspector · Outline (§2) is the
>    anatomy of an *editing* lens — the authoring workspace — not a
>    mandate for every lens. A kitchen sheet, a warehouse schedule, and a
>    finance view organize themselves for their work. What is prescribed
>    for all lenses is this contract; what is prescribed for editing
>    lenses is additionally the grammar.
>
> 9. **One graph; no departmental stores.** Kitchen does not own recipes;
>    Warehouse does not own inventory; Photography does not own photos;
>    Finance does not own invoices (VISION: features discover objects,
>    they do not own them). A lens is how a department *sees*; it is never
>    where a department's data *lives*. Historical lenses obey
>    identically: a lens over evidence is a projection of the evidence,
>    not an archive beside it.
>
> 10. **A lens presents the current subject; it does not propose additions
>     to it.** Nothing in this section authorizes a lens to retrieve
>     external examples, identify analogues, recommend content, or propose
>     work that is not already part of the person's selected subject or
>     the lens's declared projection. This does **not** prohibit
>     deterministic surfacing of recorded state intrinsic to that subject:
>     unmet requirements, conflicts, deadlines, validation results,
>     suppressed-but-considered items, and obligations are the subject,
>     and rendering them is a lens doing its job. Proactive retrieval from
>     other events or evidence — if it ever exists — is a separate concern
>     requiring its own deliberate act, bound by
>     `KNOWLEDGE_ARCHITECTURE.md` §9 and §11's standing deferrals, which
>     this section leaves exactly where they are.
>
> **Reserved — named, not answered.** Two questions are explicitly
> reserved and nothing in this section decides them:
>
> - **Tenant-defined lenses.** Whether organizations may define their own
>   lenses is a product and business-model decision of the same category
>   as the cross-tenant library (SPEC-004 non-goal) — reserved for its own
>   deliberate act. Registration is the *mechanism* (clause 7); who may
>   register remains undecided.
> - **Lens composition.** Defined narrowly, so the reservation cannot be
>   stretched: composition means coordinating two or more *independently
>   registered lens projections, as projections* — an evening's kitchen,
>   trucks, and floor read against the moments they serve — and **not**
>   merely reading several canonical object or layer types inside one
>   lens. A kitchen lens showing components, recipes, staffing, timing,
>   and equipment is projection, not composition. The constraint any
>   future answer must satisfy: legitimate composition derives from the
>   registered projections and creates no second truth, no private
>   reconciliation, and no bypass of the registrations it composes —
>   anything else is a departmental store wearing a timeline's clothes.
>   Whether composition is a lens capability, a distinct kind, or a
>   feature of specific surfaces is undecided, and no composed lens ships
>   before it is.

---

## B.2 Rationale, clause by clause

- **The KA §10 paragraph (B.1.1)** exists because the Lens's definition is
  an architectural statement — graph, ownership, capabilities — not
  interaction grammar, and because SPEC-003 must be able to establish the
  architectural existence of its object by citing the architecture
  document. It is deliberately four sentences: definition, availability,
  ownership, and the pointer to behavior. Everything behavioral stays in
  UI_GRAMMAR, preserving the division the constitution already uses
  (KA says what things are; UI_GRAMMAR says how they behave under the
  hand).
- **The opening sentence of §2a** binds the two homes ("Every Lens defined
  by KA §10 obeys this contract") so neither document can drift into
  owning the other's half.
- **"One kind of work," not "one kind of reader"** — the same person
  designs the proposal, checks kitchen production, and dispatches trucks
  in one afternoon. The distinguishing axis is the declared operational
  concern, not reader identity; the wording prevents lens registration
  from quietly becoming role registration.
- **Clause 1** closes the specific failure mode operational surfaces
  invite: a department's screen quietly becoming a department's database.
  It is "no duplicated sources of truth" applied at the presentation tier,
  where the temptation will actually occur.
- **Clause 2** draws the withhold/falsify line because §1's "show only
  what the person needs" could otherwise be read as license to
  misrepresent. The field rule (§2) is the precedent: hiding cost from a
  screen-share is service; showing a wrong cost would be deceit.
- **Clause 3** prohibits *independent truth*, not persistence. Disposable
  caches, materialized projections, and provenance-bearing snapshots are
  legitimate and already precedented (the Rev E frozen baseline is exactly
  a persisted derivation with named provenance and explicit authority);
  what is forbidden is a persisted derivation that can disagree with its
  inputs while claiming canonical standing. The scope — "objects its
  registration declares and the person's current subject selects" — is
  the anti-bootstrap boundary: a surface cannot fetch nine past events
  and then declare them "in view." And the clause states only what is
  true of derivation: it cannot drift; it can still be wrong (bugs, stale
  inputs, bad formulas), which is why showing the work is part of the
  same clause.
- **Clause 4** is written around *domain authority*, not an enumeration of
  services. "The specification that owns the affected domain" is the
  stable constitutional category; today's two paths are named as examples,
  not as a closed set, so future domains (finance, scheduling, inventory)
  add their own authoritative paths without amending this clause — and
  "existing authorized services" is gone, because it was an informally
  expandable category a lens could hide behind.
- **Clause 5** extends an existing rule (§6) rather than inventing one;
  evidence-in-operational-lenses is called out because the promotion work
  already proved it matters ("reading evidence is the entire point of
  keeping it; writing to it remains forbidden").
- **Clause 6** separates two questions the draft conflated: whether a lens
  is *available* (three terms: registration, capability, permission) and
  what an available lens *renders* (the objects' actual state, honestly).
  The separation matters operationally: a warehouse lens over an event
  with no warehouse content must be able to open and say so — hiding the
  workspace that reports missing content would make absence
  self-concealing. Whether any specific lens chooses a different
  availability behavior is SPEC-003's decision; this clause no longer
  pre-decides it.
- **Clause 7** prevents the lens system from becoming the one
  registry-idiom subsystem that grows by special case. (SPEC-001 §5's
  reserved `LensContribution` socket is the implementation evidence that
  this was anticipated — cited as evidence, per the standing note, not as
  a dependency.)
- **Clause 8** corrects an implicit over-read of §2 — that the authoring
  trio is the shape of all workspaces — before five non-authoring lenses
  are designed against it.
- **Clause 9** is VISION verbatim, placed where operational-surface review
  will actually look for it.
- **Clause 10** fences exactly the dangerous thing — retrieval from
  outside the subject — while explicitly protecting truthful operational
  awareness *of* the subject. A validation error, a conflict, an unmet
  requirement, and a deadline are the subject; the Stein card is not. The
  clause exists purely as a guard (B.6): without it, clause 3's
  computation freedom is what a future recommendation feature would cite.
- **The reservations** are drafted as reservations — each names its
  problem precisely enough that the future act can cite this section, and
  neither contains a decision. The composition definition is deliberately
  narrow so that SPEC-003's ordinary rich lenses cannot be accused of
  composition, and only genuinely composed surfaces (the score view) are
  parked.

## B.3 Doctrine-to-clause citation table

| Clause | Grounding | Status |
|---|---|---|
| KA §10 "Lenses" paragraph | VISION (object graph; features discover objects); KA §10 (intersection); UI_GRAMMAR §2 | **New constitutional object** — a definition, not a grant; assembled from existing commitments |
| §2a definition ("turns the graph for one kind of work") | VISION; UI_GRAMMAR §2 | **Made explicit** |
| 1 — Projection, never truth | UI_GRAMMAR §2 (verbatim core); VISION "One source of truth"; EP "No duplicated sources of truth" | **Restated** (the private-variant prohibition made explicit) |
| 2 — Withhold, never falsify | UI_GRAMMAR §1, §2 (field rule), §5 (UI reflects truth) | **Made explicit** — the omission/misstatement line is newly drawn |
| 3 — Computation free; independent truth not | EP "State is derived"; EP "Render decisions never persisted"; SPEC-002 Rev E (frozen baseline as snapshot precedent); KA §9; UI_GRAMMAR §5 | **Made explicit** — the independent-truth boundary and the registration+subject scope are newly written |
| 4 — Domain actions write through authoritative paths | SPEC-002 §1.1 (one applier); SPEC-004 INV-1; UI_GRAMMAR §10 invariants | **Restated at a new tier**, generalized to future domains |
| 5 — Read-only visible | UI_GRAMMAR §6; SPEC-004 §5 step 2 / operating principle 2 | **Restated** (extended to all lenses) |
| 6 — Availability vs rendering | KA §10 (intersection; layered enforcement); UI_GRAMMAR §3; KA §4 (`layer_badges`) | **Made explicit** — the availability/rendering separation is newly drawn |
| 7 — Growth by registration | EP "Grammar grows by declaration"; SPEC-001 §1.3, §5; KA §4 (zero-diff discipline) | **Restated** |
| 8 — Anatomy is per-lens | UI_GRAMMAR §2 (corrective clarification) | **New** — a clarification no existing text states |
| 9 — One graph, no departmental stores | VISION "Features discover objects" (near-verbatim) | **Restated** |
| 10 — Presents the subject, proposes nothing | KA §9 (Everything is explainable); KA §11 (deferred deliberately); UI_GRAMMAR §1 (never surprises) | **New guard, conservative in effect** — grants nothing; re-fences existing deferrals; explicitly protects subject-intrinsic surfacing |
| Reservation — tenant lenses | Category precedent: SPEC-004 §11 (cross-tenant = product decision) | **New reservation** |
| Reservation — composition | VISION "there is only one thing"; EP "No duplicated truth" | **New reservation** — narrowly defined problem statement only |

Summary: of the fourteen positions above, eight restate or make explicit
what shipped doctrine already holds. The newly written material comprises
five elements — the KA §10 definition, the anatomy clarification, the
presents-not-proposes guard, and the two reservations — and none of the
five grants a capability: one defines, one clarifies, one fences, and two
decide nothing.

## B.4 Reserved questions and non-decisions

Consolidated, so the record of what this amendment did *not* decide is as
citable as what it did:

1. **Tenant-defined lenses** — reserved (§2a reservation 1).
2. **Lens composition** — reserved with a narrow definition and problem
   statement (§2a reservation 2). The "evening as a score" surface in the
   design prototype is the motivating case and does not ship before this
   is decided.
3. **Proactive retrieval / suggestion surfaces** — not a lens question at
   all, per clause 10; remains exactly where KA §9/§11 left it, undrafted.
4. **Per-lens availability behavior** (whether any specific lens opens on
   empty state, opens with an onboarding empty state, or is contextually
   surfaced) — SPEC-003's to decide, per clause 6's deliberate silence.
5. **SPEC-003's internal scope** (which lenses ship first, whether finance
   is a v1 lens, the concrete registration interface) — SPEC-003's to
   decide.
6. **The Operations Workspace's constitutional basis** — see B.5; its spec
   must supply doctrine for the cross-event subject; this amendment
   deliberately does not.
7. **The design prototype's "Production Specification"** — a document the
   prototype cites that is not in the canon. Unresolved: recover it from
   prior work or declare it superseded by SPEC-003 when drafted. Flagged;
   not decided here.

## B.5 Consequences for SPEC-003 and the Operations Workspace

**SPEC-003 — Operational Lenses.** Can now open with clean citations: KA
§10 for what a lens *is*; §2a for how it behaves; SPEC-002 §1.3 for what an
operational lens reads (`component_requirements` filtered by layer;
instance layers; the configured instance, never the definition); SPEC-001
§5's reserved socket as implementation evidence. Its subject is **one
event, many operational truths**. Two scoping consequences of this
amendment, to be handled knowingly: (a) the score/timeline surface is
composition under the reservation's narrow definition, so SPEC-003 either
excludes it or first resolves the reservation by its own RFC act — while
its ordinary rich lenses are unambiguously projection and need no such
defense; (b) per-lens availability behavior on empty state is SPEC-003's
decision, unconstrained by clause 6 beyond honesty. Existing SPEC-002
language ("the Production lens (SPEC-003)") requires no retroactive edit —
the kitchen lens is squarely inside the corrected reservation's scope.

**The Operations Workspace (EventCore OS).** Its subject is **many events,
one operating house** — a different subject, therefore a different
specification (the same one-act-one-subject reasoning as SPEC-004 §6a).
This amendment's lens contract governs any per-department pane it contains,
and clause 9 already guarantees its cheapest property: "Today's Kitchen" is
a query over the instance layers and requirements of active events —
queries, not engines, per KA §11's own precedent — because departments own
nothing to aggregate *from* except the graph itself. What the workspace
spec must supply that nothing yet provides: the constitutional standing of
a cross-event subject (what is "the house"? what is "today"?), its reader
model, and whatever prioritization it renders (which must survive KA §9 —
computed facts, no invented urgency scores). It remains unnumbered until
drafted, per A.3.3.

## B.6 The guard check

Each clause tested against the five things this amendment must not
accidentally authorize or enable:

- **Recommendations / inference.** Clause 3's grant is scoped to the
  registration's declared objects and the person's selected subject — the
  anti-bootstrap boundary means a surface cannot fetch external evidence
  and then claim it was "in view." Clause 10 then closes the door in
  terms: retrieval of external examples, analogues, and proposals is
  outside every grant, while subject-intrinsic surfacing is explicitly
  inside — so the clause can no longer be attacked as prohibiting a
  validation error, which was the Rev A correction. A recommendation
  surface citing this amendment has nothing to cite. ✓
- **Direct lens writes.** Clause 4 forbids them in terms ("no persistence
  command"; "review-blocking") and the informally expandable category
  ("existing authorized services") is gone — the stable category is the
  domain-owning specification's designated path. No clause elsewhere
  softens it. ✓
- **Tenant-defined lenses.** Clause 7's mechanism could be misread as an
  open door; the reservation forecloses the misreading in the same section
  and now states the distinction explicitly: registration is the
  mechanism; who may register is undecided. ✓
- **Lens composition.** No clause grants it; the reservation defines it
  narrowly (coordinating registered projections *as projections*), states
  the constraint any future answer must satisfy, and bars shipping a
  composed lens before the decision — while the narrow definition
  protects SPEC-003's ordinary lenses from the accusation. ✓
- **Track 0 self-expansion** *(new in Rev A)*. Track 0 is defined by a
  controlling specification's explicit authorization, never by the use of
  a registry idiom — "we made it declarative" no longer avoids writing a
  specification. The three authorized sockets are enumerated; extending
  the list requires a spec that says so. ✓

---

## Adoption checklist (on approval, in order)

1. Apply A.3.1–A.3.3 to `KNOWLEDGE_ARCHITECTURE.md` §11; apply B.1.1 to
   §10; record both in its header line with reason.
2. Apply B.1.2–B.1.4 to `UI_GRAMMAR.md`; record in its header line.
3. This document is retained in `docs/` as the amendment record — including
   A.4.2's informational snapshot and the superseded reservations' prior
   wording (quoted in A.1), per the registry rule's preservation
   requirement.
4. No code, registry, migration, or test changes result from adoption —
   the amendment's entire effect is textual, which is the proof it stayed
   narrow.

*Constitutional anchors: VISION (object graph; every layer equally real;
features discover objects; one source of truth; RFC convention),
KNOWLEDGE_ARCHITECTURE §4, §9, §10, §11, UI_GRAMMAR §1–§3, §5, §6, §13,
ENGINEERING_PRINCIPLES (derived state; no duplicated truth; grammar by
declaration), SPEC-001 §1.3, §5, SPEC-002 §1.1, §1.3, Rev E, SPEC-004
INV-1, §6a, READINESS-004 F-1, F-3, F-4.*
