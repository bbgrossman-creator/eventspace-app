// ═══════════════════════════════════════════════════════════════════════════
// KITCHEN — the proof-of-life layer registration (SPEC-001, approved scope:
// "registration, schema, empty state, capability declaration, and tests.
// No editor or Production workflow.")
//
// This file is the zero-diff test made real: everything Kitchen is, lives
// here. The registry, the platform, and the schema know nothing of it.
// ═══════════════════════════════════════════════════════════════════════════
import { registerLayer, Validator, LayerValidationError } from "./registry";

/**
 * SEED knowledge for the family — defaults an instance starts from, never a
 * mandate it must keep. Two Sushi Stations may diverge completely after
 * instantiation (SPEC-001 §1.4).
 */
export interface KitchenLayerV1 {
  /** What this component requires from the kitchen ("sushi chef", "refrigeration"). */
  requirements: string[];
  /** Equipment and serving pieces the kitchen must stage. */
  equipment: string[];
  /** Staffing asks, role + count. */
  staffing: { role: string; count: number }[];
  /** Free-form prep notes. */
  prepNotes: string | null;
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

const kitchenV1: Validator<KitchenLayerV1> = {
  parse(input: unknown): KitchenLayerV1 {
    const fail = (d: string) => { throw new LayerValidationError("kitchen", d); };
    if (typeof input !== "object" || input === null) fail("payload must be an object");
    const o = input as Record<string, unknown>;
    if (!isStringArray(o.requirements)) fail("requirements must be string[]");
    if (!isStringArray(o.equipment)) fail("equipment must be string[]");
    if (!Array.isArray(o.staffing) ||
        !o.staffing.every((s) => typeof s === "object" && s !== null
          && typeof (s as { role?: unknown }).role === "string"
          && typeof (s as { count?: unknown }).count === "number"
          && Number.isInteger((s as { count: number }).count)
          && (s as { count: number }).count >= 0)) {
      fail("staffing must be {role: string, count: int >= 0}[]");
    }
    if (o.prepNotes !== null && typeof o.prepNotes !== "string") fail("prepNotes must be string | null");
    const keys = new Set(["requirements", "equipment", "staffing", "prepNotes"]);
    for (const k of Object.keys(o)) if (!keys.has(k)) fail(`unknown field "${k}"`);
    return {
      requirements: o.requirements as string[],
      equipment: o.equipment as string[],
      staffing: o.staffing as { role: string; count: number }[],
      prepNotes: (o.prepNotes ?? null) as string | null,
    };
  },
};

export function registerKitchenLayer(): void {
  registerLayer<KitchenLayerV1>({
    key: "kitchen",
    capability: "production.kitchen",
    schemaVersion: 1,
    schema: kitchenV1,
    migrations: {},                      // v1 is first; upgraders arrive with v2
    emptyState: () => ({ requirements: [], equipment: [], staffing: [], prepNotes: null }),
    label: { singular: "Kitchen", icon: "🍳" },
    // What configuration choices mean FOR THE KITCHEN. Bound to this layer at
    // boot; emissions outside "kitchen.*" are refused at recompute.
    consequenceRules: [
      (view: { choice: (k: string) => string | undefined }) => {
        const out: { layerKey: string; logicalKey: string; name: string; category?: string }[] = [];
        const service = view.choice("service");
        if (service) {
          out.push({ layerKey: "kitchen", logicalKey: "kitchen.service.refrigeration", name: "Refrigeration", category: "equipment" });
          out.push({ layerKey: "kitchen", logicalKey: "kitchen.service.power", name: "Power drop", category: "equipment" });
        }
        if (service === "live_chef") {
          out.push({ layerKey: "kitchen", logicalKey: "kitchen.live_chef.handwash_station", name: "Handwash station", category: "equipment" });
          out.push({ layerKey: "kitchen", logicalKey: "kitchen.live_chef.prep_table", name: "Prep table", category: "equipment" });
        }
        return out;
      },
    ],
  });
}
