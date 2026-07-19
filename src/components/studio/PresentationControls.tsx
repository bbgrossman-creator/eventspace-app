"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE PRESENTATION ENTRY + THE ROOM (v228 · PUBLICATION §6.1/§6.5)
//
// ONE thing occupies the Line: "Presentation ▾". Everything else happens in
// the Room — a single anchored surface that GROWS OUT OF its invocation
// (never the browser edge), with the room navigator inside it. Two design
// languages stopped fighting: the Line is an almost-empty strip; the Room
// owns all secondary navigation.
//
// The Room is one summoned surface, one identity at a time, Esc returns to
// the paper (capture-phase, the Drawer's law verbatim). Save look / discard
// are commit chrome and stay on the Line — tiny, and always reachable.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useRef } from "react";

export type PubRoom = "appearance" | "typography" | "palette" | "paper";
const ROOMS: { key: PubRoom; label: string }[] = [
  { key: "appearance", label: "Appearance" },
  { key: "typography", label: "Typography" },
  { key: "palette", label: "Palette" },
  { key: "paper", label: "Paper" },
];

const T = { ink: "#1F2A37", navy: "#102F56", rule: "#E7EDF5" } as const;

export default function PresentationControls(props: {
  openRoom: PubRoom | null;
  dirty: boolean;
  busy?: boolean;
  canEdit: boolean;
  onOpenRoom: (room: PubRoom) => void;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
  /** The current room's content — host-supplied (PresentationRooms). */
  roomContent?: React.ReactNode;
}) {
  const open = !!props.openRoom;
  const anchorRef = useRef<HTMLSpanElement>(null);
  // v228 — no overlay element: a catcher inside the Line's stacking context
  // would cover the Line's own siblings (Save included). The dial's v222
  // physics instead: a document listener; outside mousedown dismisses, and
  // the click still lands where it was aimed — clicking the paper closes
  // the Room AND selects, atomically. One thing open, one click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (anchorRef.current?.contains(e.target as Node)) return;
      props.onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, props.onClose]);
  useEffect(() => {
    if (!open) return;
    // THE ESC LAW — one key retreats one layer; capture phase, stopped there.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); props.onClose(); }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, props.onClose]);

  if (!props.canEdit) return null;
  return (
    <span data-pub-controls className="flex items-center gap-1">
      <span className="relative" ref={anchorRef}>
        <button data-pub-entry aria-expanded={open}
          onClick={() => (open ? props.onClose() : props.onOpenRoom("appearance"))}
          className={`flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md ring-1 transition-colors ${
            open ? "ring-[#102F56] bg-[#102F56] text-white" : "ring-[#E7EDF5] bg-white hover:bg-[#FAFBFD] text-slate-600"}`}>
          Presentation <span className={open ? "text-white/70" : "text-slate-400"}>▾</span>
        </button>

        {open && (
          <>
            {/* the Room grows out of the entry: anchored, workspace-aligned */}
            <span data-pub-panel
              className="absolute right-0 top-full mt-2 z-40 w-[560px] max-w-[92vw] bg-white rounded-xl shadow-2xl ring-1 ring-[#E7EDF5] flex overflow-hidden"
              style={{ maxHeight: "min(560px, 72vh)" }}>
              {/* the flap — the panel visibly belongs to its invocation */}
              <span aria-hidden className="absolute -top-[7px] right-9 w-3.5 h-3.5 bg-white rotate-45 ring-1 ring-[#E7EDF5]"
                style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
              {/* the navigator — quiet, inside the Room, not on the Line */}
              <span className="w-[128px] shrink-0 border-r py-2 flex flex-col" style={{ borderColor: T.rule }}>
                <span className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">Presentation</span>
                {ROOMS.map((r) => (
                  <button key={r.key} data-pub-room={r.key} aria-pressed={props.openRoom === r.key}
                    onClick={() => props.onOpenRoom(r.key)}
                    className={`text-left px-3 py-1.5 text-[12px] ${props.openRoom === r.key
                      ? "font-semibold border-r-2" : "text-slate-500 hover:text-slate-700"}`}
                    style={props.openRoom === r.key ? { color: T.navy, borderColor: "#C9A34E" } : undefined}>
                    {r.label}
                  </button>
                ))}
              </span>
              {/* the room itself — the whole identity, quiet header */}
              <span className="flex-1 min-w-0 overflow-y-auto p-3 block">{props.roomContent}</span>
            </span>
          </>
        )}
      </span>

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
