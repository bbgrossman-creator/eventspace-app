// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT INSTANTIATION — pure law (v253 · BP-3).
// THE ACT lives in the database (instantiate_blueprint — one transaction,
// one coherent snapshot, all or nothing; server-proven I-1..I-9). This
// module holds only what the surface needs: the CLOSED conflict-kind set
// and the parser that turns the act's refusal into a staged, named list.
// Application never guesses; refusals are displayed, never repaired.
//
// NEGATIVE LAW pins (unit-grepped, v253 suite): no verb exists that
// refreshes a design from its source, keeps one following the other, or
// re-executes the act as history — and no live edge or legacy v182
// dependency exists in this module, the data layer, or the migration.
// ═══════════════════════════════════════════════════════════════════════════

/** The closed set — every refusal the act can stage. A kind outside this
 *  set arriving from the server is itself displayed verbatim (honesty
 *  over machinery), but the set below is the constitutional vocabulary. */
export const CONFLICT_KINDS = [
  "NOT_PUBLISHED", "IDENTITY_RETIRED", "PARAMETER_REQUIRED",
  // v257 AMENDMENT (BP-7): the v253 conditions reservation is retired —
  // the complete path exists; the vocabulary gains these kinds.
  "PARAMETER_INVALID", "CONDITION_LOCATION_BARRED",
  "CONDITION_UNKNOWN_PREDICATE", "CONDITION_PARAM_MISSING",
  "CONDITION_TYPE_UNSUPPORTED", "CONDITION_OPERAND_INVALID",
  "CONDITION_EMPTY_GROUP", "CONDITION_DEPTH_EXCEEDED",
  "CONDITION_COUNT_EXCEEDED", "CONDITION_DUPLICATE_PARAM_KEY",
  "SECTION_ROLE_REQUIRED", "SECTION_ROLE_UNKNOWN",
  "DEFINITION_REQUIRED", "DEFINITION_UNAVAILABLE",
  "CONFIG_SCHEME_GONE", "CONFIG_KEY_GONE", "CONFIG_OPTION_GONE",
  "FIXED_PRICE_POLICY_MISSING",
  "DRESS_NO_MATCH", "DRESS_AMBIGUOUS",
] as const;
export type ConflictKind = (typeof CONFLICT_KINDS)[number];

export interface InstantiationConflict {
  kind: string;
  at?: string;
  role?: string;
  key?: string;
  scheme?: string;
  value?: string;
  definition?: string;
  detail?: string;
}

const MARKER = "BLUEPRINT_CONFLICTS:";

/** Parse the act's refusal message into the staged list. Returns null when
 *  the error is not a conflict refusal (a plain failure travels as-is). */
export function parseConflicts(message: string): InstantiationConflict[] | null {
  const i = message.indexOf(MARKER);
  if (i < 0) return null;
  const raw = message.slice(i + MARKER.length).trim();
  try {
    const arr = JSON.parse(raw) as InstantiationConflict[];
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

export interface InstantiationResult {
  version_id: string;
  proposal_id: string;
  fingerprint: string;
  snapshot_at: string;
  citation: string;
}
