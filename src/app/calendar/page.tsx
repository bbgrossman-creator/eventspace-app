"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { loadPolicies } from "@/lib/policies";
import { Booking, fmtTime, menuBadge, parseLocalDate, stageFor, deriveGuests } from "@/lib/workflow";
import StatusPipeline from "@/components/StatusPipeline";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A calendar item is either the event itself or the menu-discussion phone call.
type CalItem = {
  kind: "event" | "call" | "touch" | "task";
  booking?: Booking; time: string;
  icon?: string; label?: string; sub?: string; id: string;
};

const TP_ICONS: Record<string, string> = {
  walkthrough: "🚶", tasting: "🍽️", contract: "✍️", followup: "☎️",
};
const TP_LABELS: Record<string, string> = {
  walkthrough: "Walkthrough", tasting: "Tasting", contract: "Contract Signing", followup: "Follow-Up",
};

interface TouchRow {
  id: string; booking_id: string; kind: string; scheduled_at: string | null;
  status: string; notes: string | null; bookings: Booking | null;
}
interface TaskRow { id: string; title: string; due_date: string | null; due_time: string | null; done: boolean; }

function startOfWeek(d: Date) {
  const w = new Date(d); w.setHours(0, 0, 0, 0);
  w.setDate(w.getDate() - w.getDay());
  return w;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function fmtISO(d: Date) { return d.toISOString().slice(0, 10); }
/** Local-date ISO (YYYY-MM-DD) — avoids the UTC shift that toISOString causes
 *  for evening clock times, which otherwise buckets items onto the wrong day. */
function fmtISOLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shortName(b: Booking) {
  const n = b.contact_name?.split(" ").slice(-1)[0] ?? b.contact_name ?? "";
  return n.length > 10 ? n.slice(0, 9) + "…" : n;
}

export default function Calendar() {
  const router = useRouter();
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<"both" | "events" | "calls" | "other">("both");
  const [touches, setTouches] = useState<TouchRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [fetchErr, setFetchErr] = useState("");
  const [calDays, setCalDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  useEffect(() => {
    loadPolicies().then((p) => {
      const d = (p.calendar_days || "0,1,2,3,4,5,6").split(",").map(Number).filter((n) => n >= 0 && n <= 6);
      if (d.length) setCalDays(d);
    });
  }, []);

  // Range to fetch depends on view
  const range = useMemo(() => {
    if (view === "week") {
      const end = new Date(anchor); end.setDate(end.getDate() + 6);
      return { start: anchor, end };
    }
    const first = startOfMonth(anchor);
    const gridStart = startOfWeek(first);
    const gridEnd = new Date(gridStart); gridEnd.setDate(gridEnd.getDate() + 41); // 6 weeks
    return { start: gridStart, end: gridEnd };
  }, [view, anchor]);

  const loadCal = useCallback(() => {
    setFetchErr("");
    // Fetch bookings whose EVENT date OR whose CALL date falls in range, so both
    // kinds of items can appear. Two queries (Supabase can't OR across columns
    // cleanly here), then dedupe.
    const s = fmtISO(range.start), e = fmtISO(range.end);
    Promise.all([
      supabase.from("bookings").select("*").gte("event_date", s).lte("event_date", e).neq("status", "cancelled"),
      supabase.from("bookings").select("*").gte("menu_discussion_date", s + "T00:00:00").lte("menu_discussion_date", e + "T23:59:59").neq("status", "cancelled"),
    ]).then(([ev, calls]) => {
      const map = new Map<string, Booking>();
      for (const b of [...(ev.data ?? []), ...(calls.data ?? [])] as Booking[]) map.set(b.id, b);
      setBookings(Array.from(map.values()));
    });
    supabase.from("touchpoints").select("*")
      .eq("status", "scheduled")
      .gte("scheduled_at", s + "T00:00:00").lte("scheduled_at", e + "T23:59:59")
      .then(async ({ data, error }) => {
        if (error) { setFetchErr((p) => p + ` Touchpoints: ${error.message}.`); setTouches([]); return; }
        if (!data?.length) { setTouches([]); return; }
        const ids = Array.from(new Set(data.map((t) => t.booking_id)));
        const { data: bk } = await supabase.from("bookings").select("*").in("id", ids);
        const bmap = new Map((bk ?? []).map((b) => [b.id, b as Booking]));
        setTouches(data.map((t) => ({ ...t, bookings: bmap.get(t.booking_id) ?? null })) as unknown as TouchRow[]);
      });
    supabase.from("tasks").select("*").eq("done", false)
      .gte("due_date", s).lte("due_date", e)
      .then(({ data, error }) => {
        if (error) { setFetchErr((p) => p + ` Tasks: ${error.message}.`); setTasks([]); return; }
        setTasks((data ?? []) as TaskRow[]);
      });
  }, [range.start, range.end]);

  useEffect(() => { loadCal(); }, [loadCal]);
  useEffect(() => {
    const onFocus = () => loadCal();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadCal]);

  // Build calendar items: each booking yields an EVENT item (on event_date) and,
  // if a call is scheduled, a CALL item (on menu_discussion_date's day).
  const byDate = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    function push(date: string, item: CalItem) {
      if (!m.has(date)) m.set(date, []);
      m.get(date)!.push(item);
    }
    for (const b of bookings) {
      if ((filter === "both" || filter === "events") && b.event_date) {
        push(b.event_date, { kind: "event", booking: b, time: b.event_time ?? "", id: `ev-${b.id}` });
      }
      if ((filter === "both" || filter === "calls") && b.menu_discussion_date) {
        const d = new Date(b.menu_discussion_date);
        const dateStr = fmtISOLocal(d);
        const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        push(dateStr, { kind: "call", booking: b, time, id: `call-${b.id}` });
      }
    }
    if (filter === "both" || filter === "other") {
      for (const t of touches) {
        if (!t.scheduled_at) continue;
        // Read day + wall-clock straight from the stored string — immune to
        // timezone drift regardless of how the timestamp was saved.
        const raw = String(t.scheduled_at);
        push(raw.slice(0, 10), {
          kind: "touch", booking: t.bookings ?? undefined, id: `tp-${t.id}`,
          time: raw.slice(11, 16),
          icon: TP_ICONS[t.kind] ?? "📌", label: TP_LABELS[t.kind] ?? t.kind, sub: t.notes ?? "",
        });
      }
      for (const t of tasks) {
        if (!t.due_date) continue;
        push(t.due_date, { kind: "task", id: `task-${t.id}`, time: t.due_time ?? "", icon: "📝", label: t.title });
      }
    }
    for (const list of Array.from(m.values()))
      list.sort((a, z) => (a.time || "99").localeCompare(z.time || "99"));
    return m;
  }, [bookings, touches, tasks, filter]);

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
          <p className="text-sm text-slate-500 mt-1">{title} · {Array.from(byDate.values()).reduce((n, l) => n + l.length, 0)} item{Array.from(byDate.values()).reduce((n, l) => n + l.length, 0) === 1 ? "" : "s"}</p>
          <div className="gold-rule mt-3" />
          {fetchErr && (
            <p className="text-xs text-red-600 mt-2">⚠️ Calendar data problem —{fetchErr} Run the touchpoints/tasks SQL or check table access.</p>
          )}
          <p className="text-[10px] text-slate-300 mt-1">in range: {bookings.length} bookings · {touches.length} touchpoints · {tasks.length} tasks</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {/* Calls / Bookings / Both filter */}
          <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
            {([["both", "All"], ["events", "📅 Bookings"], ["calls", "📞 Calls"], ["other", "📌 Other"]] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`px-3 py-2 text-sm font-medium ${filter === v ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                {lbl}
              </button>
            ))}
          </div>
          <button onClick={loadCal} title="Refresh"
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
            ↻
          </button>
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

      {view === "week" ? <WeekView anchor={anchor} byDate={byDate} days={calDays} /> : (
        <MonthView anchor={anchor} byDate={byDate}
          onDayClick={(d) => { setView("week"); setAnchor(startOfWeek(d)); }} />
      )}
    </div>
  );
}

// ─── WEEK VIEW (rich cards) ───
function WeekView({ anchor, byDate, days }: { anchor: Date; byDate: Map<string, CalItem[]>; days: number[] }) {
  return (
    <div className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
      {days.map((i) => {
        const name = DAYS[i];
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
                <p className="text-center text-[11px] text-slate-300 pt-8">Nothing scheduled</p>
              ) : list.map((item) => {
                if (item.kind === "task") {
                  return (
                    <div key={item.id} className="block rounded-lg border border-slate-300 border-dashed bg-slate-50 p-3">
                      <span className="font-display font-bold text-slate-600 text-sm">📝 Task</span>
                      <div className="text-sm truncate">{item.label}</div>
                    </div>
                  );
                }
                const b = item.booking!;
                if (item.kind === "touch") {
                  return (
                    <Link key={item.id} href={`/bookings/${b.id}`}
                      className="block rounded-lg border-2 border-amber-200 bg-amber-50 p-3 hover:border-amber-400 hover:shadow-md transition-all">
                      <div className="flex justify-between items-baseline">
                        <span className="font-display font-bold text-amber-700 text-sm">{item.icon} {item.label}</span>
                        <span className="text-xs font-semibold text-amber-700">{fmtTime(item.time)}</span>
                      </div>
                      <div className="text-sm font-medium truncate">{b.contact_name}</div>
                      <div className="text-[11px] text-slate-500 truncate">#{b.invoice_num}{item.sub ? ` · ${item.sub}` : ""}</div>
                    </Link>
                  );
                }
                if (item.kind === "call") {
                  // Phone-call card — visually distinct (pink, phone icon).
                  return (
                    <Link key={`call-${b.id}`} href={`/bookings/${b.id}`}
                      className="block rounded-lg border-2 border-pink-200 bg-pink-50 p-3 hover:border-pink-400 hover:shadow-md transition-all">
                      <div className="flex justify-between items-baseline">
                        <span className="font-display font-bold text-pink-700 text-sm">📞 Menu Call</span>
                        <span className="text-xs font-semibold text-pink-700">{fmtTime(item.time)}</span>
                      </div>
                      <div className="text-sm font-medium truncate">{b.contact_name}</div>
                      <div className="text-[11px] text-slate-500 truncate">#{b.invoice_num} · event {b.event_date ? parseLocalDate(b.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD"}</div>
                    </Link>
                  );
                }
                const st = stageFor(b.status);
                return (
                  <Link key={`ev-${b.id}`} href={`/bookings/${b.id}`}
                    className="block rounded-lg border border-slate-200 p-3 hover:border-navy hover:shadow-md transition-all"
                    style={{ background: st.color + "55" }}>
                    <div className="flex justify-between items-baseline">
                      <span className="font-display font-bold text-navy text-sm">#{b.invoice_num}</span>
                      <span className="text-xs font-semibold">{fmtTime(item.time)}</span>
                    </div>
                    <div className="text-sm font-medium truncate">{b.contact_name}</div>
                    <div className="text-[11px] text-slate-600 truncate">{b.event_name || b.event_type}</div>
                    <div className="text-[11px] mt-1">{menuBadge(b.menu_type)} · {(() => {
                      const g = deriveGuests(b);
                      const heads = (g.gendered ? g.men + g.women : g.adults) + g.children;
                      return heads > 0 ? `${heads} guests` : "? guests";
                    })()}</div>
                    <div className="mt-2 space-y-1">
                      <StatusPipeline currentStage={st.stageIndex} compact />
                      <div className="text-[10px] font-semibold truncate" style={{ color: st.textColor }}>{st.icon} {st.action}</div>
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
  anchor: Date; byDate: Map<string, CalItem[]>; onDayClick: (d: Date) => void;
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
                
                ${isToday ? "border-gold border-2" : "border-slate-200 hover:border-navy"}`}>
              <div className={`text-xs font-semibold mb-1 ${inMonth ? (isToday ? "text-gold" : "text-slate-600") : "text-slate-300"}`}>
                {d.getDate()}
              </div>
              <div className="space-y-1">
                {shown.map((item) => {
                  if (item.kind === "task" || item.kind === "touch") {
                    const b = item.booking;
                    return (
                      <button key={item.id}
                        onClick={(e) => { e.stopPropagation(); if (b) router.push(`/bookings/${b.id}`); }}
                        className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-left hover:ring-1 hover:ring-navy"
                        style={{ background: item.kind === "task" ? "#F1F5F9" : "#FEF3C7" }}
                        title={`${item.icon} ${item.label}${b ? `: ${b.contact_name}` : ""}${item.time ? ` · ${fmtTime(item.time)}` : ""}`}>
                        <span className="text-[10px] shrink-0">{item.icon}</span>
                        <span className="text-[10px] font-medium truncate text-slate-700">
                          {item.time ? fmtTime(item.time).replace(":00", "") + " " : ""}{b ? shortName(b) : item.label}
                        </span>
                      </button>
                    );
                  }
                  const b = item.booking!;
                  const isCall = item.kind === "call";
                  const bg = isCall ? "#FCE7F3" : stageFor(b.status).color;
                  const fg = isCall ? "#BE185D" : stageFor(b.status).textColor;
                  return (
                    <button key={`${item.kind}-${b.id}`}
                      onClick={(e) => { e.stopPropagation(); router.push(`/bookings/${b.id}`); }}
                      className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-left hover:ring-1 hover:ring-navy"
                      style={{ background: bg }}
                      title={`${isCall ? "📞 Menu call" : "Event"}: #${b.invoice_num} ${b.contact_name} · ${fmtTime(item.time)}`}>
                      <span className="text-[10px] shrink-0">{isCall ? "📞" : ""}</span>
                      <span className="text-[10px] font-medium truncate" style={{ color: fg }}>
                        {fmtTime(item.time).replace(":00", "")} {shortName(b)}
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
        📞 = menu call · click to open · click a day to jump to that week
      </p>
    </div>
  );
}
