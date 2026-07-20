// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT USAGE — data (v256 amendment · BP-6 spec §revision-display).
// Per-revision usage FACTS from the immutable citation record and nothing
// else: exact-revision count, most recent instantiation. Read-only;
// descriptive labels; never a rank, never derived from content scans.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

export interface RevisionUsage { count: number; mostRecent: string | null; }

export async function loadRevisionUsage(revisionId: string): Promise<RevisionUsage> {
  const { data } = await supabase
    .from("blueprint_instantiations")
    .select("snapshot_at")
    .eq("revision_id", revisionId)
    .order("snapshot_at", { ascending: false });
  const rows = (data ?? []) as { snapshot_at: string }[];
  return { count: rows.length, mostRecent: rows[0]?.snapshot_at ?? null };
}

/** The descriptive label — "used to start 12 Designs", never a superlative. */
export function usageLine(u: RevisionUsage): string {
  if (u.count === 0) return "not yet used to start a Design";
  const n = u.count === 1 ? "used to start 1 Design" : `used to start ${u.count} Designs`;
  return u.mostRecent ? `${n} · most recently ${new Date(u.mostRecent).toLocaleDateString()}` : n;
}
