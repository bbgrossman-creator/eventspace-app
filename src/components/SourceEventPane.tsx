"use client";
// ═══════════════════════════════════════════════════════════════════════════
// SOURCE EVENT LIBRARY (v179) — the Studio's left pane.
// Event-first: opens already answered with events SIMILAR to this one
// (type + guest count), then recent events. Expand an event → its proven
// components, each addable by CLICK (＋) or DRAG onto the canvas.
// Component search remains the drill-down, one tab away, via RolodexPanel.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Booking, fmtDate } from "@/lib/workflow";
import { SourceComponent, loadSimilarEvents, loadRecentEvents, loadSourceComponents } from "@/lib/studio";
import ComponentPalette from "@/components/ComponentPalette";
import { Blueprint, BlueprintPreview, listBlueprints, previewBlueprint } from "@/lib/blueprints";

const DOMAIN_ICON: Record<string, string> = {
  food: "🍽", decor: "🎀", flowers: "💐", lighting: "💡", music: "🎵", layout: "🪑",
  timeline: "🕰", kids: "🧒", photo: "📸", transport: "🚚", kitchen: "👨‍🍳",
  logistics: "📦", staffing: "👥", custom: "•",
};

export default function SourceEventPane({ b, onAdd, onSeed, busy }: {
  b: Booking;
  onAdd: (componentIds: string[], sourceLabel: string) => void;
  onSeed: (event: Booking) => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<"events" | "blueprints" | "components">("events");
  const [bps, setBps] = useState<Blueprint[] | null>(null);
  const [bpPreview, setBpPreview] = useState<Record<string, BlueprintPreview>>({});
  const [openBp, setOpenBp] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Booking[]>([]);
  const [recent, setRecent] = useState<Booking[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [comps, setComps] = useState<Record<string, SourceComponent[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadSimilarEvents(b, 5), loadRecentEvents(b.id, 8)])
      .then(([s, r]) => {
        setSimilar(s);
        const sIds = new Set(s.map((x) => x.id));
        setRecent(r.filter((x) => !sIds.has(x.id)).slice(0, 5));
      }).finally(() => setLoading(false));
  }, [b]);

  const toggle = useCallback(async (ev: Booking) => {
    const next = open === ev.id ? null : ev.id;
    setOpen(next);
    if (next && !comps[ev.id]) {
      const c = await loadSourceComponents(ev.id);
      setComps((p) => ({ ...p, [ev.id]: c }));
    }
  }, [open, comps]);

  function EventRow({ ev, badge }: { ev: Booking; badge?: string }) {
    const isOpen = open === ev.id;
    const list = comps[ev.id];
    return (
      <div className={`rounded-lg ring-1 transition-colors ${isOpen ? "ring-[#4A9EFF] bg-white" : "ring-[#E7EDF5] bg-white hover:ring-[#B9D9FF]"}`}>
        <button className="w-full text-left px-2.5 py-2" onClick={() => toggle(ev)}>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-300 text-[10px]">{isOpen ? "▾" : "▸"}</span>
            <span className="text-[13px] font-semibold truncate">{ev.contact_name}</span>
            {badge && <span className="text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-[#F4F9FF] text-[#2F80ED] shrink-0">{badge}</span>}
          </div>
          <div className="text-[11px] text-slate-400 pl-4">
            {ev.event_type ?? "Event"}{ev.event_date ? ` · ${fmtDate(ev.event_date)}` : ""}{ev.est_guests ? ` · ${ev.est_guests} g` : ""}
          </div>
        </button>
        {isOpen && (
          <div className="px-2.5 pb-2.5 space-y-1 reveal">
            {!list && <p className="text-[11px] text-slate-400 pl-4">Loading…</p>}
            {list?.length === 0 && <p className="text-[11px] text-slate-400 pl-4">No components on this event.</p>}
            {list?.map((c) => (
              <div key={c.id} draggable={!busy}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/eventcore-component", JSON.stringify({ id: c.id, label: `${ev.contact_name}${ev.event_type ? ` ${ev.event_type}` : ""}` }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="group flex items-center gap-2 rounded-md ring-1 ring-[#E7EDF5] bg-[#F6F8FB] px-2 py-1.5 cursor-grab active:cursor-grabbing hover:ring-[#4A9EFF] hover:bg-[#F4F9FF] transition-colors">
                {c.coverUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.coverUrl} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                  : <span className="w-7 h-7 grid place-items-center text-[13px] shrink-0">{DOMAIN_ICON[c.domain] ?? "•"}</span>}
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium truncate">{c.title}</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {c.items.length} item{c.items.length === 1 ? "" : "s"}
                    {c.items.some((i) => i.unit_price != null) ? " · priced" : ""}
                  </div>
                </div>
                <button disabled={busy} title="Add to proposal"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[13px] font-bold text-[#2F80ED] hover:text-[#102F56] px-1"
                  onClick={() => onAdd([c.id], `${ev.contact_name}${ev.event_type ? ` ${ev.event_type}` : ""}`)}>＋</button>
              </div>
            ))}
            {list && list.length > 0 && (
              <div className="flex items-center justify-between pl-1 pt-0.5">
                <button disabled={busy} className="text-[11px] font-semibold text-[#2F80ED] hover:underline"
                  onClick={() => onSeed(ev)}>⤓ Start from this event</button>
                <Link href={`/bookings/${ev.id}`} className="text-[10px] text-slate-400 hover:underline">open ↗</Link>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex rounded-lg ring-1 ring-[#E7EDF5] bg-[#F6F8FB] p-0.5 mb-3 shrink-0">
        {(["events", "blueprints", "components"] as const).map((t) => (
          <button key={t}
            className={`flex-1 rounded-md py-1 text-[11px] font-bold transition-colors ${tab === t ? "bg-white text-[#102F56] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            onClick={() => { setTab(t); if (t === "blueprints" && bps === null) listBlueprints().then(setBps).catch(() => setBps([])); }}>
            {t === "events" ? "Events" : t === "blueprints" ? "Blueprints" : "Library"}
          </button>
        ))}
      </div>

      {tab === "events" ? (
        <div className="space-y-4 overflow-y-auto min-h-0 pr-0.5">
          {loading && <p className="text-[12px] text-slate-400">Finding similar events…</p>}
          {!loading && similar.length === 0 && recent.length === 0 && (
            <p className="text-[12px] text-slate-400">No past events with components yet — run the backfill under Business Model, or build this proposal from scratch on the canvas.</p>
          )}
          {similar.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Similar to this event
              </div>
              <div className="space-y-1.5">
                {similar.map((ev) => <EventRow key={ev.id} ev={ev} badge={ev.event_type === b.event_type ? "match" : undefined} />)}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Recent events</div>
              <div className="space-y-1.5">
                {recent.map((ev) => <EventRow key={ev.id} ev={ev} />)}
              </div>
            </div>
          )}
          <p className="text-[10px] text-slate-300 pt-1">Drag a component onto the canvas, or hover and tap ＋. Prices come along and wait for your confirmation.</p>
        </div>
      ) : tab === "blueprints" ? (
        <div className="overflow-y-auto min-h-0 pr-0.5 space-y-1.5">
          {bps === null && <p className="text-[12px] text-slate-400">Loading blueprints…</p>}
          {bps?.length === 0 && (
            <p className="text-[12px] text-slate-400">
              No blueprints yet — they&apos;re promoted, never authored. Build a proposal worth
              repeating, then <b>📐 Save as Blueprint</b> in the Studio header.
            </p>
          )}
          {bps?.map((bp) => {
            const open = openBp === bp.id;
            const pv = bpPreview[bp.id];
            return (
              <div key={bp.id} className={`rounded-lg ring-1 bg-white transition-colors ${open ? "ring-[#4A9EFF]" : "ring-[#E7EDF5] hover:ring-[#B9D9FF]"}`}>
                <button className="w-full text-left px-2.5 py-2"
                  onClick={async () => {
                    const next = open ? null : bp.id;
                    setOpenBp(next);
                    if (next && !bpPreview[bp.id]) {
                      const p = await previewBlueprint(bp);
                      setBpPreview((x) => ({ ...x, [bp.id]: p }));
                    }
                  }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-300 text-[10px]">{open ? "▾" : "▸"}</span>
                    <span className="text-[13px] font-semibold truncate">📐 {bp.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 pl-4">
                    {bp.event_type ?? "Any event"} · from {bp.source_label || "—"}
                  </div>
                </button>
                {open && (
                  <div className="px-2.5 pb-2.5 space-y-1 reveal">
                    {!pv && <p className="text-[11px] text-slate-400 pl-4">Loading…</p>}
                    {pv?.components.length === 0 && <p className="text-[11px] text-slate-400 pl-4">Source no longer available — retire this blueprint under Content → Blueprints.</p>}
                    {pv?.components.map((c) => (
                      <div key={c.id} className="group flex items-center gap-2 rounded-md ring-1 ring-[#E7EDF5] bg-[#F6F8FB] px-2 py-1.5 hover:ring-[#4A9EFF] hover:bg-[#F4F9FF] transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-medium truncate">{c.title}</div>
                          <div className="text-[10px] text-slate-400 truncate">{c.sectionName ?? "unsectioned"} · {c.itemCount} item{c.itemCount === 1 ? "" : "s"}</div>
                        </div>
                        <button disabled={busy} title="Add just this component"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[13px] font-bold text-[#2F80ED] hover:text-[#102F56] px-1"
                          onClick={() => onAdd([c.id], `blueprint "${bp.name}"`)}>＋</button>
                      </div>
                    ))}
                    {pv && pv.components.length > 0 && (
                      <button disabled={busy} className="text-[11px] font-semibold text-[#2F80ED] hover:underline pl-1"
                        onClick={() => onAdd(pv.components.map((c) => c.id), `blueprint "${bp.name}"`)}>
                        ⤓ Apply whole blueprint ({pv.components.length} components)
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {bps && bps.length > 0 && <p className="text-[10px] text-slate-300 pt-1">Every blueprint traces to a real proposal — prices arrive unconfirmed, sections carry.</p>}
        </div>
      ) : (
        <ComponentPalette onAdd={onAdd} busy={busy} />
      )}
    </div>
  );
}
