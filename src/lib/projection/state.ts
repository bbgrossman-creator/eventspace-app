/** v287c · STATE PRESENTATION — PURE helpers. No fetching, no database, no
 *  state computation.
 *
 *  CONSTITUTIONAL BOUNDARY: nothing here derives lifecycle state. Every
 *  function takes an already-projected `state` (computed by
 *  responsibility_state() in SQL) and answers only presentation questions:
 *  which glyph, which tone, in what order, in which group. If a function in
 *  this file ever needed to look at timing, ownership or evidence to decide a
 *  state, that would be the drift the projection layer exists to prevent.
 */
import {
  type ResponsibilityState, type ResponsibilityRow, type GroupBy,
  type Group, type RiskFinding, type RiskSeverity, RESPONSIBILITY_STATES,
} from "./types";

/** The state color language (Application Shell §8). One mapping, everywhere.
 *  These seven marks are reserved: nothing else in the application may use
 *  them for any other meaning. */
export interface StatePresentation {
  glyph: string;
  tone: "neutral" | "waiting" | "go" | "done" | "alarm" | "replaced" | "gone";
  className: string;
  label: string;
}

const STATE_PRESENTATION: Record<ResponsibilityState, StatePresentation> = {
  derived:    { glyph: "○", tone: "neutral",  className: "text-neutral-500 border-neutral-300", label: "Unassigned" },
  standing:   { glyph: "◐", tone: "waiting",  className: "text-amber-700 border-amber-300",     label: "Waiting" },
  active:     { glyph: "●", tone: "go",       className: "text-teal-700 border-teal-300",       label: "Active" },
  discharged: { glyph: "✓", tone: "done",     className: "text-emerald-700 border-emerald-300", label: "Done" },
  lapsed:     { glyph: "▲", tone: "alarm",    className: "text-rose-700 border-rose-300",       label: "Lapsed" },
  superseded: { glyph: "⇢", tone: "replaced", className: "text-neutral-400 border-neutral-200", label: "Replaced" },
  void:       { glyph: "∅", tone: "gone",     className: "text-neutral-400 border-neutral-200", label: "Void" },
};

export function statePresentation(state: ResponsibilityState): StatePresentation {
  return STATE_PRESENTATION[state] ?? STATE_PRESENTATION.derived;
}
export const stateGlyph = (s: ResponsibilityState) => statePresentation(s).glyph;
export const stateClass = (s: ResponsibilityState) => statePresentation(s).className;
export const stateTone  = (s: ResponsibilityState) => statePresentation(s).tone;

/** Risk severity presentation — separate from state, deliberately. */
const SEVERITY_CLASS: Record<RiskSeverity, string> = {
  critical: "text-rose-700 bg-rose-50",
  warning:  "text-amber-700 bg-amber-50",
  advisory: "text-neutral-600 bg-neutral-50",
};
export const severityClass = (s: RiskSeverity) => SEVERITY_CLASS[s] ?? SEVERITY_CLASS.advisory;

/** Display rank used only for reading order. NOT a lifecycle ordering. */
const STATE_RANK: Record<ResponsibilityState, number> = {
  lapsed: 0, active: 1, derived: 2, standing: 3, discharged: 4, superseded: 5, void: 6,
};
export const stateRank = (s: ResponsibilityState) => STATE_RANK[s] ?? 99;

/** Sort by the SQL-supplied ordering_key — a total order computed server-side.
 *  Preferred: it keeps client order identical to projection order. */
export function byOrderingKey(a: ResponsibilityRow, b: ResponsibilityRow): number {
  return a.ordering_key < b.ordering_key ? -1 : a.ordering_key > b.ordering_key ? 1 : 0;
}

/** Presentation re-sorts. These change reading order ONLY; membership is fixed
 *  by the projection's declared scope (R-13). */
export type SortMode = "projection" | "state" | "department" | "owner" | "outcome";

export function sortRows(rows: ResponsibilityRow[], mode: SortMode = "projection"): ResponsibilityRow[] {
  const copy = [...rows];
  switch (mode) {
    case "state":
      return copy.sort((a, b) => stateRank(a.state) - stateRank(b.state) || byOrderingKey(a, b));
    case "department":
      return copy.sort((a, b) => a.department.localeCompare(b.department) || byOrderingKey(a, b));
    case "owner":
      return copy.sort((a, b) =>
        (a.owner ?? "\uffff").localeCompare(b.owner ?? "\uffff") || byOrderingKey(a, b));
    case "outcome":
      return copy.sort((a, b) => a.required_outcome.localeCompare(b.required_outcome) || byOrderingKey(a, b));
    default:
      return copy.sort(byOrderingKey);
  }
}

/** Client-side grouping. Mirrors projection_group_key() exactly so a client
 *  regroup and a server regroup agree. Membership is never altered: every input
 *  row appears in exactly one group. */
export function groupKeyOf(row: ResponsibilityRow, by: GroupBy): string {
  switch (by) {
    case "department":    return row.department || "(none)";
    case "event":         return row.event_ref ?? "(standing)";
    case "state":         return row.state;
    case "owner":         return row.owner ?? "(unassigned)";
    case "resource_role": return row.resource_role ?? "(none)";
    default:              return "(all)";
  }
}

export function groupRows(rows: ResponsibilityRow[], by: GroupBy): Group[] {
  // Deliberately iterator-free: a plain record plus a key array, so this
  // compiles under the deployment build target (es5, no downlevelIteration)
  // as well as under the slice tsconfigs. Spreading a Map iterator here is
  // what broke a Next.js production build; see tsconfig.deploycheck.json.
  const buckets: Record<string, string[]> = {};
  const keys: string[] = [];
  const ordered = sortRows(rows, "projection");
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i];
    const k = groupKeyOf(r, by);
    if (!buckets[k]) { buckets[k] = []; keys.push(k); }
    buckets[k].push(r.responsibility);
  }
  return keys
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ key, members: buckets[key] }));
}

/** Index risk findings by responsibility. Event-level findings (responsibility
 *  null) are returned separately — they decorate the event, not a row. */
export function indexRisk(findings: RiskFinding[]): {
  byResponsibility: Map<string, RiskFinding[]>;
  eventLevel: RiskFinding[];
} {
  const byResponsibility = new Map<string, RiskFinding[]>();
  const eventLevel: RiskFinding[] = [];
  for (const f of findings ?? []) {
    if (f.responsibility === null || f.responsibility === undefined) { eventLevel.push(f); continue; }
    if (!byResponsibility.has(f.responsibility)) byResponsibility.set(f.responsibility, []);
    byResponsibility.get(f.responsibility)!.push(f);
  }
  return { byResponsibility, eventLevel };
}

/** Highest severity among a row's findings, for a single badge. */
export function worstSeverity(findings: RiskFinding[] | undefined): RiskSeverity | null {
  if (!findings || findings.length === 0) return null;
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "warning")) return "warning";
  return "advisory";
}

/** Formatting only. */
export function formatWindow(timing: ResponsibilityRow["timing"]): string {
  if (!timing) return "";
  const close = timing.window_end ?? timing.due;
  if (!close) return timing.window_start ? `from ${shortTime(timing.window_start)}` : "";
  return `by ${shortTime(close)}`;
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Guard used by the client: a value the seven-state vocabulary does not
 *  contain must never be rendered as a state. */
export function isResponsibilityState(v: unknown): v is ResponsibilityState {
  return typeof v === "string" && (RESPONSIBILITY_STATES as readonly string[]).includes(v);
}
