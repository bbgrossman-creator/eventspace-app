// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT AUTHORING — data (v252 · BP-2). Read-only fetchers the draft
// editor needs: component-definition IDENTITIES (id + name only — never a
// revision; §6: the reference is an identity, resolution is BP-3's) and
// presentation TEMPLATES (the v241 assets; their portable attaches BY VALUE
// with provenance via attachTemplatePresentation). v251's shelf data layer
// is FROZEN and untouched; this file adds reads, no writes.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { PortablePresentation } from "./blueprintContent";

export interface DefinitionIdentity { id: string; name: string; }

export async function listDefinitionIdentities(): Promise<DefinitionIdentity[]> {
  const { data } = await supabase
    .from("component_definitions").select("id,name").order("name");
  return (data ?? []) as DefinitionIdentity[];
}

export interface PresentationTemplate { id: string; name: string; portable: PortablePresentation; }

export async function listPresentationTemplates(): Promise<PresentationTemplate[]> {
  const { data } = await supabase
    .from("publication_themes").select("id,name,asset_kind,portable,active")
    .eq("active", true);
  return ((data ?? []) as (PresentationTemplate & { asset_kind?: string; active?: boolean })[])
    .filter((t) => (t.asset_kind ?? "theme") === "template" && t.portable)
    .map(({ id, name, portable }) => ({ id, name, portable }));
}
