"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Booking, Task, buildTasks, daysLabel, fmtDate, fmtTime, menuBadge, parseLocalDate, isHoldExpired, hasMenu } from "@/lib/workflow";
import { loadPolicies } from "@/lib/policies";
import StatusPipeline from "@/components/StatusPipeline";

export default function DailyOps() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [callsToday, setCallsToday] = useState<Booking[]>([]);
  const [expiredHolds, setExpiredHolds] = useState<Booking[]>([]);
  const [todos, setTodos] = useState<{ id: string; title: string; due_date: string | null; due_time: string | null; done: boolean }[]>([]);
  const [newTask, setNewTask] = useState(""); const [newDue, setNewDue] = useState(""); const [newTime, setNewTime] = useState("");
  const [showTasks, setShowTasks] = useState(false);
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
    setTasks(buildTasks(bookings, { menuOverdueHours: pol.menu_call_overdue_hours }));
    setExpiredHolds(bookings.filter((b) =>
      b.status === "hold_expired" || (b.status === "on_hold" && isHoldExpired(b))));
    const { data: t } = await supabase.from("tasks").select("*")
      .eq("done", false)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("due_time", { ascending: true, nullsFirst: true });
    setTodos((t ?? []) as typeof todos);

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

  const urgent = tasks.filter((t) => t.priority === "HIGH");
  const week = tasks.filter((t) => t.priority === "MEDIUM");
  const later = tasks.filter((t) => t.priority === "LOW");

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
        <h1 className="font-display text-3xl font-bold tracking-tight">Daily Ops</h1>
        <p className="text-sm text-slate-500 mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <div className="gold-rule mt-3" />
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="Urgent tasks" value={urgent.length} tone="text-red-600" />
        <Stat label="Events this week" value={eventsThisWeek.length} tone="text-amber-600" />
        <Stat label="Events upcoming" value={eventsUpcoming.length} tone="text-emerald-600" />
        <Stat label="Active bookings" value={activeBookings.length} tone="text-navy" />
      </div>

      {/* General tasks — not tied to a booking. Collapsed to one line until opened. */}
      {!showTasks ? (
        <p className="mb-6 -mt-2">
          <button className="text-xs text-slate-400 hover:text-navy underline" onClick={() => setShowTasks(true)}>
            📝 Tasks{todos.length > 0 ? ` (${todos.length} open)` : " — add one"}
          </button>
        </p>
      ) : (
      <section className="card p-5 mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-bold text-sm">📝 Tasks{todos.length > 0 ? ` (${todos.length})` : ""}</h2>
          <div className="flex items-center gap-3">
            <button className="text-xs text-slate-400 hover:text-navy underline" onClick={() => load()} title="Refresh">↻ Refresh</button>
            <button className="text-xs text-slate-400 underline" onClick={() => setShowTasks(false)}>hide</button>
          </div>
        </div>
        {todos.map((t) => (
          <label key={t.id} className="flex items-center gap-2.5 py-1.5 border-b border-slate-50 last:border-0 text-sm cursor-pointer">
            <input type="checkbox" className="accent-navy"
              onChange={async () => {
                await supabase.from("tasks").update({ done: true }).eq("id", t.id);
                setTodos((prev) => prev.filter((x) => x.id !== t.id));
              }} />
            <span className="flex-1">{t.title}</span>
            {t.due_date && (
              <span className={`text-xs ${parseLocalDate(t.due_date) < new Date(new Date().toDateString()) ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                {fmtDate(t.due_date)}{t.due_time ? ` · ${fmtTime(t.due_time)}` : ""}
              </span>
            )}
          </label>
        ))}
        <div className="flex gap-2 mt-2 flex-wrap items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Task</label>
            <input className="field !py-1.5 w-full text-sm" placeholder="Add a task…"
              value={newTask} onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && newTask.trim()) {
                  await supabase.from("tasks").insert({ title: newTask.trim(), due_date: newDue || null, due_time: newTime || null });
                  setNewTask(""); setNewDue(""); setNewTime(""); load();
                }
              }} />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Date <span className="normal-case text-slate-300">(optional)</span></label>
            <input type="date" className="field !py-1.5 w-full text-sm" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 uppercase font-semibold">Time <span className="normal-case text-slate-300">(optional)</span></label>
            <input type="time" className="field !py-1.5 w-full text-sm" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
          </div>
          <button className="btn-primary !py-1.5 !px-4 text-sm"
            onClick={async () => {
              if (!newTask.trim()) return;
              await supabase.from("tasks").insert({ title: newTask.trim(), due_date: newDue || null, due_time: newTime || null });
              setNewTask(""); setNewDue(""); setNewTime(""); load();
            }}>Add</button>
        </div>
      </section>
      )}

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

      <TaskSection title="Needs immediate action" tasks={urgent} accent="bg-red-500" empty="Nothing urgent — nice." />
      <TaskSection title="This week" tasks={week} accent="bg-amber-400" />
      <TaskSection title="Upcoming" tasks={later} accent="bg-emerald-500" />

      {tasks.length === 0 && (
        <div className="card p-12 text-center text-slate-500">
          <p className="text-4xl mb-3">🎉</p>
          <p>No active bookings. Start with a <Link href="/bookings/new" className="text-navy font-semibold underline">new inquiry</Link>.</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card px-5 py-4">
      <div className={`font-display text-3xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function TaskSection({ title, tasks, accent, empty }: { title: string; tasks: Task[]; accent: string; empty?: string }) {
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
