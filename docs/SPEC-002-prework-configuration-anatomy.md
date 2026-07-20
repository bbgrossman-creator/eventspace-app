# SPEC-002 PRE-WORK — What Exactly Is Configurable?

*EventCore · working document · shapes SPEC-002, is not SPEC-002*

The assignment: for one component — the Sushi Station — write down everything that can vary between two events, in business terms, before any database discussion. Then see what the list reveals.

---

## Part 1 — Everything that varies about a Sushi Station

**The menu.** Which rolls: California, spicy tuna, sweet potato, avocado, cucumber, salmon-avocado, specialty rolls (dragon, rainbow, volcano). Nigiri or not. Sashimi or not. Which sauces: spicy mayo, eel sauce, sriracha; wasabi real or powdered; pickled ginger or not (the Goldbergs hate ginger — that fact lives somewhere). Vegetarian-only for a dairy reception; fish-forward for a premium dinner.

**Recipes and ingredients.** White rice or brown or both. Which spicy tuna recipe — the house standard or the one the client's family expects from their last event. Gluten-free soy on the side or as default. Whose fish, under which hashgacha — and this is not a footnote: which certifications the family and the venue's rav accept can change the supplier, the price, and the prep location. Seasonal substitution when yellowtail isn't available.

**Quantities.** Pieces per person — 6 for a station among eight stations, 12 when sushi is the anchor. Guests *served by this station* is not always the event's guest count: a cocktail-hour station serves the adults; the kids are at the candy bar. Replenishment batching. How much is displayed versus held back. The honest rule: quantities are *derived* (guests × pieces per person × an appetite factor the operator knows in their gut) and then *overridden* by that gut.

**Presentation scheme.** Black slate on bamboo risers, earthy and traditional. White acrylic with mirror tiles and uplighting, modern. Wooden boats. A sushi wall. Each scheme is not one choice — it's a *bundle*: the slate scheme brings slate platters, bamboo mats, dark linens, ceramic soy dishes; the acrylic scheme brings risers, mirror bases, white linen, glass vessels. And then any single piece gets swapped anyway, because the client's mother wants the gold chopstick stands.

**Props and vessels.** Platters (how many, which), bowls, soy dishes, chopstick rests, serving tongs, signage frames, menu cards, florals on the station, the sneeze guard or not. Each with a count. Every one of these is a thing the warehouse must pull, pack, and get back.

**Equipment.** Under-counter refrigeration or a cold table or ice display. Prep table if there's live rolling. Knives, handwash setup, glove station. Power for the fridge — which is a venue question wearing an equipment costume.

**Service style and labor.** Live chef rolling to order — theater, and a different staffing bill. Pre-made and replenished by an attendant. Fully self-serve. One chef or two. Uniformed how. And the style *cascades*: live rolling means a prep surface, a longer setup window, a mashgiach question if the fish arrives whole, and a higher price line.

**Timing.** Cocktail hour only, or through dinner. Sushi is unforgiving — assembled how close to service, held how long, discarded when. Commissary prep versus on-site. Setup and teardown windows against the venue's schedule.

**Placement and venue constraints.** Footprint. Power drop for refrigeration. Distance from the kitchen (replenishment path). Indoors — outdoors in June is a food-safety decision, not a preference. The Rockleigh's loading dock versus a hotel freight elevator changes the packing plan.

**Kashrut and dietary.** Fish is pareve — but proximity to the carving station, shared serving pieces, and the mashgiach's rounds are real operational configuration in this world, and no generic catering software has ever modeled them. Allergen signage: sesame, soy, shellfish-free claims. This is a differentiator, not an edge case.

**Pricing presentation.** Per person, flat station fee, or absorbed into a package. What the customer's proposal says versus what the costing knows. Premium-tier language or standard.

**Customer presentation and media.** The display name ("Sushi Bar" for this client, "Omakase Station" for that one). The description paragraph. Which three photos represent *this configuration* — the slate photos for the slate event.

**The escape hatch.** Kitchen notes, packing notes, photography must-shoots, "the client's uncle is a sushi chef, expect commentary." Every real event has the thing no model anticipated. A configuration system without free-text per layer is a system people work around.

## Part 2 — What the list reveals

Ben's prediction was right: this is not the Sushi Station's configuration model. Substitute "carving station" and the nouns change — meats for rolls, carving board for slate, carver for sushi chef — but not one *kind* of variation appears or disappears. The same holds for the Viennese table, the chuppah, the bar. **The configuration model has seven kinds of variation, and they are the same seven for every component:**

1. **Selections** — choose from option sets (rolls, sauces, meats). The definition seeds the option set; the instance selects and may add options the definition never heard of. *Crucially: this axis already exists in EventCore — it is `event_items` and categories.* SPEC-002 must extend around the items system, never rebuild it. A second place where "which rolls" lives would be a duplicated source of truth, and it would be the expensive kind.

2. **Scalars and derivations** — quantities, counts, factors. Derived by default (guests × per-person), overridden by judgment, and the override is remembered as an override so the derivation can be shown ("suggested 240 pieces; you set 300"). This is "state is derived whenever possible" applied to operations.

3. **Substitutions** — swaps within a slot, constrained by rules: kashrut, allergy, season, availability. A substitution is not a new selection; it preserves the slot's role ("the rice", "the soy") while changing its filler.

4. **Schemes** — named presets that set many other dimensions at once, then release them. Choose "black slate," receive its props, linens, and vessels — then swap the chopstick stands. A scheme is instantiate-then-own at the dimension level: the same verb the whole platform runs on, which is how you know it's the right shape.

5. **Consequences** — requirements *computed from* choices: live rolling ⇒ prep table + handwash + longer setup; refrigeration ⇒ power drop; outdoor June ⇒ hold-time limits. This is the deepest finding: **configuration is choices; layers are consequences.** The kitchen layer of a configured instance is not typed in from scratch — it is projected from selections, scale, scheme, and service style, then edited. SPEC-003's lens reads exactly this projection. Consequences are derived-until-overridden, like scalars.

6. **Constraints** — external filters that remove options rather than add content: the venue's power and footprint, the family's kashrut standard, the allergy list. Constraints come from *other objects in the graph* (venue, booking, client) and narrow what's legal here — which is the object graph earning its keep.

7. **Annotations** — per-layer free text. The honesty axis. Modeled explicitly so it never has to be smuggled into a field that means something else.

## Part 3 — What this decides for SPEC-002 (so the spec starts ahead)

- **Configuration state lives on the instance**, structured by the seven kinds — mostly inside the existing instance-layer payloads (SPEC-001's tables need nothing new), with selections continuing to live in `event_items`.
- **Definitions seed, never mandate** (the invariant, now with its mechanism): option sets, default scalars, available schemes, and consequence rules are definition-layer content; instantiation copies, the instance owns.
- **Derivations must show their work.** Any derived value displays its formula and its override status — this is "everything is explainable" and the constrained vocabulary applied to numbers.
- **Consequence rules are layer-registered.** Kitchen's rules ("live rolling ⇒ handwash") live in the kitchen registration, not in a central rules engine — SPEC-001 §1.6 invariant 2 already requires this.
- **The items integration is the spec's hardest section** and should be written first, precisely because it's where duplicated truth will try to enter.
- **Kashrut-aware constraints are a first-class citizen**, not a custom field — it is the market's actual requirement and nobody else models it.

The exercise took the prescribed hour. The seven kinds are the configuration model for EventCore, discovered — as predicted — by refusing to talk about databases until the sushi was fully described.
