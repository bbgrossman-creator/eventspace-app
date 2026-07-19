"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE STAGE FURNITURE (v217 · STUDIO_COMPOSITION §4/§6/§10) — three small
// organs of the recomposed Studio, kept in one file because they share the
// stage's physics:
//
//   Meter        — the floating facts (per person · total · debt). Derived
//                  from canonical totals; stores nothing; cannot lie.
//   Drawer       — the summoned right-margin overlay (Inspector, Notes,
//                  Files). Lives exactly as long as the question; Esc,
//                  click-away, or dismissal returns to composition. It
//                  OVERLAYS the margin — the Paper never reflows (a Law
//                  invariant the acceptance suite measures).
//   GhostOutline — the margin ticks + the summoned outline panel. The
//                  Outline, subordinated: same lens-owned projection, no
//                  column.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect } from "react";

const T = { ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E", rule: "#E7EDF5" } as const;

// ── THE METER ──────────────────────────────────────────────────────────────
export function Meter(p: {
  perPerson: string | null;            // null = guests unknown; the line hides
  totalLabel: string;                  // "Goldberg evening"
  total: string;
  debt: number;
  onDebt?: () => void;                 // travel to the first unresolved thing
}) {
  return (
    <aside data-meter aria-label="Running total"
      className="fixed z-30 right-[max(14px,calc((100vw-1280px)/2))] bottom-[26vh] text-right font-sans tabular-nums pointer-events-none">
      {p.perPerson && (<>
        <div className="text-[10.5px] text-slate-400">per person</div>
        <div className="text-[15px] font-medium" style={{ color: T.ink }}>{p.perPerson}</div>
      </>)}
      <div className="text-[10.5px] text-slate-400 mt-1.5">{p.totalLabel}</div>
      <div data-meter-total className="text-[15px] font-medium" style={{ color: T.ink }}>{p.total}</div>
      {p.debt > 0 && (
        <button data-meter-debt onClick={p.onDebt}
          title={`${p.debt} price${p.debt === 1 ? "" : "s"} unconfirmed or missing — click to go there`}
          className="pointer-events-auto mt-1.5 text-[11px] font-semibold" style={{ color: T.gold }}>
          {p.debt} to confirm
        </button>
      )}
    </aside>
  );
}

// ── THE DRAWER ─────────────────────────────────────────────────────────────
export function Drawer(p: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!p.open) return;
    // THE ESC LAW (STUDIO_COMPOSITION §0.2): one key retreats ONE layer. The
    // drawer is the topmost stage summon, so its listener runs in the capture
    // phase and stops the event there — the ghost beneath survives the same
    // keystroke and takes the next one.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); p.onClose(); }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [p.open, p.onClose]);
  if (!p.open) return null;
  return (
    <>
      {/* click-away catcher — transparent; returning to the Paper IS the dismissal */}
      <div data-drawer-away className="fixed inset-0 z-30" onClick={p.onClose} />
      <aside data-drawer role="dialog" aria-label={p.title}
        className="fixed z-40 top-[52px] bottom-0 right-0 w-[min(420px,92vw)] bg-white shadow-2xl border-l flex flex-col"
        style={{ borderColor: T.rule }}>
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: T.rule }}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{p.title}</span>
          <button data-drawer-close onClick={p.onClose}
            className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 hover:text-slate-600">Esc</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{p.children}</div>
      </aside>
    </>
  );
}

// ── THE GHOST OUTLINE ──────────────────────────────────────────────────────
export interface GhostTick { id: string; label: string; debt: number }

export function GhostOutline(p: {
  ticks: GhostTick[];
  open: boolean;
  onOpen: (on: boolean) => void;
  onTravel: (chapterId: string) => void;
  /** The real outline projection, mounted by the host (lens-owned — a
   *  Layout lens will hand a different one in). */
  panel: React.ReactNode;
}) {
  // ⌘G — keyboards get the same door as the hover.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g") { e.preventDefault(); p.onOpen(!p.open); }
      if (e.key === "Escape" && p.open) p.onOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.open, p.onOpen]);

  if (p.ticks.length === 0) return null;
  return (
    <>
      <nav data-ghost-ticks aria-label="Chapters"
        className="fixed z-20 left-[max(6px,calc((100vw-1280px)/2 - 8px))] top-1/2 -translate-y-1/2 flex flex-col gap-2"
        onMouseEnter={() => p.onOpen(true)}>
        {p.ticks.map((t) => (
          <button key={t.id} data-ghost-tick={t.id} title={t.label + (t.debt ? ` · ${t.debt} unresolved` : "")}
            onClick={() => p.onTravel(t.id)}
            className="w-3.5 h-[3px] rounded-full"
            style={{ background: t.debt > 0 ? T.gold : "#CBD5E1" }} />
        ))}
      </nav>
      {p.open && (
        <div data-ghost-panel
          className="fixed z-40 left-[max(10px,calc((100vw-1280px)/2))] top-24 bottom-24 w-[260px] bg-white rounded-lg shadow-2xl ring-1 ring-[#E7EDF5] overflow-y-auto"
          onMouseLeave={() => p.onOpen(false)}>
          {p.panel}
        </div>
      )}
    </>
  );
}
