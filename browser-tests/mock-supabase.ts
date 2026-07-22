// Mock of @/lib/supabase for the event-ops browser harness. The REAL execution
// components + spine.ts run against this canned data layer; only the network is
// mocked (the DB authority is proven separately by the SQL proofs/races). Every
// rpc is recorded in window.__ceremonies so the runner can assert the mounted UI
// actually invokes the ceremonies.
type AnyRec = Record<string, unknown>;
declare global {
  interface Window { __fixture: AnyRec; __ceremonies: string[]; }
}
function rec(s: string) { (window.__ceremonies ||= []).push(s); }

export const supabase = {
  rpc(fn: string, args: AnyRec) {
    rec(`rpc:${fn}`);
    const f = (window.__fixture || {}) as AnyRec;
    const R = (data: unknown) => Promise.resolve({ data, error: null });
    if (fn === "component_operational_basis") return R(f.component_operational_basis ?? { pinned: false });
    if (fn === "attach_component_profile") {
      f.component_operational_basis = f.pinned_after_attach ?? f.component_operational_basis;
      return R({ profile_revision_id: "rev-1", revision_no: 3 });
    }
    if (fn === "refresh_component_profile") {
      const b = (f.component_operational_basis || {}) as AnyRec; b.revision_no = 4;
      return R({ profile_revision_id: "rev-2", revision_no: 4, orphaned_overrides: 1 });
    }
    if (fn === "override_component_requirement") {
      if (args.p_kind === "suppress" && !args.p_reason)
        return Promise.resolve({ data: null, error: { message: "OVERRIDE_REASON_REQUIRED" } });
      rec(`override:${args.p_kind}`);
      return R({ override_id: "ov-new", kind: args.p_kind });
    }
    if (fn === "event_stage_detail") return R(f.event_stage_detail ?? null);
    if (fn === "event_workspace") return R(f.event_workspace ?? null);
    if (fn === "eligible_staff") return R(f.eligible_staff ?? []);
    if (fn === "assign_staff") {
      if (args.p_staff === "DUPE") return Promise.resolve({ data: null, error: { message: "STAFFING_DUPLICATE_ASSIGNMENT" } });
      return R({ assignment_id: "new-assign", coverage: {} });
    }
    if (fn === "release_staffing_assignment") return R({ released: args.p_assignment, coverage: {} });
    if (fn === "correct_staffing_assignment") return R({ released: args.p_assignment, assignment_id: "corrected", coverage: {} });
    if (fn === "event_stage") return R((f.event_stage_detail as AnyRec)?.stage ?? null);
    if (fn === "obligation_state")
      return R(((f.obligation_state as AnyRec) || {})[String(args.p_obligation)] ?? "ready");
    if (fn === "event_readiness") return R({});
    if (fn === "release_event") return R(f.release_event ?? { event_id: "evt-new", generated_count: 6 });
    if (fn === "start_service") return R(f.start_service ?? { event_id: "evt-1", stage: "in_service" });
    if (fn === "close_event") {
      if (args.p_closeout_override === "FAIL")
        return Promise.resolve({ data: null, error: { message: "CLOSE_CLOSEOUT_UNRESOLVED: authorized override required" } });
      return R(f.close_event ?? { event_id: "evt-1", stage: "closed" });
    }
    if (fn === "available_actions") return R(f.available_actions ?? []);
    if (fn === "perform_event_action") {
      rec(`dispatch:${args.p_action_key}`);
      const canned = (f.dispatch as AnyRec) || {};
      if (canned[String(args.p_action_key)]) return R(canned[String(args.p_action_key)]);
      return R({ ok: true, action_key: args.p_action_key, outcome: "success", reason_code: "ok",
        message: "action executed", target_type: null, target_id: args.p_target_id, result: {},
        evidence_ref: null, idempotency_key: args.p_idempotency_key, workspace: f.event_workspace ?? null });
    }
    return R(null);
  },
  from(table: string) {
    const f = (window.__fixture || {}) as AnyRec;
    const rows =
      table === "library_component" ? ((f.library_component as unknown[]) || [])
      : table === "event" ? ((f.event ? [f.event] : []) as unknown[])
      : table === "obligation" ? ((f.obligations as unknown[]) || [])
      : table === "execution_evidence" ? ((f.evidence as unknown[]) || [])
      : [];
    const builder: AnyRec = {
      select() { return builder; },
      eq() { return builder; },
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
