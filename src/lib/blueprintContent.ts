// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT CONTENT (v252 · BP-2) — the lawful shape of a draft revision's
// authored payload, under PUBLICATION_BLUEPRINTS §5 (the portable boundary),
// §6 (the reference-versus-copy matrix), §10 (the parameter taxonomy,
// reserved), §11 (pricing intent).
//
// ◆ THE DEFINING PROOF OF THIS SLICE: every field declares EXACTLY ONE
// treatment — copied as authored structure · referenced as shared
// knowledge · resolved later. The registry below is TOTAL over the shape
// and the resolved class is represented as NAMED ABSENCE: material that
// resolves at instantiation or later has NO field here, and the validator
// REFUSES its presence. A field without a declared treatment is a
// constitutional violation (§6), enforced by walk, not by hope.
//
// ◆ WHAT THIS SHAPE CANNOT BE: an Event Design. It carries no booking, no
// event, no version, no instantiation identity, no customer, no dates, no
// guest-count-as-fact, no confirmed price, no bound dress, no definition
// REVISION. It cannot create a live dependency because every reference it
// holds is an IDENTITY (definition id · semantic role · asset reference)
// and never a revision or a live read. INSTANTIATION SEVERS ANCESTRY
// WHILE PRESERVING MEMORY — and this shape is what makes the severing
// possible: nothing in it needs the blueprint to stay alive.
//
// Boundaries pinned for this slice (BP-2): no instantiation · no Event
// Design creation · no definition-revision resolution · no price lookup
// or confirmation · no parameter EVALUATION (declaration only; conditions
// are refused until BP-7 delivers the closed predicate set) · no
// divergence · no promotion · no Library registration · no legacy v182
// table.
// ═══════════════════════════════════════════════════════════════════════════
// v257 AMENDMENT (BP-7): the shape's import set grows by exactly one — the
// condition law. The v252 pin is amended in-suite, dated.
import { BlueprintCondition, validateCondition, CONDITION_UNITS } from "./blueprintConditions";
import {
  PortablePresentation, PresentationProvenance,
  portablePresentation, makeProvenance, fingerprintPortable,
} from "./portable";

export type { BlueprintCondition };
export { CONDITION_UNITS };

export { portablePresentation, makeProvenance, fingerprintPortable };
export type { PortablePresentation, PresentationProvenance };

// ─────────────────────────────────────────────────────────────────────────────
// THE SHAPE
// ─────────────────────────────────────────────────────────────────────────────

export const BLUEPRINT_CONTENT_VERSION = 1 as const;

export interface BlueprintContent {
  version: typeof BLUEPRINT_CONTENT_VERSION;
  /** COPIED — chapters · sections · arrangement · authored prose (§5, §6). */
  structure: BlueprintChapter[];
  /** COPIED by value (the v241 portable stratum only) + provenance as
   *  recorded fact when extracted from a template (§5, §6). */
  presentation: BlueprintPresentation | null;
  /** COPIED — organization-level design constraints, entered once (§5). */
  constraints: DesignConstraints;
  /** COPIED — authored questions (§10). Declarations only in BP-2:
   *  nothing evaluates, nothing defaults, nothing conditions. */
  parameters: ParameterDecl[];
}

export interface BlueprintChapter {
  key: string;
  title: string;
  prose: string;
  sections: BlueprintSection[];
  /** v257 §BP-7 — COPIED authored structure; RESOLVED once at
   *  instantiation into the branch map. Never survives into the Design. */
  condition?: BlueprintCondition;
}

export interface BlueprintSection {
  key: string;
  title: string;
  prose: string;
  /** REFERENCED — the semantic role (section type id, tenant-global):
   *  the v241 match-law key, shared knowledge, never duplicated. */
  role: string | null;
  entries: ComponentEntry[];
  /** v257 — copied; resolved once at instantiation (branch map). */
  condition?: BlueprintCondition;
}

export interface ComponentEntry {
  key: string;
  /** REFERENCED — the component definition's stable IDENTITY. Never a
   *  revision: which revision arrives is resolved at instantiation
   *  (BP-3) against one coherent organizational snapshot and stamped
   *  per SPEC-002. Capturing a revision here would be authored
   *  staleness pretending to be truth — refused by the validator. */
  definitionId: string;
  /** COPIED — the authored display title. */
  title: string;
  /** COPIED — the authored configuration DELTA against the definition
   *  (the blueprint's honest place for divergence-as-authorship, §8). */
  configuration: AuthoredConfigDelta;
  /** COPIED — authored item selections. */
  itemSelections: ItemSelection[];
  /** COPIED — authored QUESTIONS deferred to the design (§10: choices
   *  survive instantiation; conditions do not — and conditions are
   *  not authorable until BP-7). */
  choiceGroups: ChoiceGroupAuthorship[];
  /** COPIED — §11: money as intent, never fact. */
  pricingIntent: PricingIntent | null;
  /** COPIED — authored notes. */
  notes: string;
  /** v257 — copied; resolved once at instantiation (branch map). */
  condition?: BlueprintCondition;
}

export interface AuthoredConfigDelta {
  values: Record<string, string | number | boolean>;
  scheme: string | null;
  annotations: string;
}

export interface ItemSelection {
  name: string;
  include: boolean;
  note: string;
  /** v257 — copied; resolved once at instantiation (branch map). */
  condition?: BlueprintCondition;
}

export interface ChoiceGroupAuthorship {
  key: string;
  label: string;
  options: string[];
  required: boolean;
}

/** §11 — the closed intent forms. There is no representable confirmed
 *  price: the type has no such member, and the validator refuses the key.
 *  fixed-package must name its declared policy (§11 clause (a)); the
 *  publishing authority covers it at publish (clause (b)); arrival stamps
 *  it (clause (c), BP-3). */
export type PricingIntent =
  | { form: "reference-current" }
  | { form: "authored-suggestion"; amount: number }
  | { form: "formula"; perGuest: number }
  | { form: "fixed-package"; amount: number; policy: string };

export const PRICING_INTENT_FORMS = [
  "reference-current", "authored-suggestion", "formula", "fixed-package",
] as const;

export interface BlueprintPresentation {
  /** COPIED by value — the portable stratum ONLY (themeKey · delta ·
   *  sectionDress · sectionPins · documentPin). Bound dress (component
   *  and item treatments, component pins) never travels (§5, v241). */
  portable: PortablePresentation;
  /** REFERENCED — template provenance as recorded FACT, never
   *  dependency (§6): {template_id, fingerprint, applied_at, mode}. */
  provenance: PresentationProvenance | null;
}

export interface DesignConstraints {
  /** COPIED — kosher character as a design fact, entered once (§5). */
  character: "meat" | "dairy" | "pareve" | null;
  /** COPIED — supervision requirement declaration. */
  supervision: string;
  /** COPIED — calendar-sensitivity flag. */
  calendarSensitive: boolean;
  /** COPIED — service-style declaration. */
  serviceStyle: string | null;
}

/** §10 — a parameter is a QUESTION. It has no default masquerading as a
 *  fact: an unanswered parameter blocks instantiation (BP-3), because a
 *  guessed guest count is a lie. The validator refuses a `default` key. */
export interface ParameterDecl {
  key: string;
  label: string;
  type: "count" | "choice" | "flag";
  required: boolean;
  options?: string[];
}
export const PARAMETER_TYPES = ["count", "choice", "flag"] as const;

export function emptyContent(): BlueprintContent {
  return {
    version: BLUEPRINT_CONTENT_VERSION,
    structure: [],
    presentation: null,
    constraints: { character: null, supervision: "", calendarSensitive: false, serviceStyle: null },
    parameters: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE TREATMENT REGISTRY (§6) — TOTAL and EXCLUSIVE by construction: one
// Record, one treatment per path, unit-walked against a fully-populated
// content. Array segments are normalized to `[]`. The `resolved` entries
// are NAMED ABSENCES: their presence in content is a refusal.
// ─────────────────────────────────────────────────────────────────────────────

export type FieldTreatment = "copied" | "referenced" | "resolved";

export const FIELD_TREATMENTS: Record<string, FieldTreatment> = {
  // the envelope of the shape itself
  "version": "copied",
  // structure — authored, copied
  "structure": "copied",
  "structure[].key": "copied",
  "structure[].title": "copied",
  "structure[].prose": "copied",
  "structure[].sections": "copied",
  "structure[].sections[].key": "copied",
  "structure[].sections[].title": "copied",
  "structure[].sections[].prose": "copied",
  "structure[].sections[].role": "referenced",
  "structure[].sections[].entries": "copied",
  "structure[].sections[].entries[].key": "copied",
  "structure[].sections[].entries[].definitionId": "referenced",
  "structure[].sections[].entries[].title": "copied",
  "structure[].sections[].entries[].configuration": "copied",
  "structure[].sections[].entries[].configuration.values": "copied",
  "structure[].sections[].entries[].configuration.scheme": "copied",
  "structure[].sections[].entries[].configuration.annotations": "copied",
  "structure[].sections[].entries[].itemSelections": "copied",
  "structure[].sections[].entries[].itemSelections[].name": "copied",
  "structure[].sections[].entries[].itemSelections[].include": "copied",
  "structure[].sections[].entries[].itemSelections[].note": "copied",
  "structure[].sections[].entries[].choiceGroups": "copied",
  "structure[].sections[].entries[].choiceGroups[].key": "copied",
  "structure[].sections[].entries[].choiceGroups[].label": "copied",
  "structure[].sections[].entries[].choiceGroups[].options": "copied",
  "structure[].sections[].entries[].choiceGroups[].required": "copied",
  "structure[].sections[].entries[].pricingIntent": "copied",
  "structure[].sections[].entries[].pricingIntent.form": "copied",
  "structure[].sections[].entries[].pricingIntent.amount": "copied",
  "structure[].sections[].entries[].pricingIntent.perGuest": "copied",
  "structure[].sections[].entries[].pricingIntent.policy": "copied",
  "structure[].sections[].entries[].notes": "copied",
  // presentation — portable by value; provenance a recorded fact
  "presentation": "copied",
  "presentation.portable": "copied",
  "presentation.portable.themeKey": "copied",
  "presentation.portable.delta": "copied",
  "presentation.portable.sectionDress": "copied",
  "presentation.portable.sectionPins": "copied",
  "presentation.portable.documentPin": "copied",
  "presentation.provenance": "referenced",
  "presentation.provenance.template_id": "referenced",
  "presentation.provenance.fingerprint": "referenced",
  "presentation.provenance.applied_at": "referenced",
  "presentation.provenance.mode": "referenced",
  // constraints — entered once, authored
  "constraints": "copied",
  "constraints.character": "copied",
  "constraints.supervision": "copied",
  "constraints.calendarSensitive": "copied",
  "constraints.serviceStyle": "copied",
  // parameters — authored questions
  "parameters": "copied",
  "parameters[].key": "copied",
  "parameters[].label": "copied",
  "parameters[].type": "copied",
  "parameters[].required": "copied",
  "parameters[].options": "copied",
  // v257 — the four closed attachment points: COPIED authored structure
  // whose RESOLUTION is the branch map at instantiation. Interior shape is
  // validated by the condition law itself (OPAQUE_SUBTREES below).
  "structure[].condition": "copied",
  "structure[].sections[].condition": "copied",
  "structure[].sections[].entries[].condition": "copied",
  "structure[].sections[].entries[].itemSelections[].condition": "copied",
  // ── NAMED ABSENCES — resolved at instantiation or later; NO field
  //    exists for these and the validator refuses their appearance. ──
  "structure[].sections[].entries[].definitionRevision": "resolved",
  "structure[].sections[].entries[].currentPrice": "resolved",
  "structure[].sections[].entries[].price": "resolved",
  "companyFacts": "resolved",
  "identity": "resolved",
  "conditions": "resolved", // root-level: conditions attach at units, never at the root
};

// ─────────────────────────────────────────────────────────────────────────────
// THE VALIDATOR — refuses, never repairs (application never guesses).
// ─────────────────────────────────────────────────────────────────────────────

/** §5 — the barred list as exact key names: event-specific and commercial
 *  material that never enters organizational knowledge. Presence of any of
 *  these keys ANYWHERE in content is a refusal, regardless of value. */
export const BARRED_KEYS = new Set([
  "customer", "customerId", "customer_id", "contact", "party", "parties",
  "eventDate", "event_date", "date", "dates", "venue",
  "guestCount", "guest_count", "guests",
  "deposit", "deposits", "discount", "payment", "payments",
  "agreement", "agreements", "terms", "signature", "signatures",
  "delivery", "deliveries", "approval", "approvals", "actuals",
  "taxId", "tax_id", "ach",
  "confirmed", "price_confirmed", "priceConfirmed",
]);

/** The shape cannot be an Event Design: event identity keys are refused. */
export const EVENT_IDENTITY_KEYS = new Set([
  "bookingId", "booking_id", "eventId", "event_id",
  "versionId", "version_id", "proposalId", "proposal_id",
  "instantiationId", "instantiation_id",
]);

/** §10 — no default masquerading as a fact. */
const PARAMETER_BARRED = new Set(["default", "defaultValue", "default_value", "value"]);

const PORTABLE_KEYS = new Set(["themeKey", "delta", "sectionDress", "sectionPins", "documentPin"]);
const BOUND_KEYS = new Set(["components", "items", "componentPins", "component_pins"]);

export interface ValidationResult { ok: boolean; refusals: string[]; }

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function walkKeys(v: unknown, path: string, out: (key: string, at: string) => void): void {
  if (Array.isArray(v)) { v.forEach((x) => walkKeys(x, `${path}[]`, out)); return; }
  if (!isObj(v)) return;
  for (const [k, child] of Object.entries(v)) {
    const at = path ? `${path}.${k}` : k;
    out(k, at);
    walkKeys(child, at, out);
  }
}

/** Paths whose SUBTREES are authored dictionaries carried by value — their
 *  interior keys are data, not shape (the v241 delta and pin dictionaries,
 *  authored config values). The walk does not classify below these. */
const OPAQUE_SUBTREES = [
  "structure[].condition",
  "structure[].sections[].condition",
  "structure[].sections[].entries[].condition",
  "structure[].sections[].entries[].itemSelections[].condition",
  "presentation.portable.delta",
  "presentation.portable.sectionDress",
  "presentation.portable.sectionPins",
  "presentation.portable.documentPin",
  "structure[].sections[].entries[].configuration.values",
];

const underOpaque = (at: string) => OPAQUE_SUBTREES.some((o) => at.startsWith(o + ".") || at.startsWith(o + "["));

const params0 = (content: unknown): unknown =>
  isObj(content) ? (content as { parameters?: unknown }).parameters : [];

export function validateBlueprintContent(content: unknown): ValidationResult {
  const refusals: string[] = [];
  if (!isObj(content)) return { ok: false, refusals: ["content must be an object"] };

  // 1 · every present key must map to a declared treatment that is not a
  //     named absence — unclassified is a violation, resolved is a refusal.
  walkKeys(content, "", (key, at) => {
    if (BARRED_KEYS.has(key)) refusals.push(`BARRED (§5): "${key}" at ${at} — event-specific or commercial material never enters organizational knowledge`);
    if (EVENT_IDENTITY_KEYS.has(key)) refusals.push(`NOT AN EVENT DESIGN: "${key}" at ${at} — authored content carries no event identity`);
    if (underOpaque(at)) return;
    const treatment = FIELD_TREATMENTS[at];
    if (treatment === undefined) refusals.push(`UNCLASSIFIED (§6): "${at}" declares no treatment — a field without a declared treatment is a constitutional violation`);
    else if (treatment === "resolved") refusals.push(`RESOLVED IS ABSENCE (§6): "${at}" resolves at instantiation or later and has no field here${at === "conditions" ? " (conditions attach at chapters, sections, entries, and item selections — never at the root)" : ""}`);
  });

  // 2 · the portable stratum only; bound dress never travels (§5, v241).
  const pres = (content as { presentation?: unknown }).presentation;
  if (isObj(pres) && isObj(pres.portable)) {
    for (const k of Object.keys(pres.portable)) {
      if (BOUND_KEYS.has(k)) refusals.push(`BOUND NEVER TRAVELS (v241): "${k}" inside presentation.portable`);
      else if (!PORTABLE_KEYS.has(k)) refusals.push(`NOT PORTABLE (v241): "${k}" is outside the portable stratum`);
    }
  }

  // 3 · §11 — intent forms are closed; fixed-package names its policy.
  const structure = (content as { structure?: unknown }).structure;
  if (Array.isArray(structure)) {
    structure.forEach((ch, ci) => {
      const sections = isObj(ch) && Array.isArray((ch as { sections?: unknown }).sections)
        ? (ch as { sections: unknown[] }).sections : [];
      sections.forEach((se, si) => {
        const entries = isObj(se) && Array.isArray((se as { entries?: unknown }).entries)
          ? (se as { entries: unknown[] }).entries : [];
        entries.forEach((en, ei) => {
          const at = `structure[${ci}].sections[${si}].entries[${ei}]`;
          const intent = isObj(en) ? (en as { pricingIntent?: unknown }).pricingIntent : null;
          if (intent === null || intent === undefined) return;
          if (!isObj(intent) || !PRICING_INTENT_FORMS.includes(intent.form as never)) {
            refusals.push(`PRICING INTENT (§11): unknown form at ${at}`);
          } else if (intent.form === "fixed-package" && !(typeof intent.policy === "string" && intent.policy.trim() !== "")) {
            refusals.push(`PRICING INTENT (§11): fixed-package at ${at} must name its declared policy`);
          }
        });
      });
    });
  }

  // 3b · v257 §BP-7 — conditions: the closed law over the four units.
  const paramDecls = (Array.isArray(params0(content)) ? params0(content) : []) as
    { key: string; type: "count" | "choice" | "flag"; options?: string[] }[];
  if (Array.isArray(structure)) {
    structure.forEach((ch, ci) => {
      const chc = isObj(ch) ? (ch as { condition?: unknown }).condition : undefined;
      if (chc !== undefined) {
        for (const p of validateCondition(chc, paramDecls, `structure[${ci}]`)) {
          refusals.push(`${p.failure} (§BP-7): at ${p.at}${p.detail ? ` — ${p.detail}` : ""}`);
        }
      }
      const sections = isObj(ch) && Array.isArray((ch as { sections?: unknown }).sections)
        ? (ch as { sections: unknown[] }).sections : [];
      sections.forEach((se, si) => {
        const sec = isObj(se) ? (se as { condition?: unknown; entries?: unknown }) : {};
        if (sec.condition !== undefined) {
          for (const p of validateCondition(sec.condition, paramDecls, `structure[${ci}].sections[${si}]`)) {
            refusals.push(`${p.failure} (§BP-7): at ${p.at}${p.detail ? ` — ${p.detail}` : ""}`);
          }
        }
        const entries = Array.isArray(sec.entries) ? sec.entries : [];
        entries.forEach((en, ei) => {
          const ent = isObj(en) ? (en as { condition?: unknown; itemSelections?: unknown }) : {};
          if (ent.condition !== undefined) {
            for (const p of validateCondition(ent.condition, paramDecls, `structure[${ci}].sections[${si}].entries[${ei}]`)) {
              refusals.push(`${p.failure} (§BP-7): at ${p.at}${p.detail ? ` — ${p.detail}` : ""}`);
            }
          }
          const its = Array.isArray(ent.itemSelections) ? ent.itemSelections : [];
          its.forEach((it, ii) => {
            const itc = isObj(it) ? (it as { condition?: unknown }).condition : undefined;
            if (itc !== undefined) {
              for (const p of validateCondition(itc, paramDecls, `structure[${ci}].sections[${si}].entries[${ei}].itemSelections[${ii}]`)) {
                refusals.push(`${p.failure} (§BP-7): at ${p.at}${p.detail ? ` — ${p.detail}` : ""}`);
              }
            }
          });
        });
      });
    });
  }

  // 4 · §10 — parameters are questions: closed types, no defaults.
  const params = (content as { parameters?: unknown }).parameters;
  if (Array.isArray(params)) {
    params.forEach((p, i) => {
      if (!isObj(p)) return;
      if (!PARAMETER_TYPES.includes(p.type as never)) refusals.push(`PARAMETER (§10): unknown type at parameters[${i}]`);
      for (const k of Object.keys(p)) {
        if (PARAMETER_BARRED.has(k)) refusals.push(`PARAMETER (§10): "${k}" at parameters[${i}] — no default masquerading as a fact`);
      }
    });
  }

  return { ok: refusals.length === 0, refusals };
}

/** Attach a template's portable BY VALUE with provenance recorded at
 *  application time (§5, §6, v241): a deep copy plus the recorded fact —
 *  the template stays a citation, never a dependency. */
export function attachTemplatePresentation(
  template: { id: string; portable: PortablePresentation },
): BlueprintPresentation {
  const portable = JSON.parse(JSON.stringify(template.portable)) as PortablePresentation;
  return { portable, provenance: makeProvenance(template.id, portable, "creation") };
}
