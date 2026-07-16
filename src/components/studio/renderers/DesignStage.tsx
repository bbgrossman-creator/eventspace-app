"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE DESIGN STAGE (v196b) — the maker's lens, rendered.
//
// REWRITTEN after a regression: five successive splices left the file with
// duplicated interface blocks (TypeScript MERGES duplicate interfaces, so tsc
// reported 0 errors while the drag session had no way to start) and a drag
// lifecycle that depended on a prop the page never passed. Four features
// "broke" at once because they were one pipeline that was never connected.
//
// The lesson is in the design now: **the Stage OWNS its drag session.** It
// does not report flight upward and hope someone sets state. `live` is local;
// onDragStart sets it directly. There is no wire to forget.
//
// ─── WHAT IT IS (§III.4b) ─────────────────────────────────────────────────
// ONE CONTINUOUS STRUCTURED LIST — chapters ▸ components ▸ categories ▸ items,
// every canonical field in place. A form is a VIEW ONTO the design; a flat
// table DESTROYS it; a structured list IS it.
//
// ─── THE FIELD RULE ───────────────────────────────────────────────────────
// Inline is the object's CONTENT. The Inspector is its CONTEXT. Denser in
// rows, thinner in columns.
//
// ─── DRAG: BY HANDLE, NOT BY ROW ──────────────────────────────────────────
// A row cannot be draggable when an <input> fills it. Browsers give inputs
// their own mousedown for text selection and REFUSE to start the ancestor's
// drag — so `draggable="true"` rendered on 142 rows and not one of them could
// be picked up. The attribute was present; the gesture was impossible.
//
// (A jsdom test cannot catch this: dispatching `dragstart` on the div works
// there, because jsdom never asks whether a browser WOULD have started one.
// The harness passed while the product was unusable.)
//
// So the HANDLE is the drag source. It is a real target — not a 9px hint — and
// it appears on components AND items, because an item whose name field spans
// the row previously had nowhere to grab at all.
//
// Simplification: while something is in flight the Canvas shows only the level
// the DECISION needs. Wake is INSTANT (feedback); Open is a DWELL (structural).
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import {
  MIME, NodePayload, DropTarget, operationFor, cursorLabel, readNode, setDragLabel,
  catKey, simplifyFor, isLegalTarget, HOVER_EXPAND_MS,
} from "@/lib/dragGrammar";

const T = {
  ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E", rule: "#EEF2F7",
  sel: "#F4F9FF", ghost: "#94A3B8",
} as const;

// ── Model ──────────────────────────────────────────────────────────────────
export interface StageItem {
  id: string; name: string;
  unitPrice: number | null; basis: string | null;
  priceState: string | null; confirmed: boolean;
  visible: boolean; optional: boolean;
  categoryKey: string | null; choiceGroupId: string | null;
}
export interface StageCategory { key: string | null; label: string | null; layout: string; items: StageItem[] }
export interface StageComponent {
  id: string; title: string;
  isPackage: boolean; packagePrice: number | null; packageBasis: string | null; packageConfirmed: boolean;
  display: string; note: string | null;
  categories: StageCategory[]; subtotal: number | null;
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
  onDrop?: (payload: NodePayload, target: DropTarget) => void;
}

/** The live drag session. Owned by the Stage — nothing to wire, nothing to
 *  forget. Every row reads it to ask "am I relevant right now?" */
interface Drag {
  live: NodePayload | null;
  start: (p: NodePayload) => void;
  end: (landedIn?: string | null) => void;
  /** Instant: a destination lights up on contact. Feedback, not commitment. */
  awake: string | null;
  wake: (k: string | null) => void;
  /** Dwell: a collapsed category expands. Structural, so it needs intent. */
  open: string | null;
  setOpen: (k: string | null) => void;
  landed: string | null;
}

/** THE DRAG HANDLE — the drag source, and the only one.
 *
 *  `draggable` lives HERE, never on the row: a row full of inputs cannot start
 *  a drag no matter what the attribute says. The handle is also the honest
 *  affordance — it marks exactly the pixels that work. */
function Grip({ payload, label, drag, disabled }: {
  payload: NodePayload; label: string; drag: Drag; disabled?: boolean;
}) {
  // Locked / read-only: no handle renders — only an inert spacer so rows
  // don't shift when permission changes. Nothing advertises dragging.
  if (disabled) return <span className="w-6 shrink-0" aria-hidden />;
  return (
    <span
      draggable
      data-grip={payload.kind}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData(MIME.node, JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "move";
        setDragLabel(e, cursorLabel("rearrange", label));
        // ── THE LINE THAT KILLED EVERY DRAG ─────────────────────────────
        // drag.start(payload) here is a React setState. Called synchronously
        // it re-renders DURING the dragstart dispatch; the focus-mode
        // collapse mutates the DOM around the drag source and Chromium
        // CANCELS the drag it was starting — dragstart fired, dragend
        // followed instantly, nothing ever moved. Proven in real Chromium:
        // synchronous → "dragstart → dragend"; deferred → the full
        // "dragstart → drag → dragenter → dragover → drop" lifecycle.
        // The session must begin AFTER the browser has finished starting
        // the drag. One tick is enough.
        const start = payload;
        window.setTimeout(() => drag.start(start), 0);
      }}
      onDragEnd={() => drag.end()}
      onClick={(e) => e.stopPropagation()}
      title="Drag to move"
      // ── The affordance: quiet until wanted, honest when shown ─────────
      // Icon is small; the POINTER TARGET is the full 24px-wide column and
      // the row's height. Revealed on row hover, keyboard focus within the
      // row, or selection (the row adds `group` + data-sel) — never a field
      // of grips at rest.
      className="grip w-6 shrink-0 self-stretch flex items-center justify-center
                 cursor-grab active:cursor-grabbing select-none
                 text-slate-300 hover:text-slate-500 text-[11px] leading-none
                 opacity-0 transition-opacity duration-100
                 group-hover:opacity-100 group-focus-within:opacity-100"
    >⠿</span>
  );
}

// ── Landing band: the hero of a drag ──────────────────────────────────────
function DropBand({ drag, target, onDrop, label, tall }: {
  drag: Drag; target: DropTarget;
  onDrop?: (p: NodePayload, t: DropTarget) => void;
  label: string; tall?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (!drag.live) return null;
  if (operationFor(drag.live, target) === "invalid") return null;   // refused: not shown

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setArmed(true); }}
      onDragLeave={() => setArmed(false)}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation(); setArmed(false);
        const p = readNode(e.dataTransfer);
        if (p) { onDrop?.(p, target); drag.end(String(target.parentId)); }
      }}
      // Arming must change COLOR, never SIZE. The armed band used to grow
      // ~12px, which shifted every row below it while a drag was in flight —
      // measured in real Chromium as the reason a near-stationary pointer
      // could slide off its destination (and once opened the wrong category).
      // A drop target that moves when you approach it is a moving target.
      className={`mx-3 rounded-md flex items-center justify-center transition-colors duration-100 ${
        tall ? "my-1.5 py-2.5" : "my-1 py-1.5"
      }`}
      style={{
        border: `${armed ? 2 : 1.5}px dashed ${armed ? T.gold : "#CBD5E1"}`,
        background: armed ? "#FFF8E6" : "transparent",
      }}
    >
      <span className={`text-[10.5px] font-semibold tracking-wide ${armed ? "opacity-100" : "opacity-45"}`}
            style={{ color: armed ? "#8A6D1D" : "#94A3B8" }}>
        {armed ? `↳ ${label}` : label}
      </span>
    </div>
  );
}

// ── Inline editors ─────────────────────────────────────────────────────────
function Text({ value, onCommit, className, placeholder, disabled }: {
  value: string; onCommit: (v: string) => void;
  className?: string; placeholder?: string; disabled?: boolean;
}) {
  return (
    <input
      defaultValue={value} disabled={disabled} placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      // A draggable ancestor would otherwise swallow text selection.
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={(e) => { const v = e.target.value.trim(); if (v !== value) onCommit(v); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { e.currentTarget.value = value; e.currentTarget.blur(); }
      }}
      className={`bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-[#C9A34E] rounded px-1 -mx-1 ${className ?? ""}`}
    />
  );
}

function Money({ value, confirmed, onCommit, disabled }: {
  value: number | null; confirmed: boolean; onCommit: (v: number | null) => void; disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        defaultValue={value == null ? "" : String(value)} disabled={disabled} placeholder="—"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
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
      {!confirmed && value != null && <span title="Carried — confirm in Details" className="text-[9px] text-amber-600">⚠</span>}
    </span>
  );
}

// ── Item row ───────────────────────────────────────────────────────────────
function ItemRow({ it, comp, p, drag }: {
  it: StageItem; comp: StageComponent; p: DesignStageProps; drag: Drag;
}) {
  const sel = p.selectedId === it.id;
  const ghost = !it.visible;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (sel) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [sel]);
  if (ghost && !p.xray) return null;

  const me: NodePayload = {
    kind: "item", id: it.id, parentId: catKey(comp.id, it.categoryKey),
    ownerId: comp.id, label: it.name,
  };

  return (
    <div
      ref={ref}
      onClick={() => p.onSelect(it.id)}
      className={`group flex items-center gap-2 pl-4 pr-3 py-[3px] text-[12.5px] cursor-pointer border-l-2 ${
        sel ? "border-l-[#C9A34E] [&_.grip]:opacity-100" : "border-l-transparent hover:bg-slate-50/60"
      } ${drag.live?.id === it.id ? "opacity-35" : ""}`}
      style={{ background: sel ? T.sel : undefined, color: ghost ? T.ghost : T.ink }}
    >
      {/* The handle. Previously an item had NO grip and its name input spanned
          the row — there was nowhere to grab it at all. */}
      <Grip payload={me} label={it.name} drag={drag} disabled={!p.mayEdit} />
      <span className="w-2 shrink-0 text-[8px]" style={{ color: T.gold }}>·</span>
      <Text value={it.name} disabled={!p.mayEdit}
        className={`flex-1 min-w-0 ${ghost ? "line-through decoration-slate-300" : ""}`}
        onCommit={(v) => p.onPatchItem(it.id, { name: v })} />
      {it.optional && <span className="text-[8.5px] font-bold uppercase" style={{ color: "#6D28D9" }}>opt</span>}
      {ghost && <span className="text-[8.5px] uppercase" style={{ color: T.ghost }}>internal</span>}
      {!comp.isPackage && !it.choiceGroupId && (
        <>
          <Money value={it.unitPrice} confirmed={it.confirmed} disabled={!p.mayEdit}
            onCommit={(v) => p.onPatchItem(it.id, { unit_price: v, price_confirmed: true })} />
          <select value={it.basis ?? "flat"} disabled={!p.mayEdit}
            onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => p.onPatchItem(it.id, { quantity_basis: e.target.value })}
            className="text-[10px] bg-transparent outline-none text-slate-400 w-[52px]">
            <option value="per_person">/person</option><option value="flat">flat</option><option value="per_table">/table</option>
          </select>
        </>
      )}
      {it.choiceGroupId && <span className="text-[9px] text-slate-400">choice</span>}
      <button title={it.visible ? "Visible to customer" : "Hidden from customer"} disabled={!p.mayEdit}
        onClick={(e) => { e.stopPropagation(); p.onPatchItem(it.id, { show_on_proposal: !it.visible }); }}
        onMouseDown={(e) => e.stopPropagation()}
        className="text-[11px] w-4 shrink-0">{it.visible ? "👁" : "🚫"}</button>
    </div>
  );
}

// ── Category ───────────────────────────────────────────────────────────────
function CategoryBlock({ cat, comp, p, drag, sourceCat }: {
  cat: StageCategory; comp: StageComponent; p: DesignStageProps; drag: Drag; sourceCat: string | null;
}) {
  const key = catKey(comp.id, cat.key);
  const tgt: DropTarget = { parentId: key, beforeId: null, ownerId: comp.id };
  const legal = !!drag.live && drag.live.kind === "item" && operationFor(drag.live, tgt) !== "invalid";
  const items = cat.items.filter((i) => i.visible || p.xray);

  // Dwell to OPEN. Resets on leave — sweeping across a column must not open
  // every list in it.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => {
    if (!legal || drag.open === key || key === sourceCat) return;
    // One timer, ever. Enter fires again for every child the pointer crosses;
    // stacking a fresh timer each time leaked timers that could fire for a
    // dwell the user had abandoned. If one is pending, the dwell is running.
    if (timer.current) return;
    timer.current = setTimeout(() => drag.setOpen(key), HOVER_EXPAND_MS);
  };
  const leave = (e: React.DragEvent) => {
    // Crossing INTO a child raises dragleave on this wrapper with
    // relatedTarget still inside it. That is not leaving — but it cancelled
    // the dwell timer 59ms in (measured in real Chromium), so a hand that
    // drifted even slightly could hover forever and never open the category.
    // Only a genuine exit clears the timer.
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Which lists are open while an item is in flight:
  //   • the SOURCE category — until a destination opens (then it collapses,
  //     leaving a label, so two long lists never fight for the screen)
  //   • the DWELT-upon destination
  const itemDrag = drag.live?.kind === "item";
  const isSource = key === sourceCat;
  const isOpen = !itemDrag || (drag.open ? drag.open === key : isSource);

  if (!items.length && !legal) return null;   // empty AND not a destination ⇒ nothing to say

  return (
    <div onDragEnter={enter} onDragLeave={leave}>
      {cat.label && (
        // Deliberately NOT draggable and deliberately no grip: category
        // dragging has not been designed, so the UI must not advertise it.
        <div className="pl-8 py-0.5 flex items-center gap-2 select-none">
          <span className="text-[9.5px] font-semibold tracking-wide"
                style={{ color: legal && !isOpen ? T.gold : T.gold, opacity: itemDrag && !legal ? 0.3 : 1 }}>
            {cat.label}
          </span>
          {!isOpen && legal && <span className="text-[8.5px] text-slate-400">— hover to open</span>}
          {isSource && drag.open && drag.open !== key && (
            <span className="text-[8.5px] italic text-slate-400">Moving from {cat.label}</span>
          )}
          {/* The layout value ("dot" / "comma" / "vertical") USED to render
              here. It is configuration, not content — a small grey token beside
              a label, unexplained, which reads as a grab handle. Removed: a
              category row must advertise nothing, because category dragging has
              not been designed. Layout belongs in the Inspector with the rest of
              the object's context. */}
        </div>
      )}
      {isOpen && (
        <>
          {items.length > 0 && (
            <DropBand drag={drag} target={{ ...tgt, beforeId: items[0].id }} onDrop={p.onDrop} label="Drop at beginning" />
          )}
          {items.map((it, ix) => (
            <div key={it.id}>
              <ItemRow it={it} comp={comp} p={p} drag={drag} />
              {ix < items.length - 1 && (
                <DropBand drag={drag} target={{ ...tgt, beforeId: items[ix + 1].id }} onDrop={p.onDrop} label="Drop here" />
              )}
            </div>
          ))}
          <DropBand drag={drag} target={tgt} onDrop={p.onDrop}
            label={items.length === 0 ? `Drop item into ${cat.label ?? "uncategorised"}` : "Drop at end"} />
        </>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
function ComponentBlock({ c, p, chapterId, drag }: {
  c: StageComponent; p: DesignStageProps; chapterId: string; drag: Drag;
}) {
  const sel = p.selectedId === c.id;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (sel) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [sel]);

  const me: NodePayload = { kind: "component", id: c.id, parentId: chapterId, label: c.title };
  const dim = p.focusedId && p.focusedId !== c.id;

  // While a COMPONENT is in flight the Canvas is a destination map — item
  // lists vanish because they are not part of the decision.
  const simplify = simplifyFor(drag.live);
  const sourceCat = drag.live?.kind === "item" ? drag.live.parentId : null;
  const bodyHidden = simplify === "chapters"
    || (simplify === "categories" && drag.live?.ownerId !== c.id && !drag.open?.startsWith(c.id));

  return (
    <div ref={ref} style={{ opacity: dim ? 0.25 : 1 }} className="transition-opacity">
      <div
        onClick={() => p.onSelect(c.id)}
        className={`group flex items-center gap-2 pl-1 pr-3 py-1 border-l-2 cursor-pointer ${
          sel ? "border-l-[#C9A34E] [&_.grip]:opacity-100" : "border-l-transparent hover:bg-slate-50/60"
        } ${drag.live?.id === c.id ? "opacity-35" : ""}`}
        style={{ background: sel ? T.sel : undefined }}
      >
        <Grip payload={me} label={c.title} drag={drag} disabled={!p.mayEdit} />
        <Text value={c.title} disabled={!p.mayEdit}
          className="flex-1 min-w-0 text-[13.5px] font-semibold text-[#1F2A37]"
          onCommit={(v) => p.onPatchComponent(c.id, { title: v })} />
        <select value={c.isPackage ? "package" : "itemized"} disabled={!p.mayEdit}
          onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => p.onPatchComponent(c.id, { pricing_mode: e.target.value })}
          className="text-[10px] bg-transparent outline-none text-slate-400">
          <option value="itemized">itemized</option><option value="package">package</option>
        </select>
        {c.isPackage && (
          <>
            <Money value={c.packagePrice} confirmed={c.packageConfirmed} disabled={!p.mayEdit}
              onCommit={(v) => p.onPatchComponent(c.id, { package_price: v, package_price_confirmed: true })} />
            <select value={c.packageBasis ?? "flat"} disabled={!p.mayEdit}
              onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => p.onPatchComponent(c.id, { package_basis: e.target.value })}
              className="text-[10px] bg-transparent outline-none text-slate-400 w-[52px]">
              <option value="flat">flat</option><option value="per_person">/person</option>
            </select>
          </>
        )}
        {!c.isPackage && c.subtotal != null && (
          <span className="text-[11px] tabular-nums text-slate-400 w-20 text-right">{p.money(c.subtotal)}</span>
        )}
        <select value={c.display} disabled={!p.mayEdit}
          onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => p.onPatchComponent(c.id, { proposal_display: e.target.value })}
          className="text-[10px] bg-transparent outline-none text-slate-400 w-[64px]" title="What the customer sees">
          <option value="items">items</option><option value="description">description</option><option value="title_only">title only</option>
        </select>
      </div>

      {!bodyHidden && c.note && (
        <div className="pl-8 pr-3 pb-0.5">
          <Text value={c.note} disabled={!p.mayEdit} placeholder="Presentation note…"
            className="w-full text-[11.5px] italic text-slate-500"
            onCommit={(v) => p.onPatchComponent(c.id, { presentation_note: v || null })} />
        </div>
      )}
      {!bodyHidden && c.categories.map((cat) => (
        <CategoryBlock key={cat.key ?? "_"} cat={cat} comp={c} p={p} drag={drag} sourceCat={sourceCat} />
      ))}
    </div>
  );
}

// ── The Stage ──────────────────────────────────────────────────────────────
export default function DesignStage(p: DesignStageProps) {
  const [live, setLive] = useState<NodePayload | null>(null);
  const [awake, setAwake] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);

  // A drag must never permanently rearrange the workspace. All of this state
  // clears when the gesture ends — and the user's own expansion was never
  // touched, because the collapse is a RENDER decision, not a stored one.
  // That is why "restore previous state" needs no code.
  const drag: Drag = {
    live, start: (n) => setLive(n),
    end: (landedIn) => {
      setLive(null); setAwake(null); setOpen(null);
      if (landedIn) { setLanded(landedIn); setTimeout(() => setLanded(null), 700); }
    },
    awake, wake: setAwake, open, setOpen, landed,
  };

  // A read-only Stage is a legitimate state (an approved version, a viewer).
  // A read-only Stage that LOOKS editable and silently ignores you is not —
  // it is indistinguishable from a bug, which is exactly what happened here.
  const readOnly = !p.mayEdit;

  if (!p.chapters.length) {
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
    <div className="pb-24" onDragEnd={() => drag.end()}>
      {readOnly && (
        <div className="mx-3 mt-2 mb-1 px-3 py-1.5 rounded-md text-[11px] font-semibold"
             style={{ background: "#F1F5F9", color: "#64748B" }}>
          Read-only — you can look, but not compose. (No edit permission on this event, or the version is approved.)
        </div>
      )}
      {p.chapters.map((ch) => {
        const legal = isLegalTarget(live, { parentId: ch.id });
        const dropIn = (pl: NodePayload, t: DropTarget) => { p.onDrop?.(pl, t); };
        return (
          <div key={ch.id} className="mb-4" onDragEnter={() => { if (live) setAwake(ch.id); }}>
            <div className={`flex items-baseline gap-2 px-3 py-1.5 sticky top-0 backdrop-blur border-b z-10 transition-all ${
                   landed === ch.id ? "ring-2 ring-[#C9A34E]" : ""}`}
                 style={{
                   borderColor: T.rule,
                   background: live
                     ? (legal ? (awake === ch.id ? "#FFF3D6" : "#FFFBEF") : "rgba(255,255,255,.95)")
                     : "rgba(255,255,255,.95)",
                   opacity: live && !legal ? 0.35 : 1,
                 }}>
              <h3 className="font-display font-bold text-[13px] tracking-tight" style={{ color: T.navy }}>
                {live && awake === ch.id && <span style={{ color: T.gold }}>▶ </span>}{ch.name}
              </h3>
              <span className="flex-1" />
              {ch.subtotal != null && (
                <span className="text-[11px] font-semibold tabular-nums text-slate-400">{p.money(ch.subtotal)}</span>
              )}
              {p.onAddComponent && p.mayEdit && !live && (
                <button onClick={() => p.onAddComponent?.(ch.id)}
                  className="text-[10px] text-slate-400 hover:text-slate-700">+ component</button>
              )}
            </div>

            {ch.components.length > 0 && (
              <DropBand drag={drag} target={{ parentId: ch.id, beforeId: ch.components[0].id }}
                onDrop={dropIn} label={`Drop at start of ${ch.name}`} tall />
            )}
            {ch.components.map((c, ix) => (
              <div key={c.id}>
                <ComponentBlock c={c} p={p} chapterId={ch.id} drag={drag} />
                {ix < ch.components.length - 1 && (
                  <DropBand drag={drag} target={{ parentId: ch.id, beforeId: ch.components[ix + 1].id }}
                    onDrop={dropIn} label="Drop here" tall />
                )}
              </div>
            ))}
            <DropBand drag={drag} target={{ parentId: ch.id, beforeId: null }} onDrop={dropIn}
              label={ch.components.length === 0 ? `Drop component into ${ch.name}` : `Drop at end of ${ch.name}`} tall />
          </div>
        );
      })}
    </div>
  );
}
