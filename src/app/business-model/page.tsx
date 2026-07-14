"use client";
// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS & OPERATING MODEL (Editions Architecture v2)
// Two axes: WHAT the company is × HOW it builds events. The operating model
// drives capabilities; UI everywhere reads caps, never these values directly.
// Also hosts the Tier-1 backfill — converting completed template menus into
// reusable Event Components (Knowledge Architecture step 2).
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  BUSINESS_TYPES, OPERATING_MODELS, BusinessType, OperatingModel,
  deriveCapabilities, loadCapabilities, Capabilities, notifyCapabilitiesChanged,
} from "@/lib/capabilities";
import { runTier1Backfill, BackfillResult } from "@/lib/componentBackfill";
import PageGuard from "@/components/PageGuard";

const CAP_LABELS: { key: keyof Capabilities; label: string; desc: string }[] = [
  { key: "knowledge_capture", label: "Knowledge Capture", desc: "Genealogy intake, debrief tasks, backfill — the compounding asset. On for everyone." },
  { key: "components_editor", label: "Component Editor", desc: "Build/edit reusable event components on the booking page." },
  { key: "component_copy", label: "Copy From Past Event", desc: "Import components from previous events." },
  { key: "rolodex", label: "Rolodex Search", desc: "Search & explore past events and components." },
  { key: "photos_retrieval", label: "Photo Retrieval", desc: "Photo-led search and component galleries." },
  { key: "requirements", label: "Ops Requirements", desc: "What each component needs — staff, equipment, supplies." },
  { key: "proposals", label: "Proposals", desc: "Versioned proposal lifecycle: draft → review → sent → approved." },
  { key: "event_legacy", label: "Event Legacy", desc: "Which events this one inspired; descendant revenue." },
  { key: "multi_domain", label: "Multi-Domain Components", desc: "Components beyond food: décor, lighting, logistics…" },
  { key: "workflow_engine", label: "Workflow Engine", desc: "Custom pipelines (future — Enterprise)." },
];

function BusinessModelPage() {
  const [type, setType] = useState<BusinessType>("venue");
  const [model, setModel] = useState<OperatingModel>("template_driven");
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bf, setBf] = useState<BackfillResult | null>(null);
  const [bfBusy, setBfBusy] = useState(false);

  useEffect(() => {
    loadCapabilities().then((c) => { setType(c.business_type); setModel(c.operating_model); setLoaded(true); });
  }, []);

  const caps = deriveCapabilities(type, model);

  async function save(key: "business_type" | "operating_model", value: string) {
    const { data } = await supabase.from("app_settings").select("key").eq("key", key).maybeSingle();
    const { error } = data
      ? await supabase.from("app_settings").update({ value }).eq("key", key)
      : await supabase.from("app_settings").insert({ key, value });
    if (error) { setMsg({ ok: false, text: `Couldn't save: ${error.message} — run v164 SQL if app_settings is missing.` }); return; }
    notifyCapabilitiesChanged();  // persistent components (Sidebar) re-derive now
    setMsg({ ok: true, text: "Saved — applied immediately." });
  }

  async function backfill() {
    setBfBusy(true); setBf(null);
    const r = await runTier1Backfill();
    setBf(r); setBfBusy(false);
  }

  if (!loaded) return <main className="max-w-3xl mx-auto px-6 py-10"><p className="text-slate-400 text-sm">Loading…</p></main>;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="page-title">Business &amp; Operating Model</h1>
      <div className="gold-rule mb-6" />
      <p className="text-sm text-slate-500 mb-8 max-w-xl">
        Two independent settings: <b>what this business is</b> and <b>how it builds events</b>.
        The operating model decides which advanced surfaces render — screens for a
        template-driven business stay exactly as simple as they are today.
      </p>
      {msg && <div className={`rounded-lg px-4 py-3 mb-5 text-sm font-semibold border ${msg.ok ? "status-success" : "status-conflict"}`}>{msg.text}</div>}

      <div className="card p-5 mb-5">
        <label className="label">Business Type — what are you?</label>
        <select className="field max-w-sm" value={type}
          onChange={(e) => { const v = e.target.value as BusinessType; setType(v); save("business_type", v); }}>
          {BUSINESS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div className="card p-5 mb-5">
        <label className="label">Operating Model — how do you build events?</label>
        <div className="space-y-2 mt-1">
          {OPERATING_MODELS.map((m) => (
            <label key={m.value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${model === m.value ? "border-[#4A90FF] bg-[#F4F9FF]" : "border-[#E7EDF5] hover:bg-[#F6F8FB]"}`}>
              <input type="radio" name="opmodel" className="mt-1 accent-[#4A9EFF]" checked={model === m.value}
                onChange={() => { setModel(m.value); save("operating_model", m.value); }} />
              <span>
                <span className="block text-sm font-semibold">{m.label}</span>
                <span className="block text-xs text-slate-500">{m.help}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="card p-5 mb-5">
        <h2 className="font-display font-semibold text-[15px] mb-1">What this unlocks</h2>
        <p className="text-xs text-slate-400 mb-3">UI everywhere reads these capabilities — never the settings above directly.</p>
        <div className="divide-y divide-slate-100">
          {CAP_LABELS.map((c) => (
            <div key={c.key} className="flex items-start gap-3 py-2">
              <span className={`mt-0.5 text-sm ${caps[c.key] ? "text-emerald-600" : "text-slate-300"}`}>{caps[c.key] ? "✓" : "—"}</span>
              <div>
                <div className={`text-sm font-medium ${caps[c.key] ? "" : "text-slate-400"}`}>{c.label}</div>
                <div className="text-xs text-slate-400">{c.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-display font-semibold text-[15px] mb-1">Tier-1 Backfill</h2>
        <p className="text-xs text-slate-500 mb-3 max-w-xl">
          Converts every completed template menu into reusable Event Components — real
          selections only, never placeholders. Safe to run repeatedly: bookings that
          already have components are skipped. Historical events become proposal
          material the moment the operating model ever changes; nothing migrates later.
        </p>
        <button className="btn-primary" onClick={backfill} disabled={bfBusy}>
          {bfBusy ? "Backfilling…" : "Run Backfill"}
        </button>
        {bf && (
          <div className={`rounded-lg px-4 py-3 mt-3 text-sm border ${bf.ok ? "status-success" : "status-conflict"}`}>
            {bf.ok
              ? <>Scanned <b>{bf.scanned}</b> bookings with menus · skipped <b>{bf.skipped_existing}</b> already done · backfilled <b>{bf.backfilled}</b> → <b>{bf.components}</b> components, <b>{bf.items}</b> items.</>
              : <>⚠️ {bf.detail}</>}
          </div>
        )}
      </div>
    </main>
  );
}

export default function GuardedPage() {
  return (
    <PageGuard perm="config.manage">
      <BusinessModelPage />
    </PageGuard>
  );
}
