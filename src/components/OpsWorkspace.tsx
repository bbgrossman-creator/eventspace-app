"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Booking, fmtTime, parseLocalDate } from "@/lib/workflow";

/* ── Row shapes ── */
interface TaskRow {
  id: string; title: string; due_date: string | null; due_time: string | null;
  done: boolean; booking_id?: string | null; invoice_num?: string | null;
  assignee?: string | null; completed_at?: string | null;
}
interface UpdateRow { id: string; author: string | null; body: string; task_id: string | null; created_at: string; }
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

function Card({ title, action, onAction, feeder = false, children }: {
  title: string; action?: string; onAction?: () => void; feeder?: boolean; children: React.ReactNode;
}) {
  // Feeder (Tasks) wears a faint salmon: "this is where you work."
  // Receivers (Task Log, Touchpoints) stay white: "this is where work lands."
  return (
    <div className={feeder
      ? "rounded-xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] bg-[#FFF7F4] ring-1 ring-[#F4D8CE]"
      : "rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-[#E6EAF2]"}>
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

/** The Workspace: three sections, one mental model.
 *  Still needs doing? → Task. Done? → Task Log. Scheduled? → Touchpoint.
 *  (Permanent customer facts live on the Customer Profile.)
 *  Completing a task moves it — with its explanation — into the Task Log,
 *  so the execution history writes itself. */
export default function OpsWorkspace({ b }: { b: Booking }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [tps, setTps] = useState<TpRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [err, setErr] = useState("");

  const [taskEditor, setTaskEditor] = useState(false);
  const [tTitle, setTTitle] = useState(""); const [tWho, setTWho] = useState("");
  const [tDate, setTDate] = useState(""); const [tTime, setTTime] = useState("");
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [updateFor, setUpdateFor] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
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
    const [k, u, t, st] = await Promise.all([
      supabase.from("tasks").select("*").eq("booking_id", b.id).order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("progress_updates").select("*").eq("booking_id", b.id).order("created_at", { ascending: true }),
      supabase.from("touchpoints").select("id,kind,status,scheduled_at,assignee").eq("booking_id", b.id),
      supabase.from("staff").select("id,name").eq("active", true).order("sort_order"),
    ]);
    const e = k.error ?? u.error;
    if (e) { setErr(`Workspace couldn't load: ${e.message}${u.error ? " — run v119_ops.sql" : ""}${k.error?.message.includes("completed_at") ? " — run v122_worklog.sql" : ""}.`); return; }
    setErr("");
    setTasks((k.data ?? []) as TaskRow[]);
    setUpdates((u.data ?? []) as UpdateRow[]);
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
  async function complete(task: TaskRow) {
    const d = draftOf(task.id);
    if (d.body.trim()) {
      const { error } = await supabase.from("progress_updates").insert({
        booking_id: b.id, invoice_num: b.invoice_num, task_id: task.id,
        author: d.who || task.assignee || null, body: d.body.trim(),
      });
      if (error) { setErr(`Couldn't save: ${error.message}`); return; }
    }
    const { error } = await supabase.from("tasks")
      .update({ done: true, completed_at: new Date().toISOString() }).eq("id", task.id);
    if (error) { setErr(`Couldn't complete: ${error.message} — run v122_worklog.sql.`); return; }
    clearDraft(task.id); setCompleting(null); setOpenThread(null); load();
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
    load();
  }

  /* ── derived ── */
  const threadFor = (taskId: string) => updates.filter((u) => u.task_id === taskId);
  const openTasks = tasks.filter((t) => !t.done && t.id !== completing);
  const completingTask = tasks.find((t) => t.id === completing) ?? null;
  const logTasks = tasks.filter((t) => t.done).slice().sort((a, z) => {
    const at = a.completed_at ?? threadFor(a.id).slice(-1)[0]?.created_at ?? "";
    const zt = z.completed_at ?? threadFor(z.id).slice(-1)[0]?.created_at ?? "";
    return zt.localeCompare(at);
  });
  const nextTp = tps
    .filter((t) => t.status !== "completed" && t.scheduled_at && new Date(t.scheduled_at).getTime() > Date.now())
    .sort((a, z) => a.scheduled_at!.localeCompare(z.scheduled_at!))[0] ?? null;

  return (
    <div className="rounded-2xl p-3" style={{ background: "#F5F6F8" }}>
      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-3">⚠️ {err}</p>}

      <div className="space-y-3">
        {/* ═══ Tasks — still needs doing ═══ */}
        <Card title="Tasks" action="New Task" feeder onAction={() => setTaskEditor((v) => !v)}>
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
                      title="Complete" onClick={() => { setCompleting(completing === t.id ? null : t.id); setUpdateFor(null); }} />
                    <div className="min-w-0 flex-1">
                      <button className="text-left w-full group"
                        onClick={() => {
                          // Click task = update it: expand the thread with the
                          // composer ready. Checkbox = complete — never this.
                          if (expanded) { setOpenThread(null); setUpdateFor(null); }
                          else { setOpenThread(t.id); setUpdateFor(t.id); setCompleting(null); }
                        }}>
                        <span className="text-[15px] font-medium leading-snug group-hover:text-navy transition-colors">{t.title}</span>
                      </button>
                      {(t.assignee || due || th.length > 0) && (
                        <div className="flex gap-1.5 flex-wrap mt-1">
                          {t.assignee && (
                            <Link href={`/?taskAssignee=${encodeURIComponent(t.assignee)}`} title={`See ${t.assignee}'s tasks on Daily Ops`}>
                              <Chip tone="bg-slate-100 text-slate-500 hover:bg-navy hover:text-white transition-colors cursor-pointer">{t.assignee}</Chip>
                            </Link>
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
                </div>
              );
            })}
          </div>
        </Card>

        {/* ═══ Task Log — the execution history, written by finishing work ═══ */}
        <Card title="Task Log">
          {completingTask && (
            <div ref={pendingRef} className="rounded-lg bg-emerald-50/60 ring-1 ring-emerald-200 p-2.5 mb-3 reveal">
              <div className="text-[14px] font-medium leading-snug">
                <span className="text-emerald-600 mr-1.5">✓</span>{completingTask.title}
              </div>
              <div className="flex gap-1.5 mt-1 mb-2"><Chip tone="bg-emerald-100 text-emerald-700">Completed just now</Chip></div>
              <div className="text-[11px] font-semibold text-slate-500 mb-1">What happened?</div>
              <textarea className="field w-full !py-1.5 text-[13px] !bg-white" rows={2} autoFocus
                placeholder="e.g. Gary said white roses unavailable — switched to ivory, quote Thursday"
                value={draftOf(completingTask.id).body}
                onChange={(e) => patchDraft(completingTask.id, { body: e.target.value })} />
              <div className="flex gap-1.5 items-center flex-wrap mt-1.5">
                <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[90px]"
                  value={draftOf(completingTask.id).who || completingTask.assignee || ""}
                  onChange={(e) => patchDraft(completingTask.id, { who: e.target.value })}>
                  <option value="">Completed by…</option>
                  {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={() => complete(completingTask)}>Complete Task</button>
                <button className="text-xs text-slate-400 underline"
                  onClick={() => setCompleting(null)} title="Task returns to Tasks">cancel</button>
              </div>
            </div>
          )}
          {logTasks.length === 0 && !completingTask && (
            <p className="text-[13px] text-slate-400 leading-relaxed">
              No completed tasks yet.
            </p>
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
                    <button className="text-[10px] text-slate-200 group-hover:text-slate-400 hover:!text-navy ml-2 transition-colors"
                      title="Reopen" onClick={() => reopen(t)}>reopen</button>
                  </div>
                  {th.map((u) => (
                    <div key={u.id} className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap mt-0.5">{u.body}</div>
                  ))}
                  {(who || when) && (
                    <div className="flex gap-1.5 mt-1">
                      {who && <Chip>{who}</Chip>}
                      {when && <Chip>{stamp(when)}</Chip>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ═══ Upcoming Touchpoints — informational ═══ */}
        <Card title="Upcoming Touchpoints">
          {nextTp ? (
            <div>
              <div className="text-[15px] font-medium">{TP_LABEL[nextTp.kind] ?? nextTp.kind}</div>
              <div className="flex gap-1.5 mt-1">
                <Chip>{stamp(nextTp.scheduled_at!)}</Chip>
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
