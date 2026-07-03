"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmtDate, fmtTime, parseLocalDate } from "@/lib/workflow";

/** The general To-Do list ("to-do", deliberately — distinct from booking
 *  workflow tasks). Renders in two homes with the same data:
 *  - Daily Ops right rail (all to-dos, filterable by assignee)
 *  - a booking's page (only that booking's to-dos, new ones pre-linked)
 *  A to-do may link to a booking (two-way: jump from the to-do, and it shows
 *  on that booking). Date/time is a DEADLINE ("due by") — early completion is
 *  the normal case; overdue is date past, or time passed today. */

interface Todo {
  id: string; title: string; due_date: string | null; due_time: string | null;
  done: boolean; booking_id?: string | null; invoice_num?: string | null; assignee?: string | null;
}
interface StaffRow { id: string; name: string; active: boolean; sort_order: number; }
interface BookingLite { id: string; invoice_num: string; contact_name: string; event_date: string | null; }

function dueDateTime(t: Todo): Date | null {
  if (!t.due_date) return null;
  const d = parseLocalDate(t.due_date);
  if (t.due_time) { const [h, m] = t.due_time.split(":").map(Number); d.setHours(h, m, 0, 0); }
  else d.setHours(23, 59, 59, 0);
  return d;
}
function bandOf(t: Todo): "Overdue" | "Today" | "Anytime" | "Upcoming" {
  if (!t.due_date) return "Anytime";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = parseLocalDate(t.due_date); d.setHours(0, 0, 0, 0);
  if (d < today) return "Overdue";
  if (d.getTime() === today.getTime()) return "Today";
  return "Upcoming";
}
const BAND_ORDER = { Overdue: 0, Today: 1, Anytime: 2, Upcoming: 3 } as const;

export default function TodoPanel({ bookingId, bookingInvoice, onOverdueCount, variant = "rail" }: {
  bookingId?: string; bookingInvoice?: string;
  onOverdueCount?: (n: number) => void;
  /** "rail" = Daily Ops right rail (salmon workspace, entry form always visible).
   *  "embedded" = inside a booking page (neutral, list-first, form behind a button). */
  variant?: "rail" | "embedded";
}) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [bookings, setBookings] = useState<BookingLite[]>([]);
  const [who, setWho] = useState<string>("All");
  const [err, setErr] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [time, setTime] = useState("");
  const [assignee, setAssignee] = useState("");
  const [linkBooking, setLinkBooking] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [showForm, setShowForm] = useState(variant === "rail");

  const load = useCallback(async () => {
    let q = supabase.from("tasks").select("*").eq("done", false);
    if (bookingId) q = q.eq("booking_id", bookingId);
    const { data, error } = await q.order("due_date", { ascending: true, nullsFirst: false });
    if (error) { setErr(`To-dos: ${error.message} — run the to-do SQL if columns are missing.`); setTodos([]); return; }
    const rows = (data ?? []) as Todo[];
    rows.sort((a, b) => {
      const ra = BAND_ORDER[bandOf(a)], rb = BAND_ORDER[bandOf(b)];
      if (ra !== rb) return ra - rb;
      const ka = `${a.due_date ?? "0000-00-00"}T${a.due_time ?? "99:99"}`;
      const kb = `${b.due_date ?? "0000-00-00"}T${b.due_time ?? "99:99"}`;
      return ka.localeCompare(kb);
    });
    setErr(""); setTodos(rows);
    if (onOverdueCount) {
      const now = new Date();
      onOverdueCount(rows.filter((t) => { const d = dueDateTime(t); return d !== null && d < now; }).length);
    }
  }, [bookingId, onOverdueCount]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.from("staff").select("*").eq("active", true).order("sort_order")
      .then(({ data }) => setStaff((data ?? []) as StaffRow[]));
    if (!bookingId) {
      supabase.from("bookings").select("id,invoice_num,contact_name,event_date")
        .not("status", "in", '("completed","cancelled")').order("event_date")
        .then(({ data }) => setBookings((data ?? []) as BookingLite[]));
    }
  }, [bookingId]);

  async function add() {
    if (!title.trim()) return;
    const linked = bookingId
      ? { booking_id: bookingId, invoice_num: bookingInvoice ?? null }
      : linkBooking
        ? { booking_id: linkBooking, invoice_num: bookings.find((b) => b.id === linkBooking)?.invoice_num ?? null }
        : { booking_id: null, invoice_num: null };
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(), due_date: due || null, due_time: time || null,
      assignee: assignee || null, ...linked,
    });
    if (error) { setErr(`Couldn't save: ${error.message} — run the to-do SQL if columns are missing.`); return; }
    setTitle(""); setDue(""); setTime(""); setLinkBooking(""); setErr(""); load();
  }

  const shown = useMemo(() =>
    who === "All" ? todos
      : who === "Unassigned" ? todos.filter((t) => !t.assignee)
      : todos.filter((t) => t.assignee === who),
    [todos, who]);

  // Collapsed-to-a-button when empty (and not on a booking page).
  if (todos.length === 0 && collapsed) {
    return (
      <button className="inline-flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-navy/5 border border-navy/15 rounded-full px-3 py-1 transition-colors" onClick={() => setCollapsed(false)}>
        ＋ To-Do List
      </button>
    );
  }

  const rail = variant === "rail";
  return (
    <section className={rail
      ? "rounded-2xl p-4 shadow-lg shadow-[#fa8072]/20 ring-1 ring-[#fa8072]/15 bg-gradient-to-b from-[#FFF6F3] via-[#FFEDE7] to-[#FFE3DA]"
      : "card p-4"}>
      <div className="flex items-center justify-between mb-2">
        <h2 className={`font-display font-bold text-sm ${rail ? "text-[#7C2D12]" : ""}`}>📝 To-Do List{todos.length > 0 ? ` (${todos.length})` : ""}</h2>
        <div className="flex items-center gap-2.5">
          <button className="text-xs text-slate-400 hover:text-navy underline" onClick={load} title="Refresh">↻</button>
          {todos.length === 0 && !bookingId && (
            <button className="text-xs text-slate-400 underline" onClick={() => setCollapsed(true)}>hide</button>
          )}
        </div>
      </div>

      {/* Assignee filter (only where the whole list shows) */}
      {!bookingId && (staff.length > 0 || todos.some((t) => t.assignee)) && (
        <div className="flex gap-1.5 flex-wrap mb-2">
          {["All", ...staff.map((s) => s.name), "Unassigned"].map((n) => (
            <button key={n} onClick={() => setWho(n)}
              className={`text-[10px] px-2 py-0.5 rounded-full border ${who === n ? "bg-navy text-white border-navy" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              {n}
            </button>
          ))}
        </div>
      )}

      {shown.map((t, idx) => {
        const band = bandOf(t);
        const showHeader = idx === 0 || bandOf(shown[idx - 1]) !== band;
        const headColor = band === "Overdue" ? "text-red-600" : band === "Today" ? (rail ? "text-[#9A3412]" : "text-navy") : (rail ? "text-[#C2724F]" : "text-slate-400");
        const d = dueDateTime(t);
        const overdue = d !== null && d < new Date();
        return (
          <div key={t.id}>
            {showHeader && (
              <div className={`text-[10px] font-bold uppercase tracking-wider mt-2 mb-0.5 ${headColor}`}>{band}</div>
            )}
            <div className={`flex items-start gap-2 py-1.5 px-2 rounded-lg text-sm ${rail
              ? (idx % 2 === 0 ? "bg-white/55" : "bg-[#FFD9CE]/45")
              : (idx % 2 === 0 ? "bg-white" : "bg-slate-50/70")}`}>
              <input type="checkbox" className="accent-navy mt-0.5"
                onChange={async () => {
                  await supabase.from("tasks").update({ done: true }).eq("id", t.id);
                  setTodos((prev) => prev.filter((x) => x.id !== t.id));
                }} />
              <div className="flex-1 min-w-0">
                <div className="truncate">{t.title}</div>
                <div className="text-[11px] text-slate-400 flex gap-2 flex-wrap">
                  {t.booking_id && !bookingId && (
                    <Link href={`/bookings/${t.booking_id}`} className="text-navy underline">
                      #{t.invoice_num ?? "booking"} →
                    </Link>
                  )}
                  {t.assignee && <span>👤 {t.assignee}</span>}
                  {t.due_date && (
                    <span className={overdue ? "text-red-600 font-semibold" : ""}>
                      {fmtDate(t.due_date)}{t.due_time ? ` · by ${fmtTime(t.due_time)}` : ""}{overdue ? " · OVERDUE" : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add form: on the rail it's the darkest salmon section, always present.
          Embedded (booking page) it hides behind an "＋ Add To-Do" chip. */}
      {!showForm ? (
        <div className="mt-3">
          <button
            className="inline-flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-navy/5 border border-navy/15 rounded-full px-3 py-1 transition-colors"
            onClick={() => setShowForm(true)}>
            ＋ Add To-Do
          </button>
        </div>
      ) : (
      <div className={`mt-3 space-y-1.5 rounded-xl p-2.5 ${rail ? "bg-[#F9BFAE]/70 ring-1 ring-[#fa8072]/25" : "bg-slate-50 ring-1 ring-slate-100"}`}>
        <input className="field !py-1.5 w-full text-sm !bg-white" placeholder={bookingId ? "Add a to-do for this booking…" : "Add a to-do…"}
          value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <div className="grid grid-cols-2 gap-1.5">
          <input type="date" className="field !py-1 !text-xs !bg-white" value={due} onChange={(e) => setDue(e.target.value)} title="Due date (optional)" />
          <input type="time" className="field !py-1 !text-xs !bg-white" value={time} onChange={(e) => setTime(e.target.value)} title="Due-by time (optional)" />
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[110px]" value={assignee} onChange={(e) => setAssignee(e.target.value)} title="Assignee">
            <option value="">👤 Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          {!bookingId && (
            <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[130px] max-w-[170px]" value={linkBooking} onChange={(e) => setLinkBooking(e.target.value)} title="Link to a booking (optional)">
              <option value="">🔗 No booking</option>
              {bookings.map((b) => <option key={b.id} value={b.id}>#{b.invoice_num} {b.contact_name}</option>)}
            </select>
          )}
          <button className="btn-primary !py-1 !px-3.5 text-xs" onClick={add}>Add</button>
          {!rail && (
            <button className="text-xs text-slate-400 underline" onClick={() => setShowForm(false)}>cancel</button>
          )}
        </div>
        <p className={`text-[10px] ${rail ? "text-[#B45309]/60" : "text-slate-300"}`}>Date/time = due by (deadline). Leave blank for “anytime”.</p>
      </div>
      )}
      {err && <p className="text-red-600 text-xs mt-2">{err}</p>}
    </section>
  );
}
