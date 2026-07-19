"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE LINE (v217 · STUDIO_COMPOSITION §2) — the Studio's single bar of
// chrome. The v196 shell's two bars (Library line + lens bar) and the old
// header row merge here and die there.
//
// Inherited doctrine, intact:
// • X-RAY IS A MODIFIER ON EVERY LENS, NOT A LENS (One-Stage doctrine). It
//   rides beside the Dial; there is no Compose tab.
// • THE DIAL IS DATA. It renders visibleLenses(); it knows the name of no
//   lens. Adding one is a row in lenses.ts, never an option here. The
//   per-lens obligation badges travel into the Dial's options — saliency is
//   DERIVED, never stored (the v177 refusal), and computed-zero renders as
//   silence, not "0".
// • ⌘K summons the Library (the Shade). Typing in the Ask line summons the
//   inline row (the host owns both; this bar only reports).
// • Debt does NOT ride the Line anymore — it rides the Meter
//   (STUDIO_COMPOSITION §10), which is where the money truth lives.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from "react";
import { LensDef, LensKey } from "@/lib/lenses";
import { ModuleObligations, obligationBadge, badgeTitle } from "@/lib/obligations";
import { Session } from "@/lib/permissions";

const T = { ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E", rule: "#E7EDF5", soft: "#F6F8FB" } as const;

export interface DeskAction {
  key: string;
  label: string;
  disabled?: boolean;
  onPick: () => void;
}

export default function StudioLine(p: {
  session: Session | null;
  // identity
  backHref: string;
  title: string;
  contactLine: string;                 // "Goldberg · Wedding · Aug 22 · #560018"
  versions: { id: string; label: string }[];
  versionId: string;
  onVersion: (id: string) => void;
  flow?: { label: string; color?: string; value?: string } | null;
  /** v237 — the version identity menu's verbs (the disposal ruling). */
  onVersionAction?: (action: "duplicate" | "reset-presentation" | "archive" | "delete") => void;
  locked: boolean;
  // the Ask line (summon) — host-owned value
  ask: string;
  onAsk: (q: string) => void;
  onOpenShade: () => void;             // ⌘K / explicit open
  // the Dial
  lenses: LensDef[];
  active: LensKey | null;
  onSelect: (key: LensKey) => void;
  obligations?: Partial<Record<string, ModuleObligations>>;
  // the modifier
  xray: boolean;
  onXray: (on: boolean) => void;
  // v224 — the LENS-OWNED CONTROL SURFACE (PUBLICATION §5): the host
  // computes this from the active lens's `edits` declarations; the Line
  // mounts whatever the lens brought and knows the name of no lens. In
  // Design the presentation controls don't render disabled — they DO NOT
  // EXIST (the absence rule, applied to chrome).
  lensControls?: React.ReactNode;
  // the Second Sheet
  split: boolean;
  onSplit: (on: boolean) => void;
  // the Desk
  desk: DeskAction[];
}) {
  const [dialOpen, setDialOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState(false);
  const askRef = useRef<HTMLInputElement>(null);
  const dialRef = useRef<HTMLSpanElement>(null);
  const deskRef = useRef<HTMLSpanElement>(null);

  // v222 — real popover physics: outside click, Esc, and picking an action
  // all dismiss; opening one menu closes the other. A menu that only its own
  // button can close is a trap, not a menu.
  useEffect(() => {
    if (!dialOpen && !deskOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (dialRef.current?.contains(t) || deskRef.current?.contains(t)) return;
      setDialOpen(false); setDeskOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDialOpen(false); setDeskOpen(false); }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onEsc); };
  }, [dialOpen, deskOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();            // browsers bind Ctrl+K to the address bar
        p.onOpenShade();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mayAuthor = !!p.session?.perms.includes("bookings.edit");
  // v236 — THE PRESSURE LAW: primary controls retain usable geometry;
  // secondary controls surrender first. The Line measures itself:
  //   tier 1 (<1200px): the ⌘K hint yields
  //   tier 2 (<1060px): X-ray and the split sheet collapse into the desk ⋯
  // Search's floor is 240px by GRID construction — it can't be starved.
  const lineRef = React.useRef<HTMLDivElement>(null);
  const [lineW, setLineW] = React.useState(9999);
  React.useEffect(() => {
    const el = lineRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((es) => setLineW(es[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const yieldHint = lineW < 1200;
  const collapse = lineW < 1060;
  const [verOpen, setVerOpen] = React.useState(false);
  const verRef = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    if (!verOpen) return;
    const onDown = (e: MouseEvent) => { if (!verRef.current?.contains(e.target as Node)) setVerOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [verOpen]);
  const activeDef = p.lenses.filter((l) => l.key === p.active)[0] ?? null;

  return (
    // v228 — THE LINE'S GRAMMAR: three zones, each OWNING its space, never
    // fighting for width. Identity (what document) · Workspace (the global
    // Ask) · Lens Tools (View as, the lens's ONE entry, modifiers, desk).
    // A grid, not a wrapping flex row — the Line never stacks. It still
    // sits above the click-away plane (v226): its controls are always live;
    // paper clicks land on the catcher; the Esc law is untouched.
    <div data-line ref={lineRef} className="shrink-0 bg-white border-b px-3 py-1.5 grid items-center gap-3 relative z-40"
         style={{ borderColor: T.rule, gridTemplateColumns: "minmax(0,auto) minmax(240px,1fr) auto" }}>
      {/* ── ZONE 1 · identity ── */}
      <span data-line-identity className="flex items-center gap-1.5 min-w-0">
      <a href={p.backHref} className="text-slate-400 hover:text-slate-600 text-sm shrink-0">‹</a>
        <b className="font-display text-[14px] truncate" style={{ color: T.ink }}>{p.title}</b>
        <span className="text-[11px] text-slate-400 truncate hidden sm:inline">· {p.contactLine}</span>
        <select className="field !py-0 !px-1 !text-[11px]" value={p.versionId}
          onChange={(e) => p.onVersion(e.target.value)} aria-label="Version">
          {p.versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        {/* v237 — THE VERSION IDENTITY MENU (the disposal ruling): the
             Studio owns the OPEN VERSION's lifecycle; the actions live
             behind the version's own name in the identity zone, never as a
             fifth peer control. Gated: sent/approved versions are history
             and refuse disposal. */}
        {p.onVersionAction && (
          <span className="relative shrink-0" ref={verRef}>
            <button data-version-menu aria-expanded={verOpen}
              onClick={() => { setDialOpen(false); setDeskOpen(false); setVerOpen((o) => !o); }}
              className="text-[10px] px-1 py-0.5 rounded border border-slate-200 text-slate-400 hover:text-slate-600"
              title="This version — duplicate, reset its look, archive, or delete">⌄</button>
            {verOpen && (
              <span data-version-menu-list className="absolute left-0 top-full mt-1 z-40 w-56 bg-white rounded-lg shadow-xl ring-1 ring-[#E7EDF5] py-1 block">
                {([
                  { key: "duplicate", label: "Duplicate version…", gated: false },
                  { key: "reset-presentation", label: "Reset presentation…", gated: false },
                  { key: "archive", label: "Archive draft…", gated: true },
                  { key: "delete", label: "Delete draft…", gated: true, danger: true },
                ] as const).map((a) => {
                  const locked = a.gated && (p.flow?.value === "sent" || p.flow?.value === "approved");
                  return (
                    <button key={a.key} data-version-action={a.key} disabled={locked}
                      title={locked ? "Sent and approved versions are history — create a new version instead." : undefined}
                      onClick={() => { setVerOpen(false); p.onVersionAction?.(a.key); }}
                      className={`w-full text-left px-3 py-1.5 text-[12.5px] ${locked ? "text-slate-300"
                        : (a as { danger?: boolean }).danger ? "text-[#B4232A] hover:bg-[#FEF2F2]" : "text-slate-600 hover:bg-[#F4F9FF]"}`}>
                      {a.label}
                    </button>
                  );
                })}
              </span>
            )}
          </span>
        )}
        {/* v223 — status is DOCUMENT METADATA, not a control. Semantic
             correctness (v222) wasn't enough: the pill, dot, toolbar dress
             and tooltip all still said "button". Visual grammar must match
             behavior — so this is plain quiet text, the way Word says
             "Saved". No pill, no border, no hover, no tooltip, no cursor.
             Status TRANSITIONS live on the booking page, deliberately. */}
        {p.flow && (
          <span data-flow-status className="text-[11px] text-slate-400 select-none">· {p.flow.label}</span>
        )}
        {p.locked && <span className="text-[10px] font-semibold text-[#166534]">🔒</span>}
      </span>

      {/* ── ZONE 2 · workspace — the global Ask, alone in its column ── */}
      <span data-line-workspace className="flex items-center gap-1.5 px-2 py-1 rounded-lg ring-1 ring-[#E7EDF5] bg-[#FAFBFD] max-w-[520px] justify-self-center w-full">
        <span aria-hidden className="text-[12px]" style={{ color: T.gold }}>🔍</span>
        <input ref={askRef} data-ask value={p.ask}
          onChange={(e) => p.onAsk(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { p.onAsk(""); askRef.current?.blur(); } }}
          placeholder="Ask for anything — a station, a past event, a blueprint"
          className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] placeholder:text-slate-300 truncate placeholder:truncate"
          style={{ color: T.ink }} />
        {!yieldHint && (
          <button data-open-shade onClick={p.onOpenShade} title="Open the Library"
            className="text-[10px] font-sans px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 hover:text-slate-600 shrink-0">⌘K</button>
        )}
      </span>

      {/* ── ZONE 3 · lens tools ── */}
      <span data-line-tools className="flex items-center gap-1.5 shrink-0">
      <span className="relative shrink-0" ref={dialRef}>
        <button data-dial aria-expanded={dialOpen} onClick={() => { setDeskOpen(false); setDialOpen((o) => !o); }}
          className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md ring-1 ring-[#E7EDF5] bg-white hover:bg-[#FAFBFD]"
          title={activeDef?.blurb}>
          <span className="text-[10px] uppercase tracking-wider text-slate-400">View as</span>
          <b style={{ color: T.navy }}>{activeDef?.label ?? "—"}</b>
          <span className="text-slate-400">▾</span>
        </button>
        {dialOpen && (
          <span data-dial-menu className="absolute right-0 top-full mt-1 z-40 w-52 bg-white rounded-lg shadow-xl ring-1 ring-[#E7EDF5] py-1 block">
            {p.lenses.length === 0 && (
              <span className="block px-3 py-2 text-[11px] text-slate-400">No views available for your permissions.</span>
            )}
            {p.lenses.map((l) => {
              const mod = p.obligations?.[l.module];
              const badge = mod ? obligationBadge(mod) : null;
              return (
                <button key={l.key} data-dial-option={l.key} aria-pressed={l.key === p.active}
                  title={mod ? `${l.blurb}\n\n${badgeTitle(mod)}` : l.blurb}
                  onClick={() => { p.onSelect(l.key); setDialOpen(false); }}
                  className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-[12.5px] hover:bg-[#F4F9FF] ${
                    l.key === p.active ? "font-semibold" : "text-slate-600"}`}
                  style={l.key === p.active ? { color: T.navy } : undefined}>
                  {l.label}
                  {badge && (
                    <span className="ml-auto text-[10px] font-bold leading-none px-1 py-0.5 rounded-full text-white"
                      style={{ background: badge.blocked ? "#94A3B8" : T.gold, minWidth: 14 }}>{badge.n}</span>
                  )}
                </button>
              );
            })}
          </span>
        )}
      </span>

      {/* ── the lens's own controls — declaration-driven, host-supplied ── */}
      {p.lensControls && <span data-lens-controls className="flex items-center gap-1 shrink-0">{p.lensControls}</span>}

      {/* ── the modifier — only where it CHANGES something (registry-driven:
           supports.xray "modifier"). On an inherent lens the edition is
           simply what the dial says, and no dead control renders. ── */}
      {!collapse && mayAuthor && activeDef?.supports?.xray === "modifier" && (
        <button data-xray onClick={() => p.onXray(!p.xray)} aria-pressed={p.xray}
          title="Show the truth the customer never sees: hidden items, unconfirmed prices, drop zones"
          className={`text-[11px] px-2 py-1 rounded-md border transition-colors shrink-0 ${
            p.xray ? "font-semibold text-white" : "text-slate-500 border-slate-200 hover:border-slate-300"}`}
          style={p.xray ? { background: T.gold, borderColor: T.gold } : undefined}>
          X-ray {p.xray ? "▣" : "▢"}
        </button>
      )}

      {/* ── the Second Sheet ── */}
      {!collapse && <button data-split onClick={() => p.onSplit(!p.split)} aria-pressed={p.split}
        title="Second sheet — two complete papers, side by side"
        className={`text-[13px] px-2 py-1 rounded-md border transition-colors shrink-0 ${
          p.split ? "font-semibold text-white" : "text-slate-500 border-slate-200 hover:border-slate-300"}`}
        style={p.split ? { background: T.navy, borderColor: T.navy } : undefined}>⧉</button>}

      {/* ── the Desk ── */}
      <span className="relative shrink-0" ref={deskRef}>
        <button data-desk aria-expanded={deskOpen} onClick={() => { setDialOpen(false); setDeskOpen((o) => !o); }}
          className="text-[13px] px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:border-slate-300">⋯</button>
        {deskOpen && (
          <span data-desk-menu className="absolute right-0 top-full mt-1 z-40 w-48 bg-white rounded-lg shadow-xl ring-1 ring-[#E7EDF5] py-1 block">
            {collapse && mayAuthor && activeDef?.supports?.xray === "modifier" && (
              <button data-desk-xray aria-pressed={p.xray}
                onClick={() => { p.onXray(!p.xray); setDeskOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[#F4F9FF] text-slate-600">
                X-ray {p.xray ? "▣" : "▢"}
              </button>
            )}
            {collapse && (
              <button data-desk-split aria-pressed={p.split}
                onClick={() => { p.onSplit(!p.split); setDeskOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-[#F4F9FF] text-slate-600">
                Second sheet ⧉
              </button>
            )}
            {p.desk.map((a) => (
              <button key={a.key} data-desk-action={a.key} disabled={a.disabled}
                onClick={() => { setDeskOpen(false); a.onPick(); }}
                className="w-full text-left px-3 py-1.5 text-[12.5px] text-slate-600 hover:bg-[#F4F9FF] disabled:opacity-40">
                {a.label}
              </button>
            ))}
          </span>
        )}
      </span>
      </span>
    </div>
  );
}
