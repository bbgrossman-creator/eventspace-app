// Production adapter + loaders for the Definition view.
import { supabase } from "./supabase";
import { AuthorAdapter, RevisionDoc } from "./curation";

export const supabaseAuthorAdapter: AuthorAdapter = async (a) => {
  const { data, error } = await supabase.rpc("author_definition_revision", {
    p_definition: a.definitionId,
    p_expected_live_revision: a.expectedLiveRevision,
    p_data: a.data,
    p_schema_version: a.schemaVersion,
    p_origin: a.origin,
    p_note: a.note,
    p_citations: a.citations && a.citations.length ? a.citations : null,
    p_layers: a.layers && a.layers.length ? a.layers : null,
    p_session_key: a.sessionKey ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { act_id: string; revision_id: string };
  return { ok: true, actId: r.act_id, revisionId: r.revision_id };
};

export interface LedgerEntry {
  actId: string | null;              // null = pre-ledger (bootstrap)
  origin: string | null;
  note: string | null;
  actor: string | null;
  createdAt: string;
  revisionId: string;
  live: boolean;
}

export async function loadDefinition(definitionId: string): Promise<{
  name: string;
  liveRevisionId: string | null;
  liveDoc: RevisionDoc | null;
  schemaVersion: number;
  ledger: LedgerEntry[];
}> {
  const [def, revs, acts] = await Promise.all([
    supabase.from("component_definitions").select("name").eq("id", definitionId).maybeSingle(),
    supabase.from("component_definition_config")
      .select("id,data,schema_version,created_at,superseded_by,archived_at")
      .eq("definition_id", definitionId).order("created_at", { ascending: false }),
    supabase.from("definition_revision_acts")
      .select("id,origin,note,actor,created_at,act_produced_artifacts(revision_id)")
      .eq("definition_id", definitionId),
  ]);
  type RevRow = { id: string; data: RevisionDoc; schema_version: number; created_at: string;
    superseded_by: string | null; archived_at: string | null };
  type ActRow = { id: string; origin: string; note: string; actor: string | null; created_at: string;
    act_produced_artifacts: { revision_id: string }[] };
  const revRows = (revs.data ?? []) as RevRow[];
  const actByRev = new Map<string, ActRow>();
  for (const a of (acts.data ?? []) as ActRow[])
    for (const art of a.act_produced_artifacts) actByRev.set(art.revision_id, a);
  const live = revRows.find((r) => r.superseded_by === null && r.archived_at === null) ?? null;
  return {
    name: def.data?.name ?? "(definition)",
    liveRevisionId: live?.id ?? null,
    liveDoc: live?.data ?? null,
    schemaVersion: live?.schema_version ?? 1,
    ledger: revRows.map((r) => {
      const a = actByRev.get(r.id);
      return { actId: a?.id ?? null, origin: a?.origin ?? null, note: a?.note ?? null,
        actor: a?.actor ?? null, createdAt: r.created_at, revisionId: r.id, live: r.id === live?.id };
    }),
  };
}
