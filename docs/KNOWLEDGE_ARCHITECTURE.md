# KNOWLEDGE ARCHITECTURE

*EventCore · v1.0 · February 2026 · frozen; changes by RFC amendment only · amended July 2026: §10 Lenses paragraph added; §11 SPEC-003 and SPEC-005 reservations corrected before binding, numbering-registry and Track 0 paragraphs appended — per AMENDMENT-001 (Rev A)*

Sections 1–3 are philosophy: readable by a business owner, free of implementation, and stable. Sections 4–11 are the machinery that serves them. If philosophy changes, implementation changes. If implementation changes, philosophy must not. Proposals follow the RFC convention (`VISION.md`, "How these documents are used"): cite the section you implement or amend, or propose the amendment first.

---

## 1. Philosophy

EventCore distinguishes between **live work**, **evidence**, and **curated knowledge**. The platform is not a document editor; it is an organizational memory system. Every artifact retains provenance. Search discovers knowledge. Promotion curates it. Execution validates it.

Knowledge in EventCore is never merely text. A menu is a seeded operational design: what the customer reads, what the kitchen preps, what production schedules, what the warehouse packs, what the floor requires, what the photographer captures. Reusing knowledge means reusing the whole design, with every layer it carries.

Three commitments hold everywhere:

1. **The source is never changed by being used.** Reuse creates an editable instance; the original is untouched.
2. **Everything remembers where it came from.** No object appears from nowhere; no copy forgets its origin.
3. **The system states facts; people make judgments.** EventCore reports what happened and what was decided. It does not rank, praise, or predict.

## 2. The Knowledge Model

Every object in EventCore belongs to exactly one of three states. When someone proposes a new feature, the first question is: *which of the three is it?*

**Evidence — "this happened."**
*Evidence: a fact produced by the operation itself* (the canonical definition; `VISION.md` carries it identically). Past events, their executed designs, their photographs, their real costs and counts. Evidence is immutable. It accumulates. It may be referenced, copied from, and learned from — never edited, never deleted casually, never silently repurposed. A photograph of the Goldberg wedding remains a photograph of the Goldberg wedding no matter where it later appears.

**Curated knowledge — "this is how we do it."**
Blueprints, starter templates, recipes, collections, reusable components. Curated knowledge exists because a person deliberately created or promoted it. It is versioned, owned, and attributed: someone's name is on the decision. It represents intention, not history.

**Live work — "this is what we're doing."**
The current proposal, the current design, the event in flight. Mutable, owned by a booking, moving toward execution. When executed, live work crosses into evidence — one direction only.

Evidence and intention must never blur. A past event is not a template. A template is not proof anything occurred. The Promote ceremony (§7) is the *only* bridge between them, and it requires a human act.

## 3. Knowledge Types

Types are concepts, not tables. Each declares its lifecycle, owner, provenance behavior, permissions, and instantiation behavior. The initial set:

| Type | State | Notes |
|---|---|---|
| Past Event | Evidence | Immutable record of an executed booking; found by search, never edited |
| Photo | Evidence | Belongs to the moment it captured; crosses into new work only as a labeled reference |
| Blueprint | Curated | The company's standard; versioned; created fresh or promoted from evidence |
| Starter Template | Curated | EventCore-provided seed knowledge; global; read-only to tenants |
| Component | Curated | A reusable station or unit (Sushi Station, Viennese Table) with its operational layers |
| Recipe | Curated | Kitchen-layer knowledge; attachable to components |
| Venue | Curated | A place and its constraints: footprints, docks, power, rules |
| Collection | Curated | A pointer-only grouping ("2026 Trends", "Michael's Favorites"). Owns nothing; **never instantiable as a whole** — open it and use its members. A deleted member shows an honest tombstone, never a silent hole |
| Floor Layout, Production Pack, Staffing Plan, … | Curated | Join as their layers ship (§10) |
| Proposal / Design version | Live | The working object of the Studio |

A new type earns its place by answering: which state, who owns it, what does instantiating it mean, and where may it legally land (§6).

## 4. The Library Contract

The Library is the unified search and discovery surface for everything reusable in EventCore. Users search for what they want to accomplish, not for where knowledge is stored — and everything instantiated from the Library remembers where it came from, so what the company does becomes what the company knows.

The Library knows no type by name. Each type **registers** itself by implementing one contract:

```
LibraryEntry
  id            — stable identity
  kind          — registered type
  title         — primary label
  subtitle      — provenance line (e.g. "Past Event · May 2026")
  cover         — per the cover hierarchy (§8)
  tenant        — scope: global | tenant | personal
  tags          — free labels
  facets        — structured filters (§5)
  text          — searchable body
  layer_badges  — which operational layers this object actually carries
  provenance    — lineage pointer (§7)
  pointer       — the object's home

Registered behavior
  projection()        — how the object becomes a LibraryEntry
  renderer()          — its card; a menu looks like a menu, a photo like a photograph
  preview()           — its detail view
  drag()              — its payload
  legalDestinations() — where it may land (§6)
  instantiate()       — what "use this" creates
  cover()             — its cover resolution
```

The discipline that keeps this honest: **adding a knowledge type must not modify the Library.** When Recipes ship, the diff touches zero Library files. If it can't, the registry has failed. Native schemas stay separate — different lifecycles, permissions, and editing rules per type — and the envelope is the only thing search ever reads.

`layer_badges` is load-bearing: a card advertises exactly which layers it carries. "Entire menu" always means "everything this object actually has, clearly labeled" — never a simulation of layers that don't exist yet.

## 5. Search

Search queries the envelope, never the native tables.

**Projection.** Every type projects into one index carrying the shared facets: event type, kosher classification, meat/dairy/pareve, cuisine, service style, meal period, guest range, price tier, formality, season/holiday, major components. Tenant scoping is enforced *again* at the index — a search surface that leaks across tenants is a leak regardless of how clean the source tables are.

**Intent.** Queries like "premium kosher bar mitzvah sushi 250 guests" resolve by token-to-facet mapping where unambiguous, full-text over the remainder. This is deterministic and honest; semantic search may come later and must not be promised before it exists.

**Ranking and grouping.** Relevance scores across different corpora are not comparable, so results are ranked only *within* a kind and presented as grouped rails (MENUS · COMPONENTS · PAST EVENTS · RECIPES · PHOTOS · VENUES …), sections appearing only when non-empty, ordered by their best hit. The grouped layout is the ranking model made visible.

**Explore.** The second doorway into the same index: no text, only facets and computed groupings ("last summer" is a date facet; "premium cocktail hours" is two facets). Search is intentional; Explore is inspirational. One index, two doors.

**Retrieval aids.** Favorites, pinned, recently used, my team — all facts about a person's own behavior. (Not "trending"; see §9.)

## 6. Grammar

One grammar. Never exceptions. Extends the Studio grammar (see `UI_GRAMMAR.md`) without changing its meaning.

```
Library → Canvas         instantiate (source unchanged; instance editable)
  Menu / Blueprint  →  Canvas          whole design, via the landing decision
  Chapter           →  chapter gaps    instantiate chapter
  Component         →  chapter gaps    instantiate component
  Recipe            →  component       lands in the kitchen layer
  Photo             →  component/item  attach as reference (provenance kept)
  Floor layout      →  operations layer
Canvas → Canvas          rearrange (same parent) or move (new parent)
```

Rules that never bend:

- **Instantiate never edits the source.** Dragging never edits, never copies Canvas objects.
- **Every drag has a click path.** A type that can't offer both isn't ready to be draggable.
- **Full designs never merge silently.** Onto an empty Canvas, a whole menu instantiates directly — there is nothing to protect, and confirmation would be ceremony without a decision. Onto a populated Canvas, the drop *opens* the landing decision — Add to current · Replace current draft · Choose content — and commits nothing until chosen. The drop is the request, not the commit. Replace additionally confirms, because it is destructive.
- **Legality is declared, not inferred.** Each type's `legalDestinations()` feeds the same DropBand machinery; illegal destinations are refused — not rendered as a faint maybe.
- **The handle disambiguates.** A card's drag handle means "use this object." A photo thumbnail inside a card means "use this photo." Grabbing is always by handle; the image is never an ambiguous grab surface.

## 7. Provenance

Every reuse action creates lineage. The verb set is closed and small:

```
instantiated   — knowledge became live work        (instantiated_from + instantiation_id)
modified       — live work diverged from its source
promoted       — evidence or live work became curated knowledge (by whom, when, from what)
archived       — curated knowledge retired, never erased
merged / split — curated knowledge restructured, lineage preserved on both sides
```

Two stamps carry the graph: `instantiated_from` (identity of the source) and `instantiation_id` (grouping every row one instantiation created — which also makes "undo an instantiation" an atomic removal, and is a standing argument for the inverse-operation stack).

The genealogy must be visible: *Starter Template → Company Blueprint → Goldberg Wedding → modified → promoted → Current Blueprint.* Git history, for how the company cooks.

**Promote** is the ceremony at the center of the platform. It is the only bridge from evidence to intention: a person selects what an executed event proved, strips the customer, keeps the operational learning, and puts their name on "this is now how we do it." Never automatic. Promotion is publishing knowledge back into the organization. Photos crossing this bridge stay evidence — they arrive in new work as *"Reference images from Goldberg Wedding"* and never become proof the new event occurred.

**Knowledge exists through time.** EventCore preserves not only what the company knows, but when it knew it. History is never overwritten; it becomes part of the organization's memory. "What did we believe in 2024?", "when did this become the standard?", "which version did Goldberg actually use?" are questions the system must always be able to answer — archiving retires knowledge, nothing erases it.

Provenance is also what makes organizational intelligence computable rather than asserted: *used in 142 events, most often paired with Carving Station, average 248 guests, usually follows Salad Trio* — every one a query over stamps, stated in §9's vocabulary.

## 8. Covers

Every Library result is visually identifiable; no result ever shows a broken image, an empty gray box, or a generic icon. Absence of photography is handled as a feature, not a deficiency — many past events will simply have none, and the Library must not look half-finished because of it.

Resolution order:

```
1. Explicit Library Cover      — chosen by a person, independent of the gallery
2. Event hero photo            — ⭐-marked at event level
3. Hero component photo        — ⭐-marked on the most distinctive component
4. Generated collage           — 2–4 component photos, composed automatically
5. Generated informational cover — deterministic render from the entry's own
   facets: event type, glyph summary of major components (🍣 🥩 🍰), guest
   count, tier, type-coded color. Stored nowhere; recomputed, so it can
   never go stale.
```

Hero is an explicit per-photo flag at both event and component level; the Library always prefers heroes. AI-generated preview imagery is parked: it manufactures pictures of events that never happened, uncomfortably close to the evidence line — if it ever ships it must be unmistakably labeled illustration.

## 9. Vocabulary

The system speaks in evidence. Statements about knowledge are computed facts in past tense with visible numbers:

```
Allowed:  Used in 142 events · Last used 2 weeks ago · Promoted by Michael,
          May 2026 · Average guests 248 · Most often paired with Carving
          Station · Usually follows Salad Trio · Never used
Forbidden: Best · Popular · Trending · Recommended · ★★★★★ · any ranking
           adjective or score the system invented
```

"Verified" may appear only as the record of a Promote ceremony — a human act with a name attached — never as an algorithmic badge. This constraint applies to every surface that mentions knowledge: cards, detail views, the Inspector, future intelligence panels. It is what keeps the system intellectually honest, and it is enforced by review: any new UI string describing knowledge is checked against this section.

**Everything is explainable.** Every fact, suggestion, and relationship shown by EventCore must be explainable by evidence the user can inspect. Whatever arrives later — recommendations, AI, "suggested menus" — the answer to *Why?* is always "Used in 42 events," never "our model thinks so."

The distinction between proven and unproven knowledge is drawn with facts, not stars: *Used in 42 events, last used 2 weeks ago* versus *Never used* tells the user everything the stars would have pretended to.

## 10. Capabilities

**Capabilities are the source of truth. Subscription tiers are merely predefined collections of capabilities. The application never reasons about plans directly.**

Every feature declares a capability (`library.search`, `library.promote`, `library.company_blueprints`, `production.kitchen`, `production.warehouse`, `operations.floorplans`, `proposal.customer_view`, …). A tier is nothing but a named bundle of capabilities; a tenant may also carry individual grants and revocations on top of its bundle. Consequences, all deliberate:

- `if (plan === "Professional")` must never appear in the codebase. The only legal question is `can("library.promote")`.
- Custom contracts are capability sets, not code: "Enterprise Library, Starter Proposals" is an assignment, not a feature.
- Beta programs are capability grants to specific tenants (`ai.menu_generation` for five customers), not new tiers and not special-cased code.
- New tiers, repackaging, and pricing experiments change data, never architecture.

**Capabilities and layers compose by intersection.** A template carries the layers it carries (`layer_badges`, §4); a tenant can see the layers its capabilities allow; a surface renders the intersection. Neither side reasons about the other — a template does not know about tiers, and a capability check does not know about templates. Enforcement is layered like tenancy: capability checks gate the UI, and the API enforces them again, because a hidden button is not a security boundary.

**Lenses.** A Lens is a registered projection over canonical objects, serving one declared operational concern — the graph, turned for one kind of work. A Lens is available through the intersection of its registration, the organization's capabilities, and the person's permissions; within an available Lens, what renders is determined by the objects' actual state. A Lens owns no objects, no storage, and no truth. Its behavioral contract is `UI_GRAMMAR.md` §2a. *(Added by AMENDMENT-001.)*

## 11. Roadmap

The only section where release versions may appear — and only *after* shipping. Roadmap entries cite SPEC numbers (the stable identifiers); a release number is recorded against an entry once it has actually shipped, never predicted. Everything above is timeless.

- **SPEC-001 — Component Knowledge Foundation** — shipped in v200. The permanent definition node, revisioned layers, the registry, the fork rule, the configurable-family invariant.
- **SPEC-002 — Component Instantiation & Configuration** — the foundation becomes visible: drag a definition from the Library, receive a live instance, configure it (selection, quantities, schemes, props, staffing, per-layer overrides) without ever touching the definition.
- **SPEC-003 — Operational Lenses** — **bound** (drafted and accepted July 2026, Rev A, with the Kitchen-validates-the-pipeline advisory). Reservation history: corrected from "Production Lens" before binding (AMENDMENT-001): no specification by that name was ever drafted, and the production/kitchen lens is the first *instance* of the general concept this specification will define. Existing references to "the Production lens (SPEC-003)" in shipped documents (SPEC-001, SPEC-002) remain accurate as written — the kitchen lens is inside the corrected reservation's scope — and are not retroactively edited.
- **SPEC-004 — Knowledge Curation & Promotion** — the ceremony: executed-event knowledge promoted, merged, and curated back into the Library.
- **SPEC-005 — Media Graph** · **SPEC-005a — Prose homes** — reserved, per `ROADMAP-knowledge-model.md`. Reservation corrected before binding (AMENDMENT-001): the former provisional subject at this number, "Additional operational layers," described Track 0 work, not a specification (its prior wording is preserved in the amendment record). The former "Layer slices" entry in this section is henceforth read as Track 0 work as well; its content — each layer ships with its Library projection, each lights its badge — stands as the description of what a registration delivers.
  *Convention note: unwritten specs are referenced by concept; a number binds only when the spec is drafted — numbered predictions rot like versioned ones.* The Library's package schema is designed against the *post*-migration component model; building instantiation before it means building it twice.
- **Library slice 1** — envelope + registry, grouped search pane (Ctrl+K), kinds that exist today: menus/blueprints, components, past events, media. Customer layer instantiates fully; `layer_badges` tell the truth about the rest.
- **Layer slices** — kitchen, production, operations, warehouse, floor, staffing. Each ships with its Library projection; each lights its badge; instantiation deepens accordingly.
- **Promote ceremony** — with the provenance verbs and genealogy view.
- **Collections, Explore, organizational-intelligence panel** — cheap once stamps exist; queries, not engines.
- **Knowledge Health (admin)** — per-object completeness: photos ✓, recipes ✓, kitchen ✓, operations ⚠ missing, warehouse ⚠ missing → "this knowledge object is 72% complete." Completeness, not popularity, is the metric that tells an administrator where the Library needs work. Depends on the layers existing; specified now so types declare their expected layers from day one.
- **Deferred deliberately** — semantic/AI search, AI-generated covers, any recommendation engine. Each waits until it can meet §9.

**The numbering registry.** Specification numbers are canonical identifiers and this section is their registry of record. An entry here may **reserve** a number and a provisional subject; the number **binds** only when its specification is drafted and accepted. Before binding, a reservation may be corrected by constitutional amendment, with its prior wording preserved in the amendment record. After binding, neither the number nor its subject is reused, renumbered, or reassigned; a superseded bound specification retains its identifier permanently. Sequencing and priority of reserved specifications are *guidance*, owned by roadmap documents and legitimately reorderable by business triggers; the identifiers themselves are constitutional. Concepts referenced but unnumbered take their numbers at drafting, per the standing convention above. *(Added by AMENDMENT-001.)*

**Track 0 — registrations are not specifications.** Track 0 consists **only** of additions through a declarative socket whose controlling specification explicitly authorizes new entries without further model or constitutional decisions. Today's authorized sockets: layer registrations (SPEC-001 §1.3), layer-scoped move kinds (SPEC-002 §1.2), and promotion kinds (SPEC-004 via READINESS F-4). Track 0 work is continuous, concurrent with any specification, and content-driven — a registration lands when someone has real content for it, never speculatively (an empty home invites junk). Track 0 is defined by a specification's explicit authorization, never by implementation pattern: building a new registry does not create Track 0 work, and if proposed "registration" work requires new storage, a new model, or a constitutional decision, it was never Track 0 — it is a specification, and it takes a number. *(Added by AMENDMENT-001.)*
