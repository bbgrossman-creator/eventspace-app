// ═══════════════════════════════════════════════════════════════════════════
// THE DRAG GRAMMAR (v196b)
//
// The Interaction Doctrine's verbs, in one file, so that no component decides
// for itself what a drag means. The whole grammar dies the moment two surfaces
// disagree about whether a gesture rearranges or moves.
//
//   Instantiate   Library → Design    learned → intended   arrives AMBER
//   Rearrange     within a parent     intended → intended  silent
//   Move          across parents      intended → intended  silent
//   Promote       Design → Library    intended → learned   selective dialog
//   (Bind         resource → requirement — v197, realization axis)
//
// ─── THE OPERATION IS DERIVED, NEVER DECLARED ─────────────────────────────
// A drag does not carry "I am a move." It carries WHAT is being dragged and
// FROM WHERE; the drop site knows where it landed; the operation falls out of
// comparing the two. That is why the cursor can be honest without anyone
// remembering to set it — and why Stage and Outline cannot disagree.
//
// ─── TWO LAWS ─────────────────────────────────────────────────────────────
// 1. **Dragging never edits and never copies.** It changes position and
//    parentage. Nothing else. A drag that alters a field is a different verb
//    wearing a drag's clothes.
// 2. **Every drag has a click path.** Drag is the fast path, never the only
//    path — discoverability and accessibility both demand it.
// ═══════════════════════════════════════════════════════════════════════════

export type DragKind = "component" | "item" | "identity";
export type DragOp = "rearrange" | "move" | "instantiate" | "invalid";

export const MIME = {
  /** Something already IN the design, being repositioned. */
  node: "text/eventcore-node",
  /** Something FROM the Library, being instantiated. */
  identity: "text/eventcore-identity",
} as const;

export interface NodePayload {
  kind: Exclude<DragKind, "identity">;
  id: string;
  /** The parent this node is ORDERED WITHIN:
   *   component → section_type_id (its chapter)
   *   item      → `${componentId}::${categoryKey}` — the CATEGORY, not the
   *               component. Corrected: an item's siblings are the rows in its
   *               category, and "Spicy Tuna → Classic Rolls" is a real move
   *               the earlier model called invalid. Its parent is the box it
   *               is ordered inside, and for an item that box is a category. */
  parentId: string | null;
  /** Item only: the owning component. Crossing THIS is the semantic change
   *  that stays forbidden — a Prime Rib row under Carving is not the same
   *  fact as one under Dinner (different basis, category, audience). */
  ownerId?: string | null;
  label: string;
}

export interface DropTarget {
  /** The parent being dropped INTO. */
  parentId: string | null;
  /** Insert before this sibling; null = append at the end. */
  beforeId: string | null;
  /** Item drops: the component that owns the destination category. */
  ownerId?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAG SIMPLIFICATION — "show only what the person needs to decide next",
// applied to a gesture.
//
// This is NOT a new principle. Dragging IS a decision — *where does this go?*
// — so the Canvas should show destinations and nothing else. Forcing someone
// to drag a component through forty expanded item rows to reach Late Night is
// the same failure as a form that shows every field: it makes the person do
// the filtering the software should have done.
//
// It changes PRESENTATION ONLY. The grammar above is untouched: same verbs,
// same rules, same writes. What collapses is the view, for the duration of the
// gesture, and it restores exactly as it was — a drag must never permanently
// rearrange someone's workspace.
// ═══════════════════════════════════════════════════════════════════════════

/** What the Canvas should reveal while `p` is in flight. */
export function simplifyFor(p: NodePayload | null): "none" | "chapters" | "categories" {
  if (!p) return "none";
  return p.kind === "component" ? "chapters" : "categories";
}

/** Is this a place `p` may legally land? Used to LIGHT legal targets and grey
 *  the rest — your eye should know where the object may go without trying. */
export function isLegalTarget(p: NodePayload | null, target: { parentId: string; ownerId?: string | null }): boolean {
  if (!p) return false;
  return operationFor(p, { parentId: target.parentId, beforeId: null, ownerId: target.ownerId }) !== "invalid";
}

/** How long a hover must dwell before a collapsed target opens. Long enough
 *  not to fire while crossing, short enough not to feel stuck. */
export const HOVER_EXPAND_MS = 450;

/** Movement required before a click becomes a drag. Without it, every attempt
 *  to select a row is a potential accidental move. */
export const DRAG_THRESHOLD_PX = 6;


/**
 * The operation, derived. This is the only place it is decided.
 *
 * An ITEM crossing components is deliberately **invalid** rather than a move:
 * an item's meaning is bound to its component (a Prime Rib row under Carving
 * is not the same fact as one under Dinner — it has a different price basis,
 * category and audience). Allowing it would look like a convenience and be a
 * silent semantic change. Re-parenting an item is a real operation and it
 * deserves a real ceremony, not a drag that happens to land somewhere.
 */
export function operationFor(p: NodePayload, t: DropTarget): DragOp {
  if (p.kind === "component") {
    return t.parentId === p.parentId ? "rearrange" : "move";
  }
  // Items: within a category ⇒ rearrange. Across categories OF THE SAME
  // COMPONENT ⇒ move (it changes category_key — a real, reversible placement).
  // Across COMPONENTS ⇒ invalid, and deliberately: that would look like a
  // convenience and be a silent semantic change.
  if (t.parentId === p.parentId) return "rearrange";
  if (t.ownerId && p.ownerId && t.ownerId === p.ownerId) return "move";
  return "invalid";
}

/** Split an item's parentId back into its parts. One encoding, one decoder. */
export const catKey = (componentId: string, category: string | null) => `${componentId}::${category ?? "_"}`;
export function splitCatKey(k: string): { componentId: string; category: string | null } {
  const i = k.indexOf("::");
  if (i < 0) return { componentId: k, category: null };
  const cat = k.slice(i + 2);
  return { componentId: k.slice(0, i), category: cat === "_" ? null : cat };
}

/** What the cursor says. The gesture teaches itself; nobody has to be told. */
export function cursorLabel(op: DragOp, label: string, toLabel?: string): string {
  switch (op) {
    case "rearrange":   return `↕ Rearrange · ${label}`;
    case "move":        return `⇢ Move · ${label}${toLabel ? ` → ${toLabel}` : ""}`;
    case "instantiate": return `+ Instantiate · ${label}`;
    case "invalid":     return `⃠ Can't drop here`;
  }
}

/**
 * The new order, as an array of ids. Renumbering is done by the CALLER from
 * this array — which keeps the maths here pure and testable, and keeps the
 * writes in one place where they can be batched.
 *
 * Returns the moved id's new INDEX too, so a caller can scroll to it: the
 * criterion is that selection follows the object, and an object you cannot
 * find has not really been followed.
 */
export function reorder(ids: string[], movedId: string, beforeId: string | null): { ids: string[]; index: number } {
  const without = ids.filter((i) => i !== movedId);
  const at = beforeId ? without.indexOf(beforeId) : -1;
  const index = at < 0 ? without.length : at;
  without.splice(index, 0, movedId);
  return { ids: without, index };
}

/** Dropping a thing onto itself, or onto the gap it already occupies, is a
 *  no-op — not an error, and not a write. Silence is the correct response to
 *  a gesture that asked for nothing. */
export function isNoOp(ids: string[], movedId: string, beforeId: string | null): boolean {
  if (movedId === beforeId) return true;
  const cur = ids.indexOf(movedId);
  if (cur < 0) return false;
  const target = beforeId ? ids.indexOf(beforeId) : ids.length;
  return target === cur || target === cur + 1;
}

/** Read a payload back. Returns null rather than throwing — a foreign drag
 *  (a file, a browser tab, a selection) is a normal event, not an exception. */
export function readNode(dt: DataTransfer): NodePayload | null {
  try {
    const raw = dt.getData(MIME.node);
    if (!raw) return null;
    const p = JSON.parse(raw) as NodePayload;
    return p && p.id && (p.kind === "component" || p.kind === "item") ? p : null;
  } catch { return null; }
}

/** A drag image that says what will happen. Built once per drag and removed
 *  after — the browser snapshots it synchronously. */
export function setDragLabel(e: React.DragEvent, text: string) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText =
    "position:fixed;top:-1000px;left:-1000px;padding:4px 8px;border-radius:6px;" +
    "background:#102F56;color:#fff;font:600 11px/1.2 system-ui;white-space:nowrap;";
  document.body.appendChild(el);
  e.dataTransfer.setDragImage(el, 8, 8);
  setTimeout(() => el.remove(), 0);
}
