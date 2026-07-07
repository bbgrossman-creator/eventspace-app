"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { loadPolicies } from "@/lib/policies";
import { Booking, fmtDate, fmtTime, menuBadge, parseLocalDate, stageFor, deriveGuests } from "@/lib/workflow";
import StatusPipeline from "@/components/StatusPipeline";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A calendar item is either the event itself or the menu-discussion phone call.
type CalItem = {
  kind: "event" | "call" | "touch" | "task";
  booking?: Booking; time: string;
  icon?: string; label?: string; sub?: string; id: string;
  task?: TaskRow; // task items carry their row for links/assignee/complete
  assignee?: string | null;
};

const TP_ICONS: Record<string, string> = {
  walkthrough: "🚶", tasting: "🍽️", contract: "✍️", followup: "☎️",
};
const TP_LABELS: Record<string, string> = {
  walkthrough: "Walkthrough", tasting: "Tasting", contract: "Contract Signing", followup: "Follow-Up",
};

interface TouchRow {
  id: string; booking_id: string; kind: string; scheduled_at: string | null;
  status: string; notes: string | null; assignee?: string | null; bookings: Booking | null;
}
interface TaskRow {
  id: string; title: string; due_date: string | null; due_time: string | null; done: boolean;
  booking_id?: string | null; invoice_num?: string | null; assignee?: string | null;
  customer?: string | null; // resolved from the linked booking
}

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
function locLabel(b: Booking, roomsMap: Map<string, string>): string | null {
  if (b.location_type === "off_prem") return `📍 ${b.offprem_address ?? "Off-premise"}`;
  if (b.room_id && roomsMap.size > 1) return `🏛️ ${roomsMap.get(b.room_id) ?? ""}`;
  return null;
}

function shortName(b: Booking) {
  const n = b.contact_name?.split(" ").slice(-1)[0] ?? b.contact_name ?? "";
  return n.length > 10 ? n.slice(0, 9) + "…" : n;
}

export default function Calendar() {
  const router = useRouter();
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [highlightDate, setHighlightDate] = useState<string | null>(null);
  const [returnDraft, setReturnDraft] = useState<string | null>(null);
  // Deep links:
  //   ?week=YYYY-MM-DD  → week view on that week (task-chip navigation)
  //   ?date=YYYY-MM-DD  → MONTH view on that month, day highlighted (inquiry)
  //   ?ret=inquiry[&draft=ID] → show "← Back to Inquiry" contextual button
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const w = p.get("week");
    const d = p.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setView("month");
      setAnchor(startOfMonth(parseLocalDate(d)));
      setHighlightDate(d);
    } else if (w && /^\d{4}-\d{2}-\d{2}$/.test(w)) {
      setView("week");
      setAnchor(startOfWeek(parseLocalDate(w)));
    }
    if (p.get("ret") === "inquiry") setReturnDraft(p.get("draft") || "");
  }, []);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<"both" | "events" | "calls" | "other">("both");
  const [touches, setTouches] = useState<TouchRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [fetchErr, setFetchErr] = useState("");
  const [diag, setDiag] = useState({ tpTotal: 0, tpNoTime: 0, taskTotal: 0, taskNoDate: 0 });
  const [calDays, setCalDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [roomsMap, setRoomsMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    supabase.from("rooms").select("id,name").then(({ data }) =>
      setRoomsMap(new Map(((data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]))));
  }, []);
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
      supabase.from("bookings").select("*").gte("event_date", s).lte("event_date", e).not("status", "in", '("cancelled","lead","lead_lost")'),
      supabase.from("bookings").select("*").gte("menu_discussion_date", s + "T00:00:00").lte("menu_discussion_date", e + "T23:59:59").not("status", "in", '("cancelled","lead","lead_lost")'),
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
      .then(async ({ data, error }) => {
        if (error) { setFetchErr((p) => p + ` Tasks: ${error.message}.`); setTasks([]); return; }
        const rows = (data ?? []) as TaskRow[];
        const ids = Array.from(new Set(rows.map((t) => t.booking_id).filter(Boolean))) as string[];
        if (ids.length) {
          const { data: bk } = await supabase.from("bookings").select("id,contact_name").in("id", ids);
          const nm = new Map((bk ?? []).map((b) => [b.id, b.contact_name as string]));
          rows.forEach((t) => { if (t.booking_id) t.customer = nm.get(t.booking_id) ?? null; });
        }
        setTasks(rows);
      });
    // Diagnostic totals: how many exist overall, and how many lack a date/time
    // (those can never appear on a calendar). Settles "why isn't X showing".
    Promise.all([
      supabase.from("touchpoints").select("*", { count: "exact", head: true }).eq("status", "scheduled"),
      supabase.from("touchpoints").select("*", { count: "exact", head: true }).eq("status", "scheduled").is("scheduled_at", null),
      supabase.from("tasks").select("*", { count: "exact", head: true }).eq("done", false),
      supabase.from("tasks").select("*", { count: "exact", head: true }).eq("done", false).is("due_date", null),
    ]).then(([a, b, c, d]) => setDiag({
      tpTotal: a.count ?? 0, tpNoTime: b.count ?? 0, taskTotal: c.count ?? 0, taskNoDate: d.count ?? 0,
    }));
  }, [range.start, range.end]);

  useEffect(() => { loadCal(); }, [loadCal]);
  const completeTask = useCallback(async (id: string) => {
    await supabase.from("tasks").update({ done: true }).eq("id", id);
    loadCal();
  }, [loadCal]);
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
          icon: TP_ICONS[t.kind] ?? "📌", label: TP_LABELS[t.kind] ?? t.kind, sub: t.notes ?? "", assignee: t.assignee ?? null,
        });
      }
      for (const t of tasks) {
        if (!t.due_date) continue;
        push(t.due_date, { kind: "task", id: `task-${t.id}`, time: t.due_time ?? "", icon: "📝", label: t.title, task: t });
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
      {returnDraft !== null && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-navy text-white px-4 py-2.5 reveal">
          <span className="text-sm font-medium">
            {highlightDate ? <>Checking availability for {fmtDate(highlightDate)}</> : "Checking availability"}
          </span>
          <a href={returnDraft ? `/bookings/new?draft=${returnDraft}` : "/bookings/new"}
            className="text-sm font-semibold rounded-lg bg-white/15 hover:bg-white/25 px-3 py-1.5 transition-colors whitespace-nowrap">
            ← Back to Inquiry
          </a>
        </div>
      )}
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-slate-500 mt-1">{title} · {Array.from(byDate.values()).reduce((n, l) => n + l.length, 0)} item{Array.from(byDate.values()).reduce((n, l) => n + l.length, 0) === 1 ? "" : "s"}</p>
          <div className="gold-rule mt-3" />
          {fetchErr && (
            <p className="text-xs text-red-600 mt-2">⚠️ Calendar data problem —{fetchErr} Run the touchpoints/tasks SQL or check table access.</p>
          )}
          <p className="text-[10px] text-slate-400 mt-1">
            in range: {bookings.length} bookings · {touches.length} of {diag.tpTotal} touchpoints{diag.tpNoTime > 0 ? ` (${diag.tpNoTime} have no time set — can't appear)` : ""} · {tasks.length} of {diag.taskTotal} tasks{diag.taskNoDate > 0 ? ` (${diag.taskNoDate} have no date — can't appear)` : ""}
          </p>
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

      {view === "week" ? <WeekView anchor={anchor} byDate={byDate} days={calDays} onCompleteTask={completeTask} roomsMap={roomsMap} /> : (
        <MonthView anchor={anchor} byDate={byDate} onCompleteTask={completeTask} highlightDate={highlightDate}
          onDayClick={(d) => { setView("week"); setAnchor(startOfWeek(d)); }} />
      )}
    </div>
  );
}

// ─── HOVER POPOVER (all tile kinds) ───
// Compact tiles by default; hovering floats an enlarged card ABOVE the grid
// (no layout shift) with the full details + actions. Notion/Linear-style.
function HoverCard({ children, pop }: { children: React.ReactNode; pop: React.ReactNode }) {
  return (
    <div className="relative group">
      {children}
      <div className="invisible opacity-0 scale-95 group-hover:visible group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 ease-out absolute left-1/2 -translate-x-1/2 -top-2 z-50 w-[280px] pointer-events-none group-hover:pointer-events-auto">
        <div className="rounded-xl bg-white shadow-2xl ring-1 ring-slate-200 p-3.5">
          {pop}
        </div>
      </div>
    </div>
  );
}
function PopActions({ bookingId, taskId, onCompleteTask }: {
  bookingId?: string | null; taskId?: string; onCompleteTask?: (id: string) => void;
}) {
  if (!bookingId && !taskId) return null;
  return (
    <div className="flex gap-1.5 mt-2.5">
      {bookingId && (
        <Link href={`/bookings/${bookingId}`} className="btn-primary !py-1 !px-3 !text-[11px]">Open Booking →</Link>
      )}
      {taskId && onCompleteTask && (
        <button className="!py-1 !px-3 text-[11px] font-semibold rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          onClick={() => onCompleteTask(taskId)}>✓ Mark Complete</button>
      )}
    </div>
  );
}

// ─── WEEK VIEW (rich cards) ───
function WeekView({ anchor, byDate, days, onCompleteTask, roomsMap }: { anchor: Date; byDate: Map<string, CalItem[]>; days: number[]; onCompleteTask: (id: string) => void; roomsMap: Map<string, string> }) {
  // Responsive density: fewer visible days = wider columns = richer cards.
  // ≤5 days: rich (P1–P4) · 6 days: medium (P1–P3) · 7 days: compact (P1–P2).
  const density: "rich" | "medium" | "compact" =
    days.length <= 5 ? "rich" : days.length === 6 ? "medium" : "compact";
  return (
    <div
      className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-[repeat(var(--cd),minmax(0,1fr))]"
      style={{ "--cd": days.length } as React.CSSProperties}>
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
                  const tk = item.task;
                  return (
                    <HoverCard key={item.id} pop={
                      <div className="text-sm">
                        <div className="font-display font-bold text-slate-700 mb-1">📝 Task</div>
                        <div className="font-medium">{item.label}</div>
                        <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                          {tk?.assignee && <div>👤 {tk.assignee}</div>}
                          {tk?.booking_id && <div>🔗 #{tk.invoice_num}{tk.customer ? ` — ${tk.customer}` : ""}</div>}
                          {tk?.due_date && <div>⏰ {fmtDate(tk.due_date)}{item.time ? ` · by ${fmtTime(item.time)}` : ""}</div>}
                        </div>
                        <PopActions bookingId={tk?.booking_id} taskId={tk?.id} onCompleteTask={onCompleteTask} />
                      </div>
                    }>
                    <div className="block rounded-lg ring-1 ring-[#F9BFAE] bg-[#FFF3EE] p-3">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-[11px] font-bold text-[#B5492F]">📋 Task</span>
                        {item.time && <span className="text-[11px] font-semibold text-[#B5492F] whitespace-nowrap">by {fmtTime(item.time)}</span>}
                      </div>
                      <div className="text-sm font-semibold leading-snug mt-0.5 line-clamp-2">{item.label}</div>
                      {tk?.assignee && <div className="text-[11px] text-slate-600 mt-0.5">{tk.assignee}</div>}
                      {density === "rich" && tk?.booking_id && (
                        <Link href={`/bookings/${tk.booking_id}`} className="text-[11px] text-navy font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
                          #{tk.invoice_num}{tk.customer ? ` · ${tk.customer}` : ""}
                        </Link>
                      )}
                    </div>
                    </HoverCard>
                  );
                }
                const b = item.booking!;
                if (item.kind === "touch") {
                  return (
                    <HoverCard key={item.id} pop={
                      <div className="text-sm">
                        <div className="font-display font-bold text-amber-700 mb-1">{item.icon} {item.label}</div>
                        <div className="font-medium">{b.contact_name}</div>
                        <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                          <div>#{b.invoice_num} · {fmtTime(item.time)}</div>
                          {item.assignee && <div>👤 {item.assignee}</div>}
                          {item.sub && <div className="whitespace-pre-wrap">📝 {item.sub}</div>}
                          {b.event_date && <div>Event: {fmtDate(b.event_date)}</div>}
                        </div>
                        <PopActions bookingId={b.id} />
                      </div>
                    }>
                    <Link href={`/bookings/${b.id}`}
                      className="block rounded-lg ring-1 ring-[#E4C87F] bg-[#FDF6E7] p-3 hover:ring-gold hover:shadow-md transition-all">
                      <div className="font-display font-bold text-[#8A6A1F] text-sm leading-tight">{item.icon} {item.label}</div>
                      <div className="text-sm font-medium truncate mt-0.5">{b.contact_name}</div>
                      <div className="text-[11px] font-semibold text-[#8A6A1F] mt-0.5">{fmtTime(item.time)}</div>
                      {density === "rich" && (
                        <div className="text-[11px] text-slate-500 truncate">#{b.invoice_num}</div>
                      )}
                    </Link>
                    </HoverCard>
                  );
                }
                if (item.kind === "call") {
                  // Phone-call card — visually distinct (pink, phone icon).
                  return (
                    <HoverCard key={`call-${b.id}`} pop={
                      <div className="text-sm">
                        <div className="font-display font-bold text-pink-700 mb-1">📞 Menu Call · {fmtTime(item.time)}</div>
                        <div className="font-medium">{b.contact_name}</div>
                        <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                          <div>#{b.invoice_num}</div>
                          {b.phone && <div>☎️ {b.phone}</div>}
                          <div>Event: {b.event_date ? fmtDate(b.event_date) : "TBD"} · {b.event_name || b.event_type || ""}</div>
                        </div>
                        <PopActions bookingId={b.id} />
                      </div>
                    }>
                    <Link href={`/bookings/${b.id}`}
                      className="block rounded-lg ring-1 ring-purple-200 bg-purple-50 p-3 hover:ring-purple-400 hover:shadow-md transition-all">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="font-display font-bold text-purple-700 text-sm">📞 Menu Call</span>
                        <span className="text-[11px] font-semibold text-purple-700 whitespace-nowrap">{fmtTime(item.time)}</span>
                      </div>
                      <div className="text-sm font-medium truncate mt-0.5">{b.contact_name}</div>
                      {density !== "compact" && (
                        <div className="text-[11px] text-slate-500 truncate">#{b.invoice_num} · event {b.event_date ? parseLocalDate(b.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD"}</div>
                      )}
                    </Link>
                    </HoverCard>
                  );
                }
                const st = stageFor(b.status);
                const heads = (() => {
                  const g = deriveGuests(b);
                  const h = (g.gendered ? g.men + g.women : g.adults) + g.children;
                  return h > 0 ? `${h} guests` : "guests TBD";
                })();
                return (
                  <HoverCard key={`ev-${b.id}`} pop={
                    <div className="text-sm">
                      <div className="font-display font-bold text-navy mb-1">#{b.invoice_num} · {fmtTime(item.time)}</div>
                      <div className="font-medium">{b.contact_name}</div>
                      <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                        <div>{b.event_name || b.event_type || "Event"}</div>
                        {locLabel(b, roomsMap) && <div>{locLabel(b, roomsMap)}</div>}
                        <div>{menuBadge(b.menu_type)} · {heads}</div>
                        <div style={{ color: st.textColor }} className="font-semibold">{st.icon} {st.action}</div>
                      </div>
                      <PopActions bookingId={b.id} />
                    </div>
                  }>
                  <Link href={`/bookings/${b.id}`}
                    className="block rounded-lg ring-1 ring-slate-200 p-3 hover:ring-navy hover:shadow-md transition-all"
                    style={{ background: st.color + "55" }}>
                    {/* P1: customer + time (customer is king) */}
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="text-[11px] font-bold text-navy">#{b.invoice_num}</span>
                      <span className="text-[11px] font-semibold whitespace-nowrap">{fmtTime(item.time)}</span>
                    </div>
                    <div className="font-display font-bold text-[15px] leading-tight truncate mt-0.5">{b.contact_name}</div>
                    {/* P2: event type */}
                    <div className="text-xs text-slate-600 truncate">{b.event_name || b.event_type}</div>
                    {density !== "compact" && locLabel(b, roomsMap) && (
                      <div className="text-[10px] text-slate-500 truncate">{locLabel(b, roomsMap)}</div>
                    )}
                    {/* P3: status / next action */}
                    {density !== "compact" && (
                      <div className="text-[10px] font-semibold truncate mt-1" style={{ color: st.textColor }}>{st.icon} {st.action}</div>
                    )}
                    {/* P4: guests + menu + pipeline — widest columns only */}
                    {density === "rich" && (
                      <>
                        <div className="text-[11px] text-slate-500 mt-0.5">{menuBadge(b.menu_type)} · {heads}</div>
                        <div className="mt-1.5"><StatusPipeline currentStage={st.stageIndex} compact /></div>
                      </>
                    )}
                  </Link>
                  </HoverCard>
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
function MonthView({ anchor, byDate, onDayClick, onCompleteTask, highlightDate }: {
  onCompleteTask: (id: string) => void;
  anchor: Date; byDate: Map<string, CalItem[]>; onDayClick: (d: Date) => void;
  highlightDate: string | null;
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
          const isTarget = highlightDate === fmtISO(d);
          const list = byDate.get(fmtISO(d)) ?? [];
          const shown = list.slice(0, 3);
          const extra = list.length - shown.length;
          return (
            <div key={i}
              onClick={() => onDayClick(d)}
              className={`min-h-[104px] rounded-lg border p-1.5 cursor-pointer transition-colors
                ${inMonth ? "bg-white" : "bg-slate-50"} 
                
                ${isTarget ? "border-navy border-2 ring-2 ring-navy/20" : isToday ? "border-gold border-2" : "border-slate-200 hover:border-navy"}`}>
              <div className={`text-xs font-semibold mb-1 ${inMonth ? (isToday ? "text-gold" : "text-slate-600") : "text-slate-300"}`}>
                {d.getDate()}
              </div>
              <div className="space-y-1">
                {shown.map((item) => {
                  if (item.kind === "task" || item.kind === "touch") {
                    const b = item.booking;
                    const tk = item.task;
                    return (
                      <HoverCard key={item.id} pop={
                        <div className="text-sm" onClick={(e) => e.stopPropagation()}>
                          <div className="font-display font-bold text-slate-700 mb-1">{item.icon} {item.kind === "task" ? "Task" : item.label}</div>
                          <div className="font-medium">{item.kind === "task" ? item.label : b?.contact_name}</div>
                          <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                            {tk?.assignee && <div>👤 {tk.assignee}</div>}
                            {(b || tk?.booking_id) && <div>🔗 #{b?.invoice_num ?? tk?.invoice_num}{tk?.customer ? ` — ${tk.customer}` : b ? ` — ${b.contact_name}` : ""}</div>}
                            {item.time && <div>⏰ {item.kind === "task" ? "by " : ""}{fmtTime(item.time)}</div>}
                            {item.sub && <div className="whitespace-pre-wrap">📝 {item.sub}</div>}
                          </div>
                          <PopActions bookingId={b?.id ?? tk?.booking_id} taskId={tk?.id} onCompleteTask={onCompleteTask} />
                        </div>
                      }>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (b) router.push(`/bookings/${b.id}`); }}
                        className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-left hover:ring-1 hover:ring-navy"
                        style={{ background: item.kind === "task" ? "#FFE9E1" : "#FDF0D5" }}>
                        <span className="text-[10px] shrink-0">{item.icon}</span>
                        <span className="text-[10px] font-medium truncate text-slate-700">
                          {item.time ? fmtTime(item.time).replace(":00", "") + " " : ""}{b ? shortName(b) : item.label}
                        </span>
                      </button>
                      </HoverCard>
                    );
                  }
                  const b = item.booking!;
                  const isCall = item.kind === "call";
                  const bg = isCall ? "#F3E8FF" : stageFor(b.status).color;
                  const fg = isCall ? "#7C3AED" : stageFor(b.status).textColor;
                  return (
                    <HoverCard key={`${item.kind}-${b.id}`} pop={
                      <div className="text-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="font-display font-bold mb-1" style={{ color: isCall ? "#7C3AED" : "#1F4E79" }}>
                          {isCall ? "📞 Menu Call" : `#${b.invoice_num}`} · {fmtTime(item.time)}
                        </div>
                        <div className="font-medium">{b.contact_name}</div>
                        <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                          {!isCall && <div>{b.event_name || b.event_type || "Event"}</div>}
                          {isCall && <div>#{b.invoice_num} · event {b.event_date ? fmtDate(b.event_date) : "TBD"}</div>}
                          <div className="font-semibold" style={{ color: stageFor(b.status).textColor }}>
                            {stageFor(b.status).icon} {stageFor(b.status).action}
                          </div>
                        </div>
                        <PopActions bookingId={b.id} />
                      </div>
                    }>
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/bookings/${b.id}`); }}
                      className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-left hover:ring-1 hover:ring-navy"
                      style={{ background: bg }}>
                      <span className="text-[10px] shrink-0">{isCall ? "📞" : ""}</span>
                      <span className="text-[10px] font-medium truncate" style={{ color: fg }}>
                        {fmtTime(item.time).replace(":00", "")} {shortName(b)}
                      </span>
                    </button>
                    </HoverCard>
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
