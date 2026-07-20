# ROADMAP — Completing the Organizational Knowledge Model
**Status: Strategic sequencing after the GAP-ANALYSIS, assuming SPEC-004 /
IMPLEMENTATION-004 proceed as planned. This document ranks and assigns spec
numbers; it deliberately assigns no release numbers and no dates — releases
are recorded after they ship, never predicted (RFC convention). Spec numbers
reserve a queue position, and the queue can be reordered by the business
triggers named in §4.**

---

## 0. The destination this roadmap serves

The consultant named what the Library is becoming, and it is worth writing
down as the star to steer by:

> **A Component Definition is everything the company knows about how to
> perform this thing.**

Menu, recipe, kashrut, look, photos, pack list, truck, setup, service,
teardown, lessons — one node, many homes, every home revisioned, every
change deliberate and signed. The gap analysis showed the skeleton already
carries more of this than expected; this roadmap sequences the rest.

---

## 1. Track 0 — Layer registrations (not a spec; a standing work stream)

Six lifecycle stages need **zero architecture** — one `registerLayer()`
each: `warehouse`, `transport`, `setup`, `service`, `breakdown`,
`purchasing`. Each registration is a schema, an empty-state, optional
consequence rules, and it immediately inherits everything: revisioning,
deep-copy instantiation, annotation, promotion (v209).

These proceed **alongside** IMPLEMENTATION-004, content-driven — a layer is
registered when someone has real content for it, never speculatively (an
empty home invites junk). **`warehouse` goes first**: it already exists in
the test harnesses, and it is the layer the Partini operation would live in.

## 2. The ranked domains

Ranked by *(dependency position × business value ÷ size)*. "Unlocks" is the
dependency argument; "value" is argued for this business specifically —
kosher catering, Burger Bar, the Partini rental engagement, and EventCore as
a product.

| # | Spec | Domain | Size | The ranking argument |
|---|---|---|---|---|
| 1 | **SPEC-005** | **Media Graph** | Large | Broadest unlock in the model: sales exemplars, proposal imagery, setup diagrams, photography curation — four lifecycle stages blocked by one gap. It is also **half-built** (evidence side shipped in v192b; the code names its own future) and it hands SPEC-004 its most vivid new act: *promote an event photo to a definition exemplar* — the ceremony's principles applied to a new medium, proving they generalize. |
| 2 | **SPEC-005a** | **Prose homes** (sales copy, proposal descriptions) | Small | A config-document extension — days, not weeks — but principle 9 makes it a deliberate spec act, so it gets a number. Ridered to the SPEC-005 era because media and narrative serve the same surface (the proposal a client actually reads), and because once curation ships (v207), Ben will *immediately* want somewhere to write the pitch. Highest value-per-effort line on this page. |
| 3 | **SPEC-006** | **Item Knowledge** (recipes, kashrut, allergens) | Large | The deepest domain value in the model: **fleishig/milchig/pareve is not metadata in this business — it is the constraint system** governing what may share a board, a kitchen, a truck. Recipes already exist as a Word document because the system has no home; that document is the migration path. This spec owns the shape question the gap analysis deliberately left open — *deepened catalog vs. definition* — as its first constitutional decision, which is exactly why it needs a spec and not a sprint. Feeds purchasing rollups and breakdown/leftovers rules downstream. |
| 4 | **SPEC-007** | **Computable Derivations** (SPEC-002 deepening) | Medium | Looks cosmetic (formulas are display text today); is actually the **arithmetic engine three other domains are waiting for**: requirement quantity formulas ("2 chafers per 50 guests") for inventory mapping, ingredient rollups ("4kg rice / 50 guests") for purchasing, live sizing math in the facet. Sequenced *before* inventory mapping because SPEC-008's formulas shouldn't invent a second expression model — one truth applies to arithmetic too. |
| 5 | **SPEC-008** | **Inventory & Rental Mapping** (requirement → SKU) | Medium-Large | Requirements behave but point at nothing physical. For a rental-heavy operation this is the bridge from knowledge to warehouse reality. Ranked here on *current* facts — but carries the loudest business trigger on this page (§4): **if the Partini engagement lands, this jumps to position 1** and pulls SPEC-007's formula subset with it. |
| 6 | **SPEC-009** | **Structured Outcomes** (feedback, results on instances) | Medium | Technically independent; strategically sequenced *after* promotion has real usage, because its whole purpose is feeding the review — letting a curator weigh *results*, not just frequency ("acrylic: 7 of 9, and the two exceptions rated lower"). Building it before there is a review to feed would be inventory without a customer. Side value: Ben's consulting impact reports currently hand-assemble exactly this data. |
| 7 | **SPEC-010** | **Cross-Definition Relationships** (pairings, bundles, alternatives) | Medium | Real, but its value compounds only when a sales surface exists to act on it — a pairing suggestion with nowhere to appear is a graph nobody queries. Last by dependency-of-value, not difficulty; revisit when proposal/sales UI work is scheduled. |

## 3. The dependency picture, in one diagram

```
Track 0: layer registrations ────────────── continuous, content-driven
                                             (warehouse first — Partini)

IMPLEMENTATION-004 (v207–v210) ── Promotion & Curation, homes that exist
        │
        ├─▶ SPEC-005  Media Graph ──▶ photo promotion (SPEC-004 extends)
        │       └─ SPEC-005a Prose homes (rider, same surface)
        │
        ├─▶ SPEC-006  Item Knowledge ──▶ purchasing rollups, leftovers rules
        │
        ├─▶ SPEC-007  Computable Derivations
        │       └──▶ SPEC-008  Inventory & Rental Mapping   ◀── Partini trigger
        │
        ├─▶ SPEC-009  Structured Outcomes ──▶ deeper promotion reviews
        │
        └─▶ SPEC-010  Relationships       ◀── sales-surface trigger
```

Nothing above blocks IMPLEMENTATION-004, and IMPLEMENTATION-004 blocks
nothing above — the ceremony expands to each new home as it appears, which
is precisely what INV-1's single writing path was built to absorb.

## 4. Business triggers that legitimately reorder this queue

The ranking encodes today's facts; these events change the facts:

- **Partini signs** → SPEC-008 to the front (with SPEC-007's formula core),
  `warehouse` + `transport` registrations become the week's work.
- **A proposal-quality push** (sales season, competitive pressure) →
  SPEC-005 + 005a consolidate to the front; they are already first.
- **A kashrut incident or certification audit** → SPEC-006 immediately;
  in this domain that is a when, not an if.
- **Promotion review reaches habitual use** → SPEC-009's customer now
  exists; schedule it.

## 5. What this roadmap deliberately does not include

- **Training / staff onboarding** as a domain — real, and visibly downstream
  of media + layers + prose (an operating manual *is* training material);
  it earns a spec when those exist to compose from.
- **Cross-tenant / marketplace library** — a product and business-model
  decision, not an architecture queue item (SPEC-004 non-goal, unchanged).
- **Deterministic intent** — still parked exactly where the consultant put
  it: after the Studio speaks the grammar reliably in production.
- **Dates and release numbers** — the queue is a dependency order, not a
  calendar. Each spec gets its adversarial review before a line of its code,
  same as SPEC-004; nothing here pre-approves anything.
