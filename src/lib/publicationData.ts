// ═══════════════════════════════════════════════════════════════════════════
// PUBLICATION DATA (v227) — the Brand rung's storage. publication.ts stays
// pure; every Supabase touch for the brand and named themes lives here.
//   Brand delta + default theme → app_settings (tenant key/value store):
//     publication.brand / publication.default_theme
//   Named themes → publication_themes (v227 SQL).
// Everything degrades to null/[] on a pre-migration database — the ladder's
// brand rung simply stays empty.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { ThemeDelta, RegionTexts } from "./publication";
import { PortablePresentation, AssetKind } from "./portable";

export interface PublicationSettings {
  brand: ThemeDelta | null;
  defaultThemeKey: string | null;
  /** v231 — the region words: company facts, Brand Studio's to edit. */
  regionTexts: RegionTexts;
}

export interface PublicationTheme {
  id: string; name: string; delta: ThemeDelta; active: boolean; position: number;
  /** v241 — themes and templates share the table; the KIND never blurs. */
  asset_kind?: AssetKind;
  description?: string | null;
  portable?: PortablePresentation | null;
}

export async function getPublicationSettings(): Promise<PublicationSettings> {
  try {
    const { data } = await supabase.from("app_settings").select("key,value")
      .in("key", ["publication.brand", "publication.default_theme",
        "publication.footer", "publication.signature", "publication.terms"]);
    const rows = (data ?? []) as { key: string; value: string | null }[];
    const val = (k: string) => rows.filter((r) => r.key === k)[0]?.value ?? null;
    const brandRaw = val("publication.brand");
    let brand: ThemeDelta | null = null;
    if (brandRaw) { try { brand = JSON.parse(brandRaw) as ThemeDelta; } catch { brand = null; } }
    return { brand, defaultThemeKey: val("publication.default_theme"),
      regionTexts: { footer: val("publication.footer"), signature: val("publication.signature"), terms: val("publication.terms") } };
  } catch { return { brand: null, defaultThemeKey: null, regionTexts: { footer: null, signature: null, terms: null } }; }
}

export async function saveBrand(delta: ThemeDelta | null): Promise<boolean> {
  const { error } = await supabase.from("app_settings")
    .upsert({ key: "publication.brand", value: delta ? JSON.stringify(delta) : null }, { onConflict: "key" });
  return !error;
}

export async function saveRegionTexts(t: RegionTexts): Promise<boolean> {
  const rows = [
    { key: "publication.footer", value: t.footer },
    { key: "publication.signature", value: t.signature },
    { key: "publication.terms", value: t.terms },
  ];
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  return !error;
}

export async function saveDefaultTheme(key: string | null): Promise<boolean> {
  const { error } = await supabase.from("app_settings")
    .upsert({ key: "publication.default_theme", value: key }, { onConflict: "key" });
  return !error;
}

export async function listPublicationThemes(): Promise<PublicationTheme[]> {
  try {
    // v241 — one table, two kinds; this shelf is THEMES only. The kind
    // filter is client-side so a pre-migration database (no asset_kind
    // column) still lists everything as themes.
    const { data } = await supabase.from("publication_themes")
      .select("*").eq("active", true).order("position");
    return ((data ?? []) as PublicationTheme[]).filter((t) => (t.asset_kind ?? "theme") === "theme");
  } catch { return []; }
}

/** v241 — the template shelf: named portable presentations. */
export async function listPublicationTemplates(): Promise<PublicationTheme[]> {
  try {
    const { data } = await supabase.from("publication_themes")
      .select("*").eq("active", true).eq("asset_kind", "template").order("position");
    return ((data ?? []) as PublicationTheme[]);
  } catch { return []; }   // pre-migration: no templates exist yet
}

/** v241 — "Save current presentation as template…": capture the portable
 *  stratum of the open version, name it. */
export async function createPublicationTemplate(
  name: string, portable: PortablePresentation, description?: string,
): Promise<PublicationTheme | null> {
  const { data, error } = await supabase.from("publication_themes")
    .insert({ name: name.trim(), delta: {}, asset_kind: "template", portable, description: description ?? null })
    .select("*").single();
  return error ? null : (data as PublicationTheme);
}

export async function createPublicationTheme(name: string, delta: ThemeDelta): Promise<PublicationTheme | null> {
  const { data, error } = await supabase.from("publication_themes")
    .insert({ name: name.trim(), delta }).select("id,name,delta,active,position").single();
  return error ? null : (data as PublicationTheme);
}

export async function retirePublicationTheme(id: string): Promise<boolean> {
  const { error } = await supabase.from("publication_themes").update({ active: false }).eq("id", id);
  return !error;
}
