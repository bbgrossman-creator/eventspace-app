"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE SECOND SHEET (v217 · STUDIO_COMPOSITION §8–9) — simultaneity by
// request. The v213 Live Lens's machinery, promoted to a whole paper: the
// registry-driven switcher, the structurally read-only frame
// (LiveLensPanel), the projection mounts — all inherited; only the
// RESIDENCY changed. "Preview is replaced by the Live Lens" stands; this is
// where the Live Lens lives now, at full dignity, summoned by ⧉ and gone
// the same way.
//
// The choice is RENDER STATE (useState, written nowhere) — the same law the
// v214 regression variant proved the suite can bite over, and this
// component's variant proves it again for the split.
// Which lenses may be offered is the registry's business (the host passes
// visibleLenses ∩ its renderer table). This file imports no registry:
// composition, not knowledge.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from "react";
import LiveLensPanel from "./LiveLensPanel";
import { SheetOption, effectiveSheetChoice } from "@/lib/sheetChoice";

const T = { gold: "#C9A34E" } as const;

export default function SecondSheet(props: {
  options: SheetOption[];
  projections: Record<string, React.ReactNode | null>;
  emptyReasons?: Record<string, string>;
  /** The host loads the chosen projection's model. Fired on mount and every
   *  change — one event source; the host's mirror cannot drift. */
  onSheetLens?: (key: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const effective = effectiveSheetChoice(chosen, props.options);

  const { onSheetLens } = props;
  useEffect(() => {
    if (effective) onSheetLens?.(effective);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective]);

  const current = props.options.filter((o) => o.key === effective)[0] ?? null;

  const switcher = props.options.length > 1 ? (
    <span data-sheet-dial className="flex items-center gap-0.5 ml-1">
      {props.options.map((o) => (
        <button key={o.key} data-sheet-lens={o.key} aria-pressed={o.key === effective}
          title={o.blurb ?? o.label} onClick={() => setChosen(o.key)}
          className={`text-[10px] px-1.5 py-0.5 rounded-md border transition-colors ${
            o.key === effective ? "font-semibold text-white" : "text-slate-500 border-slate-200 hover:border-slate-300"}`}
          style={o.key === effective ? { background: T.gold, borderColor: T.gold } : undefined}>
          {o.label}
        </button>
      ))}
    </span>
  ) : null;

  return (
    <div data-second-sheet className="min-h-0 h-full flex flex-col">
      <LiveLensPanel
        lensLabel={current?.label ?? "—"}
        switcher={switcher}
        emptyReason={effective
          ? props.emptyReasons?.[effective] ?? null
          : "No lens is available to project here."}>
        {effective ? props.projections[effective] ?? null : null}
      </LiveLensPanel>
    </div>
  );
}
