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
import { useState } from "react";
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
  lens: LensKey | null;
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
}

function Section({ title, count, children, defaultOpen = false }: {
  title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t" style={{ borderColor: T.rule }}>
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

      {/* ── Price + its evidence. The whole reason this panel exists. ── */}
      {price && (
        <div className="px-3 py-3">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-500">Price</span>
            {carried && <span className="text-[10px] font-semibold text-amber-600">⚠ Carried</span>}
          </div>

          {price.state === "included" || price.state === "free" ? (
            <p className="text-[15px] font-semibold text-slate-400 italic">
              {price.state === "included" ? "Included" : "Complimentary"}
            </p>
          ) : (
            <p className="text-[20px] font-bold tabular-nums" style={{ color: carried ? "#B45309" : T.navy }}>
              {price.amount == null ? "—" : p.money(price.amount)}
              {price.basis === "per_person" && <span className="text-[12px] font-normal text-slate-400"> / person</span>}
            </p>
          )}

          {/* MEMORY — the evidence. This is the answer to "is $52 right?", and
              the reason that question cannot be answered on the Stage. */}
          {price.amount != null && price.state === "quoted" && (
            <div className="mt-2 rounded-lg p-2" style={{ background: "#FBFAF6", boxShadow: "inset 0 0 0 1px #EAD9B0" }}>
              <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#8A6D1D" }}>
                Price history
              </div>
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
                    <div className="flex justify-between text-[11.5px] mt-1 pt-1 border-t" style={{ borderColor: "#EAD9B0" }}>
                      <span className="text-slate-500">Catalog (SRP)</span>
                      <span className="tabular-nums text-slate-600">{p.money(s.memory.srp)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* The CEREMONY. A confirmation is a decision made with evidence in
              front of you — which is why it is here and not a Stage keystroke. */}
          {carried && p.canEdit && price.amount != null && (
            <button
              onClick={() => p.onConfirmPrice?.(s.id, price.amount as number)}
              className="mt-2 w-full py-2 rounded-lg text-[12.5px] font-semibold text-white"
              style={{ background: T.navy }}
            >
              Confirm {p.money(price.amount)}
            </button>
          )}
        </div>
      )}

      {/* ── Cost: role-gated. Never on the Stage — a salesperson screen-shares
             the Stage. `canSeeCost` comes from perms, never from role. ── */}
      {p.canSeeCost && s.cost != null && (
        <Section title="Cost" defaultOpen={false}>
          <div className="flex justify-between text-[12px]">
            <span className="text-slate-500">Unit cost</span>
            <span className="tabular-nums" style={{ color: T.ink }}>{p.money(s.cost)}</span>
          </div>
          {price?.amount != null && price.amount > 0 && (
            <div className="flex justify-between text-[12px] mt-1">
              <span className="text-slate-500">Margin</span>
              <span className="tabular-nums" style={{ color: T.ink }}>
                {Math.round(((price.amount - s.cost) / price.amount) * 100)}%
              </span>
            </div>
          )}
        </Section>
      )}

      {/* ── Projections: collapsed and lazy. Nothing is fetched until opened —
             they are recomputed, not stored, so eager loading buys nothing. ── */}
      {s.counts && (
        <>
          <Section title="Requirements" count={s.counts.requirements}>
            <p className="text-[11.5px] text-slate-400">
              {s.counts.requirements === 0 ? "None recorded." : "Opens with the Production lens (v197)."}
            </p>
          </Section>
          <Section title="Media" count={s.counts.media}>
            <p className="text-[11.5px] text-slate-400">
              {s.counts.media === 0 ? "No photos yet." : "Gallery opens from the Library."}
            </p>
          </Section>
          {s.counts.usedIn != null && (
            <Section title="Used in" count={s.counts.usedIn}>
              <p className="text-[11.5px] text-slate-400">
                {/* Past tense, a count, no adjective — frequency is a fact,
                    never a recommendation. */}
                Appeared in {s.counts.usedIn} event{s.counts.usedIn === 1 ? "" : "s"}.
              </p>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
