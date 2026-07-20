// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT COMPOSITION — data (v258 · BP-8). Reads the EXACT source
// revision's content and the destination draft's content for the pure
// composer; ONE write: compose_into_draft, which locks both, writes the
// candidate, and appends provenance last (server-proven). No source foreign
// key ever enters content. The legacy v182 module is never touched.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { BlueprintContent } from "./blueprintContent";

export interface CompositionSource {
  identityId: string; identityName: string;
  revisionId: string; revisionNumber: number; content: BlueprintContent;
}

/** Published revisions of OTHER identities are the reusable sources
 *  (constitutional revisions only — never the legacy v182 pointer table). */
export async function listCompositionSources(excludeIdentityId: string): Promise<CompositionSource[]> {
  const { data: idents } = await supabase
    .from("blueprint_identities")
    .select("id,name,published_revision_id")
    .eq("status", "active")
    .not("published_revision_id", "is", null)
    .neq("id", excludeIdentityId)
    .order("name");
  const rows = (idents ?? []) as { id: string; name: string; published_revision_id: string }[];
  if (rows.length === 0) return [];
  const { data: revs } = await supabase
    .from("blueprint_revisions")
    .select("id,revision_number,content")
    .in("id", rows.map((r) => r.published_revision_id));
  const byId = new Map(((revs ?? []) as { id: string; revision_number: number; content: BlueprintContent }[])
    .map((r) => [r.id, r]));
  return rows.flatMap((r) => {
    const rev = byId.get(r.published_revision_id);
    return rev ? [{ identityId: r.id, identityName: r.name, revisionId: rev.id,
      revisionNumber: rev.revision_number, content: rev.content }] : [];
  });
}

export async function loadRevisionContent(revisionId: string): Promise<BlueprintContent> {
  const { data, error } = await supabase
    .from("blueprint_revisions").select("content").eq("id", revisionId).single();
  if (error) throw error;
  return data!.content as BlueprintContent;
}

/** Which component definitions the destination tenant actually has — the
 *  composer refuses rather than embedding source knowledge or guessing. */
export async function loadAvailableDefinitionIds(): Promise<Set<string>> {
  const { data } = await supabase.from("component_definitions").select("id");
  return new Set(((data ?? []) as { id: string }[]).map((d) => d.id));
}

export interface CompositionOutcome { composition_id: string; source_fingerprint: string; dest_revision_id: string; }

export async function composeIntoDraft(args: {
  sourceRevisionId: string;
  destRevisionId: string;
  content: unknown;
  selected?: unknown;
  collisions?: unknown;
  omissions?: unknown;
  transformations?: unknown;
}): Promise<CompositionOutcome> {
  const { data, error } = await supabase.rpc("compose_into_draft", {
    p_source_revision: args.sourceRevisionId,
    p_dest_revision: args.destRevisionId,
    p_content: args.content,
    p_actor: null,
    p_selected: args.selected ?? {},
    p_collisions: args.collisions ?? {},
    p_omissions: args.omissions ?? [],
    p_transforms: args.transformations ?? [],
  });
  if (error) throw error;
  return data as CompositionOutcome;
}
