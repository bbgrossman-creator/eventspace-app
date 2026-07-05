"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Booking, fmtTime, parseLocalDate } from "@/lib/workflow";

/* ── Row shapes ── */
interface TaskRow {
  id: string; title: string; due_date: string | null; due_time: string | null;
  done: boolean; booking_id?: string | null; invoice_num?: string | null; assignee?: string | null;
}
interface UpdateRow { id: string; author: string | null; body: string; task_id: string | null; created_at: string; }
interface NoteRow { id: string; body: string; created_at: string; }
interface TpRow { id: string; kind: string; status: string; scheduled_at: string | null; assignee?: string | null; }
interface StaffRow { id: string; name: string; }

const TP_LABEL: Record<string, string> = { walkthrough: "Walkthrough", tasting: "Tasting", contract: "Contract", followup: "Follow-up" };

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
function tpWhen(iso: string): string {
  const base = dayLabel(dayKey(iso));
  const clock = new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${base} · ${clock}`;
}

/** Small gray metadata chip — never overflows, never truncates awkwardly. */
function Chip({ children, tone = "" }: { children: React.ReactNode; tone?: string }) {
  return (
    <span className={`inline-block text-[11px] font-medium rounded-md px-1.5 py-0.5 ${tone || "bg-slate-100 text-slate-500"}`}>
      {children}
    </span>
  );
}

/** One workspace card: minimal — 12px radius, thin #E6EAF2 border, light. */
function Card({ title, action, onAction, children }: {
  title: string; action?: string; onAction?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-[#E6EAF2]">
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <h3 className="font-display font-semibold text-[15px] leading-none">{title}</h3>
        {action && onAction && (
          <button className="text-xs text-slate-400 hover:text-navy transition-colors whitespace-nowrap"
            onClick={onAction}>＋ {action}</button>
        )}
      </div>
      {children}
    </div>
  );
}

/** The Workspace: a notebook beside the booking, not another dashboard.
 *  One object for work — each to-do carries owner, due, and an update thread
 *  (GitHub-Issues style). Completing a task prompts the update, so the work
 *  log writes itself. Knowledge is never lost to a checkbox. */
export default function OpsWorkspace({ b }: { b: Booking }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [tps, setTps] = useState<TpRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [err, setErr] = useState("");

  // revealed editors
  const [taskEditor, setTaskEditor] = useState(false);
  const [tTitle, setTTitle] = useState(""); const [tWho, setTWho] = useState("");
  const [tDate, setTDate] = useState(""); const [tTime, setTTime] = useState("");
  const [noteEditor, setNoteEditor] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [openThread, setOpenThread] = useState<string | null>(null);   // task id with expanded updates
  const [updateFor, setUpdateFor] = useState<string | null>(null);     // task id with open composer
  const [updateBody, setUpdateBody] = useState("");
  const [updateWho, setUpdateWho] = useState("");
  const [completing, setCompleting] = useState<string | null>(null);   // task id in complete-with-update flow
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const [k, u, n, t, st] = await Promise.all([
      supabase.from("tasks").select("*").eq("booking_id", b.id).order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("progress_updates").select("*").eq("booking_id", b.id).order("created_at", { ascending: true }),
      supabase.from("booking_notes").select("*").eq("booking_id", b.id).order("created_at", { ascending: true }),
      supabase.from("touchpoints").select("id,kind,status,scheduled_at,assignee").eq("booking_id", b.id),
      supabase.from("staff").select("id,name").eq("active", true).order("sort_order"),
    ]);
    const e = k.error ?? u.error ?? n.error;
    if (e) { setErr(`Workspace couldn't load: ${e.message}${u.error || n.error ? " — run v119_ops.sql." : ""}`); return; }
    setErr("");
    setTasks((k.data ?? []) as TaskRow[]);
    setUpdates((u.data ?? []) as UpdateRow[]);
    setNotes((n.data ?? []) as NoteRow[]);
    setTps((t.data ?? []) as TpRow[]);
    setStaff((st.data ?? []) as StaffRow[]);
  }, [b.id]);
  useEffect(() => { load(); }, [load]);

  /* ── mutations ── */
  async function addTask() {
    if (!tTitle.trim()) return;
    const { error } = await supabase.from("tasks").insert({
      booking_id: b.id, invoice_num: b.invoice_num, title: tTitle.trim(),
      assignee: tWho || null, due_date: tDate || null, due_time: tTime || null, done: false,
    });
    if (error) { setErr(`Couldn't create to-do: ${error.message}`); return; }
    setTTitle(""); setTWho(""); setTDate(""); setTTime(""); setTaskEditor(false); load();
  }
  async function saveUpdate(task: TaskRow, thenComplete: boolean) {
    if (updateBody.trim()) {
      const { error } = await supabase.from("progress_updates").insert({
        booking_id: b.id, invoice_num: b.invoice_num, task_id: task.id,
        author: updateWho || task.assignee || null, body: updateBody.trim(),
      });
      if (error) { setErr(`Couldn't save update: ${error.message}`); return; }
    }
    if (thenComplete) await supabase.from("tasks").update({ done: true }).eq("id", task.id);
    setUpdateBody(""); setUpdateWho(""); setUpdateFor(null); setCompleting(null);
    if (thenComplete) setOpenThread(null);
    load();
  }
  async function reopen(task: TaskRow) {
    await supabase.from("tasks").update({ done: false }).eq("id", task.id);
    load();
  }
  async function addNote() {
    if (!noteBody.trim()) return;
    const { error } = await supabase.from("booking_notes").insert({ booking_id: b.id, body: noteBody.trim() });
    if (error) { setErr(`Couldn't save note: ${error.message}`); return; }
    setNoteBody(""); setNoteEditor(false); load();
  }
  async function deleteNote(id: string) { await supabase.from("booking_notes").delete().eq("id", id); load(); }

  /* ── derived ── */
  const threadFor = (taskId: string) => updates.filter((u) => u.task_id === taskId);
  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done).slice().reverse();
  const nextTp = tps
    .filter((t) => t.status !== "completed" && t.scheduled_at && new Date(t.scheduled_at).getTime() > Date.now())
    .sort((a, z) => a.scheduled_at!.localeCompare(z.scheduled_at!))[0] ?? null;

  /* ── the thread + composer, shared by open and completed items.
        A render FUNCTION, not a nested component — a nested component would
        remount on every keystroke and drop textarea focus. ── */
  function renderThread(task: TaskRow) {
    const th = threadFor(task.id);
    return (
      <div className="mt-1.5 pl-1 border-l-2 border-slate-100 space-y-2 reveal">
        {th.map((u) => (
          <div key={u.id} className="pl-2.5">
            <div className="text-[11px] text-slate-400">
              {u.author && <b className="font-semibold text-slate-500">{u.author}</b>}{u.author ? " · " : ""}{dayLabel(dayKey(u.created_at))}
            </div>
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{u.body}</div>
          </div>
        ))}
        {th.length === 0 && <p className="pl-2.5 text-[12px] text-slate-300">No updates yet.</p>}
        {updateFor === task.id ? (
          <div className="pl-2.5 space-y-1.5 reveal">
            <textarea className="field w-full !py-1.5 text-[13px]" rows={2} autoFocus
              placeholder="What happened?" value={updateBody} onChange={(e) => setUpdateBody(e.target.value)} />
            <div className="flex gap-1.5 items-center">
              <select className="field !py-1 !text-xs flex-1" value={updateWho || task.assignee || ""}
                onChange={(e) => setUpdateWho(e.target.value)}>
                <option value="">Who?</option>
                {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={() => saveUpdate(task, false)}>Save</button>
              <button className="text-xs text-slate-400 underline" onClick={() => { setUpdateFor(null); setUpdateBody(""); }}>×</button>
            </div>
          </div>
        ) : (
          <button className="pl-2.5 text-[11px] text-slate-300 hover:text-navy transition-colors"
            onClick={() => { setUpdateFor(task.id); setUpdateBody(""); setUpdateWho(""); }}>＋ add update</button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-3" style={{ background: "#F5F7FA" }}>
      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-3">⚠️ {err}</p>}

      <div className="space-y-3">
        {/* ═══ To-Dos — work, each carrying its own knowledge ═══ */}
        <Card title="To-Dos" action="New To-Do" onAction={() => setTaskEditor((v) => !v)}>
          {taskEditor && (
            <div className="rounded-lg bg-slate-50 p-2.5 mb-3 space-y-1.5 reveal">
              <input className="field w-full !py-1.5 text-sm" autoFocus placeholder="What needs doing?"
                value={tTitle} onChange={(e) => setTTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} />
              <div className="flex gap-1.5 flex-wrap">
                <select className="field !py-1 !text-xs flex-1 min-w-[90px]" value={tWho} onChange={(e) => setTWho(e.target.value)}>
                  <option value="">Who?</option>
                  {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <input type="date" className="field !py-1 !text-xs w-[7.5rem]" value={tDate} onChange={(e) => setTDate(e.target.value)} />
                <input type="time" className="field !py-1 !text-xs w-[5.5rem]" value={tTime} onChange={(e) => setTTime(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button className="btn-primary !py-1 !px-3 text-xs" onClick={addTask}>Add</button>
                <button className="text-xs text-slate-400 underline" onClick={() => setTaskEditor(false)}>cancel</button>
              </div>
            </div>
          )}
          {openTasks.length === 0 && !taskEditor && (
            <p className="text-[13px] text-slate-400 leading-relaxed">The queue is clear.</p>
          )}
          <div className="space-y-3">
            {openTasks.map((t) => {
              const due = dueChip(t);
              const th = threadFor(t.id);
              const expanded = openThread === t.id;
              return (
                <div key={t.id}>
                  <div className="flex items-start gap-2.5">
                    <button className="mt-[3px] w-4 h-4 rounded border-2 border-slate-300 hover:border-navy shrink-0 transition-colors"
                      title="Complete" onClick={() => { setCompleting(t.id); setUpdateBody(""); setUpdateWho(""); }} />
                    <div className="min-w-0 flex-1">
                      <button className="text-left w-full group" onClick={() => setOpenThread(expanded ? null : t.id)}>
                        <span className="text-[15px] font-medium leading-snug group-hover:text-navy transition-colors">{t.title}</span>
                      </button>
                      {(t.assignee || due || th.length > 0) && (
                        <div className="flex gap-1.5 flex-wrap mt-1">
                          {t.assignee && <Chip>{t.assignee}</Chip>}
                          {due && <Chip tone={due.overdue ? "bg-red-50 text-red-600" : ""}>{due.text}</Chip>}
                          {th.length > 0 && (
                            <button onClick={() => setOpenThread(expanded ? null : t.id)}>
                              <Chip tone="bg-navy/5 text-navy">{expanded ? "▴" : "▾"} updates ({th.length})</Chip>
                            </button>
                          )}
                        </div>
                      )}
                      {completing === t.id && (
                        <div className="rounded-lg bg-slate-50 p-2.5 mt-2 space-y-1.5 reveal">
                          <div className="text-[11px] font-semibold text-slate-500">Completing — what happened?</div>
                          <textarea className="field w-full !py-1.5 text-[13px]" rows={2} autoFocus
                            placeholder="e.g. White roses unavailable — shipment tomorrow, confirm Thursday"
                            value={updateBody} onChange={(e) => setUpdateBody(e.target.value)} />
                          <div className="flex gap-1.5 items-center flex-wrap">
                            <select className="field !py-1 !text-xs flex-1 min-w-[90px]" value={updateWho || t.assignee || ""}
                              onChange={(e) => setUpdateWho(e.target.value)}>
                              <option value="">Who?</option>
                              {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </select>
                            <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={() => saveUpdate(t, true)}>
                              {updateBody.trim() ? "Save & complete" : "Complete"}
                            </button>
                            <button className="text-xs text-slate-400 underline" onClick={() => setCompleting(null)}>cancel</button>
                          </div>
                        </div>
                      )}
                      {expanded && completing !== t.id && renderThread(t)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Completed — the work log writes itself */}
          {doneTasks.length > 0 && (
            <button className="text-[11px] text-slate-300 hover:text-slate-500 mt-3 transition-colors"
              onClick={() => setShowDone((v) => !v)}>
              {showDone ? "▴ hide completed" : `▾ ${doneTasks.length} completed`}
            </button>
          )}
          {showDone && (
            <div className="mt-2 space-y-2.5 reveal">
              {doneTasks.map((t) => {
                const th = threadFor(t.id);
                const expanded = openThread === t.id;
                return (
                  <div key={t.id}>
                    <div className="flex items-start gap-2.5">
                      <button className="mt-[3px] w-4 h-4 rounded bg-navy/80 text-white text-[10px] leading-none shrink-0"
                        title="Reopen" onClick={() => reopen(t)}>✓</button>
                      <div className="min-w-0 flex-1">
                        <button className="text-left group" onClick={() => setOpenThread(expanded ? null : t.id)}>
                          <span className="text-[13px] text-slate-400 line-through decoration-slate-300 group-hover:text-slate-600 transition-colors">{t.title}</span>
                          {th.length > 0 && <span className="text-[11px] text-navy/60 ml-1.5">{expanded ? "▴" : "▾"} {th.length}</span>}
                        </button>
                        {expanded && renderThread(t)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ═══ Internal Notes — permanent facts only ═══ */}
        <Card title="Internal Notes" action="Add Note" onAction={() => setNoteEditor((v) => !v)}>
          {noteEditor && (
            <div className="flex gap-1.5 mb-3 reveal">
              <input className="field !py-1.5 !text-sm flex-1" autoFocus placeholder="A standing fact…"
                value={noteBody} onChange={(e) => setNoteBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} />
              <button className="btn-primary !py-1 !px-3 text-xs" onClick={addNote}>Add</button>
            </div>
          )}
          {notes.length === 0 && !noteEditor && (
            <p className="text-[13px] text-slate-400 leading-relaxed">“Only call after 7 PM.” Facts that never expire — discoveries belong on their to-do.</p>
          )}
          <div className="space-y-1.5">
            {notes.map((n) => (
              <div key={n.id} className="group flex items-start gap-2 text-[14px] leading-relaxed">
                <span className="text-slate-300 mt-[2px]">•</span>
                <span className="flex-1 whitespace-pre-wrap">{n.body}</span>
                <button className="text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs mt-[2px]"
                  title="Remove" onClick={() => deleteNote(n.id)}>✕</button>
              </div>
            ))}
          </div>
        </Card>

        {/* ═══ Upcoming Touchpoints — informational ═══ */}
        <Card title="Upcoming Touchpoints">
          {nextTp ? (
            <div>
              <div className="text-[15px] font-medium">{TP_LABEL[nextTp.kind] ?? nextTp.kind}</div>
              <div className="flex gap-1.5 mt-1">
                <Chip>{tpWhen(nextTp.scheduled_at!)}</Chip>
                {nextTp.assignee && <Chip>{nextTp.assignee}</Chip>}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-slate-400 leading-relaxed">Nothing scheduled.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
