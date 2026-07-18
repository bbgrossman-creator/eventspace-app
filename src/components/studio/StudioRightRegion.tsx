// ═══════════════════════════════════════════════════════════════════════════
// STUDIO RIGHT REGION (v214) — the Design lens's right column, extracted from
// the page so its geography is HOSTABLE: the v213 report recorded that the
// page-level wiring was verified by parse + tsc rather than a harness, and
// this extraction is how that debt gets paid honestly — the harness now
// mounts the shipped region, not a twin.
//
// OWNERSHIP: this component owns the region's LAYOUT and the Live Lens
// CHOICE — nothing else.
//   • Inspector dock: present exactly when the page hands an inspector in
//     (i.e. exactly when a selection exists), capped at 55% so the Live Lens
//     is never evicted; the Inspector's interior belongs to Inspector.
//   • The switcher: WHICH lenses may be offered is the registry's decision —
//     the page computes visibleLenses() and intersects with its renderer
//     table (the page owns pipeline level 5, so "a renderer exists" is
//     legitimately its knowledge) and passes the result down. This file never
//     imports LENSES: it composes what it was given; it decides nothing about
//     availability. Composition, not knowledge.
//   • The choice is RENDER STATE, structurally: useState, initialized fresh
//     every mount, written nowhere — no URL, no localStorage, no column
//     (ENGINEERING_PRINCIPLES: render decisions are never persisted). The
//     regression variant proves the suite would catch a persisting copy.
//   • Projections arrive rendered (a ReactNode per lens key). This component
//     never parses a model — it shows the one whose key is chosen. If a
//     chosen lens has a null projection, the panel's empty state renders with
//     that lens's reason: EMPTY IS INFORMATION.
//
// DEFAULT: Customer when offered ("View as Proposal" — the mockup's concept:
// the maker builds while seeing what the client will receive), else the
// first offered lens. If the offer shrinks mid-session (capabilities are
// live), a choice that is no longer offered falls back the same way — a
// remembered choice grants no standing, exactly as a remembered URL doesn't.
// ═══════════════════════════════════════════════════════════════════════════
"use client";
import React, { useEffect, useState } from "react";
import LiveLensPanel from "./LiveLensPanel";

const T = { ink: "#1F2A37", gold: "#C9A34E", rule: "#E7EDF5" } as const;

/** One row of the switcher's offer — a projection of a LensDef, carried by
 *  value so this file needs no registry import. */
export interface LiveLensOption {
  key: string;
  label: string;
  blurb?: string;
}

function fallbackChoice(options: LiveLensOption[]): string | null {
  if (options.some((o) => o.key === "customer")) return "customer";
  return options[0]?.key ?? null;
}

export default function StudioRightRegion(props: {
  /** The composed Inspector, or null when nothing is selected. Presence IS
   *  the layout signal: the dock exists exactly when this does. */
  inspector: React.ReactNode | null;
  /** The switcher's offer: visibleLenses ∩ the page's renderer table. */
  options: LiveLensOption[];
  /** The rendered projection per offered lens key; null = nothing to show
   *  yet (the panel's empty state speaks for it). */
  projections: Record<string, React.ReactNode | null>;
  /** Per-lens empty-state wording. Absent keys use the panel's default. */
  emptyReasons?: Record<string, string>;
  /** The page listens so it can load the chosen projection's model. Fired on
   *  mount and on every change — one event source, so the page's mirror
   *  cannot drift from the truth here. */
  onLiveLens?: (key: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  // A choice not (or no longer) in the offer falls back — the offer is
  // authoritative; the memory of a click is not.
  const effective =
    chosen && props.options.some((o) => o.key === chosen)
      ? chosen
      : fallbackChoice(props.options);

  const { onLiveLens } = props;
  useEffect(() => {
    if (effective) onLiveLens?.(effective);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective]);

  // es5-safe lookup (the production build's target — no Array.find).
  const current = props.options.filter((o) => o.key === effective)[0] ?? null;

  // A one-lens offer needs no switcher — the label already names it. The
  // buttons appear only when there is a choice to make.
  const switcher =
    props.options.length > 1 ? (
      <span data-live-lens-switcher className="flex items-center gap-0.5 ml-1">
        {props.options.map((o) => (
          <button
            key={o.key}
            data-live-switch={o.key}
            aria-pressed={o.key === effective}
            title={o.blurb ?? o.label}
            onClick={() => setChosen(o.key)}
            className={`text-[10px] px-1.5 py-0.5 rounded-md border transition-colors ${
              o.key === effective
                ? "font-semibold text-white"
                : "text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
            style={o.key === effective ? { background: T.gold, borderColor: T.gold } : undefined}
          >
            {o.label}
          </button>
        ))}
      </span>
    ) : null;

  return (
    <div className="border-l border-[#E7EDF5] bg-white min-h-0 flex flex-col" data-right-region>
      {/* v213 — INSPECTOR FOLLOWS SELECTION: present exactly when a selection
          exists; the Live Lens holds the region otherwise and beneath. */}
      {props.inspector && (
        <div
          className="shrink-0 max-h-[55%] overflow-y-auto border-b"
          style={{ borderColor: T.rule }}
          data-inspector-dock
        >
          {props.inspector}
        </div>
      )}
      <LiveLensPanel
        lensLabel={current?.label ?? "—"}
        switcher={switcher}
        emptyReason={
          effective
            ? props.emptyReasons?.[effective] ?? null
            : "No lens is available to project here."
        }
      >
        {effective ? props.projections[effective] ?? null : null}
      </LiveLensPanel>
    </div>
  );
}
