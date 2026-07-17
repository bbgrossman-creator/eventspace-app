// ═══════════════════════════════════════════════════════════════════════════
// PROMOTION EVIDENCE (v208) — the read side of the ceremony.
// READ-ONLY BY CONSTRUCTION: this module imports no write path. Completed
// events are the richest source and are read like everything else; writing
// to them is impossible from here because nothing here writes at all.
// Divergence is computed with the SAME computeDivergence the chip uses —
// no duplicated truth — against each instance's FROZEN baseline (Rev E).
// Item lines follow IMPLEMENTATION-004 §0a: stamped instances compare
// against their stamped revision's defaultItems; everything else renders as
// "current selection (no item baseline)" and is cited as such.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { computeDivergence } from "./moves/registry";
import { ConfigV1 } from "./moves/types";
import { BaselineProvenance } from "./configure";
import { RevisionDoc } from "./curation";
import { EvidenceLine, EvidenceAnnotation } from "./promotion";

export interface DefinitionEvidence {
  eventCount: number;
  lines: EvidenceLine[];
  annotations: EvidenceAnnotation[];
}

const EVIDENCE_STATUSES = ["completed", "archived", "cancelled"];

export async function loadDefinitionEvidence(definitionId: string): Promise<DefinitionEvidence> {
  const comps = await supabase.from("event_components")
    .select("id,title,booking_id,bookings(status)")
    .eq("definition_id", definitionId);
  type CompRow = { id: string; title: string; booking_id: string | null;
    bookings: { status?: string | null } | null };
  const rows = (comps.data ?? []) as CompRow[];
  if (rows.length === 0) return { eventCount: 0, lines: [], annotations: [] };
  const ids = rows.map((r) => r.id);

  const [cfgs, items, notes] = await Promise.all([
    supabase.from("event_component_config")
      .select("component_id,data,baseline,baseline_provenance,seed_config_revision")
      .in("component_id", ids),
    supabase.from("component_items")
      .select("component_id,name,unit_price,quantity_basis").in("component_id", ids),
    supabase.from("configuration_moves")
      .select("component_id,payload,created_at").eq("kind", "annotate").in("component_id", ids),
  ]);
  type CfgRow = { component_id: string; data: ConfigV1; baseline: ConfigV1 | null;
    baseline_provenance: string | null; seed_config_revision: string | null };
  const cfgRows = (cfgs.data ?? []) as CfgRow[];

  // stamped revisions fetched once each — the stamp is the item baseline (§0a)
  const stamps = new Map<string, RevisionDoc>();
  const stampIds = Array.from(new Set(cfgRows.map((c) => c.seed_config_revision).filter(Boolean))) as string[];
  if (stampIds.length) {
    const revs = await supabase.from("component_definition_config").select("id,data").in("id", stampIds);
    for (const r of (revs.data ?? []) as { id: string; data: RevisionDoc }[]) stamps.set(r.id, r.data);
  }

  const lines: EvidenceLine[] = [];
  const annotations: EvidenceAnnotation[] = [];
  for (const comp of rows) {
    const status = comp.bookings?.status ?? "active";
    const isEvidence = EVIDENCE_STATUSES.includes(status);
    const label = `${comp.title}${isEvidence ? ` · ${status}` : ""}`;
    const cfg = cfgRows.find((c) => c.component_id === comp.id) ?? null;
    const baselineKind = (cfg?.baseline_provenance ?? "none") as BaselineProvenance | "none";
    const stamped = cfg?.seed_config_revision ? stamps.get(cfg.seed_config_revision) ?? null : null;

    // configuration lines — vs the FROZEN baseline only; a config-less or
    // baseline-less instance contributes no config lines (nothing honest to say)
    if (cfg?.data && cfg.baseline) {
      for (const d of computeDivergence(cfg.data,
        { schemes: {}, scalars: cfg.baseline.scalars ?? {}, choices: cfg.baseline.choices ?? {} })) {
        lines.push({ key: d.dimension, text: d.text, from: d.from, to: d.to,
          componentId: comp.id, eventLabel: label, isEvidence,
          baselineKind, baselineRevision: cfg.seed_config_revision ?? null });
      }
    }

    // item lines — §0a
    const compItems = ((items.data ?? []) as { component_id: string; name: string;
      unit_price: number | null; quantity_basis: string | null }[])
      .filter((i) => i.component_id === comp.id);
    if (stamped) {
      const seedNames = new Set((stamped.defaultItems ?? []).map((i) => i.name));
      const nowNames = new Set(compItems.map((i) => i.name));
      for (const it of compItems) if (!seedNames.has(it.name))
        lines.push({ key: `item:${it.name}`, text: `${it.name} added`, from: null,
          to: { unit_price: it.unit_price, quantity_basis: it.quantity_basis },
          componentId: comp.id, eventLabel: label, isEvidence,
          baselineKind, baselineRevision: cfg!.seed_config_revision });
      for (const seed of stamped.defaultItems ?? []) if (!nowNames.has(seed.name))
        lines.push({ key: `item:${seed.name}`, text: `${seed.name} removed`,
          from: { unit_price: seed.unit_price }, to: null,
          componentId: comp.id, eventLabel: label, isEvidence,
          baselineKind, baselineRevision: cfg!.seed_config_revision });
    } else if (compItems.length && baselineKind !== "none") {
      for (const it of compItems)
        lines.push({ key: `item:${it.name}`, text: `${it.name} — current selection (no item baseline)`,
          to: { unit_price: it.unit_price, quantity_basis: it.quantity_basis },
          componentId: comp.id, eventLabel: label, isEvidence,
          baselineKind, baselineRevision: null, noItemBaseline: true });
    }

    // annotations — read from the move log, the honest current source
    for (const n of (notes.data ?? []) as { component_id: string; payload: { layerKey?: string; text?: string } }[]) {
      if (n.component_id === comp.id && n.payload?.text)
        annotations.push({ componentId: comp.id, eventLabel: label,
          layerKey: n.payload.layerKey ?? "operations", text: n.payload.text });
    }
  }
  return { eventCount: rows.length, lines, annotations };
}
