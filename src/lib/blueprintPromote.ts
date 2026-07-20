// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT PROMOTION — pure law (v255 · BP-5).
//
// NORMALIZATION: a materialized design (BP-4's shape) becomes lawful
// BlueprintContent (BP-2's shape) under an explicit SCOPE — partial
// promotion is first-class: the operator chooses which sections and
// components travel. Everything event-specific is STRIPPED BY NAME into a
// staged report the operator reviews before the ceremony — nothing is
// dropped silently, nothing is guessed:
//   · guest counts        → stripped (an event's answer, never knowledge)
//   · item prices         → stripped (the catalog's, resolved at arrival)
//   · confirmed packages  → converted to authored-suggestion INTENT (§11:
//                           no price is confirmed by copying; promotion
//                           cannot invent a fixed-price policy)
//   · bound dress         → stripped (v241: bound never travels)
//   · defless components  → skipped by name (an entry references a
//                           definition identity; there is nothing to guess)
//
// THE CEREMONY PRODUCES DRAFTS ONLY: this module never publishes and the
// data layer calls one RPC that cannot publish (server-proven PM-1).
// The normalized content is validated by BP-2's own validator before
// anything leaves the dialog — one shape, one law, one source.
// ═══════════════════════════════════════════════════════════════════════════
import {
  BlueprintContent, ComponentEntry, BlueprintChapter, BlueprintSection,
  emptyContent, validateBlueprintContent, ValidationResult,
  PortablePresentation,
} from "./blueprintContent";
import { MaterializedDesign, MaterializedComponent } from "./blueprintDivergence";

export interface PromotionScope {
  /** section_type_ids to carry; "all" carries every section present. */
  sections: string[] | "all";
  /** component ids to carry; "all" carries every component in scope. */
  components: string[] | "all";
  /** EXPLICIT choice: carry source pricing as reusable INTENT. When false,
   *  no pricingIntent is emitted and the omission is named (PRICING_OMITTED).
   *  The conversion is never silent either way. */
  carryPricing: boolean;
  /** EXPLICIT transformation: source fact → reusable question. When true,
   *  the source guest count becomes a required count parameter, recorded as
   *  a promotion DECISION (FACT_TO_QUESTION). Parameters are NEVER inferred
   *  merely because the source contains a value. */
  askGuestCount: boolean;
}

export const STRIP_REASONS = [
  "STRIPPED_GUESTS", "STRIPPED_ITEM_PRICES", "CONFIRMED_PRICE_TO_SUGGESTION",
  "STRIPPED_BOUND_DRESS", "SKIPPED_NO_DEFINITION", "OUT_OF_SCOPE",
  "PRICING_OMITTED", "FACT_TO_QUESTION", "ORPHANED_SELECTION",
] as const;
export type StripReason = (typeof STRIP_REASONS)[number];

export interface StripEntry { reason: StripReason; at: string; detail?: string; }

/** ═══ THE EXTRACTION MATRIX (BP-5's defining table) ═══
 *  Promotion is EXTRACTION, not cloning: the draft is built ONLY from this
 *  allowlisted model — no field is copied and cleaned afterward; a source
 *  field is admitted, referenced, omitted-to-resolve-later, or refused, and
 *  the matrix is TOTAL over the materialized source shape (unit-walked). */
export type ExtractionDisposition = "copied" | "identity-reference" | "resolve-later" | "refused";
export const EXTRACTION_MATRIX: Record<string, ExtractionDisposition> = {
  // structure & placement — admissible, copied
  "sections[].position": "copied",
  "components[].title": "copied",
  "components[].config.schemeId": "copied",
  "components[].config.choices": "copied",
  "components[].config.scalars": "copied",
  "components[].items[].name": "copied",
  "components[].pricing_mode": "copied",          // as INTENT shape, by explicit choice
  "components[].package_price": "copied",         // as suggestion INTENT, never confirmed
  "presentation.theme_key": "copied",             // portable stratum only
  "presentation.theme_override": "copied",        // delta + section dress; bound refused below
  "presentation.photo_pins": "copied",            // section pins + document pin
  // shared knowledge — admissible only as identity reference
  "sections[].section_type_id": "identity-reference",
  "components[].definition_id": "identity-reference",
  // omitted — must resolve later (at instantiation, against the shelf)
  "components[].items[].unit_price": "resolve-later",
  "components[].seed_config_revision": "resolve-later",  // SPEC-002's stamp stays with the design
  // refused — event-, execution-, or confirmation-specific
  "guests": "refused",                             // becomes a QUESTION only by explicit choice
  "guests[].category_id": "refused",
  "guests[].count": "refused",
  "components[].id": "refused",                    // event identity
  "components[].instantiation_id": "refused",      // event identity (SPEC-002 provenance)
  "components[].section_type_id_as_content": "refused",
  "components[].package_price_confirmed": "refused", // confirmation never promotes
  "components[].items[].price_confirmed": "refused",
  "presentation.theme_override.treatments.components": "refused", // bound dress (v241)
  "structure_prose": "refused",                    // no authored surface; nothing to extract honestly
};

export interface PromotionPlan {
  content: BlueprintContent;
  stripped: StripEntry[];
  validation: ValidationResult;
}

const uid = (() => { let n = 0; return (p: string) => `${p}${++n}`; })();

function entryFromComponent(c: MaterializedComponent, stripped: StripEntry[], carryPricing: boolean): ComponentEntry | null {
  if (!c.definition_id) {
    stripped.push({ reason: "SKIPPED_NO_DEFINITION", at: c.title ?? c.id,
      detail: "an entry references a definition identity; this component has none" });
    return null;
  }
  const cfg = (c.config ?? {}) as { schemeId?: string | null; choices?: Record<string, unknown>; scalars?: Record<string, unknown> };
  const values: Record<string, string | number | boolean> = {};
  for (const src of [cfg.choices ?? {}, cfg.scalars ?? {}]) {
    for (const k of Object.keys(src)) {
      const v = (src as Record<string, unknown>)[k];
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") values[k] = v;
    }
  }
  let pricingIntent: ComponentEntry["pricingIntent"] = null;
  if (!carryPricing) {
    if (c.pricing_mode === "package" && typeof c.package_price === "number") {
      stripped.push({ reason: "PRICING_OMITTED", at: c.title ?? c.id,
        detail: "source pricing left behind by explicit choice — the draft carries no intent here" });
    }
  } else if (c.pricing_mode === "package" && typeof c.package_price === "number") {
    pricingIntent = { form: "authored-suggestion", amount: c.package_price };
    if (c.package_price_confirmed) {
      stripped.push({ reason: "CONFIRMED_PRICE_TO_SUGGESTION", at: c.title ?? c.id,
        detail: `the design's confirmed ${c.package_price} arrives as suggestion intent — no price is confirmed by copying, and promotion cannot invent a fixed-price policy` });
    }
  }
  const priced = c.items.filter((i) => i.unit_price !== null).length;
  if (priced > 0) {
    stripped.push({ reason: "STRIPPED_ITEM_PRICES", at: c.title ?? c.id,
      detail: `${priced} item price(s) left behind — prices are the catalog's, resolved at arrival` });
  }
  return {
    key: uid("e"),
    definitionId: c.definition_id,
    title: c.title ?? "",
    configuration: { values, scheme: cfg.schemeId ?? null, annotations: "" },
    itemSelections: c.items.map((i) => ({ name: i.name, include: true, note: "" })),
    choiceGroups: [],
    pricingIntent,
    notes: "",
  };
}

function portableFromDesign(
  p: NonNullable<MaterializedDesign["presentation"]>, stripped: StripEntry[],
): PortablePresentation {
  const ov = (p.theme_override ?? {}) as Record<string, unknown>;
  const treatments = (ov["treatments"] ?? {}) as Record<string, unknown>;
  const sectionDress = (treatments["sections"] ?? {}) as PortablePresentation["sectionDress"];
  const boundKeys = Object.keys(treatments).filter((k) => k !== "sections");
  if (boundKeys.length > 0) {
    stripped.push({ reason: "STRIPPED_BOUND_DRESS", at: `treatments.${boundKeys.join(", treatments.")}`,
      detail: "bound dress never travels (v241)" });
  }
  const delta: Record<string, unknown> = {};
  for (const k of Object.keys(ov)) if (k !== "treatments") delta[k] = ov[k];
  const pins = (p.photo_pins ?? {}) as { sections?: unknown; cover?: unknown };
  return {
    themeKey: p.theme_key ?? null,
    delta: delta as PortablePresentation["delta"],
    sectionDress: sectionDress ?? {},
    sectionPins: (pins.sections ?? {}) as PortablePresentation["sectionPins"],
    documentPin: (pins.cover ?? null) as PortablePresentation["documentPin"],
  };
}

/** THE NORMALIZATION. Pure: (design, roleNames, scope, chapterTitle) in,
 *  {content, stripped, validation} out. Never writes, never publishes,
 *  never guesses — refusals and strippings are the operator's to read. */
export function normalizeDesignToContent(
  design: MaterializedDesign,
  roleNames: Record<string, string>,
  scope: PromotionScope,
  chapterTitle: string,
): PromotionPlan {
  const stripped: StripEntry[] = [];
  const wantSection = (id: string) => scope.sections === "all" || scope.sections.includes(id);
  const wantComponent = (id: string) => scope.components === "all" || scope.components.includes(id);

  const sections: BlueprintSection[] = [];
  for (const s of [...design.sections].sort((a, z) => a.position - z.position)) {
    if (!wantSection(s.section_type_id)) {
      stripped.push({ reason: "OUT_OF_SCOPE", at: roleNames[s.section_type_id] ?? s.section_type_id, detail: "section left behind by choice" });
      continue;
    }
    const entries: ComponentEntry[] = [];
    for (const c of design.components.filter((c) => c.section_type_id === s.section_type_id)) {
      if (!wantComponent(c.id)) {
        stripped.push({ reason: "OUT_OF_SCOPE", at: c.title ?? c.id, detail: "component left behind by choice" });
        continue;
      }
      const e = entryFromComponent(c, stripped, scope.carryPricing);
      if (e) entries.push(e);
    }
    sections.push({
      key: uid("s"),
      title: roleNames[s.section_type_id] ?? "",
      prose: "",
      role: s.section_type_id,
      entries,
    });
  }

  // a selected component whose parent section was left behind is NAMED,
  // never silently dropped — incomplete parent selection is a warning
  if (scope.components !== "all") {
    for (const cid of scope.components) {
      const c = design.components.find((x) => x.id === cid);
      if (c && c.section_type_id && !wantSection(c.section_type_id)) {
        stripped.push({ reason: "ORPHANED_SELECTION", at: c.title ?? cid,
          detail: `selected, but its parent section (${roleNames[c.section_type_id] ?? c.section_type_id}) is not — nothing travels without its required parent` });
      }
    }
  }

  const parameters = [...emptyContent().parameters];
  if (design.guests.length > 0) {
    if (scope.askGuestCount) {
      const total = design.guests.reduce((n, g) => n + g.count, 0);
      parameters.push({ key: "guest_count", label: "Guest count", type: "count", required: true });
      stripped.push({ reason: "FACT_TO_QUESTION", at: "guests",
        detail: `source fact → reusable question: the source's ${total} guests becomes the required count parameter — recorded as a promotion decision, never inferred` });
    } else {
      stripped.push({ reason: "STRIPPED_GUESTS", at: "guests",
        detail: "guest counts are an event's answer; instantiation asks again" });
    }
  }

  const chapter: BlueprintChapter = { key: uid("ch"), title: chapterTitle, prose: "", sections };
  const content: BlueprintContent = {
    ...emptyContent(),
    parameters,
    structure: [chapter],
    presentation: design.presentation && (design.presentation.theme_key || design.presentation.theme_override || design.presentation.photo_pins)
      ? { portable: portableFromDesign(design.presentation, stripped), provenance: null }
      : null,
  };

  return { content, stripped, validation: validateBlueprintContent(content) };
}
