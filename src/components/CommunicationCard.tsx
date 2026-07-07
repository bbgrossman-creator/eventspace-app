"use client";
/**
 * Communication Hub (v129) — the customer-facing stream.
 *
 *   Activity  = what the system did
 *   Task Log  = what the team did
 *   THIS      = what crossed the line to the customer
 *
 * The router: "did the customer hear it or say it?" → it belongs here.
 *
 * Three feeds merge at READ time (no duplicate storage):
 *   • communications rows (manual logs; later: portal + integrations)
 *   • outbound automation emails (mirrored from activity_log)
 *   • completed touchpoints (a finished menu call IS a customer interaction)
 *
 * v129 is deliberately internal-only: manual logging + mirrored outbound.
 * No sending layer, no inbox, no portal — but the schema already speaks
 * portal (source/direction/customer_id), so those arrive as new writers.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate } from "@/lib/workflow";

interface CommRow {
  id: string; channel: string; direction: string; author: string | null;
  body: string; occurred_at: string; source: string; task_id: string | null;
}
interface Entry {
  key: string; icon: string; dirMark: string; summary: string;
  who: string | null; when: string; auto: boolean;
}
interface StaffLite { id: string; name: string; }

const CHANNELS: { value: string; label: string; icon: string }[] = [
  { value: "call",      label: "Call",      icon: "☎" },
  { value: "email",     label: "Email",     icon: "📧" },
  { value: "text",      label: "Text",      icon: "💬" },
  { value: "whatsapp",  label: "WhatsApp",  icon: "🟢" },
  { value: "in_person", label: "In person", icon: "🤝" },
];
const chIcon = (c: string) => CHANNELS.find((x) => x.value === c)?.icon ?? "•";

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return `${fmtDate(iso.slice(0, 10))} ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function CommunicationCard({ b }: { b: Booking }) {
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [rows, setRows] = useState<CommRow[]>([]);
  const [mirrored, setMirrored] = useState<Entry[]>([]);
  const [err, setErr] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [composer, setComposer] = useState(false);
  const [cChannel, setCChannel] = useState("call");
  const [cDir, setCDir] = useState<"outbound" | "inbound">("outbound");
  const [cBody, setCBody] = useState("");
  const [cWho, setCWho] = useState("");
  const [cWhen, setCWhen] = useState("");

  const load = useCallback(async () => {
    const [comms, act, tps] = await Promise.all([
      supabase.from("communications")
        .select("id,channel,direction,author,body,occurred_at,source,task_id")
        .eq("booking_id", b.id).order("occurred_at", { ascending: false }),
      supabase.from("activity_log")
        .select("id,action,details,result,created_at")
        .eq("booking_id", b.id).ilike("action", "%email%").eq("result", "SUCCESS")
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("touchpoints")
        .select("id,kind,status,scheduled_at,assignee")
        .eq("booking_id", b.id).eq("status", "completed")
        .order("scheduled_at", { ascending: false }).limit(50),
    ]);
    if (comms.error) { setErr(`Couldn't load communications: ${comms.error.message} — run v129_communications.sql.`); return; }
    setErr("");
    setRows((comms.data ?? []) as CommRow[]);
    const m: Entry[] = [];
    for (const a of (act.data ?? []) as { id: string; action: string; details: string | null; created_at: string }[]) {
      m.push({
        key: `act-${a.id}`, icon: "📧", dirMark: "→",
        summary: (a.details ?? a.action).replace(/^"|"$/g, ""),
        who: null, when: a.created_at, auto: true,
      });
    }
    for (const t of (tps.data ?? []) as { id: string; kind: string | null; scheduled_at: string | null; assignee: string | null }[]) {
      if (!t.scheduled_at) continue;
      m.push({
        key: `tp-${t.id}`, icon: t.kind?.toLowerCase().includes("call") ? "☎" : "🤝", dirMark: "→",
        summary: `${t.kind ?? "Touchpoint"} completed`,
        who: t.assignee, when: t.scheduled_at, auto: true,
      });
    }
    setMirrored(m);
  }, [b.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.from("staff").select("id,name").eq("active", true).order("sort_order")
      .then(({ data }) => setStaff((data ?? []) as StaffLite[]));
  }, []);

  async function log() {
    if (!cBody.trim()) return;
    const { error } = await supabase.from("communications").insert({
      booking_id: b.id, invoice_num: b.invoice_num,
      channel: cChannel, direction: cDir,
      author: cWho || null, body: cBody.trim(),
      occurred_at: cWhen ? new Date(cWhen).toISOString() : new Date().toISOString(),
      source: "manual",
    });
    if (error) { setErr(`Couldn't log it: ${error.message} — run v129_communications.sql.`); return; }
    setCBody(""); setCWhen(""); setComposer(false); load();
  }

  const entries: Entry[] = [
    ...rows.map((r) => ({
      key: `c-${r.id}`, icon: chIcon(r.channel),
      dirMark: r.direction === "inbound" ? "←" : "→",
      summary: r.body, who: r.author, when: r.occurred_at, auto: false,
    })),
    ...mirrored,
  ].sort((a, z) => z.when.localeCompare(a.when));
  const shown = showAll ? entries : entries.slice(0, 4);

  return (
    <div className="rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-[#E6EAF2]">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="font-display font-bold text-[15px]">Communication</h3>
        <button className="text-[11px] font-semibold text-slate-400 hover:text-navy transition-colors"
          onClick={() => setComposer((v) => !v)}>＋ Log</button>
      </div>
      {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2.5 py-1.5 mb-2">{err}</p>}

      {composer && (
        <div className="rounded-lg bg-slate-50 p-2.5 mb-3 space-y-1.5 reveal">
          <div className="flex gap-1.5 flex-wrap">
            {CHANNELS.map((c) => (
              <button key={c.value}
                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${cChannel === c.value
                  ? "bg-navy text-white border-navy" : "border-slate-200 text-slate-500 hover:bg-white"}`}
                onClick={() => setCChannel(c.value)}>{c.icon} {c.label}</button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button className={`text-[11px] px-2 py-1 rounded-full border flex-1 transition-colors ${cDir === "outbound"
              ? "bg-navy text-white border-navy" : "border-slate-200 text-slate-500 hover:bg-white"}`}
              onClick={() => setCDir("outbound")}>→ We reached out</button>
            <button className={`text-[11px] px-2 py-1 rounded-full border flex-1 transition-colors ${cDir === "inbound"
              ? "bg-navy text-white border-navy" : "border-slate-200 text-slate-500 hover:bg-white"}`}
              onClick={() => setCDir("inbound")}>← They contacted us</button>
          </div>
          <textarea className="field w-full !py-1.5 text-[13px] !bg-white" rows={2} autoFocus
            placeholder="What was said?" value={cBody} onChange={(e) => setCBody(e.target.value)} />
          <div className="flex gap-1.5 items-center flex-wrap">
            <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[90px]"
              value={cWho} onChange={(e) => setCWho(e.target.value)}>
              <option value="">Who?</option>
              {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <input type="datetime-local" className="field !py-1 !text-xs !bg-white w-[11.5rem]"
              value={cWhen} onChange={(e) => setCWhen(e.target.value)} title="When (blank = now)" />
            <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={log}>Save</button>
            <button className="text-xs text-slate-400 underline" onClick={() => setComposer(false)}>cancel</button>
          </div>
        </div>
      )}

      {entries.length === 0 && !composer && (
        <p className="text-[13px] text-slate-400 leading-relaxed">
          No customer communication logged yet. Calls, emails, and messages land here.
        </p>
      )}
      <div className="space-y-2.5">
        {shown.map((e) => (
          <div key={e.key} className="text-[13px] leading-snug">
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0">{e.icon}</span>
              <span className={`shrink-0 font-bold ${e.dirMark === "←" ? "text-emerald-600" : "text-slate-400"}`}>{e.dirMark}</span>
              <span className="min-w-0 whitespace-pre-wrap">{e.summary}</span>
            </div>
            <div className="text-[10px] text-slate-400 pl-6">
              {e.who && <b className="font-semibold text-slate-500">{e.who} · </b>}
              {fmtWhen(e.when)}{e.auto && <span className="ml-1 text-slate-300">auto</span>}
            </div>
          </div>
        ))}
      </div>
      {entries.length > 4 && (
        <button className="text-[11px] text-slate-400 hover:text-navy underline mt-2.5"
          onClick={() => setShowAll((v) => !v)}>
          {showAll ? "show less" : `view all ${entries.length} →`}
        </button>
      )}
    </div>
  );
}
