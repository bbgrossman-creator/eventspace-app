# EventCore — Component Operational Profile · Bounded Architecture Review (v283)

**Standing.** Repository-grounded architecture review under frozen Constitution
v1.0 and all shipped law through v282. No production SQL, no application code —
rulings only, with proofs and races *designed* for the implementation slices.
The critical question answered here: **how one component declaration becomes the
authoritative source for feasibility, staffing, equipment, kitchen, warehouse,
and logistics — without letting later library edits rewrite an accepted event.**
The one-sentence answer, unpacked throughout: **reference in the library,
revision-pin in the draft, embed at sealing** — and the repository already
enforces the second half of that chain.

---

## 1 · Repository inspection findings

Verified in the repository during this review:

**Where reusable component identity lives: nowhere, yet.** `event_components`
rows are per-engagement instances (`booking_id`, `proposal_version_id`, title,
domain, position). Reuse exists at two other granularities only: **blueprints**
(whole proposal-version reuse — `name`, `source_version_id`, instantiated by
explicit copy) and **copy-forward** (`proposals.ts` copies components + items +
`component_requirements` rows from version to version inside a booking). The
Library Browser's "component identities" are name-derived over instances. There
is no component-definition object to hang a profile on.

**Where operational requirements live: buried, in three places.** (1) The
`component_requirements` table — thin (`name, category, notes`; no quantity, no
unit, no scaling), copied instance-to-instance. (2) The **published model
jsonb** — the richer arrays (`category ∈ equipment/rental/supply/vehicle/staff`,
`role`, `item`, `quantity`) that the shipped consumers actually read. (3)
Application conventions (the `station` flag driving station obligations). The
review's suspicion is confirmed: requirements are part table, part JSON, part
app code — with **no single authoritative shape**.

**What freezes, and when — the good news.** The freeze chain the profile needs
already exists and is already law: version content is version-scoped
(`version_sections`, `choice_groups`, `version_adjustments`, `version_guests`);
**publish seals** the resolved design into `offer_snapshots` (model jsonb +
`artifact_hash` fingerprint); **acceptance freezes** by referencing the sealed
snapshot (PL-4); **release consumes** the accepted snapshot deterministically
(`v275` reads `model→components→requirements`); **obligations derive** from it
(`culinary_prepare` per selection, `equipment_pull` per equipment-class
requirement, station obligations from the flag); **staffing quantities** read
the same arrays (`v278`: `max(req→quantity)` for the role). Copied-versus-
referenced: everything is copied version-to-version and embedded at sealing;
nothing references a live library.

**Conflicts with a one-truth profile system: none structural.** The shipped
consumers read one shape (the model arrays); the compatibility strategy in §12
keeps that shape as a *projection* of the new truth, so v275/v278 continue
byte-compatible. **Stop-condition assessment:** "reusable components lack stable
identity" is true today and is precisely what the foundation slice creates —
the same move as v280, which created venue identity where only free-text
addresses existed. Acceptance and release provide exactly the stable freeze
boundaries required. **No stop condition; proceed.**

## 2 · Current-state model map

```
event_components (instance, per booking/version)
  ├─ component_items (instance content)
  └─ component_requirements (thin: name/category/notes)   ── copied forward
proposal_versions ─ version-scoped content ─ publish ──► offer_snapshots
                                                          (model jsonb: components[]
                                                           .requirements[] the REAL
                                                           consumed shape + hash)
acceptance_records ──► references snapshot (frozen)
release_event ──► reads frozen model ──► obligations (v275) ──► staffing reqs (v278)
blueprints ──► whole-version reuse by explicit copy (StartFromBlueprint)
```

Deficiencies: no reusable identity; no requirement vocabulary, units, or
scaling; no revision history for reusable knowledge; quantity semantics
implicit; aggregation semantics absent; overrides unattributable (a copied row
just differs).

## 3 · Final bounded domain model

Five objects, three of which exist:

- **`library_component`** *(new — the missing identity)*: tenant-local reusable
  component definition (name, kind, notes, active) — the staff/venue reference-
  data mold. Created explicitly, promoted from an instance ("promote to
  library", the blueprint precedent), or created on first profile authorship.
- **`component_profile_revision`** *(new)*: an **append-only, atomic, complete**
  declaration set for a library component — revision N supersedes N−1 as
  *current* (derived: latest), history intact. A revision is authored as a
  whole; there is no per-row editing of a live profile, which is what makes
  "never a mixed profile" provable (§17 race PR-1/PR-2).
- **`profile_requirement`** *(new)*: immutable rows belonging to one revision —
  the declarations themselves (§5–§8).
- **Proposal component instance** *(exists)*: gains one nullable reference —
  `library_component_id` + `profile_revision_id` (the **pin**) — plus override
  facts (§9). Legacy instances with null references remain fully lawful.
- **The sealed model** *(exists)*: at publish, the resolved operational basis is
  **embedded** in the snapshot exactly as commercial content already is —
  declarations, revision provenance, context values, override lineage, resolved
  quantities, unresolved parameters. Acceptance and release then work untouched.

**Ownership rulings:** the profile attaches to the **library component
definition** (not faces/variants — variants are different library components;
not instances — instances pin and override). Reusable profiles **are
versioned** (revisions). Item-level requirements (menu-item production
contributions, Example B) are **permitted by the model but deferred** past the
foundation: the requirement row admits an `item_scope` seam; production-family
item contributions arrive with the kitchen slice.

## 4 · Requirement-family vocabulary

**Hybrid ruling** (the review's third option): **one table, shared identity
scaffold, typed payloads bounded by a server kind vocabulary.** One generic
family would be a JSON dumping ground; nine typed tables would fragment
identity and force nine aggregation engines. The scaffold columns carry
everything cross-cutting (family, kind, capability-vs-item, provision source,
quantity model, aggregation semantics, condition); the payload jsonb is
validated per kind by a server check function — bounded because the **kind
vocabulary is server law**, extended by migration, never by users.

Families (fixed enum): **space** (footprint, frontage, clearance, staging,
storage, circulation, queue) · **utility** (circuit, amperage, voltage, water,
drainage, gas, ventilation, data) · **equipment** (owned/rented/venue-provided
equipment, smallwares, serviceware, transport, safety) · **labor** (role,
skill, headcount by phase, supervisor) · **time** (lead time, setup, service,
replenishment interval, breakdown, reset) · **production** (kitchen access,
commissary, refrigeration, freezer, hot holding, finishing, plating, dish,
sanitation) · **access** (loading, freight elevator, stairs, path, vehicle,
windows, security, dock) · **environment** (indoor/outdoor, weather, fire,
flame, noise, floor loading, food safety, allergen separation) ·
**consumable** (fuel, ice, disposables, linens, serving pieces, stock,
replenishment quantities).

Three orthogonal distinctions on every requirement, settled now because
aggregation depends on them: **capability vs item** (`hot holding for 40 pans`
vs `1 carving lamp`) — the capability form is also how most "alternatives"
dissolve (§10); **provision source** ∈ company / rented / venue / any;
**consumable vs asset** (consumables aggregate additively and deplete; assets
are countable and phase-reusable).

## 5 · Units and dimensions

Server unit vocabulary per kind (ft, sqft, amps, volts, gal, cuft, count,
hours, minutes, lbs, servings…), stored as `(amount numeric, unit text)` with
the unit checked against the kind's allowed set — the v280 structured-value
discipline. No free-text quantities; narrative may accompany, never replace.

## 6 · Scaling model — deterministic, no expressions

A requirement's quantity is a **bounded declarative structure**, never a
formula:

`basis` ∈ {fixed, per_instance, per_service_point, per_guest, per_guest_band,
per_table, per_hour, per_shift, per_batch} · `rate numeric` · `band_size int`
(per_guest_band) · `min` · `max` · `rounding` ∈ {ceil, floor, nearest}.

Resolution is one server function: `resolve_quantity(scaling, context)` =
clamp(round(rate × basis-count(context))), with per_guest_band counting
`ceil(guests / band_size)`. Deterministic, provable (proof SC-1/SC-2), and
expressive enough for every worked example (§14). Anything it cannot express is
either two requirements or a future *named* basis added by migration — never a
client formula, never an executable expression (the stop condition is thereby
avoided by construction).

## 7 · Context parameters

A **server-bounded parameter vocabulary**: guest_count, duration_hours,
service_points, table_count, location_class (indoor/outdoor), service_style,
ware_class (china/disposable), kosher_class, floor_level, travel_class. The
architecture distinguishes, as required: **declared parameters** (what the
profile's scaling references), **resolved values** (engagement facts —
guest_count from the count machinery; service_points from explicit selection;
others declared on the instance), **derived quantities** (§6 output), and
**unresolved inputs** — a parameter with no value resolves the requirement to
an explicit `unresolved` state (the three-valued spirit: visible, never
guessed, embedded as-unresolved at sealing). No inference from display text,
ever.

**Conditionals — bounded now, branches never:** a requirement may carry one
optional `(condition_param, condition_value)` pair — it applies only when the
resolved parameter equals the value (v280's `condition_key` precedent). This is
how **Example E (kosher)** works without duplication: requirements conditioned
on `kosher_class` (separate prep area, sealed transport, supervision) are
declared once on affected components — or once at engagement level (§9's
additive overrides) — and activate by context. Multi-branch conditional trees
are deferred; if ever needed they arrive as a bounded structure, not a rules
engine.

## 8 · Aggregation semantics — declared in v283, computed later

Every requirement declares two enums the future engine will need and v283 will
not compute:

`aggregation` ∈ **additive** (amps, frontage, consumables — sum) ·
**shareable** (one tent, one handwashing station can serve many components) ·
**capacity** (refrigeration cuft, hot-holding pans — sum the demand, satisfy
with any capacity ≥) · **exclusive** (a dedicated kosher equipment class).
`temporal` ∈ **concurrent** (demand exists during overlapping service),
**phase_reusable** (the same tables serve setup through breakdown),
**consumed** (fuel, ice).

This answers the refrigerator and amperage puzzles exactly as the review poses
them: two components each declaring `capability: refrigeration, 10 cuft,
capacity` aggregate to *20 cuft of demand*, satisfiable by one large walk-in —
not "two refrigerators"; two `20 A, additive, concurrent` declarations are 40 A
concurrent *unless* the future timeline engine proves non-overlap — semantics
preserved, timeline logic explicitly not performed. **No aggregation is
computed in v283**; the enums are the contract.

## 9 · Overrides, corrections, provenance

**Library side:** correction = a **new revision** with reason and lineage
(`supersedes_revision_id`) — append-only, history intact, current derived. No
in-place edits (races PR-1/CC-1 depend on this).

**Instance side — exactly four override kinds, all attributable facts:**
**parameter** (set `service_points = 2` for this engagement), **suppress** (a
library requirement, with required reason — "venue provides tables"), **add**
(an engagement-specific requirement, same schema as library rows — this is also
where Example D's event-level needs live), **replace** (substitute declaration
with lineage to the replaced library requirement). Overrides are append-only
with the v281 seq-derivation pattern (latest per target governs; corrections
require reasons). At sealing, the embedded basis records every override with
actor, reason, and lineage — inspectable forever.

## 10 · Alternatives and dependencies — the two restraint rulings

**Alternatives: mostly dissolved, remainder deferred.** The hot-holding example
("venue oven OR mobile hot box OR insulated transport") is not an OR-group —
it is a **capability requirement** (`hot_holding, 40 pans, capacity,
provision: any`), and *which satisfier* is chosen is exactly the feasibility
engine's and floor/timeline design's job. With capability-vs-item and
provision-source in the scaffold (§4), genuine OR-groups shrink to rare cases;
they are **deferred** to a bounded later slice rather than buying a rules
engine now.

**Dependencies: not in the profile.** Component-on-component, phase, and batch
dependencies are timeline-layer facts; venue-capability needs are already
requirements (capability kind); staffing skill is a labor requirement. The
v283 profile carries **no dependency graph** — the strongest guard against
premature department modeling.

## 11 · Freeze-boundary ruling (the review's central map)

```
Library profile revision N            (append-only; current derived)
   │  attach: instance PINS revision N          [reference — sufficient]
   ▼
Draft proposal component               (pin + overrides; library edits INVISIBLE)
   │  explicit refresh ceremony: adopt revision M whole   [never mixed]
   ▼
Version sealing (publish)              (SNAPSHOT REQUIRED — embed everything: §3)
   ▼
Acceptance                             (frozen by existing PL law — snapshot ref)
   ▼
Operational Release                    (consumes the accepted snapshot — exists)
   ▼
Department obligations                 (derived from the frozen basis — exists)
```

Direct answers to the posed questions: a **reference suffices** in the library
and in drafts (the pin makes drafts deterministic); a **snapshot is required at
sealing** and is the *only* snapshot needed — acceptance and release already
freeze by reference to it, so no second operational snapshot object is created
(release *may* later add a generation fingerprint, deferred). **What is
snapshotted:** declarations + revision id + context values + resolved
quantities + unresolved parameters + full override lineage. **Draft refresh is
voluntary and explicit** — a ceremony adopting a complete revision, re-resolving,
preserving overrides where targets still exist and surfacing orphaned ones.
**An accepted event adopts a corrected profile only through PL revision
machinery** (new version, re-embed, re-accept) — the ceremony already exists
and no new one is invented; post-release correction belongs to the future
exception family. **Release with unresolved parameters:** lawful in v283-law
(embedded as unresolved); *gating* on them is the feasibility engine's
release-predicate contribution later, through the existing sign-off/waiver
legs. **Release freezes resolved quantities AND declarations AND context** —
everything, because obligations must be regenerable bit-for-bit. No hidden
synchronization exists anywhere in the chain by construction: every arrow is a
ceremony.

## 12 · Relationship to staffing and equipment (no second truth)

The shipped consumers read one shape: the model's `requirements[]` arrays
(staff: role+quantity for v278; equipment/rental/supply/vehicle: item for
v275). Ruling: **the unified profile becomes the source; the legacy array
becomes its projection.** At sealing, the embedder renders labor requirements
into the exact legacy staff shape and equipment-family requirements into the
exact legacy equipment shape — v275 obligation generation and v278 staffing
quantities continue **byte-compatible, unmodified, unaware**. Staffing law is
not migrated, wrapped, or duplicated: it is *fed*. The thin
`component_requirements` table remains as-is for legacy copy-forward
(compatibility input, E-2), never consulted by the new profile system, retired
only by a far-future cleanup. Existing proposals, blueprints, and instances
with no library linkage remain fully lawful — the entire system is opt-in per
component.

## 13 · Authority and tenant isolation

Everything tenant-local (v280 ruling extends: profiles are operational
intelligence). Library and profile authorship under a `can_manage_library()`
evaluator (existing role pattern); instance overrides under proposal-edit
authority; all ceremonies default-deny, `CEREMONY_NOT_FOUND` non-disclosure;
RLS select+insert on append-only tables, select-only on derived reads. No
cross-tenant library sharing (a future marketplace would be its own review).

## 14 · The worked examples, resolved

**A · Carving station:** stations = `per_guest_band(125), min 1`, overridable
by explicit `service_points` parameter; chef and attendant = labor,
`per_service_point, 1` (chefs follow stations, not guests); circuits =
utility `per_service_point, 2 × 20A, additive, concurrent`; frontage = space
`per_service_point, 8 ft, additive`; lamp/board/knife kit = equipment items
`per_service_point` (a second station duplicates them — correct); hot holding
= production **capability** (capacity) — venue power vs generator is
provision-source `any` + feasibility's future choice. **B · Passed hors
d'oeuvres:** servers = labor `per_guest_band(25)`; tray sets = equipment
`per_service_point` where service_points := resolved server count — expressed
as rate-linked labor+equipment pair now; per-item production quantities =
item-scope production seam, deferred; cross-component server aggregation =
additive+concurrent semantics, engine later. **C · Buffet:** frontage/tables/
linen/chafers per buffet line (`per_service_point`); plates/flatware/napkins
`per_guest` consumables; chafers/utensils assets; fuel consumable
`per_service_point × hours`; venue-provided china = provision-source venue or
an instance suppress-with-reason. **D · Outdoor:** tent/generator/handwashing
declared by the components needing them with `shareable` aggregation, or added
engagement-level via additive overrides; sharing resolution = future
aggregation engine. **E · Kosher:** `kosher_class` context parameter +
conditioned requirements + exclusive equipment class (§7) — declared once,
activated by context, never copy-pasted across components.

## 15 · Proposed invariants, ceremonies, surfaces (for the implementation slices)

**Invariants:** I-P1 tenant isolation everywhere; I-P2 library identity is
uuid, names advisory (SIM proof); I-P3 revisions append-only, atomic,
lineage-linked; I-P4 requirement rows immutable per revision; I-P5 instance
pin references an existing revision of the same tenant; I-P6 overrides
append-only, attributed, reasoned where destructive (suppress/replace);
I-P7 sealing embeds a complete basis (revision + context + overrides +
resolutions) — no partial embed; I-P8 sealed/accepted/released bases are
untouched by any later library write (hash-proven); I-P9 scaling resolution is
a pure function (same inputs ⇒ same output); I-P10 no mutable
completeness/readiness/feasible column exists (derived only); I-P11 the legacy
model projection is byte-shape-compatible with v275/v278 consumers.

**Ceremonies:** `create_library_component`, `promote_component_to_library`
(from an instance, blueprint-style), `author_profile_revision` (full set +
reason + lineage), `attach_component_profile` (pin), `refresh_component_profile`
(explicit whole-revision adoption), `override_component_requirement`
(parameter/suppress/add/replace), plus the sealing embedder inside the existing
publish path (additive extension of what publish already builds).

**Surfaces (describe-only, per the directive):** Library Inspector —
profile summary grouped by family, scaling rules, revision history, derived
completeness findings (missing units, unresolvable parameters). Proposal
Component Inspector — inherited basis, resolved quantities, unresolved
parameters highlighted, override list with lineage, diff-from-library.
Accepted/Released view — the frozen basis with provenance, read-only, no
refresh affordance.

## 16 · Proof obligations (designed)

The directive's 23, mapped to families: ISO (tenant isolation; policy and
profile), LIB (identity by uuid; similar names irrelevant — the v281 SIM
pattern), REV (versioned history; no destructive rewrite; correction lineage),
PIN (draft stability under library edits; refresh explicit; refreshed draft is
wholly revision M), FRZ (archived/accepted/released bases hash-identical
before/after library edits — the v282 HIS hashing pattern), SC (deterministic
scaling; units/rounding; band mathematics), PRM (parameter resolution;
unresolved visibility — never guessed), OVR (additive overrides; suppression
attribution; replacement lineage), CMP (staffing truth not duplicated —
the embedded staff projection equals what v278 reads today; equipment likewise;
generation regression bit-identical), NEG (no feasibility conclusion string;
no obligation row created by any v283 object), AGG (semantics enums present
and embedded, nothing computed), RES (zero residue, rerunnable).

## 17 · Race obligations (designed)

**PR-1** library revision authorship vs proposal sealing → the seal embeds
exactly one coherent revision (the pin), never a mix — guaranteed by atomic
revisions + pin; race proves it. **PR-2** draft refresh vs concurrent revision
authorship → the draft adopts wholly N or wholly N+1 (revision atomicity + row
lock on the instance). **AC-1** acceptance vs refresh → acceptance freezes the
sealed snapshot; a concurrent refresh touches only the draft (distinct
objects); prove no interleaving corrupts the accepted basis. **RL-1** release
vs accepted-design correction → release locks the booking (existing v275
pattern); no partial snapshot possible; prove both orders lawful. **CC-1**
concurrent profile corrections → both revisions append; current deterministic
(seq — the v281 lesson applied from day one). **OV-1** concurrent instance
overrides → both facts survive; latest-per-target governs. **OB-1** requirement
correction vs obligation generation → *identified now, proven at the feasibility
/execution slice*: the boundary is the release lock + the frozen snapshot;
post-release corrections route through the exception family, so generation
never reads a moving basis.

## 18 · Compatibility and migration plan

Additive throughout: new tables only; one nullable column pair on the instance;
publish embedder extended additively (legacy arrays still produced, now *from*
the profile when a pin exists, from legacy copy-forward when not); zero changes
to v275/v278/v279 SQL; zero changes to acceptance/release; blueprints untouched
(they copy instances, pins ride along). Migration of existing components into
the library is **manual and opt-in** (promote ceremony), advisory-matched by
name, never automatic — the v280 duplicate philosophy. Nothing accepted or
released is ever rewritten (stop condition avoided by the freeze chain itself).

## 19 · Recommended implementation slices

The review's proposed numbering survives inspection with one merge:

- **v283 — Operational Profile Foundation** *(the smallest lawful slice)*:
  library component identity + promote ceremony + append-only profile
  revisions + requirement rows **with the full scaffold schema** (families,
  kinds, units, scaling struct, aggregation enums, conditionals) + authoring
  ceremonies + resolution function + proofs (ISO/LIB/REV/SC/PRM/RES) + races
  (CC-1) + a minimal Library Inspector surface. The vocabulary/scaling
  substrate ships *with* the foundation (the prompt's v283+v284 merged): a
  profile object with no requirement schema would be an empty ceremony, and the
  scaling struct is schema, not behavior.
- **v284 — Proposal inheritance**: pin, explicit refresh, the four overrides,
  sealing embedder + legacy projection, FRZ/PIN/OVR/CMP proofs, PR/AC/OV
  races, Proposal Component Inspector.
- **v285 — Hardening & compatibility**: promote-from-history tooling, item-
  scope production seam, completeness derivations, release-fingerprint
  option, RL-1 race, frozen-view surfaces.
- **v286+ — Feasibility engine** (requirements × venue knowledge, the v282
  finding vocabulary extended), then aggregation/timeline per the parent
  architecture's sequence.

## 20 · Explicit deferred list

Feasibility comparison and readiness scoring · feasibility waivers · floor
placement · timeline scheduling and temporal aggregation · kitchen production
orders · warehouse pull lists · staffing assignment changes · logistics
routes · alternative/OR requirement groups · multi-branch conditionals ·
item-level production contributions · dependency graphs · cross-tenant library
sharing · automatic instance→library matching · customer-facing operational
detail · Workspace Architecture · AI recommendation logic.

---

**Closing.** The repository turned out to hold both the problem and the answer:
requirements are buried in three shapes with no reusable identity — and yet the
freeze chain (seal → accept → release → derive) is already exactly the
machinery a one-truth profile needs, already proven, already consumed by
staffing and obligations. v283 therefore builds only what is genuinely missing
— identity, revisions, vocabulary, scaling — and threads it through boundaries
that frozen law already guards. One declaration on the carving station; the
sealer embeds it; acceptance freezes it; release derives from it; staffing,
warehouse, kitchen, and — later — feasibility all read the same frozen truth;
and the library remains free to learn, because nothing downstream ever looks
back at it.
