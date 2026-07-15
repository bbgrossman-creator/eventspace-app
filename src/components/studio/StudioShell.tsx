"use client";
// ═══════════════════════════════════════════════════════════════════════════
// STUDIO SHELL (v196, slice 2) — the frame the Stage will land in.
//
//   ┌────────────────────────────────────────────────────────────┐
//   │ 🔍 Library…                                       Ctrl+K    │  global · learned tense
//   ├────────────────────────────────────────────────────────────┤
//   ├────────────────────────────────────────────────────────────┤
//   │ [ Design ] [ Customer ] [ Production ]     ⚠ 4  [ X-ray ▣ ] │  event-scoped
//   └────────────────────────────────────────────────────────────┘
//   (the Studio's existing header — title, version, contact, date — sits
//    below and is untouched. There is deliberately no second event strip
//    here: two headers would be one truth rendered twice.)
//
// THE DOCTRINE THIS ENCODES, so a later reader doesn't undo it by accident:
//
// • The Library sits ABOVE the divide because it is global and in the LEARNED
//   tense; everything below is event-scoped and INTENDED. Different scope AND
//   different tense ⇒ different physical treatment. It is browsed on demand
//   (Ctrl+K), never a resident column.
//
// • X-RAY IS A MODIFIER ON EVERY LENS, NOT A LENS. There is no "Compose" tab.
//   A salesperson authors on Customer with X-ray on; a chef authors on
//   Production with X-ray on. The maker's all-truths view is the DESIGN lens —
//   an audience whose projection happens to hide nothing. Adding a "Compose"
//   tab here would re-smuggle proposal-first thinking into the UI after three
//   documents spent dethroning it.
//
// • The lens bar is DATA. It renders visibleLenses(); it does not know the
//   names of any lenses. Adding one is a row in lenses.ts, never a tab here.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect } from "react";
import { LensDef, LensKey } from "@/lib/lenses";
import { Session } from "@/lib/permissions";

const T = {
  ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E",
  rule: "#E7EDF5", soft: "#F6F8FB",
} as const;

// ── The Library line ───────────────────────────────────────────────────────
/** Collapsed to one line until summoned. Opens on Ctrl+K (⌘K on Mac) from
 *  anywhere in the Studio — the shortcut is the affordance; the line is just
 *  the reminder that it exists. */
export function LibraryLine({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();   // browsers bind Ctrl+K to the address bar
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);

  return (
    <button
      onClick={onOpen}
      title="Search everything this business has done before"
      className="w-full flex items-center gap-2 px-4 py-2 text-left text-[13px] text-slate-400
                 bg-white border-b hover:bg-[#FAFBFD] transition-colors"
      style={{ borderColor: T.rule }}
    >
      <span aria-hidden>🔍</span>
      <span className="flex-1">Search Library…</span>
      <kbd className="text-[10px] font-sans px-1.5 py-0.5 rounded border border-slate-200 text-slate-400">
        Ctrl K
      </kbd>
    </button>
  );
}

// ── The lens bar ───────────────────────────────────────────────────────────
export interface LensBarProps {
  lenses: LensDef[];           // ← from visibleLenses(). This component NEVER decides.
  active: LensKey | null;
  onSelect: (key: LensKey) => void;
  xray: boolean;
  onXray: (on: boolean) => void;
  session: Session | null;
  /** Unconfirmed + unpriced. Rides the LENS BAR, not a panel, because debt
   *  outranks context (Details constitution): someone authoring on a
   *  price-hidden lens must still see that pricing is unresolved. It was
   *  previously only visible inside the totals panel — i.e. only to someone
   *  already looking at money. */
  debtCount?: number;
}

export function LensBar({ lenses, active, onSelect, xray, onXray, session, debtCount = 0 }: LensBarProps) {
  // X-ray reveals the scaffolding an author needs (hidden items, amber prices,
  // drop zones). Someone who cannot edit has no use for it — and showing it
  // would leak internal truth to a read-only viewer. Perms, never role.
  const mayAuthor = !!session?.perms.includes("bookings.edit");

  if (lenses.length === 0) {
    // A correct rendering of "you may not look at this event" — not an error.
    return (
      <div className="px-4 py-2 text-[12px] text-slate-400 border-b" style={{ borderColor: T.rule }}>
        No views available for your permissions.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b" style={{ borderColor: T.rule, background: T.soft }}>
      {lenses.map((l) => {
        const on = l.key === active;
        return (
          <button
            key={l.key}
            onClick={() => onSelect(l.key)}
            title={l.blurb}
            aria-pressed={on}
            className={`text-[12px] px-2.5 py-1 rounded-md transition-colors ${
              on ? "font-semibold bg-white shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
            style={on ? { color: T.navy } : undefined}
          >
            {l.label}
          </button>
        );
      })}
      <div className="flex-1" />
      {debtCount > 0 && (
        <span
          title={`${debtCount} price${debtCount === 1 ? "" : "s"} unconfirmed or missing`}
          className="text-[11px] font-semibold text-amber-600 border border-amber-300 rounded px-1.5 py-0.5 mr-1"
        >
          ⚠ {debtCount}
        </span>
      )}
      {mayAuthor && (
        <button
          onClick={() => onXray(!xray)}
          aria-pressed={xray}
          title="Show the truth the customer never sees: hidden items, unconfirmed prices, drop zones"
          className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
            xray ? "font-semibold text-white" : "text-slate-500 border-slate-200 hover:border-slate-300"
          }`}
          style={xray ? { background: T.gold, borderColor: T.gold } : undefined}
        >
          X-ray {xray ? "▣" : "▢"}
        </button>
      )}
    </div>
  );
}

// ── The composed shell ─────────────────────────────────────────────────────
export interface StudioShellProps extends Omit<LensBarProps, "session"> {
  session: Session | null;
  onOpenLibrary: () => void;
}

/** Header only. The Stage, Structure rail and Inspector land beneath it in
 *  later slices — this ships as a frame around the Studio that exists today,
 *  which is the migration path the design doc committed to: the two ends
 *  converge release by release, never in one rewrite. */
export default function StudioShell(p: StudioShellProps) {
  return (
    <>
      <LibraryLine onOpen={p.onOpenLibrary} />
      <LensBar
        lenses={p.lenses} active={p.active} onSelect={p.onSelect}
        xray={p.xray} onXray={p.onXray} session={p.session} debtCount={p.debtCount}
      />
    </>
  );
}
