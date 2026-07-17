// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION LENS — loader (v212). READ-ONLY BY CONSTRUCTION: imports no
// write path. Batches canonical reads (the loadDefinitionEvidence pattern)
// and hands them to the pure composer; the renderer never queries
// (SPEC-003 §2). All reads travel existing RLS-governed tables — no new
// surface joins the verify matrix because no new query shape exists.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { ConfigV1 } from "./moves/types";
import { BaselineProvenance } from "./configure";
import { composeProductionModel, ProductionInputs, ProductionModel } from "./productionLens";

const EVIDENCE_STATUSES = ["completed", "archived", "cancelled"];
const LAYER_KEY = "kitchen";

export async function loadProductionModel(
  bookingId: string, versionId: string, locked: boolean,
): Promise<ProductionModel> {
  const [bk, comps] = await Promise.all([
    supabase.from("bookings")
      .select("title,event_date,est_guests,status").eq("id", bookingId).maybeSingle(),
    supabase.from("event_components")
      .select("id,title,position").eq("version_id", versionId).order("position"),
  ]);
  type BkRow = { title: string | null; event_date: string | null;
    est_guests: number | null; status: string | null };
  const b = (bk.data ?? null) as BkRow | null;
  type CompRow = { id: string; title: string };
  const compRows = (comps.data ?? []) as CompRow[];
  const ids = compRows.map((c) => c.id);

  const [cfgs, reqs, notes, layers] = ids.length
    ? await Promise.all([
        supabase.from("event_component_config")
          .select("component_id,data,baseline_provenance").in("component_id", ids),
        supabase.from("component_requirements")
          .select("component_id,layer_key,logical_key,name,category,notes,derived,suppressed_at")
          .in("component_id", ids),
        supabase.from("configuration_moves")
          .select("component_id,payload,created_at")
          .eq("kind", "annotate").in("component_id", ids).order("created_at"),
        supabase.from("component_instance_layers")
          .select("component_id,layer_key,schema_version,data")
          .eq("layer_key", LAYER_KEY).in("component_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  type CfgRow = { component_id: string; data: ConfigV1 | null; baseline_provenance: string | null };
  type ReqRow = { component_id: string; layer_key: string | null; logical_key: string | null;
    name: string; category: string | null; notes: string | null; derived: boolean;
    suppressed_at: string | null };
  type NoteRow = { component_id: string; payload: { layerKey?: string; text?: string } | null };
  type LayerRow = { component_id: string; schema_version: number; data: unknown };

  const cfgBy = new Map<string, CfgRow>();
  for (const r of (cfgs.data ?? []) as CfgRow[]) cfgBy.set(r.component_id, r);
  const reqsBy = new Map<string, ReqRow[]>();
  for (const r of (reqs.data ?? []) as ReqRow[]) {
    const a = reqsBy.get(r.component_id) ?? []; a.push(r); reqsBy.set(r.component_id, a);
  }
  // last annotate per component for the layer wins (moves are ordered asc)
  const noteBy = new Map<string, string>();
  for (const n of (notes.data ?? []) as NoteRow[])
    if (n.payload?.layerKey === LAYER_KEY && typeof n.payload.text === "string")
      noteBy.set(n.component_id, n.payload.text);
  const layerBy = new Map<string, LayerRow>();
  for (const l of (layers.data ?? []) as LayerRow[]) layerBy.set(l.component_id, l);

  const inputs: ProductionInputs = {
    booking: { title: b?.title ?? "(untitled event)", eventDate: b?.event_date ?? null,
      estGuests: b?.est_guests ?? null },
    locked,
    evidence: EVIDENCE_STATUSES.includes(b?.status ?? ""),
    components: compRows.map((c) => {
      const cfg = cfgBy.get(c.id);
      return {
        id: c.id, title: c.title,
        config: cfg?.data ?? null,
        baselineProvenance: (cfg?.baseline_provenance ?? "none") as BaselineProvenance | "none",
        requirements: (reqsBy.get(c.id) ?? []).map((r) => ({
          layerKey: r.layer_key ?? "operations", logicalKey: r.logical_key,
          name: r.name, category: r.category, notes: r.notes,
          derived: r.derived, suppressedAt: r.suppressed_at,
        })),
        layer: layerBy.get(c.id)
          ? { schemaVersion: layerBy.get(c.id)!.schema_version, data: layerBy.get(c.id)!.data }
          : null,
        annotation: noteBy.get(c.id) ?? null,
      };
    }),
  };
  return composeProductionModel(inputs);
}
