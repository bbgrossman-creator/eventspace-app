# GAP-ANALYSIS — Does the Component Definition have homes for everything the lifecycle knows?
**Status: Analysis for review, prompted by IMPLEMENTATION-004's standing
assumption. No redesign, no implementation. Every claim below about "what
exists" was verified against the v206 codebase, not recalled.**

---

## 0. The assumption under test

IMPLEMENTATION-004 assumes the Component Definition already contains all the
organizational-knowledge homes that Promotion and Executive Curation can
write into — because principle 9 (*curation never invents a new place to put
knowledge*) makes missing homes a hard stop, not a workaround.

## 0a. What a definition actually is today (verified inventory)

1. **The node** — `component_definitions`: name, tenant, provenance,
   archivable. Permanent.
2. **The config document** (revisioned) — exactly four homes:
   `dimensions` · `instanceDefaults` (choices, scalars-with-derivations,
   schemes ref, display, substitutions) · `schemes` · `defaultItems`
   (name, basis, price, position).
3. **Layers** (revisioned per key) — a *generic, open registry*:
   `registerLayer({ key, schema, emptyState, consequenceRules, … })`. Today
   exactly **one** production layer is registered: `kitchen`
   (requirements, equipment, staffing, prepNotes). "warehouse" exists only
   in test harnesses.
4. **Consequence rules** — code, owned by layer registrations.
5. **Adjacent systems that are NOT the definition but hold component-shaped
   knowledge:** `catalog_items` (v178, pricing: name, domain, basis, SRP —
   linked from instance items via `catalog_item_id`); `photos` (v192b
   Component Gallery: instance-attached, groupable by `definition_id`;
   its own header says it is "NOT the Media Graph… the degenerate,
   single-relation case of it").

Four verdict categories are used below: **HOME** (exists, holds it today) ·
**EXISTING-HOME** (fits a home that exists; may need population or a
schema-version bump *within* that home) · **LAYER** (fits the layer system;
needs only a registration — no new architecture) · **MISSING** (no
legitimate home; building one is new architecture, i.e. a spec). Plus one
boundary marker: **NOT-DEFINITION** (real knowledge, wrong owner — it
belongs to another system or to events, and putting it in the definition
would be the error).

---

## 1. The lifecycle walk

### 1. Sales
| Knowledge | Verdict |
|---|---|
| What the component *is* — name, identity, provenance | **HOME** (the node) |
| Default sizing/pricing anchors (per-person price, house standards) | **HOME** (`defaultItems` prices; scalars' derivations) |
| Selling copy — the two-sentence pitch, "why clients love it" | **MISSING (minor)** — the config document has no prose home; `display` is per-instance naming, not narrative. A fifth config-document key is a small spec change, but per principle 9 it *is* a spec change. |
| Exemplar photos to sell with | **MISSING (major, shared)** — see §2.A Media. The Gallery shows *instance* photos grouped by definition (evidence); a *curated exemplar set* on the definition (knowledge) has no home, and the evidence/curation distinction is exactly the one this system refuses to blur. |
| Pairings & upsells ("Sushi Station pairs with Sake Bar") | **MISSING** — no cross-definition relationship model of any kind. |
| Margin targets, discount policy | **NOT-DEFINITION** — pricing system (v178). The definition says what a thing is; pricing policy says what the business does about it. |

### 2. Proposal
| Knowledge | Verdict |
|---|---|
| Default customer-facing description per component | **MISSING (minor)** — same prose gap as sales copy; plausibly the same future home with audience variants. |
| What shows on the proposal by default (`show_on_proposal`) | **EXISTING-HOME** — `defaultItems` doesn't carry visibility flags today; the items already do. A `defaultItems` field addition inside the existing home (schema-version bump of the config document). |
| Presentation looks, named combinations | **HOME** — `schemes`. |

### 3. Pricing
| Knowledge | Verdict |
|---|---|
| Default unit prices | **HOME** (`defaultItems`) |
| SRP, price history, confirmation flows | **NOT-DEFINITION** — `catalog_items` + pricing engine own this, and the `catalog_item_id` link already bridges. |
| Sizing math (pieces per person, guest-count scaling) | **EXISTING-HOME, insufficient depth** — scalars carry `derivation.formula` as *display text*, honest but not computable. Making derivations executable is a SPEC-002-family deepening of an existing home, not a new home. |

### 4. Recipes & item knowledge
| Knowledge | Verdict |
|---|---|
| What an item costs and is called | **HOME** (`defaultItems`) / **NOT-DEFINITION** (`catalog_items` for SRP) |
| Recipes: ingredients, yields, batch scaling, method | **MISSING (major)** — nothing in the definition, the config document, or the catalog knows what an item is *made of*. Ben's recipe book exists as a Word document precisely because the system has no home for it. Note the shape question this raises (flagged, not answered): recipe knowledge is arguably *item*-level organizational knowledge, which may mean its home is a deepened catalog, not the component definition at all. |
| **Kosher status (fleishig / milchig / pareve), hechsher, allergens** | **MISSING (major)** — and in this business it is not metadata, it is *the* constraint system: it governs which items may share a component, a kitchen, a truck. No home anywhere. Same catalog-vs-definition shape question as recipes. |

### 5. Purchasing
| Knowledge | Verdict |
|---|---|
| Per-component shopping profile: pars, lead times, order checklist | **LAYER** — a `purchasing` key; the registry is built for exactly this. |
| Supplier records, standing orders | **NOT-DEFINITION** — vendor knowledge; a Vendors feature already exists in the app. A purchasing layer may *reference* vendors; it must not contain them. |
| Per-item ingredient rollups ("this station needs 4kg rice / 50 guests") | **MISSING** — downstream of the recipe gap; a purchasing layer could hold hand-written rollups tomorrow, but the *derived* version needs item knowledge that has no home. |

### 6. Production (kitchen)
| Knowledge | Verdict |
|---|---|
| Requirements, equipment, staffing, prep notes | **HOME** — the kitchen layer, registered, versioned, with consequence rules. The one lifecycle stage that is fully architected today. |
| Prep timeline (T-minus schedule: rice day-of, fish cut 2h out) | **EXISTING-HOME** — a kitchen-layer schema-version bump; the layer system was designed for exactly this evolution. |

### 7. Warehouse & pack
| Knowledge | Verdict |
|---|---|
| Pack list, bins, load order, count-in/count-out | **LAYER** — `warehouse` already exists in test harnesses and consequence-rule tests; it has simply never been registered in production. The Partini engagement makes this the most commercially urgent unregistered layer. |

### 8. Transport
| Knowledge | Verdict |
|---|---|
| Vehicle needs, fragility, load sequence, temperature constraints | **LAYER** — `transport` (or folded into warehouse; a registration decision, not architecture). |

### 9. Setup
| Knowledge | Verdict |
|---|---|
| Power/water/space needs | **HOME** — consequence rules → `component_requirements`; proven end-to-end in v205. |
| Setup time estimates, crew size | **LAYER** — a `setup` key (or kitchen/warehouse extension). |
| Setup diagrams, reference photos of correct builds | **MISSING (major, shared)** — Media again: a diagram is a curated asset with a *role* ("how to build this"), which is exactly the relation model the Gallery's own header defers to "the Media Graph." |

### 10. Service
| Knowledge | Verdict |
|---|---|
| Staffing ratios | **EXISTING-HOME** — scalars-with-derivations express "1 chef per 60 guests" today as displayed math; kitchen layer holds the staffing roster shape. |
| Service scripts, replenishment cadence, station etiquette | **LAYER** — a `service` key. |

### 11. Photography
| Knowledge | Verdict |
|---|---|
| Event photos as evidence | **HOME** — `photos` + Component Gallery (instance-attached, definition-groupable). |
| Curated exemplars, shot lists ("always photograph the boats from above"), marketing selects | **MISSING (major)** — the definition-side half of media. The evidence half exists; the knowledge half doesn't, and promotion of a photo (event photo → definition exemplar) would be a beautiful, currently impossible act. |

### 12. Breakdown
| Knowledge | Verdict |
|---|---|
| Teardown checklist, equipment return, leftovers policy (with its kosher implications) | **LAYER** — `breakdown` key (leftovers *rules* may eventually want the kashrut model from §4, but the checklist home is just a registration). |

### 13. Rentals
| Knowledge | Verdict |
|---|---|
| "This component requires: 2 chafers, 1 acrylic display" | **HOME** — consequence rules emit requirements; suppression/restore proven. |
| Requirement → rentable SKU / inventory linkage (which *actual* acrylic display, from which pool, at what quantity formula) | **MISSING** — requirements are names with logical keys; nothing maps them to an inventory or rental catalog. Directly relevant to Partini's rental operation; today it would be done by human reading. |

### 14. Post-event learning
| Knowledge | Verdict |
|---|---|
| Configuration learning (choices, items, schemes, layers) | **HOME** — this is SPEC-004 itself. |
| Free-text lessons | **HOME** — annotations (instance) → human rewriting into layer notes (per SPEC-004 §3). |
| Structured outcomes: client feedback, ratings, sold-well/died-on-the-buffet | **MISSING** — no outcome model on instances, therefore nothing for a future promotion review to aggregate beyond configuration frequency. |
| Realized margin, labor actuals | **NOT-DEFINITION** — analytics/pricing territory; a promotion review may someday *read* it, never house it. |

---

## 2. Rollup: the genuinely missing architecture

Ordered by how much of the lifecycle each gap blocks:

**A. Media & assets (blocks sales, proposal, setup, photography).** The
evidence half exists (photos on instances, definition-groupable since
v192b); the *curated* half — exemplars, diagrams, shot lists, with roles and
an evidence-vs-knowledge boundary — does not. The Gallery's own code comment
already names the future ("the Media Graph"). This is the largest gap and
the one the existing architecture most clearly anticipated.

**B. Item knowledge: recipes, kashrut, allergens (blocks recipes,
purchasing, partially breakdown).** Items are names with prices. Nothing
knows what they're made of or whether they're fleishig — in a kosher
operation, the single most consequential absent constraint. Carries an
unanswered shape question: is the home a deepened `catalog_items`
(item-level org knowledge) or the definition? The analysis flags it and
deliberately stops there.

**C. Requirement → inventory/rental linkage (blocks rentals; Partini-
critical).** Requirements exist and behave; they point at nothing physical.

**D. Cross-definition relationships (blocks sales pairings/upsells).**
No model relates one definition to another, at all.

**E. Prose homes on the definition (sales copy, proposal description).**
Minor: a config-document extension — but principle 9 correctly makes even
"add one key" a deliberate spec act, which is this line existing.

**F. Structured outcomes on instances (blocks the deeper half of post-event
learning).** Without it, future promotion reviews can weigh frequency but
never results.

**G. Computable derivations.** Existing home, insufficient depth: formulas
are display text. A deepening, not a new home.

## 3. Rollup: what needs no architecture at all

Six lifecycle stages — purchasing, warehouse, transport, setup (checklists),
service, breakdown — are **one `registerLayer()` call each** away from
having a versioned, promotable, consequence-capable home. This is the
strongest validation in the analysis: SPEC-001's decision to make layers a
generic registry rather than a fixed enum means most of the lifecycle was
pre-architected before its content existed. The kitchen layer is the proof
that the pattern carries a full stage end-to-end.

## 4. Consequence for IMPLEMENTATION-004 (statement of fact, not a proposal)

The assumption under test is **true for everything SPEC-004's ceremony
actually promotes** — choices, scalars, items, schemes, layer content all
have homes today. It is **false for the wider lifecycle**: media, item
knowledge, inventory linkage, relationships, prose, and outcomes have no
homes, and principle 9 means promotion will *correctly refuse* to touch them
until they do. Whether v207 proceeds now (the ceremony is complete for the
homes that exist) or waits on any of §2 is a sequencing decision this
document deliberately does not make.
