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
  flow?: { label: string; color?: string } | null;
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
  // the Second Sheet
  split: boolean;
  onSplit: (on: boolean) => void;
  // the Desk
  desk: DeskAction[];
}) {
  const [dialOpen, setDialOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState(false);
  const askRef = useRef<HTMLInputElement>(null);

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
  const activeDef = p.lenses.filter((l) => l.key === p.active)[0] ?? null;

  return (
    <div data-line className="shrink-0 bg-white border-b px-3 py-2 flex items-center gap-2 flex-wrap"
         style={{ borderColor: T.rule }}>
      {/* ── identity ── */}
      <a href={p.backHref} className="text-slate-400 hover:text-slate-600 text-sm shrink-0">‹</a>
      <span data-line-identity className="flex items-center gap-1.5 min-w-0">
        <b className="font-display text-[14px] truncate" style={{ color: T.ink }}>{p.title}</b>
        <span className="text-[11px] text-slate-400 truncate hidden sm:inline">· {p.contactLine}</span>
        <select className="field !py-0 !px-1 !text-[11px]" value={p.versionId}
          onChange={(e) => p.onVersion(e.target.value)} aria-label="Version">
          {p.versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        {p.flow && (
          <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5"
            style={{ backgroundColor: p.flow.color }}>{p.flow.label}</span>
        )}
        {p.locked && <span className="text-[10px] font-semibold text-[#166534]">🔒</span>}
      </span>

      {/* ── the Ask line ── */}
      <span className="flex-1 min-w-[160px] flex items-center gap-1.5 px-2 py-1 rounded-lg ring-1 ring-[#E7EDF5] bg-[#FAFBFD]">
        <span aria-hidden className="text-[12px]" style={{ color: T.gold }}>🔍</span>
        <input ref={askRef} data-ask value={p.ask}
          onChange={(e) => p.onAsk(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { p.onAsk(""); askRef.current?.blur(); } }}
          placeholder="Ask for anything — a station, a past event, a blueprint"
          className="flex-1 bg-transparent outline-none text-[12.5px] placeholder:text-slate-300"
          style={{ color: T.ink }} />
        <button data-open-shade onClick={p.onOpenShade} title="Open the Library"
          className="text-[10px] font-sans px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 hover:text-slate-600">⌘K</button>
      </span>

      {/* ── the Dial ── */}
      <span className="relative shrink-0">
        <button data-dial aria-expanded={dialOpen} onClick={() => setDialOpen((o) => !o)}
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

      {/* ── the modifier ── */}
      {mayAuthor && (
        <button data-xray onClick={() => p.onXray(!p.xray)} aria-pressed={p.xray}
          title="Show the truth the customer never sees: hidden items, unconfirmed prices, drop zones"
          className={`text-[11px] px-2 py-1 rounded-md border transition-colors shrink-0 ${
            p.xray ? "font-semibold text-white" : "text-slate-500 border-slate-200 hover:border-slate-300"}`}
          style={p.xray ? { background: T.gold, borderColor: T.gold } : undefined}>
          X-ray {p.xray ? "▣" : "▢"}
        </button>
      )}

      {/* ── the Second Sheet ── */}
      <button data-split onClick={() => p.onSplit(!p.split)} aria-pressed={p.split}
        title="Second sheet — two complete papers, side by side"
        className={`text-[13px] px-2 py-1 rounded-md border transition-colors shrink-0 ${
          p.split ? "font-semibold text-white" : "text-slate-500 border-slate-200 hover:border-slate-300"}`}
        style={p.split ? { background: T.navy, borderColor: T.navy } : undefined}>⧉</button>

      {/* ── the Desk ── */}
      <span className="relative shrink-0">
        <button data-desk aria-expanded={deskOpen} onClick={() => setDeskOpen((o) => !o)}
          className="text-[13px] px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:border-slate-300">⋯</button>
        {deskOpen && (
          <span data-desk-menu className="absolute right-0 top-full mt-1 z-40 w-48 bg-white rounded-lg shadow-xl ring-1 ring-[#E7EDF5] py-1 block">
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
    </div>
  );
}
