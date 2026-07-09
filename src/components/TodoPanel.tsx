"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  vendor_id?: string | null;
}
interface StaffRow { id: string; name: string; active: boolean; sort_order: number; }
interface VendorRow { id: string; name: string; }
interface BookingLite { id: string; invoice_num: string; contact_name: string; event_date: string | null; event_name?: string | null; event_type?: string | null; }

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
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [bookings, setBookings] = useState<BookingLite[]>([]);
  const [who, setWho] = useState<string>("All");
  const [err, setErr] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [time, setTime] = useState("");
  const [assignee, setAssignee] = useState("");
  const [vendor, setVendor] = useState("");
  const [linkBooking, setLinkBooking] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, { id: string; author: string | null; body: string; created_at: string }[]>>({});
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [noteToast, setNoteToast] = useState<{ task: Todo; bookingName: string | null } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eTitle, setETitle] = useState(""); const [eWho, setEWho] = useState("");
  const [eDate, setEDate] = useState(""); const [eTime, setETime] = useState("");
  const [eVendor, setEVendor] = useState("");
  function startEdit(t: Todo) {
    setEditingId(t.id); setMenuFor(null);
    setETitle(t.title); setEWho(t.assignee ?? "");
    setEDate(t.due_date ?? ""); setETime(t.due_time ?? "");
    setEVendor(t.vendor_id ?? "");
  }
  async function saveEdit(t: Todo) {
    if (!eTitle.trim()) return;
    const { error } = await supabase.from("tasks").update({
      title: eTitle.trim(), assignee: eWho || null, due_date: eDate || null, due_time: eTime || null,
      vendor_id: eVendor || null,
    }).eq("id", t.id);
    if (error) { setErr(`Couldn't save changes: ${error.message}`); return; }
    setEditingId(null); load();
  }
  async function deleteTask(t: Todo) {
    if (!confirm(`Delete "${t.title}"?`)) return;
    await supabase.from("progress_updates").delete().eq("task_id", t.id);
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) { setErr(`Couldn't delete: ${error.message}`); return; }
    setMenuFor(null); setTodos((prev) => prev.filter((x) => x.id !== t.id));
  }
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flashConfirm(msg: string) {
    setConfirmMsg(msg);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmMsg(null), 3500);
  }
  async function openTaskThread(t: Todo) {
    if (!t.booking_id) return; // updates need a booking to live on
    if (openThread === t.id) { setOpenThread(null); return; }
    setOpenThread(t.id);
    const { data } = await supabase.from("progress_updates")
      .select("id,author,body,created_at").eq("task_id", t.id).order("created_at", { ascending: true });
    setThreads((prev) => ({ ...prev, [t.id]: (data ?? []) as { id: string; author: string | null; body: string; created_at: string }[] }));
  }
  async function saveTaskUpdate(t: Todo) {
    const d = draftOf(t.id);
    if (!d.body.trim() || !t.booking_id) return;
    const { error } = await supabase.from("progress_updates").insert({
      booking_id: t.booking_id, invoice_num: t.invoice_num ?? null,
      task_id: t.id, author: d.who || t.assignee || null, body: d.body.trim(),
    });
    if (error) { setErr(`Couldn't save update: ${error.message}`); return; }
    setDrafts((prev) => { const n = { ...prev }; delete n[t.id]; return n; });
    // refresh the thread in place; stays open
    const { data } = await supabase.from("progress_updates")
      .select("id,author,body,created_at").eq("task_id", t.id).order("created_at", { ascending: true });
    setThreads((prev) => ({ ...prev, [t.id]: (data ?? []) as { id: string; author: string | null; body: string; created_at: string }[] }));
  }
  const [drafts, setDrafts] = useState<Record<string, { body: string; who: string }>>({});
  const draftOf = (id: string) => drafts[id] ?? { body: "", who: "" };
  const patchDraft = (id: string, p: Partial<{ body: string; who: string }>) =>
    setDrafts((d) => ({ ...d, [id]: { ...draftOf(id), ...p } }));
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  // Expanding near the bottom must not hide the form below the fold: scroll
  // the NEAREST scrollable ancestor (the rail's own scrollbar, or the page)
  // just enough to reveal it. "nearest" does exactly that.
  useEffect(() => {
    if (showForm) setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 40);
  }, [showForm]);

  const load = useCallback(async () => {
    let q = supabase.from("tasks").select("*").eq("done", false);
    if (bookingId) q = q.eq("booking_id", bookingId);
    const { data, error } = await q.order("due_date", { ascending: true, nullsFirst: false });
    if (error) { setErr(`Tasks: ${error.message} — run the tasks SQL if columns are missing.`); setTodos([]); return; }
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
  // Deep link: /?taskAssignee=Sara filters the rail to Sara (chip navigation).
  useEffect(() => {
    if (bookingId || typeof window === "undefined") return;
    const a = new URLSearchParams(window.location.search).get("taskAssignee");
    if (a) setWho(a);
  }, [bookingId]);
  useEffect(() => {
    supabase.from("staff").select("*").eq("active", true).order("sort_order")
      .then(({ data }) => setStaff((data ?? []) as StaffRow[]));
    // Vendors are optional infrastructure — if the table isn't there yet, the
    // dropdown just doesn't render (see vendors.length > 0 checks below).
    supabase.from("vendors").select("id,name").eq("active", true).order("name")
      .then(({ data, error }) => { if (!error) setVendors((data ?? []) as VendorRow[]); });
    if (!bookingId) {
      supabase.from("bookings").select("id,invoice_num,contact_name,event_date,event_name,event_type")
        .not("status", "in", '("completed","cancelled")').order("event_date")
        .then(({ data }) => setBookings((data ?? []) as BookingLite[]));
    }
  }, [bookingId]);

  // Task cards link to their booking via the `bookings` list above — but that
  // list is scoped to ACTIVE bookings (it also feeds the "attach to booking"
  // dropdown, which must not offer completed events). Debrief tasks always
  // point at COMPLETED events, so they'd never resolve and never render a link.
  // Keep a SEPARATE lookup for referenced bookings; the dropdown is untouched.
  const [linkedBookings, setLinkedBookings] = useState<BookingLite[]>([]);
  useEffect(() => {
    if (bookingId) return;
    const known = new Set([...bookings, ...linkedBookings].map((x) => x.id));
    const missing = Array.from(new Set(
      todos.map((t) => t.booking_id).filter((id): id is string => !!id && !known.has(id))
    ));
    if (!missing.length) return;
    supabase.from("bookings").select("id,invoice_num,contact_name,event_date,event_name,event_type")
      .in("id", missing)
      .then(({ data }) => {
        const extra = (data ?? []) as BookingLite[];
        if (extra.length) setLinkedBookings((prev) => [...prev, ...extra.filter((e) => !prev.some((p) => p.id === e.id))]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, bookingId]);

  // Checkbox resolves completion IMMEDIATELY — no gate. The task leaves the
  // queue at once; if it belongs to a booking, a toast offers an optional note
  // (auto-focused) that lands in that booking's Task Log. Daily Ops keeps no
  // history — only the live confirmation, which fades.
  async function completeTask(t: Todo) {
    const { error } = await supabase.from("tasks")
      .update({ done: true, completed_at: new Date().toISOString() }).eq("id", t.id);
    if (error) { setErr(`Couldn't complete: ${error.message} — run v122_worklog.sql.`); return; }
    setOpenThread(null);
    setTodos((prev) => prev.filter((x) => x.id !== t.id));
    if (t.booking_id) {
      const bk = bookings.find((b) => b.id === t.booking_id);
      setNoteToast({ task: t, bookingName: bk?.contact_name ?? null });
    } else {
      flashConfirm("✓ Task completed");
    }
  }
  async function undoComplete() {
    const nt = noteToast; if (!nt) return;
    await supabase.from("tasks").update({ done: false, completed_at: null }).eq("id", nt.task.id);
    setDrafts((prev) => { const n = { ...prev }; delete n[nt.task.id]; return n; });
    setNoteToast(null);
    load(); // task returns to the live queue
  }
  async function saveToastNote() {
    const nt = noteToast; if (!nt) return;
    const d = draftOf(nt.task.id);
    if (d.body.trim() && nt.task.booking_id) {
      const { error } = await supabase.from("progress_updates").insert({
        booking_id: nt.task.booking_id, invoice_num: nt.task.invoice_num ?? null,
        task_id: nt.task.id, author: d.who || nt.task.assignee || null, body: d.body.trim(),
      });
      if (error) { setErr(`Couldn't save the note: ${error.message}`); return; }
    }
    setDrafts((prev) => { const n = { ...prev }; delete n[nt.task.id]; return n; });
    setNoteToast(null);
  }

  async function add() {
    if (!title.trim()) return;
    const linked = bookingId
      ? { booking_id: bookingId, invoice_num: bookingInvoice ?? null }
      : linkBooking
        ? { booking_id: linkBooking, invoice_num: bookings.find((b) => b.id === linkBooking)?.invoice_num ?? null }
        : { booking_id: null, invoice_num: null };
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(), due_date: due || null, due_time: time || null,
      assignee: assignee || null, vendor_id: vendor || null, ...linked,
    });
    if (error) { setErr(`Couldn't save: ${error.message} — run the tasks SQL if columns are missing.`); return; }
    setTitle(""); setDue(""); setTime(""); setVendor(""); setLinkBooking(""); setErr(""); load();
  }

  const vendorName = (id: string | null | undefined) => id ? (vendors.find((v) => v.id === id)?.name ?? null) : null;

  const bandCounts = useMemo(() => {
    const c = { Overdue: 0, Today: 0, Anytime: 0, Upcoming: 0 };
    for (const t of todos) c[bandOf(t)]++;
    return c;
  }, [todos]);

  const shown = useMemo(() =>
    who === "All" ? todos
      : who === "Unassigned" ? todos.filter((t) => !t.assignee)
      : todos.filter((t) => t.assignee === who),
    [todos, who]);

  // Collapsed-to-a-button when empty (and not on a booking page).
  if (todos.length === 0 && collapsed) {
    return (
      <button className="inline-flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-navy/5 border border-navy/15 rounded-full px-3 py-1 transition-colors" onClick={() => setCollapsed(false)}>
        ＋ Tasks
      </button>
    );
  }

  const rail = variant === "rail";
  return (
    <section className={rail
      ? "rounded-2xl shadow-lg shadow-[#fa8072]/15 ring-1 ring-[#fa8072]/15 bg-gradient-to-b from-[#FFFBFA] via-[#FFF4F0] to-[#FFEDE6] flex flex-col xl:max-h-[calc(100vh-2rem)] overflow-hidden"
      : "card p-4"}>
      {/* ── Zone 1: header + filters (fixed) ── */}
      <div className={rail ? "px-4 pt-4 pb-2 shrink-0" : ""}>
      <div className="flex items-center justify-between mb-1">
        <h2 className={`font-display font-bold text-sm ${rail ? "text-[#7C2D12]" : ""}`}>📝 Tasks{todos.length > 0 ? ` (${todos.length})` : ""}</h2>
        <div className="flex items-center gap-2.5">
          <button className="text-xs text-slate-400 hover:text-navy underline" onClick={load} title="Refresh">↻</button>
          {todos.length === 0 && !bookingId && (
            <button className="text-xs text-slate-400 underline" onClick={() => setCollapsed(true)}>hide</button>
          )}
        </div>
      </div>
      {confirmMsg && (
        <p className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded-lg px-2.5 py-1.5 mb-2 reveal">{confirmMsg}</p>
      )}
      {noteToast && (
        <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 p-2.5 mb-2 reveal">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[11px] font-semibold text-emerald-700">
              ✓ Completed — saved to {noteToast.bookingName ? `${noteToast.bookingName}’s` : "the booking’s"} Task Log
            </span>
            <button className="text-[11px] font-semibold text-slate-500 hover:text-navy underline" onClick={undoComplete}>Undo</button>
          </div>
          <textarea className="field w-full !py-1.5 !text-xs !bg-white" rows={2} autoFocus
            placeholder="Add a note? (optional)"
            value={draftOf(noteToast.task.id).body}
            onChange={(e) => patchDraft(noteToast.task.id, { body: e.target.value })} />
          <div className="flex gap-1.5 items-center flex-wrap mt-1.5">
            <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[90px]"
              value={draftOf(noteToast.task.id).who || noteToast.task.assignee || ""}
              onChange={(e) => patchDraft(noteToast.task.id, { who: e.target.value })}>
              <option value="">Completed by…</option>
              {staff.map((st) => <option key={st.id} value={st.name}>{st.name}</option>)}
            </select>
            <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={saveToastNote}>Save note</button>
            <button className="text-xs text-slate-400 underline"
              onClick={() => { setDrafts((prev) => { const n = { ...prev }; delete n[noteToast.task.id]; return n; }); setNoteToast(null); }}
              title="Task stays completed">Skip</button>
          </div>
        </div>
      )}
      {rail && todos.length > 0 && (
        <p className="text-[11px] text-[#B45309]/70 mb-2">
          {bandCounts.Overdue > 0 && <span className="text-red-600 font-semibold">Overdue {bandCounts.Overdue} • </span>}
          {bandCounts.Today > 0 && <span>Today {bandCounts.Today} • </span>}
          {bandCounts.Anytime > 0 && <span>Anytime {bandCounts.Anytime} • </span>}
          Upcoming {bandCounts.Upcoming}
        </p>
      )}

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
      </div>

      {/* ── Zone 2: task list — the only part that scrolls. Overflow only
          engages when content exceeds the cap, so short lists never show a
          scrollbar and the panel sizes naturally. ── */}
      <div className={rail ? "flex-1 min-h-0 overflow-y-auto px-4" : ""}>
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
            <div className={`flex items-start gap-2.5 p-2.5 mb-2.5 rounded-xl text-sm shadow-sm ${rail
              ? (band === "Overdue" ? "bg-[#FFD3C6]/90 ring-1 ring-[#fa8072]/30"
                : band === "Today" ? "bg-[#FFE7DF]/90 ring-1 ring-[#fa8072]/20"
                : "bg-white ring-1 ring-[#fa8072]/10")
              : (band === "Overdue" ? "bg-red-50 ring-1 ring-red-100"
                : "bg-white ring-1 ring-slate-900/[0.05]")}`}>
              <input type="checkbox" className="accent-emerald-600 mt-0.5 cursor-pointer" checked={false}
                onChange={() => completeTask(t)} title="Complete" />
              <div className="flex-1 min-w-0 space-y-1">
                {editingId === t.id ? (
                  <div className="space-y-1.5">
                    <input className="field w-full !py-1 !text-xs !bg-white" autoFocus value={eTitle}
                      onChange={(e) => setETitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(t); }} />
                    <div className="flex gap-1.5 flex-wrap">
                      <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[80px]" value={eWho} onChange={(e) => setEWho(e.target.value)}>
                        <option value="">Who?</option>
                        {staff.map((st) => <option key={st.id} value={st.name}>{st.name}</option>)}
                      </select>
                      {vendors.length > 0 && (
                        <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[90px]" value={eVendor} onChange={(e) => setEVendor(e.target.value)}>
                          <option value="">No vendor</option>
                          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      )}
                      <input type="date" className="field !py-1 !text-xs !bg-white w-[7rem]" value={eDate} onChange={(e) => setEDate(e.target.value)} />
                      <input type="time" className="field !py-1 !text-xs !bg-white w-[5.5rem]" value={eTime} onChange={(e) => setETime(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-primary !py-0.5 !px-2.5 text-xs" onClick={() => saveEdit(t)}>Save</button>
                      <button className="text-xs text-slate-400 underline" onClick={() => setEditingId(null)}>cancel</button>
                    </div>
                  </div>
                ) : (
                <div className="flex items-start gap-2">
                <button className="font-medium leading-snug text-left flex-1 hover:text-navy transition-colors"
                  onClick={() => openTaskThread(t)}
                  title={t.booking_id ? "Open thread — add an update" : undefined}>{t.title}</button>
                <div className="relative shrink-0">
                  <button className="text-slate-300 hover:text-navy px-0.5 leading-none text-base"
                    title="Task options" onClick={() => setMenuFor(menuFor === t.id ? null : t.id)}>⋯</button>
                  {menuFor === t.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                      <div className="absolute right-0 top-5 z-20 w-36 rounded-lg bg-white shadow-lg ring-1 ring-slate-200 py-1 text-xs reveal">
                        <button className="w-full text-left px-3 py-1.5 hover:bg-slate-50" onClick={() => startEdit(t)}>Edit task</button>
                        <button className="w-full text-left px-3 py-1.5 hover:bg-slate-50" onClick={() => startEdit(t)}>Change assignee</button>
                        <button className="w-full text-left px-3 py-1.5 hover:bg-slate-50" onClick={() => startEdit(t)}>Change due date</button>
                        <div className="h-px bg-slate-100 my-1" />
                        <button className="w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50" onClick={() => deleteTask(t)}>Delete task</button>
                      </div>
                    </>
                  )}
                </div>
                </div>
                )}
                {openThread === t.id && (
                  <div className="mt-1 pl-2 border-l-2 border-slate-200 space-y-1.5 reveal">
                    {(threads[t.id] ?? []).map((u) => (
                      <div key={u.id}>
                        <div className="text-[10px] text-slate-400">
                          {u.author && <b className="font-semibold text-slate-500">{u.author}</b>}{u.author ? " · " : ""}{fmtDate(u.created_at.slice(0, 10))}
                        </div>
                        <div className="text-[12px] leading-snug whitespace-pre-wrap">{u.body}</div>
                      </div>
                    ))}
                    <textarea className="field w-full !py-1.5 !text-xs !bg-white" rows={2} autoFocus
                      placeholder="Progress while it's still open…"
                      value={draftOf(t.id).body} onChange={(e) => patchDraft(t.id, { body: e.target.value })} />
                    <div className="flex gap-1.5 items-center flex-wrap">
                      <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[90px]"
                        value={draftOf(t.id).who || t.assignee || ""}
                        onChange={(e) => patchDraft(t.id, { who: e.target.value })}>
                        <option value="">Who?</option>
                        {staff.map((st) => <option key={st.id} value={st.name}>{st.name}</option>)}
                      </select>
                      <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={() => saveTaskUpdate(t)}>Save Update</button>
                      <button className="text-xs text-slate-400 underline" onClick={() => setOpenThread(null)}>×</button>
                    </div>
                  </div>
                )}
                {t.booking_id && !bookingId && (() => {
                  // Look in both lists: active bookings AND the separately
                  // fetched ones this task references (e.g. completed events).
                  const bk = bookings.find((b) => b.id === t.booking_id)
                    ?? linkedBookings.find((b) => b.id === t.booking_id);
                  if (!bk) return null;
                  const ev = bk.event_name || bk.event_type;
                  return (
                    <Link href={`/bookings/${t.booking_id}`}
                      className="block text-[12px] font-semibold text-navy hover:underline leading-snug">
                      {bk.contact_name}{ev ? <span className="text-slate-400 font-normal"> — {ev}</span> : null}
                    </Link>
                  );
                })()}
                {(t.assignee || t.vendor_id || t.due_date || (t.booking_id && !bookingId)) && (
                  <div className={`text-[11px] ${overdue ? "text-red-600" : "text-slate-400"}`}>
                    {[
                      t.booking_id && !bookingId && t.invoice_num ? `#${t.invoice_num}` : null,
                      t.assignee ?? null,
                      t.vendor_id && vendorName(t.vendor_id) ? `🏷️ ${vendorName(t.vendor_id)}` : null,
                      t.due_date ? `${fmtDate(t.due_date)}${t.due_time ? ` ${fmtTime(t.due_time)}` : ""}${overdue ? " • OVERDUE" : ""}` : null,
                    ].filter(Boolean).join(" • ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {rail && shown.length > 3 && (
        <div className="sticky bottom-0 h-5 -mx-4 bg-gradient-to-t from-[#FFEDE6] to-transparent pointer-events-none" />
      )}
      </div>

      {/* ── Zone 3: pinned footer — New Task always reachable ── */}
      <div className={rail ? "px-4 pb-4 pt-2 shrink-0 border-t border-[#fa8072]/10" : ""}>
      {/* Add form: on the rail it's the darkest salmon section, always present.
          Embedded (booking page) it hides behind an "＋ New Task" chip. */}
      {!showForm ? (
        <div className="mt-3">
          <button
            className="inline-flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-navy/5 border border-navy/15 rounded-full px-3 py-1 transition-colors"
            onClick={() => setShowForm(true)}>
            ＋ New Task
          </button>
        </div>
      ) : (
      <div ref={formRef} className={`mt-3 space-y-1.5 rounded-xl p-2.5 ${rail ? "bg-[#F8C9BA]/60 ring-1 ring-[#fa8072]/20" : "bg-slate-50 ring-1 ring-slate-100"}`}>
        <input className="field !py-1.5 w-full text-sm !bg-white" placeholder={bookingId ? "Add a task for this booking…" : "Add a task…"}
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
          {vendors.length > 0 && (
            <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[110px]" value={vendor} onChange={(e) => setVendor(e.target.value)} title="Vendor">
              <option value="">No vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {!bookingId && (
            <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[130px] max-w-[170px]" value={linkBooking} onChange={(e) => setLinkBooking(e.target.value)} title="Link to a booking (optional)">
              <option value="">🔗 No booking</option>
              {bookings.map((b) => <option key={b.id} value={b.id}>#{b.invoice_num} {b.contact_name}</option>)}
            </select>
          )}
          <button className="btn-primary !py-1 !px-3.5 text-xs" onClick={add}>Add</button>
          <button className="text-xs text-slate-400 underline" onClick={() => setShowForm(false)}>cancel</button>
        </div>
        <p className={`text-[10px] ${rail ? "text-[#B45309]/60" : "text-slate-300"}`}>Date/time = due by (deadline). Leave blank for “anytime”.</p>
      </div>
      )}
      {err && <p className="text-red-600 text-xs mt-2">{err}</p>}
      </div>
    </section>
  );
}
