# Event File Grain and Identity · Product Architecture

---

# Decision 1 · The constitutional grain of an Event File

## Option A — One Event File per event

**What it represents:** one catered gathering, at one venue, on one date.
**Identity:** the event (today's booking root).

**Advantages.** Matches the existing structure exactly — `OC‑nn` already enforces one event per occurrence, so nothing new is needed. Every file has one date, one venue, one balance. Operationally unambiguous: a chef looking at a file sees one job.

**Disadvantages.** **The simcha becomes invisible.** A wedding with an aufruf and seven sheva brachos is nine unrelated files. Nobody can answer *"how is the Goldstein wedding going?"* — the question has no object. Cross-event facts have no home: the same rented linens moving between Thursday and Sunday, the same captain across the weekend, the total the family has spent. The client experiences one simcha; the system insists there are nine things.

| Downstream | Impact |
|---|---|
| Inquiries | One inquiry spawns nine files immediately, before anything is known |
| Holds | Nine separate options, each expiring independently |
| Bookings | 1:1 with the file. Clean |
| Occurrences | Natural — the existing relation |
| Accounting | Nine balances for one family. Reconciliation is manual |
| Workspaces | Kitchen sees nine jobs and cannot tell they are one weekend |
| Daily Operations | Excellent — the Day axis wants events |
| Scalability | Degrades. The more elaborate the simcha, the more fragmented the picture |

## Option B — One Event File per commercial engagement

**What it represents:** one contract arc with one counterparty.
**Identity:** the engagement.

**Advantages.** Accounting is perfect: one file, one payer, one balance, one settlement. Engagement's ceremonies map one-to-one. Every commercial question has an unambiguous answer.

**Disadvantages — and one is fatal.** **Operations do not care who pays.** The kitchen producing 400 portions is indifferent to whether the aufruf was billed to the bride's father and the sheva brachos to an uncle. Splitting by payer fragments the operational picture along a line operations cannot see.

And the fatal case: **one engagement can cover two unrelated simchas.** A shul contracts a bar mitzvah kiddush and its annual dinner in a single agreement. Under Option B those become one file, which is plainly wrong — they share nothing but a payer.

| Downstream | Impact |
|---|---|
| Inquiries | Fine until a second payer appears |
| Holds | Clean |
| Bookings | Ambiguous when one contract covers several |
| Occurrences | Reachable only through the contract |
| Accounting | Ideal |
| Workspaces | Fragmented by payer — a line operations cannot see |
| Daily Operations | Poor. Must traverse contracts to find today's work |
| Scalability | Fails on multi-payer simchas, which are routine |

## Option C — One Event File per inquiry-to-settlement arc

**What it represents:** the span from first contact to final payment.
**Identity:** the arc.

**Advantages.** Matches PC‑4's wording literally. The boundaries are the natural boundaries of the business process.

**Disadvantages — this is the weakest option, on identity grounds.** **An arc is a duration, not a thing.** Its extent is defined by its endpoints, and one endpoint is in the future. You cannot know the arc's extent until it ends, yet you need the identity on day one.

Worse, the arc is unstable in normal operation: sheva brachos added in month six — new arc or the same one? A second deposit from a second family — one arc or two? Every such question is unanswerable at the moment it is asked.

| Downstream | Impact |
|---|---|
| Inquiries | The arc begins here, but its extent is unknowable |
| Holds | Ambiguous |
| Bookings | Undefined relation |
| Occurrences | Reachable, but through an unstable parent |
| Accounting | Breaks on multiple settlements |
| Workspaces | Unstable membership |
| Daily Operations | Unusable |
| Scalability | Poor — instability compounds |

## Option D — One Event File per celebration (simcha)

**What it represents:** the whole simcha — aufruf, wedding, every sheva brachos.
**Identity:** the celebration instance.

**Advantages.** Matches how clients speak and how the business thinks. Cross-event facts have a home. One place answers *"how is the Goldstein wedding going?"* Post-simcha learning is coherent — the whole occasion is what produced the experience worth extracting.

**Disadvantages.** **Settlement becomes plural.** Sheva brachos hosted by five families means five balances against one file, and PC‑4's *"to settlement"* has no single terminus. Option D alone does not say how commercial reality attaches.

| Downstream | Impact |
|---|---|
| Inquiries | One inquiry, one file. Natural |
| Holds | May cover several events under one file |
| Bookings | Several per file — **a new level above booking** |
| Occurrences | Two levels down |
| Accounting | Unresolved without a further decision |
| Workspaces | Coherent — the weekend is one thing |
| Daily Operations | Requires traversal down two levels |
| Scalability | Strong on operations, unresolved on money |

## Option E — Celebration grain, with engagements as an independent axis

**What it represents:** the Event File is the simcha; commercial engagements attach many-to-one.
**Identity:** the celebration instance. **Settlement is per engagement, not per file.**

**Advantages.** Resolves Option D's single weakness without fragmenting operations. Five sheva brachos hosts become five engagements over one subject; the kitchen sees one weekend, accounting sees five balances, and neither is distorted to accommodate the other.

It also absorbs the case that killed Option B: one contract covering two simchas becomes one engagement referencing two Event Files.

**Disadvantages.** The Event File sits **above** today's booking, so this introduces a level that does not currently exist — the largest structural cost of any option here. And *"is this file settled?"* stops being a single question; it becomes *"are all its engagements settled?"*

| Downstream | Impact |
|---|---|
| Inquiries | One inquiry, one file, engagements added as they arise |
| Holds | Options attach to the file; several may coexist |
| Bookings | Many per file. **New level required** |
| Occurrences | Two levels down |
| Accounting | Clean — per engagement, aggregable to the file |
| Workspaces | Coherent at both grains |
| Daily Operations | Traverses down; needs a direct occurrence→file path |
| Scalability | Strongest. Handles multi-payer, multi-day, partial engagement |

## Option F — Celebration grain with an explicit three-level programme

**What it represents:** Option E, plus a named middle level: Event File → event → occurrence.
**Identity:** the celebration instance; the middle level is a first-class object.

**Advantages.** Wedding weekends and multi-day conferences gain a natural spine. "Sunday" and "Friday night" become addressable rather than implied.

**Disadvantages.** The middle level must earn its existence. If an event is only ever *"the occurrences on one date at one venue,"* it is a derived grouping, not an object — and making it canonical would create a thing whose state could disagree with its occurrences.

| Downstream | Impact |
|---|---|
| Everything | As Option E, plus a third addressable level and a third place a state could diverge |

---

# Decision 2 · Identity continuity, challenged

Assuming celebration grain, the proposed ruling — *identity never changes* — is tested against every scenario.

| # | Scenario | Verdict | Reasoning |
|---|---|---|---|
| 1 | One inquiry becomes many events | **Same file** | The simcha was always the subject; we merely learned its extent |
| 2 | **Two inquiries prove to be one simcha** | **Merge — supersession** | **Challenges the ruling.** Bride's side and groom's side both call. Two files exist and must become one |
| 3 | **One file proves to be two simchas** | **Split — supersession** | **Challenges the ruling.** "Catering in June" turns out to be a wedding and an unrelated corporate dinner |
| 4 | Recurring annual event | **New file each year, linked** | The simcha is the instance, never the series. The 2027 gala is not the 2026 gala in a later state |
| 5 | Cancelled, then re-booked for a new date | **Same file** | The same wedding. Cancellation ended bookings, not the celebration |
| 6 | Cancelled and settled, re-booked a year later | **Same file, new engagement** | Under Option E the commercial arc ended; the subject did not. This case alone justifies separating the axes |
| 7 | Venue change | **Same file** | Venue is a fact about the event, held as-of |
| 8 | Date change | **Same file** | Same reason |
| 9 | Multiple ceremonies in one day | **Same file, same event** | Occurrences within a day |
| 10 | Corporate multi-day conference | **Same file** | One occasion across days |
| 11 | Wedding weekend | **Same file** | One occasion across days and venues |
| 12 | **Sheva brachos, different hosts each night** | **Same file, several engagements** | The decisive routine case. One simcha, many payers |
| 13 | We cater only 3 of 7 nights | **Same file, three events** | The file is our engagement footprint on the simcha; nights we do not cater are simply absent |
| 14 | One contract, two unrelated simchas | **Two files, one engagement** | Kills Option B; confirmed under E |
| 15 | Inquiry that never converts | **File exists, never released** | A normal terminal state |

## What scenarios 2 and 3 prove

The proposed ruling was **too strong**. Merge and split are real and routine, and no lifecycle rule prevents them.

But look at what they actually are. **Every lifecycle transition — inquiry, option, offer, acceptance, release, operation, settlement, archive — leaves identity untouched.** Merge and split are not lifecycle transitions. They are **corrections of a mis-identification**: we believed there was one simcha and there were two, or two and there was one.

That distinction is the ruling:

> **No lifecycle transition changes an Event File's identity. Only the correction of a mis-identification does — and that is supersession, not mutation.** The superseded identity is retained and remains resolvable, redirecting to its successor.

Nothing is rewritten and nothing is lost. Anyone holding the old identity — a printed sheet, a link, an invoice — still arrives at the right file.

## Structural rules that follow

- **One file, many events** — the normal internal structure.
- **One file, many engagements** — the normal commercial structure.
- **Linked files** — for series (annual events) and for one client's unrelated simchas. A link is a relation, never a containment.
- **Superseded files** — merge and split only.
- **No parent/child Event Files.** Two files where one contains the other would make it ambiguous which owns a fact. Containment belongs *inside* a file, never between files.

---

# Recommendations

## 1 · Recommended grain: **Option E — celebration grain, engagements as an independent axis**

**The Event File is one simcha. Commercial engagements attach to it many-to-one.**

The decisive argument is scenario 12, which is not an edge case in this business but a weekly occurrence. Sheva brachos with different hosts is one celebration and several payers. Every option that binds the file to money fragments the operational picture along a line operations cannot see; every option that binds it to a single event makes the simcha invisible.

Option E is the only model where the kitchen sees one weekend and accounting sees five balances **without either view being distorted for the other's convenience**.

Against Option F: do not make the middle level canonical yet. If an event is only *"the occurrences on one date at one venue,"* it is a derived grouping. Let it stay derived until something needs to be true of it that is not true of its occurrences.

**The cost, stated plainly:** the Event File sits above today's booking. This is a new level, and it is the most expensive thing in this recommendation.

## 2 · Recommended identity continuity rule

> **An Event File's identity is fixed for its entire life. No lifecycle transition — option, offer, acceptance, release, operation, cancellation, settlement or archival — may change it.**
>
> **Identity changes only when a mis-identification is corrected, by merge or by split. Both are supersession: the superseded identity is retained permanently and continues to resolve, redirecting to its successor. No identity is ever reused, and none is ever deleted.**

## 3 · Edge cases future implementation must satisfy

**Identity**
1. Two files merge; both prior identities resolve to the survivor, permanently.
2. One file splits; the prior identity resolves to a disambiguation, not a guess.
3. A superseded identity never resolves to nothing, and is never reused.
4. Merge of files with engagements on both sides preserves every balance.
5. Split with engagements attached requires each engagement to be assigned; none may be orphaned.

**Structure**
6. A file with several events across several dates and venues.
7. A file where we cater a subset of the occasion; uncatered parts are simply absent, never modelled as gaps.
8. A file with no events yet — inquiry only.
9. A file that never converts and terminates unreleased.

**Commercial**
10. Several engagements over one file, with independent balances and independent settlement.
11. A file that is operationally complete while one engagement remains unsettled.
12. A file that is fully settled while a later engagement is added — re-booking after settlement.
13. One engagement referencing two files.

**Lifecycle**
14. Cancellation of some events while the file stays live.
15. Cancellation of every event without terminating the file.
16. Re-booking after full cancellation and settlement, on the same file.
17. Date and venue changes, with prior values answerable as-of.

**Series and linkage**
18. Annual recurrence as linked files, never one file.
19. One client's unrelated simchas linked by client only.
20. A link never implies containment and never transfers ownership of a fact.

**Archival**
21. An archived file remains fully answerable and is absent only from the default view.
22. An archived file that is re-opened by a new engagement.

**Two decisions remain yours:** whether to accept celebration grain and its new level above booking, and whether to accept supersession as the sole permitted identity change. Both are recorded above as recommendations, not assumptions.