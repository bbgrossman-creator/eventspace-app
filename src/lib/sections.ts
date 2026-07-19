// ═══════════════════════════════════════════════════════════════════════════
// SECTIONS (v181) — the Proposal Language's data layer.
// Vocabulary = first-class identity (stable IDs). Intelligence = derived:
// placement stats are a group-by over real placements, surfaced as counted
// suggestions, never enforcement (doctrine Q3, honesty label included:
// stats group by component TITLE — fine for suggestions, not pricing-grade).
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

export interface SectionType { id: string; name: string; position: number; active: boolean; category?: string | null; }
export interface VersionSection { section_type_id: string; position: number; }

/** v219 — a NEW moment type, coined at the picker. Position lands after the
 *  current tail; active by default; the id comes back for immediate use. */
export async function createSectionType(name: string, afterPosition: number): Promise<SectionType | null> {
  const { data, error } = await supabase.from("section_types")
    .insert({ name: name.trim(), position: afterPosition + 1, active: true })
    .select("id,name,position,active").maybeSingle();
  if (error) return null;
  return (data ?? null) as SectionType | null;
}

export async function loadSectionTypes(): Promise<SectionType[]> {
  // v221: `category` feeds the curated picker; a pre-migration DB simply
  // answers without it (the picker's General group absorbs everything).
  const withCat = await supabase.from("section_types")
    .select("id,name,position,active,category").eq("active", true).order("position");
  if (!withCat.error) return (withCat.data ?? []) as SectionType[];
  const { data } = await supabase.from("section_types")
    .select("id,name,position,active").eq("active", true).order("position");
  return (data ?? []) as SectionType[];
}

/** v221 — archetype names → section_type ids, in the archetype's order,
 *  case-insensitively; missing names are COINED (createSectionType), because
 *  a seed must never fail on vocabulary the tenant hasn't used yet. */
export async function ensureSectionTypeIds(names: string[]): Promise<string[]> {
  if (!names.length) return [];
  const types = await loadSectionTypes();
  const byName: Record<string, string> = {};
  let maxPos = 0;
  for (const t of types) { byName[t.name.trim().toLowerCase()] = t.id; if (t.position > maxPos) maxPos = t.position; }
  const out: string[] = [];
  for (const n of names) {
    const hit = byName[n.trim().toLowerCase()];
    if (hit) { out.push(hit); continue; }
    const made = await createSectionType(n, maxPos);
    if (made) { maxPos = made.position; byName[n.trim().toLowerCase()] = made.id; out.push(made.id); }
  }
  return out;
}

/** Section headers a new proposal starts with for this event type.
 *  Case-insensitive contains-match ("Elegant Wedding" hits the Wedding
 *  scaffold); falls back to a sensible generic set. Labels only — content
 *  never comes from scaffolds. */
export async function scaffoldFor(eventType: string | null): Promise<string[]> {
  if (eventType?.trim()) {
    const { data } = await supabase.from("event_type_scaffolds")
      .select("event_type,section_type_id,position").order("position");
    const rows = (data ?? []) as { event_type: string; section_type_id: string; position: number }[];
    const t = eventType.trim().toLowerCase();
    const match = rows.filter((r) => t.includes(r.event_type.toLowerCase()) || r.event_type.toLowerCase().includes(t));
    if (match.length) {
      const seen = new Set<string>(); const out: string[] = [];
      for (const r of match) if (!seen.has(r.section_type_id)) { seen.add(r.section_type_id); out.push(r.section_type_id); }
      return out;
    }
  }
  const types = await loadSectionTypes();
  const generic = ["Cocktail Hour", "Dinner", "Dessert", "Beverage", "Rentals", "Staffing"];
  return types.filter((s) => generic.indexOf(s.name) >= 0).map((s) => s.id);
}

export async function seedVersionSections(versionId: string, sectionTypeIds: string[]) {
  if (!sectionTypeIds.length) return;
  await supabase.from("version_sections").insert(
    sectionTypeIds.map((sid, i) => ({ version_id: versionId, section_type_id: sid, position: i })));
}

export async function copyVersionSections(fromVersionId: string, toVersionId: string) {
  const { data } = await supabase.from("version_sections")
    .select("section_type_id,position").eq("version_id", fromVersionId);
  const rows = (data ?? []) as VersionSection[];
  if (rows.length) await supabase.from("version_sections").insert(
    rows.map((r) => ({ version_id: toVersionId, section_type_id: r.section_type_id, position: r.position })));
}

/** Placement intelligence: per component title, its most common section
 *  across ALL real placements — with the count, per the presentation
 *  contract. Derived live; nothing stored. */
export async function loadPlacementStats(): Promise<Record<string, { sectionName: string; count: number }>> {
  const [{ data: cs }, types] = await Promise.all([
    supabase.from("event_components").select("title,section_type_id").not("section_type_id", "is", null),
    loadSectionTypes(),
  ]);
  const nameBy: Record<string, string> = {};
  for (const t of types) nameBy[t.id] = t.name;
  const counts: Record<string, Record<string, number>> = {};
  for (const c of (cs ?? []) as { title: string; section_type_id: string }[]) {
    const key = c.title.trim().toLowerCase();
    if (!key) continue;
    (counts[key] ??= {})[c.section_type_id] = (counts[key][c.section_type_id] ?? 0) + 1;
  }
  const out: Record<string, { sectionName: string; count: number }> = {};
  for (const key of Object.keys(counts)) {
    let best: string | null = null; let n = 0;
    for (const sid of Object.keys(counts[key])) {
      if (counts[key][sid] > n) { n = counts[key][sid]; best = sid; }
    }
    if (best && nameBy[best]) out[key] = { sectionName: nameBy[best], count: n };
  }
  return out;
}
