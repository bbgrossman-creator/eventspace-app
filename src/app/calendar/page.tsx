"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Booking, fmtTime, menuBadge, parseLocalDate, stageFor, deriveGuests } from "@/lib/workflow";
import StatusPipeline from "@/components/StatusPipeline";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfWeek(d: Date) {
  const w = new Date(d); w.setHours(0, 0, 0, 0);
  w.setDate(w.getDate() - w.getDay());
  return w;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function fmtISO(d: Date) { return d.toISOString().slice(0, 10); }
function shortName(b: Booking) {
  const n = b.contact_name?.split(" ").slice(-1)[0] ?? b.contact_name ?? "";
  return n.length > 10 ? n.slice(0, 9) + "…" : n;
}

export default function Calendar() {
  const router = useRouter();
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Range to fetch depends on view
  const range = useMemo(() => {
    if (view === "week") {
      const end = new Date(anchor); end.setDate(end.getDate() + 4);
      return { start: anchor, end };
    }
    const first = startOfMonth(anchor);
    const gridStart = startOfWeek(first);
    const gridEnd = new Date(gridStart); gridEnd.setDate(gridEnd.getDate() + 41); // 6 weeks
    return { start: gridStart, end: gridEnd };
  }, [view, anchor]);

  useEffect(() => {
    supabase.from("bookings").select("*")
      .gte("event_date", fmtISO(range.start))
      .lte("event_date", fmtISO(range.end))
      .neq("status", "cancelled")
      .then(({ data }) => setBookings((data ?? []) as Booking[]));
  }, [range.start, range.end]);

  // Group by ISO date
  const byDate = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      if (!b.event_date) continue;
      if (!m.has(b.event_date)) m.set(b.event_date, []);
      m.get(b.event_date)!.push(b);
    }
    for (const list of Array.from(m.values()))
      list.sort((a, z) => (a.event_time ?? "99").localeCompare(z.event_time ?? "99"));
    return m;
  }, [bookings]);

  function shift(dir: -1 | 1) {
    const a = new Date(anchor);
    if (view === "week") a.setDate(a.getDate() + dir * 7);
    else a.setMonth(a.getMonth() + dir);
    setAnchor(a);
  }
  function goToday() {
    setAnchor(view === "week" ? startOfWeek(new Date()) : startOfMonth(new Date()));
  }
  function switchView(v: "week" | "month") {
    setView(v);
    setAnchor(v === "week" ? startOfWeek(anchor) : startOfMonth(anchor));
  }

  const title = view === "week"
    ? `${range.start.toLocaleDateString()} – ${new Date(range.start.getTime() + 4 * 86400000).toLocaleDateString()}`
    : anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-slate-500 mt-1">{title} · {bookings.length} event{bookings.length === 1 ? "" : "s"}</p>
          <div className="gold-rule mt-3" />
        </div>
        <div className="flex gap-3 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
            {(["week", "month"] as const).map((v) => (
              <button key={v} onClick={() => switchView(v)}
                className={`px-4 py-2 text-sm font-medium capitalize ${view === v ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                {v}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => shift(-1)}>◀ Prev</button>
            <button className="btn-ghost" onClick={goToday}>Today</button>
            <button className="btn-ghost" onClick={() => shift(1)}>Next ▶</button>
          </div>
        </div>
      </header>

      {view === "week" ? <WeekView anchor={anchor} byDate={byDate} /> : (
        <MonthView anchor={anchor} byDate={byDate}
          onDayClick={(d) => { setView("week"); setAnchor(startOfWeek(d)); }} />
      )}
    </div>
  );
}

// ─── WEEK VIEW (rich cards — preserved from the original) ───
function WeekView({ anchor, byDate }: { anchor: Date; byDate: Map<string, Booking[]> }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {DAYS.map((name, i) => {
        const date = new Date(anchor); date.setDate(date.getDate() + i);
        const isToday = date.toDateString() === new Date().toDateString();
        const list = byDate.get(fmtISO(date)) ?? [];
        return (
          <div key={name}>
            <div className={`rounded-t-xl px-3 py-2 text-center ${isToday ? "bg-gold text-ink" : "bg-ink text-white"}`}>
              <div className="font-display font-bold text-xs tracking-wider">{name}</div>
              <div className="text-[11px] opacity-80">{date.getMonth() + 1}/{date.getDate()}</div>
            </div>
            <div className="bg-white rounded-b-xl shadow-card min-h-[120px] p-2 space-y-2">
              {list.length === 0 ? (
                <p className="text-center text-[11px] text-slate-300 pt-8">No events</p>
              ) : list.map((b) => {
                const st = stageFor(b.status);
                return (
                  <Link key={b.id} href={`/bookings/${b.id}`}
                    className="block rounded-lg border border-slate-200 p-3 hover:border-navy hover:shadow-md transition-all"
                    style={{ background: st.color + "55" }}>
                    <div className="flex justify-between items-baseline">
                      <span className="font-display font-bold text-navy text-sm">#{b.invoice_num}</span>
                      <span className="text-xs font-semibold">{fmtTime(b.event_time)}</span>
                    </div>
                    <div className="text-sm font-medium truncate">{b.contact_name}</div>
                    <div className="text-[11px] text-slate-600 truncate">{b.event_name || b.event_type}</div>
                    <div className="text-[11px] mt-1">{menuBadge(b.menu_type)} · {(() => {
                      const g = deriveGuests(b);
                      const heads = (g.gendered ? g.men + g.women : g.adults) + g.children;
                      return heads > 0 ? `${heads} guests` : "? guests";
                    })()}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <StatusPipeline currentStage={st.stageIndex} compact />
                      <span className="text-[10px] font-semibold" style={{ color: st.textColor }}>{st.icon} {st.action}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MONTH VIEW (compact grid, all 7 days, Fri/Sat dimmed) ───
function MonthView({ anchor, byDate, onDayClick }: {
  anchor: Date; byDate: Map<string, Booking[]>; onDayClick: (d: Date) => void;
}) {
  const router = useRouter();
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart); d.setDate(d.getDate() + i); return d;
  });
  const monthIdx = anchor.getMonth();
  const todayStr = new Date().toDateString();

  return (
    <div>
      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW.map((d, i) => (
          <div key={d} className={`text-center text-[11px] font-bold uppercase tracking-wider py-1 ${i >= 5 ? "text-slate-300" : "text-slate-500"}`}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === monthIdx;
          const weekend = d.getDay() >= 5;
          const isToday = d.toDateString() === todayStr;
          const list = byDate.get(fmtISO(d)) ?? [];
          const shown = list.slice(0, 3);
          const extra = list.length - shown.length;
          return (
            <div key={i}
              onClick={() => onDayClick(d)}
              className={`min-h-[104px] rounded-lg border p-1.5 cursor-pointer transition-colors
                ${inMonth ? "bg-white" : "bg-slate-50"} 
                ${weekend ? "opacity-60" : ""}
                ${isToday ? "border-gold border-2" : "border-slate-200 hover:border-navy"}`}>
              <div className={`text-xs font-semibold mb-1 ${inMonth ? (isToday ? "text-gold" : "text-slate-600") : "text-slate-300"}`}>
                {d.getDate()}
              </div>
              <div className="space-y-1">
                {shown.map((b) => {
                  const st = stageFor(b.status);
                  return (
                    <button key={b.id}
                      onClick={(e) => { e.stopPropagation(); router.push(`/bookings/${b.id}`); }}
                      className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-left hover:ring-1 hover:ring-navy"
                      style={{ background: st.color }}
                      title={`#${b.invoice_num} ${b.contact_name} · ${fmtTime(b.event_time)} · ${st.label}`}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: st.textColor }} />
                      <span className="text-[10px] font-medium truncate" style={{ color: st.textColor }}>
                        {fmtTime(b.event_time).replace(":00", "")} {shortName(b)}
                      </span>
                    </button>
                  );
                })}
                {extra > 0 && (
                  <div className="text-[10px] text-slate-400 font-medium pl-1">+{extra} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-3">
        Click an event to open it · click a day to jump to that week · Fri/Sat dimmed (Sun–Thu operating week)
      </p>
    </div>
  );
}
