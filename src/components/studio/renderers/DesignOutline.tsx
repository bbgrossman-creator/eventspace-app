"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE OUTLINE RAIL (v196)
//
// ─── WHY THIS LIVES IN /renderers AND NOT IN THE SHELL ────────────────────
// The design doc first called the rail "the constant skeleton across every
// lens." The workflow walkthrough proved that wrong and it is banked as a
// correction: chapters ▸ components ▸ items is the event's COMPOSITIONAL
// shape, which Design, Customer and Production share — but a Layout lens's
// outline is *rooms ▸ zones ▸ stations*, and a cue sheet's is *time*.
//
// **The rail is a projection too** — a different traversal of the same
// canonical objects. So it belongs to a lens's RENDERING, not to the shell as
// furniture. This file is therefore `DesignOutline`: the outline for the
// lenses that share the Design's composition. Layout will bring its own, and
// will not have to fight the shell for the right to have one.
//
// ─── WHAT IT DOES, GIVEN THE SETTLED SCOPE ────────────────────────────────
// The Stage is the WHOLE Design (III.4) — 17 components, 258 rows in the
// benchmark. So the rail is orientation over a large canonical object:
//
//   • SELECT   — click: the Stage scrolls, Details follows. Shell-owned state.
//   • FOCUS    — double-click: the Stage projects only this subtree. A
//                suppression, not a scope change. Esc releases.
//   • HEALTH   — per-node debt, derived. A ⚠ on Dinner means the debt is
//                *inside* it, so you can find it without opening every node.
//
// It NAVIGATES. It never drives a detail pane — that would be the
// master-detail model III.4 rejected, smuggled back in through the rail.
//
// Under the renderer contract: NO QUERIES. It renders a model it is handed.
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from "react";

const T = { ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E", sel: "#F4F9FF" } as const;

/** One node of the compositional traversal. Deliberately NOT a generic tree
 *  type: a Layout outline's node has a footprint and a position, and forcing
 *  both through one interface would produce a type that means nothing. */
export interface OutlineNode {
  id: string;
  label: string;
  kind: "chapter" | "component" | "item";
  children?: OutlineNode[];
  /** Unresolved debt AT or BELOW this node. Derived by the projection, never
   *  stored — the same rule the lens badges obey. */
  debt?: number;
  /** Customer-invisible (X-ray only). Ghosted, same vocabulary as the Stage. */
  internal?: boolean;
}

export interface DesignOutlineProps {
  nodes: OutlineNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  focusedId?: string | null;
  onFocus?: (id: string | null) => void;
  /** Show internal nodes. Same flag, same meaning, same source as the Stage —
   *  because a rail that disagreed with the Stage about what exists would be
   *  a second truth in the furniture. */
  xray?: boolean;
}

function Node({ node, depth, p }: { node: OutlineNode; depth: number; p: DesignOutlineProps }) {
  // Chapters and components open; item groups under a component open too —
  // depth 2 is a CATEGORY, and a category that starts closed makes the user
  // click twice to see a roll. Only the deepest lists start closed, and they
  // have no children anyway.
  const [open, setOpen] = useState(depth < 3);
  const kids = node.children ?? [];
  const sel = p.selectedId === node.id;
  const focused = p.focusedId === node.id;
  const ghost = node.internal === true;

  if (ghost && !p.xray) return null;   // the rail cannot show what the Stage hides

  return (
    <div>
      <div
        onClick={() => p.onSelect(node.id)}
        onDoubleClick={() => p.onFocus?.(focused ? null : node.id)}
        title={focused ? "Double-click to release focus" : "Double-click to focus"}
        className={`flex items-center gap-1 pr-2 py-1 cursor-pointer text-[12.5px] rounded-md ${
          sel ? "font-semibold" : "hover:bg-slate-50"
        }`}
        style={{
          paddingLeft: 6 + depth * 12,
          background: sel ? T.sel : undefined,
          color: ghost ? "#94A3B8" : node.kind === "chapter" ? T.navy : T.ink,
          opacity: p.focusedId && !focused && depth === 0 ? 0.35 : 1,   // focus fades peers
        }}
      >
        {kids.length > 0 ? (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
            className="w-3 text-[9px] text-slate-400 shrink-0"
          >{open ? "▾" : "▸"}</button>
        ) : <span className="w-3 shrink-0" />}

        <span className={`truncate ${ghost ? "line-through decoration-slate-300" : ""} ${
          node.kind === "chapter" ? "font-semibold" : ""}`}>
          {node.label}
        </span>

        <span className="flex-1" />
        {focused && <span className="text-[9px] font-bold" style={{ color: T.gold }}>FOCUS</span>}
        {/* Debt rolls UP: a ⚠ on a chapter means it is somewhere inside. That is
            what makes the rail usable on a 258-row event — you can find debt
            without opening every node. */}
        {!!node.debt && node.debt > 0 && (
          <span title={`${node.debt} unresolved inside`}
                className="text-[9px] font-bold text-amber-600 shrink-0">⚠{node.debt}</span>
        )}
      </div>
      {open && kids.map((k) => <Node key={k.id} node={k} depth={depth + 1} p={p} />)}
    </div>
  );
}

export default function DesignOutline(p: DesignOutlineProps) {
  if (!p.nodes.length) {
    return <p className="px-3 py-6 text-[12px] text-center text-slate-400">Nothing composed yet.</p>;
  }
  return (
    <div className="py-1">
      {p.focusedId && (
        <button
          onClick={() => p.onFocus?.(null)}
          className="w-full text-left px-3 py-1 mb-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: T.gold }}
        >
          ← Release focus (Esc)
        </button>
      )}
      {p.nodes.map((n) => <Node key={n.id} node={n} depth={0} p={p} />)}
    </div>
  );
}
