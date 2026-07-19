// v233 — the photo library's storage (photos.ts stays pure). Pre-migration
// resilient: everything degrades to empty/false until v233_photography.sql.
import { supabase } from "./supabase";
import { PhotoRecord } from "./photos";

export async function listPhotos(): Promise<PhotoRecord[]> {
  try {
    const { data } = await supabase.from("photo_library")
      .select("id,url,label,tags").eq("active", true).order("created_at");
    return (data ?? []) as PhotoRecord[];
  } catch { return []; }
}

export async function createPhoto(url: string, label: string, tags: string[]): Promise<PhotoRecord | null> {
  const { data, error } = await supabase.from("photo_library")
    .insert({ url: url.trim(), label: label.trim(), tags }).select("id,url,label,tags").single();
  return error ? null : (data as PhotoRecord);
}

export async function retirePhoto(id: string): Promise<boolean> {
  const { error } = await supabase.from("photo_library").update({ active: false }).eq("id", id);
  return !error;
}
