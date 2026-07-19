"use client";
// v221 — "How is this event organized?" The seed is a QUESTION (two event
// grammars: timelines vs continuous service), asked once at proposal
// creation, never preselected — the outline is not chosen FOR the user.
// Dumb by design: renders the archetypes, reports the pick; the host seeds.
import React from "react";
import { ARCHETYPES } from "@/lib/archetypes";

export default function ArchetypePick(p: {
  value: string | null;
  onChange: (key: string) => void;
}) {
  return (
    <div data-archetype-pick className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">How is this event organized?</p>
      {ARCHETYPES.map((a) => (
        <label key={a.key} data-archetype={a.key}
          className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer text-[12px] ${
            p.value === a.key ? "bg-[#F4F9FF]" : "hover:bg-slate-50"}`}
          style={{ borderColor: p.value === a.key ? "#C9A34E" : "#E7EDF5" }}>
          <input type="radio" name="archetype" className="mt-0.5 accent-[#102F56]"
            checked={p.value === a.key} onChange={() => p.onChange(a.key)} />
          <span>
            <span className="font-semibold text-[#1F2A37]">{a.label}</span>
            <span className="block text-[10.5px] text-slate-400">{a.blurb}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
