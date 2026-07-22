// Mock @/lib/supabase for the v280 venue harness. Mirrors the certified SQL
// contracts; records every rpc in window.__ceremonies as `rpc:<fn>`.
type AnyRec = Record<string, unknown>;
declare global { interface Window { __fixture: AnyRec; __ceremonies: string[] } }
function rec(s: string) { (window.__ceremonies ||= []).push(s); }

export const supabase = {
  rpc(fn: string, args: AnyRec) {
    rec(`rpc:${fn}`);
    const f = (window.__fixture || {}) as AnyRec;
    const R = (data: unknown) => Promise.resolve({ data, error: null });
    if (fn === "create_venue") return R(f.create_venue_result ?? { venue_id: "ven-new", possible_duplicates: [] });
    if (fn === "add_venue_space") return R({ space_id: "sp-new" });
    if (fn === "record_walkthrough") return R({ walkthrough_id: "wt-new" });
    if (fn === "declare_walkthrough_coverage") return R({ coverage_id: "cov-new" });
    if (fn === "record_evidence") return R({ evidence_id: "ev-new", content_hash: "abc123def4567890" });
    if (fn === "record_observation") {
      const v = args.p_value as AnyRec | null;
      if (!v || Object.keys(v).length === 0)
        return Promise.resolve({ data: null, error: { message: "OBSERVATION_VALUE_REQUIRED" } });
      return R({ observation_id: "ob-new" });
    }
    if (fn === "supersede_observation") {
      if (!args.p_reason) return Promise.resolve({ data: null, error: { message: "SUPERSESSION_REASON_REQUIRED" } });
      return R({ supersession_id: "sup-new" });
    }
    if (fn === "venue_profile") return R(f.profile ?? []);
    return R(null);
  },
  from(table: string) {
    const f = (window.__fixture || {}) as AnyRec;
    const rows =
      table === "venue" ? ((f.venues as unknown[]) || [])
      : table === "venue_space" ? ((f.spaces as unknown[]) || [])
      : table === "venue_walkthrough" ? ((f.walkthroughs as unknown[]) || [])
      : [];
    const chain = (data: unknown[]) => ({
      select: () => chain(data),
      eq: (col: string, val: unknown) => chain(data.filter((r) => (r as AnyRec)[col === "id" ? "id" : col] === val || col === "venue_id")),
      order: () => Promise.resolve({ data, error: null }),
      maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
    });
    return chain(rows);
  },
};
export async function logActivity() { /* noop */ }
