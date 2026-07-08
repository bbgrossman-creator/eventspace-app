"use client";
// ═══════════════════════════════════════════════════════════════════════════
// EVENT COMPONENTS — minimal editor (Knowledge Architecture step 2).
// Gated on caps.components_editor: renders NOTHING for template-driven
// businesses, so their screens stay pixel-identical. No drag-and-drop, no
// Rolodex, no proposals — those are later steps. Just: see, add, edit,
// delete the reusable components of THIS event.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Booking } from "@/lib/workflow";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";

interface ComponentRow {
  id: string; domain: string; kind: string | null; title: string;
  position: number; copied_from: string | null; notes: string | null;
}
interface ItemRow {
  id: string; component_id: string; name: string; description: string | null;
  quantity: number | null; quantity_basis: string | null; unit_price: number | null; position: number;
}
interface ReqRow { id: string; component_id: string; name: string; category: string | null; }

const DOMAINS = ["food", "decor", "flowers", "lighting", "music", "layout", "timeline", "kids", "photo", "transport", "kitchen", "logistics", "staffing", "custom"];
const DOMAIN_ICON: Record<string, string> = {
  food: "🍽", decor: "🎀", flowers: "💐", lighting: "💡", music: "🎵", layout: "🪑",
  timeline: "🕰", kids: "🧒", photo: "📸", transport: "🚚", kitchen: "👨‍🍳",
  logistics: "📦", staffing: "👥", custom: "•",
};

export default function ComponentsCard({ b }: { b: Booking }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [comps, setComps] = useState<ComponentRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [reqs, setReqs] = useState<ReqRow[]>([]);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [nTitle, setNTitle] = useState("");
  const [nDomain, setNDomain] = useState("food");
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [reqDrafts, setReqDrafts] = useState<Record<string, string>>({});

  useEffect(() => { loadCapabilities().then((c) => setCaps(c.caps)); }, []);

  const load = useCallback(async () => {
    const { data: cs, error } = await supabase.from("event_components")
      .select("id,domain,kind,title,position,copied_from,notes")
      .eq("booking_id", b.id).order("position");
    if (error) { setErr(`Components couldn't load: ${error.message} — run v164 SQL.`); return; }
    setErr("");
    const rows = (cs ?? []) as ComponentRow[];
    setComps(rows);
    const ids = rows.map((c) => c.id);
    if (!ids.length) { setItems([]); setReqs([]); return; }
    const [i, r] = await Promise.all([
      supabase.from("component_items").select("*").in("component_id", ids).order("position"),
      supabase.from("component_requirements").select("id,component_id,name,category").in("component_id", ids),
    ]);
    setItems((i.data ?? []) as ItemRow[]);
    setReqs((r.data ?? []) as ReqRow[]);
  }, [b.id]);
  useEffect(() => { if (caps?.components_editor) load(); }, [caps, load]);

  // The gate: template-driven renders NOTHING — not an empty card, nothing.
  if (!caps?.components_editor) return null;

  async function addComponent() {
    if (!nTitle.trim()) return;
    const { error } = await supabase.from("event_components").insert({
      booking_id: b.id, domain: caps!.multi_domain ? nDomain : "food",
      title: nTitle.trim(), position: comps.length,
    });
    if (error) { setErr(`Couldn't add: ${error.message}`); return; }
    setNTitle(""); setAdding(false); load();
  }
  async function removeComponent(c: ComponentRow) {
    if (!confirm(`Remove "${c.title}" and its items?`)) return;
    const { error } = await supabase.from("event_components").delete().eq("id", c.id);
    if (error) { setErr(`Couldn't remove: ${error.message}`); return; }
    load();
  }
  async function addItem(compId: string) {
    const name = (itemDrafts[compId] ?? "").trim();
    if (!name) return;
    const count = items.filter((i) => i.component_id === compId).length;
    const { error } = await supabase.from("component_items").insert({ component_id: compId, name, position: count });
    if (error) { setErr(`Couldn't add item: ${error.message}`); return; }
    setItemDrafts((p) => ({ ...p, [compId]: "" })); load();
  }
  async function removeItem(i: ItemRow) {
    await supabase.from("component_items").delete().eq("id", i.id); load();
  }
  async function addReq(compId: string) {
    const name = (reqDrafts[compId] ?? "").trim();
    if (!name) return;
    const { error } = await supabase.from("component_requirements").insert({ component_id: compId, name });
    if (error) { setErr(`Couldn't add requirement: ${error.message}`); return; }
    setReqDrafts((p) => ({ ...p, [compId]: "" })); load();
  }
  async function removeReq(r: ReqRow) {
    await supabase.from("component_requirements").delete().eq("id", r.id); load();
  }

  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-display font-semibold text-[15px]">🧩 Event Components</h2>
        <button className="text-xs font-medium text-accent-ink hover:text-[#102F56] transition-colors"
          onClick={() => setAdding((v) => !v)}>＋ Add Component</button>
      </div>
      <p className="text-xs text-slate-400 mb-3">The reusable pieces of this event. Every component becomes future proposal material.</p>
      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-3">⚠️ {err}</p>}

      {adding && (
        <div className="rounded-lg bg-[#F6F8FB] ring-1 ring-[#E7EDF5] p-2.5 mb-3 flex gap-1.5 flex-wrap items-center reveal">
          {caps.multi_domain && (
            <select className="field !py-1 !text-xs !bg-white w-[8.5rem]" value={nDomain} onChange={(e) => setNDomain(e.target.value)}>
              {DOMAINS.map((d) => <option key={d} value={d}>{DOMAIN_ICON[d]} {d}</option>)}
            </select>
          )}
          <input className="field !py-1 !text-xs !bg-white flex-1 min-w-[140px]" autoFocus
            placeholder='Component title — e.g. "Cocktail Hour"' value={nTitle}
            onChange={(e) => setNTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addComponent(); }} />
          <button className="btn-primary !py-1 !px-2.5 text-xs" onClick={addComponent}>Add</button>
          <button className="text-xs text-slate-400 underline" onClick={() => setAdding(false)}>cancel</button>
        </div>
      )}

      {comps.length === 0 && !adding && (
        <p className="text-[13px] text-slate-400">No components yet. Add the first one — or they'll appear automatically when a menu is backfilled.</p>
      )}

      <div className="space-y-3">
        {comps.map((c) => {
          const its = items.filter((i) => i.component_id === c.id);
          const rs = reqs.filter((r) => r.component_id === c.id);
          return (
            <div key={c.id} className="rounded-lg ring-1 ring-[#E7EDF5] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px]">{DOMAIN_ICON[c.domain] ?? "•"}</span>
                  <span className="text-sm font-semibold truncate">{c.title}</span>
                  {c.copied_from && <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-[#F4F9FF] text-[#2F80ED]" title="Copied from a past event">↺ reused</span>}
                </div>
                <button className="text-[10px] text-slate-300 hover:text-red-500 underline shrink-0" onClick={() => removeComponent(c)}>remove</button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {its.map((i) => (
                  <span key={i.id} className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-[#F6F8FB] ring-1 ring-[#E7EDF5]">
                    {i.name}{i.quantity ? <b className="text-slate-500">×{i.quantity}</b> : null}
                    <button className="text-slate-300 hover:text-red-500" title="Remove item" onClick={() => removeItem(i)}>✕</button>
                  </span>
                ))}
                <input className="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-[#E7EDF5] outline-none focus:ring-[#4A9EFF] min-w-[110px]"
                  placeholder="+ item, Enter" value={itemDrafts[c.id] ?? ""}
                  onChange={(e) => setItemDrafts((p) => ({ ...p, [c.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addItem(c.id); }} />
              </div>
              {caps.requirements && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Needs</span>
                  {rs.map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-amber-50 ring-1 ring-amber-100 text-amber-800">
                      {r.name}
                      <button className="text-amber-300 hover:text-red-500" title="Remove" onClick={() => removeReq(r)}>✕</button>
                    </span>
                  ))}
                  <input className="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-[#E7EDF5] outline-none focus:ring-[#4A9EFF] min-w-[110px]"
                    placeholder="+ requirement, Enter" value={reqDrafts[c.id] ?? ""}
                    onChange={(e) => setReqDrafts((p) => ({ ...p, [c.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addReq(c.id); }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
