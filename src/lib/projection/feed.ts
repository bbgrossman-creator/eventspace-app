/** v287c · FEED — typed wrappers over the projection layer.
 *
 *  This is what a surface imports. Each function maps 1:1 to a certified SQL
 *  projection and returns a typed envelope. There is no client-side membership
 *  logic here and no state computation: `my work`, `ownerless` and `at risk`
 *  are BANDS the SQL projection already computed, not filters applied here.
 *  Re-filtering client-side would reintroduce exactly the drift PRJ-10 exists
 *  to prevent.
 */
"use client";
import { fetchProjection, fetchRows, toFilter } from "./client";
import {
  type ProjectionFilter, type ResponsibilityRow, type GroupBy,
  type OperationsTodayEnvelope, type EventCommandEnvelope,
  type DepartmentQueueEnvelope, type DaySheetEnvelope,
  type Envelope, type FeedData, type RiskFinding,
} from "./types";

/** The spine, unwrapped. Prefer a composed projection where one exists — one
 *  round trip, and counts that agree with contents by construction. */
export async function feed(
  filter: ProjectionFilter = {},
  asOf?: string,
): Promise<ResponsibilityRow[]> {
  return fetchRows("responsibility_feed", {
    p_filter: toFilter(filter),
    ...(asOf ? { p_now: asOf } : {}),
  });
}

/** The spine wrapped in its envelope (counts + scope + truth_version). */
export async function feedEnvelope(
  filter: ProjectionFilter = {},
  asOf?: string,
): Promise<Envelope<FeedData>> {
  return fetchProjection<FeedData>("projection_feed", {
    p_filter: toFilter(filter),
    ...(asOf ? { p_now: asOf } : {}),
  });
}

/** Operations Today. `viewer` and `since` are CONTEXT, not membership filters:
 *  the envelope's scope stays `{}` so another person's ownerless work is never
 *  hidden from the console (v287b OWN-2). */
export async function operationsToday(opts: {
  viewer?: string | null;
  since?: string | null;
  asOf?: string;
} = {}): Promise<OperationsTodayEnvelope> {
  return fetchProjection<OperationsTodayEnvelope["data"]>("projection_operations_today", {
    p_viewer: opts.viewer ?? null,
    p_since: opts.since ?? null,
    ...(opts.asOf ? { p_now: opts.asOf } : {}),
  });
}

export async function eventCommand(
  eventId: string,
  asOf?: string,
): Promise<EventCommandEnvelope> {
  return fetchProjection<EventCommandEnvelope["data"]>("projection_event_command", {
    p_event: eventId,
    ...(asOf ? { p_now: asOf } : {}),
  });
}

export async function departmentQueue(
  department: string,
  groupBy: GroupBy = "none",
  asOf?: string,
): Promise<DepartmentQueueEnvelope> {
  return fetchProjection<DepartmentQueueEnvelope["data"]>("projection_department_queue", {
    p_department: department,
    p_group_by: groupBy,
    ...(asOf ? { p_now: asOf } : {}),
  });
}

export async function daySheet(
  day: string,
  groupBy: GroupBy = "department",
  asOf?: string,
): Promise<DaySheetEnvelope> {
  return fetchProjection<DaySheetEnvelope["data"]>("projection_day_sheet", {
    p_day: day,
    p_group_by: groupBy,
    ...(asOf ? { p_now: asOf } : {}),
  });
}

export async function riskFindings(
  filter: ProjectionFilter = {},
  asOf?: string,
): Promise<RiskFinding[]> {
  return (await fetchRows("risk_findings", {
    p_filter: toFilter(filter),
    ...(asOf ? { p_now: asOf } : {}),
  })) as unknown as RiskFinding[];
}

// ── band resolution (pure lookup over an already-fetched envelope) ─────────

/** Resolve a band's ids to rows from the SAME envelope. Never re-filters and
 *  never refetches: the band membership was decided by SQL. */
export function resolveBand(
  env: OperationsTodayEnvelope,
  band: keyof OperationsTodayEnvelope["data"]["bands"],
): ResponsibilityRow[] {
  const ids = new Set(env.data.bands[band] ?? []);
  return (env.data.responsibilities ?? []).filter((r) => ids.has(r.responsibility));
}

/** Resolve an Event Command column (keyed by constitutional state). */
export function resolveColumn(
  env: EventCommandEnvelope,
  state: keyof EventCommandEnvelope["data"]["columns"],
): ResponsibilityRow[] {
  const ids = new Set(env.data.columns[state] ?? []);
  return (env.data.responsibilities ?? []).filter((r) => ids.has(r.responsibility));
}

/** Resolve a group's ids to rows from the same envelope. */
export function resolveGroup(
  rows: ResponsibilityRow[],
  members: string[],
): ResponsibilityRow[] {
  const ids = new Set(members);
  return rows.filter((r) => ids.has(r.responsibility));
}
