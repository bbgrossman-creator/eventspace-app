// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION OS · DAILYOPS (event scope, v275)
//
// The orchestration projection over one released event: obligations + their
// authoritative SQL-derived state + dependencies + owners + next action, grouped
// by department. DailyOps stores nothing and is never a second source of truth
// (I-38). Completing an action calls recordEvidence (a domain write path), then
// the view re-derives. Missing knowledge surfaces as explicit decision-debt, not
// a blank (the honesty rule).
// ═══════════════════════════════════════════════════════════════════════════
import {
  loadObligations, loadEvidence, getObligationState, isDecisionDebt,
  type ObligationRow, type ObligationState, type Department, type EvidenceRow,
} from "./spine";

export interface DailyOpsItem {
  id: string;
  kind: string;
  department: Department;
  outcome: string;
  state: ObligationState | null;
  decisionDebt: boolean;
  origin: string;              // provenance summary ("why this exists")
  dependsOn: string[];         // predecessor natural_keys
  blockedBy: string[];         // unmet predecessor outcomes (named, not blank)
  owner: string | null;        // resource_role (assignee slot)
  nextAction: string;          // the imperative next step given the state
}

export interface DailyOpsEventView {
  eventId: string;
  byDepartment: { department: Department; items: DailyOpsItem[] }[];
  counts: Record<ObligationState, number>;
  total: number;
}

const NEXT: Record<ObligationState, string> = {
  blocked: "Resolve its blockers first",
  ready: "Assign an owner to begin",
  active: "Record completion when done",
  complete: "Done",
  exception: "Review the exception",
  invalidated: "No longer required",
};

/** Assemble the event-scope DailyOps view. Pure over the DB reads; the state per
 *  obligation comes from the authoritative SQL projection, never recomputed here. */
export async function assembleEventDailyOps(eventId: string): Promise<DailyOpsEventView> {
  const obligations = await loadObligations(eventId);
  const evidence = await loadEvidence(eventId);

  // resolve each obligation's state via the SQL derivation (one derivation)
  const states = new Map<string, ObligationState | null>();
  await Promise.all(obligations.map(async (o) => states.set(o.id, await getObligationState(o.id))));

  // natural_key → outcome, for naming blockers rather than showing blanks
  const outcomeByNk = new Map(obligations.map((o) => [o.natural_key, o.required_outcome]));
  const completeNks = new Set(
    obligations.filter((o) => states.get(o.id) === "complete").map((o) => o.natural_key),
  );

  const items: DailyOpsItem[] = obligations
    .filter((o) => states.get(o.id) !== "invalidated")
    .map((o) => {
      const state = states.get(o.id) ?? null;
      const blockedBy = (o.dependencies ?? [])
        .filter((nk) => !completeNks.has(nk))
        .map((nk) => outcomeByNk.get(nk) ?? "an upstream step");
      return {
        id: o.id, kind: o.kind, department: o.department, outcome: o.required_outcome,
        state, decisionDebt: isDecisionDebt(o),
        origin: originSummary(o),
        dependsOn: o.dependencies ?? [],
        blockedBy: state === "blocked" ? blockedBy : [],
        owner: ownerFromEvidence(o.id, evidence),
        nextAction: o.required_outcome.startsWith("unresolved:")
          ? "Supply the missing knowledge to resolve"
          : (state ? NEXT[state] : "—"),
      };
    });

  const departments: Department[] = ["culinary", "equipment", "staffing", "venue", "logistics"];
  const byDepartment = departments
    .map((d) => ({ department: d, items: items.filter((i) => i.department === d) }))
    .filter((g) => g.items.length > 0);

  const counts = { blocked: 0, ready: 0, active: 0, complete: 0, exception: 0, invalidated: 0 } as Record<ObligationState, number>;
  for (const i of items) if (i.state) counts[i.state]++;

  return { eventId, byDepartment, counts, total: items.length };
}

function originSummary(o: ObligationRow): string {
  const what = o.resource_role && o.resource_role !== "unresolved" ? o.resource_role : o.kind;
  return `from the approved ${what} (${o.origin_kind})`;
}

function ownerFromEvidence(obligationId: string, evidence: EvidenceRow[]): string | null {
  const assign = evidence
    .filter((e) => e.obligation_ref === obligationId && e.kind === "assignment")
    .sort((a, b) => b.moment.localeCompare(a.moment))[0];
  return assign ? ((assign.payload["owner"] as string) ?? assign.actor) : null;
}
