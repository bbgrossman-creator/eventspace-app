// Mock @/lib/supabase for the v283 harness — mirrors certified SQL contracts.
type AnyRec = Record<string, unknown>;
declare global { interface Window { __fixture: AnyRec; __ceremonies: string[] } }
function rec(s: string) { (window.__ceremonies ||= []).push(s); }

export const supabase = {
  rpc(fn: string, args: AnyRec) {
    rec(`rpc:${fn}`);
    const f = (window.__fixture || {}) as AnyRec;
    if (fn === "create_library_component") return Promise.resolve({ data: f.create_result, error: null });
    if (fn === "library_profile") return Promise.resolve({ data: f.profile, error: null });
    if (fn === "author_profile_revision") {
      const reqs = args.p_requirements as unknown[];
      if (!Array.isArray(reqs) || reqs.length === 0)
        return Promise.resolve({ data: null, error: { message: "REVISION_REQUIREMENTS_REQUIRED" } });
      rec(`authored:n${reqs.length}`);
      return Promise.resolve({ data: { revision_id: "rev-3", revision_no: 3, requirement_count: reqs.length }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  },
  from(table: string) {
    const f = (window.__fixture || {}) as AnyRec;
    const rows = table === "library_component" ? ((f.components as unknown[]) || [])
      : table === "component_profile_revision" ? ((f.revisions as unknown[]) || []) : [];
    const chain = (data: unknown[]) => ({
      select: () => chain(data),
      eq: () => chain(data),
      order: () => Promise.resolve({ data, error: null }),
    });
    return chain(rows);
  },
};
export async function logActivity() { /* noop */ }
