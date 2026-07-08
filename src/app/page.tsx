"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Booking, Task, buildTasks, daysLabel, fmtDate, fmtTime, menuBadge, parseLocalDate, isHoldExpired, hasMenu } from "@/lib/workflow";
import { loadPolicies } from "@/lib/policies";
import StatusPipeline from "@/components/StatusPipeline";
import TodoPanel from "@/components/TodoPanel";

export default function DailyOps() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [roomsMap, setRoomsMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    supabase.from("rooms").select("id,name").then(({ data }) =>
      setRoomsMap(new Map(((data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]))));
  }, []);
  const [callsToday, setCallsToday] = useState<Booking[]>([]);
  const [expiredHolds, setExpiredHolds] = useState<Booking[]>([]);
  const [err, setErr] = useState("");

  async function load() {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .not("status", "in", '("completed","cancelled")')
      .order("event_date", { ascending: true });
    if (error) { setErr(error.message); return; }
    const bookings = (data ?? []) as Booking[];
    const pol = await loadPolicies();
    const { data: tp } = await supabase.from("touchpoints")
      .select("booking_id").eq("status", "scheduled");
    const leadsWithTouchpoints = new Set((tp ?? []).map((t) => t.booking_id as string));
    setTasks(buildTasks(bookings, { menuOverdueHours: pol.menu_call_overdue_hours, leadsWithTouchpoints }));
    setExpiredHolds(bookings.filter((b) =>
      b.status === "hold_expired" || (b.status === "on_hold" && isHoldExpired(b))));

    const todayStr = new Date().toDateString();
    setCallsToday(
      bookings.filter(
        (b) =>
          b.menu_discussion_status === "Scheduled" &&
          !hasMenu(b) &&
          b.menu_discussion_date &&
          new Date(b.menu_discussion_date).toDateString() === todayStr
      )
    );
  }

  useEffect(() => { load(); }, []);

  if (err) return <p className="text-red-600">Couldn&apos;t load bookings: {err}. Check your .env.local Supabase keys.</p>;
  if (!tasks) return <p className="text-slate-500">Loading…</p>;

  // Within each urgency band, order by the attached event's date/time so the
  // soonest events surface first; tasks with no event date fall to the end.
  // This preserves the existing HIGH/MEDIUM/LOW bands — it only orders within.
  const byEvent = (a: Task, z: Task) => {
    const ad = a.booking.event_date, zd = z.booking.event_date;
    if (ad && zd) {
      if (ad !== zd) return ad < zd ? -1 : 1;
      const at = a.booking.event_time ?? "", zt = z.booking.event_time ?? "";
      return at < zt ? -1 : at > zt ? 1 : 0;
    }
    if (ad && !zd) return -1;   // dated events before undated
    if (!ad && zd) return 1;
    return 0;
  };
  const urgent = tasks.filter((t) => t.priority === "HIGH").sort(byEvent);
  const week = tasks.filter((t) => t.priority === "MEDIUM").sort(byEvent);
  const later = tasks.filter((t) => t.priority === "LOW").sort(byEvent);

  // Tile counts are EVENT-date based (so they match the calendar), distinct from
  // the task-priority sections below.
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const in7 = new Date(now); in7.setDate(in7.getDate() + 7);
  const activeBookings = tasks.filter((t) => t.booking.status !== "completed" && t.booking.status !== "cancelled");
  const eventsThisWeek = activeBookings.filter((t) => {
    if (!t.booking.event_date) return false;
    const d = parseLocalDate(t.booking.event_date);
    return d >= now && d < in7;
  });
  const eventsUpcoming = activeBookings.filter((t) => {
    if (!t.booking.event_date) return false;
    return parseLocalDate(t.booking.event_date) >= in7;
  });

  return (
    <div>
      <header className="mb-8">
        <h1 className="page-title">Daily Ops</h1>
        <p className="text-sm text-slate-500 mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <div className="gold-rule mt-3" />
      </header>

    <div className="xl:flex xl:gap-6 xl:items-start">
      <div className="flex-1 min-w-0">

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="Bookings Requiring Attention" value={urgent.length} tone="text-red-600"
          onClick={() => document.getElementById("needs-action")?.scrollIntoView({ behavior: "smooth", block: "start" })} />
        <Stat label="Events this week" value={eventsThisWeek.length} tone="text-amber-600"
          onClick={() => router.push("/calendar")} />
        <Stat label="Events upcoming" value={eventsUpcoming.length} tone="text-emerald-600"
          onClick={() => {
            const d = new Date(); const dow = (d.getDay() + 6) % 7;
            d.setDate(d.getDate() - dow + 7); // start of NEXT week
            router.push(`/calendar?week=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
          }} />
        <Stat label="Active bookings" value={activeBookings.length} tone="text-navy"
          onClick={() => router.push("/bookings")} />
      </div>


      {callsToday.length > 0 && (
        <section className="card p-5 mb-8 border-l-4 border-gold">
          <h2 className="font-display font-bold text-sm mb-3">📞 Menu calls today</h2>
          {callsToday.map((b) => (
            <Link key={b.id} href={`/bookings/${b.id}`} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0 hover:text-navy">
              <span className="text-sm font-medium">{b.contact_name} · #{b.invoice_num}</span>
              <span className="text-sm font-bold text-navy">
                {new Date(b.menu_discussion_date!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            </Link>
          ))}
        </section>
      )}

      {expiredHolds.length > 0 && (
        <section className="card p-5 mb-8 border-l-4 border-red-500">
          <h2 className="font-display font-bold text-sm mb-1">⏰ Expired holds — follow up ({expiredHolds.length})</h2>
          <p className="text-[11px] text-slate-400 mb-3">These holds lapsed without a deposit. Call to rebook, or delete to release the date.</p>
          {expiredHolds.map((b) => (
            <Link key={b.id} href={`/bookings/${b.id}`} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0 hover:text-navy">
              <span className="text-sm font-medium">{b.contact_name} · #{b.invoice_num}</span>
              <span className="text-xs text-slate-500">
                {b.event_name || b.event_type || "—"} · {fmtDate(b.event_date)}
                {b.hold_expires ? ` · expired ${daysLabel(Math.ceil((parseLocalDate(b.hold_expires.slice(0, 10)).getTime() - Date.now()) / 86400000)).toLowerCase()}` : ""}
              </span>
            </Link>
          ))}
        </section>
      )}

      <div id="needs-action">
      <TaskSection title="Needs immediate action" tasks={urgent} accent="bg-red-500" empty="Nothing urgent — nice." roomsMap={roomsMap} />
      </div>
      <TaskSection title="This week" tasks={week} accent="bg-amber-400" roomsMap={roomsMap} />
      <TaskSection title="Upcoming" tasks={later} accent="bg-emerald-500" roomsMap={roomsMap} />

      {tasks.length === 0 && (
        <div className="card p-12 text-center text-slate-500">
          <p className="text-4xl mb-3">🎉</p>
          <p>No active bookings. Start with a <Link href="/bookings/new" className="text-navy font-semibold underline">new inquiry</Link>.</p>
        </div>
      )}
      </div>

      {/* To-Do rail: floats in view on desktop with its own scroll; stacks below on smaller screens. */}
      <aside className="xl:w-[30%] xl:max-w-md xl:shrink-0 mt-8 xl:mt-0">
        <div className="xl:sticky xl:top-4">
          <TodoPanel />
        </div>
      </aside>
    </div>
    </div>
  );
}

function Stat({ label, value, tone, onClick }: { label: string; value: number; tone: string; onClick?: () => void }) {
  return (
    <button className="card px-5 py-4 text-left cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 hover:bg-slate-50/60"
      onClick={onClick} title="Open">
      <div className={`font-display text-3xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </button>
  );
}

function TaskSection({ title, tasks, accent, empty, roomsMap }: { title: string; tasks: Task[]; accent: string; empty?: string; roomsMap: Map<string, string> }) {
  if (tasks.length === 0 && !empty) return null;
  return (
    <section className="mb-8">
      <h2 className="flex items-center gap-2 font-display font-bold text-sm uppercase tracking-wider text-slate-600 mb-3">
        <span className={`w-2 h-2 rounded-full ${accent}`} /> {title}
        <span className="text-slate-400 font-normal normal-case tracking-normal">({tasks.length})</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400 pl-4">{empty}</p>
      ) : (
        <div className="space-y-2.5">
          {tasks.map((t) => (
            <Link
              key={t.booking.id}
              href={`/bookings/${t.booking.id}`}
              className="card flex items-center gap-4 px-5 py-4 hover:shadow-lg transition-shadow group"
            >
              <div className="w-20 shrink-0">
                <div className="font-display font-bold text-navy">#{t.booking.invoice_num}</div>
                <div className={`text-[11px] font-semibold ${t.daysUntil <= 1 ? "text-red-600" : "text-slate-500"}`}>
                  {daysLabel(t.daysUntil)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{t.booking.contact_name}</div>
                <div className="text-xs text-slate-500 truncate">
                  {t.booking.event_name || t.booking.event_type} · {fmtDate(t.booking.event_date)} {fmtTime(t.booking.event_time)} · {menuBadge(t.booking.menu_type)}
                  {t.booking.location_type === "off_prem"
                    ? <span className="text-slate-400"> · 📍 {t.booking.offprem_address ?? "Off-prem"}</span>
                    : (t.booking.room_id && roomsMap.size > 1
                      ? <span className="text-slate-400"> · 🏛️ {roomsMap.get(t.booking.room_id)}</span> : null)}
                </div>
                {t.reason && <div className="text-[11px] text-red-600 font-medium mt-0.5">{t.reason}</div>}
              </div>
              <div className="hidden md:block shrink-0">
                <StatusPipeline currentStage={t.stage.stageIndex} compact />
              </div>
              <span
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ background: t.stage.color, color: t.stage.textColor }}
              >
                {t.stage.icon} {t.actionLabel ?? t.stage.action}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
