/** v294 · PREPARATION QUEUE — the engagement-side lens of the promise
 *  lifecycle before release.
 *
 *  Everything promised that has not yet become work: undated intake,
 *  dated-future bookings, and dated-today occurrences not yet released. A row
 *  leaves this list when it is RELEASED — never merely because it acquired a
 *  date. Setting a date re-sorts it into the chronological section; that is
 *  the frozen semantics, and the constitution's first question made findable.
 *
 *  Read-only. One projection, one read per render. No ceremony is imported by
 *  this surface. Counts are the envelope's; the client derives none (C3).
 *  Order is the projection's order — rendered verbatim, never re-sorted here.
 *  Rows navigate to the existing Preparation Console, which owns all editing.
 */
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { preparationQueue } from "@/lib/projection/feed";
import {
  type PreparationQueueEnvelope, type OccurrenceDayRow, ProjectionRefusal,
} from "@/lib/projection/types";
import { surfaceLabel } from "@/lib/projection/labels";

type Outcome = "loading" | "ready" | "refusal" | "transport";

export default function PreparationQueue() {
  const [outcome, setOutcome] = useState<Outcome>("loading");
  const [env, setEnv] = useState<PreparationQueueEnvelope | null>(null);
  const [refusal, setRefusal] = useState<{ code: string; message: string } | null>(null);
  const [transport, setTransport] = useState<string | null>(null);

  const load = useCallback(async () => {
    setOutcome("loading"); setEnv(null); setRefusal(null); setTransport(null);
    try {
      const e = await preparationQueue();
      setEnv(e); setOutcome("ready");
    } catch (err) {
      if (err instanceof ProjectionRefusal) {
        setRefusal({ code: err.code, message: err.message }); setOutcome("refusal");
      } else {
        setTransport(err instanceof Error ? err.message : String(err));
        setOutcome("transport");
      }
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = env?.data.occurrences ?? [];
  const c = env?.counts;

  return (
    <main
      data-preparation-queue
      data-outcome={outcome}
      data-projection={env?.projection ?? ""}
      data-version={env ? String(env.version) : ""}
      data-basis={env?.scope.basis ?? ""}
      data-as-of={env?.as_of ?? ""}
      data-members={rows.map((r) => r.occurrence).join(",")}
      data-count-total={c ? String(c.total) : ""}
      data-count-incomplete={c ? String(c.incomplete) : ""}
      data-count-undated={c ? String(c.undated) : ""}
      data-refusal-code={refusal?.code ?? ""}
      className="mx-auto max-w-4xl px-6 py-8"
    >
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          {surfaceLabel("preparation_queue")}
        </h1>
        {outcome === "ready" && c && (
          <p className="mt-1 text-sm text-neutral-500">
            <span data-count-label="total">{c.total}</span> in preparation
            {c.undated > 0 && (
              <>
                <span className="mx-1.5 text-neutral-300">·</span>
                <span data-count-label="undated">{c.undated} awaiting a date</span>
              </>
            )}
            {c.incomplete > 0 && (
              <>
                <span className="mx-1.5 text-neutral-300">·</span>
                <span data-count-label="incomplete" className="text-amber-700">
                  {c.incomplete} incomplete
                </span>
              </>
            )}
          </p>
        )}
      </header>

      {outcome === "loading" && <p className="text-sm text-neutral-500">Reading…</p>}

      {outcome === "refusal" && refusal && (
        <div data-refusal className="rounded border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-800">{refusal.code}</p>
          <p className="mt-1 text-sm text-rose-700">{refusal.message}</p>
        </div>
      )}

      {outcome === "transport" && (
        <div data-transport className="rounded border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-sm text-neutral-700">Could not reach the projection layer.</p>
          <button onClick={() => void load()}
                  className="mt-2 text-sm font-medium text-neutral-900 underline">
            Retry
          </button>
        </div>
      )}

      {outcome === "ready" && rows.length === 0 && (
        <p data-queue-empty className="text-sm text-neutral-500">
          Nothing is awaiting release. Every promise on the books has crossed
          into work.
        </p>
      )}

      {outcome === "ready" && rows.length > 0 && (
        <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
          {rows.map((r) => <QueueRow key={r.occurrence} row={r} />)}
        </ul>
      )}
    </main>
  );
}

function QueueRow({ row: r }: { row: OccurrenceDayRow }) {
  return (
    <li
      data-queue-row={r.occurrence}
      data-operating-date={r.operating_date ?? ""}
      data-missing-count={String(r.missing_count)}
      data-has-event={String(r.has_event)}
    >
      <Link
        href={`/operations/occurrences/${r.occurrence}/prepare`}
        data-prepare-link={r.occurrence}
        className="flex items-center gap-4 px-4 py-3 hover:bg-neutral-50"
      >
        <span className="w-24 shrink-0 text-xs">
          {r.operating_date
            ? <span className="text-neutral-700">{r.operating_date}</span>
            : <span data-undated-badge className="rounded border border-neutral-300 px-1.5 py-0.5 text-neutral-500">Date TBD</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900">
            {r.display_name ?? `Occurrence ${r.ordinal}`}
          </span>
          <span className="mt-0.5 block truncate text-xs text-neutral-500">
            {r.client ?? "No client recorded"}
            {r.client_source === "booking_contact" && (
              <span className="text-neutral-400"> (from booking contact)</span>
            )}
            {r.venue && <> · {r.venue}</>}
          </span>
        </span>
        {r.attendance !== null && (
          <span className="shrink-0 text-xs text-neutral-600">{r.attendance}</span>
        )}
        <span className="w-24 shrink-0 text-right text-xs">
          {r.missing_count === 0
            ? <span className="text-emerald-700">Ready</span>
            : <span className="text-amber-700">{r.missing_count} missing</span>}
        </span>
      </Link>
    </li>
  );
}
