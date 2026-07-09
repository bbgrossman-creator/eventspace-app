"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PageGuard from "@/components/PageGuard";

interface Staff { id: string; name: string; pin: string; active: boolean; sort_order: number; }

const MODES: { value: string; label: string; help: string }[] = [
  { value: "free_text", label: "Free text", help: "Staff type their name. Simplest; no verification." },
  { value: "dropdown", label: "Dropdown", help: "Staff pick their name from the list below. Prevents typos." },
  { value: "pin", label: "Dropdown + PIN", help: "Staff pick their name and enter their PIN. Strongest accountability — verifies who approved." },
];

function StaffAdmin() {
  const [rows, setRows] = useState<Staff[]>([]);
  const [mode, setMode] = useState("pin");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");

  async function load() {
    const { data } = await supabase.from("staff").select("*").order("sort_order");
    setRows((data ?? []) as Staff[]);
    const { data: s } = await supabase.from("app_settings").select("value").eq("key", "staff_id_mode").single();
    if (s?.value) setMode(s.value);
  }
  useEffect(() => { load(); }, []);

  async function saveMode(m: string) {
    setMode(m);
    await supabase.from("app_settings").update({ value: m }).eq("key", "staff_id_mode");
    setMsg({ ok: true, text: "Identification mode saved." });
  }

  async function addStaff() {
    if (!newName.trim()) { setMsg({ ok: false, text: "Enter a name." }); return; }
    if (mode === "pin" && !/^\d{3,6}$/.test(newPin)) { setMsg({ ok: false, text: "PIN must be 3–6 digits." }); return; }
    const { error } = await supabase.from("staff").insert({
      name: newName.trim(), pin: newPin || "0000", sort_order: rows.length,
    });
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setNewName(""); setNewPin(""); setMsg({ ok: true, text: "Staff member added." });
    load();
  }

  async function update(s: Staff, patch: Partial<Staff>) {
    await supabase.from("staff").update(patch).eq("id", s.id);
    load();
  }

  async function remove(s: Staff) {
    if (!confirm(`Remove ${s.name}? They will no longer appear for approvals.`)) return;
    await supabase.from("staff").update({ active: false }).eq("id", s.id);
    setMsg({ ok: true, text: `${s.name} deactivated.` });
    load();
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="page-title">Staff &amp; Approvals</h1>
        <p className="text-sm text-slate-500 mt-1">Who can confirm actions and approve money-policy exceptions, and how they&apos;re identified.</p>
        <div className="gold-rule mt-3" />
      </header>

      {msg && (
        <div className={`rounded-lg px-4 py-2.5 mb-4 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {/* Identification mode */}
      <div className="card p-5 mb-5">
        <h2 className="font-display font-bold text-sm mb-3">How are staff identified?</h2>
        <div className="space-y-2">
          {MODES.map((m) => (
            <label key={m.value} className="flex items-start gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-50">
              <input type="radio" name="mode" className="mt-1" checked={mode === m.value} onChange={() => saveMode(m.value)} />
              <span><b>{m.label}</b> — <span className="text-slate-500">{m.help}</span></span>
            </label>
          ))}
        </div>
      </div>

      {/* Staff list */}
      <div className="card p-5">
        <h2 className="font-display font-bold text-sm mb-3">Staff members</h2>
        <div className="space-y-2 mb-4">
          {rows.filter((s) => s.active).map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <input className="field !py-1.5 flex-1" value={s.name}
                onChange={(e) => setRows((p) => p.map((x) => x.id === s.id ? { ...x, name: e.target.value } : x))}
                onBlur={() => update(s, { name: s.name })} />
              {mode === "pin" && (
                <input className="field !py-1.5 w-28" value={s.pin} placeholder="PIN"
                  onChange={(e) => setRows((p) => p.map((x) => x.id === s.id ? { ...x, pin: e.target.value } : x))}
                  onBlur={() => update(s, { pin: s.pin })} />
              )}
              <button className="text-red-400 hover:text-red-600 text-sm" onClick={() => remove(s)}>Remove</button>
            </div>
          ))}
          {rows.filter((s) => s.active).length === 0 && <p className="text-sm text-slate-400">No staff yet — add one below.</p>}
        </div>

        {/* Add new */}
        <div className="flex items-end gap-3 border-t border-slate-100 pt-4">
          <div className="flex-1">
            <label className="label">Name</label>
            <input className="field" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
          </div>
          {mode === "pin" && (
            <div className="w-32">
              <label className="label">PIN (3–6 digits)</label>
              <input className="field" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="e.g. 1234" />
            </div>
          )}
          <button className="btn-primary" onClick={addStaff}>Add</button>
        </div>
      </div>
    </div>
  );
}

export default function GuardedPage() {
  return (
    <PageGuard perm="staff.manage">
      <StaffAdmin />
    </PageGuard>
  );
}
