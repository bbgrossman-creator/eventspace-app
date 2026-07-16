// ═══════════════════════════════════════════════════════════════════════════
// MOVE ENGINE — types (SPEC-002 Rev C §4, as amended Rev D)
//
// Command vs event: MoveProposal is a request awaiting validation;
// RecordedMove is the immutable fact of what applied (persisted with its
// `before` in configuration_moves — Rev C edit 3).
//
// Handlers PLAN; they never write. plan() returns OwnedMutations within the
// kind's declared boundary; the central applier validates the whole batch,
// then apply_move_batch() persists everything in one DB transaction.
// ═══════════════════════════════════════════════════════════════════════════

export type MoveOrigin =
  | "facet" | "canvas" | "scheme"
  | "intent.deterministic" | "intent.model" | "intent.replay";

export interface MoveProposal<K extends string = string> {
  kind: K;
  instanceId: string;
  payload: unknown;
  origin: MoveOrigin;
  parentIx?: number;        // index into the batch; resolved to parent_move_id at persist
  cause?: string;           // intent: the source text span
}

export interface RecordedMove<K extends string = string> {
  id: string;
  kind: K;
  instanceId: string;
  payload: unknown;         // the VALIDATED payload actually applied
  before?: unknown;         // persisted as configuration_moves.before
  origin: MoveOrigin;
  parentMoveId?: string | null;
  cause?: string | null;
  actor?: string | null;
  createdAt: string;
}

// ── Configuration schema v1 (platform-owned; the choices stratum) ───────────

export interface ScalarState {
  value: number;
  overridden: boolean;
  derivation?: { formula: string; suggested: number };
}

export interface ConfigV1 {
  schemeId: string | null;
  /** dimensions the operator changed after a scheme set them */
  customized: string[];
  scalars: Record<string, ScalarState>;
  choices: Record<string, string>;      // service style, etc.
  display: { name?: string };
  substitutions: Record<string, { from: string; to: string }>;
}

export const CONFIG_SCHEMA_VERSION = 1;

export const emptyConfig = (): ConfigV1 => ({
  schemeId: null, customized: [], scalars: {}, choices: {}, display: {}, substitutions: {},
});

/** Read-only view handed to consequence rules and planners. Layers consume
 *  THIS, never the raw payload — opacity holds because exactly one owner
 *  (this module) parses configuration. */
export interface ConfigView {
  readonly schemeId: string | null;
  readonly customized: readonly string[];
  scalar(key: string): ScalarState | undefined;
  choice(key: string): string | undefined;
  substitution(slot: string): { from: string; to: string } | undefined;
  readonly displayName: string | undefined;
}

export function viewOf(c: ConfigV1): ConfigView {
  return {
    schemeId: c.schemeId,
    customized: c.customized,
    scalar: (k) => c.scalars[k],
    choice: (k) => c.choices[k],
    substitution: (s) => c.substitutions[s],
    displayName: c.display.name,
  };
}

// ── Owned mutations (SPEC-002 Rev B change 3) ────────────────────────────────

export type ConfigMutation =
  | { op: "set_choice"; key: string; value: string }
  | { op: "set_scalar"; key: string; value: number; overridden: boolean }
  | { op: "clear_override"; key: string }
  | { op: "set_scheme"; schemeId: string | null; resetCustomized: boolean }
  | { op: "mark_customized"; dimension: string }
  | { op: "set_substitution"; slot: string; from: string; to: string }
  | { op: "clear_substitution"; slot: string }
  | { op: "set_display_name"; name: string | null };

export type ItemMutation =        // routed through the EXISTING item services
  | { op: "add_item"; categoryKey: string | null; name: string; unitPrice?: number | null }
  | { op: "remove_item"; itemId: string }
  | { op: "substitute_item"; itemId: string; name: string };

export type RequirementMutation =
  | { op: "suppress"; layerKey: string; logicalKey: string }
  | { op: "restore"; layerKey: string; logicalKey: string }
  | { op: "add_manual"; layerKey: string; name: string; category?: string; notes?: string };

export type AnnotationMutation = { op: "annotate"; layerKey: string; text: string };

export type OwnedMutation =
  | { boundary: "config"; mutation: ConfigMutation }
  | { boundary: "items"; mutation: ItemMutation }
  | { boundary: "requirements"; mutation: RequirementMutation }
  | { boundary: "annotations"; mutation: AnnotationMutation }
  | { boundary: "layer:self"; layerKey: string; mutation: unknown }; // layer-scoped kinds only

export type Boundary = OwnedMutation["boundary"];

export interface DerivedRequirement {
  layerKey: string;
  logicalKey: string;           // deterministic: "kitchen.live_chef.handwash_station"
  name: string;
  category?: string;
  notes?: string;
}

export class MoveError extends Error {
  constructor(public readonly kind: string, public readonly detail: string) {
    super(`move "${kind}": ${detail}`);
    this.name = "MoveError";
  }
}
