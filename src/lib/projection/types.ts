/** v287c · PROJECTION TYPES — the ONE definition of a projected responsibility
 *  for the entire application.
 *
 *  React never understands Responsibility. React understands Projection.
 *  Nothing in this file (or anywhere in src/lib/projection) derives lifecycle
 *  state: `state` arrives already computed by responsibility_state() through
 *  the SQL projection layer and is carried, never recomputed.
 */

/** The constitutional seven. No other value may ever appear as a state. */
export const RESPONSIBILITY_STATES = [
  "derived", "standing", "active", "discharged", "lapsed", "superseded", "void",
] as const;
export type ResponsibilityState = (typeof RESPONSIBILITY_STATES)[number];

/** Closed department vocabulary (R-12). Keys are law; labels are configurable. */
export const DEPARTMENT_KEYS = [
  "culinary", "equipment", "staffing", "venue", "logistics",
] as const;
export type DepartmentKey = (typeof DEPARTMENT_KEYS)[number];

/** Closed grouping vocabulary, mirroring validate_projection_group_by(). */
export const GROUP_BY_KEYS = [
  "department", "event", "state", "owner", "resource_role", "none",
] as const;
export type GroupBy = (typeof GROUP_BY_KEYS)[number];

/** Risk decorations. A finding is NEVER a state (v287b RSK-*). */
export type RiskFindingKind =
  | "lapsed"
  | "lapse_approaching"
  | "ownerless_nearing_window"
  | "dependency_blocked"
  | "exception_recorded"
  | `venue_${string}`;

export type RiskSeverity = "critical" | "warning" | "advisory";

export interface RiskFinding {
  responsibility: string | null;   // null ⇒ event-level finding (e.g. staleness)
  event_ref: string | null;
  finding: RiskFindingKind;
  severity: RiskSeverity;
  detail: Record<string, unknown> | null;
}

/** One row as the projection layer renders it. Field-for-field the SQL shape. */
export interface ResponsibilityRow {
  responsibility: string;
  scope: "event" | "standing";
  event_ref: string | null;
  department: DepartmentKey | string;
  kind: string;
  required_outcome: string;
  resource_role: string | null;
  owner: string | null;
  /** Computed by responsibility_state() in SQL. Never recomputed client-side. */
  state: ResponsibilityState;
  timing: { window_start?: string; window_end?: string; due?: string } | null;
  risk: { lapse_soon: boolean; exceptions: number; unowned: boolean };
  exceptions: number;
  natural_key: string;
  ordering_key: string;
}

/** The SQL-owned envelope. The client never manufactures any of these fields. */
export interface Envelope<T> {
  projection: string;
  version: number;
  as_of: string;
  /** The filter that produced these contents — makes completeness checkable. */
  scope: ProjectionFilter;
  data: T;
  counts: ProjectionCounts;
  provenance: { truth_version: string };
}

export interface ProjectionCounts {
  total: number;
  ownerless?: number;
  at_risk?: number;
  mine?: number;
  changed?: number;
  by_state?: Partial<Record<ResponsibilityState, number>>;
}

/** Closed filter grammar (v287a). Unknown keys are refused server-side. */
export interface ProjectionFilter {
  event?: string;
  department?: DepartmentKey;
  owner?: string;
  unowned?: boolean;
  states?: ResponsibilityState[];
  scope?: "event" | "standing";
  risk?: boolean;
  window?: { from?: string; to?: string };
  text?: string;
}

export interface Group {
  key: string;
  members: string[];
}

// ── payload shapes, one per composed projection ────────────────────────────

export interface FeedData {
  responsibilities?: ResponsibilityRow[];
}

export interface OperationsTodayData {
  viewer: string | null;
  since: string | null;
  responsibilities: ResponsibilityRow[];
  bands: {
    mine: string[];
    ownerless: string[];
    at_risk: string[];
    changed: string[];
  };
  events_today: string[];
  risk: RiskFinding[];
}

export interface EventCommandData {
  event: string;
  responsibilities: ResponsibilityRow[];
  /** Columns keyed by constitutional state — nothing invented. */
  columns: Partial<Record<ResponsibilityState, string[]>>;
  risk: RiskFinding[];
}

export interface DepartmentQueueData {
  department: string;
  group_by: GroupBy;
  responsibilities: ResponsibilityRow[];
  groups: Group[];
  risk: RiskFinding[];
}

export interface DaySheetData {
  day: string;
  group_by: GroupBy;
  responsibilities: ResponsibilityRow[];
  groups: Group[];
  risk: RiskFinding[];
}

export type OperationsTodayEnvelope = Envelope<OperationsTodayData>;
export type EventCommandEnvelope = Envelope<EventCommandData>;
export type DepartmentQueueEnvelope = Envelope<DepartmentQueueData>;
export type DaySheetEnvelope = Envelope<DaySheetData>;

/** A refusal from the projection layer, normalized for the UI. */
export class ProjectionRefusal extends Error {
  readonly code: string;
  readonly raw: string;
  constructor(code: string, message: string, raw: string) {
    super(message);
    this.name = "ProjectionRefusal";
    this.code = code;
    this.raw = raw;
  }
}

/** Envelope shape versions this client understands. */
export const SUPPORTED_VERSIONS: Record<string, number> = {
  feed: 1,
  operations_today: 1,
  event_command: 1,
  department_queue: 1,
  day_sheet: 1,
};

/** Structural guard used by the client before trusting a payload as an
 *  envelope. Deliberately shape-only: it never inspects `data`, because the
 *  client must not develop opinions about projection contents. */
export function isEnvelopeLike(v: unknown): v is Envelope<unknown> {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.projection === "string" &&
    typeof o.version === "number" &&
    typeof o.as_of === "string" &&
    typeof o.scope === "object" && o.scope !== null &&
    o.data !== undefined &&
    typeof o.counts === "object" && o.counts !== null
  );
}
