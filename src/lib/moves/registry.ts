// ═══════════════════════════════════════════════════════════════════════════
// MOVE REGISTRY & BATCH PLANNER (SPEC-002 §1.1–1.2, §4; Rev B changes 2, 3, 6)
//
// One vocabulary, many speakers, one planner. Every registration is a pure
// describer: schema (the write gate), plan() (owned mutations), describe()
// (the ONLY source of diff language), optional compound() expansion, optional
// invert() (the foundation for deliberate inverse operations — not built here).
//
// The planner enforces:
//   · whole-batch validation BEFORE any planning result is trusted
//   · boundary enforcement: a "kitchen.…" kind returning a config mutation is
//     refused at validation, before any transaction opens
//   · atomic handoff: the plan compiles to ONE apply_move_batch() call
// ═══════════════════════════════════════════════════════════════════════════
import {
  MoveProposal, MoveOrigin, OwnedMutation, Boundary, ConfigView, ConfigV1,
  ScalarState, viewOf, MoveError, DerivedRequirement, emptyConfig,
} from "./types";
import { Validator } from "../layers/registry";

export interface PlanCtx {
  view: ConfigView;
  /** definition seed (already copied at instantiation; schemes read the copy) */
  seed: {
    schemes: Record<string, SchemeDef>;
    scalars: Record<string, ScalarState>;
    choices: Record<string, string>;
    /** choice dimensions with their option sets — the facet renders THESE,
     *  never hardcoded lists; the definition declares what is choosable. */
    dimensions?: Record<string, { label: string; options: string[] }>;
  };
}

export interface SchemeDef {
  id: string; label: string;
  sets: { choices?: Record<string, string>; props?: { name: string; count: number }[] };
}

export interface MoveKindRegistration<P = unknown> {
  kind: string;
  capability: string;
  boundaries: Boundary[];               // declared ownership; enforced by the planner
  schema: Validator<P>;
  plan(p: P, ctx: PlanCtx): OwnedMutation[];
  compound?(p: P, ctx: PlanCtx): MoveProposal[];
  invert?(p: P, before: ConfigView): MoveProposal | null;
  describe(p: P): string;
}

const kinds = new Map<string, MoveKindRegistration<unknown>>();

export function registerMoveKind<P>(r: MoveKindRegistration<P>): void {
  if (kinds.has(r.kind)) throw new MoveError(r.kind, "already registered");
  const nsOk = /^([a-z][a-z0-9_]*)(\.[a-z][a-z0-9_]*)?$/.test(r.kind);
  if (!nsOk) throw new MoveError(r.kind, "kind must be snake_case, optionally layer-namespaced");
  // layer-scoped kinds may declare ONLY their own layer boundary
  if (r.kind.includes(".")) {
    const bad = r.boundaries.filter((b) => b !== "layer:self");
    if (bad.length) throw new MoveError(r.kind, `layer-scoped kind may only declare "layer:self" (declared: ${bad.join(",")})`);
  }
  kinds.set(r.kind, r as MoveKindRegistration<unknown>);
}

export const moveRegistry = {
  get: (k: string) => kinds.get(k),
  all: () => Array.from(kinds.values()),
  _resetForTests: () => kinds.clear(),
};

// ── The batch planner ─────────────────────────────────────────────────────────

export interface PlannedBatch {
  proposals: MoveProposal[];            // fully expanded (compounds flattened, parentIx set)
  mutations: OwnedMutation[];           // everything the transaction will apply
  descriptions: string[];               // business language, from describe() only
}

export function planBatch(
  proposals: MoveProposal[],
  ctx: PlanCtx,
  can: (capability: string) => boolean
): PlannedBatch {
  // 1. expand compounds (one level; children may not themselves be compound)
  const expanded: MoveProposal[] = [];
  for (const p of proposals) {
    const reg = kinds.get(p.kind);
    if (!reg) throw new MoveError(p.kind, "unknown move kind — not registered");
    expanded.push(p);
    if (reg.compound) {
      const parentIx = expanded.length - 1;
      for (const child of reg.compound(reg.schema.parse(p.payload), ctx)) {
        const childReg = kinds.get(child.kind);
        if (!childReg) throw new MoveError(child.kind, "unknown child move kind");
        if (childReg.compound) throw new MoveError(child.kind, "compound moves may not nest");
        expanded.push({ ...child, parentIx, origin: p.origin });
      }
    }
  }

  // 2. validate the ENTIRE expanded set before trusting any plan (atomicity:
  //    validation over the whole set precedes mutation — SPEC-002 §1.2)
  const validated = expanded.map((p) => {
    const reg = kinds.get(p.kind)!;
    if (!can(reg.capability)) throw new MoveError(p.kind, `capability "${reg.capability}" not available`);
    return { p, reg, payload: reg.schema.parse(p.payload) };
  });

  // 3. plan, enforcing every mutation stays inside its kind's declared boundary
  const mutations: OwnedMutation[] = [];
  const descriptions: string[] = [];
  for (const { p, reg, payload } of validated) {
    const planned = reg.plan(payload, ctx);   // parents AND children plan —
    // a compound parent may carry its own mutation (apply_scheme carries
    // set_scheme). Skipping parent plans lost the scheme id; caught by the
    // real browser (test 17), half-missed by a unit test that asserted the
    // children's effects but never the parent's.
    for (const m of planned) {
      if (!reg.boundaries.includes(m.boundary))
        throw new MoveError(p.kind, `mutation crossed its boundary: "${m.boundary}" not in [${reg.boundaries.join(",")}]`);
      if (m.boundary === "layer:self" && p.kind.split(".")[0] !== (m as { layerKey: string }).layerKey)
        throw new MoveError(p.kind, "layer-scoped mutation targeted a different layer");
      mutations.push(m);
    }
    descriptions.push(reg.describe(payload));
  }
  return { proposals: expanded.map((p) => ({ ...p, payload: p.payload })), mutations, descriptions };
}

// ── Pure config reducer: the mutations' meaning, in one place ────────────────

export function applyConfigMutations(config: ConfigV1, mutations: OwnedMutation[]): ConfigV1 {
  const c: ConfigV1 = JSON.parse(JSON.stringify(config));
  for (const m of mutations) {
    if (m.boundary !== "config") continue;
    const mu = m.mutation;
    switch (mu.op) {
      case "set_choice": c.choices[mu.key] = mu.value; break;
      case "set_scalar": {
        const prev = c.scalars[mu.key];
        c.scalars[mu.key] = { value: mu.value, overridden: mu.overridden, derivation: prev?.derivation };
        break;
      }
      case "clear_override": {
        const s = c.scalars[mu.key];
        if (s?.derivation) c.scalars[mu.key] = { ...s, value: s.derivation.suggested, overridden: false };
        break;
      }
      case "set_scheme":
        c.schemeId = mu.schemeId;
        if (mu.resetCustomized) c.customized = [];
        break;
      case "mark_customized":
        if (!c.customized.includes(mu.dimension)) c.customized.push(mu.dimension);
        break;
      case "set_substitution": c.substitutions[mu.slot] = { from: mu.from, to: mu.to }; break;
      case "clear_substitution": delete c.substitutions[mu.slot]; break;
      case "set_display_name": c.display.name = mu.name ?? undefined; break;
      case "reset_to_seed":
        c.schemeId = null; c.customized = []; c.substitutions = {}; c.display = {};
        c.scalars = JSON.parse(JSON.stringify(mu.seed.scalars));
        c.choices = { ...mu.seed.choices };
        break;
      case "reset_dimension": {
        const [t, key] = mu.dimension.split(":");
        if (t === "choice" && key) {
          if (mu.seed.choices[key] !== undefined) c.choices[key] = mu.seed.choices[key];
          else delete c.choices[key];
        }
        if (t === "scalar" && key) {
          if (mu.seed.scalars[key]) c.scalars[key] = JSON.parse(JSON.stringify(mu.seed.scalars[key]));
          else delete c.scalars[key];
        }
        if (t === "scheme") { c.schemeId = null; c.customized = []; }
        if (t === "sub" && key) delete c.substitutions[key];
        if (t === "display") c.display = {};
        c.customized = c.customized.filter((d) => d !== mu.dimension);
        break;
      }
    }
  }
  return c;
}

// ── Consequence recompute (logical keys; SPEC-002 Rev B change 4) ───────────

export type ConsequenceRule = (view: ConfigView) => DerivedRequirement[];

// Rules are BOUND to the layer that registered them (SPEC-001 §1.6 invariant 2:
// the registration owns everything about its layer — including what a choice
// means for it). One choice fans into many layers by MANY layers each reacting,
// never by one layer writing another's domain. A rule emitting a row tagged
// with a foreign layer_key is refused at recompute, before persistence.
const consequenceRules: { layerKey: string; rule: ConsequenceRule }[] = [];
export function registerConsequenceRule(layerKey: string, rule: ConsequenceRule): void {
  consequenceRules.push({ layerKey, rule });
}
export function recomputeConsequences(config: ConfigV1): DerivedRequirement[] {
  const view = viewOf(config);
  const out: DerivedRequirement[] = [];
  const seen = new Set<string>();
  for (const { layerKey, rule } of consequenceRules) for (const d of rule(view)) {
    if (d.layerKey !== layerKey)
      throw new MoveError("consequences",
        `rule registered by "${layerKey}" emitted into "${d.layerKey}" — a layer declares what a choice means FOR IT, never for another layer`);
    if (!d.logicalKey.startsWith(layerKey + "."))
      throw new MoveError("consequences", `logical key "${d.logicalKey}" must be namespaced under its layer`);
    const k = `${d.layerKey}::${d.logicalKey}`;
    if (seen.has(k)) throw new MoveError("consequences", `duplicate logical key ${k}`);
    seen.add(k); out.push(d);
  }
  return out;
}
export function _resetConsequenceRulesForTests(): void { consequenceRules.length = 0; }

// ── Divergence: deterministic state-vs-seed; never narrated from the log ────

export interface DivergenceLine {
  dimension: string;                 // kind:identifier (READINESS F-3 grammar)
  text: string;
  from?: unknown;                    // v208: structured values for citations
  to?: unknown;
}
export function computeDivergence(current: ConfigV1, seed: PlanCtx["seed"]): DivergenceLine[] {
  const lines: DivergenceLine[] = [];
  for (const [k, v] of Object.entries(current.choices)) {
    const s = seed.choices[k];
    if (s !== undefined && s !== v) lines.push({ dimension: `choice:${k}`, text: `${k}: ${s} → ${v}`, from: s, to: v });
    if (s === undefined) lines.push({ dimension: `choice:${k}`, text: `${k}: set to ${v}`, to: v });
  }
  for (const [k, v] of Object.entries(current.scalars)) {
    if (v.overridden) {
      const sug = v.derivation ? ` · suggested ${v.derivation.suggested}` : "";
      lines.push({ dimension: `scalar:${k}`, text: `${k}: you set ${v.value}${sug}`, from: v.derivation?.suggested, to: v.value });
    }
  }
  if (current.schemeId !== null) {
    lines.push({ dimension: "scheme", text: `look: ${current.schemeId}${current.customized.length ? ` · ${current.customized.length} customized` : ""}` });
  }
  for (const [slot, sub] of Object.entries(current.substitutions))
    lines.push({ dimension: `sub:${slot}`, text: `${slot}: ${sub.from} → ${sub.to}` });
  if (current.display.name) lines.push({ dimension: "display", text: `shown as "${current.display.name}"` });
  return lines;
}
