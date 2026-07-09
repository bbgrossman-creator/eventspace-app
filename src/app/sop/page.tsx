"use client";
import { useEffect, useState } from "react";
import { SOP_STAGES, loadSopNotes, saveSopNote } from "@/lib/sop";
import PageGuard from "@/components/PageGuard";

function SopAdmin() {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [savedKey, setSavedKey] = useState("");

  useEffect(() => { loadSopNotes().then((n) => { setNotes(n); setReady(true); }); }, []);

  async function save(key: string) {
    await saveSopNote(key, notes[key] ?? "");
    setSavedKey(key);
    setTimeout(() => setSavedKey(""), 1500);
  }

  if (!ready) return <div className="text-sm text-slate-400">Loading SOP…</div>;

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <h1 className="page-title">SOP / Playbook</h1>
        <p className="text-sm text-slate-500 mt-1">
          Guidance the rep sees on a booking at each stage. The stages themselves are fixed — this is the &quot;what to do here&quot; text, editable per how you run things. Leave a stage blank to hide its note.
        </p>
        <div className="gold-rule mt-3" />
      </header>

      <div className="space-y-4">
        {SOP_STAGES.map((s) => (
          <div key={s.key} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="font-display font-bold text-sm">{s.label}</label>
              <div className="flex items-center gap-3">
                {savedKey === s.key && <span className="text-xs text-emerald-600">Saved ✓</span>}
                <button className="btn-ghost !py-1 !text-xs" onClick={() => save(s.key)}>Save</button>
              </div>
            </div>
            <textarea
              className="field text-sm" rows={3}
              value={notes[s.key] ?? ""}
              onChange={(e) => setNotes((p) => ({ ...p, [s.key]: e.target.value }))}
              onBlur={() => save(s.key)}
              placeholder="What should the rep do at this stage?"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GuardedPage() {
  return (
    <PageGuard perm="config.manage">
      <SopAdmin />
    </PageGuard>
  );
}
