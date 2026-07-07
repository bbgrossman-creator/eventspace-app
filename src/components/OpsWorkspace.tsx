"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { sentenceCase } from "@/lib/format";
import { Booking, fmtTime, parseLocalDate } from "@/lib/workflow";

/* ── Row shapes ── */
interface TaskRow {
  id: string; title: string; due_date: string | null; due_time: string | null;
  done: boolean; booking_id?: string | null; invoice_num?: string | null;
  assignee?: string | null; completed_at?: string | null; vendor_id?: string | null;
}
interface VendorRow { id: string; name: string; }
interface UpdateRow { id: string; author: string | null; body: string; task_id: string | null; created_at: string; }
interface StaffRow { id: string; name: string; }


function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(key: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function stamp(iso: string): string {
  const clock = new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dayLabel(dayKey(iso))} · ${clock}`;
}
function dueChip(t: TaskRow): { text: string; overdue: boolean } | null {
  if (!t.due_date) return null;
  const d = parseLocalDate(t.due_date); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  const time = t.due_time ? " " + fmtTime(t.due_time) : "";
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (diff < 0) return { text: md, overdue: true };
  if (diff === 0) return { text: `Today${time}`, overdue: false };
  if (diff === 1) return { text: `Tomorrow${time}`, overdue: false };
  return { text: `${md}${time}`, overdue: false };
}

function Chip({ children, tone = "" }: { children: React.ReactNode; tone?: string }) {
  return (
    <span className={`inline-block text-[11px] font-medium rounded-md px-1.5 py-0.5 ${tone || "bg-slate-100 text-slate-500"}`}>
      {children}
    </span>
  );
}

function Card({ title, icon, action, onAction, accent = "plain", children }: {
  title: string; icon: React.ReactNode; action?: string; onAction?: () => void;
  accent?: "plain" | "feeder" | "cool"; children: React.ReactNode;
}) {
  // One skeleton, four personalities — shared radius/shadow/padding; the accent
  // is the header icon tile + ring tint, so the widgets are instantly
  // distinguishable but obviously siblings.
  //   feeder (Tasks) = warm peach: "this is where you work"
  //   cool (Task Log / Touchpoints) = blue-gray: "this is record / schedule"
  //   plain (Communication) = neutral slate: "customer memory"
  const shell = accent === "feeder"
    ? "bg-[#FFF9F6] ring-1 ring-[#F3DAce]"
    : accent === "cool"
    ? "bg-white ring-1 ring-[#E4E9F1]"
    : "bg-white ring-1 ring-[#E6EAF2]";
  const tile = accent === "feeder"
    ? "bg-[#FBE4D8] text-[#B5623B]"
    : accent === "cool"
    ? "bg-[#E7EDF6] text-[#4C6285]"
    : "bg-[#EAECF3] text-[#465069]";
  return (
    <div className={`rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] ${shell}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`grid place-items-center w-6 h-6 rounded-lg text-[13px] shrink-0 ${tile}`}>{icon}</span>
          <h3 className="font-display font-semibold text-[15px] leading-none truncate">{title}</h3>
        </div>
        {action && onAction && (
          <button className="text-xs font-medium text-slate-400 hover:text-navy transition-colors whitespace-nowrap shrink-0"
            onClick={onAction}>＋ {action}</button>
        )}
      </div>
      {children}
    </div>
  );
}

/** Refined empty state: soft icon + headline + one supporting line. */
function Empty({ icon, head, sub }: { icon: React.ReactNode; head: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      <span className="text-[17px] opacity-40 shrink-0 leading-none mt-0.5">{icon}</span>
      <div>
        <p className="text-[13px] font-medium text-slate-500 leading-snug">{head}</p>
        {sub && <p className="text-[12px] text-slate-400 leading-snug mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/** The Workspace: three sections, one mental model.
 *  Still needs doing? → Task. Done? → Task Log. Scheduled? → Touchpoint.
 *  (Permanent customer facts live on the Customer Profile.)
 *  Completing a task moves it — with its explanation — into the Task Log,
 *  so the execution history writes itself. */
export default function OpsWorkspace({ b, refreshKey = 0 }: { b: Booking; refreshKey?: number }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [err, setErr] = useState("");

  const [taskEditor, setTaskEditor] = useState(false);
  const [tTitle, setTTitle] = useState(""); const [tWho, setTWho] = useState("");
  const [tDate, setTDate] = useState(""); const [tTime, setTTime] = useState("");
  const [tVendor, setTVendor] = useState("");
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [updateFor, setUpdateFor] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [noteChannel, setNoteChannel] = useState<string>("internal"); // internal|call|email|text

  const [menuFor, setMenuFor] = useState<string | null>(null);         // open ⋯ menu
  const [editingTask, setEditingTask] = useState<string | null>(null); // inline edit row
  const [eTitle, setETitle] = useState(""); const [eWho, setEWho] = useState("");
  const [eDate, setEDate] = useState(""); const [eTime, setETime] = useState("");
  const [eVendor, setEVendor] = useState("");
  const pendingRef = useRef<HTMLDivElement>(null);
  // The Task Log "expands" to receive the task: bring the pending entry into
  // view so the eye follows the task into history.
  useEffect(() => {
    if (completing) setTimeout(() => pendingRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
  }, [completing]);
  // Each task owns its own draft — no shared textarea state across tasks.
  const [drafts, setDrafts] = useState<Record<string, { body: string; who: string }>>({});
  const draftOf = (id: string) => drafts[id] ?? { body: "", who: "" };
  const patchDraft = (id: string, p: Partial<{ body: string; who: string }>) =>
    setDrafts((d) => ({ ...d, [id]: { ...draftOf(id), ...p } }));
  const clearDraft = (id: string) =>
    setDrafts((prev) => { const n = { ...prev }; delete n[id]; return n; });

  const load = useCallback(async () => {
    const [k, u, st, vn] = await Promise.all([
      supabase.from("tasks").select("*").eq("booking_id", b.id).order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("progress_updates").select("*").eq("booking_id", b.id).order("created_at", { ascending: true }),
      supabase.from("staff").select("id,name").eq("active", true).order("sort_order"),
      supabase.from("vendors").select("id,name").eq("active", true).order("name"),
    ]);
    const e = k.error ?? u.error;
    if (e) { setErr(`Workspace couldn't load: ${e.message}${u.error ? " — run v119_ops.sql" : ""}${k.error?.message.includes("completed_at") ? " — run v122_worklog.sql" : ""}.`); return; }
    setErr("");
    setTasks((k.data ?? []) as TaskRow[]);
    setUpdates((u.data ?? []) as UpdateRow[]);
    setStaff((st.data ?? []) as StaffRow[]);
    // Vendors are optional infrastructure — if the table isn't there yet, the
    // feature simply stays hidden rather than breaking the whole workspace.
    if (!vn.error) setVendors((vn.data ?? []) as VendorRow[]);
  }, [b.id]);
  useEffect(() => { load(); }, [load, refreshKey]);

  /* ── mutations ── */
  async function addTask() {
    if (!tTitle.trim()) return;
    const { error } = await supabase.from("tasks").insert({
      booking_id: b.id, invoice_num: b.invoice_num, title: tTitle.trim(),
      assignee: tWho || null, due_date: tDate || null, due_time: tTime || null, done: false,
      vendor_id: tVendor || null,
    });
    if (error) { setErr(`Couldn't create task: ${error.message}`); return; }
    setTTitle(""); setTWho(""); setTDate(""); setTTime(""); setTVendor(""); setTaskEditor(false); load();
  }
  // The checkbox resolves completion IMMEDIATELY — done + completed_at written
  // before anything is asked. The note composer then opens in the Task Log to
  // document a task that is already finished. Note never gates completion.
  async function completeNow(task: TaskRow) {
    const { error } = await supabase.from("tasks")
      .update({ done: true, completed_at: new Date().toISOString() }).eq("id", task.id);
    if (error) { setErr(`Couldn't complete: ${error.message} — run v122_worklog.sql.`); return; }
    setOpenThread(null); setUpdateFor(null);
    setCompleting(task.id);   // marks it as the freshly-landed Task Log entry, composer open
    load();
  }
  async function saveNote(task: TaskRow) {
    const d = draftOf(task.id);
    if (d.body.trim()) {
      if (noteChannel === "internal") {
        // Team-facing → Task Log, exactly as before.
        const { error } = await supabase.from("progress_updates").insert({
          booking_id: b.id, invoice_num: b.invoice_num, task_id: task.id,
          author: d.who || task.assignee || null, body: d.body.trim(),
        });
        if (error) { setErr(`Couldn't save note: ${error.message}`); return; }
      } else {
        // Customer-facing → Communications, carrying the task reference.
        const { error } = await supabase.from("communications").insert({
          booking_id: b.id, invoice_num: b.invoice_num, task_id: task.id,
          channel: noteChannel, direction: "outbound",
          author: d.who || task.assignee || null, body: d.body.trim(), source: "manual",
        });
        if (error) { setErr(`Couldn't log communication: ${error.message} — run v129_communications.sql.`); return; }
      }
    }
    clearDraft(task.id); setCompleting(null); setNoteChannel("internal"); load();
  }
  async function addUpdate(task: TaskRow) {
    const d = draftOf(task.id);
    if (!d.body.trim()) return;
    const { error } = await supabase.from("progress_updates").insert({
      booking_id: b.id, invoice_num: b.invoice_num, task_id: task.id,
      author: d.who || task.assignee || null, body: d.body.trim(),
    });
    if (error) { setErr(`Couldn't save update: ${error.message}`); return; }
    clearDraft(task.id); setUpdateFor(null); load();
  }
  async function reopen(task: TaskRow) {
    await supabase.from("tasks").update({ done: false, completed_at: null }).eq("id", task.id);
    await supabase.from("progress_updates").insert({
      booking_id: b.id, invoice_num: b.invoice_num, task_id: task.id,
      author: null, body: "↩︎ Task reopened",
    });
    if (completing === task.id) setCompleting(null);
    load();
  }
  function startEdit(t: TaskRow) {
    setEditingTask(t.id); setMenuFor(null);
    setETitle(t.title); setEWho(t.assignee ?? "");
    setEDate(t.due_date ?? ""); setETime(t.due_time ?? ""); setEVendor(t.vendor_id ?? "");
  }
  async function saveEdit(t: TaskRow) {
    if (!eTitle.trim()) return;
    const { error } = await supabase.from("tasks").update({
      title: eTitle.trim(), assignee: eWho || null,
      due_date: eDate || null, due_time: eTime || null, vendor_id: eVendor || null,
    }).eq("id", t.id);
    if (error) { setErr(`Couldn't save changes: ${error.message}`); return; }
    setEditingTask(null); load();
  }
  async function deleteTask(t: TaskRow) {
    if (!confirm(`Delete "${t.title}"? This removes the task and its update thread.`)) return;
    await supabase.from("progress_updates").delete().eq("task_id", t.id);
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) { setErr(`Couldn't delete: ${error.message}`); return; }
    setMenuFor(null); load();
  }

  /* ── derived ── */
  const threadFor = (taskId: string) => updates.filter((u) => u.task_id === taskId);
  const openTasks = tasks.filter((t) => !t.done);
  const vendorName = (id: string | null | undefined) => id ? (vendors.find((v) => v.id === id)?.name ?? null) : null;
  // The just-completed task: already done, note composer still open on it.
  const completingTask = tasks.find((t) => t.id === completing && t.done) ?? null;
  const logTasks = tasks.filter((t) => t.done).slice().sort((a, z) => {
    const at = a.completed_at ?? threadFor(a.id).slice(-1)[0]?.created_at ?? "";
    const zt = z.completed_at ?? threadFor(z.id).slice(-1)[0]?.created_at ?? "";
    return zt.localeCompare(at);
  });
  return (
    <div>
      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-3">⚠️ {err}</p>}

      <div className="space-y-3">
        {/* ═══ Tasks — still needs doing ═══ */}
        <Card title="Tasks" icon="○" accent="feeder" action="New Task" onAction={() => setTaskEditor((v) => !v)}>
          {taskEditor && (
            <div className="rounded-lg bg-slate-50 p-2.5 mb-3 space-y-1.5 reveal">
              <input className="field w-full !py-1.5 text-sm" autoFocus placeholder="What needs doing?"
                value={tTitle} onChange={(e) => setTTitle(e.target.value)}
                onBlur={(e) => setTTitle(sentenceCase(e.target.value))}
                onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} />
              <div className="flex gap-1.5 flex-wrap">
                <select className="field !py-1 !text-xs flex-1 min-w-[90px]" value={tWho} onChange={(e) => setTWho(e.target.value)}>
                  <option value="">Who?</option>
                  {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <input type="date" className="field !py-1 !text-xs w-[7.5rem]" value={tDate} onChange={(e) => setTDate(e.target.value)} />
                <input type="time" className="field !py-1 !text-xs w-[5.5rem]" value={tTime} onChange={(e) => setTTime(e.target.value)} />
              </div>
              {vendors.length > 0 && (
                <select className="field !py-1 !text-xs w-full" value={tVendor} onChange={(e) => setTVendor(e.target.value)}>
                  <option value="">Vendor (optional)…</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
              <div className="flex gap-2">
                <button className="btn-primary !py-1 !px-3 text-xs" onClick={addTask}>Add</button>
                <button className="text-xs text-slate-400 underline" onClick={() => setTaskEditor(false)}>cancel</button>
              </div>
            </div>
          )}
          {openTasks.length === 0 && !taskEditor && (
            <Empty icon="○" head="The queue is clear." sub="New tasks and follow-ups will appear here." />
          )}
          <div className="space-y-3">
            {openTasks.map((t) => {
              const due = dueChip(t);
              const th = threadFor(t.id);
              const expanded = openThread === t.id;
              return (
                <div key={t.id}>
                  {editingTask === t.id ? (
                    <div className="rounded-lg bg-slate-50 p-2.5 space-y-1.5 reveal">
                      <input className="field w-full !py-1.5 text-sm" autoFocus value={eTitle}
                        onChange={(e) => setETitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(t); }} />
                      <div className="flex gap-1.5 flex-wrap">
                        <select className="field !py-1 !text-xs flex-1 min-w-[90px]" value={eWho} onChange={(e) => setEWho(e.target.value)}>
                          <option value="">Who?</option>
                          {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                        <input type="date" className="field !py-1 !text-xs w-[7.5rem]" value={eDate} onChange={(e) => setEDate(e.target.value)} />
                        <input type="time" className="field !py-1 !text-xs w-[5.5rem]" value={eTime} onChange={(e) => setETime(e.target.value)} />
                      </div>
                      {vendors.length > 0 && (
                        <select className="field !py-1 !text-xs w-full" value={eVendor} onChange={(e) => setEVendor(e.target.value)}>
                          <option value="">Vendor (optional)…</option>
                          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      )}
                      <div className="flex gap-2">
                        <button className="btn-primary !py-1 !px-3 text-xs" onClick={() => saveEdit(t)}>Save</button>
                        <button className="text-xs text-slate-400 underline" onClick={() => setEditingTask(null)}>cancel</button>
                      </div>
                    </div>
                  ) : (
                  <div className="flex items-start gap-2.5">
                    <button className="mt-[3px] w-4 h-4 rounded border-2 border-slate-300 hover:border-navy hover:bg-emerald-50 shrink-0 transition-colors"
                      title="Complete" onClick={() => completeNow(t)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                      <button className="text-left flex-1 group"
                        onClick={() => {
                          // Click task = update it: expand the thread with the
                          // composer ready. Checkbox = complete — never this.
                          if (expanded) { setOpenThread(null); setUpdateFor(null); }
                          else { setOpenThread(t.id); setUpdateFor(t.id); setCompleting(null); }
                        }}>
                        <span className="text-[15px] font-medium leading-snug group-hover:text-navy transition-colors">{t.title}</span>
                      </button>
                      {/* ⋯ menu owns the task-as-object: rename, reassign, reschedule, delete */}
                      <div className="relative shrink-0">
                        <button className="text-slate-300 hover:text-navy px-1 leading-none text-lg"
                          title="Task options" onClick={() => setMenuFor(menuFor === t.id ? null : t.id)}>⋯</button>
                        {menuFor === t.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                            <div className="absolute right-0 top-6 z-20 w-40 rounded-lg bg-white shadow-lg ring-1 ring-slate-200 py-1 text-sm reveal">
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
                      {(t.assignee || t.vendor_id || due || th.length > 0) && (
                        <div className="flex gap-1.5 flex-wrap mt-1">
                          {t.assignee && (
                            <Link href={`/?taskAssignee=${encodeURIComponent(t.assignee)}`} title={`See ${t.assignee}'s tasks on Daily Ops`}>
                              <Chip tone="bg-slate-100 text-slate-500 hover:bg-navy hover:text-white transition-colors cursor-pointer">{t.assignee}</Chip>
                            </Link>
                          )}
                          {t.vendor_id && vendorName(t.vendor_id) && (
                            <Chip tone="bg-amber-50 text-amber-700" >🏷️ {vendorName(t.vendor_id)}</Chip>
                          )}
                          {due && (
                            <Link href={`/calendar?week=${t.due_date}`} title="See that week on the calendar">
                              <Chip tone={`${due.overdue ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"} hover:bg-navy hover:text-white transition-colors cursor-pointer`}>{due.text}</Chip>
                            </Link>
                          )}
                          {th.length > 0 && (
                            <button onClick={() => setOpenThread(expanded ? null : t.id)}>
                              <Chip tone="bg-navy/5 text-navy">{expanded ? "▴" : "▾"} updates ({th.length})</Chip>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Thread + mid-flight updates */}
                      {expanded && completing !== t.id && (
                        <div className="mt-1.5 ml-1 pl-3 border-l-2 border-slate-100 space-y-2 reveal">
                          {th.map((u) => (
                            <div key={u.id}>
                              <div className="text-[11px] text-slate-400">
                                {u.author && <b className="font-semibold text-slate-500">{u.author}</b>}{u.author ? " · " : ""}{stamp(u.created_at)}
                              </div>
                              <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{u.body}</div>
                            </div>
                          ))}
                          {updateFor === t.id ? (
                            <div className="space-y-1.5 reveal">
                              <textarea className="field w-full !py-1.5 text-[13px] !bg-white" rows={2} autoFocus
                                placeholder="Progress while it's still open…" value={draftOf(t.id).body}
                                onChange={(e) => patchDraft(t.id, { body: e.target.value })} />
                              <div className="flex gap-1.5 items-center">
                                <select className="field !py-1 !text-xs !bg-white flex-1" value={draftOf(t.id).who || t.assignee || ""}
                                  onChange={(e) => patchDraft(t.id, { who: e.target.value })}>
                                  <option value="">Who?</option>
                                  {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                                </select>
                                <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={() => addUpdate(t)}>Save Update</button>
                                <button className="text-xs text-slate-400 underline" onClick={() => setUpdateFor(null)}>×</button>
                              </div>
                            </div>
                          ) : (
                            <button className="text-[11px] text-slate-400 hover:text-navy transition-colors"
                              onClick={() => setUpdateFor(t.id)}>＋ add update</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ═══ Task Log — the execution history, written by finishing work ═══ */}
        <Card title="Task Log" icon="✓" accent="cool">
          {completingTask && (
            <div ref={pendingRef} className="rounded-lg bg-emerald-50/60 ring-1 ring-emerald-200 p-2.5 mb-3 reveal">
              <div className="text-[14px] font-medium leading-snug">
                <span className="text-emerald-600 mr-1.5">✓</span>{completingTask.title}
              </div>
              <div className="flex gap-1.5 mt-1 mb-2 items-center">
                <Chip tone="bg-emerald-100 text-emerald-700">Completed just now</Chip>
                <button className="text-[11px] text-slate-400 hover:text-navy underline" onClick={() => reopen(completingTask)}>Reopen</button>
              </div>
              <div className="text-[11px] font-semibold text-slate-500 mb-1">Add a note</div>
              <div className="flex gap-1 flex-wrap mb-1.5">
                {[
                  { v: "internal", l: "Internal" }, { v: "call", l: "☎ Call" },
                  { v: "email", l: "📧 Email" }, { v: "text", l: "💬 Text" },
                ].map((c) => (
                  <button key={c.v}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${noteChannel === c.v
                      ? "bg-navy text-white border-navy" : "border-slate-200 text-slate-500 hover:bg-white"}`}
                    onClick={() => setNoteChannel(c.v)}>{c.l}</button>
                ))}
              </div>
              <textarea className="field w-full !py-1.5 text-[13px] !bg-white" rows={2} autoFocus
                placeholder={noteChannel === "internal"
                  ? "Anything to record? e.g. Gary said white roses unavailable — switched to ivory"
                  : "What was said to the customer?"}
                value={draftOf(completingTask.id).body}
                onChange={(e) => patchDraft(completingTask.id, { body: e.target.value })} />
              <div className="flex gap-1.5 items-center flex-wrap mt-1.5">
                <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[90px]"
                  value={draftOf(completingTask.id).who || completingTask.assignee || ""}
                  onChange={(e) => patchDraft(completingTask.id, { who: e.target.value })}>
                  <option value="">Completed by…</option>
                  {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={() => saveNote(completingTask)}>Save note</button>
                <button className="text-xs text-slate-400 underline"
                  onClick={() => { clearDraft(completingTask.id); setCompleting(null); }}
                  title="Task stays completed — no note">Skip</button>
              </div>
            </div>
          )}
          {logTasks.length === 0 && !completingTask && (
            <Empty icon="✓" head="No completed tasks yet." sub="Finished work gets documented here." />
          )}
          <div className="space-y-3.5">
            {logTasks.map((t) => {
              const th = threadFor(t.id);
              const when = t.completed_at ?? th.slice(-1)[0]?.created_at ?? null;
              const who = th.slice(-1)[0]?.author ?? t.assignee ?? null;
              return (
                <div key={t.id} className="group">
                  <div className="text-[14px] font-medium leading-snug">
                    <span className="text-emerald-600 mr-1.5">✓</span>{t.title}
                    <button className="text-[10px] text-slate-300 group-hover:text-slate-500 hover:!text-navy ml-2 transition-colors underline"
                      title="Return to Tasks" onClick={() => reopen(t)}>Reopen</button>
                  </div>
                  {th.map((u) => (
                    <div key={u.id} className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap mt-0.5">{u.body}</div>
                  ))}
                  {(who || when || t.vendor_id) && (
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {who && <Chip>{who}</Chip>}
                      {t.vendor_id && vendorName(t.vendor_id) && <Chip tone="bg-amber-50 text-amber-700">🏷️ {vendorName(t.vendor_id)}</Chip>}
                      {when && <Chip>{stamp(when)}</Chip>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
