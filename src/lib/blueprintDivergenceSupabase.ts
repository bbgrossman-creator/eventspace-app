// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT DIVERGENCE & CITATION — data (v254 · BP-4). READ-ONLY, three
// loads: (1) the design's citation record (the v253 act's append-only row —
// this file never writes it, never repairs it); (2) the CURRENT materialized
// design, assembled in exactly the baseline's shape so the pure comparison
// receives two values of one type; (3) shelf status for the ORTHOGONAL
// earlier-revision note — id · number · state · identity only, NEVER the
// revision's content: the current blueprint's content is constitutionally
// irrelevant to divergence and is not even fetched.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { MaterializedDesign, MaterializedComponent } from "./blueprintDivergence";

export interface CitationRecord {
  id: string;
  blueprint_id: string;
  revision_id: string;
  revision_number: number;
  fingerprint: string;
  snapshot_at: string;
  parameters: Record<string, unknown>;
  branches: unknown[];
  frozen_baseline: unknown;
}

/** The design's origin, if it has one. Null = not started from a blueprint
 *  (itself information, rendered as nothing — no citation is honest too). */
export async function loadCitation(versionId: string): Promise<CitationRecord | null> {
  const { data } = await supabase
    .from("blueprint_instantiations")
    .select("id,blueprint_id,revision_id,revision_number,fingerprint,snapshot_at,parameters,branches,frozen_baseline")
    .eq("version_id", versionId)
    .maybeSingle();
  return (data as CitationRecord | null) ?? null;
}

export interface ShelfStatus {
  blueprintName: string;
  publishedRevisionId: string | null;
  identityStatus: string;
  citedRevisionState: string;   // published | superseded — resolves forever
}

/** Shelf facts for the citation's supporting notes. The cited revision row
 *  resolves permanently (published revisions are never hard-deleted, v251);
 *  supersession and retirement change the NOTES, never the citation. */
export async function loadShelfStatus(blueprintId: string, citedRevisionId: string): Promise<ShelfStatus | null> {
  const [ident, rev] = await Promise.all([
    supabase.from("blueprint_identities").select("name,status,published_revision_id").eq("id", blueprintId).maybeSingle(),
    supabase.from("blueprint_revisions").select("id,state,revision_number").eq("id", citedRevisionId).maybeSingle(),
  ]);
  if (!ident.data) return null;
  const i = ident.data as { name: string; status: string; published_revision_id: string | null };
  const r = (rev.data ?? null) as { state: string } | null;
  return {
    blueprintName: i.name,
    publishedRevisionId: i.published_revision_id,
    identityStatus: i.status,
    citedRevisionState: r?.state ?? "unknown",
  };
}

/** Assemble the CURRENT materialized design in the baseline's exact shape. */
export async function loadCurrentMaterialized(versionId: string): Promise<MaterializedDesign> {
  const [secs, comps, pv, guests] = await Promise.all([
    supabase.from("version_sections").select("section_type_id,position").eq("version_id", versionId).order("position"),
    supabase.from("event_components")
      .select("id,title,section_type_id,definition_id,instantiation_id,pricing_mode,package_price,package_price_confirmed,position")
      .eq("proposal_version_id", versionId).order("position"),
    supabase.from("proposal_versions").select("theme_key,theme_override,photo_pins").eq("id", versionId).maybeSingle(),
    supabase.from("version_guests").select("category_id,count").eq("version_id", versionId),
  ]);
  const compRows = (comps.data ?? []) as (MaterializedComponent & { position: number })[];
  const ids = compRows.map((c) => c.id);
  const [cfgs, items] = await Promise.all([
    ids.length
      ? supabase.from("event_component_config").select("component_id,data,seed_config_revision").in("component_id", ids)
      : Promise.resolve({ data: [] as unknown[] }),
    ids.length
      ? supabase.from("component_items").select("component_id,name,unit_price,price_confirmed,position").in("component_id", ids).order("position")
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const cfgBy = new Map((cfgs.data as { component_id: string; data: unknown; seed_config_revision: string | null }[] ?? [])
    .map((r) => [r.component_id, r]));
  const itemsBy = new Map<string, { name: string; unit_price: number | null; price_confirmed: boolean | null }[]>();
  for (const it of (items.data as { component_id: string; name: string; unit_price: number | null; price_confirmed: boolean | null }[] ?? [])) {
    const arr = itemsBy.get(it.component_id) ?? [];
    arr.push({ name: it.name, unit_price: it.unit_price, price_confirmed: it.price_confirmed });
    itemsBy.set(it.component_id, arr);
  }
  return {
    sections: (secs.data ?? []) as MaterializedDesign["sections"],
    components: compRows.map((c) => ({
      id: c.id, title: c.title, section_type_id: c.section_type_id,
      definition_id: c.definition_id, instantiation_id: c.instantiation_id,
      pricing_mode: c.pricing_mode, package_price: c.package_price,
      package_price_confirmed: c.package_price_confirmed,
      config: cfgBy.get(c.id)?.data ?? null,
      seed_config_revision: cfgBy.get(c.id)?.seed_config_revision ?? null,
      items: itemsBy.get(c.id) ?? [],
    })),
    presentation: (pv.data ?? null) as MaterializedDesign["presentation"],
    guests: (guests.data ?? []) as MaterializedDesign["guests"],
  };
}
