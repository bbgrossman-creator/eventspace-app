// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURE — the client seam between the move engine and persistence
// (SPEC-002 UI slice). The engine PLANS (pure, proven in v201); this module
// compiles a PlannedBatch into ONE apply_move_batch() call and hands it to a
// persistence adapter. The adapter is injectable so the Chromium harness runs
// the REAL engine against in-memory persistence — same planner, same reducer,
// same batch shape the RPC receives.
// ═══════════════════════════════════════════════════════════════════════════
import {
  planBatch, applyConfigMutations, recomputeConsequences, computeDivergence,
  PlanCtx, PlannedBatch, SchemeDef,
} from "./moves/registry";
import {
  MoveProposal, ConfigV1, OwnedMutation, DerivedRequirement,
  emptyConfig, CONFIG_SCHEMA_VERSION,
} from "./moves/types";
import { currentCan } from "./featureCapabilities";

export interface RequirementRow {
  id?: string;
  layerKey: string;
  logicalKey: string | null;   // null = manual/legacy
  name: string;
  category?: string | null;
  notes?: string | null;
  derived: boolean;
  suppressedAt: string | null;
}

export interface ConfigState {
  componentId: string;
  config: ConfigV1;
  configUpdatedAt: string | null;      // the concurrency token
  requirements: RequirementRow[];
  seed: PlanCtx["seed"];
  annotations: Record<string, string>; // per layer (instance-layer notes field)
  log: { kind: string; origin: string; description: string; parentIx?: number }[];
}

export function emptyState(componentId: string, seed?: Partial<PlanCtx["seed"]>): ConfigState {
  return {
    componentId,
    config: emptyConfig(),
    configUpdatedAt: null,
    requirements: [],
    seed: { schemes: {}, scalars: {}, choices: {}, dimensions: {}, ...seed },
    annotations: {},
    log: [],
  };
}

/** The exact payload apply_move_batch() receives — one shape, both adapters. */
export interface BatchPayload {
  componentId: string;
  expectedUpdatedAt: string | null;
  config: ConfigV1 | null;
  configSchemaVersion: number;
  derived: { layer_key: string; logical_key: string; name: string; category?: string | null; notes?: string | null }[] | null;
  suppress: { layer_key: string; logical_key: string }[];
  restore: { layer_key: string; logical_key: string }[];
  manualAdd: { layer_key: string; name: string; category?: string | null; notes?: string | null }[];
  items: Record<string, unknown>[];
  moves: { kind: string; payload: unknown; origin: string; parent_ix?: number; cause?: string }[];
}

export interface PersistAdapter {
  (batch: BatchPayload): Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Compile a batch of proposals into the payload + the optimistic next state.
 *  Throws (MoveError) on ANY invalid member — whole-batch validation. */
export function compileBatch(state: ConfigState, proposals: MoveProposal[]): {
  payload: BatchPayload; next: ConfigState; planned: PlannedBatch;
} {
  const ctx: PlanCtx = { view: viewOfState(state), seed: state.seed };
  const planned = planBatch(proposals, ctx, currentCan());

  const nextConfig = applyConfigMutations(state.config, planned.mutations);
  const configChanged = JSON.stringify(nextConfig) !== JSON.stringify(state.config);
  const derived = configChanged ? recomputeConsequences(nextConfig) : null;

  const suppress: BatchPayload["suppress"] = [];
  const restore: BatchPayload["restore"] = [];
  const manualAdd: BatchPayload["manualAdd"] = [];
  const items: BatchPayload["items"] = [];
  for (const m of planned.mutations) {
    if (m.boundary === "requirements") {
      const mu = m.mutation;
      if (mu.op === "suppress") suppress.push({ layer_key: mu.layerKey, logical_key: mu.logicalKey });
      if (mu.op === "restore") restore.push({ layer_key: mu.layerKey, logical_key: mu.logicalKey });
      if (mu.op === "add_manual") manualAdd.push({ layer_key: mu.layerKey, name: mu.name, category: mu.category ?? null, notes: mu.notes ?? null });
    }
    if (m.boundary === "items") {
      const mu = m.mutation as Record<string, unknown> & { op: string };
      items.push({ op: mu.op, item_id: (mu as { itemId?: string }).itemId,
        name: (mu as { name?: string }).name,
        category_key: (mu as { categoryKey?: string | null }).categoryKey ?? null,
        unit_price: (mu as { unitPrice?: number | null }).unitPrice ?? null,
        quantity_basis: (mu as { quantityBasis?: string | null }).quantityBasis ?? null,
        position: (mu as { position?: number }).position ?? 0,
        price_confirmed: (mu as { priceConfirmed?: boolean }).priceConfirmed ?? null,
        taxable: (mu as { taxable?: boolean }).taxable ?? null });
    }
  }

  const payload: BatchPayload = {
    componentId: state.componentId,
    expectedUpdatedAt: state.configUpdatedAt,
    config: configChanged ? nextConfig : null,
    configSchemaVersion: CONFIG_SCHEMA_VERSION,
    derived: derived?.map((d) => ({ layer_key: d.layerKey, logical_key: d.logicalKey, name: d.name, category: d.category ?? null, notes: d.notes ?? null })) ?? null,
    suppress, restore, manualAdd, items,
    moves: planned.proposals.map((p) => ({ kind: p.kind, payload: p.payload, origin: p.origin, parent_ix: p.parentIx, cause: p.cause })),
  };

  const next: ConfigState = {
    ...state,
    config: nextConfig,
    requirements: applyRequirementEffects(state.requirements, derived, suppress, restore, manualAdd),
    annotations: applyAnnotations(state.annotations, planned.mutations),
    log: [...state.log, ...planned.proposals.map((p, i) => ({
      kind: p.kind, origin: p.origin, description: planned.descriptions[i], parentIx: p.parentIx,
    }))],
  };
  return { payload, next, planned };
}

/** Submit: compile, persist atomically, commit optimistic state only on ok. */
export async function submitBatch(
  state: ConfigState, proposals: MoveProposal[], persist: PersistAdapter
): Promise<{ ok: true; next: ConfigState } | { ok: false; error: string; next: ConfigState }> {
  let compiled;
  try { compiled = compileBatch(state, proposals); }
  catch (e) { return { ok: false, error: (e as Error).message, next: state }; }
  const res = await persist(compiled.payload);
  if (!res.ok) return { ok: false, error: res.error, next: state };  // NOTHING applied
  return { ok: true, next: { ...compiled.next, configUpdatedAt: new Date().toISOString() } };
}

export function divergenceOf(state: ConfigState) {
  return computeDivergence(state.config, state.seed);
}

// ── internals ────────────────────────────────────────────────────────────────
import { viewOf } from "./moves/types";
function viewOfState(s: ConfigState) { return viewOf(s.config); }

function applyRequirementEffects(
  rows: RequirementRow[],
  derived: DerivedRequirement[] | null,
  suppress: BatchPayload["suppress"], restore: BatchPayload["restore"], manualAdd: BatchPayload["manualAdd"],
): RequirementRow[] {
  let out = rows.slice();
  if (derived) {
    // mirror the RPC exactly: unsuppressed derived rows not in the new set go;
    // suppressed rows KEEP their suppression; new keys upsert
    out = out.filter((r) => !r.derived || r.suppressedAt !== null ||
      derived.some((d) => d.layerKey === r.layerKey && d.logicalKey === r.logicalKey));
    for (const d of derived) {
      const ex = out.find((r) => r.layerKey === d.layerKey && r.logicalKey === d.logicalKey);
      if (ex) { ex.name = d.name; ex.category = d.category ?? null; }
      else out.push({ layerKey: d.layerKey, logicalKey: d.logicalKey, name: d.name, category: d.category ?? null, notes: d.notes ?? null, derived: true, suppressedAt: null });
    }
  }
  for (const s of suppress) { const r = out.find((r) => r.layerKey === s.layer_key && r.logicalKey === s.logical_key); if (r) r.suppressedAt = new Date().toISOString(); }
  for (const s of restore) { const r = out.find((r) => r.layerKey === s.layer_key && r.logicalKey === s.logical_key); if (r) r.suppressedAt = null; }
  for (const m of manualAdd) out.push({ layerKey: m.layer_key, logicalKey: null, name: m.name, category: m.category ?? null, notes: m.notes ?? null, derived: false, suppressedAt: null });
  return out;
}

function applyAnnotations(a: Record<string, string>, mutations: OwnedMutation[]): Record<string, string> {
  const out = { ...a };
  for (const m of mutations) if (m.boundary === "annotations" && m.mutation.op === "annotate")
    out[m.mutation.layerKey] = m.mutation.text;
  return out;
}

/** The in-memory adapter used by the browser harness: accepts everything the
 *  RPC would, refuses what it would refuse (poison origins), and keeps an
 *  append-only log so tests can assert the vocabulary. */
export function memoryAdapter() {
  const persisted: BatchPayload[] = [];
  const adapter: PersistAdapter = async (batch) => {
    for (const m of batch.moves)
      if (!["facet","canvas","scheme","intent.deterministic","intent.model","intent.replay"].includes(m.origin))
        return { ok: false, error: `ITEMS/ORIGIN check violated: ${m.origin}` };
    persisted.push(JSON.parse(JSON.stringify(batch)));
    return { ok: true };
  };
  return { adapter, persisted };
}
