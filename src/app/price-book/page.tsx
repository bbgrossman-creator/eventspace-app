"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PRICE BOOK (v178) — where management edits Suggested Retail Prices
// deliberately. The catalog GROWS from selling ("save as standard price" in
// the pricing panel); this page curates what selling created. Nobody authors
// 500 items here on day one — real work creates knowledge.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PageGuard from "@/components/PageGuard";
import { CatalogItem } from "@/lib/pricingEngine";

export default function PriceBookPage() {
  return (
    <PageGuard perm="content.manage" cap="proposals">
      <PriceBookInner />
    </PageGuard>
  );
}

const money = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PriceBookInner() {
  const [rows, setRows] = useState<CatalogItem[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({}); // id → srp being typed

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("catalog_items")
      .select("id,name,domain,quantity_basis,srp,srp_set_at,unit_cost,active")
      .order("name");
    if (error) { setErr(`${error.message} — run v178 SQL.`); return; }
    setRows((data ?? []) as CatalogItem[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveSrp(r: CatalogItem) {
    const raw = draft[r.id];
    if (raw === undefined) return;
    const srp = raw === "" ? null : parseFloat(raw);
    const { error } = await supabase.from("catalog_items").update({
      srp, srp_set_at: srp == null ? null : new Date().toISOString(),
    }).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    setDraft((p) => { const n = { ...p }; delete n[r.id]; return n; });
    load();
  }
  async function toggleActive(r: CatalogItem) {
    await supabase.from("catalog_items").update({ active: !r.active }).eq("id", r.id);
    load();
  }
  async function rename(r: CatalogItem, name: string) {
    await supabase.from("catalog_items").update({ name }).eq("id", r.id);
  }

  const shown = rows.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="page-title">Price Book</h1>
      <div className="gold-rule mb-2" />
      <p className="text-sm text-slate-500 mb-4 max-w-2xl">
        Suggested Retail Prices — the business&apos;s current intent, shown to salespeople next to
        actual selling history. This catalog grows from real proposals (&quot;save as standard
        price&quot;); here is where management curates it. Editing an SRP never touches any
        existing proposal.
      </p>
      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-4">⚠️ {err}</p>}

      <input className="field w-full max-w-sm mb-4" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />

      {shown.length === 0 && (
        <p className="text-sm text-slate-400">
          {rows.length === 0
            ? "Empty — and that's correct. Items arrive here the first time a salesperson taps “save as standard price” in a proposal."
            : "Nothing matches the filter."}
        </p>
      )}

      <div className="space-y-1.5">
        {shown.map((r) => (
          <div key={r.id} className={`card p-3 flex items-center gap-3 flex-wrap ${r.active ? "" : "opacity-50"}`}>
            <input className="field !py-1 !text-[13px] font-medium flex-1 min-w-[180px]"
              defaultValue={r.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== r.name) rename(r, e.target.value.trim()); }} />
            <span className="text-[11px] text-slate-400 w-20">{r.domain}</span>
            <span className="text-[11px] text-slate-400 w-20">{r.quantity_basis === "per_person" ? "per person" : r.quantity_basis ?? "—"}</span>
            <span className="flex items-center gap-1.5">
              <span className="text-slate-400 text-xs">SRP $</span>
              <input type="number" step="0.01" min={0} className="field !py-1 !text-[13px] w-24"
                value={draft[r.id] ?? (r.srp ?? "")}
                onChange={(e) => setDraft((p) => ({ ...p, [r.id]: e.target.value }))} />
              {draft[r.id] !== undefined && (
                <button className="btn-primary !py-0.5 !px-2 text-xs" onClick={() => saveSrp(r)}>set</button>
              )}
            </span>
            <span className="text-[11px] text-slate-400 w-28">
              {r.srp_set_at ? `set ${new Date(r.srp_set_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : "no SRP"}
            </span>
            <button className="text-[11px] text-slate-400 underline ml-auto" onClick={() => toggleActive(r)}>
              {r.active ? "retire" : "restore"}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
