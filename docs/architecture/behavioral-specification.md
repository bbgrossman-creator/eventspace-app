# EventCore · Canonical Behavioral Specification

**Structural note derived before anything else.** The persistence model stores no current state; every object is an immutable identity plus append-only fact streams. Therefore **the set of behavioral events is exactly the set of appendable fact types.** An event that appends nothing does not exist, and a state that no event appends cannot be observed. This constrains every section below and is the reason the reduction in Part V cuts so deeply.

---

# Part I · Canonical behavioral events

**Fifteen defined here. Ten inherited from the Engagement Constitution and not redefined.**

## Creation events — four

| Event | Creates | Notes |
|---|---|---|
| **Recognise Event File** | Event File identity | Must precede any fact about the file. An Atlas fact-recording, **never an Engagement ceremony** |
| **Recognise Party** | Party identity | Must precede any observation about the party — an observation requires an identified subject |
| **Create Occurrence** | Occurrence identity, **and its Event where none is named** | Event is never created independently; see Part V |
| **Attach Content** | Attachment identity | Content only. Asserts nothing |

## Observation events — one

| Event | Effect |
|---|---|
| **Record Observation** | Appends a claim about a subject, by an observer, at a moment |

**One event covers every correction in the system.** An Event File's name, honoree, date and principal party; a party's composition and contact; a venue's dock hours; a client's dietary constraint — all are Record Observation, differing only in subject and predicate. There are no per-attribute change events, because no attribute is stored.

## Engagement ceremonies — ten, inherited

Grant Option · Withdraw Option · Issue Offer · Revise Offer · Withdraw Offer · Accept · Decline · Rescind · Raise Account Obligation · Apply.

**The first undertaking act — an option granted or an offer issued — creates the Engagement.** There is no separate creation event; see Part V.

## Operational events — six

| Event | Effect | Refuses? |
|---|---|---|
| **Release** | Converts an accepted undertaking into internal work. **Responsibilities come into existence as its consequence** | Yes |
| **Assign Responsibility Owner** | Appends an ownership fact — owner, actor, moment | Yes |
| **Record Evidence** | Appends evidence toward a responsibility's discharge | Yes |
| **Record Exception** | Appends an exception against a responsibility | Yes |
| **Record Occurrence Fact** | Appends an as-of fact — venue binding, scheduled window | No |
| **Cancel Occurrence** | Appends a cancellation | **Yes** — refuses a released occurrence |

## Reassignment event — one

| Event | Effect |
|---|---|
| **Reassign to Event File** | Appends a new Event File assignment for an Engagement, Event or Responsibility. Principal cause is split; also corrects a mis-attachment |

## Supersession event — one

| Event | Effect |
|---|---|
| **Record Supersession** | Appends that one Event File identity is superseded by one or more successors. **The only event that changes identity resolution** |

## Link events — one

| Event | Effect |
|---|---|
| **Record Link Fact** | Asserts or retracts a relation between two Event Files. Retraction is a further fact, never an erasure |

## Archival event — one

| Event | Effect |
|---|---|
| **Record Archival** | Appends an archival or re-activation fact. **Changes presentation, never truth** |

---

# Part II · Object behavior

## Event File

| | |
|---|---|
| **Created by** | Recognise Event File |
| **Attached to by** | Record Observation · every Engagement ceremony (through its Engagement) · Create Occurrence (through its Event) · Release · Attach Content · Record Link Fact · Reassign to Event File |
| **Observable state changed by** | **Nothing directly.** It has no state. Everything observable about it is composed from the objects beneath it or derived from its observation stream |
| **Superseded by** | Record Supersession — merge or split |
| **Never affected by** | Any event on another Event File except a supersession naming it · anything in Knowledge · archival, which changes no truth |

**Lifecycle behavior**

```
Recognition
  → Observations accumulate (name, honoree, date, principal party — all correctable)
  → Engagements attach and detach independently
  → Occurrences created; Events come into being beneath them
  → Release derives Responsibilities
  → Operations produce evidence and exceptions
  → Engagements settle, independently of one another
  → Archival (reversible, presentation only)
  → Supersession (merge or split) — the only exit from its own identity
```

**The file is never "completed."** It has no terminal state of its own: completion is per Engagement and per Occurrence, and the file composes what they report.

## Party

**Created by** Recognise Party. **Attached to by** Record Observation; named as counterparty by Engagement ceremonies; named as principal by observation. **State changed by** nothing — all attributes are observations. **Superseded by** — **structure not ratified; see the open item carried forward from persistence.** **Never affected by** operational events, which never concern a party.

```
Recognition → Observations accumulate → participates in Engagements and Event Files → persists indefinitely
```

## Engagement

**Created by** the first undertaking act — Grant Option or Issue Offer. **Attached to by** the remaining nine ceremonies; Reassign to Event File. **Observable state changed by** its own ceremonies only. **Superseded** — never. *Offer revision supersedes the instrument; the Engagement's identity is stable across every revision.* **Never affected by** operational events, observations, occurrence facts, or anything concerning work.

```
Option granted ─┐
                ├→ Offer issued → revised → Accepted → Released → Account raised → Applied → Settled
Offer issued ───┘                        ↘ Declined / Withdrawn / Lapsed
                                          ↘ Rescinded (work already released survives)
```

**The decisive behavior:** rescission after release discharges the undertaking and does **not** unmake the work. Engagement and work have different lifetimes over one file.

## Event

**Created by** Create Occurrence, implicitly, where no existing Event is named. **Attached to by** Create Occurrence. **State changed by** nothing — its date and venue are derived from its occurrences; its lifecycle and readiness compose upward. **Superseded** — never. **Never affected by** Engagement ceremonies or observations.

```
Comes into being with its first Occurrence → gains and loses Occurrences → composes their lifecycle and readiness → never independently cancelled or completed
```

## Occurrence

**Created by** Create Occurrence. **Attached to by** Record Occurrence Fact · Release · Cancel Occurrence · responsibilities attaching at its grain. **Observable state changed by** — nothing stored. Its **phase** is determined by release, cancellation and the discharge of its responsibilities; its **readiness** composes from its departments. **Superseded** — never; cancelled instead. **Never affected by** Engagement ceremonies directly — only through Release.

```
Created → venue bound, window set (as-of, revisable)
        → Released (phase changes) → Responsibilities operate
        → Settled, as its responsibilities discharge
        ↘ Cancelled — refused once released
```

## Responsibility

**Created by** — **no independent event.** It comes into existence as the **consequence of Release** and of other causes governed by the Dependency Map. **Attached to by** Assign Responsibility Owner · Record Evidence · Record Exception · Reassign to Event File. **Observable state changed by** — nothing stored; `responsibility_state` is the sole authority at this grain and is computed as of a moment. **Superseded** — as a derived state, never a stored flag. **Never affected by** archival, links, or another responsibility's events.

```
Derived → Owner assigned (and reassigned, append-only)
        → Evidence recorded → Exception recorded
        → Discharged | Lapsed | Superseded | Voided — all derived, none recorded as a flag
```

## Observation

**Created by** Record Observation. **Attached to by** nothing — it is immutable on creation. **State changed by** nothing, ever. **Superseded by** a later observation about the same subject and predicate, **derived by recency; no pointer is written**. **Never affected by** anything at all — this is the only object in the system that is entirely inert after creation.

```
Recorded → (silently ceases to be current when a later observation about the same subject and predicate exists) → answerable forever
```

## Attachment

**Created by** Attach Content. **Attached to by** nothing; it is referenced, never referencing. **State changed by** nothing. **Superseded by** a successor carrying the pointer — the predecessor is never touched. **Never affected by** anything it evidences.

## Supersession Link

**Created by** Record Supersession. Immutable thereafter. **Superseded by** a further supersession — a link recorded in error is corrected by another, never deleted. **Never affected by** anything in either file.

```
Recorded → resolution follows the chain transitively, forever
```

## Event File Link

**Created by** Record Link Fact (assert). **Attached to by** Record Link Fact (retract). **Never redirects identity** under any circumstance.

---

# Part III · Derived projections

**Every projection below owns no truth and is entirely derivable.** None may store a value; each is computed as of a moment.

| Projection | Contributing objects | Contributing facts | Owns truth? | Entirely derivable? |
|---|---|---|---|---|
| **Current Event File** | Event File, Observation, Engagement, Event, Occurrence, Responsibility | Observation stream · engagement facts · composed lifecycle and readiness · archival stream | **No** | **Yes** |
| **Current Engagement** | Engagement, Party | The ten ceremonies' facts | **No** | **Yes** |
| **Readiness** | Responsibility, Occurrence, Event, Event File | Responsibility state at each grain | **No — composition carries no independent rule** | **Yes** |
| **Lifecycle** | Occurrence, Event, Event File, Engagement | Release · cancellation · discharge · settlement | **No** | **Yes** |
| **Timeline** | All | Every fact, ordered by moment | **No** | **Yes** — append-only plus as-of already yields it |
| **Next Action** | Responsibility | State · readiness · priority | **No** | **Yes** |
| **Daily Operations** | Responsibility, Occurrence, Event | State · window · owner · role | **No** | **Yes** |
| **Kitchen Workspace** | Responsibility, Occurrence | Same, filtered by department | **No** | **Yes** |
| **Accounting Workspace** | Engagement, Party | Engagement facts, aggregated | **No** | **Yes** |
| **Identity Resolution** | Event File, Supersession Link | Supersession chain | **No** | **Yes** |

---

# Part IV · Behavioral invariants

1. Every event is an append. **No event edits or deletes.**
2. Every event carries an actor and a moment.
3. **No event changes an identity.** Only Record Supersession changes identity *resolution*.
4. No event on one object mutates another object's facts. Facts have exactly one owner.
5. **Ceremonies may refuse; observations never refuse.** Recording what we saw cannot be forbidden.
6. **A refusal appends nothing.** Failure leaves the system byte-identical to its state before the attempt.
7. **An observation never constitutes an act.** It may evidence one. A document that appears to state a term does not create one.
8. **Release is the only event that crosses from Engagement to Atlas.**
9. **Rescission does not unmake work.** The undertaking discharges; released work persists.
10. Every projection is deterministic as of a moment: the same facts and the same moment yield the same answer, forever.
11. **Cancellation is not deletion.** A cancelled occurrence remains answerable.
12. **Archival changes no truth.** An archived file answers every question it answered before.
13. Events append facts; **projections derive values. No event outputs a derived value**, and no projection appends a fact.
14. An event naming a superseded identity is recorded against the identity named and **resolves forward** to its successor. Refusing it would break the promise that superseded identities resolve forever.
15. **No event creates an Event File except Recognition**, and Recognition is never an Engagement ceremony.
16. A composed verdict never contradicts the grounds it reports, because it has no rule of its own.

---

# Part V · Reduction pass

## Events eliminated — six

| Eliminated | Why | Authority |
|---|---|---|
| **Create Event** | An Event has 1..n Occurrences — minimum one — so it never exists without an occurrence. **It comes into being with its first Occurrence** | Object model cardinality |
| **Open Engagement** | The Engagement's lifetime begins *"from the first undertaking act."* A separate creation event would append nothing the ceremony does not | Object model, Engagement lifetime |
| **Derive Responsibility** | Never independently invoked. It is the **consequence** of Release and of other Dependency-Map-governed causes, not an act someone performs |注 |
| **Bind Venue** / **Set Window** | Structurally identical as-of facts: same authorship, same correction, same supersession by recency, neither refuses. **Merged into Record Occurrence Fact** | The Knowledge Article III merge criterion — *"five kinds, one species"* |
| **Record Occurrence Status** | Phase is determined by Release, Cancellation and the discharge of responsibilities. A separate status event could disagree with them — a second authority | Invariant 16 |
| **Archive / Unarchive as two events** | One fact type with a direction | — |

> **注 · Recorded gap, not filled.** The object model permits Responsibilities at Event File grain — work existing before release. Of the derivation causes, **only Release is named in the ratified corpus available to me.** Other causes are governed by the Dependency Map and are not enumerated here. Pre-release responsibility derivation cannot be specified until those provisions are read.

## Projections eliminated — four, by generalisation

Kitchen Workspace, Accounting Workspace and Daily Operations are not distinct projections. **They are the same projection under different parameters** — responsibilities selected by grain, owner, period and role. Workspaces are lenses; a lens is a parameter, not a projection.

Timeline reduces to the as-of projection evaluated across moments. Next Action reduces to selection plus ordering.

**Five irreducible projection kinds remain:**

| Kind | What it answers |
|---|---|
| **As-of** | What is true of this object at this moment |
| **Responsibility state** | The sole authority at responsibility grain |
| **Composition** | Readiness and lifecycle, composed upward without independent rules |
| **Identity resolution** | Which identity this one resolves to, following supersession transitively |
| **Selection** | Which responsibilities match a grain, owner, period and role, in what order |

Every named projection in Part III is one of these five, parameterised.

## Behavioral rules eliminated — three

- *"Observations are superseded by later observations"* — not a rule but a **consequence** of storing no pointer and deriving currency by recency.
- *"Nothing is deleted"* — a consequence of every event being an append. Invariant 1 subsumes it.
- *"Archived files remain answerable"* — a consequence of invariant 12 plus append-only. It was a restatement.

## One finding recorded against a frozen document, not acted upon

**The Supersession Link's `kind` field is derivable.** A merge has exactly one successor; a split has more than one. Under the standing rule that derived attributes are never stored, it should not be persisted.

**The persistence specification is frozen and stores it.** Acting on this would require a constitutional reopening ruling. It is recorded here and left alone.

---

**Fifteen events defined, ten inherited. Ten objects. Five projection kinds. Sixteen behavioral invariants.**

Every eliminated event was a consequence, a duplicate shape, or a second authority. Every eliminated projection was a parameterisation. Every eliminated rule restated another.