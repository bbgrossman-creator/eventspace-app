// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE PERSISTENCE ADAPTER — the production twin of memoryAdapter().
// Same BatchPayload in, one apply_move_batch() RPC out (one transaction,
// proven V2-4/V3-2). Plus loadConfigState() and instantiateComponent().
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { BatchPayload, PersistAdapter, ConfigState, emptyState, RequirementRow } from "./configure";
import { ConfigV1 } from "./moves/types";
import { CONFIG_SCHEMA_VERSION } from "./moves/types";

export const supabasePersistAdapter: PersistAdapter = async (b: BatchPayload) => {
  const { error } = await supabase.rpc("apply_move_batch", {
    p_component: b.componentId,
    p_expected_updated_at: b.expectedUpdatedAt,
    p_config: b.config,
    p_config_schema_version: b.configSchemaVersion,
    p_derived: b.derived,
    p_suppress: b.suppress.length ? b.suppress : null,
    p_restore: b.restore.length ? b.restore : null,
    p_manual_add: b.manualAdd.length ? b.manualAdd : null,
    p_moves: b.moves,
    p_items: b.items.length ? b.items : null,
    p_baseline: b.baseline ?? null,
    p_baseline_provenance: b.baselineProvenance ?? null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
};

export async function loadConfigState(componentId: string): Promise<ConfigState> {
  const [cfg, reqs, comp] = await Promise.all([
    supabase.from("event_component_config")
      .select("data,schema_version,updated_at,seed_config_revision,baseline,baseline_provenance,baseline_at")
      .eq("component_id", componentId).maybeSingle(),
    supabase.from("component_requirements")
      .select("id,layer_key,logical_key,name,category,notes,derived,suppressed_at").eq("component_id", componentId),
    supabase.from("event_components")
      .select("definition_id,booking_id,bookings(status)").eq("id", componentId).maybeSingle(),
  ]);
  const bookingStatus = ((comp.data as { bookings?: { status?: string | null } | null } | null)
    ?.bookings?.status ?? "active") as string;
  const isEvidence = ["completed", "archived", "cancelled"].includes(bookingStatus);
  const state = emptyState(componentId);
  const applySeed = (d: Record<string, unknown>) => {
    const dd = d as { schemes?: Record<string, unknown>; dimensions?: Record<string, unknown>;
      instanceDefaults?: { scalars?: Record<string, unknown>; choices?: Record<string, unknown> } };
    state.seed.schemes = (dd.schemes ?? {}) as typeof state.seed.schemes;
    state.seed.dimensions = (dd.dimensions ?? {}) as typeof state.seed.dimensions;
    state.seed.scalars = (dd.instanceDefaults?.scalars ?? {}) as typeof state.seed.scalars;
    state.seed.choices = (dd.instanceDefaults?.choices ?? {}) as typeof state.seed.choices;
  };
  state.evidence = isEvidence;
  if (cfg.data?.data) {
    state.config = cfg.data.data;
    state.configUpdatedAt = cfg.data.updated_at;
    state.baseline = {
      config: (cfg.data.baseline ?? null) as ConfigV1 | null,
      provenance: (cfg.data.baseline_provenance ?? "baseline_unknown") as ConfigState["baseline"]["provenance"],
      at: cfg.data.baseline_at ?? null,
    };
  }
  if (cfg.data?.seed_config_revision) {
    // instantiated: the seed is the exact stamped revision, forever
    const seed = await supabase.from("component_definition_config")
      .select("data").eq("id", cfg.data.seed_config_revision).maybeSingle();
    if (seed.data?.data) applySeed(seed.data.data);
  } else if (!cfg.data && isEvidence) {
    // HISTORICAL HONESTY (SPEC-002 baseline amendment): an executed, archived,
    // or cancelled event NEVER inherits current definition configuration —
    // present-day curation must not appear as a past event's baseline. The
    // component reads as it was: baseline unknown, evidence, read-only.
    state.baseline = { config: null, provenance: "baseline_unknown", at: null };
  } else if (comp.data?.definition_id) {
    // LIVE legacy component: the definition's config is loaded for its OPTION
    // SETS and to OFFER a deliberate initialization — it is never silently a
    // baseline. A plain first edit freezes the pre-edit state instead
    // (reconstructed_from_instance, enforced by the RPC's BASELINE_REQUIRED).
    const live = await supabase.from("component_definition_config").select("data")
      .eq("definition_id", comp.data.definition_id)
      .is("superseded_by", null).is("archived_at", null).maybeSingle();
    if (live.data?.data) {
      applySeed(live.data.data);
      if (!cfg.data) state.offerInitialize = true;
    }
  }
  type ReqDbRow = { id: string; layer_key: string | null; logical_key: string | null; name: string;
    category: string | null; notes: string | null; derived: boolean | null; suppressed_at: string | null };
  state.requirements = ((reqs.data ?? []) as ReqDbRow[]).map((r): RequirementRow => ({
    id: r.id, layerKey: r.layer_key ?? "operations", logicalKey: r.logical_key,
    name: r.name, category: r.category, notes: r.notes,
    derived: !!r.derived, suppressedAt: r.suppressed_at,
  }));
  return state;
}

export async function instantiateComponent(definitionId: string, bookingId: string, versionId: string | null): Promise<
  { ok: true; componentId: string } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc("instantiate_component", {
    p_definition: definitionId, p_booking: bookingId, p_version: versionId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, componentId: (data as { component_id: string }).component_id };
}

export { CONFIG_SCHEMA_VERSION };
