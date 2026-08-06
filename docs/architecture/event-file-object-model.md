# Event File · Canonical Implementation Architecture

---

# Part I · First-class objects

Ten survive. Five candidates were eliminated and three were added; the reduction pass in Part IV shows the working.

## 1 · Event File

| | |
|---|---|
| **Purpose** | The institutional object under which every observation, undertaking and unit of work concerning one recognised celebration is gathered |
| **Identity** | Opaque and stable, assigned at recognition. **Never derived** from date, venue, party, name or any fact that may change |
| **Lifetime** | From recognition — normally at inquiry — until superseded or permanently archived. **Never destroyed** |
| **Owner** | The institution. Not a department, not an operator |
| **Constitutional authority** | Institutional. It **holds** facts governed elsewhere: custody is not authority (Framework VII.6) |
| **Relationships** | One principal Party · 0..n Engagements · 0..n Events · 0..n Responsibilities · 0..n Observations · 0..n Attachments · 0..n Links |
| **Invariants** | Exactly one recognition. Identity fixed through every lifecycle transition. Superseded identities resolve permanently |
| **Does NOT own** | The celebration · the truth of any fact it holds · money (Engagement's) · doctrine (Knowledge's) · readiness rules (composed, never independent) |

## 2 · Party

| | |
|---|---|
| **Purpose** | An externally-existing person or organisation we recognise, assert about, and contract with |
| **Identity** | Assigned by us. The party does not know it and does not hold it |
| **Lifetime** | Indefinite; persists across many Event Files |
| **Owner** | The institution — our recognition of them |
| **Constitutional authority** | **Atlas** for identity and composition; **Engagement** for the relation. Framework L319: *"The party's identity and composition is a subject we assert about — Atlas; the relation is Engagement"* |
| **Relationships** | Principal of 0..n Event Files · counterparty of 0..n Engagements · subject of 0..n Observations |
| **Invariants** | A party's identity is independent of any Event File. Merging parties follows the same supersession discipline as Event Files |
| **Does NOT own** | Itself. We hold a correctable recognition of an external person, never the person |

## 3 · Engagement

| | |
|---|---|
| **Purpose** | One undertaking-lineage with one counterparty concerning one Event File |
| **Identity** | Its own, stable across offer revisions |
| **Lifetime** | From the first undertaking act — option granted or offer issued — until discharged by settlement, decline, rescission or lapse |
| **Owner** | Institution and counterparty jointly. E‑III.2: the counterparty is the only actor outside the institution who may change our constitutional state |
| **Constitutional authority** | **Engagement Constitution.** Its internal structure — offers, options, terms, acceptance, account obligations — is that constitution's and is **not redefined here** |
| **Relationships** | Exactly one Event File · exactly one counterparty Party |
| **Invariants** | Exactly one counterparty. Exactly one Event File. **Settlement is per Engagement, never per Event File** |
| **Does NOT own** | The Event File · the work released from it · the celebration · any operational fact |

## 4 · Event

| | |
|---|---|
| **Purpose** | A dated, venued grouping of occurrences |
| **Identity** | Its own |
| **Lifetime** | From creation until cancelled or completed. Never destroyed |
| **Owner** | The institution |
| **Constitutional authority** | **Atlas `OC‑nn`** — one event per occurrence, structurally enforced |
| **Relationships** | Exactly one Event File · 1..n Occurrences |
| **Invariants** | Every Occurrence belongs to exactly one Event |
| **Does NOT own** | Readiness or lifecycle verdicts — both compose upward from occurrences · commercial terms |

> **Retention note.** Event is retained on **constitutional authority, not architectural necessity.** Under celebration grain with engagements on a separate axis, Event carries no commercial weight and reduces to a derived grouping by date and venue. `OC‑nn` structurally enforces it, and eliminating it would reopen ratified Atlas law. It stands, and this is recorded so that no future reader mistakes retention for derivation.

## 5 · Occurrence

| | |
|---|---|
| **Purpose** | One instance of service delivery — the grain at which operations are planned and readiness is authored |
| **Identity** | Its own |
| **Lifetime** | From creation to settlement or cancellation. Never destroyed |
| **Owner** | The institution; departments own responsibilities within it |
| **Constitutional authority** | **Atlas.** Lifecycle and readiness certified at this grain |
| **Relationships** | Exactly one Event · 0..n Responsibilities · 0..n Observations |
| **Invariants** | Exactly one Event. Its readiness composes from departments, which compose from responsibilities |
| **Does NOT own** | Any independent readiness rule. An upper-grain verdict that could disagree with its grounds would be a second authority |

## 6 · Responsibility

| | |
|---|---|
| **Purpose** | A unit of owed work, with an owner and a required outcome |
| **Identity** | Its own |
| **Lifetime** | From derivation until discharged, lapsed, superseded or voided. Never destroyed |
| **Owner** | A department, per PC‑2, PC‑3 and `R‑12` |
| **Constitutional authority** | **Atlas.** `responsibility_state` is the **sole authority at this grain** |
| **Relationships** | Attaches at exactly one grain — Event File, Event or Occurrence — and resolves to exactly one Event File |
| **Invariants** | Exactly one owner. Exactly one attachment grain. Append-only |
| **Does NOT own** | Any composed verdict above it · its own priority ordering · its next action |

## 7 · Observation

| | |
|---|---|
| **Purpose** | A claim about a subject, made by an observer, at a moment |
| **Identity** | Its own |
| **Lifetime** | Permanent. **Superseded by later observation, never edited** |
| **Owner** | The institution |
| **Constitutional authority** | **Atlas as experience.** Knowledge L41 places venue, supplier and client observations explicitly with Atlas — *"The Library holds them; Atlas governs them"* |
| **Relationships** | About exactly one subject · attaches to 0..1 Event File · may reference Attachments |
| **Invariants** | Never edited. Answerable as of any moment. **The Event File's recognition of its celebration is composed of Observations and is therefore correctable** |
| **Does NOT own** | Doctrine (Knowledge) · the external subject it is about |

## 8 · Attachment

| | |
|---|---|
| **Purpose** | Holds content that no other object holds |
| **Identity** | Its own |
| **Lifetime** | Permanent. Superseded by newer versions, **never overwritten** |
| **Owner** | The institution |
| **Constitutional authority** | **None of its own.** Its meaning is conferred entirely by what references it |
| **Relationships** | Referenced by 0..n facts of any kind |
| **Invariants** | Never deleted. An attachment asserts nothing |
| **Does NOT own** | Any fact. It **evidences**; it never **asserts**. A document that appears to state a term does not constitute one — the term is Engagement's, and the document only evidences it |

## 9 · Supersession Link

| | |
|---|---|
| **Purpose** | Records that one Event File identity was replaced, by merge or by split, following a corrected mis-identification |
| **Identity** | Its own |
| **Lifetime** | Permanent |
| **Owner** | The institution |
| **Constitutional authority** | The ratified identity rule; append-only discipline |
| **Relationships** | One superseded Event File · 1..n successor Event Files · one actor · one moment · one recorded reason |
| **Invariants** | The superseded identity **resolves forever** and redirects. No identity is ever reused. **Supersession is never a lifecycle transition** |
| **Does NOT own** | Any fact of the files it links. It records a correction of recognition, never a change in the world |

## 10 · Event File Link

| | |
|---|---|
| **Purpose** | Relates Event Files without containment, redirection or identity change — annual series, one party's unrelated simchas |
| **Identity** | Its own |
| **Lifetime** | Permanent unless retracted; retraction is recorded, never erased |
| **Owner** | The institution |
| **Constitutional authority** | Atlas — an assertion that two of our own subjects are related |
| **Relationships** | Two Event Files, plus a kind |
| **Invariants** | **Never redirects identity. Never transfers ownership of a fact. Never implies containment** |
| **Does NOT own** | Anything in either file |

**Kept separate from Supersession Link deliberately.** They fail differently: supersession changes identity resolution, a link never does. Merging them behind a `kind` discriminator would place two failure modes under one object.

---

# Part II · Relationships

| Relationship | Cardinality | Ownership | Lifecycle | Creation ceremony | Destruction | Supersession |
|---|---|---|---|---|---|---|
| **Party → Event File** *(principal)* | 1 : 0..n | Party's identity is Atlas's; the association is the file's | Set at recognition; may be corrected | Recognition | Never destroyed | Corrected by observation, not by supersession |
| **Event File → Engagement** | 1 : 0..n | The file holds; Engagement governs | Independent of the file's | **Engagement ceremony** — grant option or issue offer | Never destroyed; discharged | Offer revision supersedes the instrument, not the Engagement |
| **Event File → Event** | 1 : 0..n | The file holds; Atlas governs | Independent | Atlas fact recording | Cancelled, never destroyed | None |
| **Event → Occurrence** | 1 : 1..n | Atlas | Bound to the Event | Atlas fact recording | Cancelled, never destroyed | None. **`OC‑nn` structurally enforces exactly one Event per Occurrence** |
| **Event File → Responsibility** | 1 : 0..n | Department owns; the file resolves | Derived, then discharged/lapsed/voided | **Derivation**, principally from release | Never destroyed | Superseded per `responsibility_state` |
| **Event File → Observation** | 1 : 0..n | Atlas | Permanent | Recording an observation | Never destroyed | Superseded by later observation |
| **Any fact → Attachment** | n : n | Institution | Permanent | Upload | Never destroyed | New version supersedes; prior retained |
| **Event File ⇒ Event File** *(supersedes)* | 1 : 1..n | Institution | Permanent | **Merge or split** — the only ceremony that changes identity | Never destroyed | Is itself the supersession record |
| **Event File ↔ Event File** *(links)* | n : n | Institution | Permanent unless retracted | Assertion of relatedness | Retraction recorded | None |

### The three creation ceremonies that matter

**Recognition** creates an Event File. It is an **Atlas fact-recording, never an Engagement ceremony.** Engagement L43 and L92 establish that an inquiry undertakes nothing and obliges nobody; a design in which issuing an offer created the Event File would place the creation of an institutional subject inside Engagement's jurisdiction.

**Release** creates Responsibilities. Framework L248 — an accepted undertaking becomes internal work. E‑VIII.4 — Atlas *derives* obligations from bound terms and never reads a term as an instruction.

**Merge and split** are the **only** ceremonies that change identity, and neither is a lifecycle transition. Nothing happened at the celebration; we corrected a mis-identification.

---

# Part III · Canonical invariants

### Identity

1. Every Event File has exactly one recognition of exactly one celebration.
2. An Event File's identity is fixed through every lifecycle transition — option, offer, acceptance, release, operation, cancellation, settlement, archival.
3. Identity changes **only** by supersession, and supersession is only ever merge or split.
4. Every superseded identity resolves permanently and redirects to its successor(s).
5. No identity is ever reused.
6. A split resolves to a disambiguation among successors, never to a guess.
7. Identity is opaque — never derived from date, venue, party or name.

### Structure

8. Every Occurrence belongs to exactly one Event (`OC‑nn`).
9. Every Event belongs to exactly one Event File.
10. Every Engagement belongs to exactly one Event File and has exactly one counterparty.
11. Every Responsibility attaches at exactly one grain and resolves to exactly one Event File.
12. Links never imply containment; there are **no parent/child Event Files**.

### Authority

13. **No fact has two owners.**
14. No composed verdict carries an independent rule; every one composes from the grain beneath it and cannot disagree with the grounds it reports.
15. The Event File holds facts it does not govern — custody is not authority.
16. An Attachment asserts nothing; it only evidences.
17. A record of a communication is never read as the act it evidences.

### Persistence

18. Nothing is deleted.
19. Observations are superseded, never edited.
20. Every fact is answerable as of any moment.
21. Archival is presentation, not truth: an archived Event File remains fully answerable and is absent only from the default lens.

### Commercial

22. Settlement is per Engagement. An Event File has no settlement of its own.
23. An Event File may be operationally complete while an Engagement remains unsettled.
24. A settled Event File may acquire a new Engagement — re-booking after settlement.
25. One Engagement may reference only one Event File; one contract covering two celebrations is two Engagements.

### Boundary

26. The Event File never contains the celebration and may be wrong about it.
27. Correcting the file's recognition is an observation; correcting *which* celebration it recognises is supersession.
28. Client-account standing terms sit **above** the Event File and are out of scope (Framework L343).

---

# Part IV · Reduction pass

### Eliminated — five

| Candidate | Reason | Authority |
|---|---|---|
| **Celebration Anchor** | **We never hold it.** The ontology established it is an identity criterion, not a held object. What we hold is the file's *recognition*, which is composed of Observations and is correctable. Making it first-class would require merging anchors *and* merging files — two operations where one suffices | The ratified ontology |
| **Workspace** | **Workspaces are lenses.** A lens creates no object and owns no truth | Frozen ruling; `R‑13` |
| **Next Action** | **Derived** from Responsibilities, readiness and priority. Were it first-class it could disagree with the responsibilities it summarises — a second authority | Invariant 14 |
| **Timeline** | **Derived.** Append-only plus as-of answerability already yields it. It owns nothing | Invariants 18, 20 |
| **Communication** | **Reduces to Observation + Attachment**, plus — where it carries one — a constitutional act recorded under its own authority. The email evidences the acceptance; it does not constitute it | Invariant 17 |

### Added — three, each proven necessary

| Object | Why irreducible |
|---|---|
| **Supersession Link** | The ratified identity rule requires superseded identities to resolve permanently, and split is one-to-many, so a property cannot express it. Nothing else records that A became B |
| **Event File Link** | Annual series and one party's unrelated simchas must be expressible without containment. Series membership is asserted and cannot be derived |
| **Party** | Independently identified, persists across Event Files, and required by Framework L319 and by linking one client's unrelated simchas |

### Survivors tested and retained

**Attachment** — the weakest survivor, and it survives: it holds content nothing else holds. Neither derivable nor convenience.

**Event** — retained on `OC‑nn`'s structural enforcement, **not** on architectural necessity. Recorded above.

**Observation** — distinct from Responsibility (work, discharged) and from doctrine (Knowledge, cannot be wrong). Knowledge K‑IV.5: truth and authority are different failure modes.

### Not introduced

**Service** as a level distinct from Occurrence. No provision establishes it, and introducing it would invent ontology. *Enumeration* means enumerating Occurrences and Events beneath an Event File.

**Venue** as a new object. Venue is an as-of fact about occurrences and already exists.

---

**Ten objects. Twenty-eight invariants. Nine relationships.**

Every object holds something nothing else holds. Every eliminated candidate was derived, a lens, or a composite. Every invariant traces to ratified law or to the ratified ontology.