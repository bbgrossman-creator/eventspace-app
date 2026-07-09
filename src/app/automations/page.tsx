"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase, logActivity } from "@/lib/supabase";
import {
  Automation, TriggerAnchor, ANCHOR_LABELS, PLACEHOLDERS, timingLabel,
} from "@/lib/automation";
import { sendEmail } from "@/lib/sendEmail";
import PageGuard from "@/components/PageGuard";

const UNITS = [
  { label: "minutes", mins: 1 }, { label: "hours", mins: 60 }, { label: "days", mins: 1440 },
  { label: "weeks", mins: 10080 }, { label: "months", mins: 43200 },
];
const ANCHORS: TriggerAnchor[] = ["event", "created", "deposit", "hold_expires", "menu_call", "event_completed"];
const CATEGORY_ORDER = ["Lead & Inquiry", "Booking", "Planning", "Pre-Event", "Post-Event", "Operational Alerts"];

function splitOffset(mins: number): { n: number; unit: number; dir: "before" | "after" } {
  const dir = mins <= 0 ? "before" : "after";
  const m = Math.abs(mins);
  for (const u of [...UNITS].reverse()) {
    if (m > 0 && m % u.mins === 0) return { n: m / u.mins, unit: u.mins, dir };
  }
  return { n: m, unit: 1, dir };
}

function Automations() {
  const [rows, setRows] = useState<Automation[]>([]);
  const [sel, setSel] = useState<Automation | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("email_automations").select("*").order("sort_order");
    setRows((data ?? []) as Automation[]);
  }
  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const cats = Array.from(new Set(rows.map((r) => r.category)));
    cats.sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 99) - (CATEGORY_ORDER.indexOf(b) + 99)
      + (CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)));
    return CATEGORY_ORDER.filter((c) => cats.includes(c))
      .concat(cats.filter((c) => !CATEGORY_ORDER.includes(c)))
      .map((c) => ({ cat: c, items: rows.filter((r) => r.category === c) }));
  }, [rows]);

  async function toggle(a: Automation) {
    await supabase.from("email_automations").update({ enabled: !a.enabled }).eq("id", a.id);
    await logActivity(null, "—", "Automation " + (!a.enabled ? "Enabled" : "Disabled"), a.name);
    load();
    if (sel?.id === a.id) setSel({ ...sel, enabled: !a.enabled });
  }

  async function save() {
    if (!sel) return;
    setBusy(true);
    const { error } = await supabase.from("email_automations").update({
      enabled: sel.enabled, recipient: sel.recipient, subject: sel.subject, body: sel.body,
      trigger: sel.trigger, offset_minutes: sel.offset_minutes,
      updated_at: new Date().toISOString(),
    }).eq("id", sel.id);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    await logActivity(null, "—", "Automation Updated", `${sel.name} — ${timingLabel(sel)}`);
    setMsg({ ok: true, text: "Saved ✓ — the scheduler uses the new settings on its next pass." });
    load();
  }

  async function testSend() {
    if (!sel) return;
    const sample: Record<string, string> = {
      contact_name: "Test Customer", event_name: "Sample Bar Mitzvah", event_type: "Bar Mitzvah",
      event_date: "Dec 15, 2026", event_time: "7:00 PM", invoice_num: "560099",
      phone: "(555) 555-5555", email: "customer@example.com", menu_type: "Single Buffet",
      guests: "80", hold_expires: "tomorrow 3:00 PM", menu_call_time: "Sunday 6:00 PM",
      deposit_amount: "$500.00", balance: "$2,154.96", total: "$2,654.96",
      scheduling_link: "https://calendar.app.google/MuzMridpmcgdgj9r9", business_phone: "(848) 299-9079",
    };
    const render = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => sample[k] ?? "");
    const res = await sendEmail({
      to: "__internal__",
      subject: `[TEST] ${render(sel.subject)}`,
      text: render(sel.body),
      action: `Test Send: ${sel.name}`,
    });
    setMsg(res.ok ? { ok: true, text: `Test sent ✓ ${res.detail}` } : { ok: false, text: `Test failed: ${res.detail}` });
  }

  const off = sel ? splitOffset(sel.offset_minutes) : null;

  return (
    <div>
      <header className="mb-6">
        <h1 className="page-title">Email Automations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every automated email, fully configurable — what it says, who gets it, and exactly when it goes out.
          The scheduler runs every 15 minutes; each automation sends at most once per booking.
        </p>
        <div className="gold-rule mt-3" />
      </header>

      <div className="grid lg:grid-cols-[360px_1fr] gap-5 items-start">
        {/* ── Catalog ── */}
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.cat}>
              <div className="text-[10px] font-bold tracking-[0.18em] text-slate-400 uppercase px-1 mb-1.5">{g.cat}</div>
              <div className="space-y-1.5">
                {g.items.map((a) => (
                  <div key={a.id}
                    className={`card px-3.5 py-2.5 flex items-center gap-3 cursor-pointer ${sel?.id === a.id ? "ring-2 ring-navy" : ""}`}
                    onClick={() => { setSel(a); setMsg(null); }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggle(a); }}
                      className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${a.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
                      title={a.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${a.enabled ? "left-[18px]" : "left-0.5"}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${a.enabled ? "" : "text-slate-400"}`}>
                        {a.name} {a.recipient === "internal" && <span className="text-[10px] text-slate-400 font-bold">STAFF</span>}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{timingLabel(a)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Editor ── */}
        {sel ? (
          <div className="card p-5 space-y-4 sticky top-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-display font-bold">{sel.name}</h2>
              <div className="flex gap-2">
                <button className="btn-ghost !py-1.5" onClick={testSend}>📨 Send Test (to you)</button>
                <button className="btn-primary !py-1.5" disabled={busy} onClick={save}>{busy ? "Saving…" : "💾 Save"}</button>
              </div>
            </div>
            {msg && (
              <div className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                {msg.text}
              </div>
            )}

            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={sel.enabled} onChange={(e) => setSel({ ...sel, enabled: e.target.checked })} />
                Enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                Recipient:
                <select className="field !w-auto !py-1" value={sel.recipient}
                  onChange={(e) => setSel({ ...sel, recipient: e.target.value as "customer" | "internal" })}>
                  <option value="customer">Customer</option>
                  <option value="internal">Staff (internal inbox)</option>
                </select>
              </label>
            </div>

            {/* Timing rule */}
            {sel.trigger === "action" ? (
              <div className="rounded-lg bg-goldsoft border border-gold/30 px-4 py-3 text-sm">
                <b>Timing:</b> fires immediately when its action happens (e.g. a deposit is recorded).
                Action-triggered emails have no schedule to configure — only enable/disable and content.
              </div>
            ) : off && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <label className="label">When does it send?</label>
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <input className="field !w-20" type="number" min="0" value={off.n}
                    onChange={(e) => {
                      const n = parseInt(e.target.value) || 0;
                      setSel({ ...sel, offset_minutes: (off.dir === "before" ? -1 : 1) * n * off.unit });
                    }} />
                  <select className="field !w-auto" value={off.unit}
                    onChange={(e) => {
                      const u = parseInt(e.target.value);
                      setSel({ ...sel, offset_minutes: (off.dir === "before" ? -1 : 1) * off.n * u });
                    }}>
                    {UNITS.map((u) => <option key={u.label} value={u.mins}>{u.label}</option>)}
                  </select>
                  <select className="field !w-auto" value={off.dir}
                    onChange={(e) => setSel({ ...sel, offset_minutes: (e.target.value === "before" ? -1 : 1) * off.n * off.unit })}>
                    <option value="before">before</option>
                    <option value="after">after</option>
                  </select>
                  <select className="field !w-auto" value={sel.trigger}
                    onChange={(e) => setSel({ ...sel, trigger: e.target.value as TriggerAnchor })}>
                    {ANCHORS.map((a) => <option key={a} value={a}>{ANCHOR_LABELS[a]}</option>)}
                  </select>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Current rule: <b>{timingLabel(sel)}</b>. Months count as 30 days.
                  {sel.require_balance && " Only sends when the booking has an open balance."}
                </p>
              </div>
            )}

            <div>
              <label className="label">Subject line</label>
              <input className="field" value={sel.subject} onChange={(e) => setSel({ ...sel, subject: e.target.value })} />
            </div>
            <div>
              <label className="label">Email body</label>
              <textarea className="field font-mono text-xs leading-relaxed" rows={14}
                value={sel.body} onChange={(e) => setSel({ ...sel, body: e.target.value })} />
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Available placeholders</div>
              <div className="text-xs text-slate-600 leading-relaxed">
                {PLACEHOLDERS.map((p) => <code key={p} className="mr-2">{`{{${p}}}`}</code>)}
              </div>
            </div>
          </div>
        ) : (
          <div className="card p-12 text-center text-slate-400">
            Select an automation to configure it. Toggles in the list enable/disable instantly. ◀
          </div>
        )}
      </div>
    </div>
  );
}

export default function GuardedPage() {
  return (
    <PageGuard perm="communications.view">
      <Automations />
    </PageGuard>
  );
}
