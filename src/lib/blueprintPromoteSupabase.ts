// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT PROMOTION — data (v255 · BP-5). Reads for the ceremony (section
// role names; active identities as targets) and ONE write: the promotion
// RPC, which produces a DRAFT and can produce nothing else (server-proven).
// This file never touches design tables, never publishes, never imports the
// legacy v182 module.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

export async function loadSectionRoleNames(): Promise<Record<string, string>> {
  const { data } = await supabase.from("section_types").select("id,name");
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { id: string; name: string }[]) out[r.id] = r.name;
  return out;
}

export interface PromotionTarget { id: string; name: string; hasDraft: boolean; }

export async function loadPromotionTargets(): Promise<PromotionTarget[]> {
  const [idents, drafts] = await Promise.all([
    supabase.from("blueprint_identities").select("id,name,status").eq("status", "active").order("name"),
    supabase.from("blueprint_revisions").select("identity_id").eq("state", "draft"),
  ]);
  const busy = new Set(((drafts.data ?? []) as { identity_id: string }[]).map((d) => d.identity_id));
  return ((idents.data ?? []) as { id: string; name: string }[])
    .map((i) => ({ id: i.id, name: i.name, hasDraft: busy.has(i.id) }));
}

export interface PromotionOutcome { identity_id: string; revision_id: string; revision_number: number; }

export async function promoteDesignToDraft(args: {
  versionId: string;
  content: unknown;
  identityId?: string | null;
  name?: string | null;
  taxonomy?: string | null;
  /** Historical provenance detail: selected regions, transformations,
   *  omissions — recorded on the act, consumed by nothing. */
  detail?: unknown;
}): Promise<PromotionOutcome> {
  const { data, error } = await supabase.rpc("promote_design_to_draft", {
    p_version: args.versionId,
    p_content: args.content,
    p_identity: args.identityId ?? null,
    p_name: args.name ?? null,
    p_taxonomy: args.taxonomy ?? null,
    p_actor: null,
    p_detail: args.detail ?? {},
  });
  if (error) throw error;
  return data as PromotionOutcome;
}
