// ═══════════════════════════════════════════════════════════════════════════
// THE RENDERER CONTRACT (v196)
//
// "Where do Renderers live? Plugins? React trees? Configuration? Or merely
//  different component compositions?"
//
// ANSWER: **Components conforming to a contract.** Not plugins, not config.
// And the load-bearing half of that sentence is `contract`, not `components` —
// because the contract is what makes the delivery mechanism REVERSIBLE.
//
// ─── WHY NOT PLUGINS ──────────────────────────────────────────────────────
// A plugin API is a promise you can never break. Freezing one now — before a
// single non-Customer renderer exists — would fossilise guesses about what
// renderers need, and every future change becomes a compatibility negotiation
// with our own past. Nobody outside this codebase is writing a renderer in the
// next five years. Build the seam; skip the ceremony.
//
// ─── WHY NOT CONFIGURATION ────────────────────────────────────────────────
// Declarative renderers work beautifully for tables and die at floor plans,
// cue sheets, and timelines. The failure mode is textbook: config hits a wall,
// you add an escape hatch, the escape hatch becomes the real system, and now
// you maintain two. The Layout lens alone disqualifies config as the general
// mechanism — a floor plan is not a JSON shape.
//
// ─── WHY NOT FREE-FORM COMPONENTS ─────────────────────────────────────────
// Because v195 already showed what that costs at ONE renderer: the optional
// badge existed twice with different margins, and price styling branched on
// an English string. Multiply that drift by five lenses. The kit (below) is
// the answer to that, not discipline.
//
// ─── THE SHAPE ────────────────────────────────────────────────────────────
//
//   Design ──project()──► LensModel ──<Render/>──► pixels
//            pure, no JSX            pure, no queries
//
// This is not new. It is EXACTLY what v194/v195 already built and proved:
// `presentation.ts` IS the Customer projection; `ProposalRenderer` IS the
// Customer renderer; the renderer never queries and the projection never
// renders. The contract below just names the pattern so the next four lenses
// inherit it instead of reinventing it.
//
// FOUR LAYERS, and only layer 3 varies per lens:
//
//   1. PROJECTION   lib/*.ts          Design → LensModel. Pure. Testable
//                                     without React. (presentation.ts is one.)
//   2. KIT          components/studio/kit/   Price, ItemRun, Heading, Badge.
//                                     ONE decision per concern — the v195
//                                     lesson, extracted so every lens shares it.
//   3. RENDERER     components/studio/renderers/   Per-lens composition of the
//                                     kit over a model. The ONLY layer that
//                                     differs between lenses.
//   4. SHELL        StudioShell + rail + inspector.   Constant. Owns
//                                     everything OUTSIDE the Stage. A renderer
//                                     never draws chrome, never owns selection,
//                                     never knows another lens exists.
//
// ─── WHY THE REGISTRY STAYS PURE ──────────────────────────────────────────
// lenses.ts must NOT import React: it is tested without a DOM (111 tests), and
// binding components into it would end that. So the renderer map lives in its
// own module and is looked up by key. Metadata and machinery, separated.
// ═══════════════════════════════════════════════════════════════════════════
import { LensKey } from "./lenses";
import { Session } from "./permissions";

/** What a renderer may DO — the third thing a lens declares (projection,
 *  rendering, affordances). Computed by the shell, never by the renderer:
 *  a renderer that decides its own permissions is a renderer that will
 *  eventually get it wrong. */
export interface Affordances {
  /** Show the truth the customer never sees: hidden items, amber prices, drop
   *  zones. A modifier on EVERY lens — not a lens (One-Stage). */
  xray: boolean;
  /** May this session mutate through this lens right now? Already folds
   *  lens.editable × session.perms × version lock. */
  mayEdit: boolean;
  /** Selection is SHELL state, not renderer state — the Structure rail, the
   *  Stage and the Inspector must agree on what is selected, and three
   *  components cannot each own that. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** Everything a projection needs that isn't the Design itself. Passed in, so
 *  projections stay pure and testable — no ambient reads. */
export interface ProjectionContext {
  session: Session | null;
  /** Resolved tax (F0). Projections never resolve it themselves. */
  taxRate: number;
}

/**
 * A renderer, in full. `M` is the lens's own model type — deliberately
 * unconstrained: the Customer lens's model (bands, blocks, choice cards) and
 * the Layout lens's model (rooms, footprints, service paths) have nothing in
 * common, and pretending otherwise would produce a base type that means
 * nothing and constrains everything.
 *
 * What they DO share is this contract's shape — which is the entire point:
 * uniform seams, free interiors.
 */
export interface LensRenderer<M> {
  key: LensKey;
  /** Design → model. Pure, async (it may read), returns data only. NO JSX. */
  project: (bookingId: string, versionId: string, ctx: ProjectionContext) => Promise<M>;
  /** Model → pixels. Pure. NO queries. If a renderer needs a fact the model
   *  lacks, the PROJECTION is wrong — never reach around it. That rule is what
   *  keeps the Stage honest, and it is the rule v194 P0.2 was violated by:
   *  presentation.ts did its own arithmetic and drifted $12,388 from the
   *  Studio. A renderer that queries will drift the same way. */
  Render: (props: { model: M; affordances: Affordances }) => React.ReactNode;
  /** Rendered when project() returns nothing to show. NOT an error state —
   *  empty is information (a chef on an Exploring event SHOULD see an empty
   *  Production lens, plus why). Optional: the shell has a dull default. */
  Empty?: (props: { model: M }) => React.ReactNode;
}

// ─── WHAT THIS BUYS, CONCRETELY ───────────────────────────────────────────
// • Every projection is testable with no DOM — the 111 tests keep working.
// • Every renderer is testable with a literal model — no database.
// • Lazy-loading a heavy renderer (a floor plan pulling a canvas library) is
//   a dynamic import at the map, not a redesign.
// • IF plugins ever matter, this contract is already the plugin API — it just
//   wouldn't be published yet. That is the difference between a seam and a
//   commitment.
// • A renderer cannot leak: it gets a model, and the projection decided what
//   is in it. The Customer renderer CANNOT show a cost, because
//   PresentationModel has no cost field. That is not discipline — it is
//   arithmetic.
//
// ─── THE ONE RULE ─────────────────────────────────────────────────────────
// If a renderer wants to query, the projection is incomplete. Fix the
// projection. A renderer that reaches the database is the beginning of a
// second source of truth, and this codebase has already paid that bill once.
