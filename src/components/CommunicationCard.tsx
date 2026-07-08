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
 *
 * v2 visual refresh: white card, blue accent family (was soft-purple) —
 * matches the EventCore brand system in globals.css (--ec-blue / --ec-navy-hover).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate } from "@/lib/workflow";

interface CommRow {
  id: string; channel: string; direction: string; author: string | null;
  body: string; occurred_at: string; source: string; task_id: string | null;
  requires_follow_up?: boolean | null; follow_up_task_id?: string | null;
}
interface Entry {
  key: string; channel: string; icon: string; dirMark: string; summary: string;
  who: string | null; when: string; auto: boolean; source: string;
  commId?: string; direction?: string;
  needsFollowUp?: boolean; followUpTaskId?: string | null;
}
interface StaffLite { id: string; name: string; }

const CHANNELS: { value: string; label: string; icon: string }[] = [
  { value: "call",       label: "Call",       icon: "☎" },
  { value: "email",      label: "Email",      icon: "✉" },
  { value: "text",       label: "Text",       icon: "💬" },
  { value: "whatsapp",   label: "WhatsApp",   icon: "🟢" },
  { value: "in_person",  label: "In person",  icon: "🤝" },
];
const chIcon = (c: string) => CHANNELS.find((x) => x.value === c)?.icon ?? "•";
// Communication reads as "conversation" via the brand accent blue — one
// consistent family, not competing with the status colors elsewhere.
const chTile = (_c: string) => "bg-accent-tint text-accent-ink";
// "did the customer hear it or say it?" → a plain-language label per row.
function dirLabel(channel: string, direction: string): string {
  const inbound = direction === "inbound" || direction === "inbound_customer";
  if (channel === "call")      return inbound ? "They called us" : "We called";
  if (channel === "email")     return inbound ? "They emailed us" : "We emailed";
  if (channel === "text")      return inbound ? "They texted us" : "We texted";
  if (channel === "whatsapp")  return inbound ? "They messaged us" : "We messaged";
  if (channel === "in_person") return "We met in person";
  if (channel === "portal")    return inbound ? "They messaged us" : "We replied";
  return inbound ? "They contacted us" : "We reached out";
}

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
  const [cFollow, setCFollow] = useState(false);
  const [taskDone, setTaskDone] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const [comms, act] = await Promise.all([
      supabase.from("communications")
        .select("id,channel,direction,author,body,occurred_at,source,task_id,requires_follow_up,follow_up_task_id")
        .eq("booking_id", b.id).order("occurred_at", { ascending: false }),
      supabase.from("activity_log")
        .select("id,action,details,result,created_at")
        .eq("booking_id", b.id).ilike("action", "%email%").eq("result", "SUCCESS")
        .order("created_at", { ascending: false }).limit(50),
    ]);
    if (comms.error) { setErr(`Couldn't load communications: ${comms.error.message} — run v129_communications.sql.`); return; }
    setErr("");
    const cr = (comms.data ?? []) as CommRow[];
    setRows(cr);
    const taskIds = cr.map((r) => r.follow_up_task_id).filter(Boolean) as string[];
    if (taskIds.length) {
      const { data: tk } = await supabase.from("tasks").select("id,done").in("id", taskIds);
      const m: Record<string, boolean> = {};
      for (const t of (tk ?? []) as { id: string; done: boolean }[]) m[t.id] = t.done;
      setTaskDone(m);
    }
    const m: Entry[] = [];
    for (const a of (act.data ?? []) as { id: string; action: string; details: string | null; created_at: string }[]) {
      m.push({
        key: `act-${a.id}`, channel: "email", icon: "📧", dirMark: "→",
        summary: (a.details ?? a.action).replace(/^"|"$/g, ""),
        who: null, when: a.created_at, auto: true, source: "system",
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
      customer_contact_value: cDir === "inbound" ? (b.phone || b.email || null) : null,
      occurred_at: cWhen ? new Date(cWhen).toISOString() : new Date().toISOString(),
      requires_follow_up: cDir === "inbound" && cFollow,
      source: "manual",
    });
    if (error) { setErr(`Couldn't log it: ${error.message} — run v131_communication_followup.sql.`); return; }
    setCBody(""); setCWhen(""); setCFollow(false); setComposer(false); load();
  }

  async function createFollowUpTask(commId: string, body: string) {
    const short = body.length > 60 ? body.slice(0, 57) + "…" : body;
    const { data, error } = await supabase.from("tasks").insert({
      booking_id: b.id, invoice_num: b.invoice_num,
      title: `Follow up: ${short}`, assignee: null, done: false,
    }).select("id").single();
    if (error || !data) { setErr(`Couldn't create the task: ${error?.message ?? "unknown"}`); return; }
    const { error: e2 } = await supabase.from("communications")
      .update({ follow_up_task_id: data.id }).eq("id", commId);
    if (e2) { setErr(`Task made, but couldn't link it: ${e2.message}`); return; }
    load();
  }
  async function dismissFollowUp(commId: string) {
    const { error } = await supabase.from("communications")
      .update({ requires_follow_up: false }).eq("id", commId);
    if (error) { setErr(`Couldn't clear it: ${error.message}`); return; }
    load();
  }

  const entries: Entry[] = [
    ...rows.map((r) => ({
      key: `c-${r.id}`, channel: r.channel, icon: chIcon(r.channel),
      dirMark: r.direction.startsWith("inbound") ? "←" : "→",
      summary: r.body, who: r.author, when: r.occurred_at, auto: false, source: r.source,
      commId: r.id, direction: r.direction,
      needsFollowUp: !!r.requires_follow_up, followUpTaskId: r.follow_up_task_id ?? null,
    })),
    ...mirrored,
  ].sort((a, z) => z.when.localeCompare(a.when));
  const shown = showAll ? entries : entries.slice(0, 4);

  return (
    <div className="rounded-2xl bg-white p-4 ec-card-shadow ring-1 ring-[#E7EDF5]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid place-items-center w-6 h-6 rounded-lg text-[13px] shrink-0 bg-accent-tint text-accent-ink">💬</span>
          <h3 className="font-display font-semibold text-[15px] leading-none truncate text-accent-ink">Communication</h3>
        </div>
        <button className="text-xs font-medium text-accent-ink hover:text-[#102F56] transition-colors whitespace-nowrap shrink-0"
          onClick={() => setComposer((v) => !v)}>＋ Log Communication</button>
      </div>
      {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2.5 py-1.5 mb-2">{err}</p>}

      {composer && (
        <div className="rounded-lg bg-[#F6F8FB] ring-1 ring-[#E7EDF5] p-2.5 mb-3 space-y-2 reveal">
          <div className="flex gap-1.5 flex-wrap">
            {CHANNELS.map((c) => (
              <button key={c.value}
                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${cChannel === c.value
                  ? "bg-accent text-white border-transparent" : "border-[#E7EDF5] text-accent-ink hover:bg-white"}`}
                onClick={() => setCChannel(c.value)}>{c.icon} {c.label}</button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button className={`text-[11px] px-2 py-1 rounded-full border flex-1 transition-colors ${cDir === "outbound"
              ? "bg-accent text-white border-transparent" : "border-[#E7EDF5] text-accent-ink hover:bg-white"}`}
              onClick={() => setCDir("outbound")}>→ We reached out</button>
            <button className={`text-[11px] px-2 py-1 rounded-full border flex-1 transition-colors ${cDir === "inbound"
              ? "bg-accent text-white border-transparent" : "border-[#E7EDF5] text-accent-ink hover:bg-white"}`}
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
            <button className="btn-accent !py-1 !px-2.5 text-xs" onClick={log}>Save</button>
            <button className="text-xs text-slate-400 underline" onClick={() => setComposer(false)}>cancel</button>
          </div>
          {cDir === "inbound" && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer pt-0.5">
              <input type="checkbox" className="accent-[#4A9EFF]" checked={cFollow} onChange={(e) => setCFollow(e.target.checked)} />
              This needs follow-up
            </label>
          )}
        </div>
      )}

      {entries.length === 0 && !composer && (
        <div className="flex items-start gap-2.5 py-1">
          <span className="text-[17px] opacity-40 shrink-0 leading-none mt-0.5">💬</span>
          <div>
            <p className="text-[13px] font-medium text-slate-500 leading-snug">No customer communication yet</p>
            <p className="text-[12px] text-slate-400 leading-snug mt-0.5">Calls, emails, texts, WhatsApps, and in-person notes will appear here.</p>
          </div>
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {shown.map((e) => {
          const inbound = e.dirMark === "←";
          const dotColor = e.source === "manual" ? "#cbd5e1"
            : e.source === "system" || e.source === "mirrored" ? "#A9CDF5" : "#93c5fd";
          return (
          <div key={e.key} className="flex gap-2.5 py-2 first:pt-0 last:pb-0">
            <span className={`grid place-items-center w-7 h-7 rounded-lg text-[13px] shrink-0 ${chTile(e.channel)}`}>{e.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-[12px] font-bold leading-none ${inbound ? "text-emerald-700" : "text-slate-600"}`}>{dirLabel(e.channel, e.direction ?? (inbound ? "inbound" : "outbound"))}</span>
                <span className="w-1.5 h-1.5 rounded-full shrink-0 ml-auto" style={{ background: dotColor }}
                  title={e.source === "manual" ? "Logged by staff" : e.source === "system" || e.source === "mirrored" ? "System / auto" : "Integration"} />
              </div>
              <p className="text-[13px] text-slate-700 leading-snug mt-0.5 whitespace-pre-wrap">{e.summary}</p>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {e.who && <b className="font-semibold text-slate-500">{e.who} · </b>}
                {fmtWhen(e.when)}{e.auto && <span className="ml-1 text-slate-300">auto</span>}
              </div>
              {e.commId && (e.needsFollowUp || e.followUpTaskId) && (
                <div className="mt-1">
                  {e.followUpTaskId ? (
                    <span className={`inline-block text-[10px] font-semibold rounded-full px-2 py-0.5 ${taskDone[e.followUpTaskId] ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {taskDone[e.followUpTaskId] ? "✓ Follow-up done" : "◷ Follow-up open"}
                    </span>
                  ) : e.needsFollowUp ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block text-[10px] font-semibold rounded-full px-2 py-0.5 bg-amber-50 text-amber-700">Needs follow-up</span>
                      <button className="text-[10px] font-semibold text-accent-ink hover:underline"
                        onClick={() => createFollowUpTask(e.commId!, e.summary)}>＋ Create task</button>
                      <button className="text-[10px] text-slate-300 hover:text-slate-500 underline"
                        onClick={() => dismissFollowUp(e.commId!)}>dismiss</button>
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>
      {entries.length > 4 && (
        <button className="text-[11px] text-slate-400 hover:text-accent-ink underline mt-2.5"
          onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show less" : `View all ${entries.length} communications →`}
        </button>
      )}
    </div>
  );
}
