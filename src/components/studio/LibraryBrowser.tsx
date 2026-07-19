"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE LIBRARY BROWSER (v196 slice 3 · rebuilt registry-driven v215)
//
// Ctrl+K → the organisation's memory. Browsed on demand, never resident:
// the Library is GLOBAL and in the LEARNED tense, while everything below the
// divide is event-scoped and INTENDED. Different scope AND different tense ⇒
// different physical treatment. (v213 corrected the physical treatment:
// docked, expands in place, the Canvas stays visible — UI_GRAMMAR §12.)
//
// A BROWSER, NOT A DRAWER. A drawer stores; a browser is how you interact
// with something too large to store.
//
// v215 — THE BROWSER KNOWS NO KIND BY NAME (KA §4). The hardcoded
// KIND_LABEL/KIND_ICON records and the per-kind branches in go() and the
// drag handler are gone; every rail heading, glyph, pick action, drag
// payload, and secondary affordance arrives from the kind's REGISTRATION.
// Adding a knowledge type must not modify the Library — and now it cannot:
// there is nothing here to modify. (Search the file for a kind string; the
// absence is the claim.)
//
// UNDER THE RENDERER CONTRACT: this component NEVER queries.
// searchLibraryRails() is the projection; this is the rendering. If it wants
// a fact the rails lack, the projection is wrong.
//
// CLOSES ON PICK — never mid-gesture. The fluid part of Ctrl+K is that it
// gets out of the way the instant it has served its purpose.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import {
  searchLibraryRails, railCount, libraryKind, IDLE_RAILS,
  LibraryRails, LibraryEntry,
} from "@/lib/libraryRegistry";
// The HOST boots the kind registrations (bootLibraryKinds beside bootMoves
// in the page) — the browser consumes whatever is registered and registers
// nothing, which is also what lets fixture harnesses mount it over fixture
// kinds alone.

const T = { ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E", rule: "#E7EDF5" } as const;

export interface LibraryBrowserProps {
  open: boolean;
  onClose: () => void;
  /** v213 (Studio shell): render docked as the Knowledge strip — expands in
   *  place beneath the top bar, THE CANVAS STAYS VISIBLE (UI_GRAMMAR §12).
   *  Expansion state is a render decision, never persisted. */
  docked?: boolean;
  /** Instantiate this identity into the current event. Absent = no event in
   *  context (the Library is browsable from anywhere), so the action hides. */
  onInstantiate?: (identityId: string, name: string) => void;
  /** v207: open the definition (curation surface) for a result whose
   *  registration offers that secondary affordance. */
  onViewDefinition?: (definitionId: string, name: string) => void;
  /** v216: land a whole design here (the host routes it through the landing
   *  decision — never a silent merge). Absent = no Canvas in context; the
   *  browser falls back to the entry's pointer. Every drag has a click path:
   *  this is the click path for the blueprint card's drag. */
  onLandDesign?: (id: string, name: string) => void;
}

export default function LibraryBrowser({ open, onClose, onInstantiate, onViewDefinition, onLandDesign, docked }: LibraryBrowserProps) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<LibraryRails>(IDLE_RAILS);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search. The projection is async; the browser stays responsive.
  useEffect(() => {
    if (!open) return;
    const h = setTimeout(async () => {
      setBusy(true);
      try { setRes(await searchLibraryRails(q)); } finally { setBusy(false); }
      setCursor(0);
    }, 160);
    return () => clearTimeout(h);
  }, [q, open]);

  useEffect(() => {
    if (open) { setQ(""); setRes(IDLE_RAILS); setCursor(0);
                setTimeout(() => inputRef.current?.focus(), 10); }
  }, [open]);

  if (!open) return null;

  // Flatten for keyboard navigation — the visual grouping is presentation;
  // the keyboard walks one list, because that is what fingers expect.
  const flat: LibraryEntry[] = [];
  for (const rail of res.rails) for (const e of rail.entries) flat.push(e);
  const active = flat[cursor];

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter" && active) { e.preventDefault(); go(active); }
  };

  /** ↵ / click. The MEANING comes from the registration; the browser only
   *  routes it. Instantiate falls back to navigate when no host handler
   *  exists, because the Library is browsable from anywhere. */
  function go(entry: LibraryEntry) {
    const reg = libraryKind(entry.kind);
    if (!reg) return;
    const action = reg.pick(entry);
    if (action.type === "instantiate" && onInstantiate) {
      onInstantiate(action.instantiateId, action.name);
      onClose();                       // closes ON PICK — the gesture is complete
      return;
    }
    if (action.type === "land" && onLandDesign) {
      onLandDesign(action.id, action.name);
      onClose();                       // the decision opens beyond the browser
      return;
    }
    const href = action.type === "navigate" ? action.href
      : (action.type === "instantiate" || action.type === "land") ? entry.pointer.href : null;
    if (href) { window.location.href = href; onClose(); }
  }

  /** The hint the active row shows — what ↵ will DO, stated, not implied. */
  function hintFor(entry: LibraryEntry): string | null {
    const reg = libraryKind(entry.kind);
    if (!reg) return null;
    const action = reg.pick(entry);
    if (action.type === "instantiate" && onInstantiate) return "↵ add to event";
    if (action.type === "land" && onLandDesign) return "↵ use this design";
    if (action.type === "navigate"
      || ((action.type === "instantiate" || action.type === "land") && entry.pointer.href)) return "↵ open";
    return null;
  }

  const body = (
      <div
        data-knowledge-strip={docked ? "true" : undefined}
        className={docked
          ? "w-full bg-white overflow-hidden"
          : "w-full max-w-xl bg-white rounded-xl shadow-2xl ring-1 overflow-hidden"}
        style={docked ? undefined : { borderColor: T.rule }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: T.rule }}>
          <span aria-hidden style={{ color: T.gold }}>🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search the Library — everything this business knows…"
            className="flex-1 text-[14px] outline-none placeholder:text-slate-300"
            style={{ color: T.ink }}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-400">Esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1">
          {res.idle && (
            // "Type to search" and "no results" are DIFFERENT FACTS. Collapsing
            // them into one empty state tells the user the Library is empty.
            <p data-library-idle className="px-3 py-6 text-[13px] text-center text-slate-400">
              Search everything this business has done before.
            </p>
          )}
          {!res.idle && busy && <p className="px-3 py-6 text-[13px] text-center text-slate-400">Searching…</p>}
          {!res.idle && !busy && railCount(res) === 0 && (
            <p data-library-empty className="px-3 py-6 text-[13px] text-center text-slate-400">
              Nothing found for “{q}”.
            </p>
          )}
          {(() => {
            // Rails render in the order the projection returned them — best
            // hit first (KA §5); the browser adds nothing to the ranking.
            let from = 0;
            return res.rails.map((rail) => {
              const start = from;
              from += rail.entries.length;
              return (
                <div className="mb-1" key={rail.kind} data-library-rail={rail.kind}>
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {rail.label}
                  </div>
                  {rail.entries.map((entry, i) => {
                    const idx = start + i;
                    const on = idx === cursor;
                    const reg = libraryKind(entry.kind);
                    const dragPayload = reg?.drag ? reg.drag(entry) : null;
                    const secondary = reg?.secondary ? reg.secondary(entry) : null;
                    const hint = hintFor(entry);
                    return (
                      <button
                        key={`${entry.kind}-${entry.id}`}
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => go(entry)}
                        // Drag is the fast path; ↵ is the click path. Both are
                        // the registration's verb. Every drag has a click path.
                        draggable={!!dragPayload}
                        onDragStart={(e) => {
                          if (!dragPayload) return;
                          e.dataTransfer.setData(dragPayload.mime, dragPayload.payload);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        className={`w-full flex items-baseline gap-2 px-3 py-2 text-left ${on ? "bg-[#F4F9FF]" : ""}`}
                      >
                        <span style={{ color: T.gold }}>{rail.icon}</span>
                        <span className="text-[13.5px] font-medium" style={{ color: T.ink }}>{entry.title}</span>
                        {/* The WHY — a hit is only useful if you can see why it's here. */}
                        {entry.subtitle && <span className="text-[12px] text-slate-400 truncate">{entry.subtitle}</span>}
                        {/* Layer badges: exactly the layers the object actually
                            carries (KA §4) — today that is none, and none is
                            what renders. Never a simulation. */}
                        {entry.layer_badges.map((b) => (
                          <span key={b} data-layer-badge={b}
                            className="text-[9px] px-1 rounded bg-[#F6F8FB] text-slate-400 border border-slate-200">{b}</span>
                        ))}
                        {secondary && onViewDefinition && (
                          <span data-view-definition={secondary.id}
                            className="ml-auto text-[10px] text-slate-300 hover:text-slate-500 cursor-pointer shrink-0"
                            onClick={(e) => { e.stopPropagation(); onViewDefinition(secondary.id, secondary.title); }}
                            title="View definition — the organizational knowledge behind this component">
                            {secondary.label}
                          </span>
                        )}
                        <span className="flex-1" />
                        {on && hint && (
                          <span className="text-[10px] text-slate-400">{hint}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>

        <div className="px-3 py-1.5 border-t text-[10px] text-slate-400 flex gap-3" style={{ borderColor: T.rule }}>
          <span>↑↓ navigate</span><span>↵ select</span><span>esc close</span>
        </div>
      </div>
  );
  if (docked) return <div className="border-b" style={{ borderColor: T.rule }}>{body}</div>;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/20" onClick={onClose}>
      {body}
    </div>
  );
}
