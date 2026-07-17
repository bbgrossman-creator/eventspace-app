// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE PERSISTENCE ADAPTER — the production twin of memoryAdapter().
// Same BatchPayload in, one apply_move_batch() RPC out (one transaction,
// proven V2-4/V3-2). Plus loadConfigState() and instantiateComponent().
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { BatchPayload, PersistAdapter, ConfigState, emptyState, RequirementRow } from "./configure";
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
  });
  return error ? { ok: false, error: error.message } : { ok: true };
};

export async function loadConfigState(componentId: string): Promise<ConfigState> {
  const [cfg, reqs] = await Promise.all([
    supabase.from("event_component_config")
      .select("data,schema_version,updated_at,seed_config_revision").eq("component_id", componentId).maybeSingle(),
    supabase.from("component_requirements")
      .select("id,layer_key,logical_key,name,category,notes,derived,suppressed_at").eq("component_id", componentId),
  ]);
  const state = emptyState(componentId);
  const applySeed = (d: Record<string, unknown>) => {
    const dd = d as { schemes?: Record<string, unknown>; dimensions?: Record<string, unknown>;
      instanceDefaults?: { scalars?: Record<string, unknown>; choices?: Record<string, unknown> } };
    state.seed.schemes = (dd.schemes ?? {}) as typeof state.seed.schemes;
    state.seed.dimensions = (dd.dimensions ?? {}) as typeof state.seed.dimensions;
    state.seed.scalars = (dd.instanceDefaults?.scalars ?? {}) as typeof state.seed.scalars;
    state.seed.choices = (dd.instanceDefaults?.choices ?? {}) as typeof state.seed.choices;
  };
  if (cfg.data?.data) {
    state.config = cfg.data.data;
    state.configUpdatedAt = cfg.data.updated_at;
  }
  if (cfg.data?.seed_config_revision) {
    // instantiated: the seed is the exact stamped revision, forever
    const seed = await supabase.from("component_definition_config")
      .select("data").eq("id", cfg.data.seed_config_revision).maybeSingle();
    if (seed.data?.data) applySeed(seed.data.data);
  } else {
    // LEGACY components (pre-v201, no stamp): the definition's LIVE config is
    // the seed, so curation lights up existing events the moment it exists.
    const comp = await supabase.from("event_components")
      .select("definition_id").eq("id", componentId).maybeSingle();
    if (comp.data?.definition_id) {
      const live = await supabase.from("component_definition_config").select("data")
        .eq("definition_id", comp.data.definition_id)
        .is("superseded_by", null).is("archived_at", null).maybeSingle();
      if (live.data?.data) applySeed(live.data.data);
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
