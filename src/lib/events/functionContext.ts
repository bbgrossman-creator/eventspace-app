// ═══════════════════════════════════════════════════════════════════════════
// v312 · FUNCTION CONTEXT — the addressing law, as pure functions.
//
// Deliberately free of every import. The law that decides which Function a
// Product Event Workspace is narrowed to is the one piece of v312 that must be
// provable on its own, so it is kept where nothing — not supabase, not React,
// not the route — has to be stood up to exercise it.
//
// It is also what makes "no remembered default" structural rather than a
// promise: this module has no storage to read, and the shell takes its context
// as a parameter, so there is no code path through which a preference could be
// remembered.
// ═══════════════════════════════════════════════════════════════════════════

/** A separately identifiable operating part within the Event. */
export interface ProductFunction {
  /** public.engagement_occurrence.id — stable Function identity. */
  function_id: string;
  /** public.engagement_occurrence.ordinal — the stable handle, never the date. */
  ordinal: number;
  /** public.occurrence_profile.display_name, latest revision. */
  name: string | null;
  /** public.occurrence_profile.occasion_kind. */
  occasion_kind: string | null;
  /** public.engagement_occurrences().active. */
  active: boolean;
  /** public.engagement_occurrence.open_basis. */
  open_basis: string;
  /**
   * public.event.id for this Function, or null when no execution record exists.
   * NULL is a lawful, meaningful state: the Function exists and is named, but
   * has not been operationally released. It is never a Function we hide.
   */
  operational_event_ref: string | null;
}

/** "All Functions", or one Function's stable id. */
export type FunctionContext = "ALL" | string;
export const ALL_FUNCTIONS: FunctionContext = "ALL";

/**
 * Does this Event offer a Function choice?
 *
 * A lens is a choice between Functions, so it exists only when there is a choice
 * to make. One Function is not a lens — "All Functions" and the single Function
 * would be two labels for one identical view. The Function's own facts are still
 * shown, because those are facts, not a selector.
 */
export function functionLensApplies(functions: ProductFunction[]): boolean {
  return functions.length >= 2;
}

/**
 * THE ADDRESSING LAW.
 *
 *   · no context in the address                 → ALL
 *   · an explicit, valid Function               → that Function
 *   · unknown or foreign Function identity      → ALL (safe, never an error page)
 *   · any context at all when no lens applies   → ALL
 *
 * There is deliberately no fourth case. A stored or personal remembered default
 * is not implemented anywhere in v312, and no storage API is read here — which
 * is what makes it impossible rather than merely unused.
 */
export function resolveFunctionContext(
  functions: ProductFunction[],
  requested: string | null | undefined,
): FunctionContext {
  if (!requested || requested === ALL_FUNCTIONS) return ALL_FUNCTIONS;
  if (!functionLensApplies(functions)) return ALL_FUNCTIONS;
  return functions.some((f) => f.function_id === requested) ? requested : ALL_FUNCTIONS;
}

/** The Function a context names, or null under All Functions. */
export function selectedFunction(
  functions: ProductFunction[],
  context: FunctionContext,
): ProductFunction | null {
  if (context === ALL_FUNCTIONS) return null;
  return functions.find((f) => f.function_id === context) ?? null;
}

/**
 * The operator-facing label for a Function.
 *
 * Falls back to the ordinal rather than to a date, and never invents a name:
 * "Function 2" is honest about what is known; a date would assert an identity
 * the record does not carry — v292a1 keeps the ordinal as the stable handle
 * precisely because "the date is an amendable fact, so it cannot identify the
 * thing whose date it is."
 */
export function functionLabel(f: ProductFunction): string {
  return f.name?.trim() || `Function ${f.ordinal}`;
}
