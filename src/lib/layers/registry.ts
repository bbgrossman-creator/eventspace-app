// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT KNOWLEDGE LAYERS — types & registry
// Implements SPEC-001 Rev C §4 (model) and §5 (registry interfaces).
//
// The invariants this file EXISTS to enforce (SPEC-001 §1.6):
//   1. Layer payloads are opaque to the platform — only a registration owns
//      its internal schema. Nothing outside a registration file may reach
//      into a layer's data. (This module never inspects payloads; it only
//      routes them through the owning registration's validator.)
//   2. The registration owns everything: schema, validation, migration,
//      rendering, projection, defaults.
//   3. Adding a layer = one registration file + one import in index.ts.
//      If a new layer requires touching THIS file, the registry has failed.
//   4. No switch on layer_key anywhere, ever. Behavior is looked up, not
//      branched.
// ═══════════════════════════════════════════════════════════════════════════

// ── Model (SPEC-001 §4) ──────────────────────────────────────────────────────

/**
 * A definition is a CONFIGURABLE FAMILY, never a frozen composition
 * (SPEC-001 §1.4). It identifies the reusable concept; instances choose their
 * own items, props, staffing, and everything else. Definition-layer data is
 * seed knowledge — copied at instantiation, then owned by the instance.
 */
export interface ComponentDefinition {
  id: string;
  tenantId: string | null;              // null = EventCore global starter
  name: string;
  description: string | null;
  status: "implicit" | "curated";       // 'curated' only via ceremony — never set by machinery
  archivedAt: string | null;            // definitions archive; they never supersede (§1.4)
  provenance: {
    createdByProcess: "v200_migration" | "auto_title" | "fork" | "authored" | "promotion";
    sourceDefinitionId: string | null;  // fork/promotion origin — the family pointer
    promotedBy?: string;
    promotedAt?: string;
  };
}

export interface ComponentLayerRow {
  id: string;
  ownerId: string;                      // definition_id or component_id
  ownerKind: "definition" | "instance";
  layerKey: string;
  schemaVersion: number;
  data: unknown;                        // OPAQUE here — typed only past the registry gate
  supersededBy?: string | null;         // definition layers: revision chain (KA §7, Time)
  copiedFrom?: string | null;           // instance layers: the exact source revision
}

// ── Validation contract ──────────────────────────────────────────────────────
// Structural, dependency-free. If zod is adopted, a zod schema satisfies this
// shape via { parse } directly — swap is a type import, not a rewrite.

export interface Validator<T> {
  /** Returns the typed value or throws LayerValidationError. */
  parse(input: unknown): T;
}

export class LayerValidationError extends Error {
  constructor(public readonly layerKey: string, public readonly detail: string) {
    super(`layer "${layerKey}": ${detail}`);
    this.name = "LayerValidationError";
  }
}

// ── Registration (SPEC-001 §5) ───────────────────────────────────────────────

export interface LayerRegistration<T = unknown> {
  key: string;                          // "kitchen", "warehouse", …
  capability: string;                   // "production.kitchen" — declared, not derived
  schemaVersion: number;                // current version; writes must be at this version
  schema: Validator<T>;                 // the ONLY write-side gate
  /** Pure vN→vN+1 upgraders; read path applies lazily until current. */
  migrations: Record<number, (old: unknown) => unknown>;
  emptyState: () => T;
  label: { singular: string; icon: string };
  // Consumption is declared here too; no lens or feature ever switches on key.
  // (Optional in SPEC-001; the Production lens plugs in via SPEC-002.)
  lens?: unknown;
  libraryProjection?: (def: ComponentDefinition, layer: T) => Record<string, unknown>;
}

export interface CanFn { (capability: string): boolean; }

// ── The registry ─────────────────────────────────────────────────────────────

const registrations = new Map<string, LayerRegistration<unknown>>();

export function registerLayer<T>(r: LayerRegistration<T>): void {
  if (registrations.has(r.key)) {
    // Duplicate registration is a build/boot error, never a silent overwrite:
    // two owners of one schema is a duplicated source of truth.
    throw new Error(`layer "${r.key}" is already registered`);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(r.key)) {
    throw new Error(`layer key "${r.key}" must be snake_case ascii`);
  }
  registrations.set(r.key, r as LayerRegistration<unknown>);
}

export const layerRegistry = {
  get(key: string): LayerRegistration<unknown> | undefined {
    return registrations.get(key);
  },
  all(): LayerRegistration<unknown>[] {
    // Array.from, not [...spread]: Map iterators need downlevelIteration or an
    // es2015+ target, and this module must compile under the app's own
    // tsconfig — which is the only tsconfig that counts.
    return Array.from(registrations.values());
  },
  /** The capability intersection (KA §10): what THIS tenant may see/edit. */
  available(can: CanFn): LayerRegistration<unknown>[] {
    return Array.from(registrations.values()).filter((r) => can(r.capability));
  },
  /** Test seam only. */
  _resetForTests(): void {
    registrations.clear();
  },
};

// ── The single write gate (SPEC-001 §5: one insert path, through parse) ─────

export function validateLayerWrite(
  key: string,
  data: unknown,
  can: CanFn
): { layerKey: string; schemaVersion: number; data: unknown } {
  const reg = registrations.get(key);
  if (!reg) throw new LayerValidationError(key, "unknown layer key — not registered");
  if (!can(reg.capability)) {
    throw new LayerValidationError(key, `capability "${reg.capability}" not available`);
  }
  const parsed = reg.schema.parse(data);   // throws LayerValidationError on bad payloads
  return { layerKey: key, schemaVersion: reg.schemaVersion, data: parsed };
}

// ── The lazy read-side upgrader (SPEC-001 §5: migrations owned by the layer) ─

export function upgradeLayerData(
  key: string,
  storedVersion: number,
  stored: unknown
): { schemaVersion: number; data: unknown } {
  const reg = registrations.get(key);
  if (!reg) throw new LayerValidationError(key, "unknown layer key — not registered");
  let v = storedVersion;
  let d = stored;
  while (v < reg.schemaVersion) {
    const step = reg.migrations[v];
    if (!step) throw new LayerValidationError(key, `no migration from schema v${v}`);
    d = step(d);
    v += 1;
  }
  return { schemaVersion: v, data: reg.schema.parse(d) };
}
