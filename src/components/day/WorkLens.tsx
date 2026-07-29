/** v292e · WORK LENS — the responsibility-side view of the same operational day.
 *
 *  This is the first application consumer of projection_day_sheet(). The
 *  projection is long-certified in SQL; what is new is that anything renders it
 *  at all, so this component's certification burden is faithful consumption.
 *
 *  It reinterprets nothing. States arrive already computed by
 *  responsibility_state(); groups arrive already computed by
 *  projection_group_key(); risk arrives as findings that decorate rows and are
 *  never states. Counts are the envelope's.
 *
 *  WINDOWS ARE DELIBERATELY NOT RENDERED (finding F-5). The only window
 *  formatter in the projection layer, state.ts shortTime(), prints via
 *  toISOString() — that is, UTC. On a surface whose entire subject is the
 *  tenant operational day, showing an operator a time four or five hours from
 *  local would be worse than showing nothing. Tenant-local formatting is
 *  registered as a future slice; until it exists, this lens shows what it can
 *  state truthfully. Responsibility detail (v291) carries the timing.
 */
"use client";
import {
  type DaySheetEnvelope, type ResponsibilityRow, type RiskFinding,
} from "@/lib/projection/types";
import {
  statePresentation, indexRisk, worstSeverity, severityClass,
} from "@/lib/projection/state";
import {
  surfaceLabel, departmentLabel, stateLabel, findingLabel, groupLabel,
} from "@/lib/projection/labels";

export default function WorkLens({ env }: { env: DaySheetEnvelope }) {
  const rows = env.data.responsibilities ?? [];
  const groups = env.data.groups ?? [];
  const c = env.counts;
  const { byResponsibility, eventLevel } = indexRisk(env.data.risk ?? []);
  const byId = new Map(rows.map((r) => [r.responsibility, r]));

  return (
    <section
      data-lens="work"
      data-lens-projection={env.projection}
      data-lens-version={String(env.version)}
      data-lens-day={env.data.day}
      data-lens-group-by={env.data.group_by}
      data-members={rows.map((r) => r.responsibility).join(",")}
      data-count-total={String(c.total ?? 0)}
      data-count-ownerless={String(c.ownerless ?? 0)}
      data-count-at-risk={String(c.at_risk ?? 0)}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {surfaceLabel("work_lens")}
        </h2>
        <p className="text-sm text-neutral-500">
          <span data-count-label="total">{c.total ?? 0}</span> outstanding
          {(c.ownerless ?? 0) > 0 && (
            <>
              <span className="mx-1.5 text-neutral-300">·</span>
              <span data-count-label="ownerless" className="text-amber-700">
                {c.ownerless} unowned
              </span>
            </>
          )}
          {(c.at_risk ?? 0) > 0 && (
            <>
              <span className="mx-1.5 text-neutral-300">·</span>
              <span data-count-label="at_risk" className="text-rose-700">
                {c.at_risk} at risk
              </span>
            </>
          )}
        </p>
      </div>

      {eventLevel.length > 0 && (
        <ul data-event-findings className="mb-3 space-y-1">
          {eventLevel.map((f, i) => (
            <li
              key={i}
              className={`rounded px-2 py-1 text-xs ${severityClass(f.severity)}`}
            >
              {findingLabel(f.finding)}
            </li>
          ))}
        </ul>
      )}

      {rows.length === 0 ? (
        <p data-lens-empty="work" className="text-sm text-neutral-500">
          No work is scheduled in this operational window.
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key} data-work-group={g.key}>
              <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
                {groupLabel(g.key, env.data.group_by)}
                <span className="ml-1.5 text-neutral-300">
                  {g.members.length}
                </span>
              </h3>
              <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
                {g.members.map((id) => {
                  const row = byId.get(id);
                  if (!row) return null;
                  return (
                    <WorkRow
                      key={id}
                      row={row}
                      findings={byResponsibility.get(id) ?? []}
                    />
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkRow({
  row: r,
  findings,
}: {
  row: ResponsibilityRow;
  findings: RiskFinding[];
}) {
  const pres = statePresentation(r.state);
  const worst = worstSeverity(findings);

  return (
    <li
      data-responsibility-row={r.responsibility}
      data-state={r.state}
      data-dept-key={r.department}
      data-owner={r.owner ?? ""}
      data-risk={worst ?? ""}
      className="flex items-center gap-3 px-4 py-2.5"
    >
      <span
        className={`shrink-0 rounded border px-1 text-xs ${pres.className}`}
        title={stateLabel(r.state)}
      >
        {pres.glyph}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-neutral-900">
        {r.required_outcome}
      </span>
      <span className="shrink-0 text-xs text-neutral-500">
        {departmentLabel(r.department)}
      </span>
      <span className="w-28 shrink-0 truncate text-right text-xs text-neutral-600">
        {r.owner ?? (
          <span className="text-amber-700">Nobody yet</span>
        )}
      </span>
      {worst && (
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${severityClass(worst)}`}
        >
          {findingLabel(findings[0].finding)}
        </span>
      )}
    </li>
  );
}
