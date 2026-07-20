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
// v262 — the pane's Blueprints tab is REFERENCE-ONLY (the citation
// category). Creation is BP-3 (New Proposal → Start from Blueprint);
// authoring reuse is BP-8 (Copy into Draft, on the Shelf). Nothing here
// copies content into the open design.
import { listPublishedBlueprints, PublishedBlueprintSource } from "@/lib/blueprintStartSupabase";
import { ProposalSource, loadProposalSources, loadVersionComponents } from "@/lib/studio";

const DOMAIN_ICON: Record<string, string> = {
  food: "🍽", decor: "🎀", flowers: "💐", lighting: "💡", music: "🎵", layout: "🪑",
  timeline: "🕰", kids: "🧒", photo: "📸", transport: "🚚", kitchen: "👨‍🍳",
  logistics: "📦", staffing: "👥", custom: "•",
};

export default function SourceEventPane({ b, currentProposalId, onAdd, onSeed, busy }: {
  b: Booking;
  currentProposalId: string;
  onAdd: (componentIds: string[], sourceLabel: string) => void;
  onSeed: (event: Booking) => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<"events" | "proposals" | "blueprints" | "components">("events");
  const [bps, setBps] = useState<PublishedBlueprintSource[] | null>(null);
  const [props, setProps] = useState<ProposalSource[] | null>(null);
  const [propFilter, setPropFilter] = useState<"recommended" | "all">("recommended");
  const [openProp, setOpenProp] = useState<string | null>(null);
  const [propPreview, setPropPreview] = useState<Record<string, { id: string; title: string; sectionLabel: string | null; itemCount: number }[]>>({});
  const [showLost, setShowLost] = useState(false);
  const [expandOlder, setExpandOlder] = useState<Record<string, boolean>>({});
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
        {(["events", "proposals", "blueprints", "components"] as const).map((t) => (
          <button key={t}
            className={`flex-1 rounded-md py-1 text-[10.5px] font-bold transition-colors ${tab === t ? "bg-white text-[#102F56] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            onClick={() => {
              setTab(t);
              if (t === "blueprints" && bps === null) listPublishedBlueprints().then(setBps).catch(() => setBps([]));
              if (t === "proposals" && props === null) loadProposalSources(currentProposalId).then(setProps).catch(() => setProps([]));
            }}>
            {t === "events" ? "Events" : t === "proposals" ? "Proposals" : t === "blueprints" ? "Blueprints" : "Library"}
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
      ) : tab === "proposals" ? (
        <div className="flex flex-col min-h-0">
          <div className="flex rounded-lg ring-1 ring-[#E7EDF5] bg-[#F6F8FB] p-0.5 mb-2 shrink-0">
            {(["recommended", "all"] as const).map((f) => (
              <button key={f}
                className={`flex-1 rounded-md py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${propFilter === f ? "bg-white text-[#102F56] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                onClick={() => setPropFilter(f)}>{f === "recommended" ? "Recommended" : "All proposals"}</button>
            ))}
          </div>
          <div className="overflow-y-auto min-h-0 pr-0.5 space-y-1.5">
            {props === null && <p className="text-[12px] text-slate-400">Loading proposals…</p>}
            {props?.length === 0 && (
              <p className="text-[12px] text-slate-400">
                No other proposals yet. As you build proposals across events — won, sent, or even
                unsent drafts — you can build from any of them here.
              </p>
            )}
            {(() => {
              if (!props) return null;
              // Recommended = tiers 0-2 (won/sent/draft); lost (tier 3) behind a reveal.
              const primary = props.filter((p) => propFilter === "all" ? p.tier !== 3 : p.tier !== 3);
              const lost = props.filter((p) => p.tier === 3);
              const rows = (list: ProposalSource[]) => list.map((ps) => {
                const open = openProp === ps.latest.id;
                const pv = propPreview[ps.latest.id];
                const tierColor = ps.tier === 0 ? "bg-[#DCFCE7] text-[#166534]"
                  : ps.tier === 1 ? "bg-[#DBEAFE] text-[#1E40AF]"
                  : ps.tier === 3 ? "bg-[#FEE2E2] text-[#991B1B]"
                  : "bg-[#F1F5F9] text-[#475569]";
                return (
                  <div key={ps.latest.id} className={`rounded-lg ring-1 bg-white transition-colors ${open ? "ring-[#4A9EFF]" : "ring-[#E7EDF5] hover:ring-[#B9D9FF]"} ${ps.tier === 3 ? "opacity-90" : ""}`}>
                    <button className="w-full text-left px-2.5 py-2"
                      onClick={async () => {
                        const next = open ? null : ps.latest.id;
                        setOpenProp(next);
                        if (next && !propPreview[ps.latest.id]) {
                          const c = await loadVersionComponents(ps.latest.id);
                          setPropPreview((x) => ({ ...x, [ps.latest.id]: c }));
                        }
                      }}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-300 text-[10px]">{open ? "▾" : "▸"}</span>
                        <span className="text-[13px] font-semibold truncate">{ps.bookingLabel}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 shrink-0 ${tierColor}`}>{ps.tierLabel}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 pl-4 truncate">
                        {ps.title} · latest v{ps.latest.version}
                        {ps.booked ? " · booked event" : ps.tier === 1 ? " · not booked" : ps.tier === 2 ? " · never sent" : ""}
                      </div>
                    </button>
                    {ps.tier === 3 && <p className="text-[10px] text-[#B91C1C] pl-6 pb-1">use with caution — this proposal didn&apos;t win</p>}
                    {open && (
                      <div className="px-2.5 pb-2.5 space-y-1 reveal">
                        {!pv && <p className="text-[11px] text-slate-400 pl-4">Loading…</p>}
                        {pv?.length === 0 && <p className="text-[11px] text-slate-400 pl-4">This version has no components.</p>}
                        {pv?.map((c) => (
                          <div key={c.id} className="group flex items-center gap-2 rounded-md ring-1 ring-[#E7EDF5] bg-[#F6F8FB] px-2 py-1.5 hover:ring-[#4A9EFF] hover:bg-[#F4F9FF] transition-colors">
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] font-medium truncate">{c.title}</div>
                              <div className="text-[10px] text-slate-400 truncate">{c.sectionLabel ?? "unsectioned"} · {c.itemCount} item{c.itemCount === 1 ? "" : "s"}</div>
                            </div>
                            <button disabled={busy} title="Add just this component"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[13px] font-bold text-[#2F80ED] hover:text-[#102F56] px-1"
                              onClick={() => onAdd([c.id], `${ps.bookingLabel} proposal (v${ps.latest.version})`)}>＋</button>
                          </div>
                        ))}
                        {pv && pv.length > 0 && (
                          <button disabled={busy} className="text-[11px] font-semibold text-[#2F80ED] hover:underline pl-1"
                            onClick={() => onAdd(pv.map((c) => c.id), `${ps.bookingLabel} proposal (v${ps.latest.version})`)}>
                            ⤓ Use this proposal ({pv.length} components)
                          </button>
                        )}
                        {ps.older.length > 0 && (
                          <div className="pl-1 pt-0.5">
                            <button className="text-[10px] text-slate-400 hover:underline"
                              onClick={() => setExpandOlder((x) => ({ ...x, [ps.proposalId]: !x[ps.proposalId] }))}>
                              {expandOlder[ps.proposalId] ? "▾" : "▸"} Older versions ({ps.older.length})
                            </button>
                            {expandOlder[ps.proposalId] && (
                              <div className="pl-2 pt-1 space-y-0.5">
                                {ps.older.map((v) => (
                                  <button key={v.id} disabled={busy}
                                    className="block text-[10px] text-slate-500 hover:text-[#2F80ED]"
                                    onClick={async () => {
                                      const c = await loadVersionComponents(v.id);
                                      if (c.length) onAdd(c.map((x) => x.id), `${ps.bookingLabel} proposal (v${v.version})`);
                                    }}>
                                    ⤓ v{v.version} · {v.status} — use all {v.created_at ? `(${new Date(v.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })})` : ""}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
              return (
                <>
                  {rows(primary)}
                  {lost.length > 0 && (
                    <div className="pt-1">
                      <button className="text-[11px] text-slate-400 hover:text-slate-600 underline"
                        onClick={() => setShowLost((x) => !x)}>
                        {showLost ? "Hide" : "Show"} lost proposals ({lost.length})
                      </button>
                      {showLost && <div className="mt-1.5 space-y-1.5 reveal">{rows(lost)}</div>}
                    </div>
                  )}
                  {props.length > 0 && <p className="text-[10px] text-slate-300 pt-1">Added components arrive amber — even recent proposals are historical pricing, not current truth.</p>}
                </>
              );
            })()}
          </div>
        </div>
      ) : tab === "blueprints" ? (
        <div data-bp-reference className="overflow-y-auto min-h-0 pr-0.5 space-y-1.5">
          {bps === null && <p className="text-[12px] text-slate-400">Loading the shelf…</p>}
          {bps?.length === 0 && (
            <p className="text-[12px] text-slate-400">
              No published Blueprints yet. Knowledge is captured with <b>Promote to Blueprint</b> in the
              Studio header, refined in the Blueprint Editor, and published on the Shelf.
            </p>
          )}
          {bps?.map((bp) => (
            <div key={bp.revisionId} className="rounded-lg ring-1 ring-[#E7EDF5] bg-white px-2.5 py-2">
              <div className="text-[13px] font-semibold truncate">📘 {bp.identityName} · r{bp.revisionNumber}</div>
              <div className="text-[11px] text-slate-400">
                {bp.taxonomy ?? "Any event"} · {bp.content.structure.length} chapter{bp.content.structure.length === 1 ? "" : "s"}
                {bp.content.parameters.length > 0 ? ` · asks ${bp.content.parameters.length} question${bp.content.parameters.length === 1 ? "" : "s"}` : ""}
              </div>
              <a data-bp-view-source href="/blueprint-shelf"
                className="mt-1 inline-block text-[11px] underline text-slate-400 hover:text-slate-600">
                View on the Shelf
              </a>
            </div>
          ))}
          {bps && bps.length > 0 && (
            <p className="text-[10px] text-slate-300 pt-1">
              Reference only — to design from one, use New Proposal → <b>Start from Blueprint</b>; to reuse
              authored structure in another Blueprint, use <b>Copy into Draft</b> on the Shelf.
            </p>
          )}
        </div>
      ) : (
        <ComponentPalette onAdd={onAdd} busy={busy} />
      )}
    </div>
  );
}
