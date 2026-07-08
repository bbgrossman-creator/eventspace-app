// ═══════════════════════════════════════════════════════════════════════════
// CAPABILITIES — the two-axis segmentation (Editions Architecture v2).
//
//   Business Type   = WHAT the company is   (vocabulary, defaults)
//   Operating Model = HOW it builds events  (drives capabilities)
//
// Rules that keep one codebase honest:
//   • UI gates read `caps.x`, NEVER business_type or operating_model directly.
//   • Upgrades reveal, never migrate: capture is universal (knowledge_capture
//     defaults ON everywhere), so flipping the model makes surfaces appear
//     already full of the business's own history.
//   • No dead data: nothing may create placeholder rows for gated features.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

export type BusinessType = "venue" | "caterer" | "planner" | "florist" | "rental" | "production";
export type OperatingModel = "template_driven" | "proposal_driven" | "hybrid" | "enterprise";

export interface Capabilities {
  /** The capture bundle — genealogy intake, debrief tasks, backfill, photo
   *  attach points. ON for every model by default; capture is cheap and is
   *  what makes upgrade-by-reveal possible. */
  knowledge_capture: boolean;
  // Retrieval & authoring surfaces — individually gated.
  components_editor: boolean;
  component_copy: boolean;
  rolodex: boolean;
  photos_retrieval: boolean;
  requirements: boolean;
  proposals: boolean;
  event_legacy: boolean;
  multi_domain: boolean;
  workflow_engine: boolean;
}

export const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: "venue", label: "Venue / Event Space" },
  { value: "caterer", label: "Caterer" },
  { value: "planner", label: "Event Planner" },
  { value: "florist", label: "Florist" },
  { value: "rental", label: "Rental Company" },
  { value: "production", label: "Production Company" },
];
export const OPERATING_MODELS: { value: OperatingModel; label: string; help: string }[] = [
  { value: "template_driven", label: "Template Driven", help: "Mostly standard packages — fast quotes, predefined menus. Screens stay simple." },
  { value: "proposal_driven", label: "Proposal Driven", help: "Mostly custom proposals — components, reuse, revisions, approvals." },
  { value: "hybrid", label: "Hybrid", help: "A mixture of both." },
  { value: "enterprise", label: "Enterprise", help: "Hybrid plus custom workflow pipelines (future)." },
];

/** Pure derivation: (type, model, overrides) → capabilities.
 *  Business type only influences vocabulary-level flags (multi_domain);
 *  the operating model does the engineering work. */
export function deriveCapabilities(
  type: BusinessType,
  model: OperatingModel,
  overrides: Partial<Capabilities> = {},
): Capabilities {
  const advanced = model === "proposal_driven" || model === "hybrid" || model === "enterprise";
  const base: Capabilities = {
    knowledge_capture: true,
    components_editor: advanced,
    component_copy: advanced,
    rolodex: advanced,
    photos_retrieval: advanced,
    requirements: advanced,
    proposals: advanced,
    event_legacy: advanced,
    // Food-only for advanced venues/caterers by default; every domain for
    // businesses whose primary work isn't food, and for hybrid/enterprise.
    multi_domain: advanced && (model !== "proposal_driven" || !["venue", "caterer"].includes(type)),
    workflow_engine: model === "enterprise",
  };
  return { ...base, ...overrides };
}

export interface BusinessConfig {
  business_type: BusinessType;
  operating_model: OperatingModel;
  caps: Capabilities;
}

const DEFAULTS: BusinessConfig = {
  business_type: "venue",
  operating_model: "template_driven",
  caps: deriveCapabilities("venue", "template_driven"),
};

/** Load the two axes + any cap_override:* rows from app_settings.
 *  Missing table/rows → template-driven defaults (Burger Bar behavior). */
export async function loadCapabilities(): Promise<BusinessConfig> {
  const { data, error } = await supabase.from("app_settings").select("key,value");
  if (error || !data) return DEFAULTS;
  const rows = data as { key: string; value: string }[];
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const type = (get("business_type") as BusinessType) || DEFAULTS.business_type;
  const model = (get("operating_model") as OperatingModel) || DEFAULTS.operating_model;
  const overrides: Partial<Capabilities> = {};
  for (const r of rows) {
    if (r.key.startsWith("cap_override:")) {
      const capKey = r.key.slice("cap_override:".length) as keyof Capabilities;
      overrides[capKey] = r.value === "1" || r.value === "true";
    }
  }
  return { business_type: type, operating_model: model, caps: deriveCapabilities(type, model, overrides) };
}
