"use client";
/** v288 · OPERATIONS TODAY — the FIRST production consumer of the certified
 *  Responsibility projection client.
 *
 *  CONSTITUTIONAL CONTRACT OF THIS FILE
 *   · All Responsibility data arrives through `@/lib/projection/feed`.
 *     This module does not import `execution/spine.ts`, directly or
 *     indirectly, and never calls `.rpc()`.
 *   · ONE projection request. Every visible element — bands, counts, states,
 *     risk — originates from a single envelope carrying one `as_of` and one
 *     `truth_version`, so the screen cannot show an incoherent mix of reads.
 *   · React renders membership; it never computes it. Bands are resolved by id
 *     lookup against the same envelope (`resolveBand`), never by re-filtering.
 *   · React never derives state, ownership, readiness, counts, actions or risk.
 *   · READ-ONLY. No ceremony, no evidence, no assignment, no dispatch, no
 *     optimistic update. There is no write path in this file.
 *   · Viewer identity comes from the authenticated session. If it cannot be
 *     resolved, "My Work" renders an honest refusal — it is never fabricated.
 */
import { useCallback, useEffect, useState } from "react";
import { operationsToday, resolveBand } from "@/lib/projection/feed";
import { ProjectionRefusal, type OperationsTodayEnvelope, type ResponsibilityRow } from "@/lib/projection/types";
import { statePresentation, indexRisk, worstSeverity, severityClass, formatWindow } from "@/lib/projection/state";
import { departmentLabel, stateLabel, findingLabel, surfaceLabel, setLabelPack } from "@/lib/projection/labels";
import { loadSession } from "@/lib/permissions";

/** Three constitutionally different outcomes, never collapsed into one. */
type Outcome =
  | { kind: "loading" }
  | { kind: "ready"; env: OperationsTodayEnvelope }
  | { kind: "refusal"; code: string; message: string }
  | { kind: "transport"; message: string };

/** Trust is resolved BEFORE any projection request.
 *  · trusted   — a tenant is bound to this session. `viewer` may still be null,
 *                in which case My Work refuses but tenant bands may render.
 *  · untrusted — no tenant can be trusted for this session. The WHOLE
 *                projection refuses and no operational band renders. An
 *                anonymous read would return an empty envelope from SQL
 *                (current_tenant_id() is NULL, so nothing matches); rendering
 *                that as "an empty day" would misreport an untrusted read as
 *                a statement about the tenant's work. */
type TrustState =
  | { kind: "resolving" }
  | { kind: "trusted"; tenant: string; viewer: string | null }
  | { kind: "untrusted"; reason: string };

const BANDS = ["mine", "ownerless", "at_risk", "changed"] as const;
type BandKey = (typeof BANDS)[number];

export default function OperationsToday({ pack }: { pack?: string }) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "loading" });
  const [trust, setTrust] = useState<TrustState>({ kind: "resolving" });

  if (pack) setLabelPack(pack);

  // 1 · Resolve TRUST from the authenticated session. Never invented.
  //     Tenant identity is never taken from a route parameter, a header, or
  //     any client-supplied value: it comes only from loadSession(), which
  //     reads the authenticated user and their active tenant_users row. The
  //     database independently enforces the same boundary through
  //     current_tenant_id(); this check refuses early rather than relying on
  //     an empty result to look like safety.
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

  // 2 · ONE projection request, made only once identity has been settled either
  //     way. A null viewer yields an empty My Work band from SQL — the client
  //     never fabricates one.
  const load = useCallback(async () => {
    if (trust.kind === "resolving") return;
    // No trusted tenant ⇒ the whole projection refuses. No request is made at
    // all: an untrusted surface must not read, not read-and-render-empty.
    if (trust.kind === "untrusted") {
      setOutcome({ kind: "refusal", code: "TENANT_UNRESOLVED", message: trust.reason });
      return;
    }
    setOutcome({ kind: "loading" });
    try {
      const env = await operationsToday({
        viewer: trust.viewer,
        since: null,   // no persistence in this slice; see the Changed band note
      });
      setOutcome({ kind: "ready", env });
    } catch (e) {
      if (e instanceof ProjectionRefusal) {
        setOutcome({ kind: "refusal", code: e.code, message: e.message });
      } else {
        setOutcome({ kind: "transport", message: e instanceof Error ? e.message : String(e) });
      }
    }
  }, [trust]);

  useEffect(() => { void load(); }, [load]);

  // ── outcome surfaces, kept distinct ─────────────────────────────────────
  if (outcome.kind === "loading") {
    return <main data-today data-outcome="loading" className="p-6 text-sm text-neutral-500">Loading…</main>;
  }
  if (outcome.kind === "refusal") {
    return (
      <main data-today data-outcome="refusal" data-refusal-code={outcome.code} className="p-6">
        <h1 className="text-base font-medium">Today</h1>
        <p data-refusal-message className="mt-2 text-sm text-rose-700">
          The projection refused this read: {outcome.code}. {outcome.message}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Nothing is shown, because a refusal is not an empty day.
        </p>
      </main>
    );
  }
  if (outcome.kind === "transport") {
    return (
      <main data-today data-outcome="transport" className="p-6">
        <h1 className="text-base font-medium">Today</h1>
        <p data-transport-message className="mt-2 text-sm text-amber-700">
          Could not reach the projection: {outcome.message}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          This is a transport failure, not a statement about your work.
        </p>
      </main>
    );
  }

  const env = outcome.env;
  const rows = env.data.responsibilities ?? [];
  const risk = indexRisk(env.data.risk ?? []);
  const counts = env.counts;
  const empty = (counts.total ?? 0) === 0;

  return (
    <main
      data-today
      data-outcome="ready"
      data-as-of={env.as_of}
      data-truth-version={env.provenance?.truth_version ?? ""}
      data-projection={env.projection}
      data-version={String(env.version)}
      data-scope={JSON.stringify(env.scope)}
      data-viewer={trust.kind === "trusted" ? (trust.viewer ?? "") : ""}
      data-tenant-trusted={String(trust.kind === "trusted")}
      data-viewer-state={trust.kind === "trusted" ? (trust.viewer ? "identified" : "unresolved") : trust.kind}
      data-membership={rows.map((r) => r.responsibility).join(",")}
      className="p-6"
    >
      <header className="mb-4">
        <h1 className="text-base font-medium">{surfaceLabel("operations_today")}</h1>
        <p className="text-xs text-neutral-500">
          <span data-events-today={String((env.data.events_today ?? []).length)}>
            {(env.data.events_today ?? []).length} event(s) in motion
          </span>
          {" · "}one snapshot, as of {env.as_of}
        </p>
      </header>

      {/* counts come from the envelope; nothing here is recounted */}
      <section data-counts className="mb-5 grid grid-cols-4 gap-3">
        <Count label={surfaceLabel("mine")} band="mine" value={counts.mine} />
        <Count label={surfaceLabel("ownerless")} band="ownerless" value={counts.ownerless} alarm />
        <Count label={surfaceLabel("at_risk")} band="at_risk" value={counts.at_risk} alarm />
        <Count label={surfaceLabel("changed")} band="changed" value={counts.changed} />
      </section>

      {empty && (
        <p data-empty-truth className="mb-4 text-sm text-neutral-500">
          Nothing is owed today. That is an empty day, not a failed read.
        </p>
      )}

      {BANDS.map((band) => (
        <Band
          key={band}
          band={band}
          env={env}
          risk={risk}
          viewerUnresolved={band === "mine" && trust.kind === "trusted" && !trust.viewer}
          viewerReason={"your identity could not be resolved for this session"}
        />
      ))}

      {risk.eventLevel.length > 0 && (
        <section data-event-findings data-event-finding-count={String(risk.eventLevel.length)} className="mt-5">
          <h2 className="text-xs uppercase tracking-wide text-neutral-500">Event findings</h2>
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

function Band({ band, env, risk, viewerUnresolved, viewerReason }: {
  band: BandKey;
  env: OperationsTodayEnvelope;
  risk: ReturnType<typeof indexRisk>;
  viewerUnresolved: boolean;
  viewerReason: string;
}) {
  // membership by id lookup against THIS envelope — never re-filtered
  const rows: ResponsibilityRow[] = resolveBand(env, band);

  return (
    <section data-band={band} data-band-count={String(rows.length)}
             data-band-members={rows.map((r) => r.responsibility).join(",")}
             className="mb-5">
      <h2 className="text-xs uppercase tracking-wide text-neutral-500">{surfaceLabel(band)}</h2>

      {viewerUnresolved ? (
        <p data-band-refusal="mine" className="mt-1 text-sm text-rose-700">
          Cannot show your work: {viewerReason}. Sign in to see it — nothing is
          guessed here.
        </p>
      ) : rows.length === 0 ? (
        <p data-band-empty={band} className="mt-1 text-sm text-neutral-500">
          {band === "ownerless"
            ? "Nothing is ownerless. That's the goal."
            : band === "changed"
              ? "No change marker in this slice — persistence arrives later."
              : "Nothing here."}
        </p>
      ) : (
        <ol className="mt-1">
          {rows.map((r) => {
            const pres = statePresentation(r.state);
            const findings = risk.byResponsibility.get(r.responsibility);
            const worst = worstSeverity(findings);
            return (
              <li key={r.responsibility}
                  data-row={r.responsibility}
                  data-row-band={band}
                  data-state={r.state}
                  data-glyph={pres.glyph}
                  data-owner={r.owner ?? ""}
                  data-dept-key={r.department}
                  data-dept-label={departmentLabel(r.department)}
                  data-severity={worst ?? ""}
                  className="flex items-center gap-2 border-b border-neutral-100 py-1 text-sm">
                <span className={pres.className}>{pres.glyph}</span>
                <span className="flex-1">{r.required_outcome}</span>
                <span data-state-label className="text-xs text-neutral-500">{stateLabel(r.state)}</span>
                <span className="text-xs text-neutral-400">{departmentLabel(r.department)}</span>
                {formatWindow(r.timing) && (
                  <span className="text-xs text-neutral-400">{formatWindow(r.timing)}</span>
                )}
                {worst && (
                  <span data-risk-badge className={`rounded px-1 text-[11px] ${severityClass(worst)}`}>
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
