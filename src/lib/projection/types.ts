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

/** v303 · ATL-1 · LIFECYCLE — where an occurrence is in its arc.
 *  Kept strictly separate from the readiness verdict below: an occurrence in
 *  execution was once ready, and a model that makes those mutually exclusive
 *  (as the legacy event_stage does) cannot say so. Completion is `settled`. */
export const LIFECYCLE_PHASES = [
  "preparing", "released", "settled", "cancelled",
] as const;
export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number];

/** v303 · the readiness verdict. `ready` means UNIMPEDED — never complete.
 *  `not_applicable` is emitted only where no gate is open (settled, cancelled),
 *  and is therefore occurrence-grain only: a department that has no work does
 *  not appear at all rather than appearing as not_applicable. */
export const READINESS_VERDICTS = ["ready", "blocked", "not_applicable"] as const;
export type ReadinessVerdict = (typeof READINESS_VERDICTS)[number];

/** v303 · the CLOSED blocker/reason taxonomy. Only `impedes` moves a verdict;
 *  everything else is grounds. `owner_required` and `risk_noted` are RESERVED
 *  and not emitted — no ceremony requires ownership, and risk rides in
 *  data.risk beside the verdict. */
export const BLOCKER_CODES = [
  "overdue", "dependency_unmet", "release_fact_missing", "owner_required",
  "workable", "not_due", "ownerless", "fact_missing", "exception_open",
] as const;
export type BlockerCode = (typeof BLOCKER_CODES)[number];

/** One ground beneath a verdict. Carries everything needed to identify and act
 *  on the work without a second query — the property that lets a future
 *  next-action model be a pure selection over this payload. */
export interface ReadinessGround {
  code: BlockerCode;
  grain: "responsibility" | "occurrence";
  subject: string;
  impedes: boolean;
  notes?: string[];
  department?: DepartmentKey;
  required_outcome?: string;
  owner?: string | null;
  ordering_key?: string;
  timing?: Record<string, unknown>;
  fact?: string;
  detail?: Record<string, unknown>;
}

export interface DepartmentReadiness {
  grain: "department";
  subject: DepartmentKey;
  verdict: Exclude<ReadinessVerdict, "not_applicable">;
  outstanding: number;
  blockers: ReadinessGround[];
}

/** The canonical readiness verdict, composed bottom-up in SQL. The verdict NAMES
 *  ITS GATE, and exactly one gate is open per phase: `release` while preparing,
 *  `execution` once released, none when settled or cancelled. */
export interface ReadinessState {
  grain: "occurrence";
  subject: string;
  phase: LifecyclePhase;
  gate: "release" | "execution" | null;
  verdict: ReadinessVerdict;
  blocker_count: number;
  blockers: ReadinessGround[];
  reasons: ReadinessGround[];
  by_department: DepartmentReadiness[];
}

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
export interface Envelope<T, TScope = ProjectionFilter> {
  projection: string;
  version: number;
  as_of: string;
  /** What produced these contents — a filter for feed-shaped projections, a
   *  resolution record for day-scoped ones. Either way it makes completeness
   *  checkable, and either way SQL owns it. */
  scope: TScope;
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

/** v291 · responsibility_detail() returns a BARE OBJECT, not an envelope: it
 *  carries no counts, no scope and no as_of, because it describes one
 *  responsibility rather than a projected set. It is shaped field-for-field by
 *  responsibility_detail() (v287a) and is NOT extended here.
 *
 *  Note what is absent: there is no `risk` key and no assignment-evidence flag.
 *  Risk is fetched separately and scoped honestly (see feed.ts); assignment
 *  presence is not exposed by any projection and is therefore never claimed. */
export interface OwnershipEntry {
  action: string;
  owner: string | null;
  prior_owner: string | null;
  actor: string | null;
  moment: string;
}

export interface EvidenceEntry {
  kind: string;
  actor: string | null;
  moment: string;
  payload: Record<string, unknown> | null;
}

export interface ResponsibilityAnchors {
  origin_kind: string | null;
  origin_ref: string | null;
  origin_revision: string | null;
  declared: Record<string, unknown> | null;
}

export interface ResponsibilityDetail {
  /** The same projected row a list surface shows — one state, one owner. */
  row: ResponsibilityRow | null;
  anchors: ResponsibilityAnchors;
  /** The ownership ledger, ordered by seq. This IS the ownership history:
   *  ownership_history() returns these same rows from the same table with the
   *  same filter, so calling it as well would be a second request for data
   *  already in hand. */
  ownership: OwnershipEntry[];
  evidence: EvidenceEntry[];
  dependencies: string[];
  supersedes: string | null;
  superseded_by: string | null;
}

/** v292b · occurrence_brief. The single authoritative read model for
 *  pre-execution operations. Shaped field-for-field by
 *  projection_occurrence_brief(); nothing is added or renamed here.
 *
 *  Two properties the client must respect rather than reinterpret:
 *   · `has_event` states the regime. Work-side arrays are empty before release
 *     and that is NOT the same as "nothing is owed" — never infer readiness
 *     from an empty array without checking has_event.
 *   · `venue.source` / `supervision.source` say whether the fact is the
 *     occurrence's own or inherited from the engagement. A surface that drops
 *     source presents an inherited fact as a specific one. */
export interface BriefIdentity {
  occurrence: string; engagement: string; ordinal: number;
  open_basis: "declared" | "release_implied"; active: boolean;
  display_name: string | null; occasion_kind: string | null;
  engagement_name: string | null;
  client: string | null;
  client_source: "engagement_profile" | "booking_contact";
}
export interface BriefVenue {
  source: "occurrence" | "engagement";
  venue: string; name: string; address: string | null;
}
export interface BriefAttendanceEntry {
  head_count: number; basis: AttendanceBasis; effective_moment: string;
}
export type AttendanceBasis = "estimated" | "contracted" | "guaranteed" | "final";
export interface BriefAttendance {
  current: BriefAttendanceEntry | null;
  contracted: number | null;
  delta: number | null;
  /** Future-effective commitments. NEVER render as the operative count. */
  scheduled: BriefAttendanceEntry[];
}
export interface BriefMilestone {
  key: string; label: string; at: string; window_end: string | null;
}
export interface BriefSchedule {
  operating_date: string | null;   // a DATE, not a moment
  milestones: BriefMilestone[];
}
export interface BriefSupervision {
  source: "occurrence" | "engagement";
  authority_org: string; window_start: string | null; window_end: string | null;
  certificate_ref: string | null; contact: string | null;
}
/** Temporal overlap ONLY. Two windows coincide in time; this asserts nothing
 *  about a shared resource. Never label this "conflict" or "contention". */
export interface BriefOverlap {
  kind: "temporal";
  a: string; a_key: string; b: string; b_key: string;
  overlap_start: string; overlap_end: string;
}
export interface BriefReadiness {
  department: DepartmentKey;
  total: number; settled: number; outstanding: number;
  ownerless: number; blocked: number;
}
export interface BriefCompleteness {
  display_name: boolean; client: boolean; venue: boolean;
  operating_date: boolean; attendance: boolean; contracted: boolean;
  supervision: boolean; milestones: boolean;
  missing: string[];
}
export interface OccurrenceBriefData {
  identity: BriefIdentity;
  venue: BriefVenue | null;
  attendance: BriefAttendance;
  schedule: BriefSchedule;
  supervision: BriefSupervision | null;
  overlaps: BriefOverlap[];
  has_event: boolean;
  event: string | null;
  readiness: BriefReadiness[];
  /** v303 · ATL-1. The VERDICT beside the counts above. `readiness` reports how
   *  much; this reports whether anything stands in the way, and carries the
   *  grounds it was computed from. Authored entirely in SQL — the client
   *  renders it and derives nothing. */
  readiness_state: ReadinessState;
  /** v300 · EX-02. The complete finding set for the event, all eight kinds.
   *  counts.at_risk is count(distinct responsibility) over THIS collection
   *  where responsibility is not null — so the aggregate decomposes here.
   *  Event-level findings (venue_*) carry responsibility: null; indexRisk()
   *  routes them to eventLevel. */
  risk: RiskFinding[];
  /** The `exception_recorded` subset of `risk`. Kept because counts.exceptions
   *  decomposes to it exactly; never a second source. */
  exceptions: RiskFinding[];
  ownerless: Array<{ responsibility: string; department: DepartmentKey;
                     required_outcome: string; state: ResponsibilityState }>;
  completeness: BriefCompleteness;
}
export interface OccurrenceBriefCounts {
  total: number; outstanding: number; ownerless: number; at_risk: number;
  exceptions: number; overlaps: number;
  by_state: Partial<Record<ResponsibilityState, number>>;
  missing_promise_facts: number;
  /** v303 · decomposes exactly to the impeding grounds in readiness_state,
   *  across both the occurrence and department grains. */
  readiness_blockers: number;
}
export type OccurrenceBriefEnvelope =
  Envelope<OccurrenceBriefData> & { counts: OccurrenceBriefCounts };

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
  occurrences_for_operational_day: 1,
  preparation_queue: 1,
  // v300 · CT-04. The brief IS an envelope — v292b emits
  // projection_envelope('occurrence_brief', 1, …) and OB-1 certifies it — but it
  // was read through fetchObject, which asserts nothing, so shape, name and
  // version all went unchecked on the direct path. Registering the key is half
  // the correction; occurrenceBrief() now performs the assertion (feed.ts).
  occurrence_brief: 1,
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

/** v292e · The Promise lens. Shaped field-for-field by
 *  projection_occurrences_for_operational_day(); nothing is added or renamed.
 *
 *  Its scope is NOT a ProjectionFilter. It is a resolution record: SQL resolved
 *  the operational day from the tenant calendar and reports which day, in which
 *  timezone, from which day-start hour. The client reads it; it never derives
 *  any of the three. */
export interface OperationalDayScope {
  day: string;              // a DATE
  timezone: string;         // IANA zone, tenant-owned
  day_start_hour: number;   // tenant-owned
}

/** One occurrence at LIST grain. The detailed view remains the occurrence
 *  brief; nothing here duplicates it. `missing` and `missing_count` are the
 *  brief's eight-key completeness, carried unmodified — the client must not
 *  recount them against a shorter vocabulary of its own (finding C3). */
export interface OccurrenceDayRow {
  occurrence: string;
  engagement: string;
  ordinal: number;
  active: boolean;
  display_name: string | null;
  client: string | null;
  client_source: "engagement_profile" | "booking_contact" | null;
  operating_date: string;   // a DATE, equal to scope.day by construction
  venue: string | null;
  attendance: number | null;
  contracted: number | null;
  delta: number | null;
  has_event: boolean;
  event: string | null;
  missing: string[];
  missing_count: number;
}

export interface OccurrencesForOperationalDayData {
  day: string;
  occurrences: OccurrenceDayRow[];
}

/** released + preparing + cancelled partition total exactly. `incomplete` is
 *  deliberately NOT part of that partition — it is a cross-cutting readiness
 *  count over active rows, so the four figures do not sum to total. */
export interface OccurrencesForOperationalDayCounts {
  total: number;
  released: number;
  preparing: number;
  cancelled: number;
  incomplete: number;
}

export type OccurrencesForOperationalDayEnvelope =
  Envelope<OccurrencesForOperationalDayData, OperationalDayScope> &
  { counts: OccurrencesForOperationalDayCounts };

/** v294 · The Engagement Preparation Queue. Membership is the frozen ruling:
 *  active AND NOT has_event. The operating date is presentation data — it
 *  orders the list and is displayed; it never determines membership. Rows are
 *  the brief's list grain, unmodified (reuses OccurrenceDayRow, whose fields
 *  are the same certified pass-through). */
export interface PreparationQueueScope { basis: "unreleased"; }
export interface PreparationQueueData { occurrences: OccurrenceDayRow[]; }
export interface PreparationQueueCounts {
  total: number; incomplete: number; undated: number;
}
export type PreparationQueueEnvelope =
  Envelope<PreparationQueueData, PreparationQueueScope> &
  { counts: PreparationQueueCounts };
