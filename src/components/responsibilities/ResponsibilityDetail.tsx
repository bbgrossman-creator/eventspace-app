"use client";
/** v291 · RESPONSIBILITY DETAIL — why this responsibility exists, who owns it,
 *  what has been recorded against it, and what it depends on.
 *
 *  CONSTITUTIONAL CONTRACT OF THIS FILE
 *   · ONE responsibility_detail() request supplies anchors, current ownership,
 *     the ownership ledger, evidence, dependencies and supersession. There is no
 *     second call for ownership history: responsibility_detail().ownership and
 *     ownership_history() read the same table with the same filter and the same
 *     ordering, so calling both would be one request for data already in hand.
 *   · Risk is a SECOND, deliberately separate request, because
 *     responsibility_detail() carries no risk key. It is scoped as honestly as
 *     the closed filter grammar permits — see the note rendered in the risk
 *     section, which states the scope actually used on screen rather than only
 *     in a comment.
 *   · RISK IS NOT STATE (v290 doctrine, carried forward). The state badge and
 *     the findings live in separate elements with separate vocabularies.
 *   · ASSIGNMENT EVIDENCE IS SHOWN ONLY BECAUSE THIS ENVELOPE CONTAINS IT.
 *     responsibility_detail().evidence carries every recorded fact including
 *     `assignment`, so a detail surface may state that assignment evidence
 *     exists. A LIST surface may not, because responsibility_feed exposes no
 *     such column (v295 ruling). This file therefore renders ownership debt
 *     with the assignment fact beside it; the Department Queue renders the debt
 *     alone.
 *   · React derives no state, no ownership and no risk. Everything displayed is
 *     carried from SQL.
 *   · READ-ONLY. No ceremony, no evidence recording, no assignment, no dispatch.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { responsibilityDetail, riskForResponsibility } from "@/lib/projection/feed";
import {
  ProjectionRefusal,
  type ResponsibilityDetail as Detail,
  type RiskFinding,
} from "@/lib/projection/types";
import {
  statePresentation, indexRisk, worstSeverity, severityClass, formatWindow,
} from "@/lib/projection/state";
import {
  departmentLabel, stateLabel, findingLabel, setLabelPack,
} from "@/lib/projection/labels";
import { loadSession } from "@/lib/permissions";

type Outcome =
  | { kind: "loading" }
  | { kind: "ready"; detail: Detail; risk: RiskFinding[]; riskScope: string }
  | { kind: "notfound" }
  | { kind: "refusal"; code: string; message: string }
  | { kind: "transport"; message: string };

type TrustState =
  | { kind: "resolving" }
  | { kind: "trusted" }
  | { kind: "untrusted"; reason: string };

export default function ResponsibilityDetailSurface({
  responsibility,
  pack,
}: {
  responsibility: string;
  pack?: string;
}) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "loading" });
  const [trust, setTrust] = useState<TrustState>({ kind: "resolving" });

  if (pack) setLabelPack(pack);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const session = await loadSession();
        if (!live) return;
        if (!session) { setTrust({ kind: "untrusted", reason: "signed out" }); return; }
        if (session.unassigned) { setTrust({ kind: "untrusted", reason: "no active tenant membership" }); return; }
        if (!session.tenantId) { setTrust({ kind: "untrusted", reason: "no tenant bound to this session" }); return; }
        setTrust({ kind: "trusted" });
      } catch {
        if (live) setTrust({ kind: "untrusted", reason: "session unavailable" });
      }
    })();
    return () => { live = false; };
  }, []);

  const load = useCallback(async () => {
    if (trust.kind === "resolving") return;
    if (trust.kind === "untrusted") {
      setOutcome({ kind: "refusal", code: "TENANT_UNRESOLVED", message: trust.reason });
      return;
    }
    setOutcome({ kind: "loading" });
    try {
      const detail = await responsibilityDetail(responsibility);
      // SQL NULL means the tenant has no such responsibility. That is a genuine
      // not-found and is never dressed up as an empty detail.
      if (!detail) { setOutcome({ kind: "notfound" }); return; }
      const risk = await riskForResponsibility(detail);
      const riskScope = detail.row?.event_ref
        ? `{"event":"${detail.row.event_ref}"}`
        : `{"scope":"standing"}`;
      setOutcome({ kind: "ready", detail, risk, riskScope });
    } catch (e) {
      if (e instanceof ProjectionRefusal) {
        setOutcome({ kind: "refusal", code: e.code, message: e.message });
      } else {
        setOutcome({ kind: "transport", message: e instanceof Error ? e.message : String(e) });
      }
    }
  }, [trust, responsibility]);

  useEffect(() => { void load(); }, [load]);

  if (outcome.kind === "loading") {
    return <main data-detail data-outcome="loading" className="p-6 text-sm text-neutral-500">Loading…</main>;
  }
  if (outcome.kind === "notfound") {
    return (
      <main data-detail data-outcome="notfound" data-responsibility={responsibility} className="p-6">
        <h1 className="text-base font-medium">Responsibility</h1>
        <p data-notfound-message className="mt-2 text-sm text-neutral-600">
          No responsibility with this reference exists for your organization.
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Nothing is shown, because a missing responsibility is not an empty one.
        </p>
      </main>
    );
  }
  if (outcome.kind === "refusal") {
    return (
      <main data-detail data-outcome="refusal" data-refusal-code={outcome.code} className="p-6">
        <h1 className="text-base font-medium">Responsibility</h1>
        <p data-refusal-message className="mt-2 text-sm text-rose-700">
          The projection refused this read: {outcome.code}. {outcome.message}
        </p>
      </main>
    );
  }
  if (outcome.kind === "transport") {
    return (
      <main data-detail data-outcome="transport" className="p-6">
        <h1 className="text-base font-medium">Responsibility</h1>
        <p data-transport-message className="mt-2 text-sm text-amber-700">
          Could not reach the projection: {outcome.message}
        </p>
      </main>
    );
  }

  const { detail, risk, riskScope } = outcome;
  const row = detail.row;
  const pres = row ? statePresentation(row.state) : null;
  const indexed = indexRisk(risk);
  const mine = row ? (indexed.byResponsibility.get(row.responsibility) ?? []) : [];
  const worst = worstSeverity(mine);
  const ownership = detail.ownership ?? [];
  const evidence = detail.evidence ?? [];
  const dependencies = detail.dependencies ?? [];
  const assignmentFacts = evidence.filter((e) => e.kind === "assignment");
  const currentOwner = row?.owner ?? null;

  return (
    <main
      data-detail
      data-outcome="ready"
      data-responsibility={row?.responsibility ?? responsibility}
      data-state={row?.state ?? ""}
      data-owner={currentOwner ?? ""}
      data-dept-key={row?.department ?? ""}
      data-dept-label={row ? departmentLabel(row.department) : ""}
      data-scope-kind={row?.scope ?? ""}
      data-event-ref={row?.event_ref ?? ""}
      data-risk-scope={riskScope}
      data-finding-count={String(mine.length)}
      data-ownership-entries={String(ownership.length)}
      data-evidence-entries={String(evidence.length)}
      data-dependency-count={String(dependencies.length)}
      data-supersedes={detail.supersedes ?? ""}
      data-superseded-by={detail.superseded_by ?? ""}
      data-assignment-facts={String(assignmentFacts.length)}
      className="p-6"
    >
      <header className="mb-5">
        {row?.department && (
          <Link
            href={`/operations/departments/${row.department}`}
            data-back-to-queue={row.department}
            className="text-xs text-neutral-500 hover:text-neutral-800"
          >
            ← {departmentLabel(row.department)} queue
          </Link>
        )}
        <h1 className="mt-1 text-base font-medium">{row?.required_outcome ?? "Responsibility"}</h1>
        <div className="mt-2 flex items-center gap-2">
          {pres && (
            <>
              <span data-state-glyph className={pres.className}>{pres.glyph}</span>
              <span data-state-label className="text-xs text-neutral-600">
                {stateLabel(row!.state)}
              </span>
            </>
          )}
          <span className="text-xs text-neutral-400">{row ? departmentLabel(row.department) : ""}</span>
          {row && formatWindow(row.timing) && (
            <span data-window className="text-xs text-neutral-400">{formatWindow(row.timing)}</span>
          )}
          {worst && (
            <span data-risk-badge
                  data-findings={mine.map((f) => f.finding).join(",")}
                  className={`rounded px-1 text-[11px] ${severityClass(worst)}`}>
              {mine.map((f) => findingLabel(f.finding)).join(", ")}
            </span>
          )}
        </div>
      </header>

      {/* ── WHY THIS EXISTS ───────────────────────────────────────────────── */}
      <Section title="Why this exists" testId="anchors">
        <Field label="Origin" value={detail.anchors?.origin_kind ?? "—"} testId="origin-kind" />
        <Field label="Origin reference" value={detail.anchors?.origin_ref ?? "—"} testId="origin-ref" mono />
        <Field label="Origin revision" value={detail.anchors?.origin_revision ?? "—"} testId="origin-revision" mono />
        <Field label="Scope" value={row?.scope ?? "—"} testId="scope" />
        {detail.anchors?.declared && Object.keys(detail.anchors.declared).length > 0 && (
          <pre data-declared-anchors className="mt-2 overflow-x-auto rounded bg-neutral-50 p-2 text-[11px] text-neutral-700">
            {JSON.stringify(detail.anchors.declared, null, 2)}
          </pre>
        )}
      </Section>

      {/* ── OWNERSHIP ─────────────────────────────────────────────────────── */}
      <Section title="Ownership" testId="ownership">
        <p data-current-owner={currentOwner ?? ""} className="text-sm">
          {currentOwner
            ? <>Currently owned by <span className="font-medium">{currentOwner}</span>.</>
            : <span className="text-rose-700">Nobody owns this. It is visible ownership debt.</span>}
        </p>

        {/* The v295 ruling, satisfied on a surface that genuinely has the fact:
            assignment evidence is in THIS envelope, so it may be stated here. */}
        {!currentOwner && assignmentFacts.length > 0 && (
          <p data-assignment-without-ownership className="mt-1 text-xs text-amber-700">
            {assignmentFacts.length} assignment fact(s) are recorded against it, but
            assignment evidence does not establish constitutional ownership — the
            ownership ledger does, and it is empty.
          </p>
        )}

        {ownership.length === 0 ? (
          <p data-ownership-empty className="mt-2 text-sm text-neutral-500">
            The ownership ledger has no entries.
          </p>
        ) : (
          <ol className="mt-2">
            {ownership.map((o, i) => (
              <li key={i} data-ownership-entry={String(i)}
                  data-ownership-action={o.action}
                  data-ownership-owner={o.owner ?? ""}
                  data-ownership-prior={o.prior_owner ?? ""}
                  data-ownership-actor={o.actor ?? ""}
                  className="flex items-baseline gap-2 border-b border-neutral-100 py-1 text-sm">
                <span className="w-24 shrink-0 text-xs text-neutral-500">{o.action}</span>
                <span className="flex-1">
                  {o.prior_owner ? <>{o.prior_owner} → </> : null}
                  {o.owner ?? <span className="text-neutral-500">released</span>}
                </span>
                <span className="text-xs text-neutral-400">by {o.actor ?? "—"}</span>
                <span className="text-xs text-neutral-400">{shortMoment(o.moment)}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* ── EVIDENCE ──────────────────────────────────────────────────────── */}
      <Section title="Recorded evidence" testId="evidence">
        {evidence.length === 0 ? (
          <p data-evidence-empty className="text-sm text-neutral-500">
            Nothing has been recorded against this responsibility yet.
          </p>
        ) : (
          <ol>
            {evidence.map((e, i) => (
              <li key={i} data-evidence-entry={String(i)} data-evidence-kind={e.kind}
                  className="flex items-baseline gap-2 border-b border-neutral-100 py-1 text-sm">
                <span className="w-28 shrink-0 text-xs text-neutral-600">{e.kind}</span>
                <span className="flex-1 text-xs text-neutral-500">
                  {e.payload && Object.keys(e.payload).length > 0 ? JSON.stringify(e.payload) : ""}
                </span>
                <span className="text-xs text-neutral-400">by {e.actor ?? "—"}</span>
                <span className="text-xs text-neutral-400">{shortMoment(e.moment)}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* ── DEPENDENCIES ──────────────────────────────────────────────────── */}
      <Section title="Depends on" testId="dependencies">
        {dependencies.length === 0 ? (
          <p data-dependencies-empty className="text-sm text-neutral-500">Nothing.</p>
        ) : (
          <ul>
            {dependencies.map((d, i) => (
              <li key={i} data-dependency={String(d)} className="py-0.5 text-sm">
                <span className="font-mono text-xs">{String(d)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── SUPERSESSION ──────────────────────────────────────────────────── */}
      <Section title="Supersession" testId="supersession">
        {!detail.supersedes && !detail.superseded_by ? (
          <p data-supersession-none className="text-sm text-neutral-500">
            This responsibility neither replaces nor is replaced by another.
          </p>
        ) : (
          <ul className="text-sm">
            {detail.supersedes && (
              <li data-supersedes-link={detail.supersedes} className="py-0.5">
                Replaces{" "}
                <Link href={`/operations/responsibilities/${detail.supersedes}`}
                      className="font-mono text-xs underline">
                  {detail.supersedes}
                </Link>
              </li>
            )}
            {detail.superseded_by && (
              <li data-superseded-by-link={detail.superseded_by} className="py-0.5">
                Replaced by{" "}
                <Link href={`/operations/responsibilities/${detail.superseded_by}`}
                      className="font-mono text-xs underline">
                  {detail.superseded_by}
                </Link>
              </li>
            )}
          </ul>
        )}
      </Section>

      {/* ── RISK — separate section, separate vocabulary ───────────────────── */}
      <Section title="Findings" testId="risk">
        {mine.length === 0 ? (
          <p data-risk-empty className="text-sm text-neutral-500">No findings against this responsibility.</p>
        ) : (
          <ul>
            {mine.map((f, i) => (
              <li key={i} data-finding={f.finding} data-finding-severity={f.severity}
                  className="flex items-baseline gap-2 py-0.5 text-sm">
                <span className={`rounded px-1 text-[11px] ${severityClass(f.severity)}`}>
                  {f.severity}
                </span>
                <span>{findingLabel(f.finding)}</span>
              </li>
            ))}
          </ul>
        )}
        <p data-risk-scope-note className="mt-2 text-xs text-neutral-500">
          {row?.event_ref
            ? <>Findings were read for this responsibility&apos;s event and indexed to it.</>
            : <>This is a standing responsibility with no event. The filter grammar
               has no per-responsibility key, so findings were read for every
               standing responsibility in your organization and indexed to this
               one. The read is broader than the row; the display is not.</>}
        </p>
      </Section>
    </main>
  );
}

function Section({ title, testId, children }: {
  title: string; testId: string; children: React.ReactNode;
}) {
  return (
    <section data-section={testId} className="mb-5">
      <h2 className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value, testId, mono }: {
  label: string; value: string; testId: string; mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 py-0.5 text-sm">
      <span className="w-32 shrink-0 text-xs text-neutral-500">{label}</span>
      <span data-field={testId} className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  );
}

function shortMoment(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ");
}
