"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE DESIGN STAGE (v196b) — the maker's lens, rendered.
//
// Replaces ~700 lines of stacked component forms. This is not polish: every
// later lens inherits whatever behaviour this establishes.
//
// ─── WHAT IT IS (§III.4b) ─────────────────────────────────────────────────
// ONE CONTINUOUS STRUCTURED LIST — chapters ▸ components ▸ categories ▸ items —
// in which every canonical field is visible in place. Not a form. Not a
// spreadsheet.
//
//   A form is a VIEW ONTO the design: you edit one component in a panel and
//   lose the shape of the event. That is what was here before, and it is why
//   the Studio never felt like a Stage.
//
//   A flat table DESTROYS the design: the event is not flat, and the hierarchy
//   carries the meaning.
//
//   A structured list IS the design. That is the whole claim.
//
// ─── THE FIELD RULE (§III.4b) ─────────────────────────────────────────────
// **Inline is the object's CONTENT. Details is the object's CONTEXT.**
// A field goes here if you judge it AGAINST THE WHOLE EVENT — "is Prime Rib
// priced consistently with the other proteins?" is answered by scanning a
// column. It goes to Details if you judge it AGAINST ONE OBJECT'S HISTORY —
// "is $52 right?" is unanswerable without the last three sales.
//
// So this Stage is DENSER IN ROWS AND THINNER IN COLUMNS than the forms it
// replaces. Cost, price memory, requirements, media, and every ceremony went
// to Details. A row you scan is worth more than a field you fill.
//
// ─── CONTRACT ─────────────────────────────────────────────────────────────
// No queries. Selection is shell state. Renders what it is handed.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useRef } from "react";

const T = {
  ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E", rule: "#EEF2F7",
  sel: "#F4F9FF", ghost: "#94A3B8",
} as const;

export interface StageItem {
  id: string;
  name: string;
  unitPrice: number | null;
  basis: string | null;            // per_person | flat | per_table
  priceState: string | null;       // quoted | included | free | internal
  confirmed: boolean;
  visible: boolean;                // show_on_proposal
  optional: boolean;
  categoryKey: string | null;
  choiceGroupId: string | null;
}
export interface StageCategory { key: string | null; label: string | null; layout: string; items: StageItem[] }
export interface StageComponent {
  id: string;
  title: string;
  isPackage: boolean;
  packagePrice: number | null;
  packageBasis: string | null;
  packageConfirmed: boolean;
  display: string;                 // items | description | title_only
  note: string | null;
  categories: StageCategory[];
  subtotal: number | null;
}
export interface StageChapter { id: string; name: string; components: StageComponent[]; subtotal: number | null }

export interface DesignStageProps {
  chapters: StageChapter[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusedId: string | null;
  xray: boolean;
  mayEdit: boolean;
  onPatchComponent: (id: string, patch: Record<string, unknown>) => void;
  onPatchItem: (id: string, patch: Record<string, unknown>) => void;
  onAddComponent?: (chapterId: string) => void;
  money: (n: number) => string;
}

/** Inline text. Commits on blur or Enter; Escape abandons. Never a dialog —
 *  a name is content, and content is edited where it lives. */
function Text({ value, onCommit, className, placeholder, disabled }: {
  value: string; onCommit: (v: string) => void;
  className?: string; placeholder?: string; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ref}
      defaultValue={value}
      disabled={disabled}
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => { const v = e.target.value.trim(); if (v !== value) onCommit(v); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.currentTarget.blur(); }
        if (e.key === "Escape") { e.currentTarget.value = value; e.currentTarget.blur(); }
      }}
      className={`bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-[#C9A34E] rounded px-1 -mx-1 ${className ?? ""}`}
    />
  );
}

/** Inline money. Confirming a CARRIED price is a ceremony and lives in Details;
 *  typing a NEW price is content and lives here. Typing over an amber price
 *  confirms it — you asserted it by typing it. */
function Money({ value, confirmed, onCommit, disabled }: {
  value: number | null; confirmed: boolean; onCommit: (v: number | null) => void; disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        defaultValue={value == null ? "" : String(value)}
        disabled={disabled}
        placeholder="—"
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const n = raw === "" ? null : Number(raw);
          if (raw !== "" && !Number.isFinite(n)) { e.target.value = value == null ? "" : String(value); return; }
          if (n !== value) onCommit(n);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className={`w-20 text-right tabular-nums bg-transparent outline-none rounded px-1
          focus:bg-white focus:ring-1 focus:ring-[#C9A34E] ${!confirmed && value != null ? "text-amber-600" : ""}`}
      />
      {/* Amber rides the row, not a panel: debt outranks context. */}
      {!confirmed && value != null && <span title="Carried — confirm in Details" className="text-[9px] text-amber-600">⚠</span>}
    </span>
  );
}

function ItemRow({ it, comp, p }: { it: StageItem; comp: StageComponent; p: DesignStageProps }) {
  const sel = p.selectedId === it.id;
  const ghost = !it.visible;
  const ref = useRef<HTMLDivElement>(null);

  // Selection from the OUTLINE must bring the Stage to the object — that is
  // the entire contract between the two ("the Outline is for what you cannot
  // see"). The Stage scrolls; the Outline does not chase.
  useEffect(() => { if (sel) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [sel]);

  if (ghost && !p.xray) return null;

  return (
    <div
      ref={ref}
      onClick={() => p.onSelect(it.id)}
      className={`flex items-center gap-2 pl-10 pr-3 py-[3px] text-[12.5px] cursor-pointer border-l-2 ${
        sel ? "border-l-[#C9A34E]" : "border-l-transparent hover:bg-slate-50/60"
      }`}
      style={{ background: sel ? T.sel : undefined, color: ghost ? T.ghost : T.ink }}
    >
      <span className="w-3 shrink-0 text-[8px]" style={{ color: T.gold }}>·</span>
      <Text value={it.name} disabled={!p.mayEdit} className={`flex-1 min-w-0 ${ghost ? "line-through decoration-slate-300" : ""}`}
        onCommit={(v) => p.onPatchItem(it.id, { name: v })} />

      {it.optional && <span className="text-[8.5px] font-bold uppercase" style={{ color: "#6D28D9" }}>opt</span>}
      {ghost && <span className="text-[8.5px] uppercase" style={{ color: T.ghost }}>internal</span>}

      {/* Package items carry no price — the package does. Showing an empty
          price box on 13 sushi rolls would be 13 invitations to a mistake. */}
      {!comp.isPackage && !it.choiceGroupId && (
        <>
          <Money value={it.unitPrice} confirmed={it.confirmed} disabled={!p.mayEdit}
            onCommit={(v) => p.onPatchItem(it.id, { unit_price: v, price_confirmed: true })} />
          <select
            value={it.basis ?? "flat"} disabled={!p.mayEdit}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => p.onPatchItem(it.id, { quantity_basis: e.target.value })}
            className="text-[10px] bg-transparent outline-none text-slate-400 w-[52px]"
          >
            <option value="per_person">/person</option>
            <option value="flat">flat</option>
            <option value="per_table">/table</option>
          </select>
        </>
      )}
      {it.choiceGroupId && <span className="text-[9px] text-slate-400">choice</span>}

      <button
        title={it.visible ? "Visible to customer — click to hide" : "Hidden from customer"}
        disabled={!p.mayEdit}
        onClick={(e) => { e.stopPropagation(); p.onPatchItem(it.id, { show_on_proposal: !it.visible }); }}
        className="text-[11px] w-4 shrink-0"
      >{it.visible ? "👁" : "🚫"}</button>
    </div>
  );
}

function ComponentBlock({ c, p }: { c: StageComponent; p: DesignStageProps }) {
  const sel = p.selectedId === c.id;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (sel) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [sel]);

  const dim = p.focusedId && p.focusedId !== c.id;

  return (
    <div ref={ref} style={{ opacity: dim ? 0.25 : 1 }} className="transition-opacity">
      <div
        onClick={() => p.onSelect(c.id)}
        className={`flex items-center gap-2 pl-5 pr-3 py-1 border-l-2 cursor-pointer ${
          sel ? "border-l-[#C9A34E]" : "border-l-transparent hover:bg-slate-50/60"
        }`}
        style={{ background: sel ? T.sel : undefined }}
      >
        <Text value={c.title} disabled={!p.mayEdit}
          className="flex-1 min-w-0 text-[13.5px] font-semibold text-[#1F2A37]"
          onCommit={(v) => p.onPatchComponent(c.id, { title: v })} />

        <select
          value={c.isPackage ? "package" : "itemized"} disabled={!p.mayEdit}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => p.onPatchComponent(c.id, { pricing_mode: e.target.value })}
          className="text-[10px] bg-transparent outline-none text-slate-400"
        ><option value="itemized">itemized</option><option value="package">package</option></select>

        {c.isPackage && (
          <>
            <Money value={c.packagePrice} confirmed={c.packageConfirmed} disabled={!p.mayEdit}
              onCommit={(v) => p.onPatchComponent(c.id, { package_price: v, package_price_confirmed: true })} />
            <select
              value={c.packageBasis ?? "flat"} disabled={!p.mayEdit}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => p.onPatchComponent(c.id, { package_basis: e.target.value })}
              className="text-[10px] bg-transparent outline-none text-slate-400 w-[52px]"
            ><option value="flat">flat</option><option value="per_person">/person</option></select>
          </>
        )}
        {!c.isPackage && c.subtotal != null && (
          <span className="text-[11px] tabular-nums text-slate-400 w-20 text-right">{p.money(c.subtotal)}</span>
        )}

        <select
          value={c.display} disabled={!p.mayEdit}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => p.onPatchComponent(c.id, { proposal_display: e.target.value })}
          className="text-[10px] bg-transparent outline-none text-slate-400 w-[64px]"
          title="What the customer sees"
        ><option value="items">items</option><option value="description">description</option><option value="title_only">title only</option></select>
      </div>

      {c.note && (
        <div className="pl-8 pr-3 pb-0.5">
          <Text value={c.note} disabled={!p.mayEdit} placeholder="Presentation note…"
            className="w-full text-[11.5px] italic text-slate-500"
            onCommit={(v) => p.onPatchComponent(c.id, { presentation_note: v || null })} />
        </div>
      )}

      {c.categories.map((cat) => {
        const items = cat.items.filter((i) => i.visible || p.xray);
        // v195 P1.8 in the Design lens: a category whose every item is hidden
        // still shows under X-ray (the author must see it) and vanishes without
        // (nothing to say). Same rule, same source, two renderings.
        if (!items.length) return null;
        return (
          <div key={cat.key ?? "_"}>
            {cat.label && (
              <div className="pl-8 py-0.5 flex items-center gap-2">
                <span className="text-[9.5px] font-semibold tracking-wide" style={{ color: T.gold }}>{cat.label}</span>
                <span className="text-[9px] text-slate-300">{cat.layout}</span>
              </div>
            )}
            {cat.items.map((it) => <ItemRow key={it.id} it={it} comp={c} p={p} />)}
          </div>
        );
      })}
    </div>
  );
}

export default function DesignStage(p: DesignStageProps) {
  if (!p.chapters.length) {
    // §III.4b: the blank Design is not an empty table. The empty state points
    // at the Library, because starting from blank is the rarest and worst path
    // — an "+ Add Component" primary would teach event-building one row at a
    // time, the exact habit the architecture exists to break.
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] text-slate-400 mb-3">Nothing composed yet.</p>
        <p className="text-[12px] text-slate-400">
          Press <kbd className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">Ctrl K</kbd> to
          start from a blueprint or a past event.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {p.chapters.map((ch) => (
        <div key={ch.id} className="mb-4">
          <div className="flex items-baseline gap-2 px-3 py-1.5 sticky top-0 bg-white/95 backdrop-blur border-b z-10"
               style={{ borderColor: T.rule }}>
            <h3 className="font-display font-bold text-[13px] tracking-tight" style={{ color: T.navy }}>{ch.name}</h3>
            <span className="flex-1" />
            {ch.subtotal != null && (
              <span className="text-[11px] font-semibold tabular-nums text-slate-400">{p.money(ch.subtotal)}</span>
            )}
            {p.onAddComponent && p.mayEdit && (
              <button onClick={() => p.onAddComponent?.(ch.id)}
                className="text-[10px] text-slate-400 hover:text-slate-700">+ component</button>
            )}
          </div>
          {ch.components.map((c) => <ComponentBlock key={c.id} c={c} p={p} />)}
        </div>
      ))}
    </div>
  );
}
