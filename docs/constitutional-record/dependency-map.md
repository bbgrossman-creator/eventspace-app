# The EventCore Dependency Map

*The bridge between the Product Constitution and implementation. It describes operational causality, not software.*

---

## The question this document answers

When an operator changes something in the Event File, how does that decision become work throughout the business?

The answer is that **EventCore is a dependency graph, not a collection of applications.** Every operational requirement exists because something upstream of it was promised. Workspaces are not modules that were designed; they are the places where the branches of this graph terminate in a particular kind of work done by a particular kind of person.

If that claim is true, the workspaces should be *derivable* rather than *chosen*. Part VII tests that.

---

# Part I · The authored promise

## The root

**The promise is the only root of the graph.** Nothing event-specific exists upstream of it. Every operational requirement in an Event File can be traced back to something a client agreed to.

## What belongs inside the promise

The promise contains **what we owe**: what will be served, how the room will look and be arranged, who will serve it, where, when, for how many, at what price, and under what terms. Anything the client could reasonably say *"but you said…"* about belongs in the promise.

## What never belongs inside the promise

The promise contains nothing about **how we will do it**. Not recipes. Not which supplier. Not the prep schedule. Not which van. Not which chef. Not our cost. Not the order we load the truck.

The line is not stylistic — it follows directly from PC‑2. Method is owned by the workspace responsible for it, and a promise that specified method would author facts belonging to Kitchen, Warehouse or Transport. The promise would then be authoring truth it does not own.

So: **the promise is complete with respect to obligation and silent with respect to method.** That silence is what makes it a specification rather than an instruction manual.

## Why it is a specification, not a document

A document describes. A specification obligates.

The test is PC‑5.8's: **can this element become an operational requirement?** A menu item can — it becomes production. A service style can — it becomes labour and equipment. A paragraph of atmospheric prose about the family's warmth cannot, and is therefore decoration rather than promise.

This yields a clean rule for what may be proposed at all: *if it cannot generate work, it is not part of the specification.* It may still appear in the document the client reads — the document is a printing of the promise (PC‑9.9), and printings may carry prose the specification does not.

## The count is not a component; it is a parameter

The count sits beside the promise rather than inside it as one more item, because it **scales almost every other element** rather than generating work of its own. It is the master parameter of the entire graph, and Part III treats it accordingly.

---

# Part II · Operational dependency

The rule that makes all of this work: **the promise names things; doctrine translates them into work.**

A menu that says "Herb-Crusted Branzino" generates nothing by itself. It generates work only when the Library resolves that name into a recipe, a yield, a method, a packing instruction. **The Knowledge Library is the translation layer between promise and work**, and this is why it is load-bearing rather than a convenience: without doctrine, a promise is a set of words nobody can execute.

Below, each major promise component and what it naturally creates.

## Menu

```
Menu item
  → Recipe                (doctrine: method, yield, portion)
  → Quantity              (recipe yield × count)
  → Ingredients           (quantity × recipe)
  → Purchasing            (ingredients, minus stock, by lead time)
  → Production            (prep, cook — method from doctrine)
  → Packing               (hot/cold, container, doctrine for travel)
  → Transport requirement (thermal, timing, sequence)
  → Service               (plated, passed, buffeted — from Service)
  → Kitchen equipment     (ovens, hotboxes, chafers)
```

**Why the dependency exists.** Each arrow is a translation that cannot be skipped. You cannot purchase without quantities; you cannot compute quantities without a yield; you cannot know a yield without a recipe; you cannot select a recipe without a named dish. **Break any link and the one below it has no basis to exist.**

Two branches leave this chain early and matter disproportionately:

- **Dietary and religious constraint** — kosher, allergen, vegetarian. These do not merely modify a recipe; they create *parallel production paths*, separate equipment, separate handling, separate labelling, and sometimes an external supervising authority. One promise element generating a requirement in four workspaces at once.
- **Packing method** — the only place where a culinary decision becomes a *transport* requirement. How a dish travels is authored by Kitchen but consumed by Transport.

## Design

```
Design concept
  → Layout                (how the room is arranged)
  → Furniture             (tables, chairs, staging, dance floor)
  → Linens                (count- and layout-derived)
  → Tabletop              (china, glass, flatware — also service-derived)
  → Props and décor
  → Lighting              (→ power requirement → venue constraint)
  → Florals               (frequently a vendor, not us)
  → Equipment requirement (owned vs rented)
      → Sub-rental        (lead time, delivery window not ours)
      → Pull → Stage → Load
  → Setup labour and duration
  → Breakdown
  → Return and reconciliation
```

**Why the dependency exists.** A design concept is an *equipment requirement in disguise*. Nothing about a concept is executable until it resolves into countable objects that must be owned or rented, gathered, moved, placed and recovered.

**The asymmetry worth naming:** the design branch is the only one with a mandatory **return leg**. Food is consumed; equipment must come back, and what does not come back is money. This asymmetry is the reason Warehouse exists as a workspace rather than as a procurement function, and it is why settlement cannot be reached when the last guest leaves (PC‑7.12).

## Venue and layout

```
Venue
  → Access window         (when we may be in the building)
  → Load-in path          (dock, elevator, stairs, distance)
  → Power and water       (constrains lighting, cooking, equipment)
  → On-site kitchen       (or its absence → cook off-site → transport hot)
  → Capacity              (a ceiling on the count)
  → House rules           (noise curfew, union, supervision, vendor lists)
```

**Why the dependency exists, and why this branch is different:** the venue is **the only promise component whose constraints we do not author.** Every other branch descends from something we decided. The venue imposes.

This is why its constraints propagate *backwards* through the day: a dock that closes at four constrains arrival, which constrains departure, which constrains load, which constrains pull, which constrains crew call. One external fact reorders an entire day, and it is the structural reason Setup is the workspace most often blocked by someone outside the company.

## Service style

```
Service style
  → Labour ratio          (plated needs more servers than buffet)
  → Equipment             (plates and covers, or chafers and risers)
  → Timeline shape        (courses, pacing, holds)
  → Kitchen method        (à la minute, or batch and hold)
```

Service style is not a large promise element but it is one of the most **connected**: a single decision that simultaneously changes staffing, warehouse, timeline and kitchen. It is the clearest example that consequences are not confined to one workspace.

## Staffing

```
Labour requirement       (count × service style × menu complexity × venue)
  → Roles and numbers
  → Scheduling            (call times derived backwards from the timeline)
  → Confirmation
  → Briefing              (menu, allergies, layout, timeline, sensitivities)
  → Transport of crew     (sometimes)
  → Attendance
  → Execution
  → Time worked           (→ cost)
```

**Why staffing is not a branch but a cross-section.** Every other branch generates labour: kitchen labour, setup labour, driving, service. Staffing is where those separately-generated demands **collide on a shared, scarce, human resource**. This is the structural reason it cannot be folded into Kitchen or Setup — it is not downstream of any one branch; it is downstream of all of them.

## Timeline

The timeline generates no requirement of its own. It **schedules everything else**, working backwards from service: plating → cooking → prep → purchasing; room ready → dress → layout → load-in → arrival → departure → load → pull; guests arrive → crew briefed → crew called.

That distinction — generating *nothing* while ordering *everything* — is the seed of Part VI.

## Pricing

Pricing is the one component that mostly flows **inward**: it derives from the other components rather than generating operational work from them. What it generates is financial: deposit, payment schedule, invoicing, and a cost target against which actuals are later measured.

## Terms and documents

```
Terms
  → Compliance obligations  (certificates of insurance, permits, licences, supervision)
  → Payment schedule
  → Cancellation exposure
```

These generate obligations with owners and deadlines, most of them triggered by the venue rather than by us — which is why they belong to coordination.

---

# Part III · Cross-dependencies

The graph is not a tree. Its cross-edges are where most operational failure lives, and they are the reason coordination exists at all.

## The count, and why change does not propagate uniformly

The count touches food, labour, rentals, seating, vehicles and price. But it does not touch them *the same way*, and this is the most practically useful observation in this document.

| Consequence | Shape |
|---|---|
| Food quantity | **linear** — 18% more guests, 18% more fish |
| Rentals | **near-linear**, quantised by pack (chargers come in tens) |
| Staffing | **step** — a server is added at each threshold, so 180→195 may change nothing and 195→200 may add one |
| Vehicles | **threshold** — nothing changes until a van is full, then everything does |
| Seating and layout | **discrete** — tables of ten reconfigure the room |
| Price | **linear** on per-person, **invariant** on flat elements |
| Venue capacity | **ceiling** — not a consequence but a limit |

**Dependency therefore has magnitude and shape, not merely direction.** A count change of five percent may change nothing in Transport, one person in Staffing, and five percent in food cost. This is why a change must show its actual blast radius (PC‑7.8) rather than a generic warning that something changed.

## Menu → Staffing

A complex plated menu increases kitchen labour and service labour simultaneously — more hands to produce, more hands to serve courses. Allergen handling adds dedicated labour that is invisible in the guest count.

## Design → Warehouse

Every décor decision is an inventory question: do we own it, must we rent it, and by when must it be ordered. **Sub-rental introduces a lead time we do not control**, which converts a design decision into a deadline.

## Layout → Transport

More tables is more volume, and volume becomes vehicles. Layout also fixes **load order** — the truck must be packed in reverse of unload, so a change to what goes in the room changes how the truck is packed.

## Venue → everything operational

Access windows propagate backwards through the entire day, as described in Part II.

## Service style → three workspaces at once

The clearest single-decision-many-consequences edge in the graph.

## Kosher and dietary constraint → four workspaces

Menu, production, supervision, timing. Shabbos timing in particular constrains *when work may be performed*, which is a constraint no other promise element imposes.

## Allergies → the full length of one branch

Menu, production, plating, briefing, service. An allergy is unusual in that it propagates the entire depth of a branch without changing quantity anywhere.

## Amendments → everything downstream, weighted by proximity

An amendment's cost is not only monetary; it is a function of how much of the graph has already been executed. The same change is cheap two weeks out and expensive two days out because the downstream work has already been done.

## The backward edges: capacity constrains the promise

Most of the graph runs promise → work. A few edges run the other way: kitchen capacity, labour availability, owned inventory, venue limits and vehicle capacity constrain **what may be promised at all**.

**These backward edges are what feasibility is** (PC‑5.9). Feasibility is not a check bolted onto proposals; it is the graph read in reverse, before commitment.

---

# Part IV · Service grain

One Event File. One client, one agreement, one price, one invoice. Beneath it, three services: Friday dinner, Shabbos lunch, Sunday brunch.

## What branches, and what does not

Branching is **per requirement, not per workspace** — which is the point most easily got wrong.

| Requirement | Grain |
|---|---|
| The client, agreement, price, invoice, terms | **file** — one, always |
| Menu and production | **service** — Friday's fish is not Saturday's |
| Equipment | **mixed** — some items serve all three; linens may be replaced between |
| Venue booking | often **file** — one weekend, one room |
| Layout | **service** — the room is reset between |
| Staffing | **service**, frequently the same people |
| Transport | **service**, though runs may be combined |
| Compliance | **file** — one certificate covers the weekend |

## The dependency this creates *between* services

Shared resources across services create dependencies **within one file**:

```
Friday breakdown → wash → Saturday setup
```

If Friday's chafers are Saturday's chafers, Friday's breakdown blocks Saturday's setup. Nothing about that dependency involves another Event File, and nothing about it involves the client.

## Why this is constitutionally significant

If a service were a second Event File, this dependency would become a **cross-file** dependency. Two commercially independent objects would have an operational obligation to each other, and there would be no non-arbitrary place for it to live. The client, who bought one thing, would appear in the system as three customers.

**A service is not a second Event File precisely because the operational branching is real and the commercial identity is not.** Operations must be able to fan out without the promise fragmenting — and holding both requires exactly one identity above and many below.

---

# Part V · Composition

## Where Composition enters

```
Knowledge assets  (governed doctrine: recipes, layouts, packages, standards)
        ↓ composed into
Composition       (approved reusable experience, governed and versioned)
        ↓ instantiated into
Authored promise  (the root of the dependency graph)
        ↓
Operational consequences
```

**Composition enters at authoring and nowhere else.** It is a shortcut for composing the promise, never a shortcut for doing the work. Once instantiated, the promise generates its consequences exactly as if every element had been authored individually — the graph below the root does not know or care how the root was assembled.

This matters: if Composition entered lower down, it would be authoring operational facts and would violate PC‑2.

## Why historical Event Files are not reusable

A completed Event File is a record of **what happened** — including its substitutions, its exceptions, its overtime, its damaged linens, and the improvisation someone made when a supplier failed. Reusing it would propagate incident as though it were intention.

The lawful path is:

```
Past Event File
    ↓ extraction        (observation — what was actually done)
Candidate
    ↓ promotion         (a governance act, by someone with authority)
Composition             (governed, approved, versioned)
    ↓ instantiation
New promise
```

**Extraction observes; promotion decides** (PC‑6.6). A candidate is not knowledge and is not reusable. Only a promoted Composition is an institutional asset.

Without that boundary the Library would accumulate everything that ever happened, mistakes included, and the company would slowly become a museum of its own workarounds.

## What instantiation carries, and what it does not

**Doctrine is copied and frozen** — so the promise is stable and a later doctrine change never silently rewrites a signed agreement.

**Experience is referenced live** — so the newest warning about a venue's dock reaches the person about to reverse a truck into it, even if the Composition was promoted two years ago.

Copy doctrine; reference experience (PC‑9.17). One distinction, and it is what allows a Composition to be both stable and current.

---

# Part VI · Dependency versus workflow

The most important distinction in this document.

## The two statements

**Dependency — structural.** *"A depends upon B."* Production depends on knowing the menu. Purchasing depends on quantities. Setup depends on delivery. These are **properties of catering**. They are the same in every company, in every season, on every event, and they were true before software existed.

**Workflow — operational.** *"B is performed before C."* We prep on Thursday. We pull on Friday morning. We load at six. These are **properties of this business on this occasion**. They vary by company, by season, by staffing, by venue, and they change without anything structural changing at all.

## The same dependency supports many workflows

Two caterers share the dependency `menu → recipe → ingredients → production` exactly. One batch-cooks two days ahead; the other cooks à la minute on site. Same graph, different workflow — and neither is more correct.

This is why PC‑7.2 says workspaces receive **requirements, not instructions**. A requirement is a dependency. An instruction would be a workflow, and imposing one company's workflow on another is the failure mode of every catering system that has tried.

## Why confusing them creates brittle software

**1 · Encoding workflow as dependency hard-codes one company's habits.** A product that believes prep must precede pull because *its designers'* caterer worked that way will break for the caterer who pulls first. The habit was never structural.

**2 · Encoding dependency as workflow destroys explanation.** If everything is a step, the only thing you can say is *"step four hasn't happened."* You cannot say *why*. The graph is what lets the system say "this cannot start because the count is unknown" rather than "this is not done."

**3 · Workflow is volatile; dependency is nearly permanent.** Building the product's foundations on the volatile layer guarantees perpetual rework.

**4 · The decisive one — you lose the only distinction that matters operationally.** Readiness derives from **dependency**: is a requirement unmet? Progress derives from **workflow**: which step are we on? Conflate them and you can no longer tell apart:

- *not started* — workflow position, nothing wrong
- *not yet due* — scheduled, nothing wrong
- *cannot start* — a dependency is unmet, something is wrong
- *unimpeded but unowned* — lawful, and at risk of being forgotten

An operator opening a workspace needs exactly these four apart. A system built on workflow alone can offer only *"not done,"* which is the least useful of the four and indistinguishable from all of them.

## The one place they legitimately meet

Some dependencies carry deadlines: ingredients must be *ordered* by a lead time, sub-rentals *reserved* by a date. These are dependencies with a temporal edge — structural in nature, scheduled in expression. They are dependencies that have a clock, not workflow steps, and they should be read as such.

---

# Part VII · The workspaces as consequences

The test: are the workspaces derivable from the graph, or were they chosen?

| | Derived because |
|---|---|
| **Proposal Studio** | The graph needs exactly one root. If the promise could be authored in two places, the root forks and every downstream requirement inherits an ambiguity. Studio exists because **a graph must have a single origin**. |
| **Kitchen** | The menu branch terminates in food. Every consequence along it is done by one kind of person with one set of tools, in one place. **A workspace is where a branch terminates coherently.** |
| **Warehouse** | The design and equipment branches terminate in *objects*, and — uniquely — objects that must **come back**. Without the return leg this would be procurement. The return leg is what makes it a station. |
| **Setup** | The design branch terminates *at a place* rather than at an object. Setup exists because the graph's endpoint is a room, not a thing. |
| **Transport** | Production and gathering happen where we are; service happens where they are. Transport is not a branch terminus — it is **the edge between two locations**, which is why it is thin, cross-event, and clock-driven. |
| **Staffing** | Every branch generates labour, and those demands collide on one scarce resource. Staffing is the **cross-section** of the graph, not a branch of it. This is precisely why it cannot be folded into Kitchen or Setup. |
| **Event Management** | The graph is not a tree. Somebody must hold the **cross-edges** — menu→staffing, venue→transport, Friday's breakdown→Saturday's setup. A pure tree would need no coordinator. Coordination exists because the graph has edges no single branch can see. |
| **Money** | Downstream of everything, and the only workspace whose input is **actuals rather than requirements**. It reads the graph's output, not its structure. |
| **Event axis** | The promise is per-event, so identity follows the promise. |
| **Day axis** | Dependencies are per-event; **resources are per-day**. One chef, one kitchen, one van serve several graphs on a Tuesday. The Day is the horizontal cut through many vertical graphs at the point where they share a resource. |
| **Readiness** | A query over the graph: *is any dependency unmet, and which?* It is not a feature — it is what reading the graph produces. |
| **Feasibility** | The **backward edges**, evaluated before commitment: can the graph be satisfied given capacity? |
| **Next Action** | The highest-priority unmet dependency **you can act on**. A selection over the graph, ordered by policy. |

Eleven of the thirteen fall out of the graph. Two do not, and I say so in the attack below.

---

# Attacking my own conclusions

## 1 · Not everything operational descends from the promise

This is the sharpest attack on the guiding principle, and it lands.

Staff meals. Kitchen cleaning. Vehicle fuel. Equipment maintenance. Uniform laundry. None was promised to anyone, yet all are real operational work that appears in a real event's day.

**The correction:** the principle should read *everything **event-specific** descends from the promise; standing operational obligations descend from **operating at all**.* The graph has a **root** (the promise) and a **floor** (the cost of being open). The floor is thin, recurring, and largely invariant — but it is not zero, and a model that denies it will be contradicted the first time somebody asks who feeds the crew.

## 2 · Owner is not on the graph

Owner observes the graph; it is not a consequence of it. It exists because the business has an owner, not because the promise has a branch. This is consistent with PC‑2 — Owner authors intent only — but it should not be dressed up as a derivation.

## 3 · Event Management is only partly derived

The cross-edge argument is genuine and I believe it. But Event Management also owns compliance obligations and vendor liaison, and those are not cross-edges — they are branches with no natural home elsewhere. Honest statement: **coordination is derived; the rest of Event Management's portfolio is assigned.**

## 4 · Vendors are under-specified

Florists, bands, photographers, rental houses. They occupy the load-in window and the floor plan, some are ours and many are the client's, and they create genuine dependencies — our setup may wait on their install. The Product Constitution mentions them only lightly, and this document cannot derive their treatment from it. **A real gap, named rather than filled.**

## 5 · Conditional dependencies are unaddressed

A tent because it might rain. A backup generator. A contingency menu. These are promise elements that may or may not activate, and the graph as described has no notion of a conditional edge. **Under-specified; flagged.**

## 6 · Is the Library's necessity derived or assumed?

PC‑6 asserts the Library. This document shows it is on the critical path from promise to work — a menu is inert without doctrine. That is consistent, and it is a *demonstration of load-bearing*, not a derivation of existence. I do not claim to have derived the Library from the graph; I claim the graph cannot function without it.

## 7 · The count's shapes are empirical, not constitutional

The linear/step/threshold distinction in Part III is drawn from how catering behaves, not from any constitutional statement. It is true and useful, and it is the one substantive claim here that rests on domain observation rather than on the Product Constitution. Recorded as such.

---

# What a future engineer should take from this

**Why a promise becomes work:** because every operational requirement is a translation of something promised, made executable by doctrine. Nothing event-specific exists that cannot be traced to the root.

**Why work appears where it does:** because a workspace is where a branch of the graph terminates in one coherent kind of work — or, in Staffing's case, where all branches intersect on one scarce resource.

**Why workspaces receive different consequences from the same promise:** because they sit on different branches. One decision — service style — arrives at Staffing as a ratio, at Warehouse as a different set of objects, at Kitchen as a different method, and at the timeline as a different shape. Same origin, different translations.

**Why EventCore is dependency-driven rather than a set of applications:** because the applications were never the design. The graph is the design. Readiness is the graph read forward, feasibility is the graph read backward, next action is the graph ordered by policy, the Event axis is a single graph and the Day axis is a cut across many. Remove the graph and there is nothing left holding the workspaces together — which is exactly the condition of every catering product this one is meant to replace.

**And the distinction to protect above all others:** dependency is structural and nearly permanent; workflow is operational and endlessly variable. Build on the first, express the second, and never let them merge.