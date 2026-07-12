"use client";
// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT PALETTE (v180) — the Studio's third source mode.
// "Build from scratch" never means "from nothing": this is the Rolodex's
// component dimension as a browsable palette — DERIVED from real events,
// never authored. Sparse at a new business (the first sushi station is typed
// by hand); rich at a mature one (the 148th is one click, because 147 real
// ones happened). Every add instantiates the most recent REAL instance —
// true items, carried prices (amber), honest lineage.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import { PaletteEntry, loadComponentPalette } from "@/lib/studio";
import { loadPlacementStats } from "@/lib/sections";

const DOMAIN_META: Record<string, { icon: string; label: string }> = {
  food: { icon: "🍽", label: "Food" }, decor: { icon: "🎀", label: "Décor" },
  flowers: { icon: "💐", label: "Floral" }, lighting: { icon: "💡", label: "Lighting" },
  music: { icon: "🎵", label: "Entertainment" }, layout: { icon: "🪑", label: "Layout" },
  timeline: { icon: "🕰", label: "Timeline" }, kids: { icon: "🧒", label: "Kids" },
  photo: { icon: "📸", label: "Photography" }, transport: { icon: "🚚", label: "Transport" },
  kitchen: { icon: "👨‍🍳", label: "Kitchen" }, logistics: { icon: "📦", label: "Logistics" },
  staffing: { icon: "👥", label: "Staffing" }, custom: { icon: "•", label: "Custom" },
};

export default function ComponentPalette({ onAdd, busy }: {
  onAdd: (componentIds: string[], sourceLabel: string) => void;
  busy: boolean;
}) {
  const [entries, setEntries] = useState<PaletteEntry[] | null>(null);
  const [q, setQ] = useState("");
  const [openDomain, setOpenDomain] = useState<string | null>("food");
  const [openEntry, setOpenEntry] = useState<string | null>(null);

  const [placement, setPlacement] = useState<Record<string, { sectionName: string; count: number }>>({});
  useEffect(() => {
    loadComponentPalette().then(setEntries);
    loadPlacementStats().then(setPlacement).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const t = q.trim().toLowerCase();
    return t ? entries.filter((e) => e.title.toLowerCase().includes(t) || e.items.some((i) => i.toLowerCase().includes(t))) : entries;
  }, [entries, q]);

  const byDomain = useMemo(() => {
    const m: Record<string, PaletteEntry[]> = {};
    for (const e of filtered) (m[e.domain] ??= []).push(e);
    return m;
  }, [filtered]);
  const domains = Object.keys(byDomain);

  return (
    <div className="flex flex-col h-full">
      <input className="field !py-1.5 !text-xs mb-2 shrink-0" placeholder="Search the library…"
        value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim()) setOpenDomain(null); }} />
      <div className="overflow-y-auto min-h-0 pr-0.5 space-y-1.5">
        {!entries && <p className="text-[12px] text-slate-400">Loading the library…</p>}
        {entries && entries.length === 0 && (
          <p className="text-[12px] text-slate-400">
            The library is empty — it builds itself from real events. Add sections and items
            by hand on the canvas; the next proposal will find them here.
          </p>
        )}
        {domains.map((d) => {
          const meta = DOMAIN_META[d] ?? { icon: "•", label: d };
          const list = byDomain[d];
          const open = q.trim() ? true : openDomain === d;
          return (
            <div key={d} className="rounded-lg ring-1 ring-[#E7EDF5] bg-white">
              <button className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
                onClick={() => setOpenDomain(open ? null : d)}>
                <span>{meta.icon}</span>
                <span className="text-[12px] font-bold">{meta.label}</span>
                <span className="text-[10px] text-slate-400 ml-auto">{list.length}</span>
                <span className="text-slate-300 text-[10px]">{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="px-2 pb-2 space-y-1">
                  {list.map((e) => {
                    const expanded = openEntry === e.latestComponentId;
                    return (
                      <div key={e.latestComponentId} draggable={!busy}
                        onDragStart={(ev) => {
                          ev.dataTransfer.setData("text/eventcore-component",
                            JSON.stringify({ id: e.latestComponentId, label: e.latestBookingLabel || "the library" }));
                          ev.dataTransfer.effectAllowed = "copy";
                        }}
                        className="group rounded-md ring-1 ring-[#E7EDF5] bg-[#F6F8FB] hover:ring-[#4A9EFF] hover:bg-[#F4F9FF] transition-colors cursor-grab active:cursor-grabbing">
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          {e.coverUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={e.coverUrl} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                            : <span className="w-7 h-7 grid place-items-center text-[13px] shrink-0">{DOMAIN_META[e.domain]?.icon ?? "•"}</span>}
                          <button className="min-w-0 flex-1 text-left" onClick={() => setOpenEntry(expanded ? null : e.latestComponentId)}>
                            <div className="text-[12px] font-medium truncate">{e.title}</div>
                            <div className="text-[10px] text-slate-400 truncate">
                              used ×{e.count}{e.items.length ? ` · ${e.items.length} items` : ""}
                              {placement[e.title.toLowerCase()] ? ` · usually ${placement[e.title.toLowerCase()].sectionName} ×${placement[e.title.toLowerCase()].count}` : ""}
                            </div>
                          </button>
                          <button disabled={busy} title={`Add — copies the latest real instance (${e.latestBookingLabel})`}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[13px] font-bold text-[#2F80ED] hover:text-[#102F56] px-1"
                            onClick={() => onAdd([e.latestComponentId], e.latestBookingLabel || "the library")}>＋</button>
                        </div>
                        {expanded && (
                          <div className="px-2.5 pb-2 reveal">
                            {e.items.length > 0 && (
                              <p className="text-[10px] text-slate-500 leading-relaxed">{e.items.join(" · ")}</p>
                            )}
                            <p className="text-[9px] text-slate-400 mt-0.5">latest: {e.latestBookingLabel || "—"} — adding copies this instance, prices arrive unconfirmed</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {entries && entries.length > 0 && (
          <p className="text-[10px] text-slate-300 pt-1">
            Built from your real events — counts are uses across history. Drag or ＋ to add.
          </p>
        )}
      </div>
    </div>
  );
}
