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

/** Grouping keys can be sentinels ("(unassigned)") or department keys; resolve
 *  them for display without the caller needing to know which. */
export function groupLabel(key: string, groupBy: string, pack: LabelPack = activePack): string {
  if (key.startsWith("(")) return key.slice(1, -1);
  if (groupBy === "department") return departmentLabel(key, pack);
  if (groupBy === "state") return stateLabel(key as ResponsibilityState, pack);
  return key;
}
