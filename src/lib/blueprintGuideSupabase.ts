// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT GUIDE — data (v259 · Editor Foundation). Two READS, no writes:
//  · loadPromotionAct — the exact BP-5 promotion act for THIS draft revision
//    (act='promote' AND revision_id = the draft). This is the ONLY test for
//    event-review content; seeded/composed drafts have no such act and never
//    wear event-learning language.
//  · loadDraftById — deep-link resolution by exact revision id. RLS scopes
//    the read to the caller's tenant, so a foreign draft simply isn't found;
//    the page shows a NAMED failure, never a silent fallback.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { PromotionActDetail } from "./blueprintGuide";
import { BlueprintIdentity, BlueprintRevision } from "./blueprintShelf";

export interface PromotionAct { detail: PromotionActDetail | null; created_at: string; }

export async function loadPromotionAct(revisionId: string): Promise<PromotionAct | null> {
  const { data } = await supabase
    .from("blueprint_shelf_acts")
    .select("detail,created_at")
    .eq("revision_id", revisionId)
    .eq("act", "promote")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { detail: PromotionActDetail | null; created_at: string } | undefined;
  return row ? { detail: row.detail, created_at: row.created_at } : null;
}

export type DeepLinkResult =
  | { ok: true; identity: BlueprintIdentity; revision: BlueprintRevision }
  | { ok: false; named: "NOT_FOUND" | "NOT_A_DRAFT" };

export async function loadDraftById(revisionId: string): Promise<DeepLinkResult> {
  const { data: rev } = await supabase
    .from("blueprint_revisions")
    .select("*")
    .eq("id", revisionId)
    .maybeSingle();
  if (!rev) return { ok: false, named: "NOT_FOUND" };           // absent OR foreign tenant (RLS)
  if ((rev as BlueprintRevision).state !== "draft") return { ok: false, named: "NOT_A_DRAFT" };
  const { data: ident } = await supabase
    .from("blueprint_identities")
    .select("*")
    .eq("id", (rev as BlueprintRevision).identity_id)
    .maybeSingle();
  if (!ident) return { ok: false, named: "NOT_FOUND" };
  return { ok: true, identity: ident as BlueprintIdentity, revision: rev as BlueprintRevision };
}
