// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION LENS — projection (SPEC-003 §9 "Production (kitchen)" · v212).
//
// THE PIPELINE'S VALIDATION (SPEC-003 acceptance advisory). The four criteria,
// and where each is enforced in this module:
//   · OWNERSHIP CHAIN — this projection composes kitchen content EXCLUSIVELY
//     through the kitchen registration's LensContribution (sections()); the
//     internal composer is layer-key-agnostic and never inspects a payload
//     key. Parsing a payload here is the violation, whatever it is called.
//   · READ-ONLY PROJECTION — this module imports no write path; there is
//     nothing to misuse (the promotionSupabase read-only-by-construction
//     pattern). verbs: [] on the registration makes it structural shell-side.
//   · PROJECTION CONTRACT — pure over inputs: same rows in, same model out;
//     every claim-bearing field carries its why (SPEC-003 §2 rule 3); the
//     renderer cannot invent what this model does not give it.
//   · ZERO LENS DIFFS — composeForLayer(layerKey, …) is the §4 standard
//     skeleton; Warehouse is this file's twin with a different key, and a
//     registered layer's arrival deepens the sheet with no edits here.
//
// The lens reads the CONFIGURED INSTANCE — never the definition, never the
// proposal text (SPEC-002 §1.3, the sentence this lens exists to keep).
// ═══════════════════════════════════════════════════════════════════════════
import { ConfigV1 } from "./moves/types";
import { BaselineProvenance, BASELINE_LABEL, RequirementRow } from "./configure";
import { layerRegistry, upgradeLayerData } from "./layers/registry";
import { LensSection } from "./lensSections";

export interface ProductionQuantity {
  key: string;
  value: number;
  overridden: boolean;
  /** The derivation — shown quiet beneath the number (numbers show their
   *  work; UI_GRAMMAR §5, Pre-work II §4). Null only when no derivation
   *  exists, which the renderer states rather than hides. */
  why: string | null;
}

export interface ProductionRequirement {
  name: string;
  category: string | null;
  derived: boolean;
  suppressed: boolean;
  /** Cause, from the logical key's own grammar (`kitchen.live_chef.…` →
   *  "from live_chef") — deterministic and inspectable, never invented. */
  why: string | null;
  notes: string | null;
}

export interface ProductionComponent {
  id: string;
  title: string;
  /** Rev E provenance label for any divergence-adjacent reading; null when
   *  the instance has no baseline (nothing dishonest is implied by silence). */
  provenanceLabel: string | null;
  quantities: ProductionQuantity[];
  requirements: ProductionRequirement[];
  /** Layer content via the owning registration's contribution — composed,
   *  never parsed (SPEC-003 §3). */
  sections: LensSection[];
  /** The layer annotation — the different material. */
  annotation: string | null;
  /** Honest absence of the layer itself (no instance layer, or the layer key
   *  is not registered): what isn't here, stated (SPEC-003 §5). */
  missingLayer: string | null;
}

export interface ProductionModel {
  event: { title: string; date: string | null; guests: number | null };
  honesty: { readOnly: boolean; reason: string | null };
  components: ProductionComponent[];
}

// ── inputs: canonical rows, already read; the composer is pure over them ──
export interface ProductionInputs {
  booking: { title: string; eventDate: string | null; estGuests: number | null };
  locked: boolean;
  evidence: boolean;
  components: {
    id: string;
    title: string;
    config: ConfigV1 | null;
    baselineProvenance: BaselineProvenance | "none";
    requirements: Pick<RequirementRow, "layerKey" | "logicalKey" | "name" | "category" | "notes" | "derived" | "suppressedAt">[];
    layer: { schemaVersion: number; data: unknown } | null;   // the instance layer for LAYER_KEY
    annotation: string | null;                                 // annotations[LAYER_KEY]
  }[];
}

const causeOf = (logicalKey: string | null): string | null => {
  if (!logicalKey) return null;
  const parts = logicalKey.split(".");
  return parts.length >= 2 ? `from ${parts[1].replace(/_/g, " ")}` : null;
};

/** The §4 standard operational skeleton — layer-key-agnostic by construction
 *  (the ownership-chain proof: nothing below mentions kitchen). Exported for
 *  the unit suite's agnosticism test; Warehouse will promote it to a shared
 *  module when it becomes the second consumer. */
export function composeForLayer(layerKey: string, inputs: ProductionInputs): ProductionModel {
  const reg = layerRegistry.get(layerKey);
  const components: ProductionComponent[] = inputs.components.map((c) => {
    const quantities: ProductionQuantity[] = [];
    if (c.config) {
      for (const k of Object.keys(c.config.scalars)) {
        const s = c.config.scalars[k];
        quantities.push({
          key: k, value: s.value, overridden: s.overridden,
          why: s.overridden && s.derivation
            ? `you set ${s.value} · suggested ${s.derivation.suggested} (${s.derivation.formula})`
            : s.derivation ? s.derivation.formula : null,
        });
      }
    }
    const requirements: ProductionRequirement[] = c.requirements
      .filter((r) => r.layerKey === layerKey)
      .map((r) => ({
        name: r.name, category: r.category ?? null,
        derived: r.derived, suppressed: r.suppressedAt !== null,
        why: r.derived ? causeOf(r.logicalKey) : "added manually",
        notes: r.notes ?? null,
      }));

    let sections: LensSection[] = [];
    let missingLayer: string | null = null;
    if (!reg) {
      missingLayer = `The '${layerKey}' layer is not registered — its content arrives with the registration (Track 0).`;
    } else if (!reg.lens) {
      missingLayer = `The '${layerKey}' layer declares no lens contribution yet.`;
    } else if (!c.layer) {
      missingLayer = `No ${layerKey} layer on this component — nothing was copied at instantiation and none was added.`;
    } else {
      const upgraded = upgradeLayerData(layerKey, c.layer.schemaVersion, c.layer.data);
      sections = reg.lens.sections(upgraded.data, { guests: inputs.booking.estGuests });
    }

    return {
      id: c.id, title: c.title,
      provenanceLabel: c.baselineProvenance !== "none"
        ? (BASELINE_LABEL[c.baselineProvenance] ?? null) : null,
      quantities, requirements, sections,
      annotation: c.annotation, missingLayer,
    };
  });

  return {
    event: { title: inputs.booking.title, date: inputs.booking.eventDate,
      guests: inputs.booking.estGuests },
    honesty: {
      readOnly: inputs.evidence || inputs.locked,
      reason: inputs.evidence
        ? "Historical event — production reads as it was."
        : inputs.locked ? "This version is locked." : null,
    },
    components,
  };
}

/** The Production lens's projection: the kitchen instance of the skeleton. */
export function composeProductionModel(inputs: ProductionInputs): ProductionModel {
  return composeForLayer("kitchen", inputs);
}
