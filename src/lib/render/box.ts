// ═══════════════════════════════════════════════════════════════════════════
// THE LAYOUT BOX MODEL (PR-1 · docs/PUBLICATION_RENDERER.md §1)
//
// Boxes are the renderer's only vocabulary downstream of composition.
// A SMALL CLOSED SET of kinds; resolved concrete style values only;
// break rules as attributes; an OPAQUE provenance tag. Boxes contain no
// publication semantics, no callbacks, no framework types — a box tree
// serializes to JSON losslessly, and that property is a unit claim
// because it is what makes pagination replayable.
//
// THE SEMANTIC WALL: this file must never mention publication
// vocabulary. The composer translates once; everything here speaks box.
// ═══════════════════════════════════════════════════════════════════════════

export type BoxKind = "block" | "text" | "image" | "rule" | "spacer" | "group";
export const BOX_KINDS: BoxKind[] = ["block", "text", "image", "rule", "spacer", "group"];

/** Break behavior — consumed ONLY by the paginator (PR-2). */
export interface BreakRules {
  /** Move whole to the next page rather than split (least-bad split +
   *  honest overflow record if taller than any page). */
  keepTogether?: boolean;
  /** A break may not fall between this box and its next sibling. */
  keepWithNext?: boolean;
  /** Orphan control: minimum lines kept before a break inside text. */
  minLinesBefore?: number;
  /** Widow control: minimum lines carried after a break inside text. */
  minLinesAfter?: number;
  breakBefore?: "auto" | "avoid" | "always";
  breakAfter?: "auto" | "avoid" | "always";
}

/** Resolved, concrete values only — no keys, no inheritance, no CSS. */
export interface BoxStyle {
  font?: string;            // a declared metrics family name
  size?: number;            // points
  weight?: number;          // 400 | 600 | 700 …
  italic?: boolean;
  lineHeight?: number;      // multiplier
  letterSpacing?: number;   // em fraction
  color?: string;
  background?: string;
  align?: "left" | "center" | "right";
  marginTop?: number;
  marginBottom?: number;
  indent?: number;
  ruleColor?: string;       // rule kind
  ruleWidth?: number;
  width?: number;           // image kind: intrinsic box
  height?: number;
  gap?: number;             // spacer kind
}

export interface Box {
  kind: BoxKind;
  /** OPAQUE provenance — downstream stages may copy it, never parse it. */
  tag: string;
  style: BoxStyle;
  rules: BreakRules;
  text?: string;            // text kind only
  src?: string;             // image kind only
  children?: Box[];         // block | group only
}

export const box = (kind: BoxKind, tag: string, over: Partial<Box> = {}): Box =>
  ({ kind, tag, style: {}, rules: {}, ...over });

/** ── Lossless, STABLE serialization — sorted keys so identical trees
 *     serialize identically regardless of construction order. ── */
const stable = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Object.prototype.toString.call(v) === "[object Array]")
    return "[" + (v as unknown[]).map(stable).join(",") + "]";
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const parts: string[] = [];
  for (const k of keys) if (o[k] !== undefined) parts.push(JSON.stringify(k) + ":" + stable(o[k]));
  return "{" + parts.join(",") + "}";
};

export const serializeBoxTree = (root: Box): string => stable(root);
export const parseBoxTree = (json: string): Box => JSON.parse(json) as Box;
