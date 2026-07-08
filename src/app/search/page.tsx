"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate, fmtTime, fmtMoney, menuBadge, stageFor, parseLocalDate } from "@/lib/workflow";

const EVENT_TYPES = ["Bar Mitzvah", "Bat Mitzvah", "Wedding", "Engagement", "Sheva Brochos", "Birthday Party", "Corporate Event", "Other"];

type DateRange = "any" | "upcoming" | "past" | "this_month" | "last_month" | "next_30" | "this_year" | "custom";

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "any", label: "Any date" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past events" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "next_30", label: "Next 30 days" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range…" },
];

function rangeBounds(r: DateRange): { from: Date | null; to: Date | null } {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const y = now.getFullYear(), m = now.getMonth();
  switch (r) {
    case "upcoming": return { from: now, to: null };
    case "past": return { from: null, to: now };
    case "this_month": return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) };
    case "last_month": return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0) };
    case "next_30": { const t = new Date(now); t.setDate(t.getDate() + 30); return { from: now, to: t }; }
    case "this_year": return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) };
    default: return { from: null, to: null };
  }
}

export default function Search() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [range, setRange] = useState<DateRange>("any");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    supabase.from("bookings").select("*")
      .order("event_date", { ascending: false, nullsFirst: false })
      .then(({ data }) => setBookings((data ?? []) as Booking[]));
  }, []);

  const results = useMemo(() => {
    if (!bookings) return [];
    const term = q.trim().toLowerCase();
    let from: Date | null = null, to: Date | null = null;
    if (range === "custom") {
      from = customFrom ? parseLocalDate(customFrom) : null;
      to = customTo ? parseLocalDate(customTo) : null;
    } else {
      ({ from, to } = rangeBounds(range));
    }

    return bookings.filter((b) => {
      if (type && b.event_type !== type) return false;
      if ((from || to) && b.event_date) {
        const d = parseLocalDate(b.event_date);
        if (from && d < from) return false;
        if (to && d > to) return false;
      } else if ((from || to) && !b.event_date) {
        return false;
      }
      if (term) {
        const hay = `${b.invoice_num} ${b.contact_name} ${b.event_name ?? ""} ${b.event_type ?? ""} ${b.phone ?? ""} ${b.email ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [bookings, q, type, range, customFrom, customTo]);

  const hasQuery = q.trim() || type || range !== "any";

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="page-title">Search</h1>
        <p className="text-sm text-slate-500 mt-1">Find any booking by name, event type, date, invoice #, phone, or email.</p>
        <div className="gold-rule mt-3" />
      </header>

      {/* Search controls */}
      <div className="card p-5 mb-5 space-y-4">
        <input autoFocus className="field !text-lg" placeholder="Search name, event, invoice #, phone, email…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Event type</label>
            <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Any type</option>
              {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <select className="field" value={range} onChange={(e) => setRange(e.target.value as DateRange)}>
              {DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
        {range === "custom" && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label">From</label><input type="date" className="field" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
            <div><label className="label">To</label><input type="date" className="field" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
          </div>
        )}
        {hasQuery && (
          <button className="text-xs text-slate-400 hover:text-navy"
            onClick={() => { setQ(""); setType(""); setRange("any"); setCustomFrom(""); setCustomTo(""); }}>
            Clear all filters
          </button>
        )}
      </div>

      {/* Results */}
      {!bookings ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-3">{results.length} result{results.length === 1 ? "" : "s"}</p>
          <div className="space-y-2">
            {results.map((b) => {
              const st = stageFor(b.status);
              return (
                <Link key={b.id} href={`/bookings/${b.id}`}
                  className="card flex items-center gap-4 px-4 py-3 hover:shadow-lg hover:ring-2 hover:ring-navy transition-all">
                  <div className="font-display font-bold text-navy text-sm w-20 shrink-0">#{b.invoice_num}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{b.contact_name} <span className="text-slate-400 font-normal">· {b.event_type ?? "—"}</span></div>
                    <div className="text-xs text-slate-500 truncate">{b.event_name || "—"} · {menuBadge(b.menu_type)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium">{fmtDate(b.event_date)}</div>
                    <div className="text-xs text-slate-400">{fmtTime(b.event_time)}</div>
                  </div>
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold shrink-0"
                    style={{ background: st.color, color: st.textColor }}>
                    {st.label.replace("Booked — ", "")}
                  </span>
                </Link>
              );
            })}
            {results.length === 0 && hasQuery && (
              <div className="card p-10 text-center text-slate-400">No bookings match — try fewer filters or a different term.</div>
            )}
            {!hasQuery && results.length > 0 && (
              <p className="text-[11px] text-slate-400 text-center mt-2">Showing all bookings, most recent first. Start typing or pick a filter to narrow.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
