"use client";
import { useEffect, useState } from "react";
import { loadPolicies, savePolicy, Policies, ConflictMode, LapseAction } from "@/lib/policies";

export default function PoliciesAdmin() {
  const [p, setP] = useState<Policies | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { loadPolicies().then(setP); }, []);

  async function set<K extends keyof Policies>(key: K, value: Policies[K]) {
    setP((prev) => prev ? { ...prev, [key]: value } : prev);
    await savePolicy(key, value as string | number);
    setMsg("Saved.");
    setTimeout(() => setMsg(""), 1500);
  }

  if (!p) return <div className="text-sm text-slate-400">Loading policies…</div>;

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">Policies</h1>
        <p className="text-sm text-slate-500 mt-1">Configure how the app handles date conflicts and event billing. These rules drive the workflow automatically.</p>
        <div className="gold-rule mt-3" />
      </header>

      {msg && <div className="rounded-lg px-4 py-2 mb-4 text-sm bg-emerald-50 text-emerald-800 inline-block">{msg}</div>}

      {/* ── Conflict / hold handling ── */}
      <div className="card p-5 mb-5">
        <h2 className="font-display font-bold text-sm mb-1">Date conflicts &amp; holds</h2>
        <p className="text-xs text-slate-500 mb-4">What happens when a date already has a hold and someone else wants it.</p>

        <div className="space-y-2 mb-4">
          {([
            ["indefinite", "Indefinite hold", "The first party holds the date until they act or you release it. A second inquiry is blocked until then."],
            ["timed", "Timed hold", "The hold auto-expires after a set number of hours, then the date frees up."],
            ["first_refusal", "First right of refusal", "A second inquiry notifies the original holder, who gets a deadline to commit with a deposit — or the date passes to the next party."],
          ] as [ConflictMode, string, string][]).map(([val, label, help]) => (
            <label key={val} className="flex items-start gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-50">
              <input type="radio" name="cmode" className="mt-1" checked={p.conflict_mode === val} onChange={() => set("conflict_mode", val)} />
              <span><b>{label}</b> — <span className="text-slate-500">{help}</span></span>
            </label>
          ))}
        </div>

        {/* Conditional settings based on chosen mode */}
        {p.conflict_mode === "timed" && (
          <Row label="Hold duration (hours)">
            <NumberField value={p.hold_hours} onSave={(v) => set("hold_hours", v)} min={1} />
          </Row>
        )}
        {p.conflict_mode === "first_refusal" && (
          <>
            <Row label="Holder's decision deadline (hours)">
              <NumberField value={p.refusal_deadline_hours} onSave={(v) => set("refusal_deadline_hours", v)} min={1} />
            </Row>
            <Row label="If the deadline passes with no response">
              <select className="field !py-1.5 w-64" value={p.refusal_lapse_action}
                onChange={(e) => set("refusal_lapse_action", e.target.value as LapseAction)}>
                <option value="flag">Flag the rep to decide</option>
                <option value="auto_release">Auto-release the date to the next party</option>
              </select>
            </Row>
          </>
        )}
      </div>

      {/* ── Event timing & billing ── */}
      <div className="card p-5">
        <h2 className="font-display font-bold text-sm mb-1">Event timing &amp; billing</h2>
        <p className="text-xs text-slate-500 mb-4">How billable hours and overtime are calculated.</p>

        <Row label="Default billable hours">
          <NumberField value={p.default_event_hours} onSave={(v) => set("default_event_hours", v)} min={0} step={0.25} />
        </Row>
        <p className="text-xs text-slate-400 mb-3 pl-1">
          Used unless both actual start &amp; end times are entered, in which case billable = end − start.
        </p>
        <Row label="Overtime increment (minutes)">
          <NumberField value={p.overtime_increment_min} onSave={(v) => set("overtime_increment_min", v)} min={1} />
        </Row>
        <Row label="Overtime rate ($ per increment)">
          <NumberField value={p.overtime_rate} onSave={(v) => set("overtime_rate", v)} min={0} />
        </Row>
        <p className="text-xs text-slate-400 mt-1 pl-1">Overtime is always suggested for the rep to confirm — never auto-charged.</p>

        <div className="border-t border-slate-100 mt-4 pt-3">
          <h3 className="font-display font-bold text-xs mb-1">Scheduling &amp; conflicts</h3>
          <p className="text-xs text-slate-500 mb-3">Two events conflict only if their time windows overlap. A shorter event can fit alongside another.</p>
          <Row label="Turnaround buffer between events (minutes)">
            <NumberField value={p.turnaround_buffer_min} onSave={(v) => set("turnaround_buffer_min", v)} min={0} />
          </Row>
          <Row label="Standard / max service window (hours)">
            <NumberField value={p.max_service_hours} onSave={(v) => set("max_service_hours", v)} min={0} step={0.5} />
          </Row>
          <Row label="Mark a menu call “missed” after (hours past call time)">
            <NumberField value={p.menu_call_overdue_hours} onSave={(v) => set("menu_call_overdue_hours", v)} min={0} step={0.5} />
          </Row>

          <div className="border-t border-slate-100 mt-3 pt-3">
            <h3 className="font-display font-bold text-xs mb-1">Event timing blocks</h3>
            <p className="text-xs text-slate-500 mb-2">
              Used for billing and for fitting events around each other. Changeover between two events = setup + bussing − overlap = <b>{(((p.setup_hours + p.bussing_hours - p.changeover_overlap_hours))).toFixed(1)} hr</b>. Full footprint = <b>{(p.setup_hours + p.service_hours + p.bussing_hours).toFixed(1)} hr</b>.
            </p>
            <Row label="Setup time (hours)">
              <NumberField value={p.setup_hours} onSave={(v) => set("setup_hours", v)} min={0} step={0.25} />
            </Row>
            <Row label="Service time (hours) — standard, customer-facing">
              <NumberField value={p.service_hours} onSave={(v) => { set("service_hours", v); set("default_event_hours", v); }} min={0} step={0.25} />
            </Row>
            <Row label="Bussing / breakdown time (hours)">
              <NumberField value={p.bussing_hours} onSave={(v) => set("bussing_hours", v)} min={0} step={0.25} />
            </Row>
            <Row label="Bussing/setup overlap between events (hours)">
              <NumberField value={p.changeover_overlap_hours} onSave={(v) => set("changeover_overlap_hours", v)} min={0} step={0.25} />
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-t border-slate-100 first:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      {children}
    </div>
  );
}

function NumberField({ value, onSave, min, step }: { value: number; onSave: (v: number) => void; min?: number; step?: number }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  return (
    <input className="field !py-1.5 w-32" type="number" min={min} step={step ?? 1} value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { const n = Number(v); if (!isNaN(n)) onSave(n); }} />
  );
}
