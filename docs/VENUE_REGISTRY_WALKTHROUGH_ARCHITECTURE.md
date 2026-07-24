# EventCore — Venue Registry & Walkthrough Architecture

**Standing.** Bounded design review #2 of the approved sequence, under frozen
Constitution v1.0 and the accepted Engagement Design & Operational Feasibility
Architecture. No SQL, no code, no UI. Repository inspected honestly; citations
inline.

---

## 1 · Executive ruling

The venue knowledge foundation is: a **tenant-local venue registry** (durable
reference data, staff-roster precedent) containing **venues** and their typed
**spaces**; an attributable, append-only **walkthrough ceremony** producing
**observations** classified by an explicit **source-class ladder**; a **current
profile derived** per attribute under a precedence rule in which recency wins
*within* a source class but never silently *across* classes; **staleness derived**
from age, expiry, renovation facts, and tenant thresholds; a **three-valued
coverage contract** (observed-present / observed-absent / unobserved) so
feasibility can never mistake ignorance for absence; and a strict provenance wall
between durable venue knowledge (registry), engagement findings (engagement
facts), and planning assumptions (Commercial, sealed). Existing rooms are
untouched and remain the on-premise scheduling structure, bridged later by a
compatibility projection — nothing in frozen scheduling law moves. Two candidate
new constitutional concepts were tested and rejected (§5, §15); everything here
is an instance of frozen law.

## 2 · Repository inspection

Verified during this review: **rooms** are a thin tenant-config entity —
`{ id, name, guest_capacity, active, sort_order }` — managed at
`app/locations`, consumed in 13 places, and load-bearing in frozen conflict law
(per-room clash logic; null room conservative; `off_prem` occupies no room).
**Off-premise venues do not exist as entities**: they are free-text strings on
the booking row (`offprem_address`, `offprem_street`, `offprem_city`) — no
identity, no reuse, no accumulated knowledge; every off-prem engagement starts
ignorant. **Changeover/service policy** (`policies.ts`) is configuration already
consumed by the conflict derivation — the C-3 precedent this model reuses for
staleness thresholds. **The Blueprint suite** (`PromoteToBlueprint`,
`StartFromBlueprint`, `BlueprintInstantiate`) is the shipped explicit-copy reuse
pattern §14 adopts for prior-design reuse. The **offer-snapshot fingerprint**
(`artifact_hash`) is the shipped evidence-immutability pattern §9 adopts.

## 3 · Venue identity model

**Tenant-local, full stop.** A venue entry is one tenant's operational knowledge
about a place — and that knowledge (the walkthroughs, the problems, the load-in
plans) is competitive intelligence. Cross-tenant sharing, global registries, and
canonical matching are **rejected** for v1: the isolation risk is total and the
benefit marginal (an address string is not knowledge; the knowledge is the
observations, which must never cross tenants). Two tenants who both serve the
Hilton each hold their own Hilton, and I-tenant isolation holds trivially. If
canonical address matching is ever revisited, it may share nothing beyond
postal-address normalization — a future review's problem, deliberately out of
scope.

The entry itself: identity (name, tenant), address and geolocation, venue type
(fixed facility / private home / outdoor property / temporary structure),
contacts, ownership/management company, and free reference notes. **Duplicate
handling** is tenant-internal: advisory detection on create (normalized
address/name similarity — a derivation, never a block) and a **merge ceremony**
that is additive, not destructive: merge records a redirect fact (venue B → A);
B's observations remain intact and attributed, read through A's derived profile;
nothing is rewritten or deleted. **One-time venues are simply venues** — the
registry entry is cheap, and the private home used once is exactly the case
where recorded knowledge ("no truck access; kitchen 110V only") pays off if the
family calls again. **Campuses and multi-building venues** need no special
identity machinery: buildings are spaces (§5), so a resort is one venue whose
space tree has buildings at its top.

## 4 · Relationship to existing rooms

**Rooms stay.** They are frozen scheduling law's operative structure and this
model does not touch them: no migration, no replacement, no schema change to
rooms in any early slice. The relationship is conceptual now and projected
later: the tenant's own premises are logically a "home venue" whose guest spaces
are the existing rooms — but that unification ships, when it ships, as a
**compatibility projection** (rooms exposed as spaces of an implicit home venue
for feasibility reads), never as a rewrite. Scheduling continues to claim
capacity via `room_id` on-premise; off-premise engagements gain what they never
had — a **venue binding** (a Scheduling fact associating the engagement with a
registry venue, replacing reliance on the free-text address, which survives as a
compatibility input per E-2). The one shipped behavior this eventually enriches
is the off-prem "occupies no space" rule: venue binding makes off-prem *resource*
contention derivable (§5 capacity attributes) without altering room-based
conflict law — an additive read, not a changed predicate.

## 5 · Space and resource vocabulary — the minimality ruling

The prompt's list of twenty-odd physical concepts must not become twenty entity
types. The ruling: **two entities, one flag, everything else is observations.**

- **Venue** — the identity root (§3).
- **Space** — a typed, optionally nested region of a venue: `kind` from a
  server-extensible vocabulary (building, room/ballroom, ceremony space,
  kitchen, temporary-kitchen area, prep area, plating area, refrigeration area,
  storage, staging, loading zone, dock, driveway, elevator, corridor, stair,
  waste area, dish-return area, outdoor area, tent site), a name, an optional
  parent (buildings contain rooms; a kitchen contains a walk-in). Spaces exist
  so observations, placements (floor design), and routes have addresses.
- **Resource = a space flagged contended**, carrying capacity attributes
  (capacity-1 freight elevator; two dock bays) — **not a third entity**. The
  test for resource-ness is "will timeline derivation arbitrate competing use of
  it," and a flag plus capacity observations answers that test completely. The
  elevator is a space (it has dimensions, door clearance, weight limit —
  observations) that is also contended (flag + capacity).
- **Everything else is an attribute, expressed as observations** (§7): utility
  connections, circuits and power zones, dimensions, clearances, rules. A
  circuit is not an entity; "circuit: 20A, outlets NEMA 5-20, serves ballroom
  east wall" is an observation scoped to a space. **Routes** — the one
  relational need — are observations scoped to a *pair* of spaces ("kitchen →
  ballroom service route: 60 m, one door, no stairs"), which is all floor
  design and plating arithmetic require.

This is sufficient for every downstream consumer named in the parent
architecture — floor design places into spaces with dimension observations;
timeline contention reads capacity-flagged spaces; routing reads pair
observations; feasibility compares attributes — and it is the smallest model
that is. A candidate "Zone/Region" abstraction above spaces was considered and
rejected as over-modeling: nesting already expresses it.

## 6 · The walkthrough ceremony

An attributable, append-only ceremony in the established pattern (default-deny,
tenant-scoped, named refusals when implemented). One walkthrough = one visit:

- **Header facts:** venue; optional engagement context (a walkthrough may be
  general or for the Goldberg wedding — the observations are durable either
  way, §10); date/time; purpose (initial survey / pre-event verification /
  post-renovation re-survey / dispute resolution); participants (multiple
  contributors allowed — the walkthrough is one record, each observation
  individually attributed to its observer); venue-representative involvement,
  explicitly two-valued: **supplied information** vs **approved/confirmed** —
  a rep who says "the elevator takes 2,000 lbs" supplied a statement; a rep who
  signs off on the recorded load-in plan approved it, and the two must never
  blur.
- **Coverage declaration — load-bearing:** which spaces were visited and which
  were **inaccessible or unverified** ("kitchen locked; observed through
  window"). Recording what was *not* seen is what powers the three-valued
  contract (§13): an unvisited kitchen yields *unobserved*, never
  *observed-absent*. Follow-up-required items are declared here and become
  derived work (walkthrough-required findings).
- **Body:** the observations (§7) and evidence attachments (§9).

**Authority:** creating venues — any active member; conducting walkthroughs and
attesting observations — an operations-management authority evaluator in the
`can_manage_staffing` mold (named, default-deny, defined at implementation;
responsibility configuration grants nothing, per I-60). Venue representatives
and vendors never hold tenant authority: their contributions enter as their
source class (§7) via a tenant member's ceremony, distinguishable forever.

## 7 · Observation vocabulary and the source-class ladder

**An observation is:** attribute key (from a server-controlled vocabulary,
extensible by law not by users — the closed-registry precedent), scope (venue,
space, or space-pair), value (structured: number + unit, range, boolean,
enumeration, or document reference; narrative notes may *accompany* but never
*replace* a structured value for feasibility-relevant attributes), observer,
moment, **source class**, method, confidence note, optional effective/expiry
dates, optional applicability condition ("when tent is up"; "December–March"),
and evidence citations.

**The attribute vocabulary** at v1 covers the prompt's five families —
kitchen/production (dimensions, work surfaces, installed equipment and
condition, refrigeration and freezer capacity, hot holding, water, sinks,
drainage, ventilation, open-flame restriction, fire suppression, sanitation,
prep and plating capacity), utilities (electrical service, circuits, outlet
types, voltage, amperage, generator rules, water, gas, drainage,
communications), access/logistics (truck access, dock, loading entrance, curb
and parking rules, freight windows, elevator dimensions/capacity, stairs,
corridor widths, doorway clearances, travel distances, setup/breakdown access),
service/flow (guest areas, BOH routes, staging, replenishment, dish return,
waste, room transitions, flip constraints), and venue rules (required labor,
union and porter rules, security, insurance, fire and noise rules, approved
vendors, hard-outs, cleanup, equipment prohibitions). Which need structure:
anything feasibility will *compare* (capacities, dimensions, amperage,
clearances, distances, windows, booleans like open-flame) is structured with
units; rules and conditions may be enumerated-plus-document; pure color
(“manager is difficult about early load-ins”) is notes.

**The source-class ladder — the review's "do not collapse into equivalent
truth" requirement, made explicit and total-ordered:**

1. **Measurement** — instrumented, by tenant staff.
2. **Direct observation** — seen by tenant staff, not instrumented.
3. **Venue document** — supplied paperwork (floor plans, equipment inventories,
   rulebooks). AI/document-extracted values enter *provisionally at this class*
   and participate in the current profile **only after a tenant member attests
   them**; unattested extractions are advisory-only.
4. **Venue-representative statement** — told, not shown.
5. **Prior tenant knowledge** — recalled or imported history.

**Assumptions are not on the ladder.** An assumption is not venue knowledge at
all — it is a Commercial qualifier sealed into an offer (parent architecture
§6) and it never enters the registry. This wall is what keeps hopeful selling
out of the building's facts.

## 8 · Current-profile derivation

The profile is derived at read time, per attribute, per scope, filtered to the
reading context (engagement date → applicability conditions and
effective/expiry windows applied first). The precedence rule — the section the
review flags as the honesty test:

1. Among applicable, unexpired, unsuperseded observations of an attribute,
   **the highest source class present governs**, and **recency wins within
   that class** (a newer measurement supersedes an older measurement).
2. **A newer observation of a lower class never silently overrides a higher
   class.** It does one of two things: if consistent, it corroborates
   (freshness improves); if it differs materially, it raises a **derived
   contradiction finding** ("rep states 2,000 lbs; measured plate reads 1,500
   lbs — re-verify"), which is work, not truth. The profile continues to answer
   with the governing value *while flagging the dispute*.
3. **Explicit supersession beats everything:** a correction fact ("the March
   measurement transposed digits — superseded; actor; reason") retires a
   specific observation attributably. Corrections are additive facts; nothing
   is edited (§11).
4. **Renovation is an event, not an edit:** a recorded renovation observation
   (scope: venue or spaces; effective date) does not change any value — it
   drives staleness (§9) to critical for the affected scope, deriving
   walkthrough-required work. The old measurements remain honest history of the
   old building.
5. **Partial coverage yields three-valued answers** (§13): attributes never
   observed for a scope are *unobserved* — the profile must say "unknown," not
   guess, and the §6 coverage declarations are how it knows the difference
   between "no walk-in" and "never checked."

## 9 · Staleness derivation

Never a flag; always: `stale?(attribute, scope, context) = f(governing
observation's age and class, explicit expiry, renovation facts, tenant
thresholds)`. The threshold table is configuration (C-3: named tenant
parameters in a derivation) keyed by attribute class: structural dimensions
decay slowly (years); equipment presence/condition faster (months); documents
with expiry dates (insurance, permits) use **expiry, which beats age in both
directions** — a fresh-looking expired permit is critically stale; seasonal and
conditional observations are stale *outside* their condition by definition and
current within it. A walkthrough performed for another engagement still
refreshes durable attributes (durability is about the attribute, not the
occasion — §10 governs what *doesn't* carry over).

Outcomes, all derived: **advisory staleness** → advisory finding;
**critical staleness** (critical attribute past threshold, expired document,
renovation in scope) → critical finding → **walkthrough-required work** (the
work projection, J-law) → at publication, conversion to a **sealed assumption**
(honest-offer rule) → at release, a **release-blocking finding** unless waived
through the exception family. No "venue current" status exists anywhere.

## 10 · Durable facts vs engagement findings vs assumptions

The provenance wall, with write ownership:

- **Durable venue knowledge** — expected to hold across engagements. Written
  only by walkthrough/observation ceremonies into the registry. Operations-
  attested; registry-homed.
- **Engagement-specific findings** — true for one occasion: "ballroom
  inaccessible until 3 PM," "elevator shared with the florist's load-in,"
  "venue requires two extra porters *for this event*," "east entrance closed
  that day." Written as engagement-annexed facts: **Scheduling facts** when
  they are temporal/spatial commitments (windows, closures, shared-resource
  slots), **Operations facts** otherwise. They parameterize this engagement's
  feasibility and timeline; they never write the registry.
- **Planning assumptions** — unverified commercial qualifiers, declared on the
  version, sealed into the offer, Commercial-owned. Never in the registry, per
  §7.

**Promotion is suggested, never automatic.** When engagement findings recur
("two extra porters" on three consecutive events), a derivation may raise the
*suggestion* "record as a durable venue rule?" — but promotion happens only
through an explicit observation ceremony by an authorized member. Findings
suggesting durable truth without a human attesting it would be exactly the
silent-truth-creation the constitution forbids.

## 11 · Evidence and attachment model

Evidence (photographs, annotated photographs, measurement records, floor plans,
utility diagrams, rulebooks, insurance requirements, equipment inventories,
correspondence, permits, fire documentation) attaches to the **walkthrough**
(the visit that captured it) and is **cited by observations** (many-to-many:
one photo can support three observations; one observation can cite a photo and
a spec sheet). Evidence is **immutable and fingerprinted** (the
`artifact_hash` pattern already shipped in offer snapshots); replacement is a
new evidence item superseding by reference; versioned documents (this year's
rulebook) are successive items whose currency the profile derivation reads via
effective/expiry. Provenance on every item: who captured/uploaded, when, source
class of what it supports. A photograph contradicting entered text is a §8
contradiction case: the photo is evidence for a *new correcting observation*,
not a silent override.

## 12 · Corrections and disputes

All correction paths are additive; the eight test scenarios reduce to four
mechanisms — supersession fact (wrong measurement; outdated rule replaced by a
newer observation), contradiction finding (two employees' differing elevator
capacities → both stand, higher/newer class governs per §8, finding derives
re-verification work; manager contradicting prior manager → newer statement at
statement class, finding if it disputes a measurement), renovation event
(post-acceptance renovation → critical staleness → findings against the frozen
commitment → the parent architecture's case-6 machinery: revision,
waiver, or rescission — PL law untouched), and sealed-assumption resolution (an
assumption disproven after acceptance is a *documented contingency*: the offer
the customer accepted contains it, and the lawful exits are the PL trio). The
inaccessible-kitchen walkthrough is not a correction case at all — it is
honest coverage (§6): kitchen = unobserved, feasibility answers "assumption
required."

## 13 · The feasibility input contract

The stable read surface later systems consume — defined now, implemented with
the feasibility slice:

- **Profile read:** (venue|space, attribute, context date) → **three-valued**:
  `observed(value, source class, age, confidence, evidence refs)` |
  `observed-absent` | `unobserved`. The three-valuedness is the contract's
  load-bearing property: *"is an on-site kitchen available?"* can answer no
  (observed-absent) or unknown (unobserved → feasibility yields
  "assumption required"), and the two produce different findings.
- **Comparison reads:** clearance chain for ingress (*"can this equipment
  physically enter?"* = equipment envelope vs door/corridor/elevator dimension
  observations along a route); capacity sums (*"sufficient power at this
  placement?"* = station draws vs circuit observations for the placement's
  space); boolean rules (*"open flame permitted?"*); capacity adequacy
  (refrigeration volume vs holding requirements).
- **Contention read:** capacity-flagged spaces with their windows (*"is the
  freight elevator a contended capacity-one resource?"*) — consumed by
  timeline derivation, including cross-engagement contention at one venue.
- **Route read:** space-pair distances and characteristics (*"plating-to-
  service route?"*).
- **Fit read:** station/equipment footprints vs space dimensions minus other
  placements (floor design supplies placements; the venue side supplies
  dimensions).
- **Trust reads:** per-answer staleness verdict (*"current enough to
  trust?"*) and per-answer basis (*"which conclusions rest on statements or
  assumptions rather than measurement?"*) — the source class travels with
  every value so downstream findings can carry it ("feasible, but resting on a
  rep statement from 2024").

The contract exposes derivations only — no consumer ever reads observations
raw to compute its own current value, which is how one derivation stays one.

## 14 · Search, reuse, and operational memory

The registry is the tenant's operational memory of places: lookup by
name/address/type; per-venue walkthrough history and evidence library; prior
engagements at the venue with their findings ("last three events here: elevator
delays"); recurring-restriction surfacing (§10's promotion suggestions); prior
floor designs, load-in plans, and implementation timelines as **reference
documents**. Reuse follows the shipped Blueprint pattern (verified:
`StartFromBlueprint`/`BlueprintInstantiate`): prior designs are *instantiated
by explicit copy* into the new engagement's drafts, becoming that engagement's
authored content — **never automatic truth**. Last year's flawless load-in plan
is a template offer, not a fact about this year; the new engagement's
feasibility derives fresh against current profile, current findings, current
design.

## 15 · Constitutional self-audit (per the post-review checklist)

**No new constitutional concepts:** venue and space are tenant reference data
(roster/rooms stratum); observations, findings, corrections, renovations are
append-only facts by ceremony; profile, staleness, contradictions, coverage are
derivations; thresholds are C-3 configuration; source classes are a fact
*attribute*, not a truth rank outside the facts. Two candidates were tested and
**rejected**: a "Resource" entity (folded into flagged spaces, §5) and any
observation-reliability constitutional object (the ladder is vocabulary on
facts plus a derivation rule). **Over-modeling check:** two entities and one
flag against the prompt's twenty-plus concepts. **Rooms preserved:** untouched;
future bridge is a projection (§4). **Observation vs truth:** the ladder,
precedence rule, contradiction findings, and the assumptions wall (§7–§10).
**Feasibility inputs:** §13's contract, three-valued. **Slicing:** §17.

## 16 · Failure-case analysis

1. **Tenant's own ballroom and kitchen** — rooms remain the scheduling truth;
   venue knowledge about the home premises can be recorded against the future
   home-venue projection or deferred; nothing changes now. Facts: rooms +
   policy. Resolution: no-op for slice 1.
2. **Hotel, six ballrooms, one freight elevator** — venue with building/room
   spaces; elevator = contended space (capacity 1) with dimension/weight
   observations and freight-window observations. Derivations: contention and
   clearance reads. Work: none until designs contend.
3. **Synagogue with no real kitchen** — walkthrough observes kitchen:
   *observed-absent* (warming kitchen only, as observations). Feasibility:
   on-site-production profiles derive critical findings. Resolution: commissary
   overrides, menu redesign, or waiver.
4. **Private home, temporary outdoor kitchen** — venue type private home;
   spaces: kitchen (observed: residential 110V), yard (tent site). The
   temporary kitchen is not venue truth — it is the engagement's *design*
   (floor placement + equipment requirements); venue observations bound it
   (power, water, access). Findings derive from design-vs-observations.
5. **Tented event on an empty property** — venue type outdoor property; sparse
   observations (access, grade, power: observed-absent → generator
   requirement). Nearly everything is design + assumptions; the honest-offer
   rule seals the assumptions.
6. **Walked two years ago, renovated last month** — renovation observation →
   critical staleness in scope → walkthrough-required work; publication
   converts to sealed assumption; release blocks unless waived. Old
   observations remain as history.
7. **Two contradictory observations** — §8 rule: class then recency governs;
   material difference → contradiction finding → re-verify work. Both
   observations stand forever.
8. **Accepted proposal, venue assumption disproven** — sealed assumption
   (Commercial) meets contradicting observation → finding against frozen
   commitment → PL exits (revision / waiver / rescission). §12.
9. **Venue shared by multiple tenants** — each tenant's registry entry, spaces,
   observations, and history are isolated by tenancy; nothing crosses. §3's
   ruling makes this trivially safe; the proof obligation (§17) makes it
   certified.
10. **Two simultaneous engagements, one loading resource** — same tenant:
    contention derivation across both engagements' timeline designs against
    the capacity-1 space → derived conflict → resequencing or waiver.
    Different tenants: invisible to each other by law; the venue's own
    scheduling is outside EventCore's truth and enters, if known, as an
    engagement finding ("elevator shared with another event 2–4 PM").
11. **Walkthrough without kitchen access** — coverage declaration: kitchen
    unverified → *unobserved* → feasibility answers "assumption required" →
    follow-up work derived. Never observed-absent.
12. **Venue document conflicts with direct measurement** — measurement (class
    1) governs; document (class 3) difference → contradiction finding; if the
    document is newer and plausible (post-renovation plan), the finding's
    resolution is a re-measurement, recorded as a new observation.

## 17 · Compatibility, slices, proofs, and races

**Untouched in slice 1:** rooms and every consumer; conflict law (the expired-
hold corrective patch remains severable and prior); bookings' offprem fields
(compatibility inputs, E-2); all frozen ceremonies.

**Present / partial / absent / mis-separated:** *Present:* rooms; policy
config; blueprint reuse pattern; fingerprint pattern; the staff-roster
reference-data precedent. *Partial:* off-prem location capture (free text —
becomes a compatibility input feeding venue binding suggestions). *Absent:*
venues, spaces, walkthroughs, observations, evidence, profile/staleness/
contradiction derivations, venue binding, the feasibility contract.
*Mis-separated:* nothing newly found; the parent architecture's finding (global
component profiles homeless in model jsonb) is the next review's item, not
this one's.

**Recommended slices** (each in the established discipline — design →
migrations → proofs → races where write-concurrent → app → mounted UI → browser
→ regression):

1. **Foundation slice** (matches the directive's narrow scope): venue identity
   → spaces → walkthrough record → append-only observations (source classes,
   coverage) → derived current profile (precedence rule) → evidence
   fingerprinting. **Proof obligations:** tenant isolation (cross-tenant reads
   null, writes CEREMONY_NOT_FOUND); append-only (no update/delete under app
   role); correction-by-supersession (superseded observation excluded, history
   intact); precedence (class beats recency across classes; recency wins
   within; contradiction finding derives, never silent override); three-valued
   coverage (unvisited ≠ absent); applicability filtering (date/condition).
   **Race obligations:** concurrent walkthroughs on one venue (both append,
   profile deterministic), duplicate venue create under advisory detection,
   merge racing observation append (redirect + append both survive; profile
   reads through).
2. **Venue binding slice:** the Scheduling fact + compatibility read of
   offprem text; proof: binding is additive, room law unchanged (full conflict
   regression).
3. **Staleness & findings slice:** threshold config, staleness/contradiction/
   walkthrough-required derivations feeding the work projection; proofs of
   derivation determinism and no stored status.
4. **Feasibility contract slice:** §13's reads, consumed first by the
   component-profile review's outputs.

No floor designer, no timeline system, no feasibility engine, and no large UI
ships in slice 1 — the foundation is deliberately boring, provable, and small,
because everything after it stands on whether these facts can be trusted.
