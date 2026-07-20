// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT LIBRARY KIND (v256 · BP-6) — the shelf becomes the Library's
// fifth-registered kind, in its own module with ZERO Library-machinery
// diffs (the v215 doctrine, exercised for real: libraryRegistry.ts is
// untouched by this slice, unit-pinned).
//
// WHAT THE LIBRARY SHOWS: knowledge. An entry appears only when its
// identity is ACTIVE and OFFERS a published revision — retired identities
// and draft-only identities are hidden (the shelf offers nothing there,
// so the Library shows nothing; hiding is the same law, projected).
//
// PROVENANCE-ONLY PROOF: the subtitle carries the citation count as FACT
// ("cited by 5 designs" — counted from blueprint_instantiations, the
// append-only record). NOTHING RANKS BY IT: the weight is rankPrefix over
// the query alone; a heavily-cited blueprint sorts exactly like an uncited
// one (unit-pinned: the weight expression contains no citation variable).
// Zero citations is stated, not hidden — a fact, not a flaw.
//
// THE VERB: navigate. The Library points; the shelf performs. Instantiation
// remains BP-3's ceremony on the shelf surface — no land verb, no drag, no
// shortcut around the guest-count question. This registration supersedes
// the v216 legacy-kind (which read the retired v182 pointer table); with
// v255's reconciliation, one word means one thing again.
// ═══════════════════════════════════════════════════════════════════════════
/** THE VISIBILITY LAW, pure: active + offering. Everything else is hidden
 *  from the Library — same law as the shelf's own offer. */
export function shelfEntryVisible(i: { status: string; published_revision_id: string | null }): boolean {
  return i.status === "active" && i.published_revision_id !== null;
}

/** THE PROOF LINE, pure: provenance stated as fact, never as rank. */
export function blueprintProofLine(
  taxonomy: string | null, revisionNumber: number | null, citations: number,
): string {
  const parts: string[] = [];
  if (taxonomy) parts.push(taxonomy);
  if (revisionNumber !== null) parts.push(`r${revisionNumber}`);
  parts.push(citations === 0 ? "not yet cited" : citations === 1 ? "cited by 1 design" : `cited by ${citations} designs`);
  return parts.join(" · ");
}

