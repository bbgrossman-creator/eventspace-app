// Mock of @/lib/supabase for the v312 Event Workspace harness.
//
// DEDICATED, NOT SHARED. The v311 suites bind mock-supabase.ts and that file is
// in v311's frozen browser_regress list; giving v312 its own data layer means no
// existing regression asset is modified to make a new suite pass.
//
// Only the network is mocked. The REAL EventWorkspaceShell, the REAL adapter in
// @/lib/events/productEvent and the REAL projection client run against it, so
// the envelope contract and the addressing law are genuinely exercised. Every
// call is recorded in window.__calls so the runner can assert which Function's
// execution record the operational surface actually read.
type AnyRec = Record<string, unknown>;
declare global {
  interface Window { __fixture: AnyRec; __calls: string[] }
}
function rec(s: string) { (window.__calls ||= []).push(s); }

const R = (data: unknown) => Promise.resolve({ data, error: null });

export const supabase = {
  rpc(fn: string, args: AnyRec) {
    rec(`rpc:${fn}${fn === "event_workspace" ? `:${String(args.p_event)}` : ""}`);
    const f = (window.__fixture || {}) as AnyRec;

    // The Function list and its lineage — the v312 read of record.
    if (fn === "engagement_occurrences") return R(f.engagement_occurrences ?? []);

    // Function facts, as a lawful envelope the real client will validate.
    if (fn === "projection_occurrence_brief") {
      const briefs = (f.briefs || {}) as AnyRec;
      const data = briefs[String(args.p_occurrence)];
      if (!data) return R(null);
      return R({
        projection: "occurrence_brief", version: 1,
        as_of: "2026-09-11T00:00:00Z",
        scope: { occurrence: String(args.p_occurrence) },
        data,
        counts: { total: 0, outstanding: 0, ownerless: 0, at_risk: 0, exceptions: 0, overlaps: 0, by_state: {} },
        provenance: { truth_version: "fixture" },
      });
    }

    // One Function's operational record, keyed by its own public.event id.
    if (fn === "event_workspace") {
      const ws = (f.workspaces || {}) as AnyRec;
      return R(ws[String(args.p_event)] ?? null);
    }

    // Children of the operational surface: present so the mount is realistic,
    // empty so this suite asserts nothing about them.
    if (fn === "kitchen_event_panel") return R(null);
    if (fn === "eligible_staff") return R([]);
    return R(null);
  },

  from(table: string) {
    rec(`from:${table}`);
    const f = (window.__fixture || {}) as AnyRec;
    const rows =
      table === "bookings" ? ((f.bookings ? [f.bookings] : []) as unknown[])
      : table === "occurrence_profile" ? ((f.occurrence_profile as unknown[]) || [])
      : [];
    const builder: AnyRec = {
      select() { return builder; },
      eq() { return builder; },
      in() { return builder; },
      order() { return builder; },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then(resolve: (v: { data: unknown; error: null }) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return builder;
  },
};

export async function logActivity() { /* noop in harness */ }
