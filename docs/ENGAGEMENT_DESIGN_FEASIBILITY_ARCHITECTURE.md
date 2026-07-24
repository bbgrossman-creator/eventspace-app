# EventCore — Engagement Design & Operational Feasibility Architecture

**Standing.** Product and operational architecture under frozen Constitution v1.0.
No new domains, projection kinds, or constitutional primitives are introduced;
every mechanism below is an instance of frozen law — facts by ceremony, derivation
never stored, configuration in the plane, presentation over projections. No SQL,
no migrations, no UI. Grounded by repository inspection (citations noted inline);
the existing Studio and Event Workspace were inspected and are *not* assumed to
solve this problem — §11 states exactly what is present, partial, absent, and
mis-separated.

**The one unifying idea, stated first.** The constitution already contains the
feasibility engine's pattern — it shipped in v278. Staffing coverage derives from
*requirements* (declared on the frozen model) versus *assignments* (facts), with
shortages as derived blockers. Engagement design generalizes the identical
pattern one level earlier in the lifecycle: menu components declare **operational
requirements**; venues carry **capability and constraint facts**; feasibility is
the derivation *requirements versus capabilities*, with every unmet requirement a
derived finding and every finding either resolved by changing facts or waived by
an attributable exception fact. And the payoff is structural: **the same component
requirement declarations serve two consumers** — the feasibility derivation before
acceptance, and the obligation generator after release (which already reads them:
v275 generates obligations and v278 reads staff quantities from the frozen model's
requirement arrays, verified in code). One declaration, two moments, zero copied
truth. Nothing below departs from this pattern.

---

## 1 · The engagement design lifecycle

The end-to-end lifecycle, with each step's nature (mandatory / conditional /
optional) and constitutional character:

1. **Inquiry** — mandatory. Creates the Engagement root (A-1). Captures intent
   facts: guest count, event type, desired experience, budget frame, date
   intent, known venue. Commercial facts.
2. **Hold** — optional (Addendum B-2). A Scheduling ceremony; independent of
   everything below.
3. **Venue binding** — conditional (mandatory before implementation validation;
   an engagement may be conceptual without one). Associates the Engagement with a
   venue: the tenant's own rooms (on-premise) or an entry in the venue registry
   (off-premise, §2). A Scheduling fact (place is Scheduling's half of
   time-and-place).
4. **Discovery** — mandatory in Base-thin form (the inquiry itself), richer by
   edition. Produces commercial intent facts and *declared assumptions* (§6).
5. **Venue walkthrough** — conditional: required for implementation validation at
   unfamiliar venues; skippable where the venue registry already carries current
   facts (the tenant's own hall; a venue walked six weeks ago). A ceremony
   producing venue observation facts (§2).
6. **Menu and service design** — mandatory. The Studio's existing work: versioned
   commercial content whose components carry operational requirement profiles
   (§5).
7. **Floor and flow design** — conditional (plated ballroom: effectively
   required; drop-off delivery: skipped). An Operations design artifact (§3).
8. **Timeline design** — conditional by the same logic (§4).
9. **Feasibility review** — continuous, not a step: the feasibility projection
   derives at every read from the current draft + venue facts + designs.
   "Review" is the human act of resolving or waiving its findings (§8).
10. **Proposal publication** — mandatory for an offer; lawful at *any* readiness
    level, with unresolved feasibility converted to sealed assumptions (§6).
11. **Acceptance** — frozen PL-4 law, untouched. Freezes the model *and its
    declared assumptions*.
12. **Operational Release** — frozen v275 ceremony; its predicate gains derived
    feasibility inputs through its existing legs (§8).
13. **Detailed implementation** — the shipped Execution OS (v275–v279),
    unchanged, now inheriting the design: obligations generate from the same
    requirement declarations that feasibility validated.

Two structural truths about this lifecycle: it is **not linear** across domains
(hold, discovery, and design interleave freely per A-4 — only within-domain law
orders steps, e.g., seal-before-present), and **no step stores a stage** — every
"where are we" answer in it is the readiness derivation of §6.

## 2 · The venue and walkthrough model

**The venue registry (absent today — the largest single gap, §11).** Rooms exist
as tenant configuration for on-premise space; off-premise venues are unmodeled —
verified: off-prem events simply "occupy no room" in the conflict predicate. The
registry is durable tenant reference data in the exact mold of the staff roster
(the precedent v278 deliberately reused rather than duplicating): venues are
long-lived entities reused across engagements, holding identity, address,
contacts, and their accumulated operational profile. On-premise rooms remain what
they are; the registry covers the world beyond the tenant's walls.

**Walkthroughs are ceremonies producing append-only observation facts.** A
walkthrough is not notes and photos; it is a recorded visit (venue, actor,
moment, engagement context) whose payload is structured observations: kitchen
dimensions and layout; installed equipment and condition; refrigeration and
holding capacity; power service; water; ventilation and fire restrictions;
loading entrance and truck access; elevators (capacity, freight windows), stairs,
corridors, service entrances; staging and storage; plating and service areas;
guest rooms and dimensions; service routes and distances; waste and dish-return
routes; setup/breakdown limitations; venue labor rules; access windows —
supported by photographs, measurements, and documents as attached evidence.
Observations are never edited; a later walkthrough supersedes by recency, and
**the venue's current profile is a derivation: the latest observation per
attribute** — the same append-then-derive discipline as everything else, which
also gives venue facts honest staleness ("last verified" is free).

**The three-tier classification the model requires** (this distinction carries
most of the section's weight):

- **Authoritative venue facts** — durable properties of the place, independent of
  any engagement: the freight elevator's capacity, the kitchen's dimensions, the
  no-open-flame rule. Live on the registry as derived-current observations.
- **Engagement-specific findings** — true for *this* occasion only: "ballroom
  unavailable until 3 PM that day," "venue requires their own porters for this
  date." Facts annexed to the Engagement (Scheduling facts when temporal/spatial
  commitments; Operations design facts otherwise). They never write back to the
  registry.
- **Planning assumptions** — neither of the above: *declared beliefs pending
  verification* ("assumes freight elevator available 8–11 AM; walkthrough
  pending"). These are **commercial content**: declared on the proposal version,
  sealed with it, and visible to the customer (§6). An assumption is a promise
  qualifier, and promise qualifiers belong to the domain that owns the promise.

## 3 · Floor and implementation design

The floor system is an **operational implementation-design artifact**, and the
architecture must say so before any workspace is built, because the decorative
seating-chart version of this tool is the failure mode. Its subject is not where
guests sit; it is whether the event physically works.

It models two layers over one space: the **guest-facing layout** (seating, bars,
buffets, stations, dance floor, room transitions) and the **back-of-house
layout** (kitchen or temporary kitchen placement, staging, plating areas,
equipment positions, replenishment routes, waiter circulation, guest circulation,
loading paths, dirty-dish return, clearances and safety corridors). Both layers
are placements of *things the model already knows*: stations are components (the
`station` flag already drives obligation generation — verified), equipment comes
from requirement profiles (§5), rooms and dimensions come from venue facts (§2).

**Constitutional character:** floor designs are Operations-domain *design
documents* annexed to the Engagement — draft-editable like proposal drafts, with
the same discipline: the document is authored content; every *conclusion* about
it is derived. "The carving station fits" is never a checkbox; it is the
derivation *station footprint (component profile) ≤ available placement area
(venue fact minus other placements)*. A design referenced by a sealed offer is
fingerprinted for traceability, exactly as the offer snapshot fingerprints the
model. Feasibility findings from layout (§8) include: footprint overflow, service
route length versus plating-hold tolerance, blocked or crossing circulation,
station power draw versus circuit capacity at that placement, clearance
violations. Layout feeds work derivation naturally: an unplaced required station
is a derived work item; a route conflict is a derived blocker.

## 4 · Timeline integration

Today the timeline is one `event_time` plus expected hours (verified). The
architecture splits the timeline along the domain boundary the constitution
already draws:

- **Scheduling owns the temporal commitments** — the windows: venue access,
  load-in window, freight elevator window, event hours, hard-out, room-flip
  moment, breakdown deadline. These are facts (many originate as venue facts or
  engagement findings from §2).
- **Operations owns the implementation timeline** — the plan of activities
  *within* those windows: truck arrival, kitchen setup, cold storage available,
  prep begins, station setup, cocktail service, flip execution, plating waves,
  dessert, strike, load-out. A design document (§3's sibling), draft-editable,
  with durations drawn from component profiles (setup/strike times, §5) and
  distances drawn from the floor design.

**The timeline must expose impossibility, and impossibility is a derivation** —
the same interval mathematics already certified in v278 (half-open overlap):
activities that overflow their governing window; dependency chains whose sums
exceed available time (flip duration + reset > gap between ceremony and dinner);
resource contention (two load-ins through one freight elevator — the elevator is
a capacity-1 resource, and the derivation is the staffing-conflict derivation
with a different resource); production-to-service arithmetic (plating throughput
× distance-adjusted cycle time versus guest count and service window). Entered
times are authored content; every conflict, gap, and impossibility is derived and
appears as feasibility findings and work items. The timeline and floor design
constrain each other exclusively *through derivation* — the floor's kitchen
distance parameterizes the timeline's plating arithmetic; neither writes the
other.

## 5 · Menu implementation design — the component operational profile

The seam exists and is already load-bearing: components carry requirement arrays
in the frozen model, consumed by obligation generation (v275) and staffing
quantity (v278). What exists is thin — categories today are effectively staff and
equipment. The architecture deepens the *same seam* into the **component
operational profile**: the declaration, on a reusable component, of what
executing it implies — production location class (on-site kitchen / temporary
kitchen / commissary-and-transport); preparation and finishing methods; hot/cold
holding needs; equipment (with the carving station reading exactly as the review
poses it: carving equipment, heat source, power draw, ventilation sensitivity);
station footprint; staffing skill and quantity (already present); throughput and
line capacity; replenishment method and cadence; setup and strike durations;
allergens; dependencies; venue-restriction sensitivities (open flame, ventilation,
water).

**The three-level resolution the review asks for**, mirroring the pricing
provenance pattern (originate / carry / override):

- **Global** — the reusable component's profile in the library: what a carving
  station means *for this caterer, anywhere*.
- **Venue-conditioned** — not stored per venue-component pair, but *derived* at
  evaluation: the profile meets the venue facts and the finding falls out
  (open-flame heat source × no-open-flame venue → finding: substitute induction
  or waive). Venue "modifiers" that are genuinely durable ("this venue always
  requires their porters") are venue facts, not component edits.
- **Engagement override** — an explicit, attributable declaration on this
  engagement's version ("for Goldberg, the station runs induction"), carried in
  the versioned model like any other content, sealed at acceptance.

This placement answers the review's ownership question cleanly: global profiles
are library content (Commercial-owned reusable design vocabulary with
operational payload); venue truths are registry facts (§2); engagement
specifics are versioned model content. Nothing is copied between levels —
resolution is derivation.

## 6 · Proposal readiness — derived, and honest

No readiness status is ever stored. The readiness ladder is a derivation over
facts, in the exact mold of `event_staffing_ready`:

**conceptual** (no venue bound) → **venue-bound** → **walkthrough-current** (the
bound venue's registry profile is fresh enough per tenant policy — a
configuration-plane threshold, C-3) → **feasibility-clear** (the feasibility
projection returns no unwaived critical findings for the current draft) →
**publishable** → **published-with-assumptions** or **implementation-validated**
→ **accepted** → **release-ready** (the release predicate, §8).

Two rulings the review specifically requests:

**One proposal object, not two.** "Conceptual proposal" and
"implementation-validated proposal" are the same versioned artifact at different
derived readiness — the existing version machinery already expresses the
progression (v3 conceptual, v5 validated after walkthrough), and a second object
would be competing commercial truth.

**Publication before walkthrough is lawful — under the honest-offer rule.** A
tenant may publish early (deposits are often taken before walkthroughs; the
architecture must serve reality). The law that keeps it honest: **every critical
feasibility unknown at sealing is converted into a declared assumption sealed
into the offer** — "pricing assumes on-site kitchen access; subject to
walkthrough" — visible to the customer, frozen in the snapshot, part of what
acceptance accepts. The customer can never unknowingly receive an apparently
final proposal whose operational assumptions were never tested, because the
untested assumptions are *in the document they accepted*. This is the PL
freeze-what-you-promise principle extended to promises' qualifications, and it
is also what makes the post-acceptance failure cases tractable (§10): a
contradicted assumption is a *documented* contingency with PL-lawful exits, not
an ambush.

## 7 · Cross-domain collaboration without shared truth

The engagement design process is **a process, not a place** — no fifth domain, no
shared mutable object, no design "record" that several domains edit. The
collaboration mechanics, entirely from frozen law:

- Each domain contributes **its own facts through its own ceremonies**:
  Commercial writes versions, profiles-as-content, assumptions; Scheduling writes
  holds, venue binding, windows; Operations writes walkthrough observations,
  design documents, waivers; Financial writes deposits (already feeding release
  clearance).
- The domains meet **only in derivations**: the feasibility projection reads
  commercial content + venue facts + designs + windows and returns findings; the
  readiness projection (§6) composes it; the work projection carries its findings
  as attention items with provenance (Section J/L — "resolve elevator conflict"
  appears in the coordinator's queue under the engagement lens).
- Prohibitions hold structurally, not by discipline: Operations cannot edit the
  agreement (versions seal; Operations owns no commercial ceremony); Commercial
  cannot declare feasibility (feasibility has no declaration — it is derived, and
  the only declarable thing is a *waiver*, an Operations exception fact with
  authority); nobody stores a conclusion (findings, readiness, and validation
  are all read-time derivations).
- The **handoffs are the two frozen boundaries** (C-1): Acceptance freezes the
  commercial design with its assumptions; Release converts the commitment into
  execution, generating obligations from the very requirement profiles
  feasibility already validated — the seam where design becomes work without a
  single copied fact.

## 8 · Feasibility, exceptions, and Operational Release

**The feasibility projection** is the derivation at the heart of the
architecture: for the current draft (or frozen commitment), evaluate every
component profile, placement, and timeline activity against venue facts,
engagement findings, windows, and overrides; return findings, each carrying
severity (critical / advisory), cause references, the violated requirement or
constraint, and — where determinable — the resolution paths. Findings are never
rows; the projection is read-time, identical in discipline to coverage.

**Resolutions are facts, in exactly three shapes:** change the design (edit the
draft — the finding stops deriving); change the knowledge (a new walkthrough
observation corrects a stale venue fact); or **waive** — an attributable,
authorized, append-only exception fact ("proceed despite 90-second plating
route; approved, Ben, reason"). The waiver is not new machinery: the release
predicate has carried a waiver leg since v275 (I-37, verified), and the deferred
v280 (Exceptions & Operational Decisions) is precisely this fact family's home —
this architecture hands v280 its product definition rather than inventing a
parallel.

**Operational Release, precisely layered.** The review asks for the distinctions,
and they are five different questions:

- **Customer acceptance** — the commercial commitment exists (PL-4 fact).
- **Commercial completeness** — the frozen model is internally whole (choices
  resolved, prices confirmed) — a Commercial derivation.
- **Design feasibility** — no unwaived critical findings against the frozen
  commitment — the feasibility projection.
- **Operational readiness** — post-release execution state (obligations
  resolved, staffing covered) — the shipped v276/v278 derivations. *Comes after
  release; must not be conflated with feasibility, which comes before.*
- **Operational Release** — the ceremony whose predicate composes the
  *pre-release* trio through its existing legs: commitment (acceptance,
  unrescinded), clearance (deposit or waiver — Financial), sign-off (the
  operator's attestation, which this architecture enriches to mean "feasibility
  clear or explicitly waived": venue identified, scheduling windows resolved,
  critical walkthrough current or waived, implementation plan feasible,
  exceptions approved). The predicate's shape does not change — the sign-off and
  waiver legs were built for exactly this composition; what changes is that
  sign-off can now be *informed by a derivation* instead of a feeling.

## 9 · Workspace consequences

One integrated design process, multiple operating surfaces, interoperating
through shared facts and shared derivations — never shared mutable state. The
responsibilities each eventual workspace inherits (identified now so the later
Workspace Architecture review composes rather than invents):

- **Proposal Studio** — remains the commercial authoring surface; gains the
  assumption ledger (declare/resolve assumptions per version) and inline
  feasibility findings against the current draft ("this menu, this venue: 2
  critical, 3 advisory"). It renders findings; it never computes them.
- **Venue Workspace** — the registry: venue profiles as derived-current
  observations, walkthrough capture (the ceremony's operating surface),
  staleness surfacing, documents and photos as evidence.
- **Floor Design** — the §3 artifact's editor: two-layer placement over venue
  geometry, findings surfaced in place (the station that doesn't fit is marked
  *where it doesn't fit*).
- **Timeline Workspace** — windows (Scheduling) and plan (Operations) on one
  time axis, conflicts derived and shown in place.
- **Engagement Workspace** — the engagement lens (L-4) composition:
  readiness ladder, open findings, declared assumptions, cross-domain work — the
  coordinator's home. Distinct from the shipped Event Workspace, which remains
  the post-release operational-state pane.
- **Kitchen / Warehouse / Staffing / Logistics Workspaces** — post-release
  surfaces (department lenses over obligations and evidence, per K-3) whose
  *inputs got richer*: obligations now descend from full operational profiles,
  so the kitchen sees production methods and holding plans, the warehouse sees
  equipment pulls with power and footprint, logistics sees load-in sequencing
  born from the timeline design.

Interoperability rule, stated once for all of them: a workspace may author only
its own domain's facts, reads any projection, and dispatches only through the
router.

## 10 · Failure cases, walked through

Each case resolves with existing law — facts, derivation, waiver, or the PL
change machinery — and none requires a status shortcut. That is the model's test,
and it passes:

1. **Venue has no usable kitchen** — walkthrough fact → every on-site-production
   profile derives a critical finding → resolution: commissary production
   (engagement overrides), menu redesign, or waiver with a transport plan. The
   proposal cannot silently promise what the building forbids.
2. **One freight elevator, one load-in window** — venue fact (window) + timeline
   activities → capacity-1 resource contention derivation → sequencing redesign
   or waiver; post-release, the load-in obligations inherit the sequence.
3. **Electrical capacity below selected stations** — sum of placed stations'
   power draw (profiles × floor placement) vs circuit facts → finding names the
   overflow → station substitution, placement change, generator (equipment
   requirement), or waiver.
4. **Kitchen too far for plated service** — route length (floor) × plating cycle
   (profile) vs service window (timeline) → throughput finding → service-style
   change, satellite plating area placement, staffing increase, or waiver.
5. **Room flip time insufficient** — flip duration (profile/plan) vs window gap
   (Scheduling) → interval finding → timeline redesign, layout change reducing
   flip scope, added labor, or waiver.
6. **Accepted menu requires equipment that cannot enter the building** — late
   walkthrough observation contradicts a sealed assumption → finding *against a
   frozen commitment* → the sealed version is immutable (PL-3), so the exits are
   PL-lawful: revision + re-acceptance, waiver with substitution documented as
   engagement override, or rescission. The sealed assumption (§6) is what makes
   this a documented contingency rather than a dispute.
7. **Staffing exceeds available prep space** — headcount (v278 requirements) ×
   space-per-role vs prep-area facts → finding → staggered scheduling
   (timeline), satellite prep, menu change, or waiver.
8. **Proposal accepted before walkthrough** — lawful by design (§6); the
   commitment carries its declared assumptions; the eventual walkthrough either
   discharges them (assumptions resolve; findings clear) or contradicts them
   (case 6's machinery). Release still gates on feasibility-or-waiver, so an
   untested commitment cannot slide into execution unexamined.
9. **Customer changes menu after floor and timeline design** — a new version
   (PL law); feasibility re-derives against the standing designs; invalidated
   portions surface as findings and derived work ("re-validate floor plan for
   v6") — the designs are never silently stale because staleness is derived,
   not remembered.
10. **Guest count rises beyond throughput** — the count-confirmation fact
    (Financial, I-52) enters the feasibility inputs → throughput and footprint
    findings against the commitment → capacity additions (staff, stations, hold
    plans), service-style change via revision, or waiver. The Financial fact
    triggers Operations derivation without either domain touching the other's
    truth — the cross-domain model working exactly as designed.

## 11 · Honest gap inventory (present / partial / absent / mis-separated)

**Present and load-bearing:** the component requirement seam in the frozen model,
already consumed by obligation generation and staffing quantities; the station
flag driving station obligations; rooms with changeover/service-hours policy;
on/off-prem distinction; the release predicate's clearance-waiver and sign-off
legs; the versioned proposal machinery, snapshot fingerprinting, and the entire
feasibility-*pattern* precedent (v278 requirements→coverage→blockers).

**Partial:** requirement categories (staff and equipment only — no power, space,
holding, throughput, durations, restrictions); `component_requirements` as a
table is thinner still (name/category/notes — the richer arrays live only in the
model jsonb); the timeline (a single time plus hours); assumptions (exclusions/
assumptions exist as proposal *text*, not structured declarations a derivation
can discharge).

**Absent:** the venue registry (off-prem venues wholly unmodeled — verified: they
simply occupy no room); walkthroughs and venue observation facts; floor design in
any form; the implementation timeline; the feasibility projection; the readiness
derivation; structured waiver/exception facts (the release waiver is a bare text
ref — the v280 family will give it body).

**Mis-separated (one item):** operational knowledge about components currently
lives only *inside the commercial model jsonb*. That placement is correct for
engagement-specific resolution but leaves the *global* component profile (§5)
homeless — the library knows a carving station's name and price posture but not
its footprint or power draw. The profile belongs with the reusable component in
the library, flowing into versions as content — a placement correction the
component-profile review (§12) should settle first, because everything else
consumes it.

## 12 · Recommended sequence of future reviews and design work

Ordered by dependency, each a bounded review producing law-traceable design
before its implementation slices, with the standing severable item first:

1. **Availability corrective patch** — already adjudicated; independent; ship it.
2. **Venue Registry & Walkthrough model review** — the registry entity, the
   observation ceremony and fact vocabulary, derived-current profiles,
   staleness. (Everything downstream reads venue facts.)
3. **Component Operational Profile review** — the deepened requirement
   vocabulary, the global/venue-derived/engagement-override resolution, the §11
   placement correction, and the guarantee that obligation generation and
   staffing continue to read the same seam unchanged.
4. **Feasibility & Readiness review** — the feasibility projection's finding
   vocabulary and severities, the readiness ladder, the assumption ledger and
   honest-offer sealing, waiver facts (coordinated with v280's definition).
5. **Timeline & Floor Design review** — the two design documents, their
   derivation vocabulary (intervals, contention, throughput, footprint), their
   mutual parameterization, and fingerprinting into offers.
6. **General Workspace Architecture review** — now safe to run: it composes the
   surfaces of §9 over the models above instead of designing Proposal, Venue,
   Timeline, and Kitchen workspaces as independent modules — which was the
   precise risk this review was commissioned to prevent.
7. **Implementation slices** in the established discipline (constitution-traced
   design → SQL → proofs → races where write-concurrent → application → mounted
   UI → browser → regression), beginning with the registry and profile
   foundations.

---

**Closing statement.** The review's premise is confirmed by the architecture that
answers it: a menu is a physical plan wearing commercial clothes, and EventCore
can say so without a fifth domain, a shared design object, or one stored status —
because the constitution's own shipped pattern (declare requirements, record
facts, derive the gap, waive with authority, release on the composition) already
was the feasibility engine, waiting to be pointed at the venue instead of the
roster. The proposal that emerges is commercially attractive because the Studio
still owns it, physically feasible because every promise was derived against the
building, and operationally executable because the same declarations that proved
it feasible become the obligations that deliver it.
