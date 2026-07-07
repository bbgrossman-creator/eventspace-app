"use client";
/**
 * Touchpoints (v138) — operational customer milestones, a system entirely
 * separate from Communication. Communication answers "what was said?";
 * a touchpoint answers "what milestone is scheduled or completed?".
 *
 * A walkthrough is not a phone call — it will grow to carry staff, a room,
 * reminders, photos, an outcome, follow-up tasks. So it's modeled as its own
 * object, and it lives in its own amber cards, mirroring how Tasks flow into
 * Task Log:  Upcoming Touchpoints  →  Completed Touchpoints.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase, logActivity } from "@/lib/supabase";
import type { Booking } from "@/lib/workflow";
import { fmtDate, fmtTime } from "@/lib/workflow";

interface TpRow {
  id: string; kind: string | null; status: string | null;
  scheduled_at: string | null; assignee: string | null; notes: string | null;
}

// The operational milestone catalog — distinct from communication channels.
const TP_TYPES: { value: string; label: string; icon: string }[] = [
  { value: "walkthrough",    label: "Walkthrough",     icon: "🚶" },
  { value: "tasting",        label: "Menu Tasting",    icon: "🍽" },
  { value: "contract",       label: "Contract Signing", icon: "📋" },
  { value: "site_visit",     label: "Site Visit",      icon: "🏢" },
  { value: "planning",       label: "Planning Meeting", icon: "🗓" },
  { value: "photo_review",   label: "Photo Review",    icon: "📸" },
  { value: "final_payment",  label: "Final Payment",   icon: "💳" },
];
const tpMeta = (k: string | null) => TP_TYPES.find((t) => t.value === k) ?? { label: k ?? "Touchpoint", icon: "📌" };

function stamp(iso: string | null): string {
  if (!iso) return "no time set";
  return `${fmtDate(iso.slice(0, 10))} · ${fmtTime(iso.slice(11, 16))}`;
}

/** Shared card shell — amber identity, matching the OpsWorkspace Card language. */
function TpCard({ title, icon, action, onAction, children }: {
  title: string; icon: string; action?: string; onAction?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] ring-1 bg-[#FFF8EA] ring-[#F0D89A]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid place-items-center w-6 h-6 rounded-lg text-[13px] shrink-0 bg-[#FBEAC0] text-[#B88A1C]">{icon}</span>
          <h3 className="font-display font-semibold text-[15px] leading-none truncate">{title}</h3>
        </div>
        {action && onAction && (
          <button className="text-xs font-medium text-[#B88A1C] hover:text-[#8A6712] transition-colors whitespace-nowrap shrink-0"
            onClick={onAction}>＋ {action}</button>
        )}
      </div>
      {children}
    </div>
  );
}

function TpEmpty({ head, sub }: { head: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      <span className="text-[17px] opacity-40 shrink-0 leading-none mt-0.5">📌</span>
      <div>
        <p className="text-[13px] font-medium text-slate-500 leading-snug">{head}</p>
        {sub && <p className="text-[12px] text-slate-400 leading-snug mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function TouchpointsCard({ b }: { b: Booking }) {
  const [items, setItems] = useState<TpRow[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [err, setErr] = useState("");
  const [composer, setComposer] = useState(false);
  const [showDoneAll, setShowDoneAll] = useState(false);

  // Composer state
  const [tKind, setTKind] = useState("walkthrough");
  const [tWhen, setTWhen] = useState("");
  const [tWho, setTWho] = useState("");
  const [tNotes, setTNotes] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("touchpoints")
      .select("id,kind,status,scheduled_at,assignee,notes")
      .eq("booking_id", b.id).order("scheduled_at", { ascending: true });
    if (error) { setErr(`Couldn't load touchpoints: ${error.message} — run the touchpoints SQL if the table is missing.`); return; }
    setErr("");
    setItems((data ?? []) as TpRow[]);
  }, [b.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.from("staff").select("id,name").eq("active", true).order("sort_order")
      .then(({ data }) => setStaff((data ?? []) as { id: string; name: string }[]));
  }, []);

  async function schedule() {
    if (!tWhen) { setErr("Pick a date and time for this touchpoint."); return; }
    const { error } = await supabase.from("touchpoints").insert({
      booking_id: b.id, invoice_num: b.invoice_num, kind: tKind,
      scheduled_at: new Date(tWhen).toISOString(),
      assignee: tWho || null, notes: tNotes.trim() || null, status: "scheduled",
    });
    if (error) { setErr(`Couldn't schedule it: ${error.message} — run the touchpoints SQL if the table is missing.`); return; }
    await logActivity(b.id, b.invoice_num, `${tpMeta(tKind).label} Scheduled`,
      `Set for ${new Date(tWhen).toLocaleString()}`);
    setTWhen(""); setTWho(""); setTNotes(""); setTKind("walkthrough"); setComposer(false); load();
  }

  async function complete(t: TpRow) {
    const { error } = await supabase.from("touchpoints").update({ status: "completed" }).eq("id", t.id);
    if (error) { setErr(`Couldn't complete it: ${error.message}`); return; }
    await logActivity(b.id, b.invoice_num, `${tpMeta(t.kind).label} Completed`, t.notes ?? "");
    load();
  }
  async function remove(t: TpRow) {
    const { error } = await supabase.from("touchpoints").delete().eq("id", t.id);
    if (error) { setErr(`Couldn't remove it: ${error.message}`); return; }
    load();
  }

  const upcoming = items.filter((t) => t.status !== "completed");
  const completed = items.filter((t) => t.status === "completed")
    .sort((a, c) => (c.scheduled_at ?? "").localeCompare(a.scheduled_at ?? ""));
  const shownDone = showDoneAll ? completed : completed.slice(0, 4);

  return (
    <div className="space-y-3">
      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">⚠️ {err}</p>}

      {/* ═══ Upcoming Touchpoints — the scheduled queue ═══ */}
      <TpCard title="Upcoming Touchpoints" icon="📅" action="Schedule Touchpoint" onAction={() => setComposer((v) => !v)}>
        {composer && (
          <div className="rounded-lg bg-white ring-1 ring-[#F0D89A] p-2.5 mb-3 space-y-2 reveal">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#B88A1C]/70 mb-1">Type</div>
              <div className="flex gap-1.5 flex-wrap">
                {TP_TYPES.map((t) => (
                  <button key={t.value}
                    className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${tKind === t.value
                      ? "bg-[#B88A1C] text-white border-[#B88A1C]" : "border-[#F0D89A] text-[#8A6712] hover:bg-[#FFF8EA]"}`}
                    onClick={() => setTKind(t.value)}>{t.icon} {t.label}</button>
                ))}
              </div>
            </div>
            <input type="datetime-local" className="field !py-1.5 !text-xs !bg-white w-full"
              value={tWhen} onChange={(e) => setTWhen(e.target.value)} />
            <textarea className="field w-full !py-1.5 text-[13px] !bg-white" rows={2}
              placeholder="Notes for this milestone…" value={tNotes} onChange={(e) => setTNotes(e.target.value)} />
            <div className="flex gap-1.5 items-center flex-wrap">
              <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[90px]"
                value={tWho} onChange={(e) => setTWho(e.target.value)}>
                <option value="">Assigned to…</option>
                {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <button className="!py-1 !px-2.5 text-xs rounded-lg bg-[#B88A1C] text-white font-semibold hover:bg-[#8A6712] transition-colors" onClick={schedule}>Save</button>
              <button className="text-xs text-slate-400 underline" onClick={() => setComposer(false)}>cancel</button>
            </div>
          </div>
        )}

        {upcoming.length === 0 && !composer && (
          <TpEmpty head="Nothing scheduled." sub="Walkthroughs, tastings, and site visits will appear here." />
        )}
        <div className="divide-y divide-[#F0D89A]/50">
          {upcoming.map((t) => (
            <div key={t.id} className="flex gap-2.5 py-2 first:pt-0 last:pb-0">
              <span className="grid place-items-center w-7 h-7 rounded-lg text-[13px] shrink-0 bg-[#FBEAC0] text-[#B88A1C]">{tpMeta(t.kind).icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-slate-700 leading-tight">{tpMeta(t.kind).label}</div>
                <div className="text-[11px] text-slate-500">{stamp(t.scheduled_at)}{t.assignee ? ` · 👤 ${t.assignee}` : ""}</div>
                {t.notes && <div className="text-[11px] text-slate-400 mt-0.5">{t.notes}</div>}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <button className="text-[11px] font-semibold text-emerald-700 hover:underline" onClick={() => complete(t)}>✓ Complete</button>
                <button className="text-[10px] text-slate-300 hover:text-red-500 underline" onClick={() => remove(t)}>remove</button>
              </div>
            </div>
          ))}
        </div>

        {/* Completed — same card, a quiet divider marks the boundary */}
        {completed.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#F0D89A]/70">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#B88A1C]/60 mb-1.5">Completed</div>
            <div className="divide-y divide-[#F0D89A]/40">
              {shownDone.map((t) => (
                <div key={t.id} className="flex gap-2.5 py-1.5 first:pt-0 last:pb-0">
                  <span className="grid place-items-center w-6 h-6 rounded-lg text-[12px] shrink-0 bg-[#F3ECD8] text-[#9A8442]">{tpMeta(t.kind).icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-slate-500 leading-tight line-through">{tpMeta(t.kind).label}</div>
                    <div className="text-[11px] text-slate-400">{stamp(t.scheduled_at)}{t.assignee ? ` · ${t.assignee}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
            {completed.length > 4 && (
              <button className="text-[11px] text-slate-400 hover:text-[#B88A1C] underline mt-2"
                onClick={() => setShowDoneAll((v) => !v)}>
                {showDoneAll ? "Show less" : `View all ${completed.length} completed →`}
              </button>
            )}
          </div>
        )}
      </TpCard>
    </div>
  );
}
