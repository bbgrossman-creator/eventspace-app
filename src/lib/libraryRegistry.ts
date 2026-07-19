// ═══════════════════════════════════════════════════════════════════════════
// THE LIBRARY REGISTRY (v215 · Library slice 1) — KA §4, made code.
//
// "The Library knows no type by name. Each type REGISTERS itself by
// implementing one contract." This file is that contract and its registry —
// and the discipline that keeps it honest is checkable here: adding a
// knowledge type must not modify the Library. When Recipes ship (SPEC-006),
// the diff touches zero Library files: one registration lands in the type's
// own module, and every surface in this file carries it from then on. If it
// can't, the registry has failed. (The fixture-kind proof in the v215 unit
// suite holds this door shut, the same way v211's fixture lens does for the
// lens registry.)
//
// SUPABASE-FREE, deliberately: the registry is machinery, the projections are
// content. Registrations live with their types (libraryKinds.ts today; each
// future type's own module tomorrow) and bring their own queries. That is
// what makes rails logic unit-testable and what makes the browser mountable
// in a harness over fixture registrations — the production.harness doctrine.
//
// ─── THE ENVELOPE, POPULATED HONESTLY ─────────────────────────────────────
// Slice 1 carries the full envelope but fills only what is TRUE today:
//   layer_badges — [] until layer slices ship their Library projections
//                  (KA §11: each lights its badge THEN; a card advertises
//                  exactly which layers the object actually carries — never
//                  a simulation of layers that don't exist yet)
//   cover        — null until the §8 cover hierarchy ships
//   facets       — {} until Explore lands (§5's second doorway)
// Empty is information. A blank field is a fact, not a placeholder to fake.
//
// ─── RANKING (KA §5) ──────────────────────────────────────────────────────
// "Relevance scores across different corpora are not comparable, so results
// are ranked only WITHIN a kind and presented as grouped rails … sections
// appearing only when non-empty, ordered by their best hit. The grouped
// layout is the ranking model made visible." The weight therefore lives
// BESIDE the envelope (RankedEntry), never inside it — it is search
// machinery, private to a rail, and no code may compare it across kinds.
// The model itself stays v196's: prefix beats substring, usage breaks ties,
// no scorer, no "92% relevant".
// ═══════════════════════════════════════════════════════════════════════════

/** KA §4 — the envelope. The only thing search ever reads; native schemas
 *  stay separate (different lifecycles, permissions, editing rules). */
export interface LibraryEntry {
  /** Stable identity within its kind. */
  id: string;
  /** The registered type. */
  kind: string;
  /** Primary label. */
  title: string;
  /** The provenance line — WHY this hit is legible, not merely correct.
   *  "Used in 17 events" · "Bar Mitzvah · Jun 30 2026". */
  subtitle: string | null;
  /** Per the §8 cover hierarchy — null until that machinery ships. */
  cover: string | null;
  /** Scope. RLS enforces tenancy at the source; this records it on the
   *  envelope so a future index can enforce it AGAIN (§5). */
  tenant: "global" | "tenant" | "personal";
  /** Free labels. */
  tags: string[];
  /** Structured filters (§5) — {} until Explore lands. */
  facets: Record<string, string>;
  /** Searchable body beyond the title. */
  text: string | null;
  /** Which operational layers this object ACTUALLY carries. [] until layer
   *  slices ship their Library projections and light their badges (§11). */
  layer_badges: string[];
  /** Lineage pointer (§7) — the id of the promotion/provenance record when
   *  one exists; genealogy rendering is SPEC-004's surface. */
  provenance: string | null;
  /** The object's home: where "open" goes. Null = no detail route yet — an
   *  honest gap; the browser offers actions instead. */
  pointer: { href: string | null };
}

/** What "use this" means for an entry — declared by the registration,
 *  consumed generically by the browser (which knows no kind by name). */
export type LibraryPickAction =
  /** Instantiate into the current event (Library → Canvas, the first verb).
   *  The HOST decides whether an event is in context; absent a host handler,
   *  the browser falls back to navigate when a pointer exists. */
  | { type: "instantiate"; instantiateId: string; name: string }
  /** Open the object's home. */
  | { type: "navigate"; href: string }
  /** Nothing to do — a legal state (an identity with no route and no host). */
  | { type: "none" };

/** A drag payload — declared, never inferred. Null = this entry does not
 *  drag (every drag has a click path; not every click path has a drag). */
export interface LibraryDragPayload {
  mime: string;
  payload: string;
}

/** A secondary affordance on the row (e.g. a component's "definition").
 *  The browser renders it generically when the host provides a handler. */
export interface LibrarySecondaryAction {
  label: string;
  /** Opaque to the browser; the host's handler receives it verbatim. */
  id: string;
  title: string;
}

/** Ranking is comparable only within a kind (§5) — so the weight travels
 *  beside the envelope, never inside it. */
export interface RankedEntry {
  entry: LibraryEntry;
  weight: number;
}

/** KA §4 "Registered behavior", slice-1 surface. projection() is `search`
 *  here because slice 1's one consumer is the search pane; renderer(),
 *  preview(), cover() and legalDestinations() are declared so a kind that
 *  needs them ships them WITHOUT a Library diff, and the browser falls back
 *  to its default row when they are absent. */
export interface LibraryKindRegistration {
  kind: string;
  /** Rail heading — "Components", "Past events". */
  label: string;
  /** Rail glyph. */
  icon: string;
  /** The projection: query text → ranked envelopes. Brings its own reads;
   *  the registry never queries. */
  search(ctx: { q: string; like: string }): Promise<RankedEntry[]>;
  /** What ↵ / click means for an entry. */
  pick(entry: LibraryEntry): LibraryPickAction;
  /** Drag payload, or null for click-only kinds. */
  drag?(entry: LibraryEntry): LibraryDragPayload | null;
  /** Optional row affordance (a component's "definition"). */
  secondary?(entry: LibraryEntry): LibrarySecondaryAction | null;
  /** Reserved slots (KA §4) — a kind MAY ship these; the browser uses its
   *  default card/preview when absent. Typed now so shipping them later is
   *  a registration change, never a Library change. */
  renderCard?: unknown;
  preview?: unknown;
  legalDestinations?: unknown;
}

/** Registration by declaration; duplicate kind = build error — the
 *  registerLayer/registerMoveKind/registerLens idiom, one registry over.
 *  (A plain record, not a Map: the production build targets es5 — the same
 *  discipline v214 applied to the page's renderer table.) */
const kindRegistry: Record<string, LibraryKindRegistration> = {};
const KIND_ORDER: LibraryKindRegistration[] = [];

export function registerLibraryKind(reg: LibraryKindRegistration): void {
  if (kindRegistry[reg.kind] !== undefined)
    throw new Error(`library kind '${reg.kind}' already registered`);
  kindRegistry[reg.kind] = reg;
  KIND_ORDER.push(reg);
}

/** Harness-only: fixture kinds register and unregister around their own
 *  suites. Never called in production code — enforced by review. */
export function _unregisterLibraryKindForTests(kind: string): void {
  delete kindRegistry[kind];
  for (let i = KIND_ORDER.length - 1; i >= 0; i--) {
    if (KIND_ORDER[i].kind === kind) KIND_ORDER.splice(i, 1);
  }
}

export function libraryKind(kind: string): LibraryKindRegistration | null {
  return kindRegistry[kind] ?? null;
}

/** One rail: a registration's heading over its ranked hits. */
export interface LibraryRail {
  kind: string;
  label: string;
  icon: string;
  entries: LibraryEntry[];
}

export interface LibraryRails {
  /** True when the query was too short to search — "type to search" and
   *  "no results" are DIFFERENT FACTS (v196), and collapsing them tells the
   *  user the Library is empty. */
  idle: boolean;
  rails: LibraryRail[];
}

export const IDLE_RAILS: LibraryRails = { idle: true, rails: [] };

/** v196's whole ranking model, kept: prefix beats substring; a bonus (usage)
 *  breaks ties, capped by the caller so popularity can't bury an exact
 *  match. Exported so every registration shares one model. */
export const rankPrefix = (title: string, q: string, bonus = 0) =>
  (title.toLowerCase().startsWith(q) ? 100 : 50) + bonus;

/**
 * The grouped search (§5): every registration's projection runs, each rail is
 * ranked within itself, rails order by their best hit, and only non-empty
 * rails return. A registration whose projection throws contributes an empty
 * rail rather than sinking the pane — one shelf failing is not the Library
 * failing, and the failure is the projection's to log.
 */
export async function searchLibraryRails(query: string): Promise<LibraryRails> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return IDLE_RAILS;
  const like = `%${q}%`;

  const settled = await Promise.all(
    KIND_ORDER.map(async (reg) => {
      try {
        const ranked = await reg.search({ q, like });
        return { reg, ranked };
      } catch {
        return { reg, ranked: [] as RankedEntry[] };
      }
    }),
  );

  const rails = settled
    .filter((s) => s.ranked.length > 0)
    .map((s) => {
      const sorted = s.ranked.slice().sort((a, b) => b.weight - a.weight);
      return {
        rail: {
          kind: s.reg.kind, label: s.reg.label, icon: s.reg.icon,
          entries: sorted.map((r) => r.entry),
        },
        best: sorted[0].weight,
      };
    })
    .sort((a, b) => b.best - a.best)
    .map((x) => x.rail);

  return { idle: false, rails };
}

export const railCount = (r: LibraryRails) => {
  let n = 0;
  for (const rail of r.rails) n += rail.entries.length;
  return n;
};
