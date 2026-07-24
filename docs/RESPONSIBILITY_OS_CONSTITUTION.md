# EventCore — Responsibility Operating System · Constitution (v285)
## Rev B — ACCEPTED · FROZEN (July 24, 2026)

*Rev A accepted by the owner; R-13 added on acceptance. This revision is
frozen: changes by RFC amendment only, per the VISION.md convention.*

**Standing.** Constitutional document under frozen Constitution v1.0 and all
shipped law through v284. **ACCEPTED and FROZEN.** This revision applies
Required Amendments 1–2, records the four rulings (table, ownership,
vocabulary, knowledge) as law, and adds **R-13 · content independence** on
acceptance. **Rulings only** — no production SQL, no
application code, no UI. Implementation begins at v286+ only after this
revision is accepted. Repository-grounded: every claim about existing structures below was
verified in the v284-certified tree during drafting, not recalled.

**Supersession note, for the record.** The v284 handoff planned "v285 =
profile/integration hardening." The owner's v285 directive redirects the slice
to this constitution. Hardening moves to the deferred list; nothing else in the
prior plan is reopened.

**The one-sentence answer, unpacked throughout:** *facts are recorded,
responsibilities are derived, tasks are projected, workspaces are lenses, and
nothing an AI writes is ever the authoritative record.*

---

## 1 · Repository inspection findings

What already exists, and therefore what this constitution must govern rather
than reinvent:

**The precursor object exists and is half-right already.** v275's `obligation`
table carries tenant scoping, an event anchor (`event_ref`, I-39), provenance
(`origin_ref` + `origin_kind ∈ selection/release/manual_authorized`, I-33), a
department, a deterministic `natural_key` with idempotent regeneration (I-36) —
and, decisively, **no status column**: its comment reads *"Obligation state
(incl. invalidation) is projected from execution_evidence + dependencies
(I-34, I-35)."* That is this constitution's central doctrine, already shipped
for the event-anchored case.

**The evidence ledger exists.** `execution_evidence` is append-only
(insert+select RLS, I-40), with event-level authority facts
(`released/clearance/sign_off`), progress facts
(`assignment/scan/inspection/completion/exception`), and four distinct
correction outcomes citing `prior_ref` (I-35).

**Derived work exists in five ungoverned places.** The Work Architecture
Constitutional Review verified them in code: the legacy priority engine
(workflow.ts), v276 `next_action`, v277 `event_workspace.next_actions` +
`blockers`, v278 staffing blockers, and the Booking Addendum D-2 composed
next-action. Five independent inventions of the same concept, none under law.

**The authority gate exists.** v279's action registry + dispatch is the shipped
mechanism for "a human performs an authoritative act": stable action keys,
`action_authorized()`, lawful refusals rendered honestly.

**Knowledge exists as a governed truth source.** KNOWLEDGE_ARCHITECTURE v1.0
(frozen; RFC amendment only) distinguishes live work, evidence, and curated
knowledge, all with provenance.

**There is no `task` table anywhere in the schema.** Good. This constitution
makes that permanent.

---

## 2 · Definitions

**Truth** is the union of exactly three record families, all append-only:

- **T1 — Event truth.** The execution spine: `event`, its selections/releases,
  and every `execution_evidence` fact. What happened, who attested it, when.
- **T2 — Knowledge truth.** Curated knowledge under KNOWLEDGE_ARCHITECTURE:
  component definitions, operational profiles (v283/v284), venue knowledge
  (v280/v281), standing organizational rules once promoted. **Knowledge truth
  evolves only through immutable revisions and promotion ceremonies; an
  accepted revision is never rewritten in place.** Change means a new revision
  superseding the old with lineage intact (the `component_profile_revision`
  append-only/supersedes discipline is the shipped template).
- **T3 — Attestation truth.** A human's explicit, authorized declaration,
  recorded as an evidence fact. This is how "manual" enters the system lawfully:
  a manually declared responsibility is not hand-authored — it is *derived from
  the attestation that declared it*, and the attestation is the truth record.
  (v275 already models this as `origin_kind = 'manual_authorized'`.)

The **clock is a derivation parameter, not truth.** Time never creates a fact;
it changes which responsibilities a given body of truth currently implies
(v282's staleness doctrine already treats time this way).

A **Responsibility** is a derived, provenance-bearing statement that *some
named outcome is owed, within a department of record, because specific truth
implies it.* Accountability attaches by assignment: an unassigned Derived
responsibility is lawful and is projected as visible debt (O-3); once
ownership attaches, exactly one accountable owner is current at any instant
(O-1). The v275 `obligation` is hereby recognized
as the first species of Responsibility (event-anchored, execution-window). This
constitution generalizes the species without reopening it.

A **Task** is a projection of a responsibility into someone's working surface —
a checklist line, a next-action chip, a pull-sheet row. Tasks have no
independent existence, no authoritative state, and no storage as primary
records.

A **Projection** is any computed view over responsibilities: a task list, a
department workspace, a day sheet, a cross-event pull sheet, an AI summary.
Projections may be cached; caches are never authoritative and must be
labeled as such.

---

## 3 · Core principles, as rulings

**P-1 · Events are truth.** The spine's append-only ledgers are the record of
what happened. Nothing derived may contradict them; anything that appears to is
a defect in derivation, never grounds to edit the ledger.

**P-2 · Knowledge is truth.** Curated knowledge is authoritative for what the
organization *knows how to do*. It changes only by immutable revision and
promotion ceremony — never by in-place rewrite of an accepted revision. The v283/v284 chain (reference in library,
revision-pin in draft, embed at sealing) is the template for how knowledge
truth reaches an engagement without later edits rewriting it.

**P-3 · Responsibilities are derived from truth.** Every responsibility cites
its truth anchors — the event facts, knowledge revisions, and/or attestations
that imply it. A responsibility with no anchor cannot exist
(`RESP_NO_TRUTH_ANCHOR`). Derivation is deterministic and idempotent: the same
truth always yields the same responsibilities (the I-36 natural-key discipline,
generalized).

**P-4 · Tasks are projections of responsibilities, not primary records.**
There is no task table, ever. Checking a box is not completing a task; it is
*recording evidence* (a `completion` fact) against the responsibility the box
projects. Discharge is then derived from that evidence. Consequence: the same
work surfaced in three views cannot be "done" in one and "open" in another —
there is one responsibility, one evidence ledger, many projections.

**P-5 · Department workspaces are different views over the same underlying
responsibilities.** A workspace is a lens (five-level pipeline law applies:
Objects → Layers → Contributions → Lens Projection → Renderer). Kitchen,
warehouse, logistics, staffing, and finance-operations see *filtered,
shaped projections of one responsibility set* — never department-local copies.
The `operations` lens key survives per standing law until Warehouse and
Staffing both ship as lenses.

**P-6 · AI recommends; it never becomes the authoritative record.** An AI may
read all truth and all projections. It may write four things: recommendations,
summaries, priority orderings, and draft projections. Every AI-authored record
is labeled with AI provenance, lives outside the truth families, and sits
outside every derivation chain. No responsibility derives from an AI output.
An AI cannot perform an authoritative act: creating an attestation, transferring
ownership, or recording discharge evidence requires a human actor through the
v279 action gate (`AI_AUTHORITY_REFUSED`). If a human adopts an AI
recommendation, the human's adoption *is* the attestation — the AI text is
merely what they read before deciding.

---

## 4 · Canonical responsibility lifecycle

Consistent with the shipped no-status-column doctrine (I-34): **lifecycle
states are projected, never stored.** A responsibility row never carries a
status field. The states below are the canonical *projection vocabulary* —
computed from truth + evidence + clock — and every surface must use these
words and no others.

| State | Derived when | Exits by |
|---|---|---|
| **Derived** | Truth implies it; no ownership evidence yet | ownership fact → Standing; truth change → Superseded/Void |
| **Standing** | Owned; outside any activation window (or untimed and not yet actionable) | window opens / dependency clears → Active |
| **Active** | Owned; inside its window; dependencies satisfied | discharge evidence → Discharged; window closes unmet → Lapsed |
| **Discharged** | Evidence satisfies the required outcome | terminal (corrections per I-35, citing `prior_ref`) |
| **Lapsed** | Window closed without satisfying evidence | terminal as a fact about the past; the *derivation* may emit a successor responsibility (make-good), anchored to the lapse |
| **Superseded** | A later truth change re-derives a replacing responsibility; replacement cites the replaced | terminal |
| **Void** | Anchoring truth was corrected/invalidated (I-35) so nothing implies it any longer | terminal |

Rulings on the lifecycle:

**L-1.** No transition is ever a row update. Transitions happen only because
(a) an evidence fact was appended, (b) truth changed, or (c) the clock moved.

**L-2.** Discharge requires evidence. There is no "mark done" that writes state;
there is only "record what happened," from which Discharged is derived
(`RESP_DISCHARGE_WITHOUT_EVIDENCE` names the refusal for any path that tries to
shortcut this).

**L-3.** Supersession is total and cited. When truth changes (guest count
moves, a component is swapped, a profile revision is re-pinned on a draft), the
derivation runs again; responsibilities no longer implied become Superseded or
Void, new ones appear as Derived, and every replacement carries a reference to
what it replaced. Nothing is edited in place.

**L-4.** Lapsed is honest. A missed responsibility is a permanent fact, not a
row to quietly delete. Recovery is a *new* responsibility derived from the
lapse, visible as such.

**L-5 · Recurrence is derivation, not scheduling authority.** A recurring
responsibility is deterministically derived from (a) standing knowledge or an
authorized attestation, plus (b) a recurrence rule carried by that truth, plus
(c) the clock. The instance's truth anchors are the standing knowledge/
attestation revision and the rule — never the scheduler. The scheduler is
purely the mechanism that invokes derivation at the appropriate moments: it
creates no truth, possesses no authority, cannot attest, and its invocations
are idempotent under R-2 (invoking derivation twice for the same period yields
the same instances, keyed naturally by anchor + period). Each derived instance
then lives the ordinary §4 lifecycle.

---

## 5 · Ownership rules

**O-1 · At most one accountable owner at any instant.** An unassigned Derived
responsibility is lawful (and visible as debt per O-3). At most one owner may
be current per responsibility at any instant; once ownership is required —
by activation, by policy, or by a ceremony demanding an accountable party —
exactly one owner must be current. Co-ownership does not exist at any point.
Ownership is recorded in a dedicated append-only ownership ledger (§8.2).
Shared work is **participation** — evidence contributed by non-owners — and
never dilutes accountability.

**O-2 · Department of record is structural; owner is personal.** Every
responsibility carries one department of record (from derivation — v275's
`department` check already enforces the vocabulary). The owner is a person (or
an explicitly named role-seat) within or on behalf of that department.

**O-3 · Ownerless is information, not an error.** A Derived responsibility with
no owner is a visible debt in every relevant projection (empty-is-information,
standing law). The system never auto-assigns silently; auto-*recommendation* of
an owner is an AI/derivation suggestion requiring human adoption.

**O-4 · Transfer is a ceremony; delegation is not.** Transfer of accountability
goes through the v279 action gate, appends to the ownership ledger, and the
prior owner's tenure remains on the record. Delegation (owner asks someone to
do part of the work) is just participation evidence and changes nothing about
accountability.

**O-5 · Cross-department handoff is a transfer, never a copy.** When work moves
from kitchen to logistics ("loaded and ready" → "deliver"), either it was
always two responsibilities (each department its own, dependency-linked) or it
is one responsibility transferred. A responsibility is never duplicated so two
departments can each "have" it (`RESP_DUPLICATE_FORBIDDEN`).

---

## 6 · Cross-department projection rules

**X-1 · One set of responsibilities; many lenses.** A department workspace is a
lens projection: filter (department of record, or participation), shape (the
department's working vocabulary), order (priority). It adds nothing to the
record and stores nothing authoritative.

**X-2 · Visibility is not ownership.** Warehouse seeing culinary's pull-driving
responsibilities (because they feed the pack) is read-projection. Acting on
another department's responsibility is participation evidence at most.

**X-3 · Aggregation is projection** (and see R-13). "Everything leaving the
building Sunday" across three events is a computed projection over
responsibilities — never a new record. Aggregating by truck, by hour, or by
department creates nothing; only an attestation does. If the aggregate needs to be *committed to* (a single truck
departure covering three events), that commitment is a new responsibility
derived from an attestation, dependency-linked to what it covers.

**X-4 · Projections never write back.** No projection surface may mutate
responsibilities or truth. The only writes any surface can make are evidence
facts and ceremonies through the action gate (`PROJECTION_WRITE_REFUSED`).

**X-5 · Availability never depends on content** (standing law, restated here
because task lists tempt violation): a department's lens is present even when
its projection is empty; the empty state is itself information.

**X-6 · Finance boundary.** The Finance *lens* remains scoped strictly to
design-money (frozen law; not reopened). Finance-department *responsibilities*
(collect the balance per accepted terms, reconcile the deposit) are
execution-side responsibilities derived from acceptance truth, projected into a
finance-operations workspace. Nothing here amends the Finance lens.

---

## 7 · Immutable invariants

**R-1 through R-13 are hereby bound into the constitutional invariant
registry** per the AMENDMENT-001 numbering registry, effective on acceptance of
this revision. They carry the same force as I-33…I-54.

- **R-1** Every responsibility cites ≥1 truth anchor (T1/T2/T3). Anchor-less
  creation refuses: `RESP_NO_TRUTH_ANCHOR`.
- **R-2** Derivation is deterministic and idempotent: identical truth ⇒
  identical responsibility set, keyed by natural key (I-36 generalized).
  Regeneration upserts; it never duplicates.
- **R-3** Responsibility records carry **no stored lifecycle state**. All state
  is projected from evidence + truth + clock (I-34 generalized).
- **R-4** All responsibility-adjacent ledgers are append-only; corrections cite
  `prior_ref` (I-35 generalized). No update/delete grants, enforced as RLS.
- **R-5** There is no task table. Any migration creating one violates the
  constitution on its face.
- **R-6** At most one current accountable owner per responsibility at any
  instant; unassigned Derived is lawful; once ownership is required, exactly
  one owner is current. Ownership history is append-only and total.
- **R-7** Discharge derives only from evidence: `RESP_DISCHARGE_WITHOUT_EVIDENCE`.
- **R-8** Truth change re-derives; replacements cite the replaced; in-place
  edits of derived records are refused: `RESP_EDIT_REFUSED`.
- **R-9** Projections are non-authoritative; caches must be labeled and
  reproducible from source; projection writes refuse: `PROJECTION_WRITE_REFUSED`.
- **R-10** AI output is labeled, lives outside truth, anchors nothing, and
  cannot perform ceremonies: `AI_AUTHORITY_REFUSED`.
- **R-11** Sealed engagements stay sealed: responsibilities derived from an
  accepted/sealed engagement anchor to the *embedded* basis (v284 law), never
  to the live library; a later library edit changes nothing for a sealed event.
- **R-12** Department vocabulary is closed and checked (v275's set; amendments
  by RFC, not by string drift).
- **R-13 · Responsibilities are content-independent.** A responsibility never
  derives from how information is *presented*. It derives only from truth.
  A proposal grouped into different sections or bands, a workspace sorted or
  filtered differently, a pull sheet aggregated by truck, an AI summary, a
  "Today's Work" view — all must yield the **identical** underlying
  responsibility set, by natural key. Changing presentation must never create
  or destroy a responsibility: `RESP_PRESENTATION_DERIVATION_REFUSED`.

  **The bright line.** Presentation and truth are not always obvious at a
  glance, and the distinction must not be settled by implementation
  convenience. The test: *if a change alters **what** is owed, **when** it is
  owed, or **which department** owes it, the change was truth; if it alters
  only how an unchanged set is displayed, ordered, grouped, filtered, or
  summarized, it was presentation.* Worked consequences: re-ordering the
  Design Stage or re-banding a proposal is presentation (no derivation input);
  moving a component between chapters is **truth**, because chapters carry
  temporal placement and therefore change *when* work is owed; category
  grouping inside a component is presentation unless a promoted knowledge rule
  makes the grouping drive prep batching, in which case the rule — not the
  grouping — is the anchor. Ambiguous cases are resolved by ruling and recorded
  as law, never decided inside a derivation function.

  R-13 is the derivation-side dual of R-9. R-9 forbids projections from writing
  *outward*; R-13 forbids presentation from feeding *inward*. Together they
  close the loop in both directions, which is what makes "workspaces are
  lenses" mechanically true rather than merely intended.

---

## 8 · SQL implications (shapes only — slicing belongs to v286+)

The doctrine is deliberately cheap in SQL because v275 built most of it:

1. **Generalize, don't rebuild — RULED.** The existing `obligation` relation
   is widened **in place** and is constitutionally recognized as **the
   Responsibility record**. `responsibility` becomes the canonical vocabulary
   at every boundary — views, functions, types, and UI — while the physical
   table name is retained for compatibility unless a future certified rename
   is justified. **No parallel responsibility table may be created**
   (`RESP_DUPLICATE_FORBIDDEN` applies to schema as well as rows). Widening: `origin_kind` gains
   `'knowledge'` and `'attestation'` alongside the existing three, with an
   `origin_revision` column so knowledge-derived responsibilities pin the
   revision they derive from (mirroring the v283/v284 pin discipline). Existing
   rows are already valid under the widened law. Standing/recurring
   responsibilities (knowledge-derived, not event-anchored) require `event_ref`
   to become nullable-with-check (`event_ref` null ⇔ origin is knowledge/
   attestation of standing scope) — the one genuinely structural change, to be
   proven carefully.
2. **Ownership ledger — RULED.** A **dedicated append-only ownership ledger**
   (working name `responsibility_owner`), giving O-1's at-most-one-current
   guarantee its own race-proof surface. Generic `execution_evidence` is not
   overloaded as the sole ownership structure; assignment evidence may still be
   *echoed* into the evidence ledger for narrative completeness, but the
   ownership ledger is authoritative for who is current.
3. **Derivation functions.** One pure resolver per truth family feeding a
   single `derive_responsibilities()` writer — the only writer, locking its
   scope, upserting by natural key, marking supersessions (the
   `author_profile_revision` single-writer pattern, reused).
4. **Projection functions.** `department_workspace(dept)`, `day_sheet(date)`,
   `responsibility_state(id)` — read-only, stable, returning the §4 vocabulary
   verbatim.
5. **Refusal codes** as named in §§3–7, enforced at constraint or ceremony
   level exactly as v283/v284 enforce `NO_EXECUTABLE_FORMULAS` and `PIN_INVALID`.
6. **No new mutable state anywhere.** RLS insert+select-only throughout.

---

## 9 · Proof obligations (designed now; executed per slice at v286+)

- **RSP-1** Derivation determinism: same truth twice ⇒ identical set, zero
  duplicates (natural-key upsert proven).
- **RSP-2** Anchor refusal: insertion without a truth anchor refuses with
  `RESP_NO_TRUTH_ANCHOR`.
- **RSP-3** No stored state: schema assertion — no status column exists;
  `responsibility_state()` alone answers state, and answers it from evidence.
- **RSP-4** Discharge-by-evidence: `completion` fact flips the projection to
  Discharged; absent evidence, no path yields Discharged.
- **RSP-5** Supersession chain: truth change ⇒ old projected Superseded, new
  Derived, replacement cites replaced.
- **RSP-6** Ownership uniqueness under race: two backends transfer concurrently
  (barrier-synchronized, both orders, disposable db per standing race
  discipline) ⇒ exactly one current owner, total history, loser refused
  lawfully.
- **RSP-7** Discharge-vs-supersede race: evidence lands while truth changes ⇒
  one lawful outcome, no lost facts, corrections cite `prior_ref`.
- **RSP-8** Projection purity: workspace/day-sheet functions perform zero
  writes (proven by fingerprint, the eczr technique).
- **RSP-9** AI fence: an AI-labeled actor attempting a ceremony refuses
  `AI_AUTHORITY_REFUSED`; an AI recommendation adopted by a human derives from
  the human's attestation, and the responsibility's anchors contain no AI
  record.
- **RSP-10** Sealed-basis anchoring: post-seal library edit ⇒ zero change in a
  sealed event's responsibility set (the CHN-1 chain, extended one link).
- **RSP-11 · Content independence.** Derive a responsibility set; then permute
  presentation only — re-section and re-band the proposal, re-sort and re-filter
  the department workspace, aggregate the pull sheet by truck, generate an AI
  summary, apply a "Today" filter — and assert the responsibility set is
  **identical by natural key** after every permutation, with zero rows created,
  superseded, or voided. Paired negative: a genuine truth change adjacent to
  each permutation (a chapter move, a guest-count change) **does** re-derive,
  proving the test discriminates rather than merely passing.
- **Browser obligations:** a workspace lens renders Derived/ownerless as
  visible debt; checking a box records evidence and the same responsibility
  updates in a second department's projection without any second write.

---

## 10 · Worked examples

**Catering (kitchen).** The Goldberg wedding is accepted; the sealed basis
embeds Carving Station's profile (service_points=3 ⇒ carver 3, the certified
CHN-1 chain). Derivation emits `culinary_prepare` responsibilities anchored to
the release + embedded basis. The kitchen lens projects them as prep-list
tasks. Checking "brisket rubbed" appends a `completion` fact; Discharged is
derived; the production board (a different lens) reflects it with no second
write.

**Warehouse.** The same basis implies equipment pulls. Sunday's three events
project one aggregated pull sheet (X-3). The warehouse lead commits to a single
consolidated pull — an attestation — deriving one warehouse responsibility
dependency-linked to the three per-event ones. A guest-count change on one
event re-derives that event's pulls; the consolidated responsibility projects a
staleness finding (v282 doctrine) rather than being silently edited.

**Logistics.** "Truck departs 14:00" derives from venue knowledge
(travel/access windows, v280/v281) + the event timeline. Venue knowledge gains
a corrected loading-dock constraint at revision N+1: *sealed* events keep their
embedded anchor (R-11); *draft* engagements re-derive and the old
responsibility is Superseded with citation.

**Staffing.** v278 coverage says 1 of 2 carver seats open. That blocker is
re-founded as a projection of an ownerless Derived staffing responsibility
(O-3): same surface, now under law. Assigning staff appends assignment
evidence; the responsibility goes Standing → Active on the event window.

**Finance operations.** Acceptance truth records a balance due on terms.
Derivation emits "collect balance by T-7" owned by finance-ops. At T-7 without
payment evidence it projects Lapsed, and a successor make-good responsibility
("collect + escalate") derives from the lapse — nothing was edited, the record
shows exactly what happened. The Finance *lens* (design-money) is untouched
(X-6).

**AI, threaded through all five.** The AI drafts tomorrow's priority ordering
across departments and recommends transferring an ownerless logistics
responsibility to Moshe. Ben taps "adopt" — a human ceremony; the attestation
is Ben's. The AI's draft is retained, labeled, and anchors nothing (RSP-9).

---

## 11 · Deferred (verbatim list for v286+ planning)

Implementation slices for: responsibility record generalization · ownership
ledger · derivation functions per truth family · projection functions ·
DailyOps UI · department workspace lenses (Warehouse, Staffing — `operations`
key retirement gate) · AI recommender surface · notification/escalation ·
recurrence/standing-responsibility scheduling · capacity and workload math ·
v285-as-previously-planned profile/integration hardening · feasibility engine
and the remaining v284 deferred list, unchanged.

## 12 · Rulings recorded (formerly open questions — all resolved)

1. **Species vs. new table — RULED (widen in place).** `obligation` is widened
   and recognized as the Responsibility record; `responsibility` is the
   canonical vocabulary via views, functions, types, and UI boundaries; the
   physical name persists unless a future certified rename is justified; no
   parallel table.
2. **Ownership ledger — RULED (dedicated).** Append-only dedicated ledger;
   generic evidence is not the sole ownership structure.
3. **Recurrence — RULED (Amendment 2, codified as L-5).** Recurrence is
   deterministic derivation from standing knowledge or authorized attestation
   plus a recurrence rule and the clock; the scheduler is mechanism only —
   no truth, no authority.
4. **Vocabulary — RULED.** *Responsibility* is the constitutional term
   everywhere in law, schema boundaries, and proofs. User-facing surfaces may
   use contextual language — My Work, Daily Operations, Prep, Pulls,
   Deliveries, Staffing, Collections — as lens-level labels over the same
   records, per the Event Studio/Library precedent. **No authoritative task
   object and no authoritative task state may be introduced under any label**
   (R-5 governs the substance regardless of the word on the surface).

---

## 13 · Known boundary (recorded, not resolved)

Worth naming now that this document is law. EventCore's constitutional law
previously answered *what commitments exist*; this constitution answers *given
those commitments, what work necessarily exists*. That makes the platform an
execution operating system whose first domain happens to be catering — and it
promotes some domain assumptions to load-bearing law. Chiefly **R-12's closed
department vocabulary** (`culinary`, `equipment`, `staffing`, `venue`,
`logistics`), inherited from v275. It is correct for catering and will be the
first thing to bind if a non-catering domain is ever served. Recorded
deliberately: closed-and-checked beats string drift today, and widening it
later is an RFC amendment, not a rewrite. No action now.

---

**ACCEPTANCE — RECORDED.**

**v285 Rev B — ACCEPTED. Constitution FROZEN.** Amendments 1–2 applied, the
four rulings of §12 recorded as law, R-13 added on acceptance, and R-1…R-13
bound into the constitutional invariant registry. Changes hereafter by RFC
amendment only.

The §9 proof obligations (RSP-1…RSP-11) are now **mandatory certification for
every Responsibility-touching slice**, and the v284 certification floor
(`CERTIFICATION_v284.md` §11) remains the regression baseline: per-runner,
24 certified runners at 228 PASS / 0 FAIL / 0 zero-emission, with
`accept-regression` quarantined.

**Next slice, as scoped by the owner — v286 · Responsibility Record +
Ownership Ledger + Proofs.** Infrastructure only: generalize `obligation` into
the constitutional Responsibility record (§8.1); introduce the dedicated
ownership ledger (§8.2); implement deterministic derivation (§8.3); prove
determinism (RSP-1), anchor refusal (RSP-2), idempotency (R-2), ownership
races (RSP-6), and projection purity (RSP-8). No UI beyond the minimum needed
to verify those proofs. The first Responsibility-based workspace waits until
that foundation is certified.

*Awaiting the v286 directive. Not pre-built.*
