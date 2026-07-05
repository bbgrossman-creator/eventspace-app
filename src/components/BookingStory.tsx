"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, logActivity } from "@/lib/supabase";
import { Booking, isSystemEvent } from "@/lib/workflow";

/* ── Row shapes (matching existing tables) ── */
interface LogRow { id: string; action: string; details: string | null; result?: string; created_at: string; }
interface PayRow { id: string; payment_type: string; method: string; amount_applied: number; created_at: string; }
interface TpRow { id: string; kind: string; status: string; scheduled_at: string | null; notes: string | null; assignee?: string | null; created_at?: string; }
interface TaskRow { id: string; title: string; done: boolean; assignee?: string | null; created_at?: string; }

const TP_LABEL: Record<string, string> = { walkthrough: "Walkthrough", tasting: "Tasting", contract: "Contract", followup: "Follow-up" };
const TP_ICON: Record<string, string> = { walkthrough: "🚶", tasting: "🍴", contract: "📝", followup: "☎️" };

interface Item {
  id: string;
  at: string;
  icon: string;
  title: string;
  detail: string | null;
  kind: "log" | "payment" | "touchpoint" | "task";
  system: boolean;
}
/** A rendered row: either a single item or a compressed run of identical
 *  system events ("📧 Menu discussion link sent ×4"). */
interface Row { head: Item; run: Item[]; }

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(key: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const [yy, mm, dd] = key.split("-").map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function ago(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

const FILTERS = ["All", "Payments", "Touchpoints", "Notes & Calls", "System"] as const;
type Filter = typeof FILTERS[number];

/** The booking's memory: one merged chronological story (activity, payments,
 *  touchpoints, completed tasks), collapsed by default behind an accordion.
 *  Operations first; history on demand. Replaces the Activity Log. */
export default function BookingStory({ b }: { b: Booking }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<LogRow[]>([]);
  const [pays, setPays] = useState<PayRow[]>([]);
  const [tps, setTps] = useState<TpRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [composer, setComposer] = useState<"" | "call" | "note">("");
  const [composeText, setComposeText] = useState("");
  const [loadErr, setLoadErr] = useState("");

  const load = useCallback(async () => {
    const [l, p, t, k] = await Promise.all([
      supabase.from("activity_log").select("*").eq("booking_id", b.id).order("created_at", { ascending: false }).limit(300),
      supabase.from("payments").select("*").eq("booking_id", b.id),
      supabase.from("touchpoints").select("*").eq("booking_id", b.id),
      supabase.from("tasks").select("*").eq("booking_id", b.id),
    ]);
    const err = l.error ?? p.error ?? t.error ?? k.error;
    if (err) setLoadErr(`Story couldn't load: ${err.message}`);
    setLog((l.data ?? []) as LogRow[]);
    setPays((p.data ?? []) as PayRow[]);
    setTps((t.data ?? []) as TpRow[]);
    setTasks((k.data ?? []) as TaskRow[]);
  }, [b.id]);
  useEffect(() => { load(); }, [load]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const r of log) out.push({
      id: `log-${r.id}`, at: r.created_at, kind: "log",
      icon: iconFor(r.action), title: r.action, detail: r.details,
      system: isSystemEvent(r.action),
    });
    for (const p of pays) out.push({
      id: `pay-${p.id}`, at: p.created_at, kind: "payment",
      icon: "💰", title: `${p.payment_type} received — $${Number(p.amount_applied).toLocaleString()}`,
      detail: p.method, system: false,
    });
    for (const t of tps) {
      const when = t.scheduled_at ?? t.created_at;
      if (!when) continue;
      out.push({
        id: `tp-${t.id}`, at: when, kind: "touchpoint",
        icon: TP_ICON[t.kind] ?? "📌",
        title: `${TP_LABEL[t.kind] ?? t.kind} ${t.status === "completed" ? "completed" : "scheduled"}`,
        detail: [t.assignee, t.notes].filter(Boolean).join(" · ") || null,
        system: false,
      });
    }
    for (const k of tasks) {
      if (!k.done || !k.created_at) continue;
      out.push({
        id: `task-${k.id}`, at: k.created_at, kind: "task",
        icon: "✅", title: `To-do completed: ${k.title}`,
        detail: k.assignee ?? null, system: false,
      });
    }
    return out.sort((a, z) => z.at.localeCompare(a.at));
  }, [log, pays, tps, tasks]);

  const filtered = items.filter((i) => {
    if (filter === "All") return true;
    if (filter === "Payments") return i.kind === "payment";
    if (filter === "Touchpoints") return i.kind === "touchpoint";
    if (filter === "System") return i.system;
    return i.kind === "log" && !i.system;
  });

  /* Day groups, with consecutive identical SYSTEM events compressed into one
     row ("📧 Menu discussion link sent ×4 ▸") — automation noise becomes a
     footnote instead of a wall. */
  const grouped = useMemo<[string, Row[]][]>(() => {
    const m = new Map<string, Row[]>();
    for (const i of filtered) {
      const k = dayKey(i.at);
      if (!m.has(k)) m.set(k, []);
      const rows = m.get(k)!;
      const last = rows[rows.length - 1];
      if (last && i.system && last.head.system && last.head.title === i.title) {
        last.run.push(i);
      } else {
        rows.push({ head: i, run: [] });
      }
    }
    return Array.from(m.entries());
  }, [filtered]);

  const latest = items[0] ?? null;

  async function saveQuick() {
    if (!composeText.trim()) return;
    await logActivity(b.id, b.invoice_num,
      composer === "call" ? "Phone Call Logged" : "Note Added", composeText.trim());
    setComposeText(""); setComposer(""); load();
  }

  /* ── Collapsed: one quiet line — the teaser ── */
  if (!open) {
    return (
      <section className="card px-5 py-4">
        <button className="w-full flex items-center justify-between gap-3 text-left group" onClick={() => setOpen(true)}>
          <div className="min-w-0">
            <span className="font-display font-bold text-sm">📖 Story</span>
            {latest && (
              <span className="text-xs text-slate-500 ml-3 truncate">
                Last: <b className="font-semibold">{latest.title.length > 44 ? latest.title.slice(0, 44) + "…" : latest.title}</b> · {ago(latest.at)}
              </span>
            )}
          </div>
          <span className="text-xs font-semibold text-navy whitespace-nowrap group-hover:underline">
            ▾ View complete story{items.length > 0 ? ` (${items.length} events)` : ""}
          </span>
        </button>
      </section>
    );
  }

  /* ── Expanded: the full narrative ── */
  return (
    <section className="card p-5 reveal">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="font-display font-bold text-sm">📖 Story</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map((fl) => (
              <button key={fl} onClick={() => setFilter(fl)}
                className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 transition-colors ${
                  filter === fl ? "bg-navy text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                {fl}
              </button>
            ))}
          </div>
          <button className="text-xs text-slate-400 hover:text-navy underline" onClick={() => setOpen(false)}>▴ collapse</button>
        </div>
      </div>

      <div className="flex gap-1.5 mb-3 mt-2">
        <button className="inline-flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-navy/5 border border-navy/15 rounded-full px-3 py-1 transition-colors"
          onClick={() => setComposer(composer === "call" ? "" : "call")}>☎️ Log a call</button>
        <button className="inline-flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-navy/5 border border-navy/15 rounded-full px-3 py-1 transition-colors"
          onClick={() => setComposer(composer === "note" ? "" : "note")}>📝 Add a note</button>
      </div>
      {composer && (
        <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-3 mb-3 reveal">
          <textarea className="field w-full !py-1.5 text-sm" rows={2} autoFocus
            placeholder={composer === "call" ? "Who called whom, and what was said…" : "Anything worth remembering…"}
            value={composeText} onChange={(e) => setComposeText(e.target.value)} />
          <div className="flex gap-2 mt-2">
            <button className="btn-primary !py-1 !px-3 text-xs" onClick={saveQuick}>Save</button>
            <button className="text-xs text-slate-400 underline" onClick={() => { setComposer(""); setComposeText(""); }}>cancel</button>
          </div>
        </div>
      )}

      {loadErr && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-2">⚠️ {loadErr}</p>}
      {grouped.length === 0 && !loadErr && <p className="text-sm text-slate-400 py-3">Nothing here yet — the story starts with the first action.</p>}

      {grouped.map(([key, rows]) => (
        <div key={key} className="mb-1">
          <div className="flex items-center gap-3 my-3">
            <span className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase whitespace-nowrap">{dayLabel(key)}</span>
            <div className="h-px bg-slate-100 flex-1" />
          </div>
          <div className="relative ml-2 pl-5 border-l-2 border-slate-100 space-y-2.5">
            {rows.map((row) => {
              const i = row.head;
              const n = row.run.length + 1;
              const isRun = row.run.length > 0;
              return (
                <div key={i.id} className="relative">
                  <span className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full ring-4 ring-white ${
                    i.system ? "bg-slate-300" : i.kind === "payment" ? "bg-emerald-500" : i.kind === "touchpoint" ? "bg-gold" : "bg-navy"}`} />
                  <button className="w-full text-left group" onClick={() => setExpanded(expanded === i.id ? null : i.id)}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`text-sm ${i.system ? "text-slate-400" : "font-medium"} group-hover:text-navy transition-colors`}>
                        {i.icon} {i.title}{isRun ? <b className="ml-1.5 text-[11px] rounded-full bg-slate-100 text-slate-500 px-1.5 py-0.5">×{n}</b> : null}
                      </span>
                      <span className="text-[11px] text-slate-300 whitespace-nowrap">{clock(i.at)}</span>
                    </div>
                    {expanded === i.id && (
                      <div className="text-xs text-slate-500 mt-1 reveal">
                        {i.detail && <p className="whitespace-pre-wrap">{i.detail}</p>}
                        {isRun && (
                          <p className="mt-0.5 text-slate-400">
                            All {n}: {[i, ...row.run].map((r) => clock(r.at)).join(" · ")}
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function iconFor(action: string): string {
  const a = action.toLowerCase();
  if (a.includes("payment") || a.includes("deposit") || a.includes("refund")) return "💰";
  if (a.includes("email") || a.includes("sent")) return "📧";
  if (a.includes("call")) return "☎️";
  if (a.includes("walkthrough")) return "🚶";
  if (a.includes("menu")) return "🍽️";
  if (a.includes("invoice")) return "🧾";
  if (a.includes("hold")) return "🔒";
  if (a.includes("lead")) return "🌱";
  if (a.includes("cancel")) return "🚫";
  if (a.includes("note")) return "📝";
  if (a.includes("inquiry") || a.includes("created")) return "⭐";
  if (a.includes("complet")) return "🎉";
  return "•";
}
