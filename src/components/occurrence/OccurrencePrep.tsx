"use client";
/** v292c · OCCURRENCE PREPARATION — the promise-capture console.
 *
 *  WORKFLOW THIS SCREEN IS SHAPED BY
 *  A coordinator does not fill in a form. Information arrives out of order over
 *  weeks: the date at sale, an estimate, then the venue, the guarantee at the
 *  72-hour mark, supervision booked separately, milestones in the final week.
 *  So this is not a wizard and not a field layout. It is a LEDGER OF FACTS, and
 *  the operator's job is to record whichever one just arrived, alone, and leave.
 *
 *  The ledger's spine is `completeness` from projection_occurrence_brief. The
 *  projection already computes what is recorded and what is missing, so the
 *  checklist is not invented here — it is read.
 *
 *  CONSTITUTIONAL CONTRACT OF THIS FILE
 *   · ONE read: occurrenceBrief(). Every value displayed comes from that
 *     envelope, unchanged. Nothing is derived, recomputed or merged.
 *   · Writes go through @/lib/promise/ceremonies only. No .rpc() here.
 *   · NO OPTIMISTIC STATE. After any ceremony the brief is re-read and the whole
 *     screen re-renders from SQL. A local guess that disagreed with the ledger
 *     would be a second source of truth.
 *   · Refusals are rendered as their CODE, verbatim. The client never decides
 *     that a reason is required, that a value is unchanged, or that a basis is
 *     invalid — it offers the input, and SQL refuses if it must.
 *   · Reference reads: the venue catalogue only (see ceremonies.ts). No
 *     operational table is read.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { occurrenceBrief } from "@/lib/projection/feed";
import { ProjectionRefusal, type OccurrenceBriefEnvelope } from "@/lib/projection/types";
import { departmentLabel, setLabelPack } from "@/lib/projection/labels";
import { loadSession } from "@/lib/permissions";
import {
  CeremonyRefusal, MILESTONE_KEYS, listVenues,
  setOccurrenceProfile, setEngagementProfile, commitAttendance,
  setScheduleMilestone, bindOccurrenceVenue, bindOccurrenceSupervision, releasePromise,
  type AttendanceBasis, type MilestoneKey,
} from "@/lib/promise/ceremonies";

type Outcome =
  | { kind: "loading" }
  | { kind: "ready"; brief: OccurrenceBriefEnvelope }
  | { kind: "notfound" }
  | { kind: "refusal"; code: string; message: string }
  | { kind: "transport"; message: string };

/** The ledger, in the order information arrives in a catering operation. */
const FACTS = [
  { id: "operating_date", label: "Operating date", key: "operating_date" },
  { id: "attendance",     label: "Covers",         key: "attendance" },
  { id: "venue",          label: "Venue",          key: "venue" },
  { id: "identity",       label: "Occurrence name", key: "display_name" },
  { id: "client",         label: "Client",         key: "client" },
  { id: "supervision",    label: "Supervision",    key: "supervision" },
  { id: "schedule",       label: "Schedule",       key: "milestones" },
] as const;
type FactId = (typeof FACTS)[number]["id"];

/** v295 · Which disclosure panel is open. Every FACT can open one, and so can
 *  RELEASE — but release is NOT a fact and must never join the FACTS array:
 *  that array drives the completeness ledger, its length is rendered as
 *  "of N facts recorded", and the eight-key vocabulary is SQL's, not the
 *  client's. Widening the panel key here keeps the ledger honest. */
type PanelId = FactId | "release";

const BASES: AttendanceBasis[] = ["estimated", "contracted", "guaranteed", "final"];

export default function OccurrencePrep({
  occurrence, pack,
}: { occurrence: string; pack?: string }) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "loading" });
  const [trusted, setTrusted] = useState<boolean | null>(null);
  const [open, setOpen] = useState<PanelId | null>(null);
  const [refusal, setRefusal] = useState<{ code: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState<Record<string, string>>({});

  if (pack) setLabelPack(pack);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const s = await loadSession();
        if (!live) return;
        setTrusted(!!s && !s.unassigned && !!s.tenantId);
      } catch { if (live) setTrusted(false); }
    })();
    return () => { live = false; };
  }, []);

  // ONE read. Called again after every ceremony — never patched locally.
  const reload = useCallback(async () => {
    if (trusted === null) return;
    if (!trusted) {
      setOutcome({ kind: "refusal", code: "TENANT_UNRESOLVED", message: "no active tenant" });
      return;
    }
    try {
      const brief = await occurrenceBrief(occurrence);
      if (!brief) { setOutcome({ kind: "notfound" }); return; }
      setOutcome({ kind: "ready", brief });
    } catch (e) {
      if (e instanceof ProjectionRefusal) setOutcome({ kind: "refusal", code: e.code, message: e.message });
      else setOutcome({ kind: "transport", message: e instanceof Error ? e.message : String(e) });
    }
  }, [trusted, occurrence]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { if (open === "venue" && venues.length === 0) void listVenues().then(setVenues).catch(() => {}); }, [open, venues.length]);

  /** Run a ceremony, surface its refusal verbatim, then re-read. */
  const run = async (fn: () => Promise<unknown>) => {
    setRefusal(null); setSaving(true);
    try {
      await fn();
      setForm({}); setOpen(null);
      await reload();
    } catch (e) {
      if (e instanceof CeremonyRefusal) setRefusal({ code: e.code, message: e.message });
      else setRefusal({ code: "CEREMONY_ERROR", message: e instanceof Error ? e.message : String(e) });
    } finally { setSaving(false); }
  };

  const f = (k: string) => form[k] ?? "";
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  if (outcome.kind === "loading")
    return <main data-prep data-outcome="loading" className="p-6 text-sm text-neutral-500">Loading…</main>;
  if (outcome.kind === "notfound")
    return (
      <main data-prep data-outcome="notfound" className="p-6">
        <h1 className="text-base font-medium">Occurrence</h1>
        <p data-notfound className="mt-2 text-sm text-neutral-600">
          No occurrence with this reference exists for your organization.
        </p>
      </main>
    );
  if (outcome.kind === "refusal")
    return (
      <main data-prep data-outcome="refusal" data-refusal-code={outcome.code} className="p-6">
        <h1 className="text-base font-medium">Occurrence</h1>
        <p data-refusal-message className="mt-2 text-sm text-rose-700">
          {outcome.code}. {outcome.message}
        </p>
      </main>
    );
  if (outcome.kind === "transport")
    return (
      <main data-prep data-outcome="transport" className="p-6">
        <p data-transport-message className="text-sm text-amber-700">
          Could not reach the projection: {outcome.message}
        </p>
      </main>
    );

  const b = outcome.brief;
  const d = b.data;
  const comp = d.completeness;
  const recorded = FACTS.filter((x) => (comp as unknown as Record<string, boolean>)[x.key]).length;
  const released = d.has_event;

  return (
    <main
      data-prep data-outcome="ready"
      data-occurrence={d.identity.occurrence}
      data-as-of={b.as_of}
      data-truth-version={b.provenance?.truth_version ?? ""}
      data-has-event={String(released)}
      data-active={String(d.identity.active)}
      data-recorded={String(recorded)}
      data-missing={(comp.missing ?? []).join(",")}
      data-missing-count={String(b.counts.missing_promise_facts)}
      data-open={open ?? ""}
      className="mx-auto max-w-3xl p-6"
    >
      {/* ── WHICH ONE AM I PREPARING? ─────────────────────────────────────── */}
      <header data-identity className="mb-4">
        <div className="flex items-baseline gap-2">
          <h1 data-title className="text-lg font-medium">
            {d.identity.display_name ?? `Occurrence ${d.identity.ordinal}`}
          </h1>
          {d.identity.occasion_kind && (
            <span data-occasion className="text-xs text-neutral-500">{d.identity.occasion_kind}</span>
          )}
          <span data-regime
                className={`rounded px-1.5 py-0.5 text-[11px] ${released
                  ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200"
                  : "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200"}`}>
            {released ? "Released — under execution" : "Preparing"}
          </span>
          {!d.identity.active && (
            <span data-cancelled className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700">
              Cancelled
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">
          <span data-client>{d.identity.client ?? "no client recorded"}</span>
          {d.identity.client_source === "booking_contact" && (
            <span data-client-fallback className="ml-1 text-neutral-400">(from booking contact)</span>
          )}
          {d.identity.engagement_name && <> · {d.identity.engagement_name}</>}
          {" · occurrence "}{d.identity.ordinal}
          {d.identity.open_basis === "release_implied" && (
            <span data-implied className="ml-1 text-amber-700">(implied by a legacy release)</span>
          )}
        </p>
      </header>

      {/* ── v295 · RELEASE — the boundary between the two frozen questions ───
          Composed into the existing run() wrapper: ceremony, clear form,
          await reload(), verbatim refusal. No new pattern, no optimistic
          state. The regime badge above flips to "Released — under execution"
          on the re-read, BY DERIVATION — nothing here sets it. */}
      {!released && d.identity.active && (
        <section data-release className="mb-4 rounded border border-teal-200 bg-teal-50/40 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-teal-900">Release into execution</h2>
            {/* Completeness INFORMS the decision. It never gates it (v292a). */}
            <span data-release-readiness className="text-xs text-neutral-600">
              {b.counts.missing_promise_facts === 0
                ? "every promise fact recorded"
                : `${b.counts.missing_promise_facts} fact(s) still missing — you may still release`}
            </span>
          </div>

          {open !== "release" ? (
            <button data-release-action onClick={() => { setRefusal(null); setOpen("release"); }}
                    className="mt-2 rounded bg-teal-700 px-3 py-1.5 text-xs font-medium text-white">
              Release…
            </button>
          ) : (
            <div data-release-form className="mt-3 space-y-2">
              <p className="text-xs text-neutral-600">
                Release requires an operator sign-off and either a clearance or a
                waiver. An accepted, unrescinded offer must already exist.
              </p>
              <input data-input="signoff_ref" value={f("signoff_ref")}
                     onChange={(e) => set("signoff_ref", e.target.value)}
                     placeholder="sign-off reference"
                     className="w-full rounded border px-2 py-1 text-sm" />
              <input data-input="clearance_ref" value={f("clearance_ref")}
                     onChange={(e) => set("clearance_ref", e.target.value)}
                     placeholder="clearance reference"
                     className="w-full rounded border px-2 py-1 text-sm" />
              <input data-input="waiver_ref" value={f("waiver_ref")}
                     onChange={(e) => set("waiver_ref", e.target.value)}
                     placeholder="waiver reference (instead of clearance)"
                     className="w-full rounded border px-2 py-1 text-sm" />
              {/* v295 §3 · the refusal IS the business rule speaking. run()
                  catches ceremony refusals into `refusal`, but the existing
                  ceremony-refusal markup renders only inside FACTS.map — and
                  release is a PanelId, not a FactId. Without this the operator
                  sees nothing at all when a release is refused. Same pattern
                  and same hook as the fact forms; that one is not moved. */}
              {refusal && (
                <span data-ceremony-refusal={refusal.code} className="text-xs text-rose-700">
                  <span className="font-mono">{refusal.code}</span>
                  {refusal.message ? ` — ${refusal.message}` : ""}
                </span>
              )}
              <div className="flex gap-2">
                <button data-release-submit disabled={saving}
                        onClick={() => run(() => releasePromise(d.identity.occurrence, {
                          signoffRef:   f("signoff_ref")   || undefined,
                          clearanceRef: f("clearance_ref") || undefined,
                          waiverRef:    f("waiver_ref")    || undefined,
                        }))}
                        className="rounded bg-teal-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                  {saving ? "Releasing…" : "Release"}
                </button>
                <button onClick={() => { setOpen(null); setForm({}); }}
                        className="rounded px-3 py-1.5 text-xs text-neutral-600">Cancel</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── WHAT IS COMPLETE, WHAT REMAINS ───────────────────────────────── */}
      <section data-readiness className="mb-5 rounded border border-neutral-200 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm">
            <span data-recorded-count className="font-medium">{recorded}</span>
            <span className="text-neutral-500"> of {FACTS.length} facts recorded</span>
          </span>
          {released && (
            <span data-work-summary className="text-xs text-neutral-500">
              {b.counts.outstanding} outstanding · {b.counts.ownerless} unowned · {b.counts.exceptions} exception(s)
            </span>
          )}
        </div>
        {(comp.missing ?? []).length > 0 ? (
          <p data-missing-list className="mt-1 text-xs text-amber-700">
            Still missing: {(comp.missing ?? []).join(", ")}
          </p>
        ) : (
          <p data-complete className="mt-1 text-xs text-teal-700">
            Everything this briefing needs has been recorded.
          </p>
        )}
      </section>

      {/* ── THE LEDGER · one row per fact, one open at a time ─────────────── */}
      <section data-ledger className="divide-y divide-neutral-100 rounded border border-neutral-200">
        {FACTS.map((fact) => {
          const present = (comp as unknown as Record<string, boolean>)[fact.key];
          const isOpen = open === fact.id;
          return (
            <div key={fact.id} data-fact={fact.id} data-present={String(present)}
                 data-expanded={String(isOpen)} className="p-3">
              <div className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs text-neutral-500">{fact.label}</span>
                <span data-fact-value className="flex-1 text-sm">
                  {factValue(fact.id, d)}
                </span>
                <button
                  data-fact-action={fact.id}
                  onClick={() => { setRefusal(null); setForm({}); setOpen(isOpen ? null : fact.id); }}
                  className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:border-neutral-500">
                  {isOpen ? "Cancel" : present ? "Amend" : "Record"}
                </button>
              </div>

              {isOpen && (
                <div data-fact-form={fact.id} className="mt-3 rounded bg-neutral-50 p-3">
                  {/* Inputs are offered; SQL decides what is acceptable. */}
                  {fact.id === "operating_date" && (
                    <Row><In label="Date" type="date" v={f("date")} on={(v) => set("date", v)} id="date" /></Row>
                  )}
                  {fact.id === "attendance" && (
                    <>
                      <Row>
                        <In label="Head count" type="number" v={f("count")} on={(v) => set("count", v)} id="count" />
                        <label className="text-xs text-neutral-600">
                          Basis
                          <select data-input="basis" value={f("basis") || "estimated"}
                                  onChange={(e) => set("basis", e.target.value)}
                                  className="ml-1 rounded border border-neutral-300 px-1 py-0.5 text-xs">
                            {BASES.map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </label>
                      </Row>
                      <Row><In label="Effective from (optional)" type="datetime-local"
                               v={f("eff")} on={(v) => set("eff", v)} id="eff" /></Row>
                      <p className="mt-1 text-[11px] text-neutral-500">
                        A count effective later is recorded as scheduled and does not
                        become the operative number until its moment.
                      </p>
                    </>
                  )}
                  {fact.id === "venue" && (
                    <Row>
                      <label className="text-xs text-neutral-600">
                        Venue
                        <select data-input="venue" value={f("venue")} onChange={(e) => set("venue", e.target.value)}
                                className="ml-1 rounded border border-neutral-300 px-1 py-0.5 text-xs">
                          <option value="">select…</option>
                          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      </label>
                    </Row>
                  )}
                  {fact.id === "identity" && (
                    <Row>
                      <In label="Name" v={f("name")} on={(v) => set("name", v)} id="name" />
                      <In label="Occasion" v={f("occasion")} on={(v) => set("occasion", v)} id="occasion" />
                    </Row>
                  )}
                  {fact.id === "client" && (
                    <Row>
                      <In label="Client" v={f("client")} on={(v) => set("client", v)} id="client" />
                      <In label="Engagement name" v={f("engname")} on={(v) => set("engname", v)} id="engname" />
                    </Row>
                  )}
                  {fact.id === "supervision" && (
                    <>
                      <Row><In label="Authority" v={f("org")} on={(v) => set("org", v)} id="org" /></Row>
                      <Row>
                        <In label="From" type="datetime-local" v={f("wstart")} on={(v) => set("wstart", v)} id="wstart" />
                        <In label="Until" type="datetime-local" v={f("wend")} on={(v) => set("wend", v)} id="wend" />
                      </Row>
                      <Row><In label="Certificate" v={f("cert")} on={(v) => set("cert", v)} id="cert" /></Row>
                    </>
                  )}
                  {fact.id === "schedule" && (
                    <>
                      <Row>
                        <label className="text-xs text-neutral-600">
                          Milestone
                          <select data-input="mkey" value={f("mkey") || "service_start"}
                                  onChange={(e) => set("mkey", e.target.value)}
                                  className="ml-1 rounded border border-neutral-300 px-1 py-0.5 text-xs">
                            {MILESTONE_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                          </select>
                        </label>
                        <In label="Label (custom)" v={f("mlabel")} on={(v) => set("mlabel", v)} id="mlabel" />
                      </Row>
                      <Row>
                        <In label="At" type="datetime-local" v={f("mat")} on={(v) => set("mat", v)} id="mat" />
                        <In label="Until (optional)" type="datetime-local" v={f("mend")} on={(v) => set("mend", v)} id="mend" />
                      </Row>
                    </>
                  )}

                  {/* A reason is offered whenever the fact already exists. The
                      ceremony still decides: this only avoids hiding the field. */}
                  {present && (
                    <Row><In label="Reason for the change" v={f("reason")} on={(v) => set("reason", v)} id="reason" /></Row>
                  )}

                  <div className="mt-2 flex items-center gap-2">
                    <button
                      data-submit={fact.id} disabled={saving}
                      onClick={() => void run(() => submit(fact.id, occurrence, d.identity.engagement, form))}
                      className="rounded bg-neutral-800 px-3 py-1 text-xs text-white disabled:opacity-50">
                      {saving ? "Recording…" : "Record"}
                    </button>
                    {refusal && (
                      <span data-ceremony-refusal={refusal.code} className="text-xs text-rose-700">
                        <span className="font-mono">{refusal.code}</span>
                        {refusal.message ? ` — ${refusal.message}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ── ADVISORIES · overlapping windows are stated, never called conflicts ── */}
      {d.overlaps.length > 0 && (
        <section data-overlaps data-overlap-count={String(d.overlaps.length)} className="mt-5">
          <h2 className="text-xs uppercase tracking-wide text-neutral-500">Overlapping windows</h2>
          <ul className="mt-1">
            {d.overlaps.map((o, i) => (
              <li key={i} data-overlap={`${o.a_key}|${o.b_key}`} className="text-sm text-amber-700">
                {o.a} overlaps {o.b}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-neutral-500">
            These windows coincide in time. Whether they compete for the same
            people or space is not something this record knows.
          </p>
        </section>
      )}

      {released && d.readiness.length > 0 && (
        <section data-readiness-by-dept className="mt-5">
          <h2 className="text-xs uppercase tracking-wide text-neutral-500">Readiness</h2>
          <ul className="mt-1">
            {d.readiness.map((r) => (
              <li key={r.department} data-dept-readiness={r.department} className="text-sm">
                {departmentLabel(r.department)} — {r.outstanding} outstanding of {r.total}
                {r.ownerless > 0 && <span className="text-rose-700"> · {r.ownerless} unowned</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            <Link href={`/operations/departments`} className="underline">Work the department queues →</Link>
          </p>
        </section>
      )}
    </main>
  );
}

/** Which ceremony a ledger row invokes. Parameters are passed through; nothing
 *  is validated or defaulted into business meaning here. */
function submit(
  id: FactId, occurrence: string, engagement: string, form: Record<string, string>,
): Promise<unknown> {
  const r = form.reason?.trim() || undefined;
  const iso = (v?: string) => (v ? new Date(v).toISOString() : undefined);
  switch (id) {
    case "operating_date":
      return setScheduleMilestone(occurrence, "operating_date", { atDate: form.date, reason: r });
    case "attendance":
      return commitAttendance(occurrence, Number(form.count),
        (form.basis || "estimated") as AttendanceBasis, iso(form.eff), r);
    case "venue":
      return bindOccurrenceVenue(occurrence, form.venue, r);
    case "identity":
      return setOccurrenceProfile(occurrence, form.name, form.occasion, r);
    case "client":
      return setEngagementProfile(engagement, form.engname, form.client, r);
    case "supervision":
      return bindOccurrenceSupervision(occurrence, form.org, {
        windowStart: iso(form.wstart), windowEnd: iso(form.wend),
        certificateRef: form.cert, reason: r });
    case "schedule":
      return setScheduleMilestone(occurrence, (form.mkey || "service_start") as MilestoneKey, {
        atMoment: iso(form.mat), windowEnd: iso(form.mend),
        label: form.mlabel || undefined, reason: r });
  }
}

/** Display only. Every value is read from the envelope as produced. */
function factValue(id: FactId, d: OccurrenceBriefEnvelope["data"]): React.ReactNode {
  const none = <span className="text-neutral-400">not recorded</span>;
  switch (id) {
    case "operating_date":
      return d.schedule.operating_date ?? none;
    case "attendance": {
      const c = d.attendance.current;
      if (!c) return none;
      return (
        <>
          <span data-head-count>{c.head_count}</span>{" "}
          <span className="text-xs text-neutral-500">{c.basis}</span>
          {d.attendance.contracted !== null && d.attendance.delta !== null && (
            <span data-delta className={`ml-2 text-xs ${d.attendance.delta === 0 ? "text-neutral-500" : "text-amber-700"}`}>
              {d.attendance.delta > 0 ? "+" : ""}{d.attendance.delta} vs contracted {d.attendance.contracted}
            </span>
          )}
          {d.attendance.scheduled.length > 0 && (
            <span data-scheduled-count className="ml-2 text-xs text-neutral-500">
              {d.attendance.scheduled.length} scheduled later
            </span>
          )}
        </>
      );
    }
    case "venue":
      return d.venue ? (
        <>
          {d.venue.name}
          {d.venue.source === "engagement" && (
            <span data-inherited="venue" className="ml-2 text-xs text-neutral-500">
              inherited from the engagement
            </span>
          )}
        </>
      ) : none;
    case "identity":
      return d.identity.display_name ?? none;
    case "client":
      return d.identity.client_source === "engagement_profile" ? d.identity.client : none;
    case "supervision":
      return d.supervision ? (
        <>
          {d.supervision.authority_org}
          {d.supervision.source === "engagement" && (
            <span data-inherited="supervision" className="ml-2 text-xs text-neutral-500">
              inherited from the engagement
            </span>
          )}
        </>
      ) : none;
    case "schedule":
      return d.schedule.milestones.length === 0 ? none : (
        <span data-milestone-count={String(d.schedule.milestones.length)}>
          {d.schedule.milestones.map((m) => m.label).join(" · ")}
        </span>
      );
  }
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 flex flex-wrap items-center gap-3">{children}</div>;
}
function In({ label, v, on, id, type = "text" }: {
  label: string; v: string; on: (v: string) => void; id: string; type?: string;
}) {
  return (
    <label className="text-xs text-neutral-600">
      {label}
      <input data-input={id} type={type} value={v} onChange={(e) => on(e.target.value)}
             className="ml-1 rounded border border-neutral-300 px-1 py-0.5 text-xs" />
    </label>
  );
}
