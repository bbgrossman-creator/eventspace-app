"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE PRESENTATION ENTRY (v230 · PUBLICATION §6.5) — the lens's ONE door on
// the Line, plus the commit chrome (Save look / discard — tiny, always
// reachable). The Room itself is a WORKSPACE WING (PresentationRoomRegion):
// it reshapes the stage beside the paper and never obscures it (§6.1).
// ═══════════════════════════════════════════════════════════════════════════
import React from "react";

/** v242 — "compare" is a room STATE, not a nav door: reached only from a
 *  template's Compare Presentation… verb in the Appearance room. */
export type PubRoom = "appearance" | "typography" | "palette" | "paper" | "regions" | "photography" | "compare";
const T = { navy: "#102F56" } as const;

export default function PresentationControls(props: {
  openRoom: PubRoom | null;
  dirty: boolean;
  busy?: boolean;
  canEdit: boolean;
  onOpenRoom: (room: PubRoom) => void;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const open = !!props.openRoom;
  if (!props.canEdit) return null;
  return (
    <span data-pub-controls className="flex items-center gap-1">
      <button data-pub-entry aria-expanded={open} title="Open the Presentation rooms — appearance, typography, palette, paper, regions, photography"
        onClick={() => (open ? props.onClose() : props.onOpenRoom("appearance"))}
        className={`flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md ring-1 transition-colors ${
          open ? "ring-[#102F56] bg-[#102F56] text-white" : "ring-[#E7EDF5] bg-white hover:bg-[#FAFBFD] text-slate-600"}`}>
        Style <span className={open ? "text-white/70" : "text-slate-400"}>▾</span>
      </button>
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
