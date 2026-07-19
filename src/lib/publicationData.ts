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
import { ThemeDelta } from "./publication";

export interface PublicationSettings {
  brand: ThemeDelta | null;
  defaultThemeKey: string | null;
}

export interface PublicationTheme {
  id: string; name: string; delta: ThemeDelta; active: boolean; position: number;
}

export async function getPublicationSettings(): Promise<PublicationSettings> {
  try {
    const { data } = await supabase.from("app_settings").select("key,value")
      .in("key", ["publication.brand", "publication.default_theme"]);
    const rows = (data ?? []) as { key: string; value: string | null }[];
    const brandRaw = rows.filter((r) => r.key === "publication.brand")[0]?.value ?? null;
    let brand: ThemeDelta | null = null;
    if (brandRaw) { try { brand = JSON.parse(brandRaw) as ThemeDelta; } catch { brand = null; } }
    return { brand, defaultThemeKey: rows.filter((r) => r.key === "publication.default_theme")[0]?.value ?? null };
  } catch { return { brand: null, defaultThemeKey: null }; }
}

export async function saveBrand(delta: ThemeDelta | null): Promise<boolean> {
  const { error } = await supabase.from("app_settings")
    .upsert({ key: "publication.brand", value: delta ? JSON.stringify(delta) : null }, { onConflict: "key" });
  return !error;
}

export async function saveDefaultTheme(key: string | null): Promise<boolean> {
  const { error } = await supabase.from("app_settings")
    .upsert({ key: "publication.default_theme", value: key }, { onConflict: "key" });
  return !error;
}

export async function listPublicationThemes(): Promise<PublicationTheme[]> {
  try {
    const { data } = await supabase.from("publication_themes")
      .select("id,name,delta,active,position").eq("active", true).order("position");
    return ((data ?? []) as PublicationTheme[]);
  } catch { return []; }
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
