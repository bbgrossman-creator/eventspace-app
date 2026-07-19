"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PRESENTATION ROOM BAR (v226 · PUBLICATION §6.1) — not dropdowns:
// NAVIGATION. Each entry opens a ROOM — one summoned surface whose entire
// identity is what you're working on. The bar itself edits nothing; the
// rooms and the paper do. Save look remains the ONLY commit (§6.4).
// ═══════════════════════════════════════════════════════════════════════════
import React from "react";

export type PubRoom = "appearance" | "typography" | "palette" | "paper";

export default function PresentationControls(props: {
  openRoom: PubRoom | null;
  dirty: boolean;
  busy?: boolean;
  canEdit: boolean;
  onOpenRoom: (room: PubRoom) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!props.canEdit) return null;
  const Entry = (p: { id: PubRoom; label: string }) => (
    <button data-pub-room={p.id} aria-pressed={props.openRoom === p.id}
      onClick={() => props.onOpenRoom(p.id)}
      className={`text-[11px] px-2 py-1 rounded-md ${props.openRoom === p.id
        ? "bg-[#102F56] text-white" : "text-slate-500 hover:text-slate-700"}`}>
      {p.label}
    </button>
  );
  return (
    <span data-pub-controls className="flex items-center gap-0.5">
      <Entry id="appearance" label="Appearance" />
      <Entry id="typography" label="Typography" />
      <Entry id="palette" label="Palette" />
      <Entry id="paper" label="Paper" />
      {props.dirty && (
        <>
          <button data-pub-save disabled={props.busy} onClick={props.onSave}
            className="ml-1 text-[11px] font-semibold text-white rounded-md px-2 py-1" style={{ background: "#102F56" }}>
            Save look
          </button>
          <button data-pub-discard onClick={props.onDiscard}
            className="text-[11px] text-slate-400 hover:text-slate-600">discard</button>
        </>
      )}
    </span>
  );
}
