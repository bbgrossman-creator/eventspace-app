"use client";
import { useEffect, useState } from "react";
import { supabase, logActivity } from "@/lib/supabase";
import PageGuard from "@/components/PageGuard";

interface Guide {
  id: string; key: string; name: string; price_label: string | null;
  includes: string | null; best_for: string | null;
  talk_track: string | null; upsells: string | null; sort_order: number;
}

const FIELDS: { k: keyof Guide; label: string; rows: number }[] = [
  { k: "price_label", label: "Price label", rows: 1 },
  { k: "includes", label: "What's included", rows: 3 },
  { k: "best_for", label: "Best for (who it suits)", rows: 2 },
  { k: "talk_track", label: "How to present it (rep talk-track)", rows: 4 },
  { k: "upsells", label: "Upsell angles", rows: 3 },
];

function PackageGuides() {
  const [rows, setRows] = useState<Guide[]>([]);
  const [sel, setSel] = useState<Guide | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("package_guides").select("*").order("sort_order");
    setRows((data ?? []) as Guide[]);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!sel) return;
    setBusy(true);
    const { error } = await supabase.from("package_guides").update({
      name: sel.name, price_label: sel.price_label, includes: sel.includes,
      best_for: sel.best_for, talk_track: sel.talk_track, upsells: sel.upsells,
      updated_at: new Date().toISOString(),
    }).eq("id", sel.id);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    await logActivity(null, "—", "Package Guide Updated", sel.name);
    setMsg({ ok: true, text: "Saved ✓ — reps see this immediately on the New Inquiry page." });
    load();
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="page-title">Package Guides</h1>
        <p className="text-sm text-slate-500 mt-1">
          How reps present each package. This is the &ldquo;how to sell&rdquo; content that appears when a rep taps a package on the New Inquiry page.
        </p>
        <div className="gold-rule mt-3" />
      </header>

      <div className="grid lg:grid-cols-[280px_1fr] gap-5 items-start">
        <div className="space-y-2">
          {rows.map((r) => (
            <button key={r.id} onClick={() => { setSel(r); setMsg(null); }}
              className={`card w-full text-left px-4 py-3 hover:shadow-lg transition-shadow ${sel?.id === r.id ? "ring-2 ring-navy" : ""}`}>
              <div className="font-display font-bold text-sm">{r.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{r.price_label}</div>
            </button>
          ))}
          {rows.length === 0 && <p className="text-sm text-slate-400">No guides — run supabase/package_guides.sql.</p>}
        </div>

        {sel ? (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <input className="field !text-lg !font-bold !font-display max-w-md" value={sel.name}
                onChange={(e) => setSel({ ...sel, name: e.target.value })} />
              <button className="btn-primary !py-1.5" disabled={busy} onClick={save}>{busy ? "Saving…" : "💾 Save"}</button>
            </div>
            {msg && (
              <div className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                {msg.text}
              </div>
            )}
            {FIELDS.map((f) => (
              <div key={f.k as string}>
                <label className="label">{f.label}</label>
                <textarea className="field" rows={f.rows}
                  value={(sel[f.k] as string) ?? ""}
                  onChange={(e) => setSel({ ...sel, [f.k]: e.target.value })} />
              </div>
            ))}
          </div>
        ) : (
          <div className="card p-12 text-center text-slate-400">Select a package to edit its sell sheet.</div>
        )}
      </div>
    </div>
  );
}

export default function GuardedPage() {
  return (
    <PageGuard perm="content.manage">
      <PackageGuides />
    </PageGuard>
  );
}
