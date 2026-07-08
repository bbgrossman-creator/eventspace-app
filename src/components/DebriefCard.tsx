"use client";
// ═══════════════════════════════════════════════════════════════════════════
// EVENT DEBRIEF (Knowledge Architecture step 5)
// Three questions at close-out — free text, not ratings:
//   What worked?  What didn't?  What would you absolutely repeat?
// Renders ONLY on completed bookings. Part of knowledge_capture (core, on for
// every operating model — capture is cheap and ignorable). The text becomes
// searchable organizational wisdom when the Rolodex ships (step 6).
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { supabase, logActivity } from "@/lib/supabase";
import { Booking } from "@/lib/workflow";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";

interface DebriefRow {
  id: string; author: string | null; worked: string | null;
  didnt_work: string | null; would_repeat: string | null; created_at: string;
}

export default function DebriefCard({ b }: { b: Booking }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [rows, setRows] = useState<DebriefRow[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [worked, setWorked] = useState("");
  const [didnt, setDidnt] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCapabilities().then((c) => setCaps(c.caps)); }, []);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("event_debriefs")
      .select("id,author,worked,didnt_work,would_repeat,created_at")
      .eq("booking_id", b.id).order("created_at", { ascending: false });
    if (error) return; // table not migrated yet — card stays quiet
    setRows((data ?? []) as DebriefRow[]);
  }, [b.id]);
  useEffect(() => { if (b.status === "completed") load(); }, [b.status, load]);
  useEffect(() => {
    supabase.from("staff").select("id,name").eq("active", true).order("sort_order")
      .then(({ data }) => setStaff((data ?? []) as { id: string; name: string }[]));
  }, []);

  if (b.status !== "completed" || !caps?.knowledge_capture) return null;

  async function save() {
    if (!worked.trim() && !didnt.trim() && !repeat.trim()) return;
    setSaving(true); setErr("");
    const { error } = await supabase.from("event_debriefs").insert({
      booking_id: b.id, author: author || null,
      worked: worked.trim() || null, didnt_work: didnt.trim() || null,
      would_repeat: repeat.trim() || null,
    });
    if (error) { setErr(`Couldn't save: ${error.message} — run v168 SQL.`); setSaving(false); return; }
    await logActivity(b.id, b.invoice_num, "Debrief Recorded",
      `📝 ${author || "Someone"} answered the close-out questions.`);
    // Auto-complete any open "Debrief:" task the cron created for this event.
    const { data: t } = await supabase.from("tasks").select("id")
      .eq("booking_id", b.id).eq("done", false).ilike("title", "Debrief:%");
    for (const row of (t ?? []) as { id: string }[]) {
      await supabase.from("tasks").update({ done: true }).eq("id", row.id);
    }
    setWorked(""); setDidnt(""); setRepeat(""); setOpen(false); setSaving(false); load();
  }

  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-display font-semibold text-[15px]">📝 Debrief</h2>
        <button className="text-xs font-medium text-accent-ink hover:text-[#102F56] transition-colors"
          onClick={() => setOpen((v) => !v)}>＋ Add Debrief</button>
      </div>
      <p className="text-xs text-slate-400 mb-3">What this event taught us — every event should leave the company smarter than it was before.</p>
      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-3">⚠️ {err}</p>}

      {open && (
        <div className="rounded-lg bg-[#F6F8FB] ring-1 ring-[#E7EDF5] p-3 mb-3 space-y-2 reveal">
          <div>
            <label className="label !mb-0.5">What worked?</label>
            <textarea className="field w-full !py-1.5 text-[13px] !bg-white" rows={2} autoFocus
              value={worked} onChange={(e) => setWorked(e.target.value)} />
          </div>
          <div>
            <label className="label !mb-0.5">What didn&apos;t?</label>
            <textarea className="field w-full !py-1.5 text-[13px] !bg-white" rows={2}
              value={didnt} onChange={(e) => setDidnt(e.target.value)} />
          </div>
          <div>
            <label className="label !mb-0.5">What would you absolutely repeat?</label>
            <textarea className="field w-full !py-1.5 text-[13px] !bg-white" rows={2}
              value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </div>
          <div className="flex gap-1.5 items-center flex-wrap">
            <select className="field !py-1 !text-xs !bg-white flex-1 min-w-[90px]"
              value={author} onChange={(e) => setAuthor(e.target.value)}>
              <option value="">Who?</option>
              {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={save}
              disabled={saving || (!worked.trim() && !didnt.trim() && !repeat.trim())}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="text-xs text-slate-400 underline" onClick={() => setOpen(false)}>cancel</button>
          </div>
        </div>
      )}

      {rows.length === 0 && !open && (
        <p className="text-[13px] text-slate-400">Nothing recorded yet. Even one line — “the carving station line moved too slow” — is knowledge the next event can use.</p>
      )}
      <div className="space-y-3">
        {rows.map((d) => (
          <div key={d.id} className="rounded-lg ring-1 ring-[#E7EDF5] p-3 text-[13px]">
            <div className="text-[11px] text-slate-400 mb-1">
              {d.author ? <b className="font-semibold text-slate-500">{d.author}</b> : "Unattributed"} · {new Date(d.created_at).toLocaleDateString()}
            </div>
            {d.worked && <p><span className="font-semibold text-emerald-700">Worked:</span> {d.worked}</p>}
            {d.didnt_work && <p className="mt-0.5"><span className="font-semibold text-red-700">Didn&apos;t:</span> {d.didnt_work}</p>}
            {d.would_repeat && <p className="mt-0.5"><span className="font-semibold text-[#2F80ED]">Repeat:</span> {d.would_repeat}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
