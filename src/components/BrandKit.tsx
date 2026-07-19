"use client";
// ═══════════════════════════════════════════════════════════════════════════
// BRAND KIT (v227 · PUBLICATION §8) — the COMPANY's look: the Brand rung of
// the ladder, which every proposal inherits and individual versions override
// only where they need to. Presentational by design (data + callbacks in,
// no data client) so the composition is harness-provable.
//
// THE CEREMONY IS THE HOUSE'S: every pick is draft state against the brand
// delta; "Save brand" is the only commit; "Save as theme…" NAMES the current
// draft as a reusable theme WITHOUT committing the brand itself. Semantic
// choices only — the same curated registries the Studio's rooms use.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useState } from "react";
import {
  ThemeDelta, ResolvedTheme, BUILT_IN_THEMES, FONT_PAIRINGS, PALETTES, PAPERS,
  TREATMENT_OPTIONS, SectionTreatment,
} from "@/lib/publication";

const T = { ink: "#1F2A37", navy: "#102F56", rule: "#E7EDF5" } as const;

export default function BrandKit(props: {
  draft: ThemeDelta | null;                 // the working brand delta
  resolved: ResolvedTheme;                  // system + draft, for showing current picks
  dirty: boolean;
  busy?: boolean;
  defaultThemeKey: string | null;           // "__brand__" | built-in key | tenant theme id
  themeChoices: { key: string; label: string }[];  // for the default-theme select
  onPatch: (d: ThemeDelta) => void;         // draft state
  onDefaultTheme: (key: string) => void;    // draft state
  onSave: () => void;                       // THE commit
  onDiscard: () => void;
  onSaveAsTheme: (name: string) => void;    // names the draft; commits nothing else
}) {
  const [themeName, setThemeName] = useState("");

  const Section = (p: { title: string; blurb?: string; children: React.ReactNode }) => (
    <section className="mb-6">
      <h2 className="text-[13px] font-semibold mb-0.5" style={{ color: T.ink }}>{p.title}</h2>
      {p.blurb && <p className="text-[11px] text-slate-400 mb-2">{p.blurb}</p>}
      {p.children}
    </section>
  );

  return (
    <div data-brand-kit className="max-w-[640px]">
      <Section title="Typography" blurb="The company voice — a pairing, never a font list.">
        <div className="grid grid-cols-2 gap-1.5">
          {FONT_PAIRINGS.map((f) => (
            <button key={f.key} data-brand-pairing={f.key} disabled={props.busy}
              onClick={() => props.onPatch({ fonts: { pairing: f.key } })}
              className={`text-left px-3 py-2 rounded-lg border hover:bg-[#F4F9FF] ${props.resolved.fonts.pairing === f.key ? "ring-1 ring-[#C9A34E]" : ""}`}
              style={{ borderColor: T.rule }}>
              <span className="block text-[14px]" style={{ fontFamily: f.headingStack, color: T.ink }}>{f.heading}</span>
              <span className="block text-[9.5px] uppercase tracking-wider text-slate-400">{f.styleLabel}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Palette">
        <div className="flex flex-wrap gap-1.5">
          {PALETTES.map((c) => (
            <button key={c.key} data-brand-palette={c.key} disabled={props.busy}
              onClick={() => props.onPatch({ colors: c.colors })}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border hover:bg-[#F4F9FF] ${props.resolved.colors.primary === c.colors.primary ? "ring-1 ring-[#C9A34E]" : ""}`}
              style={{ borderColor: T.rule }}>
              <span className="w-4 h-4 rounded-full" style={{ background: c.colors.primary }} />
              <span className="w-4 h-4 rounded-full -ml-2.5 ring-2 ring-white" style={{ background: c.colors.accent }} />
              <span className="text-[11.5px] text-slate-600">{c.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Paper">
        <div className="flex gap-1.5">
          {PAPERS.map((pp) => (
            <button key={pp.key} data-brand-paper={pp.key} disabled={props.busy}
              onClick={() => props.onPatch({ paper: { tint: pp.tint } })}
              className={`rounded-lg border p-1.5 hover:bg-[#F4F9FF] ${props.resolved.paper.tint === pp.tint ? "ring-1 ring-[#C9A34E]" : ""}`}
              style={{ borderColor: T.rule }}>
              <span className="block h-8 w-12 rounded ring-1 ring-slate-200" style={{ background: pp.tint }} />
              <span className="text-[10px] text-slate-500">{pp.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Document defaults" blurb="Every proposal's sections start from these.">
        {TREATMENT_OPTIONS.map((g) => (
          <div key={g.key} className="mb-2">
            <p className="text-[10px] text-slate-400 mb-1">{g.label}</p>
            <div className="flex gap-1">
              {g.options.map((o) => (
                <button key={o.value} data-brand-doc={`${g.key}:${o.value}`} disabled={props.busy}
                  onClick={() => props.onPatch({ treatments: { document: { [g.key]: o.value } as SectionTreatment } })}
                  className={`text-[11px] px-2 py-1 rounded-md border ${props.resolved.treatments.document[g.key] === o.value
                    ? "bg-[#102F56] text-white border-[#102F56]" : "text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Default theme" blurb="What a new proposal wears at birth. 'Company brand' is the bare kit above.">
        <select data-brand-default className="field !py-1.5 !text-[12px] w-64" disabled={props.busy}
          value={props.defaultThemeKey ?? "__brand__"}
          onChange={(e) => props.onDefaultTheme(e.target.value)}>
          <option value="__brand__">Company brand</option>
          {props.themeChoices.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </Section>

      <Section title="Name this look" blurb="Saves the current draft as a reusable theme — the brand itself stays as it is until you Save brand.">
        <div className="flex gap-2">
          <input data-brand-theme-name className="field !py-1.5 !text-[12px] flex-1" placeholder='e.g. "Wedding Luxury"'
            value={themeName} onChange={(e) => setThemeName(e.target.value)} />
          <button data-brand-save-theme disabled={props.busy || !themeName.trim()}
            onClick={() => { props.onSaveAsTheme(themeName.trim()); setThemeName(""); }}
            className="text-[12px] font-semibold rounded-lg px-3 py-1.5 ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50">
            Save as theme…
          </button>
        </div>
      </Section>

      <div className="flex items-center gap-2 border-t pt-3" style={{ borderColor: T.rule }}>
        {props.dirty ? (
          <>
            <button data-brand-save disabled={props.busy} onClick={props.onSave}
              className="text-[12px] font-semibold text-white rounded-lg px-3 py-1.5" style={{ background: T.navy }}>
              Save brand
            </button>
            <button data-brand-discard onClick={props.onDiscard}
              className="text-[12px] text-slate-400 hover:text-slate-600">discard</button>
          </>
        ) : (
          <span className="text-[11px] text-slate-400">Saved — this is the company's look.</span>
        )}
      </div>
    </div>
  );
}
