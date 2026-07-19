"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PRESENTATION CONTROLS (v225 · PUBLICATION §5/§6) — the Presentation
// lens's toolbar, mounted into the Line's lens-owned slot by the HOST from
// `edits.presentation`. This component knows themes; it does not know
// lenses.
//
// THE CEREMONY: every pick redraws the live publication INSTANTLY as render
// state, and nothing persists until the maker commits — "Save look" appears
// only when dirty, Discard is free. Nothing-until-chosen, the house law
// (the regression variant proves the suite bites a copy that persists on
// pick). Structure is not here and never will be (§0.2).
// ═══════════════════════════════════════════════════════════════════════════
import React, { useState } from "react";
import {
  ThemeDelta, BUILT_IN_THEMES, FONT_PAIRINGS, PALETTES, PAPERS, mergeDelta,
} from "@/lib/publication";

const T = { ink: "#1F2A37", navy: "#102F56", rule: "#E7EDF5" } as const;

export default function PresentationControls(props: {
  themeKey: string | null;
  override: ThemeDelta | null;
  dirty: boolean;
  busy?: boolean;
  canEdit: boolean;
  onThemeKey: (key: string | null) => void;         // render state
  onOverride: (next: ThemeDelta) => void;            // render state
  onSave: () => void;                                // THE commit
  onDiscard: () => void;
}) {
  const [menu, setMenu] = useState<null | "theme" | "type" | "palette" | "paper">(null);
  if (!props.canEdit) return null;
  const patch = (d: ThemeDelta) => props.onOverride(mergeDelta(props.override, d));

  const Btn = (p: { id: "theme" | "type" | "palette" | "paper"; label: string }) => (
    <span className="relative">
      <button data-pub-control={p.id} aria-expanded={menu === p.id}
        onClick={() => setMenu(menu === p.id ? null : p.id)}
        className="text-[11px] px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:border-slate-300">
        {p.label} ▾
      </button>
      {menu === p.id && (
        <span data-pub-menu className="absolute right-0 top-full mt-1 z-40 w-56 bg-white rounded-lg shadow-xl ring-1 ring-[#E7EDF5] py-1 block max-h-[50vh] overflow-y-auto">
          {p.id === "theme" && BUILT_IN_THEMES.map((t) => (
            <button key={t.key} data-pub-theme={t.key} title={t.blurb}
              onClick={() => { setMenu(null); props.onThemeKey(t.key); }}
              className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F9FF] ${props.themeKey === t.key ? "font-semibold" : "text-slate-600"}`}
              style={props.themeKey === t.key ? { color: T.navy } : undefined}>{t.label}</button>
          ))}
          {p.id === "type" && FONT_PAIRINGS.map((f) => (
            <button key={f.key} data-pub-pairing={f.key}
              onClick={() => { setMenu(null); patch({ fonts: { pairing: f.key } }); }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#F4F9FF]">
              <span className="block text-[12.5px]" style={{ fontFamily: f.headingStack, color: T.ink }}>{f.heading}</span>
              <span className="block text-[10px] text-slate-400">{f.body} · {f.styleLabel}</span>
            </button>
          ))}
          {p.id === "palette" && PALETTES.map((c) => (
            <button key={c.key} data-pub-palette={c.key}
              onClick={() => { setMenu(null); patch({ colors: c.colors }); }}
              className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-[12px] text-slate-600 hover:bg-[#F4F9FF]">
              <span className="w-3 h-3 rounded-full" style={{ background: c.colors.primary }} />
              <span className="w-3 h-3 rounded-full" style={{ background: c.colors.accent }} />
              {c.label}
            </button>
          ))}
          {p.id === "paper" && PAPERS.map((pp) => (
            <button key={pp.key} data-pub-paper={pp.key}
              onClick={() => { setMenu(null); patch({ colors: { paper: pp.paper } }); }}
              className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-[12px] text-slate-600 hover:bg-[#F4F9FF]">
              <span className="w-3 h-3 rounded-sm ring-1 ring-slate-200" style={{ background: pp.paper }} />
              {pp.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );

  return (
    <span data-pub-controls className="flex items-center gap-1">
      <Btn id="theme" label="Theme" />
      <Btn id="type" label="Type" />
      <Btn id="palette" label="Palette" />
      <Btn id="paper" label="Paper" />
      {props.dirty && (
        <>
          <button data-pub-save disabled={props.busy} onClick={props.onSave}
            className="text-[11px] font-semibold text-white rounded-md px-2 py-1" style={{ background: T.navy }}>
            Save look
          </button>
          <button data-pub-discard onClick={props.onDiscard}
            className="text-[11px] text-slate-400 hover:text-slate-600">discard</button>
        </>
      )}
    </span>
  );
}
