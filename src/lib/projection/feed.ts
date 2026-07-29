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
import { fetchProjection, fetchRows, fetchObject, toFilter } from "./client";
import {
  type ProjectionFilter, type ResponsibilityRow, type GroupBy,
  type OperationsTodayEnvelope, type EventCommandEnvelope,
  type DepartmentQueueEnvelope, type DaySheetEnvelope,
  type Envelope, type FeedData, type RiskFinding,
  type ResponsibilityDetail,
  type OccurrenceBriefEnvelope,
  type OccurrencesForOperationalDayEnvelope,
  type OccurrencesForOperationalDayData,
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

/** v292b · ONE call supplies the whole occurrence brief: identity, client,
 *  venue, covers, schedule, supervision, temporal overlaps, readiness,
 *  exceptions, ownerless work and completeness.
 *
 *  Returns null when the occurrence does not exist for this tenant — a genuine
 *  not-found, never dressed up as an empty brief.
 *
 *  This is the ONLY read a briefing surface needs. Do not compose it from
 *  several projections: the envelope carries one as_of and one truth_version,
 *  and assembling the same picture from multiple reads reintroduces exactly the
 *  incoherence the single-snapshot rule exists to prevent. */
/** v292e · The Promise lens of the Day Sheet. Call it with NO day and NO asOf:
 *  SQL resolves the current tenant operational day from
 *  operational_day_of(p_now, tenant tz, tenant day-start) and reports the result
 *  in `scope.day`, alongside the timezone and day-start hour it used.
 *
 *  The resolved `scope.day` and the echoed `as_of` are the certified composition
 *  handoff to the Work lens: pass both to daySheet() so the two lenses describe
 *  the same operational day at the same evaluation moment. The client derives
 *  neither. Computing a day with JavaScript Date, or generating a second clock
 *  for the second read, is exactly the drift this handoff exists to prevent. */
export async function occurrencesForOperationalDay(
  day?: string | null,
  asOf?: string,
): Promise<OccurrencesForOperationalDayEnvelope> {
  return fetchProjection<OccurrencesForOperationalDayData>(
    "projection_occurrences_for_operational_day",
    {
      p_day: day ?? null,
      ...(asOf ? { p_now: asOf } : {}),
    },
  ) as Promise<OccurrencesForOperationalDayEnvelope>;
}

export async function occurrenceBrief(
  occurrence: string,
  asOf?: string,
): Promise<OccurrenceBriefEnvelope | null> {
  return fetchObject<OccurrenceBriefEnvelope>("projection_occurrence_brief", {
    p_occurrence: occurrence,
    ...(asOf ? { p_now: asOf } : {}),
  });
}

/** v291 · One responsibility, in full. ONE request supplies anchors, current
 *  ownership, the ownership ledger, evidence, dependencies and supersession.
 *  Returns null when the responsibility does not exist for this tenant. */
export async function responsibilityDetail(
  responsibility: string,
  asOf?: string,
): Promise<ResponsibilityDetail | null> {
  return fetchObject<ResponsibilityDetail>("responsibility_detail", {
    p_responsibility: responsibility,
    ...(asOf ? { p_now: asOf } : {}),
  });
}

/** v291 · Risk for ONE responsibility, scoped as honestly as the closed filter
 *  grammar permits. There is no `responsibility` key in the grammar, so:
 *   · an event-scoped responsibility is read as {event: <its event>}
 *   · a STANDING responsibility has no event, and is read as {scope:'standing'}
 *  The standing read is therefore BROADER than the one row — every standing
 *  finding for the tenant comes back and the caller indexes by responsibility.
 *  That breadth is documented rather than narrowed client-side, because
 *  re-filtering a projection is the drift PRJ-10 exists to prevent. Narrowing it
 *  properly would require a grammar change, which is not v291's to make. */
export async function riskForResponsibility(
  detail: ResponsibilityDetail,
  asOf?: string,
): Promise<RiskFinding[]> {
  const eventRef = detail.row?.event_ref ?? null;
  const filter: ProjectionFilter = eventRef
    ? { event: eventRef }
    : { scope: "standing" };
  return riskFindings(filter, asOf);
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
