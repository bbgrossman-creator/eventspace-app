// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINTS (v182) — curated best practice, grown by promotion.
// A blueprint POINTS at a real proposal version; its content is read live
// from that version and instantiated through the same copy machinery as
// everything else — so lineage chains to real components, prices arrive
// unconfirmed, and sections travel. Nothing here stores content.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase, logActivity } from "./supabase";
import { copyIntoVersion } from "./studio";

export interface Blueprint {
  id: string; name: string; event_type: string | null;
  source_version_id: string | null; source_label: string;
  active: boolean; created_at: string;
}
export interface BlueprintPreview {
  components: { id: string; title: string; sectionName: string | null; itemCount: number }[];
}

export async function listBlueprints(includeRetired = false): Promise<Blueprint[]> {
  let q = supabase.from("blueprints").select("*").order("created_at", { ascending: false });
  if (!includeRetired) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []) as Blueprint[];
}

export async function promoteToBlueprint(
  booking: { id: string; invoice_num: string },
  version: { id: string; version: number },
  proposalTitle: string,
  name: string,
  eventType: string | null,
): Promise<{ ok: boolean; detail?: string }> {
  const label = `${proposalTitle} v${version.version} · ${new Date().toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
  const { error } = await supabase.from("blueprints").insert({
    name: name.trim(), event_type: eventType, source_version_id: version.id, source_label: label,
  });
  if (error) return { ok: false, detail: `${error.message} — run v182 SQL.` };
  await logActivity(booking.id, booking.invoice_num, "Blueprint Promoted",
    `📐 "${name.trim()}" promoted from ${label}`);
  return { ok: true };
}

/** Live preview of a blueprint's content — read from its source version. */
export async function previewBlueprint(bp: Blueprint): Promise<BlueprintPreview> {
  if (!bp.source_version_id) return { components: [] };
  const { data: cs } = await supabase.from("event_components")
    .select("id,title,section_type_id").eq("proposal_version_id", bp.source_version_id).order("position");
  const comps = (cs ?? []) as { id: string; title: string; section_type_id: string | null }[];
  if (!comps.length) return { components: [] };
  const [{ data: its }, { data: sts }] = await Promise.all([
    supabase.from("component_items").select("component_id").in("component_id", comps.map((c) => c.id)),
    supabase.from("section_types").select("id,name"),
  ]);
  const counts: Record<string, number> = {};
  for (const i of (its ?? []) as { component_id: string }[]) counts[i.component_id] = (counts[i.component_id] ?? 0) + 1;
  const secName: Record<string, string> = {};
  for (const s of (sts ?? []) as { id: string; name: string }[]) secName[s.id] = s.name;
  return {
    components: comps.map((c) => ({
      id: c.id, title: c.title,
      sectionName: c.section_type_id ? (secName[c.section_type_id] ?? null) : null,
      itemCount: counts[c.id] ?? 0,
    })),
  };
}

/** Instantiate the whole blueprint into a version — the same honest copy
 *  as everything else (lineage, sections, amber prices). */
export async function applyBlueprint(
  booking: { id: string; invoice_num: string },
  targetVersionId: string,
  bp: Blueprint,
): Promise<{ ok: boolean; detail?: string; copied: number }> {
  if (!bp.source_version_id) return { ok: false, detail: "This blueprint's source no longer exists — retire it.", copied: 0 };
  const { data: cs } = await supabase.from("event_components")
    .select("id").eq("proposal_version_id", bp.source_version_id).order("position");
  const ids = ((cs ?? []) as { id: string }[]).map((c) => c.id);
  if (!ids.length) return { ok: false, detail: "This blueprint's source has no components — retire it.", copied: 0 };
  return copyIntoVersion(booking, targetVersionId, ids, `blueprint "${bp.name}"`);
}

/** Seed helper for createProposal: apply by source version id directly. */
export async function applyBlueprintSeed(
  booking: { id: string; invoice_num: string },
  targetVersionId: string,
  sourceVersionId: string,
  name: string,
): Promise<{ ok: boolean; detail?: string; copied: number }> {
  const { data: cs } = await supabase.from("event_components")
    .select("id").eq("proposal_version_id", sourceVersionId).order("position");
  const ids = ((cs ?? []) as { id: string }[]).map((c) => c.id);
  if (!ids.length) return { ok: false, detail: "Blueprint source is empty or gone.", copied: 0 };
  return copyIntoVersion(booking, targetVersionId, ids, `blueprint "${name}"`);
}
