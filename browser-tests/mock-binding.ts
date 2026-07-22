// Mock @/lib/supabase for the v281 binding harness — mirrors certified SQL.
type AnyRec = Record<string, unknown>;
declare global { interface Window { __fixture: AnyRec; __ceremonies: string[] } }
function rec(s: string) { (window.__ceremonies ||= []).push(s); }

export const supabase = {
  rpc(fn: string, args: AnyRec) {
    rec(`rpc:${fn}`);
    const f = (window.__fixture || {}) as AnyRec;
    if (fn === "current_venue_binding") return Promise.resolve({ data: f.binding ?? null, error: null });
    if (fn === "engagement_venue_knowledge") return Promise.resolve({ data: f.knowledge ?? { bound: false, verification: "none", findings: [] }, error: null });
    if (fn === "venue_duplicate_candidates") return Promise.resolve({ data: f.suggestions ?? [], error: null });
    if (fn === "bind_engagement_venue") {
      const hasCurrent = !!f.binding;
      if (hasCurrent && !args.p_reason)
        return Promise.resolve({ data: null, error: { message: "BINDING_REASON_REQUIRED" } });
      rec(`bound:${args.p_venue}${args.p_reason ? `:${args.p_reason}` : ""}`);
      return Promise.resolve({ data: { binding_id: "bind-new" }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  },
  from(_table: string) {
    const f = (window.__fixture || {}) as AnyRec;
    const rows = (f.venues as AnyRec[]) || [];
    const chain = (data: AnyRec[]) => ({
      select: () => chain(data),
      is: (col: string, val: unknown) => chain(data.filter((r) => r[col] === val)),
      order: () => Promise.resolve({ data, error: null }),
    });
    return chain(rows);
  },
};
export async function logActivity() { /* noop */ }
