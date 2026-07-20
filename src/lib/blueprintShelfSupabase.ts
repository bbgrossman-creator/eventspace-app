// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT SHELF — data layer (v251 · BP-1). Thin calls over
// v251_blueprints_shelf.sql; every rule lives in blueprintShelf.ts (pure)
// or in the schema itself (immutability trigger, intent CHECK, append-only
// ledger). This file decides nothing.
//
// The publish/retire/reinstate paths go through the security-definer RPCs —
// the one-writing-path discipline (INV-1 precedent). Draft creation and
// editing ride RLS, which permits updates and deletes on DRAFT rows only;
// the trigger stands behind RLS for every non-draft row regardless of path.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import {
  BlueprintIdentity, BlueprintRevision,
  PUBLISH_DECLARATION, assertDraftEditable, assertDiscardable, nextRevisionNumber,
} from "./blueprintShelf";

export async function listBlueprintIdentities(includeRetired = false): Promise<BlueprintIdentity[]> {
  let q = supabase.from("blueprint_identities").select("*").order("created_at", { ascending: false });
  if (!includeRetired) q = q.eq("status", "active");
  const { data } = await q;
  return (data ?? []) as BlueprintIdentity[];
}

export async function getBlueprintIdentity(id: string): Promise<BlueprintIdentity | null> {
  const { data } = await supabase.from("blueprint_identities").select("*").eq("id", id).maybeSingle();
  return (data as BlueprintIdentity) ?? null;
}

/** §2: the whole chain, oldest first — history is total and always readable. */
export async function listRevisions(identityId: string): Promise<BlueprintRevision[]> {
  const { data } = await supabase
    .from("blueprint_revisions").select("*")
    .eq("identity_id", identityId)
    .order("revision_number", { ascending: true });
  return (data ?? []) as BlueprintRevision[];
}

export async function createBlueprintIdentity(name: string, taxonomy: string | null = null): Promise<BlueprintIdentity | null> {
  const { data, error } = await supabase
    .from("blueprint_identities")
    .insert({ name, taxonomy })
    .select().single();
  if (error) throw error;
  return data as BlueprintIdentity;
}

/** §3: begin a draft — empty, or seeded from a revision (the published
 *  state's begin-new-draft verb). Seeding copies the authored payload;
 *  the seed reference is recorded. */
export async function beginDraft(identityId: string, seedFrom?: BlueprintRevision): Promise<BlueprintRevision | null> {
  const existing = await listRevisions(identityId);
  const { data, error } = await supabase
    .from("blueprint_revisions")
    .insert({
      identity_id: identityId,
      revision_number: nextRevisionNumber(existing),
      content: seedFrom ? seedFrom.content : {},
      seeded_from_revision_id: seedFrom?.id ?? null,
    })
    .select().single();
  if (error) throw error;
  return data as BlueprintRevision;
}

export async function saveDraftContent(revision: BlueprintRevision, content: unknown): Promise<void> {
  assertDraftEditable(revision);
  const { error } = await supabase
    .from("blueprint_revisions").update({ content }).eq("id", revision.id);
  if (error) throw error;
}

/** §14: never-published drafts discard freely; nothing else has a delete path. */
export async function discardDraft(revision: BlueprintRevision): Promise<void> {
  assertDiscardable(revision);
  const { error } = await supabase.from("blueprint_revisions").delete().eq("id", revision.id);
  if (error) throw error;
}

/** §3: THE PUBLISH ACT. The caller gates on publishRefusal() (capability +
 *  intent) and passes the affirmed declaration through; the RPC verifies the
 *  wording again at the database — the intent law is enforced twice, and the
 *  second enforcement cannot be bypassed by any client. */
export async function publishRevision(revisionId: string, declaration: string, actor?: string): Promise<void> {
  const { error } = await supabase.rpc("publish_blueprint_revision", {
    p_revision: revisionId, p_declaration: declaration, p_actor: actor ?? null,
  });
  if (error) throw error;
}

export async function retireIdentity(identityId: string, actor?: string): Promise<void> {
  const { error } = await supabase.rpc("retire_blueprint_identity", {
    p_identity: identityId, p_actor: actor ?? null,
  });
  if (error) throw error;
}

export async function reinstateIdentity(identityId: string, actor?: string): Promise<void> {
  const { error } = await supabase.rpc("reinstate_blueprint_identity", {
    p_identity: identityId, p_actor: actor ?? null,
  });
  if (error) throw error;
}

export { PUBLISH_DECLARATION };
