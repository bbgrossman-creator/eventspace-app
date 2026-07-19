// ═══════════════════════════════════════════════════════════════════════════
// PAGE MASTERS (PR-3 · docs/PUBLICATION_RENDERER.md §4)
//
// Masters are GEOMETRY AND FURNITURE ONLY: page size, margins, the
// printable area pagination fills, running furniture that repeats, and
// decorations. They contain no break logic and no content of their own
// — furniture arrives as BOX TREES built by the composer (the wall's
// gate); this file never learns what the words mean.
//
// ◆ DERIVED RULING (forward-only law, §3): pagination cannot know which
// page is last until it has finished. Therefore LAST IS A FURNITURE
// DISTINCTION, NEVER A GEOMETRY ONE — last.size, last.margins, and thus
// last's printable extent are DEFINED equal to interior's, and the
// constructor enforces it. FIRST may differ in geometry, because page
// one is known before placement begins.
//
// ◆ THE DEGENERATE CASE, NAMED: a one-page document wears FIRST's
// geometry and header, and LAST's closure furniture — declared here,
// not discovered in an if-statement three years from now.
//
// Page numbers are DECORATIONS resolved in a POST-PASS over the
// completed sequence: nothing inside pagination may depend on the
// final count. This stage attaches {n, of} data; the WORDING is PR-6's.
// ═══════════════════════════════════════════════════════════════════════════
import { Box } from "./box";
import { PageExtent, Page, PaginationResult } from "./paginate";

export type MasterKey = "first" | "interior" | "last";

export interface PageMaster {
  key: MasterKey;
  size: { width: number; height: number };
  margins: { top: number; right: number; bottom: number; left: number };
  /** Repeating furniture — box trees, rendered in the margin bands. */
  runningHeader: Box | null;
  runningFooter: Box | null;
  decorations: {
    pageNumbers: "none" | "footer-center" | "footer-outside";
    watermark: string | null;
  };
}

export interface MasterSet { first: PageMaster; interior: PageMaster; last: PageMaster }

export const printableExtent = (m: PageMaster): PageExtent => ({
  width: m.size.width - m.margins.left - m.margins.right,
  height: m.size.height - m.margins.top - m.margins.bottom,
});

/** Construct a set, ENFORCING the derived ruling: last's geometry is
 *  interior's, whatever the caller asked for. */
export function makeMasterSet(first: PageMaster, interior: PageMaster, last: PageMaster): MasterSet {
  return {
    first, interior,
    last: { ...last, size: { ...interior.size }, margins: { ...interior.margins } },
  };
}

/** Which master governs a page — the degenerate case included. */
export const masterFor = (pageIndex: number, pageCount: number): MasterKey =>
  pageIndex === 0 ? "first" : pageIndex === pageCount - 1 ? "last" : "interior";

/** The extents pagination fills — usable BEFORE the count exists,
 *  because last's printable extent equals interior's by ruling. */
export const extentsFrom = (set: MasterSet) => (pageIndex: number): PageExtent =>
  printableExtent(pageIndex === 0 ? set.first : set.interior);

export interface ImposedPage {
  index: number;
  master: MasterKey;
  size: PageMaster["size"];
  margins: PageMaster["margins"];
  /** Where the printable area's (0,0) sits on the physical page. */
  contentOrigin: { x: number; y: number };
  content: Page;
  runningHeader: Box | null;
  runningFooter: Box | null;
  watermark: string | null;
  /** Post-pass numbering data; wording is PR-6's business. */
  pageNumber: { n: number; of: number } | null;
}

/** THE IMPOSITION — a post-pass over the COMPLETED sequence. Pure; it
 *  never re-breaks anything; the pagination result passes through
 *  untouched. The degenerate one-page case: FIRST's geometry and
 *  header, LAST's closure footer. */
export function imposePages(result: PaginationResult, set: MasterSet): ImposedPage[] {
  const count = result.pages.length;
  return result.pages.map((page) => {
    const key = masterFor(page.index, count);
    const m = key === "first" ? set.first : key === "last" ? set.last : set.interior;
    const onePage = count === 1 && page.index === 0;
    const footerSource = onePage ? set.last : m;                 // closure furniture
    const numberPolicy = (onePage ? set.last : m).decorations.pageNumbers;
    return {
      index: page.index,
      master: key,
      size: m.size,
      margins: m.margins,
      contentOrigin: { x: m.margins.left, y: m.margins.top },
      content: page,
      runningHeader: m.runningHeader,
      runningFooter: footerSource.runningFooter,
      watermark: m.decorations.watermark,
      pageNumber: numberPolicy === "none" ? null : { n: page.index + 1, of: count },
    };
  });
}
