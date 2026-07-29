/** v292e · PROMISE LENS — the occurrences in play on this operational day.
 *
 *  Read-only. It records nothing, invokes no ceremony, and derives no count:
 *  every figure below comes from the envelope's `counts`. That is not
 *  fastidiousness — the v292c console kept a seven-fact vocabulary beside SQL's
 *  eight-key completeness and displayed "0 of 7" next to a SQL-supplied missing
 *  count of 8 (finding C3). One vocabulary, and SQL owns it.
 *
 *  Row order is the projection's order: cancelled last, then display name,
 *  ordinal, id. The client may re-sort for presentation, but membership and
 *  counts are fixed by the projection's declared scope (R-13).
 */
"use client";
import Link from "next/link";
import {
  type OccurrencesForOperationalDayEnvelope, type OccurrenceDayRow,
} from "@/lib/projection/types";
import { surfaceLabel } from "@/lib/projection/labels";

export default function PromiseLens({
  env,
}: {
  env: OccurrencesForOperationalDayEnvelope;
}) {
  const rows = env.data.occurrences ?? [];
  const c = env.counts;

  return (
    <section
      data-lens="promise"
      data-lens-projection={env.projection}
      data-lens-version={String(env.version)}
      data-lens-day={env.data.day}
      data-members={rows.map((r) => r.occurrence).join(",")}
      data-count-total={String(c.total)}
      data-count-released={String(c.released)}
      data-count-preparing={String(c.preparing)}
      data-count-cancelled={String(c.cancelled)}
      data-count-incomplete={String(c.incomplete)}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {surfaceLabel("promise_lens")}
        </h2>
        <p className="text-sm text-neutral-500">
          <span data-count-label="total">{c.total}</span> in play
          {c.incomplete > 0 && (
            <>
              <span className="mx-1.5 text-neutral-300">·</span>
              <span data-count-label="incomplete" className="text-amber-700">
                {c.incomplete} incomplete
              </span>
            </>
          )}
          {c.cancelled > 0 && (
            <>
              <span className="mx-1.5 text-neutral-300">·</span>
              <span data-count-label="cancelled" className="text-neutral-400">
                {c.cancelled} cancelled
              </span>
            </>
          )}
        </p>
      </div>

      {rows.length === 0 ? (
        <p data-lens-empty="promise" className="text-sm text-neutral-500">
          Nothing is dated to this operational day.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
          {rows.map((r) => (
            <OccurrenceRow key={r.occurrence} row={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function OccurrenceRow({ row: r }: { row: OccurrenceDayRow }) {
  return (
    <li
      data-occurrence-row={r.occurrence}
      data-active={String(r.active)}
      data-has-event={String(r.has_event)}
      data-missing-count={String(r.missing_count)}
      data-display-name={r.display_name ?? ""}
      data-client={r.client ?? ""}
      data-client-source={r.client_source ?? ""}
      data-venue={r.venue ?? ""}
      data-attendance={r.attendance === null ? "" : String(r.attendance)}
      data-contracted={r.contracted === null ? "" : String(r.contracted)}
      data-operating-date={r.operating_date}
      className={r.active ? "" : "opacity-60"}
    >
      <Link
        href={`/operations/occurrences/${r.occurrence}/prepare`}
        data-prepare-link={r.occurrence}
        className="flex items-center gap-4 px-4 py-3 hover:bg-neutral-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900">
            {r.display_name ?? `Occurrence ${r.ordinal}`}
          </span>
          <span className="mt-0.5 block truncate text-xs text-neutral-500">
            {r.client ?? "No client recorded"}
            {r.client_source === "booking_contact" && (
              // Never present an inherited fact as a specific one.
              <span className="text-neutral-400"> (from booking contact)</span>
            )}
            {r.venue && <> · {r.venue}</>}
          </span>
        </span>

        {r.attendance !== null && (
          <span className="shrink-0 text-xs text-neutral-600">
            {r.attendance}
            {r.delta !== null && r.delta !== 0 && (
              <span className={r.delta > 0 ? "text-teal-700" : "text-amber-700"}>
                {" "}
                ({r.delta > 0 ? "+" : ""}
                {r.delta})
              </span>
            )}
          </span>
        )}

        <span className="shrink-0">
          {!r.active ? (
            <Badge tone="gone">Cancelled</Badge>
          ) : r.has_event ? (
            <Badge tone="go">Released</Badge>
          ) : (
            <Badge tone="waiting">Preparing</Badge>
          )}
        </span>

        <span className="w-24 shrink-0 text-right text-xs">
          {r.missing_count === 0 ? (
            <span className="text-emerald-700">Complete</span>
          ) : (
            <span className="text-amber-700">{r.missing_count} missing</span>
          )}
        </span>
      </Link>
    </li>
  );
}

const TONE: Record<string, string> = {
  go: "border-teal-300 text-teal-700",
  waiting: "border-amber-300 text-amber-700",
  gone: "border-neutral-200 text-neutral-400",
};

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-xs ${TONE[tone] ?? TONE.gone}`}
    >
      {children}
    </span>
  );
}
