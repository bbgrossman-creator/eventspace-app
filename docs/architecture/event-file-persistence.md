# Event File · Canonical Persistence Specification

---

# Part I · Five universal rules, derived before any object

These fall out of the ratified invariants and govern every object below.

**U1 · Identity is opaque and immutable.** Invariant 7. An identity row is written once and never touched again.

**U2 · No current state is stored.** Invariant 20 requires every fact to be answerable *as of any moment*. A stored current value cannot answer "what was it on 3 March." Storing both the current value and its history would give one fact two owners, violating invariant 13. **Therefore state is never a column; state is the derivation over an append-only fact stream.**

**U3 · Supersession pointers live on the successor, never on the superseded.** Invariant 19 forbids editing an observation, and invariant 18 forbids deletion. A `superseded_by` field written onto the old row would be an edit. The successor is created carrying the reference; the predecessor is never touched.

**U4 · Every fact carries an actor and a moment.** Present throughout the model — Observation has observer and moment, Supersession Link has actor and moment — and already enforced in the repository, where responsibility ownership requires both.

**U5 · Nothing is updated in place and nothing is deleted.** Invariant 18. Every change is an append.

**The consequence, stated once:** the persistence model is **immutable identity rows plus append-only fact streams, with zero stored current state.** Every object below follows this shape. Where an object appears to have "mutable state," it does not — it has a stream.

---

# Part II · Per-object persistence

## 1 · Event File

**Persistent attributes — the identity row, and nothing else**

| Field | Justification | Mutability |
|---|---|---|
| `event_file_id` | Invariant 7 — opaque, never derived | **Immutable** |
| `recognised_at` | The moment of recognition; U4 | **Immutable** |
| `recognised_by` | The actor; U4 | **Immutable** |

**That is the whole row.** Everything else is a stream or is derived.

**Identity vs state.** Identity is the three fields above. There is no state on the Event File. The object model is explicit: *"The Event File's recognition of its celebration is composed of Observations and is therefore correctable."* **The file's name, honoree, occasion type, date and principal party are therefore not columns — they are Observations**, because a column cannot be corrected without being edited.

**Derived, never stored**

| Omitted | Why |
|---|---|
| Title / name / honoree | An Observation. Correctable |
| Principal Party | An Observation. The relationship table states it is *"corrected by observation, not by supersession"* |
| Celebration date | An Observation about the celebration — external, and we may be wrong |
| Lifecycle | Composed from occurrences. Invariant 14 |
| Readiness | Composed. Invariant 14 |
| Settlement status | Invariant 22 — the file has **no settlement of its own** |
| Balance, total value | Composed from Engagements |
| Archived | Derived from the archival fact stream |
| Event count, occurrence count | Counts of related rows |
| Next action, timeline | Eliminated objects — derived |

**Computed projection.** Identity, recognition as-of, composed lifecycle, composed readiness, engagement summary, related events.

**Foreign keys.** None outbound. Everything points *at* the Event File.

**Append-only histories.** Recognition observations · principal-party assertions · archival facts.

**Immutable fields.** All three.

**Correction mechanism.** A new Observation. The file row is never touched.

**Supersession.** Via Supersession Link only. The row itself is never modified — U3.

## 2 · Party

**Persistent attributes:** `party_id`, `recognised_at`, `recognised_by`. **Immutable.**

**Identity vs state.** No state. Name, composition, contact details and preferences are **Observations** — Framework L319 makes the party's identity and composition *"a subject we assert about,"* and assertions are correctable.

**Derived, never stored.** Current name · composition · contact · every Event File they are principal of · every Engagement they counterparty · their history with us.

**Computed projection.** Identity plus current observations as-of, plus related files and engagements.

**Foreign keys.** None outbound.

**Append-only histories.** All observations about the party.

**Correction mechanism.** New Observation.

**Supersession — OPEN ITEM, NOT FILLED.** The object model states that *"merging parties follows the same supersession discipline as Event Files,"* but the ratified Supersession Link is typed to Event File — *"one superseded Event File · 1..n successor Event Files."* **No structure exists for party supersession.** This specification surfaces the gap rather than inventing a structure to close it. It requires a ruling: either the Supersession Link is generalised, or a distinct party structure is ratified. Party merge cannot be persisted until that is decided.

## 3 · Engagement

**Persistent attributes:** `engagement_id`, `opened_at`, `opened_by`. **Immutable.**

**Identity vs state.** No state on the row.

**Foreign keys — both as streams, not columns.**

| Relation | Form | Why not a column |
|---|---|---|
| → Event File | Append-only assignment stream; exactly one current | **Split requires reassignment.** Edge case 5: *"Split with engagements attached requires each engagement to be assigned; none may be orphaned."* A column would have to be edited; U5 forbids it |
| → counterparty Party | Append-only assignment stream; exactly one current | Correction of a mis-identified counterparty must be recordable, not edited |

Invariant 10 holds as an **as-of** statement: exactly one Event File and one counterparty **at any moment**.

**Internal structure — deliberately not specified.** Offers, options, terms, acceptance and account obligations belong to the Engagement Constitution. The object model states its internal structure *"is that constitution's and is not redefined here."* This specification defines the attachment point and stops.

**Derived, never stored.** Current state (open / accepted / discharged / settled) · balance · amount owed · whether settled · which offer is current.

**Append-only histories.** Event File assignment · counterparty assignment · all Engagement-governed facts.

**Correction mechanism.** New assignment fact for the attachment; Engagement's own ceremonies for everything else.

**Supersession.** Offer revision supersedes the **instrument**, never the Engagement. The Engagement identity is stable across revisions.

## 4 · Event

**Persistent attributes:** `event_id`, `created_at`, `created_by`. **Immutable.**

**Foreign keys.** → Event File, as an append-only assignment stream (split reassigns).

**Derived, never stored — and this is the notable case**

| Omitted | Why |
|---|---|
| **Date** | **Derived from its occurrences.** The model's retention note records that Event *"reduces to a derived grouping by date and venue"* |
| **Venue** | Same. Venue is an as-of fact about occurrences |
| Lifecycle | Composed from occurrences. Invariant 14 |
| Readiness | Composed |

An Event therefore persists **almost nothing**. This is the retention note made concrete: Event is retained because `OC‑nn` structurally enforces it, not because it holds anything of its own.

**Append-only histories.** Event File assignment.

**Correction mechanism.** New assignment fact.

**Supersession.** None. Events are cancelled, never superseded.

## 5 · Occurrence

**Persistent attributes:** `occurrence_id`, `created_at`, `created_by`. **Immutable.**

**Foreign keys.** → Event. **Exactly one at any moment, structurally enforced** per `OC‑nn`. Rescheduling between events is recorded as a fact, not an edit.

**Derived, never stored.** Lifecycle phase · readiness verdict · blocker grounds · department readiness · current venue · current window. All are as-of derivations over fact streams — the existing certified pattern, where phase and readiness are computed and take a moment.

**Append-only histories.** Event assignment · venue bindings (as-of) · scheduled window · status facts · supervision · profile.

**Correction mechanism.** New as-of fact.

**Supersession.** None. Cancelled, never superseded.

## 6 · Responsibility

**Persistent attributes**

| Field | Justification | Mutability |
|---|---|---|
| `responsibility_id` | Identity | **Immutable** |
| natural key | Derivation identity — how the same responsibility is recognised across re-derivation | **Immutable** |
| attachment grain + target | Invariant 11 — exactly one grain | **Immutable** |
| required outcome | What is owed | **Immutable** |
| timing window | When it is due | Fact stream — may be revised |
| derivation source | What released it | **Immutable** |

**Identity vs state. State is a function, never a column.** `responsibility_state` is the sole authority at this grain and takes a moment. Storing a state column would create a second authority — invariant 13.

**Derived, never stored.** Current state · whether discharged, lapsed, void or superseded · readiness contribution · priority position · next action · current owner.

**Foreign keys.** → exactly one attachment grain (Event File, Event or Occurrence). Resolves to exactly one Event File.

**Append-only histories.** Ownership — owner, actor, moment, each required · evidence · exceptions · timing revisions.

**Correction mechanism.** New ownership fact, new evidence, new exception. Never an edit.

**Supersession.** Per `responsibility_state`'s existing vocabulary. Supersession is a derived state, not a stored flag.

## 7 · Observation

**Persistent attributes:** `observation_id`, `observer`, `moment`, subject reference, predicate, content, optional Event File attachment, optional Attachment references. **Every field immutable.**

**Identity vs state.** No state whatsoever. An Observation is a frozen assertion.

**Derived, never stored — the critical one**

> **`superseded_by` is never stored.** Invariant 19: observations are *"superseded by later observation, never edited."* A `superseded_by` column would be written onto the old row — an edit. **Supersession among observations is derived by recency**: for a given subject and predicate, the current observation is the latest by moment.

Also derived: whether current · whether contradicted · the observation chain.

**Foreign keys.** → subject (Party, Occurrence, Venue, Supplier) · → Event File (optional) · → Attachments (optional).

**Append-only history.** The Observation stream **is** the history. There is no separate one.

**Correction mechanism.** Record a later Observation. Retraction is itself an Observation asserting the retraction — never a deletion.

**Supersession.** By recency. No stored pointer.

## 8 · Attachment

**Persistent attributes:** `attachment_id`, content reference, content hash, `uploaded_at`, `uploaded_by`, `supersedes` (nullable, on the successor). **All immutable.**

**Identity vs state.** No state. The `supersedes` pointer is set at creation on the **new** row and never written to the old one — U3, and the model's *"superseded by newer versions, never overwritten."*

**Derived, never stored.** Whether current · version number · what references it · what it evidences.

**Foreign keys.** → `supersedes` (self, nullable). Nothing else. **References point at the attachment, never from it**, because its meaning is conferred by what references it — the model gives it no authority of its own.

**Correction mechanism.** Upload a successor.

**Supersession.** Successor-carried chain; current derived by following it.

## 9 · Supersession Link

**Persistent attributes:** `link_id`, superseded Event File, kind (merge or split), `actor`, `moment`, recorded reason, plus one row per successor to express 1..n. **All immutable.**

**Derived, never stored.** **Transitive resolution.** Where A is superseded by B and B by C, the resolution of A to C is computed by walking the chain. Storing a flattened pointer would be a cache with authority — invariant 13.

Also derived: whether a file is superseded · the successor set · the full lineage.

**Foreign keys.** → superseded Event File · → each successor Event File.

**Correction mechanism.** A supersession recorded in error is corrected by a further supersession, never by deletion.

**Supersession behaviour.** Chains are permitted and must resolve transitively. **No identity is ever reused** — invariant 5.

## 10 · Event File Link

**Persistent attributes:** `link_id`, two Event File references, kind (series, same party), `asserted_at`, `asserted_by`. **All immutable.**

**Derived, never stored.** Whether currently in force — derived from the presence of a later retraction. Series membership sets · transitive series relations.

**Correction mechanism.** A retraction fact. *"Retraction is recorded, never erased."*

**Supersession.** None. **A link never redirects identity** — invariant 12 and the object's own invariant.

---

# Part III · What must never be stored, consolidated

| Never stored | Governing invariant |
|---|---|
| Any composed verdict — readiness or lifecycle at a grain above its authoring grain | 14 |
| Next action | 14; eliminated object |
| Timeline | 18, 20; eliminated object |
| Counts, totals, balances | Composed |
| Event File title, honoree, date, principal party | Observations — correctable |
| Event date and venue | Derived from occurrences |
| Archived flag | Derived from the archival stream |
| Event File settlement status | 22 — no settlement of its own |
| `superseded_by` on any superseded row | 19; U3 |
| Flattened transitive supersession resolution | 13 |
| Current-value columns of any kind | 20; U2 |

**The single permitted exception.** Where derivation cost becomes prohibitive, a materialisation may exist **only if** it is fully rebuildable from the facts, carries **no authority**, is never read as truth when the derivation is available, and is proved byte-identical to its derivation. It stores no new truth and creates no second owner. This specification authorises the *form* of such a cache and names none.

---

# Part IV · Open item requiring a ruling

**Party supersession has no ratified structure.** The object model requires party merging to follow the Event File discipline while typing Supersession Link exclusively to Event Files. Persisting a party merge would require either generalising the ratified Supersession Link or introducing a new structure — **both of which are changes to a read-only model.** No structure is proposed here. Party merge cannot be persisted until this is ruled.

---

**Ten objects. Three of them — Event File, Party, Event — persist essentially nothing but identity. Every attribute above traces to a ratified invariant; every omission is named with the invariant that forbids it.**