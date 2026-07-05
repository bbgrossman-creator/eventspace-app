"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate, fmtTime } from "@/lib/workflow";
import TodoPanel from "@/components/TodoPanel";

/* ── Row shapes ── */
interface ProgressRow { id: string; author: string | null; body: string; task_id: string | null; created_at: string; }
interface NoteRow { id: string; body: string; created_at: string; }
interface AssignRow { id: string; role: string; name: string; sort_order: number; }
interface TpRow { id: string; kind: string; status: string; scheduled_at: string | null; assignee?: string | null; }
interface StaffRow { id: string; name: string; }

const TP_LABEL: Record<string, string> = { walkthrough: "Walkthrough", tasting: "Tasting", contract: "Contract", followup: "Follow-up" };
const TP_ICON: Record<string, string> = { walkthrough: "🚶", tasting: "🍴", contract: "📝", followup: "☎️" };
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

/** Micro section header — quiet typography instead of boxes. */
function OpsHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-5 mb-2 first:mt-0">
      <span className="text-[10px] font-bold tracking-[0.18em] text-slate-400 uppercase whitespace-nowrap">{children}</span>
      <div className="h-px bg-slate-100 flex-1" />
    </div>
  );
}

/** The Operations Workspace: the right side of the two-workspace page.
 *  The left explains the event; this explains the work. Calm enough to stay
 *  open for eight hours — whitespace, hairlines, one voice. */
export default function OpsWorkspace({ b }: { b: Booking }) {
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [assigns, setAssigns] = useState<AssignRow[]>([]);
  const [tps, setTps] = useState<TpRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [err, setErr] = useState("");

  // composers
  const [pAuthor, setPAuthor] = useState("");
  const [pBody, setPBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [aRole, setARole] = useState("Owner");
  const [aName, setAName] = useState("");
  const [nextStepFor, setNextStepFor] = useState<string | null>(null);
  const [nextStepTitle, setNextStepTitle] = useState("");

  const load = useCallback(async () => {
    const [p, n, a, t, st] = await Promise.all([
      supabase.from("progress_updates").select("*").eq("booking_id", b.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("booking_notes").select("*").eq("booking_id", b.id).order("created_at", { ascending: true }),
      supabase.from("booking_assignments").select("*").eq("booking_id", b.id).order("sort_order"),
      supabase.from("touchpoints").select("id,kind,status,scheduled_at,assignee").eq("booking_id", b.id),
      supabase.from("staff").select("id,name").eq("active", true).order("sort_order"),
    ]);
    const e = p.error ?? n.error ?? a.error;
    if (e) { setErr(`Operations couldn't load: ${e.message} — run v119_ops.sql.`); return; }
    setErr("");
    setProgress((p.data ?? []) as ProgressRow[]);
    setNotes((n.data ?? []) as NoteRow[]);
    setAssigns((a.data ?? []) as AssignRow[]);
    setTps((t.data ?? []) as TpRow[]);
    setStaff((st.data ?? []) as StaffRow[]);
  }, [b.id]);
  useEffect(() => { load(); }, [load]);

  async function addProgress() {
    if (!pBody.trim()) return;
    const { error } = await supabase.from("progress_updates").insert({
      booking_id: b.id, invoice_num: b.invoice_num,
      author: pAuthor || null, body: pBody.trim(),
    });
    if (error) { setErr(`Couldn't save progress: ${error.message}`); return; }
    setPBody(""); load();
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
    setNoteBody(""); load();
  }

  async function deleteNote(id: string) {
    await supabase.from("booking_notes").delete().eq("id", id);
    load();
  }

  async function addAssign() {
    if (!aRole.trim() || !aName.trim()) return;
    const { error } = await supabase.from("booking_assignments").insert({
      booking_id: b.id, role: aRole.trim(), name: aName.trim(), sort_order: assigns.length,
    });
    if (error) { setErr(`Couldn't assign: ${error.message}`); return; }
    setAName(""); load();
  }

  async function removeAssign(id: string) {
    await supabase.from("booking_assignments").delete().eq("id", id);
    load();
  }

  const nextTp = tps
    .filter((t) => t.status !== "completed" && t.scheduled_at && new Date(t.scheduled_at).getTime() > Date.now())
    .sort((a, z) => a.scheduled_at!.localeCompare(z.scheduled_at!))[0] ?? null;

  // day-group progress
  const grouped: [string, ProgressRow[]][] = (() => {
    const m = new Map<string, ProgressRow[]>();
    for (const p of progress) {
      const k = dayKey(p.created_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return Array.from(m.entries());
  })();

  return (
    <section className="card p-5">
      <div className="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">Operations</div>

      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mt-2">⚠️ {err}</p>}

      {/* ── Today's tasks (the existing to-do engine, embedded) ── */}
      <OpsHead>Tasks</OpsHead>
      <TodoPanel bookingId={b.id} bookingInvoice={b.invoice_num} variant="embedded" />

      {/* ── Progress: the work narrative — the team's memory ── */}
      <OpsHead>Progress</OpsHead>
      <div className="space-y-1.5 mb-2">
        <textarea className="field w-full !py-1.5 text-sm" rows={2}
          placeholder="What moved forward? (e.g. Called florist — white roses unavailable, quote tomorrow)"
          value={pBody} onChange={(e) => setPBody(e.target.value)} />
        <div className="flex gap-1.5 items-center">
          <select className="field !py-1 !text-xs flex-1" value={pAuthor} onChange={(e) => setPAuthor(e.target.value)}>
            <option value="">👤 Who?</option>
            {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          <button className="btn-primary !py-1 !px-3.5 text-xs" onClick={addProgress}>Add</button>
        </div>
      </div>
      {grouped.length === 0 && <p className="text-xs text-slate-400">No updates yet — the work narrative starts here.</p>}
      {grouped.map(([key, entries]) => (
        <div key={key} className="mb-2">
          <div className="text-[10px] font-semibold text-slate-400 mb-1">{dayLabel(key)}</div>
          <div className="space-y-2">
            {entries.map((p) => (
              <div key={p.id} className="text-sm border-l-2 border-slate-100 pl-3">
                {p.author && <div className="text-[11px] font-semibold text-slate-500">{p.author}</div>}
                <div className="whitespace-pre-wrap leading-snug">{p.body}</div>
                {nextStepFor === p.id ? (
                  <div className="flex gap-1.5 mt-1.5">
                    <input className="field !py-1 !text-xs flex-1" autoFocus placeholder="Next step…"
                      value={nextStepTitle} onChange={(e) => setNextStepTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addNextStep(p); }} />
                    <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={() => addNextStep(p)}>Add</button>
                    <button className="text-xs text-slate-400 underline" onClick={() => { setNextStepFor(null); setNextStepTitle(""); }}>×</button>
                  </div>
                ) : (
                  <button className="text-[11px] text-slate-400 hover:text-navy mt-0.5"
                    onClick={() => { setNextStepFor(p.id); setNextStepTitle(""); }}>↳ next step</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ── Internal notes: persistent facts — always visible, never expire ── */}
      <OpsHead>Internal Notes</OpsHead>
      <div className="space-y-1 mb-2">
        {notes.length === 0 && <p className="text-xs text-slate-400">Standing facts live here — “only call after 7 PM”, “mother handles décor”.</p>}
        {notes.map((n) => (
          <div key={n.id} className="group flex items-start gap-2 text-sm">
            <span className="text-slate-300 mt-[3px]">•</span>
            <span className="flex-1 whitespace-pre-wrap leading-snug">{n.body}</span>
            <button className="text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
              title="Remove note" onClick={() => deleteNote(n.id)}>✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input className="field !py-1 !text-xs flex-1" placeholder="Add a standing note…"
          value={noteBody} onChange={(e) => setNoteBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} />
        <button className="btn-primary !py-1 !px-3 text-xs" onClick={addNote}>Add</button>
      </div>

      {/* ── Assigned: ownership at a glance ── */}
      <OpsHead>Assigned</OpsHead>
      <div className="space-y-1 mb-2">
        {assigns.length === 0 && <p className="text-xs text-slate-400">Nobody assigned yet.</p>}
        {assigns.map((a) => (
          <div key={a.id} className="group flex items-baseline gap-3 text-sm">
            <span className="text-[11px] text-slate-400 w-24 shrink-0">{a.role}</span>
            <span className="flex-1 font-medium">{a.name}</span>
            <button className="text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
              onClick={() => removeAssign(a.id)}>✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <select className="field !py-1 !text-xs w-28" value={aRole} onChange={(e) => setARole(e.target.value)}>
          {ROLE_SUGGESTIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select className="field !py-1 !text-xs flex-1" value={aName} onChange={(e) => setAName(e.target.value)}>
          <option value="">— Who —</option>
          {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <button className="btn-primary !py-1 !px-3 text-xs" onClick={addAssign}>Add</button>
      </div>

      {/* ── Next touchpoint ── */}
      <OpsHead>Next Touchpoint</OpsHead>
      {nextTp ? (
        <div className="text-sm">
          <span className="font-medium">{TP_ICON[nextTp.kind] ?? "📌"} {TP_LABEL[nextTp.kind] ?? nextTp.kind}</span>
          <span className="text-slate-500"> · {fmtDate(nextTp.scheduled_at!.slice(0, 10))} {fmtTime(nextTp.scheduled_at!.slice(11, 16))}</span>
          {nextTp.assignee && <span className="text-[11px] text-slate-400 block">{nextTp.assignee}</span>}
        </div>
      ) : (
        <p className="text-xs text-slate-400">Nothing scheduled.</p>
      )}
    </section>
  );
}
