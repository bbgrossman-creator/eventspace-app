// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT START — data (v261 · Blueprint-to-Proposal Workflow). ONE read:
// the published shelf as proposal-creation sources — active identities
// offering a published revision, with that exact revision's content (for
// the declared questions and the deterministic review). No writes here;
// the act is BP-3's existing instantiate_blueprint, called through the
// existing v253 wrapper. The legacy v182 pointer model is not a source.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { BlueprintContent } from "./blueprintContent";

export interface PublishedBlueprintSource {
  identityId: string;
  identityName: string;
  taxonomy: string | null;
  revisionId: string;
  revisionNumber: number;
  content: BlueprintContent;
}

export async function listPublishedBlueprints(): Promise<PublishedBlueprintSource[]> {
  const { data: idents } = await supabase
    .from("blueprint_identities")
    .select("id,name,taxonomy,published_revision_id")
    .eq("status", "active")
    .not("published_revision_id", "is", null)
    .order("name");
  const rows = (idents ?? []) as { id: string; name: string; taxonomy: string | null; published_revision_id: string }[];
  if (rows.length === 0) return [];
  const { data: revs } = await supabase
    .from("blueprint_revisions")
    .select("id,revision_number,content")
    .in("id", rows.map((r) => r.published_revision_id));
  const byId = new Map(((revs ?? []) as { id: string; revision_number: number; content: BlueprintContent }[])
    .map((r) => [r.id, r]));
  return rows.flatMap((r) => {
    const rev = byId.get(r.published_revision_id);
    return rev ? [{
      identityId: r.id, identityName: r.name, taxonomy: r.taxonomy,
      revisionId: rev.id, revisionNumber: rev.revision_number, content: rev.content,
    }] : [];
  });
}
