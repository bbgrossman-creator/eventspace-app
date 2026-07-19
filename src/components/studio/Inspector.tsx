"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE INSPECTOR (v196b)
//
// Replaces the Live Quote panel, which showed THE VERSION'S MONEY where the
// SELECTION'S TRUTH belongs. That was the field rule enforced from one side
// only: the Stage withheld context correctly, and nothing showed it.
//
// ─── THE CONSTITUTION (§III.4b, Details) ──────────────────────────────────
//
//   **Inline is the object's CONTENT. Details is the object's CONTEXT.**
//
//   Canonical properties inline · projections collapsed · ceremonies in dialogs
//
// The test is a real question. *"Is $52 right?"* is unanswerable looking at
// Prime Rib alone — you need the last three sales and the catalog SRP. That is
// this panel. *"Is Prime Rib priced consistently with the other proteins?"* is
// answered by scanning a column, which is the Stage's.
//
// ─── WHAT LIVES HERE, AND WHY EACH ────────────────────────────────────────
//   • price MEMORY      — the evidence a confirmation needs
//   • the CONFIRM ceremony — a decision, not a keystroke
//   • cost / margin     — internal truth that must never sit on a Stage a
//                         salesperson might screen-share
//   • requirements, media, lineage — PROJECTIONS: collapsed and lazy, fetched
//                         when opened, never before
//
// ─── f(object, lens, role) ────────────────────────────────────────────────
// Not decoration. `role` decides whether cost appears at all; `lens` decides
// which facets are foregrounded. The Production lens will hand the same
// component and get requirements first and price never.
//
// CONTRACT: no queries. The page hands it a selection; it renders.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useState } from "react";
import { LensKey } from "@/lib/lenses";

const T = { ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E", rule: "#EEF2F7" } as const;

export interface PriceMemoryEntry { amount: number; when: string; label?: string }

export interface InspectorSelection {
  kind: "component" | "item" | "design";
  id: string;
  title: string;
  subtitle?: string | null;
  /** Present only when the row carries a sell price. */
  price?: { amount: number | null; basis: string | null; confirmed: boolean; state: string | null } | null;
  /** The evidence a confirmation rests on. Absent = not loaded yet. */
  memory?: { sales: PriceMemoryEntry[]; srp: number | null } | null;
  /** Internal. Gated on role — see canSeeCost. */
  cost?: number | null;
  visible?: boolean;
  internalReason?: string | null;
  counts?: { requirements: number; media: number; usedIn?: number };
}

export interface InspectorProps {
  selection: InspectorSelection | null;
  /** Legacy — the Inspector no longer consults the lens itself (v238). */
  lens?: LensKey | null;
  /** v238 — facet order, passed by the host FROM the lens declaration. */
  facetOrder?: string[];
  /** From session.perms — NEVER session.role (condition 1). */
  canEdit: boolean;
  canSeeCost: boolean;
  money: (n: number) => string;
  onConfirmPrice?: (id: string, amount: number) => void;
  onLoadMemory?: (id: string) => void;
  /** The Design itself, shown when nothing is selected — because the Design is
   *  an object too, and its context (guests, adjustments) has to live
   *  somewhere that isn't the menu. */
  designPanel?: React.ReactNode;
  /** v219 THE ADVERTISING RULE: every object advertises how it can be
   *  removed, in its context surface. The HOST owns the ceremony (confirm,
   *  cascade honesty); this surface advertises and reports. Absent or
   *  read-only = no affordance. */
  onRemove?: () => void;
  removeLabel?: string;
  /** SPEC-002: the Configure facet, mounted by the page ONLY for component
   *  selections. The Inspector renders it; it never owns it. */
  configureFacet?: React.ReactNode;
}

function Section({ title, count, children, defaultOpen = false }: {
  title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t" data-inspector-section={title} style={{ borderColor: T.rule }}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold hover:bg-slate-50">
        <span className="text-[9px] text-slate-400">{open ? "▾" : "▸"}</span>
        <span style={{ color: T.ink }}>{title}</span>
        {count != null && <span className="text-[10px] text-slate-400">{count}</span>}
      </button>
      {/* Projections are LAZY: recomputed, so fetched when opened, never before. */}
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

/** v238 — the facet keys a lens may order. The Inspector renders facets
 *  in the order DECLARED by the active lens (LensDef.inspects) — it never
 *  consults lens names itself. Unknown keys are ignored; undeclared
 *  facets simply don't render, which is itself information. */
export const INSPECTOR_FACETS = ["configure", "commercial", "media", "usedin"] as const;
export type InspectorFacet = (typeof INSPECTOR_FACETS)[number];


// ─── v238 THE FACETS — each a pure renderer; ORDER is the lens's, never ours ───
const Line = ({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) => (
  <div className="mb-3">
    <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">{label}</div>
    <div className={`text-[12.5px] leading-relaxed ${strong ? "font-semibold" : ""}`} style={{ color: T.ink }}>{value}</div>
  </div>
);

const FACETS: Record<InspectorFacet, (p: InspectorProps, s: NonNullable<InspectorProps["selection"]>, carried: boolean) => React.ReactNode> = {
  configure: (p, s) => (s.kind === "component" ? p.configureFacet : null),

  // COMMERCIAL — price, its evidence, its ceremony, cost, requirements:
  // one intentional group, so price stops reading as a second application.
  commercial: (p, s, carried) => {
    const price = s.price;
    if (!price && s.cost == null && !s.counts) return null;
    return (
      <Section title="Commercial" defaultOpen>
        {price && (
          <div data-facet="commercial" className="mb-1">
            {price.state === "included" || price.state === "free" ? (
              <Line label="Price" value={<span className="italic text-slate-400">{price.state === "included" ? "Included" : "Complimentary"}</span>} />
            ) : (
              <Line label={carried ? "Price · carried ⚠" : "Price"} strong
                value={<span className="tabular-nums text-[15px]" style={{ color: carried ? "#B45309" : T.navy }}>
                  {price.amount == null ? "Not priced yet" : p.money(price.amount)}
                  {price.basis === "per_person" && <span className="text-[11px] font-normal text-slate-400"> / person</span>}
                </span>} />
            )}
            {price.amount != null && price.state === "quoted" && (
              <Section title="Price history" count={s.memory?.sales.length}>
                {s.memory === undefined && (
                  <button onClick={() => p.onLoadMemory?.(s.id)}
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline">Load history</button>
                )}
                {s.memory === null && <p className="text-[11px] text-slate-400">No prior sales of this item.</p>}
                {s.memory && (
                  <>
                    {s.memory.sales.length === 0 && <p className="text-[11px] text-slate-400">First time quoted.</p>}
                    {s.memory.sales.map((m, i) => (
                      <div key={i} className="flex justify-between text-[11.5px] text-slate-600">
                        <span className="tabular-nums">{p.money(m.amount)}</span>
                        <span className="text-slate-400">{m.when}</span>
                      </div>
                    ))}
                    {s.memory.srp != null && (
                      <div className="flex justify-between text-[11.5px] mt-1 pt-1 border-t" style={{ borderColor: T.rule }}>
                        <span className="text-slate-500">Catalog (SRP)</span>
                        <span className="tabular-nums text-slate-600">{p.money(s.memory.srp)}</span>
                      </div>
                    )}
                  </>
                )}
              </Section>
            )}
            {carried && p.canEdit && price.amount != null && (
              <button onClick={() => p.onConfirmPrice?.(s.id, price.amount as number)}
                className="mt-2 w-full py-2 rounded-lg text-[12.5px] font-semibold text-white"
                style={{ background: T.navy }}>
                Confirm {p.money(price.amount)}
              </button>
            )}
          </div>
        )}
        {p.canSeeCost && s.cost != null && (
          <div className="mt-1">
            <Line label="Unit cost" value={<span className="tabular-nums">{p.money(s.cost)}</span>} />
            {price?.amount != null && price.amount > 0 && (
              <Line label="Margin" value={<span className="tabular-nums">{Math.round(((price.amount - s.cost) / price.amount) * 100)}%</span>} />
            )}
          </div>
        )}
        {s.counts && (
          <Line label={`Requirements${s.counts.requirements ? ` · ${s.counts.requirements}` : ""}`}
            value={<span className="text-slate-400">{s.counts.requirements === 0 ? "None recorded." : "Opens with the Production lens."}</span>} />
        )}
      </Section>
    );
  },

  media: (p, s) => (s.counts ? (
    <Section title="Media" count={s.counts.media}>
      <p className="text-[11.5px] text-slate-400">
        {s.counts.media === 0 ? "No photos yet." : "Gallery opens from the Library."}
      </p>
    </Section>
  ) : null),

  usedin: (p, s) => (s.counts?.usedIn != null ? (
    <Section title="Used in" count={s.counts.usedIn}>
      <p className="text-[11.5px] text-slate-400">
        Appeared in {s.counts.usedIn} event{s.counts.usedIn === 1 ? "" : "s"}.
      </p>
    </Section>
  ) : null),
};

export default function Inspector(p: InspectorProps) {
  const s = p.selection;

  if (!s) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b"
             style={{ borderColor: T.rule }}>
          Details · Event Design
        </div>
        {p.designPanel ?? (
          <p className="px-3 py-8 text-[12px] text-center text-slate-400">
            Select something to inspect it.
          </p>
        )}
      </div>
    );
  }

  const price = s.price;
  const carried = !!price && price.amount != null && !price.confirmed;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 py-2 border-b" style={{ borderColor: T.rule }}>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Details</div>
        <h3 className="text-[14px] font-semibold leading-tight" style={{ color: T.ink }}>{s.title}</h3>
        {s.subtitle && <p className="text-[11.5px] text-slate-500 mt-0.5">{s.subtitle}</p>}
        {s.visible === false && (
          <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
            {s.internalReason ?? "Hidden from customer"}
          </p>
        )}
      </div>

      {(p.facetOrder ?? ["configure", "commercial", "media", "usedin"]).map((key) => {
        const facet = FACETS[key as InspectorFacet];
        return facet ? <React.Fragment key={key}>{facet(p, s, carried)}</React.Fragment> : null;
      })}

      {p.onRemove && p.canEdit && (
        <div className="px-3 pt-4 pb-5 mt-8 border-t" style={{ borderColor: T.rule }}>
          <button data-inspector-remove onClick={p.onRemove}
            className="text-[11.5px] font-semibold text-[#B91C1C] hover:underline">
            {p.removeLabel ?? "Remove from this design…"}
          </button>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Removes it from this version only — the Library keeps its identity.
          </p>
        </div>
      )}
    </div>
  );
}
