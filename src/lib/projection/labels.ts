/** v287c · LABEL PACKS (Application Shell §10 — "labels are configuration;
 *  keys are constitution").
 *
 *  Every user-facing word in an operational surface resolves here. Components
 *  never hard-code a department name, a state word, or an evidence verb, so
 *  terminology changes and future localization require no component edits.
 *
 *  R-13 is why this is safe: renaming "Pulls" to "Warehouse" is presentation
 *  and can never create, destroy or alter a responsibility.
 */
import { type DepartmentKey, type ResponsibilityState, type RiskFindingKind } from "./types";

export interface LabelPack {
  id: string;
  name: string;
  /** Department key → the word this organization uses. */
  departments: Record<DepartmentKey, string>;
  /** Evidence verbs offered on a row, per department. Presentation only —
   *  the recorded evidence kind is decided by the ceremony, not the label. */
  verbs: Record<DepartmentKey, string[]>;
  /** State words shown to users. The KEYS remain the constitutional seven. */
  states: Record<ResponsibilityState, string>;
  /** Risk finding phrasing. */
  findings: Record<string, string>;
  /** Surface titles. */
  surfaces: Record<string, string>;
}

const CONSTITUTIONAL_STATE_WORDS: Record<ResponsibilityState, string> = {
  derived: "Unassigned",
  standing: "Waiting",
  active: "Active",
  discharged: "Done",
  lapsed: "Lapsed",
  superseded: "Replaced",
  void: "Void",
};

const SHARED_FINDINGS: Record<string, string> = {
  lapsed: "Window closed unmet",
  lapse_approaching: "Closing soon",
  ownerless_nearing_window: "Nobody owns this yet",
  dependency_blocked: "Waiting on something else",
  exception_recorded: "Exception recorded",
  venue_stale: "Venue knowledge is stale",
  venue_expired: "Venue document expired",
  venue_renovation_reverification: "Venue changed — needs re-check",
};

/** v303 · ATL-1. Two closed vocabularies, shared across packs because they are
 *  LAW, not language: the keys are constitutional and only the words vary.
 *  `ready` reads as unimpeded, never as complete — completion is `settled`. */
const SHARED_PHASES: Record<string, string> = {
  preparing: "Preparing",
  released:  "In execution",
  settled:   "Settled",
  cancelled: "Cancelled",
};

const SHARED_VERDICTS: Record<string, string> = {
  ready:          "Nothing in the way",
  blocked:        "Blocked",
  not_applicable: "—",
};

const SHARED_BLOCKERS: Record<string, string> = {
  overdue:              "Window closed unmet",
  dependency_unmet:     "Waiting on other work",
  release_fact_missing: "Cannot release yet",
  owner_required:       "Needs an owner before it can proceed",
  workable:             "Ready to work",
  not_due:              "Not due yet",
  ownerless:            "Nobody owns this yet",
  fact_missing:         "Not yet recorded",
  exception_open:       "Exception recorded",
};

/** Default pack. EventCore's first domain deserves its own language. */
export const CATERING_PACK: LabelPack = {
  id: "catering",
  name: "Kosher catering",
  departments: {
    culinary: "Prep",
    equipment: "Pulls",
    logistics: "Routes",
    staffing: "Roster",
    venue: "Venue",
  },
  verbs: {
    culinary: ["Made", "Short", "Substituted"],
    equipment: ["Pulled", "Staged", "Loaded", "Short"],
    logistics: ["Departed", "Arrived", "Unloaded", "Returned"],
    staffing: ["Assigned", "Confirmed", "Checked in", "No-show"],
    venue: ["Walked", "Cleared", "Blocked"],
  },
  states: CONSTITUTIONAL_STATE_WORDS,
  findings: SHARED_FINDINGS,
  surfaces: {
    operations_today: "Today",
    event_command: "Event",
    department_queue: "Queue",
    day_sheet: "Day sheet",
    promise_lens: "Occurrences",
    work_lens: "Work",
    preparation_queue: "Preparation queue",
    ownerless: "Nobody's",
    at_risk: "At risk",
    mine: "My work",
    changed: "Changed",
  },
};

/** Domain-neutral pack — the platform's answer to "too catering-specific". */
export const GENERIC_PACK: LabelPack = {
  id: "generic",
  name: "Generic operations",
  departments: {
    culinary: "Production",
    equipment: "Warehouse",
    logistics: "Deliveries",
    staffing: "Staffing",
    venue: "Sites",
  },
  verbs: {
    culinary: ["Completed", "Short", "Substituted"],
    equipment: ["Picked", "Staged", "Loaded", "Short"],
    logistics: ["Departed", "Arrived", "Delivered", "Returned"],
    staffing: ["Assigned", "Confirmed", "Checked in", "No-show"],
    venue: ["Surveyed", "Cleared", "Blocked"],
  },
  states: CONSTITUTIONAL_STATE_WORDS,
  findings: SHARED_FINDINGS,
  surfaces: {
    operations_today: "Today",
    event_command: "Job",
    department_queue: "Queue",
    day_sheet: "Day sheet",
    promise_lens: "Jobs",
    work_lens: "Work",
    preparation_queue: "Pipeline",
    ownerless: "Unassigned",
    at_risk: "At risk",
    mine: "My work",
    changed: "Changed",
  },
};

const PACKS: Record<string, LabelPack> = {
  catering: CATERING_PACK,
  generic: GENERIC_PACK,
};

let activePack: LabelPack = CATERING_PACK;

/** Set once at application boot (or per tenant). Presentation only. */
export function setLabelPack(idOrPack: string | LabelPack): LabelPack {
  activePack = typeof idOrPack === "string" ? (PACKS[idOrPack] ?? CATERING_PACK) : idOrPack;
  return activePack;
}
export function labelPack(): LabelPack {
  return activePack;
}
export function availablePacks(): string[] {
  return Object.keys(PACKS);
}
export function registerLabelPack(pack: LabelPack): void {
  PACKS[pack.id] = pack;
}

// ── resolvers used by components ──────────────────────────────────────────

export function departmentLabel(key: string, pack: LabelPack = activePack): string {
  return pack.departments[key as DepartmentKey] ?? key;
}
export function departmentVerbs(key: string, pack: LabelPack = activePack): string[] {
  return pack.verbs[key as DepartmentKey] ?? [];
}
export function stateLabel(state: ResponsibilityState, pack: LabelPack = activePack): string {
  return pack.states[state] ?? state;
}
export function findingLabel(finding: RiskFindingKind | string, pack: LabelPack = activePack): string {
  return pack.findings[finding] ?? finding.replace(/_/g, " ");
}
export function surfaceLabel(surface: string, pack: LabelPack = activePack): string {
  return pack.surfaces[surface] ?? surface;
}

/** v303 · ATL-1. Total over the closed vocabularies, and degrading — never
 *  throwing — on an unknown key, exactly as findingLabel does. A surface that
 *  crashed on a value SQL is entitled to add would make the vocabulary
 *  un-extendable. */
export function phaseLabel(phase: string): string {
  return SHARED_PHASES[phase] ?? phase.replace(/_/g, " ");
}
export function verdictLabel(verdict: string): string {
  return SHARED_VERDICTS[verdict] ?? verdict.replace(/_/g, " ");
}
export function blockerLabel(code: string): string {
  return SHARED_BLOCKERS[code] ?? code.replace(/_/g, " ");
}

/** Grouping keys can be sentinels ("(unassigned)") or department keys; resolve
 *  them for display without the caller needing to know which. */
export function groupLabel(key: string, groupBy: string, pack: LabelPack = activePack): string {
  if (key.startsWith("(")) return key.slice(1, -1);
  if (groupBy === "department") return departmentLabel(key, pack);
  if (groupBy === "state") return stateLabel(key as ResponsibilityState, pack);
  return key;
}
