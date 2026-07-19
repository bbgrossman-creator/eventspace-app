"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE ROOMS (v226 · PUBLICATION §6.1) — one summoned surface, one identity.
// This component renders THE CURRENT ROOM'S entire content inside the
// Drawer; switching rooms replaces everything (walking into another room).
// Browsing, not dropdowns: shelves with previews. Every pick is RENDER
// STATE against the Version Override; nothing here persists (§6.4).
// Appearance also carries the DOCUMENT-level treatments — the publication's
// defaults, which per-section treatments override on the paper itself.
// ═══════════════════════════════════════════════════════════════════════════
import React from "react";
import {
  ThemeDelta, ResolvedTheme, BUILT_IN_THEMES, FONT_PAIRINGS, PALETTES, PAPERS,
  TREATMENT_OPTIONS, SectionTreatment, DocumentTreatment, REGION_OPTIONS, PAGE_ANATOMY,
} from "@/lib/publication";
import { PubRoom } from "./PresentationControls";

const T = { ink: "#1F2A37", rule: "#E7EDF5" } as const;

export default function PresentationRooms(props: {
  room: PubRoom;
  /** v227 — the tenant's named themes join the shelf (Brand Studio §8). */
  tenantThemes?: { id: string; name: string }[];
  themeKey: string | null;
  override: ThemeDelta | null;
  resolved: ResolvedTheme;
  onThemeKey: (key: string) => void;
  /** v241 — capture the open version's PORTABLE stratum as a named template. */
  onSaveTemplate?: () => void;
  /** v242 — the template shelf + the compare verb. */
  templates?: { id: string; name: string; description?: string | null }[];
  onCompareTemplate?: (id: string) => void;
  onPatch: (d: ThemeDelta) => void;
}) {
  const r = props.room;
  return (
    <div data-room={r} className="space-y-3">
      {r === "appearance" && (
        <>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Theme</p>
          <div className="space-y-1.5">
            {BUILT_IN_THEMES.map((t) => (
              <button key={t.key} data-room-theme={t.key}
                onClick={() => props.onThemeKey(t.key)}
                className={`w-full text-left px-3 py-2 rounded-lg border hover:bg-[#F4F9FF] ${props.themeKey === t.key ? "ring-1 ring-[#C9A34E]" : ""}`}
                style={{ borderColor: T.rule }}>
                <span className="block text-[13px] font-semibold" style={{ color: T.ink }}>{t.label}</span>
                <span className="block text-[10.5px] text-slate-400">{t.blurb}</span>
              </button>
            ))}
          </div>
          {(props.tenantThemes ?? []).length > 0 && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-1">Your themes</p>
              <div className="space-y-1.5">
                {(props.tenantThemes ?? []).map((t) => (
                  <button key={t.id} data-room-tenant-theme={t.id}
                    onClick={() => props.onThemeKey(t.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border hover:bg-[#F4F9FF] ${props.themeKey === t.id ? "ring-1 ring-[#C9A34E]" : ""}`}
                    style={{ borderColor: T.rule }}>
                    <span className="block text-[13px] font-semibold" style={{ color: T.ink }}>{t.name}</span>
                    <span className="block text-[10.5px] text-slate-400">Named in your Brand Studio</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {(props.templates ?? []).length > 0 && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-1">Templates</p>
              <div className="space-y-1.5">
                {(props.templates ?? []).map((t) => (
                  <button key={t.id} data-room-template={t.id}
                    onClick={() => props.onCompareTemplate?.(t.id)}
                    className="w-full text-left px-3 py-2 rounded-lg border hover:bg-[#F4F9FF]"
                    style={{ borderColor: T.rule }}>
                    <span className="block text-[13px] font-semibold" style={{ color: T.ink }}>{t.name}</span>
                    <span className="block text-[10.5px] text-slate-400">{t.description || "Compare Presentation\u2026"}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {props.onSaveTemplate && (
            <button data-room-save-template onClick={props.onSaveTemplate}
              className="w-full text-left px-3 py-2 rounded-lg border border-dashed text-[11.5px] text-slate-500 hover:border-slate-400 hover:text-slate-700"
              style={{ borderColor: T.rule }}>
              Save presentation as template…
              <span className="block text-[10px] text-slate-400">Captures this version&apos;s document, region, and section dress. Component and item styling stays with this version.</span>
            </button>
          )}
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-2">Document defaults</p>
          <p className="text-[10.5px] text-slate-400 -mt-2">Every section starts from these; style any section directly on the paper.</p>
          {TREATMENT_OPTIONS.map((g) => (
            <div key={g.key}>
              <p className="text-[10px] text-slate-400 mb-1">{g.label}</p>
              <div className="flex gap-1 flex-wrap">
                {g.options.map((o) => {
                  const cur = props.resolved.treatments.document[g.key];
                  return (
                    <button key={o.value} data-room-doc={`${g.key}:${o.value}`}
                      onClick={() => props.onPatch({ treatments: { document: { [g.key]: o.value } as SectionTreatment } })}
                      className={`text-[11px] px-2 py-1 rounded-md border ${cur === o.value ? "bg-[#102F56] text-white border-[#102F56]" : "text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {r === "typography" && (
        <>
          <div className="space-y-1.5">
            {FONT_PAIRINGS.map((f) => (
              <button key={f.key} data-room-pairing={f.key}
                onClick={() => props.onPatch({ fonts: { pairing: f.key } })}
                className={`w-full text-left px-3 py-2 rounded-lg border hover:bg-[#F4F9FF] ${props.resolved.fonts.pairing === f.key ? "ring-1 ring-[#C9A34E]" : ""}`}
                style={{ borderColor: T.rule }}>
                <span className="block text-[15px]" style={{ fontFamily: f.headingStack, color: T.ink }}>{f.heading}</span>
                <span className="block text-[11px] text-slate-500" style={{ fontFamily: f.bodyStack }}>{f.body} — the body voice</span>
                <span className="block text-[9.5px] uppercase tracking-wider text-slate-400 mt-0.5">{f.styleLabel}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {r === "palette" && (
        <>
          <div className="space-y-1.5">
            {PALETTES.map((c) => (
              <button key={c.key} data-room-palette={c.key}
                onClick={() => props.onPatch({ colors: c.colors })}
                className="w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg border hover:bg-[#F4F9FF]"
                style={{ borderColor: T.rule }}>
                <span className="w-5 h-5 rounded-full shrink-0" style={{ background: c.colors.primary }} />
                <span className="w-5 h-5 rounded-full shrink-0 -ml-3.5 ring-2 ring-white" style={{ background: c.colors.accent }} />
                <span className="text-[12.5px] text-slate-600">{c.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {r === "paper" && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {PAPERS.map((pp) => (
              <button key={pp.key} data-room-paper={pp.key}
                onClick={() => props.onPatch({ paper: { tint: pp.tint } })}
                className={`rounded-lg border p-2 text-left hover:bg-[#F4F9FF] ${props.resolved.paper.tint === pp.tint ? "ring-1 ring-[#C9A34E]" : ""}`}
                style={{ borderColor: T.rule }}>
                <span className="block h-10 rounded-md ring-1 ring-slate-200 mb-1" style={{ background: pp.tint }} />
                <span className="text-[11px] text-slate-600">{pp.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {r === "regions" && (
        <>
          {/* v240 — the room reads as the PAGE'S ANATOMY, not a flat list.
              Continuous regions flow once; page-master furniture repeats
              per page and is reserved for print — named here so the
              reservation is legible. */}
          <p className="text-[10.5px] text-slate-400 -mt-1">The page's anatomy. Style lives here and saves with the look; the words and facts live in Brand Studio. These regions flow once — repeating per-page furniture arrives with print.</p>
          {PAGE_ANATOMY.map((zone) => (
            <div key={zone.key} data-room-zone={zone.key} className="pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{zone.label}</p>
              <p className="text-[10px] text-slate-400 mb-1.5">{zone.blurb}</p>
              {zone.regions.map((rk) => {
                const g = REGION_OPTIONS.find((x) => x.key === rk)!;
                return (
                  <div key={g.key} className="mb-2">
                    <p className="text-[11px] font-semibold text-slate-500">{g.label}</p>
                    <p className="text-[10px] text-slate-400 mb-1">{g.blurb}</p>
                    <div className="flex gap-1 flex-wrap">
                      {g.options.map((o) => {
                        const cur = props.resolved.treatments.document[g.key];
                        return (
                          <button key={o.value} data-room-region={`${g.key}:${o.value}`}
                            onClick={() => props.onPatch({ treatments: { document: { [g.key]: o.value } as DocumentTreatment } })}
                            className={`text-[11px] px-2 py-1 rounded-md border ${cur === o.value ? "bg-[#102F56] text-white border-[#102F56]" : "text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {zone.pageMaster?.map((f) => (
                <p key={f} data-room-pagemaster className="text-[10px] text-slate-300 italic">{f} — page-master, arrives with print.</p>
              ))}
              {zone.kind === "reserved" && (
                <p data-room-reserved className="text-[10px] text-slate-300 italic">Reserved.</p>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
