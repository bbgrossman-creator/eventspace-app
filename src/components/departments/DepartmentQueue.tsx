"use client";
/** v290 · DEPARTMENT QUEUE — the second production consumer of the certified
 *  Responsibility projection client, and the first surface built on a projection
 *  that had no incumbent.
 *
 *  CONSTITUTIONAL CONTRACT OF THIS FILE
 *   · All Responsibility data arrives through `@/lib/projection/feed`. This
 *     module does not import `execution/spine.ts`, directly or indirectly, and
 *     never calls `.rpc()`.
 *   · ONE projection request. Groups, counts, states and risk all originate
 *     from a single envelope carrying one `as_of` and one `truth_version`, so
 *     the screen cannot show an incoherent mix of reads.
 *   · GROUPING IS SQL'S. `groups` arrives from projection_department_queue()
 *     with its members already decided. `resolveGroup` is an id lookup against
 *     the same envelope — never a re-filter, never a client regroup. Changing
 *     `group_by` issues a new projection request rather than regrouping locally,
 *     because a client regroup could disagree with projection_group_key().
 *   · React never derives state, ownership, membership, counts or risk.
 *   · RISK IS NOT STATE (v290 doctrine). A finding decorates a row in its own
 *     element and is never rendered as, converted into, or merged with the
 *     state badge. The two are separate elements with separate vocabularies.
 *   · The department is passed through UNVALIDATED. validate_projection_filter()
 *     owns the closed vocabulary; an unknown department surfaces as the genuine
 *     refusal PROJECTION_FILTER_INVALID rather than a client-side guess.
 *   · READ-ONLY. No ceremony, no evidence, no assignment, no dispatch. There is
 *     no write path in this file.
 */
import { useCallback, useEffect, useState } from "react";
import { departmentQueue, resolveGroup } from "@/lib/projection/feed";
import {
  ProjectionRefusal,
  type DepartmentQueueEnvelope,
  type GroupBy,
  type ResponsibilityRow,
} from "@/lib/projection/types";
import {
  statePresentation, indexRisk, worstSeverity, severityClass, formatWindow,
} from "@/lib/projection/state";
import {
  departmentLabel, stateLabel, findingLabel, surfaceLabel, groupLabel, setLabelPack,
} from "@/lib/projection/labels";
import { loadSession } from "@/lib/permissions";

/** Four constitutionally different outcomes, never collapsed into one. */
type Outcome =
  | { kind: "loading" }
  | { kind: "ready"; env: DepartmentQueueEnvelope }
  | { kind: "refusal"; code: string; message: string }
  | { kind: "transport"; message: string };

type TrustState =
  | { kind: "resolving" }
  | { kind: "trusted"; tenant: string; viewer: string | null }
  | { kind: "untrusted"; reason: string };

/** The surface's default read. `event` is chosen because a department works
 *  event by event; it is a REQUEST PARAMETER handed to SQL, not a client
 *  grouping decision. The SQL default is 'none'; choosing a different default
 *  for this surface is presentation, and the groups still come back computed. */
const DEFAULT_GROUP_BY = "event";

export default function DepartmentQueue({
  department,
  groupBy,
  pack,
}: {
  department: string;
  groupBy?: string;
  pack?: string;
}) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "loading" });
  const [trust, setTrust] = useState<TrustState>({ kind: "resolving" });

  if (pack) setLabelPack(pack);

  const requestedGroupBy = groupBy || DEFAULT_GROUP_BY;

  // 1 · Resolve TRUST from the authenticated session before any read. Tenant
  //     identity never comes from the route: the department is in the URL, the
  //     tenant is not, and must not be. current_tenant_id() enforces the same
  //     boundary in SQL; this refuses early rather than letting an empty result
  //     masquerade as safety.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const session = await loadSession();
        if (!live) return;
        if (!session) { setTrust({ kind: "untrusted", reason: "signed out" }); return; }
        if (session.unassigned) { setTrust({ kind: "untrusted", reason: "no active tenant membership" }); return; }
        if (!session.tenantId) { setTrust({ kind: "untrusted", reason: "no tenant bound to this session" }); return; }
        setTrust({ kind: "trusted", tenant: session.tenantId, viewer: session.userId || null });
      } catch {
        if (live) setTrust({ kind: "untrusted", reason: "session unavailable" });
      }
    })();
    return () => { live = false; };
  }, []);

  // 2 · ONE projection request. The department and group_by go to SQL exactly
  //     as received — unvalidated, because the vocabulary is not ours to police.
  const load = useCallback(async () => {
    if (trust.kind === "resolving") return;
    if (trust.kind === "untrusted") {
      setOutcome({ kind: "refusal", code: "TENANT_UNRESOLVED", message: trust.reason });
      return;
    }
    setOutcome({ kind: "loading" });
    try {
      const env = await departmentQueue(department, requestedGroupBy as GroupBy);
      setOutcome({ kind: "ready", env });
    } catch (e) {
      if (e instanceof ProjectionRefusal) {
        setOutcome({ kind: "refusal", code: e.code, message: e.message });
      } else {
        setOutcome({ kind: "transport", message: e instanceof Error ? e.message : String(e) });
      }
    }
  }, [trust, department, requestedGroupBy]);

  useEffect(() => { void load(); }, [load]);

  // ── outcome surfaces, kept distinct ─────────────────────────────────────
  if (outcome.kind === "loading") {
    return (
      <main data-queue data-outcome="loading" data-department={department}
            className="p-6 text-sm text-neutral-500">Loading…</main>
    );
  }
  if (outcome.kind === "refusal") {
    return (
      <main data-queue data-outcome="refusal" data-refusal-code={outcome.code}
            data-department={department} className="p-6">
        <h1 className="text-base font-medium">{surfaceLabel("department_queue")}</h1>
        <p data-refusal-message className="mt-2 text-sm text-rose-700">
          The projection refused this read: {outcome.code}. {outcome.message}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Nothing is shown, because a refusal is not an empty queue.
        </p>
      </main>
    );
  }
  if (outcome.kind === "transport") {
    return (
      <main data-queue data-outcome="transport" data-department={department} className="p-6">
        <h1 className="text-base font-medium">{surfaceLabel("department_queue")}</h1>
        <p data-transport-message className="mt-2 text-sm text-amber-700">
          Could not reach the projection: {outcome.message}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          This is a transport failure, not a statement about this department&apos;s work.
        </p>
      </main>
    );
  }

  const env = outcome.env;
  const rows = env.data.responsibilities ?? [];
  const groups = env.data.groups ?? [];
  const risk = indexRisk(env.data.risk ?? []);
  const counts = env.counts;
  const byState = counts.by_state ?? {};
  const empty = (counts.total ?? 0) === 0;
  // The department and grouping SQL actually answered with — not what we asked
  // for. If they ever differ, the screen shows the projection's answer.
  const answeredDept = env.data.department;
  const answeredGroupBy = env.data.group_by;

  return (
    <main
      data-queue
      data-outcome="ready"
      data-as-of={env.as_of}
      data-truth-version={env.provenance?.truth_version ?? ""}
      data-projection={env.projection}
      data-version={String(env.version)}
      data-scope={JSON.stringify(env.scope)}
      data-department={answeredDept}
      data-department-requested={department}
      data-department-label={departmentLabel(answeredDept)}
      data-group-by={answeredGroupBy}
      data-group-by-requested={requestedGroupBy}
      data-group-count={String(groups.length)}
      data-membership={rows.map((r) => r.responsibility).join(",")}
      data-tenant-trusted={String(trust.kind === "trusted")}
      className="p-6"
    >
      <header className="mb-4">
        <h1 className="text-base font-medium">
          {departmentLabel(answeredDept)} · {surfaceLabel("department_queue")}
        </h1>
        <p className="text-xs text-neutral-500">
          grouped by {answeredGroupBy} · one snapshot, as of {env.as_of}
        </p>
      </header>

      {/* counts come from the envelope; nothing here is recounted */}
      <section data-counts className="mb-4 grid grid-cols-3 gap-3">
        <Count label="Total" band="total" value={counts.total} />
        <Count label={surfaceLabel("ownerless")} band="ownerless" value={counts.ownerless} alarm />
        <Count label={surfaceLabel("at_risk")} band="at_risk" value={counts.at_risk} alarm />
      </section>

      {/* state distribution, straight from counts.by_state — never tallied here */}
      <section data-by-state className="mb-5 flex flex-wrap gap-2">
        {Object.keys(byState).map((s) => (
          <span
            key={s}
            data-state-count={s}
            data-state-count-value={String(byState[s as keyof typeof byState] ?? 0)}
            className={`rounded border px-2 py-0.5 text-[11px] ${statePresentation(s as ResponsibilityRow["state"]).className}`}
          >
            {stateLabel(s as ResponsibilityRow["state"])} {byState[s as keyof typeof byState] ?? 0}
          </span>
        ))}
      </section>

      {empty && (
        <p data-empty-truth className="mb-4 text-sm text-neutral-500">
          Nothing is owed in {departmentLabel(answeredDept)}. That is an empty queue,
          not a failed read.
        </p>
      )}

      {groups.map((g) => (
        <QueueGroup
          key={g.key}
          groupKey={g.key}
          members={g.members}
          groupBy={answeredGroupBy}
          rows={rows}
          risk={risk}
        />
      ))}

      {risk.eventLevel.length > 0 && (
        <section data-event-findings data-event-finding-count={String(risk.eventLevel.length)} className="mt-5">
          <h2 className="text-xs uppercase tracking-wide text-neutral-500">Findings not tied to a row</h2>
          <ul className="mt-1">
            {risk.eventLevel.map((f, i) => (
              <li key={i} data-event-finding={f.finding} className="text-sm text-amber-700">
                {findingLabel(f.finding)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Count({ label, band, value, alarm }: {
  label: string; band: string; value: number | undefined; alarm?: boolean;
}) {
  return (
    <div data-count={band} data-count-value={String(value ?? 0)}
         className={`rounded border p-3 ${alarm && (value ?? 0) > 0 ? "border-amber-300 bg-amber-50" : "border-neutral-200"}`}>
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="text-xl">{value ?? 0}</div>
    </div>
  );
}

function QueueGroup({ groupKey, members, groupBy, rows, risk }: {
  groupKey: string;
  members: string[];
  groupBy: GroupBy;
  rows: ResponsibilityRow[];
  risk: ReturnType<typeof indexRisk>;
}) {
  // membership by id lookup against THIS envelope — never re-filtered
  const groupRows = resolveGroup(rows, members);

  return (
    <section
      data-group={groupKey}
      data-group-label={groupLabel(groupKey, groupBy)}
      data-group-count={String(groupRows.length)}
      data-group-declared={String(members.length)}
      data-group-members={groupRows.map((r) => r.responsibility).join(",")}
      className="mb-5"
    >
      <h2 className="text-xs uppercase tracking-wide text-neutral-500">
        {groupLabel(groupKey, groupBy)}
      </h2>

      {groupRows.length === 0 ? (
        <p data-group-empty={groupKey} className="mt-1 text-sm text-neutral-500">
          This group declared members the envelope does not carry.
        </p>
      ) : (
        <ol className="mt-1">
          {groupRows.map((r) => {
            const pres = statePresentation(r.state);
            const findings = risk.byResponsibility.get(r.responsibility);
            const worst = worstSeverity(findings);
            return (
              <li key={r.responsibility}
                  data-row={r.responsibility}
                  data-row-group={groupKey}
                  data-state={r.state}
                  data-glyph={pres.glyph}
                  data-owner={r.owner ?? ""}
                  data-dept-key={r.department}
                  data-dept-label={departmentLabel(r.department)}
                  data-severity={worst ?? ""}
                  data-finding-count={String((findings ?? []).length)}
                  className="flex items-center gap-2 border-b border-neutral-100 py-1 text-sm">
                {/* STATE — its own element, state vocabulary only */}
                <span data-state-glyph className={pres.className}>{pres.glyph}</span>
                <span className="flex-1">{r.required_outcome}</span>
                <span data-state-label className="text-xs text-neutral-500">
                  {stateLabel(r.state)}
                </span>
                <span data-owner-label className="text-xs text-neutral-400">
                  {r.owner ?? "—"}
                </span>
                {formatWindow(r.timing) && (
                  <span className="text-xs text-neutral-400">{formatWindow(r.timing)}</span>
                )}
                {/* RISK — a separate element with a separate vocabulary. Never a
                    state badge, never merged into one (v290 doctrine). */}
                {worst && (
                  <span data-risk-badge
                        data-findings={(findings ?? []).map((f) => f.finding).join(",")}
                        className={`rounded px-1 text-[11px] ${severityClass(worst)}`}>
                    {(findings ?? []).map((f) => findingLabel(f.finding)).join(", ")}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
