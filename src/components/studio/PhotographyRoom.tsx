"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE PHOTOGRAPHY ROOM (v233 · PUBLICATION §7) — propose · choose · pin.
// Slots (the cover + every section) each show their pin, the system's
// PROPOSALS (tag-matched, best first), and the full shelf. Pins are render
// state; Save look commits; unpin keeps the ceremony too. The library is
// managed in Brand Studio — this room only CHOOSES.
// ═══════════════════════════════════════════════════════════════════════════
import React from "react";
import { PhotoRecord, PhotoPins, proposePhotos, pinnedFor } from "@/lib/photos";

const T = { ink: "#1F2A37", rule: "#E7EDF5" } as const;

export default function PhotographyRoom(props: {
  slots: { id: string; name: string }[];        // "__document__" first
  library: PhotoRecord[];
  pins: PhotoPins | null;
  focusSlot?: string | null;
  onPin: (slot: string, photo: PhotoRecord) => void;
  onUnpin: (slot: string) => void;
}) {
  if (!props.library.length) {
    return <p className="text-[11px] text-slate-400 italic">The photo library is empty — add tagged photos in Brand Studio, and this room will start proposing.</p>;
  }
  return (
    <div className="space-y-4">
      {props.slots.map((slot) => {
        const pin = pinnedFor(props.pins, slot.id);
        const proposals = proposePhotos(slot.name, props.library, 3);
        return (
          <div key={slot.id} data-photo-slot={slot.id}
            className={props.focusSlot === slot.id ? "rounded-lg ring-1 ring-[#C9A34E] p-2 -m-2" : undefined}>
            <div className="flex items-baseline gap-2">
              <p className="text-[11px] font-semibold" style={{ color: T.ink }}>
                {slot.id === "__document__" ? "Cover" : slot.name}
              </p>
              {pin && (
                <button data-photo-unpin={slot.id} onClick={() => props.onUnpin(slot.id)}
                  className="text-[10px] text-slate-400 hover:text-slate-600">unpin</button>
              )}
            </div>
            <div className="mt-1 flex gap-1.5 flex-wrap">
              {proposals.map((ph, i) => {
                const active = pin?.id === ph.id;
                return (
                  <button key={ph.id} data-photo-pick={`${slot.id}:${ph.id}`}
                    title={ph.label + (i === 0 ? " — proposed" : "")}
                    onClick={() => props.onPin(slot.id, ph)}
                    className={`relative rounded-md overflow-hidden ring-1 ${active ? "ring-2 ring-[#C9A34E]" : "ring-slate-200 hover:ring-slate-300"}`}>
                    <img src={ph.url} alt={ph.label} className="w-20 h-14 object-cover block" />
                    {i === 0 && !active && (
                      <span className="absolute top-0.5 left-0.5 text-[8px] font-bold uppercase bg-white/85 rounded px-1 text-slate-500">proposed</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
