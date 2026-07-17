// ═══════════════════════════════════════════════════════════════════════════
// LENS SECTIONS (SPEC-003 §3) — the opacity-preserving joint of the pipeline:
//
//   Objects → Layers → LAYER CONTRIBUTIONS → Lens Projection → Renderer
//
// A lens must render layer content it is FORBIDDEN to parse (SPEC-001 §1.6
// invariant 1). Resolution: the layer renders itself, into this lens-neutral
// shape. The lens composes; the layer parses.
//
// THIS SHAPE IS AN EPHEMERAL CONTRACT, NOT A SCHEMA — it carries no version
// field, deliberately (SPEC-003 Rev A): it is derived per render and never
// stored, so there are no old rows and no migration problem, and a version
// field would imply persistence and invite someone to persist it. The shape
// evolves by amendment to SPEC-003 with an atomic code change to its
// producers (layer registrations) and its consumer (the sheet frame), which
// deploy together. It becomes a versioned, PUBLISHED surface in exactly one
// future: the tenant-defined-lenses reservation resolving in favor — a cost
// recorded there, not paid here.
//
// No React, no queries: this module is pure and DOM-free, like the registry.
// ═══════════════════════════════════════════════════════════════════════════

export interface LensSectionRow {
  label: string;
  value: string;
  /** The explanation the renderer will surface. A renderer cannot invent a
   *  why it wasn't given (SPEC-003 §2 rule 3; KA §9: everything is
   *  explainable). Optional because identity rows ("Role — Sushi chef")
   *  state facts that ARE their own explanation. */
  why?: string;
}

export interface LensSection {
  /** Stable within the producing registration — for tests and anchors. */
  id: string;
  title: string;
  rows: LensSectionRow[];
  /** The layer's annotation, if any — rendered as the different material
   *  (left-ruled, never interleaved with structure; Pre-work II §7). */
  note?: string | null;
  /** Honest absence: what isn't here and, when derivable, what act would
   *  create it. Empty is information (SPEC-003 §5). */
  missing?: string | null;
}

/** Context a contribution may read. Deliberately small: a contribution
 *  projects its OWN payload; facts about the event travel in the payload or
 *  arrive via the lens's projection, never through a side channel. */
export interface LensSectionCtx {
  /** Guest count, when the caller has it — the one cross-cutting number
   *  operational content routinely scales by. Null when unknown; a
   *  contribution renders honestly without it. */
  guests: number | null;
}

/** The contribution a LayerRegistration declares (SPEC-001 §5's reserved
 *  socket, made concrete): how this layer's content is seen, declared
 *  beside how it is stored — same owner, same file (SPEC-003 §3 pipeline:
 *  the registration owns the layer AND its contribution). */
export interface LayerLensContribution<T> {
  sections(payload: T, ctx: LensSectionCtx): LensSection[];
}
