"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, logActivity } from "@/lib/supabase";
import {
  Booking, stageFor, fmtDate, fmtTime, eventHealth, nextBestAction,
  isSystemEvent, HealthInput,
} from "@/lib/workflow";

/* ── Row shapes (matching existing tables) ── */
interface LogRow { id: string; action: string; details: string | null; result?: string; created_at: string; }
interface PayRow { id: string; payment_type: string; method: string; amount_applied: number; created_at: string; }
interface TpRow { id: string; kind: string; status: string; scheduled_at: string | null; notes: string | null; assignee?: string | null; created_at?: string; }
interface TaskRow { id: string; title: string; done: boolean; assignee?: string | null; created_at?: string; due_date?: string | null; }

const TP_LABEL: Record<string, string> = { walkthrough: "Walkthrough", tasting: "Tasting", contract: "Contract", followup: "Follow-up" };
const TP_ICON: Record<string, string> = { walkthrough: "🚶", tasting: "🍴", contract: "📝", followup: "☎️" };

interface Item {
  id: string;
  at: string;              // ISO timestamp for ordering
  icon: string;
  title: string;
  detail: string | null;
  kind: "log" | "payment" | "touchpoint" | "task";
  system: boolean;         // gray (machine) vs colored (human)
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(key: string): string {
  const today = dayKey(new Date().toISOString());
  const y = new Date(Date.now() - 86400000);
  const yesterday = dayKey(y.toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const [yy, mm, dd] = key.split("-").map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const FILTERS = ["All", "Payments", "Touchpoints", "Notes & Calls", "System"] as const;
type Filter = typeof FILTERS[number];

/** Summary leads, timeline narrates, operations support.
 *  CurrentSituation answers "where are we now?" in five seconds; the Timeline
 *  tells "how did we get here?" as one continuous story. */
export default function BookingStory({ b, balance, children }: {
  b: Booking;
  balance: number | null;      // outstanding; null = financials unavailable
  children?: React.ReactNode;  // the action center — rendered between summary and timeline
}) {
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
      supabase.from("activity_log").select("*").eq("booking_id", b.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("payments").select("*").eq("booking_id", b.id),
      supabase.from("touchpoints").select("*").eq("booking_id", b.id),
      supabase.from("tasks").select("*").eq("booking_id", b.id),
    ]);
    const err = l.error ?? p.error ?? t.error ?? k.error;
    if (err) setLoadErr(`Timeline couldn't load: ${err.message}`);
    setLog((l.data ?? []) as LogRow[]);
    setPays((p.data ?? []) as PayRow[]);
    setTps((t.data ?? []) as TpRow[]);
    setTasks((k.data ?? []) as TaskRow[]);
  }, [b.id]);
  useEffect(() => { load(); }, [load]);

  /* ── merge four sources into one story ── */
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
    return i.kind === "log" && !i.system; // Notes & Calls = human log entries
  });

  const grouped = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of filtered) {
      const k = dayKey(i.at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
    return Array.from(m.entries());
  }, [filtered]);

  /* ── Current Situation derivations ── */
  const lastHuman = items.find((i) => !i.system && i.kind !== "task");
  const lastHumanDays = lastHuman
    ? Math.floor((Date.now() - new Date(lastHuman.at).getTime()) / 86400000) : null;
  const nextTp = tps
    .filter((t) => t.status !== "completed" && t.scheduled_at && new Date(t.scheduled_at).getTime() > Date.now())
    .sort((a, z) => a.scheduled_at!.localeCompare(z.scheduled_at!))[0] ?? null;

  const hin: HealthInput = {
    balance: balance ?? 0,
    depositReceived: pays.length > 0,
    lastHumanContactDays: lastHumanDays,
    nextTouchpointAt: nextTp?.scheduled_at ?? null,
  };
  const isLead = b.status === "lead" || b.status === "lead_lost";
  const terminal = b.status === "completed" || b.status === "cancelled";
  const health = !isLead && !terminal ? eventHealth(b, hin) : null;
  const nba = nextBestAction(b, hin);
  const st = stageFor(b.status);

  async function saveQuick() {
    if (!composeText.trim()) return;
    await logActivity(b.id, b.invoice_num,
      composer === "call" ? "Phone Call Logged" : "Note Added", composeText.trim());
    setComposeText(""); setComposer(""); load();
  }

  return (
    <div className="space-y-5">
      {/* ═══ CURRENT SITUATION — where are we now? ═══ */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight truncate">{b.contact_name}</h1>
            <p className="text-sm text-slate-500">
              {b.event_name || b.event_type || "Event"}{b.event_date ? ` · ${fmtDate(b.event_date)}` : " · date TBD"}{b.event_time ? ` · ${fmtTime(b.event_time)}` : ""}
            </p>
            <span className="inline-block mt-1.5 text-[11px] font-bold rounded-full px-2.5 py-0.5"
              style={{ background: st.color, color: st.textColor }}>{st.icon} {st.label}</span>
          </div>
          {health && (
            <div className="text-right shrink-0">
              <div className={`font-display font-bold text-sm ${health.tier === "healthy" ? "text-emerald-600" : health.tier === "attention" ? "text-amber-600" : "text-red-600"}`}>
                {health.tierLabel}
              </div>
              <div className="text-3xl font-display font-bold leading-none mt-0.5">{health.score}<span className="text-sm text-slate-300">/100</span></div>
            </div>
          )}
        </div>

        {/* Next Best Action — prescribes, doesn't describe */}
        <div className="mt-4 rounded-xl bg-navy text-white px-4 py-3 flex items-center gap-3">
          <span className="text-lg">{nba.icon}</span>
          <div>
            <div className="text-[10px] font-bold tracking-[0.15em] text-white/50 uppercase">Next Best Action</div>
            <div className="text-sm font-semibold">{nba.label}</div>
          </div>
        </div>

        {/* Situation grid */}
        <div className="grid sm:grid-cols-3 gap-x-6 gap-y-3 mt-4 text-sm">
          {balance != null && (
            <div>
              <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Balance</div>
              <div className={`font-semibold ${balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                {balance > 0 ? `$${balance.toLocaleString()} due` : "Paid in full"}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Next scheduled</div>
            <div className="font-medium">
              {nextTp ? `${TP_ICON[nextTp.kind] ?? "📌"} ${TP_LABEL[nextTp.kind] ?? nextTp.kind} · ${new Date(nextTp.scheduled_at!).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${clock(nextTp.scheduled_at!)}` : "Nothing on the calendar"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Last contact</div>
            <div className="font-medium">
              {lastHuman ? `${lastHumanDays === 0 ? "Today" : lastHumanDays === 1 ? "Yesterday" : `${lastHumanDays}d ago`} — ${lastHuman.title.length > 34 ? lastHuman.title.slice(0, 34) + "…" : lastHuman.title}` : "No contact yet"}
            </div>
          </div>
          {health && health.missing.length > 0 && (
            <div className="sm:col-span-3">
              <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Waiting on</div>
              <div className="flex gap-1.5 flex-wrap mt-1">
                {health.missing.map((m) => (
                  <span key={m} className="text-[11px] font-semibold rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-200 px-2.5 py-0.5">{m}</span>
                ))}
              </div>
            </div>
          )}
        </div>

      </section>

      {children}

      {/* ═══ TIMELINE — how did we get here? ═══ */}
      <section className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="font-display font-bold text-sm">📖 Timeline</h2>
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map((fl) => (
              <button key={fl} onClick={() => setFilter(fl)}
                className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 transition-colors ${
                  filter === fl ? "bg-navy text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                {fl}
              </button>
            ))}
          </div>
        </div>

        {/* Quick add — keep the story complete without leaving the page */}
        <div className="flex gap-1.5 mb-3">
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

        {grouped.map(([key, dayItems]) => (
          <div key={key} className="mb-1">
            <div className="flex items-center gap-3 my-3">
              <span className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase whitespace-nowrap">{dayLabel(key)}</span>
              <div className="h-px bg-slate-100 flex-1" />
            </div>
            <div className="relative ml-2 pl-5 border-l-2 border-slate-100 space-y-2.5">
              {dayItems.map((i) => (
                <div key={i.id} className="relative">
                  {/* spine dot */}
                  <span className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full ring-4 ring-white ${
                    i.system ? "bg-slate-300" : i.kind === "payment" ? "bg-emerald-500" : i.kind === "touchpoint" ? "bg-gold" : "bg-navy"}`} />
                  <button className="w-full text-left group" onClick={() => setExpanded(expanded === i.id ? null : i.id)}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`text-sm ${i.system ? "text-slate-400" : "font-medium"} group-hover:text-navy transition-colors`}>
                        {i.icon} {i.title}
                      </span>
                      <span className="text-[11px] text-slate-300 whitespace-nowrap">{clock(i.at)}</span>
                    </div>
                    {expanded === i.id && i.detail && (
                      <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap reveal">{i.detail}</p>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
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
