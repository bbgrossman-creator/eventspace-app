"use client";
/** v287c PROJECTION HARNESS — renders projection FIXTURES through the REAL
 *  src/lib/projection modules (state.ts, labels.ts, feed.ts band resolvers,
 *  client.ts envelope validation). No database, no product UI.
 *
 *  The point: prove the client presents projections faithfully — labels,
 *  glyphs, grouping, ordering, state presentation, envelope version handling —
 *  and prove it never computes a responsibility state.
 */
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  statePresentation, stateGlyph, sortRows, groupRows, indexRisk,
  worstSeverity, severityClass, formatWindow, isResponsibilityState,
  type SortMode,
} from "@/lib/projection/state";
import {
  setLabelPack, labelPack, departmentLabel, departmentVerbs, stateLabel,
  findingLabel, surfaceLabel, groupLabel,
} from "@/lib/projection/labels";
import { assertEnvelope, normalizeRefusal } from "@/lib/projection/client";
import { resolveBand, resolveColumn } from "@/lib/projection/feed";
import type {
  ResponsibilityRow, RiskFinding, GroupBy, OperationsTodayEnvelope,
  EventCommandEnvelope,
} from "@/lib/projection/types";

const row = (
  id: string, dept: string, state: string, owner: string | null,
  outcome: string, ord: string, closeIn?: string, exceptions = 0,
): ResponsibilityRow => ({
  responsibility: id,
  scope: "event",
  event_ref: "ev-1",
  department: dept,
  kind: "k",
  required_outcome: outcome,
  resource_role: dept === "staffing" ? "carver" : null,
  owner,
  state: state as ResponsibilityRow["state"],
  timing: closeIn ? { window_end: closeIn } : null,
  risk: { lapse_soon: Boolean(closeIn), exceptions, unowned: owner === null },
  exceptions,
  natural_key: `nk-${id}`,
  ordering_key: ord,
});

const ROWS: ResponsibilityRow[] = [
  row("r1", "equipment", "lapsed",   "moshe", "Load truck 1",    "0|20260101|nk-r1", "2026-01-01T10:00:00Z"),
  row("r2", "culinary",  "active",   "moshe", "Rub the brisket", "2|20260102|nk-r2"),
  row("r3", "logistics", "derived",  null,    "Drive to venue",  "3|20260103|nk-r3"),
  row("r4", "staffing",  "standing", "dovid", "Confirm carver",  "4|20260104|nk-r4"),
  row("r5", "culinary",  "discharged", "moshe", "Slice the roast", "5|20260105|nk-r5", undefined, 2),
];

const RISK: RiskFinding[] = [
  { responsibility: "r1", event_ref: "ev-1", finding: "lapsed", severity: "critical", detail: null },
  { responsibility: "r3", event_ref: "ev-1", finding: "ownerless_nearing_window", severity: "warning", detail: null },
  { responsibility: "r5", event_ref: "ev-1", finding: "exception_recorded", severity: "advisory", detail: { count: 2 } },
  { responsibility: null, event_ref: "ev-1", finding: "venue_stale", severity: "warning", detail: { family: "utility" } },
];

const OPS: OperationsTodayEnvelope = {
  projection: "operations_today",
  version: 1,
  as_of: "2026-01-02T06:40:00Z",
  scope: {},
  data: {
    viewer: "moshe",
    since: null,
    responsibilities: ROWS,
    bands: {
      mine: ["r1", "r2", "r5"],
      ownerless: ["r3"],
      at_risk: ["r1", "r3", "r5"],
      changed: [],
    },
    events_today: ["ev-1"],
    risk: RISK,
  },
  counts: { total: 5, ownerless: 1, at_risk: 3, mine: 3, by_state: { lapsed: 1, active: 1, derived: 1, standing: 1, discharged: 1 } },
  provenance: { truth_version: "tv-abc" },
};

const CMD: EventCommandEnvelope = {
  projection: "event_command",
  version: 1,
  as_of: "2026-01-02T06:40:00Z",
  scope: { event: "ev-1" },
  data: {
    event: "ev-1",
    responsibilities: ROWS,
    columns: { lapsed: ["r1"], active: ["r2"], derived: ["r3"], standing: ["r4"], discharged: ["r5"] },
    risk: RISK,
  },
  counts: { total: 5, ownerless: 1, at_risk: 3 },
  provenance: { truth_version: "tv-abc" },
};

export default function ProjectionHarness() {
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const mode = params.get("mode") ?? "ops";
  const [pack, setPack] = useState<string>(params.get("pack") ?? "catering");
  const [groupBy, setGroupBy] = useState<GroupBy>((params.get("group") as GroupBy) ?? "department");
  const [sort, setSort] = useState<SortMode>((params.get("sort") as SortMode) ?? "projection");

  const lp = useMemo(() => setLabelPack(pack), [pack]);
  const risk = useMemo(() => indexRisk(RISK), []);
  const sorted = useMemo(() => sortRows(ROWS, sort), [sort]);
  const groups = useMemo(() => groupRows(ROWS, groupBy), [groupBy]);

  // envelope validation exercised through the REAL client
  let envelopeVerdict = "";
  try {
    assertEnvelope("operations_today", OPS);
    envelopeVerdict = "accepted";
  } catch (e) { envelopeVerdict = `refused:${(e as Error).message}`; }

  let versionVerdict = "";
  try {
    assertEnvelope("operations_today", { ...OPS, version: 99 });
    versionVerdict = "accepted";
  } catch (e) {
    const r = e as { code?: string };
    versionVerdict = `refused:${r.code ?? "unknown"}`;
  }

  let nameVerdict = "";
  try {
    assertEnvelope("day_sheet", OPS);
    nameVerdict = "accepted";
  } catch (e) { nameVerdict = `refused:${(e as { code?: string }).code ?? "unknown"}`; }

  let shapeVerdict = "";
  try {
    assertEnvelope("operations_today", { nope: true });
    shapeVerdict = "accepted";
  } catch (e) { shapeVerdict = `refused:${(e as { code?: string }).code ?? "unknown"}`; }

  const refusal = normalizeRefusal(
    'Error: PROJECTION_FILTER_INVALID: unknown filter key departmnet');

  return (
    <div data-projection-harness data-pack={lp.id} style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select data-pack-pick value={pack} onChange={(e) => setPack(e.target.value)}>
          <option value="catering">catering</option>
          <option value="generic">generic</option>
        </select>
        <select data-group-pick value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
          {["department", "event", "state", "owner", "resource_role", "none"].map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select data-sort-pick value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
          {["projection", "state", "department", "owner", "outcome"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div data-envelope-verdict={envelopeVerdict} />
      <div data-version-verdict={versionVerdict} />
      <div data-name-verdict={nameVerdict} />
      <div data-shape-verdict={shapeVerdict} />
      <div data-refusal-code={refusal.code} data-refusal-message={refusal.message} />
      <div data-surface-label={surfaceLabel("operations_today")} />
      <div data-truth-version={OPS.provenance.truth_version} />
      <div data-counts-total={String(OPS.counts.total)} data-counts-ownerless={String(OPS.counts.ownerless)} />

      {mode === "ops" && (
        <>
          <div data-band="ownerless" data-band-count={String(resolveBand(OPS, "ownerless").length)}>
            {surfaceLabel("ownerless")}
          </div>
          <div data-band="mine" data-band-count={String(resolveBand(OPS, "mine").length)} />
          <div data-band="at_risk" data-band-count={String(resolveBand(OPS, "at_risk").length)} />
        </>
      )}

      {mode === "command" && (
        <div data-columns>
          {(["lapsed", "active", "derived", "standing", "discharged"] as const).map((s) => (
            <div key={s} data-column={s} data-column-count={String(resolveColumn(CMD, s).length)} />
          ))}
        </div>
      )}

      <ol data-rows data-order={sorted.map((r) => r.responsibility).join(",")}>
        {sorted.map((r) => {
          const pres = statePresentation(r.state);
          const findings = risk.byResponsibility.get(r.responsibility);
          const worst = worstSeverity(findings);
          return (
            <li key={r.responsibility}
                data-row={r.responsibility}
                data-state={r.state}
                data-state-valid={String(isResponsibilityState(r.state))}
                data-glyph={pres.glyph}
                data-glyph-fn={stateGlyph(r.state)}
                data-tone={pres.tone}
                data-state-class={pres.className}
                data-state-label={stateLabel(r.state)}
                data-dept-key={r.department}
                data-dept-label={departmentLabel(r.department)}
                data-verbs={departmentVerbs(r.department).join("|")}
                data-window={formatWindow(r.timing)}
                data-owner={r.owner ?? ""}
                data-severity={worst ?? ""}
                data-severity-class={worst ? severityClass(worst) : ""}
                data-findings={(findings ?? []).map((f) => findingLabel(f.finding)).join("|")}>
              {r.required_outcome}
            </li>
          );
        })}
      </ol>

      <ul data-groups data-group-by={groupBy}
          data-group-keys={groups.map((g) => g.key).join(",")}
          data-grouped-total={String(groups.reduce((n, g) => n + g.members.length, 0))}>
        {groups.map((g) => (
          <li key={g.key} data-group={g.key}
              data-group-label={groupLabel(g.key, groupBy)}
              data-group-members={g.members.join(",")} />
        ))}
      </ul>

      <div data-event-findings={risk.eventLevel.map((f) => findingLabel(f.finding)).join("|")}
           data-event-finding-count={String(risk.eventLevel.length)} />
    </div>
  );
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<ProjectionHarness />);
