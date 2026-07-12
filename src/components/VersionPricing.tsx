"use client";
// ═══════════════════════════════════════════════════════════════════════════
// VERSION PRICING (v178) — the pricing panel from the design doc, mounted
// inside a proposal version's expansion. Presents the three tenses per item
// (carried/unconfirmed · suggested-with-date · memory-with-provenance),
// records the decision, computes live totals, and on the approved version
// offers one-way invoice generation with a plan preview.
// Approved versions render read-only — immutability is visible, not implied.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Booking } from "@/lib/workflow";
import { ProposalVersion } from "@/lib/proposals";
import {
  GuestCategory, Adjustment, PricedItem, PackageLine, VersionTotals, MemoryPoint,
  loadGuestCategories, loadPriceMemory, computeVersionTotals,
  promoteToCatalog, planGeneration, executeGeneration, GenerationPlan,
} from "@/lib/pricingEngine";

interface CompRow {
  id: string; title: string; domain: string;
  pricing_mode?: string; package_price?: number | null; package_basis?: string | null;
  package_taxable?: boolean | null; package_price_confirmed?: boolean | null;
}
const money = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function VersionPricing({ b, v, refreshKey = 0 }: { b: Booking; v: ProposalVersion; refreshKey?: number }) {
  const locked = v.status === "approved";
  const [cats, setCats] = useState<GuestCategory[]>([]);
  const [guests, setGuests] = useState<Record<string, number>>({});   // category_id → count
  const [adjs, setAdjs] = useState<Adjustment[]>([]);
  const [comps, setComps] = useState<CompRow[]>([]);
  const [items, setItems] = useState<PricedItem[]>([]);
  const [srps, setSrps] = useState<Record<string, { srp: number | null; srp_set_at: string | null }>>({});
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [memory, setMemory] = useState<Record<string, { points: MemoryPoint[]; range: { low: number; high: number; count: number } | null }>>({});
  const [err, setErr] = useState("");
  const [plan, setPlan] = useState<GenerationPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [categories, { data: g }, { data: a }, { data: c }] = await Promise.all([
      loadGuestCategories(),
      supabase.from("version_guests").select("category_id,count").eq("version_id", v.id),
      supabase.from("version_adjustments").select("*").eq("version_id", v.id).order("position"),
      supabase.from("event_components").select("id,title,domain,pricing_mode,package_price,package_basis,package_taxable,package_price_confirmed").eq("proposal_version_id", v.id).order("position"),
    ]);
    setCats(categories);
    const gm: Record<string, number> = {};
    for (const row of (g ?? []) as { category_id: string; count: number }[]) gm[row.category_id] = row.count;
    setGuests(gm);
    setAdjs((a ?? []) as Adjustment[]);
    const compRows = (c ?? []) as CompRow[];
    setComps(compRows);
    if (compRows.length) {
      const { data: it, error } = await supabase.from("component_items")
        .select("id,component_id,name,quantity,quantity_basis,unit_price,applies_to_category_id,catalog_item_id,price_confirmed,pricing_reason,taxable")
        .in("component_id", compRows.map((x) => x.id)).order("position");
      if (error) { setErr(`${error.message} — run v178 SQL.`); return; }
      const rows = (it ?? []) as PricedItem[];
      setItems(rows);
      const catIds = Array.from(new Set(rows.map((r) => r.catalog_item_id).filter((x): x is string => !!x)));
      if (catIds.length) {
        const { data: ci } = await supabase.from("catalog_items").select("id,srp,srp_set_at").in("id", catIds);
        const m: Record<string, { srp: number | null; srp_set_at: string | null }> = {};
        for (const row of (ci ?? []) as { id: string; srp: number | null; srp_set_at: string | null }[]) m[row.id] = row;
        setSrps(m);
      }
    } else setItems([]);
  }, [v.id]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const guestCounts = cats.map((c) => ({ category_id: c.id, count: guests[c.id] ?? 0 }));
  const itemizedIds = new Set(comps.filter((c) => c.pricing_mode !== "package").map((c) => c.id));
  const activeItems = items.filter((i) => itemizedIds.has(i.component_id));
  const pkgLines: PackageLine[] = comps.filter((c) => c.pricing_mode === "package")
    .map((c) => ({ title: c.title, package_price: c.package_price ?? null, package_basis: c.package_basis ?? "flat",
      package_taxable: c.package_taxable, package_price_confirmed: c.package_price_confirmed }));
  const totals: VersionTotals = computeVersionTotals(activeItems, guestCounts, adjs, pkgLines);

  async function saveGuests(catId: string, count: number) {
    setGuests((p) => ({ ...p, [catId]: count }));
    await supabase.from("version_guests").upsert({ version_id: v.id, category_id: catId, count });
  }
  async function patchItem(id: string, patch: Partial<PricedItem>) {
    const { error } = await supabase.from("component_items").update(patch).eq("id", id);
    if (error) { setErr(error.message); return; }
    setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  async function toggleMemory(item: PricedItem) {
    const next = openItem === item.id ? null : item.id;
    setOpenItem(next);
    if (next && !memory[item.id]) {
      const m = await loadPriceMemory({ name: item.name, catalog_item_id: item.catalog_item_id, component_id: item.component_id });
      setMemory((p) => ({ ...p, [item.id]: m }));
    }
  }
  async function addAdjustment() {
    const { data, error } = await supabase.from("version_adjustments")
      .insert({ version_id: v.id, label: "Adjustment", kind: "flat", value: 0, position: adjs.length })
      .select("*").single();
    if (error) { setErr(error.message); return; }
    setAdjs((p) => [...p, data as Adjustment]);
  }
  async function patchAdj(id: string, patch: Partial<Adjustment>) {
    await supabase.from("version_adjustments").update(patch).eq("id", id);
    setAdjs((p) => p.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  async function removeAdj(id: string) {
    await supabase.from("version_adjustments").delete().eq("id", id);
    setAdjs((p) => p.filter((a) => a.id !== id));
  }
  async function preparePlan() {
    setBusy(true);
    setPlan(await planGeneration(b.id, v.id, activeItems, comps, guestCounts, adjs, pkgLines));
    setBusy(false);
  }
  async function generate() {
    if (!plan) return;
    setBusy(true);
    const r = await executeGeneration(b, v.id, `v${v.version}`, plan);
    setBusy(false); setPlan(null);
    if (!r.ok) setErr(r.detail ?? "Generation failed.");
  }

  return (
    <div className="mt-2 rounded-lg ring-1 ring-[#E7EDF5] bg-white p-3 space-y-3">
      <div className="text-[11px] font-bold text-slate-500">
        Pricing — v{v.version}{locked && <span className="ml-1.5 font-semibold text-[#166534]">🔒 approved, read-only</span>}
      </div>
      {err && <p className="rounded bg-red-50 border border-red-200 text-red-700 text-xs px-2 py-1.5">⚠️ {err}</p>}

      {/* Guests — the version's frozen counts */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Guests</span>
        {cats.map((c) => (
          <label key={c.id} className="flex items-center gap-1.5 text-[12px]">
            {c.name}
            <input type="number" min={0} disabled={locked}
              className="field !py-0.5 !px-1.5 !text-xs w-16"
              value={guests[c.id] ?? 0}
              onChange={(e) => saveGuests(c.id, Math.max(0, parseInt(e.target.value || "0", 10)))} />
          </label>
        ))}
      </div>

      {/* Items, grouped by component */}
      {comps.map((c) => (
        <div key={c.id}>
          <div className="text-[11px] font-semibold text-slate-500 mb-1">
            {c.title}
            {c.pricing_mode === "package" && (
              <span className="ml-1.5 text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 bg-[#FEF3C7] text-[#92400E]">
                package {c.package_price != null ? `· $${c.package_price}${c.package_basis === "per_person" ? "/pp" : ""}` : "· unpriced"}
              </span>
            )}
          </div>
          {c.pricing_mode === "package" && (
            <p className="text-[10px] text-slate-400 mb-1">Priced as one unit — edit in the Studio.</p>
          )}
          <div className="space-y-1">
            {(c.pricing_mode === "package" ? [] : items.filter((i) => i.component_id === c.id)).map((i) => {
              const srp = i.catalog_item_id ? srps[i.catalog_item_id] : null;
              const mem = memory[i.id];
              const open = openItem === i.id;
              return (
                <div key={i.id} className={`rounded px-2 py-1.5 ring-1 ${i.unit_price != null && !i.price_confirmed ? "ring-amber-300 bg-amber-50" : "ring-[#E7EDF5] bg-[#F6F8FB]"}`}>
                  <div className="flex items-center gap-2 flex-wrap text-[12px]">
                    <button className="font-medium text-left hover:underline min-w-0 truncate" onClick={() => toggleMemory(i)}>{i.name}</button>
                    {i.unit_price != null && !i.price_confirmed && <span className="text-[10px] font-semibold text-amber-700">⚠ carried — unconfirmed</span>}
                    <span className="ml-auto flex items-center gap-1.5">
                      <select className="field !py-0.5 !px-1 !text-[11px]" disabled={locked}
                        value={i.quantity_basis ?? "flat"}
                        onChange={(e) => patchItem(i.id, { quantity_basis: e.target.value })}>
                        <option value="per_person">per person</option>
                        <option value="flat">flat</option>
                        <option value="per_table">per table</option>
                      </select>
                      {i.quantity_basis === "per_person" ? (
                        <select className="field !py-0.5 !px-1 !text-[11px]" disabled={locked}
                          value={i.applies_to_category_id ?? ""}
                          onChange={(e) => patchItem(i.id, { applies_to_category_id: e.target.value || null })}>
                          <option value="">All guests</option>
                          {cats.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                      ) : (
                        <input type="number" min={0} disabled={locked} className="field !py-0.5 !px-1 !text-[11px] w-14"
                          value={i.quantity ?? 1}
                          onChange={(e) => patchItem(i.id, { quantity: parseFloat(e.target.value || "1") })} />
                      )}
                      <span className="text-slate-400">$</span>
                      <input type="number" step="0.01" min={0} disabled={locked}
                        className="field !py-0.5 !px-1 !text-[11px] w-20"
                        value={i.unit_price ?? ""}
                        placeholder={srp?.srp != null ? String(srp.srp) : "—"}
                        onChange={(e) => {
                          const val = e.target.value === "" ? null : parseFloat(e.target.value);
                          patchItem(i.id, { unit_price: val, price_confirmed: true });
                        }} />
                      <label className="flex items-center gap-0.5 text-[10px] text-slate-500">
                        <input type="checkbox" className="accent-[#4A9EFF]" disabled={locked}
                          checked={!!i.taxable} onChange={(e) => patchItem(i.id, { taxable: e.target.checked })} />tax
                      </label>
                      {!locked && i.unit_price != null && !i.price_confirmed && (
                        <button className="text-[10px] font-semibold text-amber-700 underline"
                          onClick={() => patchItem(i.id, { price_confirmed: true })}>confirm</button>
                      )}
                    </span>
                  </div>

                  {open && (
                    <div className="mt-1.5 pl-1 space-y-0.5 text-[11px] text-slate-600 reveal">
                      {srp?.srp != null && (
                        <p>Suggested: <b>{money(srp.srp)}</b>{srp.srp_set_at ? <span className="text-slate-400"> (set {new Date(srp.srp_set_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })})</span> : null}
                          {!locked && <button className="ml-1.5 text-accent-ink underline" onClick={() => patchItem(i.id, { unit_price: srp.srp, price_confirmed: true })}>use</button>}
                        </p>
                      )}
                      {!mem && <p className="text-slate-400">Loading price memory…</p>}
                      {mem && mem.points.length === 0 && <p className="text-slate-400">No sold history for this item yet.</p>}
                      {mem?.points.map((pt, idx) => (
                        <p key={idx}>
                          {pt.match === "lineage" ? "↺" : pt.match === "catalog" ? "📖" : "≈"} Sold: <b>{money(pt.unit_price)}</b>{pt.quantity_basis === "per_person" ? "/pp" : ""} — {pt.customer}
                          {pt.event_type ? ` ${pt.event_type}` : ""}{pt.date ? ` · ${new Date(pt.date).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : ""}{pt.guests ? ` · ${pt.guests} g` : ""}
                          {pt.match === "name" && <span className="text-slate-400"> (same name)</span>}
                          {!locked && <button className="ml-1.5 text-accent-ink underline" onClick={() => patchItem(i.id, { unit_price: pt.unit_price, price_confirmed: true })}>use</button>}
                        </p>
                      ))}
                      {mem?.range && (
                        <p className="text-slate-400">Range (12mo): {money(mem.range.low)}–{money(mem.range.high)} across {mem.range.count} sales</p>
                      )}
                      {!locked && (
                        <div className="flex items-center gap-2 pt-0.5">
                          <input className="field !py-0.5 !px-1.5 !text-[11px] flex-1 max-w-[240px]" placeholder="pricing reason (optional) — e.g. Preferred customer"
                            value={i.pricing_reason ?? ""}
                            onChange={(e) => patchItem(i.id, { pricing_reason: e.target.value || null })} />
                          {i.unit_price != null && (
                            <button className="text-[10px] text-accent-ink underline"
                              onClick={async () => { const r = await promoteToCatalog(i, c.domain); if (!r.ok) setErr(r.detail ?? ""); else load(); }}>
                              save as standard price
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Adjustments — the service-charge family, generalized */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Adjustments</span>
          {!locked && <button className="text-[11px] text-accent-ink underline" onClick={addAdjustment}>＋ add</button>}
        </div>
        {adjs.length === 0 && <p className="text-[11px] text-slate-400">None — delivery, setup, gratuity, admin fee, card fee all live here.</p>}
        <div className="space-y-1 mt-1">
          {adjs.map((a) => (
            <div key={a.id} className="flex items-center gap-1.5 text-[12px]">
              <input className="field !py-0.5 !px-1.5 !text-[11px] flex-1 max-w-[200px]" disabled={locked}
                value={a.label} onChange={(e) => patchAdj(a.id, { label: e.target.value })} />
              <select className="field !py-0.5 !px-1 !text-[11px]" disabled={locked}
                value={a.kind} onChange={(e) => patchAdj(a.id, { kind: e.target.value as "percent" | "flat" })}>
                <option value="flat">$ flat</option>
                <option value="percent">% of items</option>
              </select>
              <input type="number" step="0.01" className="field !py-0.5 !px-1 !text-[11px] w-20" disabled={locked}
                value={a.value} onChange={(e) => patchAdj(a.id, { value: parseFloat(e.target.value || "0") })} />
              <label className="flex items-center gap-0.5 text-[10px] text-slate-500">
                <input type="checkbox" className="accent-[#4A9EFF]" disabled={locked}
                  checked={a.taxable} onChange={(e) => patchAdj(a.id, { taxable: e.target.checked })} />tax
              </label>
              {!locked && <button className="text-[11px] text-slate-300 hover:text-red-500" onClick={() => removeAdj(a.id)}>✕</button>}
            </div>
          ))}
        </div>
      </div>

      {/* Totals — live */}
      <div className="border-t border-slate-100 pt-2 text-[12px] flex items-center gap-4 flex-wrap">
        <span>Items <b>{money(totals.itemsSubtotal)}</b></span>
        {totals.adjustmentsTotal !== 0 && <span>Adjustments <b>{money(totals.adjustmentsTotal)}</b></span>}
        <span>Tax <b>{money(totals.tax)}</b></span>
        <span className="font-display font-bold text-[14px]">Total {money(totals.total)}</span>
        {totals.unconfirmed > 0 && <span className="text-amber-700 font-semibold">⚠ {totals.unconfirmed} price{totals.unconfirmed === 1 ? "" : "s"} unconfirmed</span>}
        {totals.unpriced > 0 && <span className="text-slate-400">{totals.unpriced} unpriced</span>}
        {locked && (
          <span className="ml-auto">
            {!plan ? (
              <button className="btn-primary !py-1 !px-2.5 text-xs" disabled={busy} onClick={preparePlan}>
                {busy ? "Planning…" : "🧾 Generate Invoice Lines"}
              </button>
            ) : (
              <span className="flex items-center gap-2 text-[11px]">
                <span>{plan.add.length} lines · replaces {plan.removeStamped} proposal line{plan.removeStamped === 1 ? "" : "s"} · {plan.manualUntouched} manual untouched</span>
                <button className="btn-primary !py-1 !px-2 text-xs" disabled={busy} onClick={generate}>Confirm</button>
                <button className="text-slate-400 underline" onClick={() => setPlan(null)}>cancel</button>
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
