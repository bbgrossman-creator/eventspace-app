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
import { useEffect, useRef, useState } from "react";
import {
  MIME, NodePayload, DropTarget, operationFor, cursorLabel, readNode, setDragLabel,
  catKey, simplifyFor, isLegalTarget, HOVER_EXPAND_MS, DRAG_THRESHOLD_PX,
} from "@/lib/dragGrammar";

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
  /** Rearrange / Move. The Stage reports WHAT landed WHERE; the page decides
   *  how to persist it. A renderer that wrote to the database would be a
   *  renderer with a second opinion about the truth. */
  onDrop?: (payload: NodePayload, target: DropTarget) => void;
  /** Reports what is in flight so the page can restore state after. */
  onDragLive?: (p: NodePayload | null) => void;
}

/** While a drag is live, the Canvas shows only what the drop needs. Held here
 *  so every row can ask "am I relevant right now?" without prop-drilling. */
interface DragCtx {
  live: NodePayload | null;
  /** The chapter/category temporarily opened by dwelling on it. Restores on
   *  leave — hovering to LOOK must not become hovering to CHANGE. */
  peek: string | null;
  setPeek: (k: string | null) => void;
  setLive?: (p: NodePayload | null) => void;
  /** Flashes after a drop so the eye finds where the object landed. */
  landed: string | null;
}

/** Dwell-to-expand. Cancels on leave; never fires while merely crossing. */
function useHoverExpand(ctx: DragCtx, key: string, legal: boolean) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => {
    if (!ctx.live || !legal || ctx.peek === key) return;
    t.current = setTimeout(() => ctx.setPeek(key), HOVER_EXPAND_MS);
  };
  const leave = () => { if (t.current) { clearTimeout(t.current); t.current = null; } };
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return { enter, leave };
}

/** The transient insertion line. It exists only during a drag — a persistent
 *  "+ here" between every row would be 258 invitations on the benchmark, which
 *  is the clutter "denser in rows, thinner in columns" exists to prevent. */
function Insert({ on }: { on: boolean }) {
  if (!on) return null;
  return <div className="h-0 border-t-2 -mt-[1px] relative z-10" style={{ borderColor: T.gold }} />;
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

function ItemRow({ it, comp, p, hint, setHint }: {
  it: StageItem; comp: StageComponent; p: DesignStageProps;
  hint: string | null; setHint: (v: string | null) => void;
}) {
  const sel = p.selectedId === it.id;
  const ghost = !it.visible;
  const ref = useRef<HTMLDivElement>(null);

  // Selection from the OUTLINE must bring the Stage to the object — that is
  // the entire contract between the two ("the Outline is for what you cannot
  // see"). The Stage scrolls; the Outline does not chase.
  useEffect(() => { if (sel) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [sel]);

  if (ghost && !p.xray) return null;

  // An item is ordered inside its CATEGORY, and owned by its component.
  const me: NodePayload = {
    kind: "item", id: it.id, parentId: catKey(comp.id, it.categoryKey),
    ownerId: comp.id, label: it.name,
  };

  return (
    <>
    <Insert on={hint === it.id} />
    <div
      ref={ref}
      onClick={() => p.onSelect(it.id)}
      draggable={p.mayEdit}
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME.node, JSON.stringify(me));
        e.dataTransfer.effectAllowed = "move";
        setDragLabel(e, cursorLabel("rearrange", it.name));
        p.onDragLive?.(me);
      }}
      onDragEnd={() => p.onDragLive?.(null)}
      onDragOver={(e) => {
        const src = readNode(e.dataTransfer);
        if (!src || src.id === it.id) return;
        const op = operationFor(src, { parentId: catKey(comp.id, it.categoryKey), beforeId: it.id, ownerId: comp.id });
        // An invalid drop is REFUSED VISIBLY: no line, no drop effect. The
        // cursor already said so at dragstart; the target agrees by silence.
        if (op === "invalid") { e.dataTransfer.dropEffect = "none"; return; }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setHint(it.id);
      }}
      onDragLeave={() => setHint(null)}
      onDrop={(e) => {
        const src = readNode(e.dataTransfer);
        setHint(null);
        if (!src) return;
        const t = { parentId: catKey(comp.id, it.categoryKey), beforeId: it.id, ownerId: comp.id };
        if (operationFor(src, t) === "invalid") return;
        e.preventDefault(); e.stopPropagation();
        p.onDrop?.(src, t);
      }}
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
    </>
  );
}

function ComponentBlock({ c, p, chapterId, hint, setHint, ctx }: {
  c: StageComponent; p: DesignStageProps; chapterId: string;
  hint: string | null; setHint: (v: string | null) => void; ctx: DragCtx;
}) {
  const [itemHint, setItemHint] = useState<string | null>(null);
  const sel = p.selectedId === c.id;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (sel) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [sel]);

  const dim = p.focusedId && p.focusedId !== c.id;

  const me: NodePayload = { kind: "component", id: c.id, parentId: chapterId, label: c.title };

  return (
    <div ref={ref} style={{ opacity: dim ? 0.25 : 1 }} className="transition-opacity">
      <Insert on={hint === c.id} />
      <div
        onClick={() => p.onSelect(c.id)}
        draggable={p.mayEdit}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData(MIME.node, JSON.stringify(me));
          e.dataTransfer.effectAllowed = "move";
          // The label cannot know the destination yet — the cursor says the
          // verb, the insertion line says the place.
          setDragLabel(e, cursorLabel("rearrange", c.title));
          p.onDragLive?.(me); ctx.setLive?.(me);
        }}
        onDragEnd={() => { p.onDragLive?.(null); ctx.setLive?.(null); }}
        onDragOver={(e) => {
          const src = readNode(e.dataTransfer);
          if (!src || src.id === c.id || src.kind !== "component") return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setHint(c.id);
        }}
        onDragLeave={() => setHint(null)}
        onDrop={(e) => {
          const src = readNode(e.dataTransfer);
          setHint(null);
          if (!src || src.kind !== "component" || src.id === c.id) return;
          e.preventDefault(); e.stopPropagation();
          p.onDrop?.(src, { parentId: chapterId, beforeId: c.id });
        }}
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

      {/* While a COMPONENT is in flight the Canvas becomes a destination map:
          items vanish because they are not part of the decision. While an ITEM
          is in flight, only its own component and a dwelt-upon one stay open.
          Presentation only — the grammar is untouched. */}
      {(simplifyFor(ctx.live) === "chapters"
        || (simplifyFor(ctx.live) === "categories" && ctx.live?.ownerId !== c.id && ctx.peek !== c.id))
        ? null
        : c.categories.map((cat) => {
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
            {cat.items.map((it) => <ItemRow key={it.id} it={it} comp={c} p={p} hint={itemHint} setHint={setItemHint} />)}
          </div>
        );
      })}
    </div>
  );
}

export default function DesignStage(p: DesignStageProps) {
  const [hint, setHint] = useState<string | null>(null);
  const [live, setLive] = useState<NodePayload | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);

  // A drag must NEVER permanently rearrange the workspace. `live` and `peek`
  // are the only state the simplification touches, and both are cleared when
  // the gesture ends — dropped or abandoned. The expansion the user had before
  // is untouched because it was never changed: the collapse is a RENDER
  // decision, not a stored one. That is why "restore previous state" needs no
  // code — there is nothing to restore.
  const ctx: DragCtx = { live, peek, setPeek, setLive, landed };
  const endDrag = (droppedIn: string | null) => {
    setLive(null); setPeek(null); setHint(null);
    if (droppedIn) { setLanded(droppedIn); setTimeout(() => setLanded(null), 700); }
  };
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
        <div key={ch.id} className="mb-4"
          // Dropping into a chapter's empty space appends. This is what makes
          // MOVE reachable: to put Sushi at the END of Late Night you must be
          // able to drop somewhere that is not another component.
          onDragOver={(e) => {
            const src = readNode(e.dataTransfer);
            if (!src || src.kind !== "component") return;
            e.preventDefault(); e.dataTransfer.dropEffect = "move";
            setHint(`end:${ch.id}`);
          }}
          onDrop={(e) => {
            const src = readNode(e.dataTransfer);
            setHint(null);
            if (!src || src.kind !== "component") return;
            e.preventDefault();
            p.onDrop?.(src, { parentId: ch.id, beforeId: null });
          }}
        >
          <div className={`flex items-baseline gap-2 px-3 py-1.5 sticky top-0 backdrop-blur border-b z-10 transition-all ${
                 landed === ch.id ? "ring-2 ring-[#C9A34E]" : ""}`}
               style={{
                 borderColor: T.rule,
                 // Legal targets light; illegal ones grey. Your eye should know
                 // where the object may go without trying to put it there.
                 background: live
                   ? (isLegalTarget(live, { parentId: ch.id }) ? "#FFFBEF" : "rgba(255,255,255,.95)")
                   : "rgba(255,255,255,.95)",
                 opacity: live && !isLegalTarget(live, { parentId: ch.id }) ? 0.4 : 1,
               }}>
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
          {ch.components.map((c) => (
            <ComponentBlock key={c.id} c={c} p={p} chapterId={ch.id} hint={hint} setHint={setHint} ctx={ctx} />
          ))}
          <Insert on={hint === `end:${ch.id}`} />
        </div>
      ))}
    </div>
  );
}
