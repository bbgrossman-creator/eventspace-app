"use client";
/** v312 · Events index — the way into an Event Workspace.
 *
 *  DELIBERATELY MINIMAL. This exists to find and enter operational Events. It is
 *  not a second Bookings surface: no pipeline stages, no proposal controls, no
 *  commercial editing, no Booking CRM functionality. Bookings remains the
 *  commercial surface and is untouched by v312.
 *
 *  Entries are Product Events — public.bookings rows, the engagement root — so
 *  the link target is the canonical Product Event identity that /events/[id]
 *  expects. Search is over what an operator would actually recall: the Event
 *  name, its reference, and the client.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface EventRow {
  id: string; event_name: string | null; invoice_num: string;
  contact_name: string | null; status: string | null; event_date: string | null;
}

export default function EventsIndexPage() {
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("bookings")
      .select("id, event_name, invoice_num, contact_name, status, event_date")
      .order("event_date", { ascending: true, nullsFirst: false })
      .then(({ data, error: e }) => {
        if (e) { setError(e.message); return; }
        setRows((data ?? []) as EventRow[]);
      });
  }, []);

  const shown = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.event_name ?? ""} ${r.invoice_num} ${r.contact_name ?? ""}`.toLowerCase().includes(needle));
  }, [rows, q]);

  return (
    <main className="p-4" data-events-index>
      <header className="mb-4">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-neutral-500">
          Events
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">Events</h1>
        <p className="mt-1 max-w-2xl text-xs text-neutral-500">
          One Event is the whole affair the organization is responsible for. Open one to work it
          across the company.
        </p>
      </header>

      <input value={q} onChange={(e) => setQ(e.target.value)} data-events-search
        placeholder="Search by Event, reference or client"
        className="mb-4 w-full max-w-md rounded border border-neutral-300 px-3 py-1.5 text-sm" />

      {error ? (
        <div className="rounded bg-rose-50 p-3 font-mono text-xs text-rose-800" data-events-error>{error}</div>
      ) : !rows ? (
        <div className="text-sm text-neutral-500" data-events-loading>Loading Events…</div>
      ) : shown.length === 0 ? (
        <div className="rounded border border-dashed border-neutral-300 p-4 text-sm text-neutral-500"
          data-events-empty>No Events match.</div>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {shown.map((r) => (
            <li key={r.id}>
              <Link href={`/events/${r.id}`} data-event-link={r.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-neutral-50">
                <span className="text-sm font-medium text-neutral-900">
                  {r.event_name?.trim() || "Unnamed Event"}
                </span>
                <span className="text-[11px] tabular-nums text-neutral-400">{r.invoice_num}</span>
                {r.contact_name ? (
                  <span className="text-xs text-neutral-500">{r.contact_name}</span>
                ) : null}
                <span className="flex-1" />
                {r.event_date ? (
                  <span className="text-xs tabular-nums text-neutral-500">{r.event_date}</span>
                ) : null}
                {r.status ? (
                  <span className="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                    {r.status}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
