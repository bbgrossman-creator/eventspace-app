"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Booking, fmtTime, parseLocalDate } from "@/lib/workflow";

/* ── Row shapes ── */
interface TaskRow {
  id: string; title: string; due_date: string | null; due_time: string | null;
  done: boolean; booking_id?: string | null; invoice_num?: string | null; assignee?: string | null;
}
interface ProgressRow { id: string; author: string | null; body: string; task_id: string | null; created_at: string; }
interface NoteRow { id: string; body: string; created_at: string; }
interface AssignRow { id: string; role: string; name: string; sort_order: number; }
interface TpRow { id: string; kind: string; status: string; scheduled_at: string | null; assignee?: string | null; }
interface StaffRow { id: string; name: string; }

const TP_LABEL: Record<string, string> = { walkthrough: "Walkthrough", tasting: "Tasting", contract: "Contract", followup: "Follow-up" };
const ROLE_SUGGESTIONS = ["Owner", "Coordinator", "Kitchen", "Setup", "Service"];

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
/** "Today 11:00 AM" / "Tomorrow" / "Overdue — Jul 3" / "Jul 12 2:00 PM" */
function dueLabel(t: TaskRow): { text: string; overdue: boolean } | null {
  if (!t.due_date) return null;
  const d = parseLocalDate(t.due_date); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  const time = t.due_time ? " " + fmtTime(t.due_time) : "";
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (diff < 0) return { text: `Overdue — ${md}`, overdue: true };
  if (diff === 0) return { text: `Today${time}`, overdue: false };
  if (diff === 1) return { text: `Tomorrow${time}`, overdue: false };
  return { text: `${md}${time}`, overdue: false };
}
function tpWhen(iso: string): string {
  const key = dayKey(iso);
  const base = dayLabel(key);
  const clock = new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${base} · ${clock}`;
}

/** One workspace card: a title, at most ONE quiet action, and content that
 *  reads before it edits. White card on the gray workspace surface. */
function Card({ title, action, onAction, children }: {
  title: string; action?: string; onAction?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)] ring-1 ring-black/[0.04]">
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

/** The Execution Workspace — the right surface of the booking page.
 *  Reading first (70/30), one action per card, editors appear on demand.
 *  The booking is the hero; this is the assistant. */
export default function OpsWorkspace({ b }: { b: Booking }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [assigns, setAssigns] = useState<AssignRow[]>([]);
  const [tps, setTps] = useState<TpRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [err, setErr] = useState("");

  // revealed editors — one per card, closed by default
  const [taskEditor, setTaskEditor] = useState(false);
  const [tTitle, setTTitle] = useState(""); const [tWho, setTWho] = useState("");
  const [tDate, setTDate] = useState(""); const [tTime, setTTime] = useState("");
  const [progEditor, setProgEditor] = useState(false);
  const [pAuthor, setPAuthor] = useState(""); const [pBody, setPBody] = useState("");
  const [noteEditor, setNoteEditor] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [assignEditor, setAssignEditor] = useState(false);
  const [aRole, setARole] = useState("Owner"); const [aName, setAName] = useState("");
  const [editAssign, setEditAssign] = useState<string | null>(null);
  const [nextStepFor, setNextStepFor] = useState<string | null>(null);
  const [nextStepTitle, setNextStepTitle] = useState("");
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const [k, p, n, a, t, st] = await Promise.all([
      supabase.from("tasks").select("*").eq("booking_id", b.id).order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("progress_updates").select("*").eq("booking_id", b.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("booking_notes").select("*").eq("booking_id", b.id).order("created_at", { ascending: true }),
      supabase.from("booking_assignments").select("*").eq("booking_id", b.id).order("sort_order"),
      supabase.from("touchpoints").select("id,kind,status,scheduled_at,assignee").eq("booking_id", b.id),
      supabase.from("staff").select("id,name").eq("active", true).order("sort_order"),
    ]);
    const e = k.error ?? p.error ?? n.error ?? a.error;
    if (e) { setErr(`Workspace couldn't load: ${e.message}${p.error || n.error || a.error ? " — run v119_ops.sql." : ""}`); return; }
    setErr("");
    setTasks((k.data ?? []) as TaskRow[]);
    setProgress((p.data ?? []) as ProgressRow[]);
    setNotes((n.data ?? []) as NoteRow[]);
    setAssigns((a.data ?? []) as AssignRow[]);
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
    if (error) { setErr(`Couldn't create task: ${error.message}`); return; }
    setTTitle(""); setTWho(""); setTDate(""); setTTime(""); setTaskEditor(false); load();
  }
  async function toggleTask(t: TaskRow) {
    await supabase.from("tasks").update({ done: !t.done }).eq("id", t.id);
    load();
  }
  async function addProgress() {
    if (!pBody.trim()) return;
    const { error } = await supabase.from("progress_updates").insert({
      booking_id: b.id, invoice_num: b.invoice_num, author: pAuthor || null, body: pBody.trim(),
    });
    if (error) { setErr(`Couldn't save update: ${error.message}`); return; }
    setPBody(""); setProgEditor(false); load();
  }
  async function addNextStep(entry: ProgressRow) {
    if (!nextStepTitle.trim()) return;
    const { error } = await supabase.from("tasks").insert({
      booking_id: b.id, invoice_num: b.invoice_num,
      title: nextStepTitle.trim(), assignee: entry.author || null, done: false,
    });
    if (error) { setErr(`Couldn't create next step: ${error.message}`); return; }
    setNextStepFor(null); setNextStepTitle(""); load();
  }
  async function addNote() {
    if (!noteBody.trim()) return;
    const { error } = await supabase.from("booking_notes").insert({ booking_id: b.id, body: noteBody.trim() });
    if (error) { setErr(`Couldn't save note: ${error.message}`); return; }
    setNoteBody(""); setNoteEditor(false); load();
  }
  async function deleteNote(id: string) { await supabase.from("booking_notes").delete().eq("id", id); load(); }
  async function addAssign() {
    if (!aRole.trim() || !aName.trim()) return;
    const { error } = await supabase.from("booking_assignments").insert({
      booking_id: b.id, role: aRole.trim(), name: aName.trim(), sort_order: assigns.length,
    });
    if (error) { setErr(`Couldn't assign: ${error.message}`); return; }
    setAName(""); setAssignEditor(false); load();
  }
  async function changeAssign(id: string, name: string) {
    await supabase.from("booking_assignments").update({ name }).eq("id", id);
    setEditAssign(null); load();
  }
  async function removeAssign(id: string) {
    await supabase.from("booking_assignments").delete().eq("id", id);
    setEditAssign(null); load();
  }

  /* ── derived ── */
  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);
  // latest linked progress line per task — the "Waiting on quote" subtitle
  const latestFor = (taskId: string): string | null => {
    const p = progress.find((x) => x.task_id === taskId);
    return p ? p.body : null;
  };
  const grouped: [string, ProgressRow[]][] = (() => {
    const m = new Map<string, ProgressRow[]>();
    for (const p of progress) {
      const k = dayKey(p.created_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return Array.from(m.entries());
  })();
  const nextTp = tps
    .filter((t) => t.status !== "completed" && t.scheduled_at && new Date(t.scheduled_at).getTime() > Date.now())
    .sort((a, z) => a.scheduled_at!.localeCompare(z.scheduled_at!))[0] ?? null;

  return (
    <div className="rounded-2xl p-4" style={{ background: "#F7F8FA" }}>
      <div className="text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase px-1 mb-3">Workspace</div>

      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-3">⚠️ {err}</p>}

      <div className="space-y-4">
        {/* ═══ Today's Work — the operational queue ═══ */}
        <Card title="Today's Work" action="New Task" onAction={() => setTaskEditor((v) => !v)}>
          {taskEditor && (
            <div className="rounded-lg bg-slate-50 p-2.5 mb-3 space-y-1.5 reveal">
              <input className="field w-full !py-1.5 text-sm" autoFocus placeholder="What needs doing?"
                value={tTitle} onChange={(e) => setTTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} />
              <div className="flex gap-1.5">
                <select className="field !py-1 !text-xs flex-1" value={tWho} onChange={(e) => setTWho(e.target.value)}>
                  <option value="">Who?</option>
                  {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <input type="date" className="field !py-1 !text-xs w-32" value={tDate} onChange={(e) => setTDate(e.target.value)} />
                <input type="time" className="field !py-1 !text-xs w-24" value={tTime} onChange={(e) => setTTime(e.target.value)} />
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
              const due = dueLabel(t);
              const latest = latestFor(t.id);
              return (
                <div key={t.id} className="flex items-start gap-2.5">
                  <button className="mt-[3px] w-4 h-4 rounded border-2 border-slate-300 hover:border-navy shrink-0 transition-colors"
                    title="Mark complete" onClick={() => toggleTask(t)} />
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium leading-snug">{t.title}</div>
                    {(t.assignee || due) && (
                      <div className="text-[12px] text-slate-400 mt-0.5">
                        {t.assignee}{t.assignee && due ? " · " : ""}
                        {due && <span className={due.overdue ? "text-red-500 font-semibold" : ""}>Due {due.text}</span>}
                      </div>
                    )}
                    {latest && (
                      <div className="text-[12px] text-slate-500 italic mt-0.5 leading-snug">{latest}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {doneTasks.length > 0 && (
            <button className="text-[11px] text-slate-300 hover:text-slate-500 mt-3"
              onClick={() => setShowDone((v) => !v)}>
              {showDone ? "▴ hide" : `▾ ${doneTasks.length} completed`}
            </button>
          )}
          {showDone && (
            <div className="mt-1.5 space-y-1 reveal">
              {doneTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 text-[13px] text-slate-400">
                  <button className="w-4 h-4 rounded bg-navy/80 text-white text-[10px] leading-none shrink-0"
                    title="Reopen" onClick={() => toggleTask(t)}>✓</button>
                  <span className="line-through decoration-slate-300">{t.title}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ═══ Latest Progress — the work narrative ═══ */}
        <Card title="Latest Progress" action="Update" onAction={() => setProgEditor((v) => !v)}>
          {progEditor && (
            <div className="rounded-lg bg-slate-50 p-2.5 mb-3 space-y-1.5 reveal">
              <textarea className="field w-full !py-1.5 text-sm" rows={3} autoFocus
                placeholder="What moved forward?"
                value={pBody} onChange={(e) => setPBody(e.target.value)} />
              <div className="flex gap-1.5">
                <select className="field !py-1 !text-xs flex-1" value={pAuthor} onChange={(e) => setPAuthor(e.target.value)}>
                  <option value="">Who?</option>
                  {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <button className="btn-primary !py-1 !px-3 text-xs" onClick={addProgress}>Save</button>
                <button className="text-xs text-slate-400 underline" onClick={() => setProgEditor(false)}>cancel</button>
              </div>
            </div>
          )}
          {grouped.length === 0 && !progEditor && (
            <p className="text-[13px] text-slate-400 leading-relaxed">
              The work narrative starts here — when a task is checked off, its reasoning lives on in this thread.
            </p>
          )}
          <div className="space-y-3.5">
            {grouped.map(([key, entries]) => (
              <div key={key}>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{dayLabel(key)}</div>
                <div className="space-y-3">
                  {entries.map((p) => (
                    <div key={p.id}>
                      {p.author && <div className="text-[12px] font-semibold text-slate-500">{p.author}</div>}
                      <div className="text-[14px] leading-relaxed whitespace-pre-wrap">{p.body}</div>
                      {nextStepFor === p.id ? (
                        <div className="flex gap-1.5 mt-1.5 reveal">
                          <input className="field !py-1 !text-xs flex-1" autoFocus placeholder="Next step…"
                            value={nextStepTitle} onChange={(e) => setNextStepTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") addNextStep(p); }} />
                          <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={() => addNextStep(p)}>Add</button>
                          <button className="text-xs text-slate-400 underline" onClick={() => setNextStepFor(null)}>×</button>
                        </div>
                      ) : (
                        <button className="text-[11px] text-slate-300 hover:text-navy mt-0.5 transition-colors"
                          onClick={() => { setNextStepFor(p.id); setNextStepTitle(""); }}>↳ next step</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ═══ Internal Notes — permanent facts, always visible ═══ */}
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
            <p className="text-[13px] text-slate-400 leading-relaxed">“Only call after 7 PM.” “Mother handles décor.” The facts that never expire.</p>
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

        {/* ═══ Assignments — ownership at a glance, one click to change ═══ */}
        <Card title="Assignments" action="Assign" onAction={() => setAssignEditor((v) => !v)}>
          {assignEditor && (
            <div className="flex gap-1.5 mb-3 reveal">
              <select className="field !py-1 !text-xs w-28" value={aRole} onChange={(e) => setARole(e.target.value)}>
                {ROLE_SUGGESTIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
              <select className="field !py-1 !text-xs flex-1" value={aName} onChange={(e) => setAName(e.target.value)}>
                <option value="">Who?</option>
                {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <button className="btn-primary !py-1 !px-3 text-xs" onClick={addAssign}>Add</button>
            </div>
          )}
          {assigns.length === 0 && !assignEditor && (
            <p className="text-[13px] text-slate-400 leading-relaxed">Nobody owns this yet.</p>
          )}
          <div className="space-y-2">
            {assigns.map((a) => (
              <div key={a.id}>
                {editAssign === a.id ? (
                  <div className="flex gap-1.5 items-center reveal">
                    <span className="text-[12px] text-slate-400 w-24 shrink-0">{a.role}</span>
                    <select className="field !py-1 !text-xs flex-1" defaultValue={a.name}
                      onChange={(e) => changeAssign(a.id, e.target.value)}>
                      {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                    <button className="text-xs text-red-400 hover:text-red-600" title="Remove"
                      onClick={() => removeAssign(a.id)}>remove</button>
                  </div>
                ) : (
                  <button className="w-full flex items-baseline gap-3 text-left group"
                    title="Click to change" onClick={() => setEditAssign(a.id)}>
                    <span className="text-[12px] text-slate-400 w-24 shrink-0">{a.role}</span>
                    <span className="text-[15px] font-medium group-hover:text-navy transition-colors">{a.name}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* ═══ Upcoming Touchpoints — informational ═══ */}
        <Card title="Upcoming Touchpoints">
          {nextTp ? (
            <div>
              <div className="text-[15px] font-medium">{TP_LABEL[nextTp.kind] ?? nextTp.kind}</div>
              <div className="text-[12px] text-slate-400 mt-0.5">
                {tpWhen(nextTp.scheduled_at!)}{nextTp.assignee ? ` · ${nextTp.assignee}` : ""}
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
