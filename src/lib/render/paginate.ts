// ═══════════════════════════════════════════════════════════════════════════
// THE PAGINATION ENGINE (PR-2 · docs/PUBLICATION_RENDERER.md §3)
//
// A PURE transformation: box tree × measurer × page extents → pages of
// placed boxes. FORWARD-ONLY: once a page closes, its contents are law;
// every rule here uses bounded lookahead and none may ever require
// reopening a placed page. This stage knows only boxes — tags are
// copied, never parsed; no publication vocabulary exists here.
// ═══════════════════════════════════════════════════════════════════════════
import { Box } from "./box";
import { Measurer } from "./measure";

export interface PageExtent { width: number; height: number }

export interface PlacedBox {
  box: Box;
  y: number;
  height: number;
  /** Text splits: which lines this placement carries. */
  slice?: { fromLine: number; toLine: number; totalLines: number };
  /** An image scaled to fit the page — recorded, never silent. */
  scaledTo?: { width: number; height: number };
}

export interface Page { index: number; extent: PageExtent; placed: PlacedBox[] }
export interface ContinuationMarker { tag: string; fromPage: number; toPage: number }
export interface OverflowNote { tag: string; page: number; detail: string }

export interface PaginationResult {
  pages: Page[];
  continuations: ContinuationMarker[];
  overflows: OverflowNote[];
}

interface Cursor { page: number; y: number }

export function paginate(
  root: Box,
  measurer: Measurer,
  extents: (pageIndex: number) => PageExtent,
): PaginationResult {
  const pages: Page[] = [];
  const continuations: ContinuationMarker[] = [];
  const overflows: OverflowNote[] = [];
  const cur: Cursor = { page: 0, y: 0 };

  const pageAt = (i: number): Page => {
    while (pages.length <= i) pages.push({ index: pages.length, extent: extents(pages.length), placed: [] });
    return pages[i];
  };
  const remaining = (): number => pageAt(cur.page).extent.height - cur.y;
  const atTop = (): boolean => cur.y === 0;
  const closePage = (): void => { cur.page += 1; cur.y = 0; };

  // ── intrinsic content height (margins handled at placement) ──
  const contentHeight = (b: Box, width: number): number => {
    if (b.kind === "text") {
      const m = measurer.measure(b.text ?? "", b.style.font ?? "serif", b.style.size ?? 10, width - (b.style.indent ?? 0));
      return m.height * (b.style.lineHeight ? b.style.lineHeight / 1.4 : 1);
    }
    if (b.kind === "image") return b.style.height ?? 0;
    if (b.kind === "rule") return b.style.ruleWidth ?? 1;
    if (b.kind === "spacer") return b.style.gap ?? 0;
    let h = 0;
    for (const c of b.children ?? []) h += fullHeight(c, width);
    return h;
  };
  const fullHeight = (b: Box, width: number): number =>
    (b.style.marginTop ?? 0) + contentHeight(b, width) + (b.style.marginBottom ?? 0);

  // ── bounded lookahead: the smallest honest prefix of a box ──
  const minimalPrefixHeight = (b: Box, width: number): number => {
    const mt = b.style.marginTop ?? 0;
    if (b.kind === "text") {
      const m = measurer.measure(b.text ?? "", b.style.font ?? "serif", b.style.size ?? 10, width - (b.style.indent ?? 0));
      const lines = Math.min(m.lines, Math.max(1, b.rules.minLinesBefore ?? 2));
      return mt + lines * m.lineHeight;
    }
    if (b.kind === "image" || b.rules.keepTogether) return mt + contentHeight(b, width);
    const first = (b.children ?? [])[0];
    return first ? mt + minimalPrefixHeight(first, width) : mt + contentHeight(b, width);
  };

  const place = (b: Box, y: number, height: number, extra?: Partial<PlacedBox>): void => {
    pageAt(cur.page).placed.push({ box: b, y, height, ...extra });
    cur.y = y + height;
  };

  // ── one text box, splitting between lines with widow/orphan law ──
  const placeText = (b: Box, width: number): void => {
    const mt = atTop() ? 0 : (b.style.marginTop ?? 0);
    const m = measurer.measure(b.text ?? "", b.style.font ?? "serif", b.style.size ?? 10, width - (b.style.indent ?? 0));
    if (m.lines === 0) return;
    const total = m.height;
    if (mt + total + (b.style.marginBottom ?? 0) <= remaining()) {
      place(b, cur.y + mt, total); cur.y += (b.style.marginBottom ?? 0); return;
    }
    const minBefore = b.rules.minLinesBefore ?? 2;
    const minAfter = b.rules.minLinesAfter ?? 2;
    let from = 0;
    let firstSlicePage = -1;
    while (from < m.lines) {
      const room = remaining() - (from === 0 ? mt : 0);
      let fit = Math.floor(room / m.lineHeight);
      const left = m.lines - from;
      if (fit >= left) fit = left;                        // the rest fits
      else {
        if (left - fit < minAfter) fit = left - minAfter; // widow law
        if (from === 0 && fit < minBefore) fit = 0;       // orphan law
        if (fit < 0) fit = 0;
      }
      if (fit === 0) {
        if (atTop()) { fit = Math.min(left, Math.max(1, Math.floor(remaining() / m.lineHeight))); } // page can't be skipped forever
        else { closePage(); continue; }
      }
      const sliceH = fit * m.lineHeight;
      const yy = cur.y + (from === 0 ? mt : 0);
      const partial = !(from === 0 && fit === m.lines);   // a pushed-whole paragraph is not a split
      place(b, yy, sliceH, partial ? { slice: { fromLine: from, toLine: from + fit, totalLines: m.lines } } : undefined);
      if (from === 0) firstSlicePage = cur.page;
      from += fit;
      if (from < m.lines) { continuations.push({ tag: b.tag, fromPage: cur.page, toPage: cur.page + 1 }); closePage(); }
    }
    if (firstSlicePage >= 0) cur.y += (b.style.marginBottom ?? 0);
  };

  const placeAtomic = (b: Box, width: number): void => {
    let h = contentHeight(b, width);
    let scaledTo: PlacedBox["scaledTo"];
    const need = (atTop() ? 0 : (b.style.marginTop ?? 0)) + h + (b.style.marginBottom ?? 0);
    if (need > remaining() && !atTop()) closePage();
    const page = pageAt(cur.page);
    if (b.kind === "image" && h > page.extent.height) {
      const scale = page.extent.height / h;                 // scale-to-fit, recorded — never silent
      scaledTo = { width: (b.style.width ?? 0) * scale, height: page.extent.height };
      overflows.push({ tag: b.tag, page: cur.page, detail: "image scaled to fit page" });
      h = page.extent.height;
    }
    if ((b.kind === "rule" || b.kind === "spacer") && atTop()) return;   // never begin a page
    const mt = atTop() ? 0 : (b.style.marginTop ?? 0);
    place(b, cur.y + mt, h, scaledTo ? { scaledTo } : undefined);
    cur.y += (b.style.marginBottom ?? 0);
  };

  const placeGroup = (b: Box, width: number): void => {
    const kids = b.children ?? [];
    const mt = atTop() ? 0 : (b.style.marginTop ?? 0);
    const whole = mt + contentHeight(b, width) + (b.style.marginBottom ?? 0);
    if (b.rules.keepTogether && whole > remaining()) {
      const pageH = pageAt(cur.page).extent.height;
      if (whole <= pageH) { if (!atTop()) closePage(); }
      else overflows.push({ tag: b.tag, page: cur.page, detail: "keepTogether taller than any page — least-bad split" });
    }
    cur.y += atTop() ? 0 : (b.style.marginTop ?? 0);
    const startPage = cur.page;
    for (let i = 0; i < kids.length; i++) placeChild(kids[i], kids[i + 1] ?? null, width);
    for (let pg = startPage; pg < cur.page; pg++)           // one marker per crossing
      continuations.push({ tag: b.tag, fromPage: pg, toPage: pg + 1 });
    cur.y += (b.style.marginBottom ?? 0);
  };

  const placeChild = (b: Box, next: Box | null, width: number): void => {
    if (b.rules.breakBefore === "always" && !atTop()) closePage();
    // keepWithNext / next.breakBefore avoid — ONE sibling of bounded lookahead
    const wantsCompanion = (b.rules.keepWithNext || next?.rules.breakBefore === "avoid") && next;
    if (wantsCompanion) {
      const mine = (atTop() ? 0 : (b.style.marginTop ?? 0)) + contentHeight(b, width) + (b.style.marginBottom ?? 0);
      const theirs = minimalPrefixHeight(next!, width);
      if (mine <= remaining() && mine + theirs > remaining() && !atTop()) closePage();
    }
    if (b.kind === "text") placeText(b, width);
    else if (b.kind === "group" || b.kind === "block") placeGroup(b, width);
    else placeAtomic(b, width);
    if (b.rules.breakAfter === "always") closePage();
  };

  const width = extents(0).width;
  const top = root.children ?? [root];
  for (let i = 0; i < top.length; i++) placeChild(top[i], top[i + 1] ?? null, width);
  return { pages, continuations, overflows };
}
