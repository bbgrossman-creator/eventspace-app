"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE ROOM AS WORKSPACE WING (v230 · PUBLICATION §6.1 amended)
//
// THE LAW: the Room NEVER obscures the paper — it reshapes the workspace
// around it. Opening Presentation recomposes the stage to  Room | Paper ;
// the paper contracts and remains fully visible; closing restores it. Not
// a modal overlay, not a permanent sidebar: a temporary studio you stand
// in, beside the document.
//
// One Room, one identity (the navigator lives here, not on the Line); Esc
// retreats one layer (capture phase); an outside mousedown dismisses and
// lands where it was aimed, atomically. Every pick is render state; Save
// look on the Line is the only commit.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useRef } from "react";
import { PubRoom } from "./PresentationControls";

const ROOMS: { key: PubRoom; label: string }[] = [
  { key: "appearance", label: "Appearance" },
  { key: "typography", label: "Typography" },
  { key: "palette", label: "Palette" },
  { key: "paper", label: "Paper" },
];
const T = { navy: "#102F56", rule: "#E7EDF5" } as const;

export default function PresentationRoomRegion(props: {
  openRoom: PubRoom;
  onOpenRoom: (room: PubRoom) => void;
  onClose: () => void;
  children: React.ReactNode;   // the current room's content
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); props.onClose(); }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if ((t as Element).closest?.("[data-pub-controls]")) return;   // the Line's chrome stays live
      props.onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("mousedown", onDown);
    };
  }, [props.onClose]);

  return (
    <div ref={ref} data-pub-region
      className="my-10 bg-white rounded-[4px] ring-1 ring-black/5 self-start sticky top-[64px] flex overflow-hidden"
      style={{ maxHeight: "calc(100vh - 96px)", boxShadow: "0 1px 2px rgba(16,47,86,.08)" }}>
      <div className="w-[112px] shrink-0 border-r py-2 flex flex-col" style={{ borderColor: T.rule }}>
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
        <button data-pub-region-close onClick={props.onClose}
          className="mt-auto text-left px-3 py-2 text-[10px] text-slate-300 hover:text-slate-500">Esc · close</button>
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto p-3">{props.children}</div>
    </div>
  );
}
