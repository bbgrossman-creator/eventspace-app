# EventCore 1.0 — Product Architecture
## How humans should experience the Responsibility engine
### FROZEN as Product Architecture 1.0 (July 24, 2026)

*Frozen by the owner as the product north star — not immutable law like the
constitutional documents, but the standing reference every UI decision is
tested against. Changes by revision with rationale. Companion:
APPLICATION_SHELL_IA.md (frozen together). Open refinements recorded there,
§14.*

**Standing.** Product architecture, not implementation. The constitutional stack
(Truth → Event → Relationship → Offer → Acceptance → Execution →
Responsibilities → Ownership → Projection) is fixed and is not reopened here.
This document answers one question: *if EventCore were introduced to the world
today, how should the complete application work?* It is opinionated on purpose,
and it grounds its critique in the actual shipped surface — the 34 routes,
the Sidebar, the five lenses — not an imagined one.

---

## 1 · The thesis

EventCore's engine now answers two different questions, and the product must
stop pretending they are one.

The first question is **"what have we promised?"** — inquiry, proposal,
negotiation, acceptance. It is engagement-shaped. One customer, one date, one
evolving design, one paper trail. The Event Studio was built for this question
and is genuinely good at it.

The second question is **"what must happen, and is it happening?"** — the
derived work across every accepted event, flowing through departments, owned by
people, moving through a day. It is *not* engagement-shaped. A kitchen manager
on Thursday does not think in bookings; she thinks in prep for Sunday's three
events at once. A driver thinks in routes. The owner thinks in *today*.

Today's product organizes everything around the first question. Every
operational surface hangs off `/bookings/[id]`. That was the right scaffolding
while the engine was being built commitment-first. It is the wrong front door
for the operating system the engine has become.

**The core product decision of 1.0:** the application has two centers of
gravity — **the Engagement** (selling and shaping a promise) and **the Day**
(keeping promises across all engagements) — connected by a third axis, **the
Department**. All three are projections of the same records; the constitution
guarantees that. Navigation, landing pages, and mobile are organized around
which question the person in front of the screen is actually asking.

One sentence to hang the whole product on: **the Studio is where you make the
promise; Operations is where you keep it; the Library is where keeping it
teaches you to promise better.**

---

## 2 · Top-level organization

Five spaces plus administration. Fewer than today's sidebar, deliberately.

| Space | Question it answers | Primary users |
|---|---|---|
| **Pipeline** | Who is asking, and what have we offered? | Sales, owner |
| **Events** | What have we promised, engagement by engagement? | Planners, owner |
| **Operations** | What must happen today/this week, and is it happening? | Everyone operational |
| **Library** | What do we know how to do? | Planners, chefs, owner |
| **Resources** | Who and what do we have, and when? | Ops director, staffing, warehouse |
| *Admin* | Configuration, users, brand, policies, money settings | Owner, office |

What this absorbs from the current 34 routes: `/bookings` and `/customers`
fold into Pipeline + Events; `/blueprints`, `/blueprint-shelf`, `/templates`,
`/package-guides`, `/price-book`, `/sop`, and the operational profiles all fold
into **Library** as one coherent knowledge space (they are today three-and-a-half
different answers to "reusable knowledge," which is the clearest symptom of
slice-shaped accretion); `/staff`, `/venues`, `/vendors`, `/locations` fold
into **Resources**; `/calendar` stops being a page and becomes the *time axis*
available inside every space; `/dashboard` is replaced by Operations Today;
`/rolodex` — a route name that survived the constitutional vocabulary sweep —
is retired outright.

`/component-basis/[id]` and `/operational-profiles` do not appear in 1.0's
navigation at all. They were certification surfaces — the product equivalent of
exposed rebar. Their content lives inside Library (a component's page shows its
operational profile) and inside an event's component detail. Keeping them as
top-level routes teaches users the database schema instead of the business.

---

## 3 · The engagement lifecycle, phase by phase

**Inquiry → Qualification.** Lives in Pipeline. An inquiry is a lightweight
record: who, roughly when, roughly what, roughly how many. The product's job
here is speed-to-first-conversation, not data completeness. Qualification is a
posture change, not a form: the moment a date is being seriously discussed, the
inquiry gains a *date claim* visible on the Resources time axis — because in
kosher catering the date **is** the inventory. Double-claims on a Sunday in
season should be visible from the first phone call, not discovered at proposal
time.

**Proposal → Negotiation.** The Event Studio, in **Design posture** — the
product's strongest existing muscle, kept essentially as-is: Design Stage,
lenses, Library pulls, versioning, the Paper. Negotiation is version threads;
each round is a version, each version can be published to the customer surface.
Nothing here changes structurally; what changes is that the Studio stops being
the *whole product* and becomes the best room in a larger building.

**Acceptance.** The constitutional hinge, and the product should stage it like
one. Acceptance seals the design (embedded basis, v284 law) and — this is the
product moment — **derivation runs and the work appears.** The acceptance
screen should show it happening: "This promise creates 47 responsibilities
across 5 departments." That single reveal teaches every user the product's
mental model better than any onboarding: *promises become work, automatically,
with provenance.*

**Planning.** The Studio flips to **Command posture** for that event. Same
room, different furniture: the design is read-only-with-amendment-ceremony
(changes are new versions with re-derivation, superseding work visibly — never
silent edits), and the center of the screen becomes the event's responsibility
board: what's derived, what's owned, what's ownerless (visible debt, O-3),
what's blocked, what's at risk. Planning *is* the act of driving ownerless to
owned and blocked to ready.

**Execution → Daily Operations.** Gravity shifts from the event to the day.
Detailed in §5.

**Completion → Post-event review.** Closing an event is a ceremony, not a
status flip: evidence complete? exceptions reviewed? lapses acknowledged? Then
the **Debrief** — which the codebase already gestures at (`DebriefCard`) —
becomes the doorway to Knowledge: "this event went well; promote its design /
its staffing pattern / its pack list deltas to the Library." Review is where
execution truth becomes candidate knowledge.

**Historical search & reuse.** Every closed event is permanently searchable —
not as nostalgia but as precedent: "last time we did a 300-person chasunah at
that venue, what did we actually pull, and what did we run short on?" The
answer exists in evidence; the product must make it one search away.

---

## 4 · Event Studio: one room, two postures

Should the Studio remain the center? **No — and it shouldn't be demoted
either.** It remains the center *of the engagement*, one of three centers of
the product. The critical design ruling is the **posture change at
acceptance**:

**Design posture (pre-seal).** Authoring: stage, lenses, palette, pricing,
paper, publish. Optimized for shaping and persuading.

**Command posture (post-seal).** The same event, now a commitment: sealed
design as reference, responsibility board as the working surface, amendment as
ceremony. The lens rail persists — Production, Photography, Customer,
Operations — because lenses were always projections and now they project
derived work too.

Why one room and not two products: continuity of context. The planner who
shaped the promise walks into the same room to keep it, and everything she sees
post-seal traces to what she drew pre-seal. Two separate applications would
sever the provenance the constitution worked so hard to preserve.

---

## 5 · Daily Operations

**Yes — Operations Today is the default landing page for every operational
role.** The dashboard dies; the day replaces it.

The morning question sequence it must answer, in order, above the fold:

1. **What is happening today?** Events in motion, with stage and readiness.
2. **What is mine?** The person's owned responsibilities, in state order:
   Active first, then Standing about to activate, then anything of theirs
   Blocked.
3. **What is nobody's?** Ownerless Derived work relevant to my department —
   the visible-debt list. This list is the product's conscience; it must never
   be hidden behind a filter default.
4. **What is at risk?** Lapse-approaching windows, staleness findings (v282),
   blocked chains whose dependencies haven't moved.
5. **What changed since I last looked?** Supersessions, amendments,
   re-derivations — the diff of truth.

Structure: a **Today** view (the above), a **Week** view (the same projections
over the operating week — and in this business the week has a shape: Sunday
peaks, Thursday–Friday crunch, Shabbos blackout; the time axis should
understand the Jewish calendar natively, including the six-period fiscal
rhythm, not treat it as an exotic locale), and the **Day Sheet** — a printable,
truck-taped projection, because paper on a warehouse door is also a lens.

Every check, scan, and photo captured here is evidence, and the interface says
so quietly: not "task complete ✓" but "recorded — brisket rubbed, 9:41, Moshe."
The vocabulary ruling applies: users see *My Work* and *Today*, never
"responsibility projection," while the substance underneath is exactly that.

---

## 6 · Department workspaces

Each is a lens with the department's own language (per the vocabulary ruling),
the same anatomy underneath: **queue (state-ordered) · ownerless debt ·
evidence capture verbs · the day/week axis · cross-links to events.**

**Kitchen — "Prep."** Sees culinary responsibilities across all events,
grouped by prep day and station, quantities aggregated (aggregation is
projection, X-3 — regrouping by station never creates work). Verbs: *made*,
*short*, *substituted* (an exception fact, which is how the chef talks to the
record honestly). Kosher reality is first-class: meat/dairy separation is a
grouping dimension, not a tag.

**Warehouse — "Pulls."** Pull sheets by event and consolidated by day.
Verbs: *pulled*, *staged*, *loaded*, *short*. A consolidated commitment ("one
pull for Sunday's three events") is an attestation-derived responsibility,
dependency-linked — the X-3 example made into a button.

**Logistics — "Routes."** Departures, vehicles, drivers, windows, venue access
constraints projected from venue knowledge (v280/281). Verbs: *departed*,
*arrived*, *unloaded*, *returned*. The staleness surface matters most here:
a venue-knowledge correction shows as a finding on affected routes, never as a
silent change.

**Staffing — "Roster."** Coverage derivation (v278) presented as seats:
filled, open (ownerless debt in its most literal form), confirmed, checked-in.
Assignment is the ownership ceremony wearing work clothes.

**Venue.** Site requirements, walkthrough findings, access windows, floor
setup responsibilities. The binding surface (v281) lives here in product form.

**Purchasing.** Derived shortfalls (needs minus inventory once Resources land)
become buy responsibilities; verbs: *ordered*, *received*, *short*.

**Floral / Photography.** Thin lenses over the same engine — photography
already exists as a lens key and simply gains its derived work (shot lists as
responsibilities anchored to the design). These prove the department model
scales down: a department workspace can be one screen without being a special
case.

**Finance Operations — "Collections."** Deposits, balances, terms — derived
from acceptance truth, execution-side. Explicitly distinct from the Finance
design lens (design-money law untouched, X-6). Verbs: *invoiced*, *received*,
*reconciled*.

**Administration.** The office's cross-department view: everything ownerless,
everything lapsed, everything awaiting a ceremony.

**Moving between event-centric and department-centric work** is the product's
signature move and must be one gesture everywhere: every responsibility shows
its event chip (tap → that event's Command posture) and its department chip
(tap → that department's queue, scrolled to it). Two chips, one engine, zero
re-orientation cost.

---

## 7 · Roles: one application, different front doors

Same engine, same records, different landing and different density. Not
different apps — different *entry points and defaults*, because provenance and
cross-links only work if everyone is in the same building.

| Role | Lands on | Sees by default |
|---|---|---|
| Owner | Operations Today (all departments) | Everything; density high; money visible |
| Operations Director | Operations Today | All departments, ownership debt first |
| Event Planner | Events (their portfolio) | Their engagements + Command boards |
| Sales | Pipeline | Inquiries, proposals out, dates claimed |
| Kitchen / Warehouse / Driver | Their department's Today | Their queue + their debt list |
| Office staff | Administration | Ceremonies pending, collections, lapses |
| Temporary staff | Mobile: My Work only | Their assignments, check-in, evidence capture |
| Photographer | Photography lens (mobile-friendly) | Shot list, schedule, venue notes |
| Bookkeeper | Collections + exports | Money facts, read-mostly |
| **Customer** | The customer surface | The Paper, their status page, payments |

The customer deserves emphasis: they never see EventCore. They see **their
event** — the published Paper, a tasteful status page projected from truth
("menu finalized · staffing confirmed · final payment due Jan 14"), and a
payment surface. The customer page is the most disciplined projection in the
product: it proves the projection model by showing how little of the engine a
lens needs to expose.

---

## 8 · Navigation philosophy

**Navigate by question, not by table.** The five spaces are the five questions
(§2). Within them, three axes recur everywhere — **Engagement, Time,
Department** — and any object can be reached along any axis it participates
in. That's not a navigation gimmick; it is the constitution's projection model
made spatial. The reason this works *only* for EventCore is R-13: because
presentation can never create or destroy work, the product can afford to show
the same records along three axes without any risk of the axes disagreeing.

Universal search (§11) is the fourth navigation and the escape hatch from all
hierarchy. The rule of thumb for every screen: a user should reach any related
record in one tap and should always be able to answer "why does this exist?"
in one more (provenance is a UI feature, not a schema feature).

---

## 9 · Knowledge (Library)

One space, three shelves, one loop.

**Components** — the operational profiles made human: what this station is,
what it needs, how it scales, its revision history. **Blueprints** — whole-event
designs worth repeating (today's three overlapping template surfaces merge
here). **Playbooks** — the SOP content, attached to the components and
departments they govern rather than orphaned at `/sop`.

**The loop is the product:** execution evidence → debrief → *promotion
ceremony* → new immutable revision → next proposal pulls it → next event
executes it → evidence again. Promotion is a human ceremony with provenance
("promoted from the Klein bar mitzvah, Feb 2026 — pack list adjusted +2
chafers"), because knowledge that remembers where it came from is knowledge
people trust. AI drafts promotions constantly (§13); humans promote.

Searching prior work is precedent search, not file search: filter by venue,
size, season, event type; results show what was *designed* next to what
*actually happened* (the design/evidence diff is the most valuable screen in
the Library and doesn't exist today).

---

## 10 · Resources

When Resources become constitutional objects, the product treats them as **the
supply side of the same ledger**: responsibilities are demand; resources are
supply; the calendar is where they meet.

Every resource — person, vehicle, room, equipment class, inventory item — gets
an identity page (facts, availability, history) and appears on the time axis.
The product moments that matter: **feasibility at proposal time** ("this date
already carries 2 events; you have 1 truck") surfaced *in the Studio* while
selling, because the cheapest conflict is the one caught before the promise;
**conflict as truth-finding**, never silent rebalancing — a double-claim is a
visible finding requiring a human ceremony to resolve; and **capacity as a
projection over the week**, not a separate planning module.

Time and space are resources too — the date-claim from §3 is the first
resource feature the product should ship, because in this business dates are
the scarcest inventory of all.

---

## 11 · Universal search

Type anything: a customer, an event, a menu item, a truck, a responsibility, a
staff member, a venue, an amount, a date. Results group by object family, each
result carrying its **state and axis chips** — an event shows stage and date; a
responsibility shows state, owner, department; a component shows current
revision and last use. Search is also the command line: `sunday pulls`,
`ownerless staffing`, `klein invoice` — queries resolve to projections, and the
"why does this exist" provenance trail is reachable from any result.

Search earns its keep in this product for a constitutional reason: everything
has provenance, so search can *rank by relationship* — "spicy tuna" finds the
component, then the events that used it, then the evidence where it ran short —
which no bolt-on search over a conventional schema can honestly offer.

---

## 12 · Mobile

Mobile is **capture-first, not browse-first.** The phone is where evidence
enters the record; the desktop is where projections get studied.

Kitchen: today's prep queue, big verbs, quantity confirm, photo attach, offline
tolerance. Warehouse: pull sheet with scan-first interaction; *short* is one
tap because honesty must be cheaper than fudging. Drivers: route, departure/
arrival capture, venue access notes, signature; must function in a loading dock
with one bar of signal — capture locally, sync as facts, never lose an
attestation. Setup crews and temps: My Work only — assignments, check-in,
done/exception, nothing else visible. Owner: the Today brief plus the ability
to perform ceremonies (approve, transfer, adopt) from a phone, because owners
run Sundays from the floor, not from a desk.

One deliberate asymmetry: mobile can capture evidence and perform ceremonies;
it does not author designs. The Studio stays a desktop room.

---

## 13 · A day in the life

**Owner, 6:40 a.m.** Phone: the AI morning brief (a labeled projection) —
two events today, one ownerless logistics item, one collection at risk,
weather note for the outdoor chuppah. Adopts the recommended transfer to
Moshe with one tap (his ceremony, AI's suggestion). Coffee.

**Kitchen manager, 7:15.** Prep queue for Sunday, grouped by station.
Aggregated quantities across both events. Records *made* as stations finish;
records one *short* (salmon) which surfaces instantly as a purchasing
responsibility and a finding on both affected events.

**Warehouse, 10:00.** Consolidated Sunday pull, commits to it (attestation),
stages by truck. Two *shorts* become buy-or-substitute decisions routed to the
ops director's ceremony queue.

**Planner, 11:30.** Portfolio view: one engagement awaiting acceptance, one in
Command posture with a guest-count amendment — reviews the re-derivation diff
("+4 staffing seats, +1 table pull, superseded 2") and confirms. The diff *is*
the amendment UI.

**Salesperson, 2:00.** Pipeline: new inquiry for a June Sunday — date axis
shows it's the third claim on that date; flags feasibility before quoting.
Publishes a revised Paper for the Steins; the version thread carries the
negotiation.

---

## 14 · AI: the first reader, never the writer of record

The constitution fixed AI's lane (R-10); the product's job is to make that
lane *valuable*. AI in EventCore 1.0 is ambient and labeled:

the **morning brief** (per-role synthesis of Today); **drafting** everywhere
authoring exists — proposal language, amendment summaries, debrief drafts,
promotion candidates ("this staffing pattern differs from the Library; promote
it?"); **prioritization** as suggested ordering the user can accept or ignore;
**precedent answers** in search ("last three events at this venue averaged 40
minutes longer load-out — plan the truck accordingly," with citations to the
evidence). Every AI artifact wears its provenance badge, every adoption is a
human ceremony, and the product never shows AI output where a user could
mistake it for the record. The trust posture to build toward: users treat AI
text like a sharp junior's memo — read eagerly, signed only by a human.

---

## 15 · Critique of the current product

Honest, structural, grounded in the shipped tree:

1. **The route map is a migration diary, not a product.** 34 routes shaped
   like the slices that built them. `/component-basis/[id]` and
   `/operational-profiles` are certification rebar promoted to navigation.
   `/blueprints`, `/blueprint-shelf`, and `/templates` are three answers to one
   question. `/rolodex` survives in the URL despite the constitutional rename
   to Library — vocabulary drift fossilized in navigation.
2. **There is no "today."** No route, no surface, no landing answers the
   operational question the engine now exists to answer. `/dashboard` is a
   status page, not a day. This is the single largest gap between the engine's
   capability and the product's expression of it.
3. **Everything operational routes through the event.** Department-centric and
   time-centric work — how most staff actually think — has no front door.
   `OpsWorkspace` exists as a component, not as a place.
4. **Ownership is invisible.** The engine now proves at-most-one-owner with
   total history; the UI shows none of it. The ownerless-debt list — the
   product's conscience — has no surface anywhere.
5. **`TodoPanel` is a constitutional hazard in waiting.** It predates R-5.
   Whatever it stores or implies must be re-founded as a projection before it
   quietly becomes a task table with a UI.
6. **The knowledge loop has no doorway.** Promotion exists as capability
   (`PromoteToBlueprint`) but there is no debrief-to-Library flow; closed
   events are dead ends instead of precedent.
7. **The customer surface is embryonic.** The Paper publishes, but there is no
   customer status projection and no payment surface — the highest-leverage
   trust feature for a catering client is missing.
8. **The calendar is a page instead of an axis.** Time — this business's
   scarcest resource, with its distinctly Jewish weekly and seasonal shape —
   is one route among 34 instead of a dimension of every space.
9. **Search exists but doesn't join.** `/search` predates the provenance-rich
   engine; it should be rebuilt as the universal, relationship-ranked join.
10. **Mobile is absent** in a business whose evidence is generated standing up,
    in kitchens, warehouses, and trucks.

None of these are indictments — they are exactly what a constitution-first
build should look like mid-flight. The engine was built before the front doors,
which is the correct order. 1.0 is when the doors get built.

---

## 16 · Tradeoffs accepted

**Two centers of gravity cost orientation.** Some users will ask "do I live in
Events or Operations?" The answer is by role and by phase, and the two-chip
gesture (§6) is the mitigation. The alternative — one center — is worse in both
directions: event-centric starves operations; operations-centric buries selling.

**One Studio room with two postures risks mode confusion.** Mitigated by making
the posture change loud (the acceptance reveal) and the sealed design visibly
sealed. The alternative — separate planning product — severs provenance.

**Folding routes into five spaces hides familiar doors.** Short-term
retraining cost for long-term coherence; a bounded "classic links" bridge can
soften migration, but must sunset.

**Department language over system language** (Prep, Pulls, Roster) trades
internal consistency for adoption. The constitution already made this trade
correctly (vocabulary ruling); the product follows it.

**Capture-first mobile defers mobile authoring.** Correct for this business;
revisit only if field-selling becomes real.

---

## 17 · What EventCore 1.0 is

An operating system for organizations that promise events and must keep those
promises: a Pipeline that respects dates as inventory; a Studio that turns
intent into sealed commitments; an Operations space where commitments become
visible, owned, evidenced work; a Library where kept promises become the next
promise's starting point; Resources where supply meets the derived demand; and
an AI that reads everything and signs nothing.

The first domain happens to be kosher catering. Nothing above is specific to
it except the examples — which is exactly how an operating system should read.

---

## 18 · The drift test (recorded at freeze)

Every future UI decision is tested against four questions. Yes to all four
means the work is moving with the architecture; a no means drift, even if the
code is correct.

1. Does this make the transition from Promise to Work clearer?
2. Does it reinforce one engine with multiple projections?
3. Does it preserve the constant frame?
4. Does it help users answer the question they're actually asking?
