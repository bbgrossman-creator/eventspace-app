// ═══════════════════════════════════════════════════════════════════════════
// CORE MOVE KINDS — the platform vocabulary (SPEC-002 §1.2 table)
// Each kind: schema (gate), plan (owned mutations), describe (the only diff
// language), invert where the foundation is cheap to lay now.
// ═══════════════════════════════════════════════════════════════════════════
import { registerMoveKind, PlanCtx } from "./registry";
import { Validator } from "../layers/registry";
import { MoveError, MoveProposal } from "./types";

const obj = (i: unknown, kind: string): Record<string, unknown> => {
  if (typeof i !== "object" || i === null) throw new MoveError(kind, "payload must be an object");
  return i as Record<string, unknown>;
};
const str = (o: Record<string, unknown>, f: string, kind: string): string => {
  if (typeof o[f] !== "string" || !(o[f] as string).trim()) throw new MoveError(kind, `${f} must be a non-empty string`);
  return o[f] as string;
};
const num = (o: Record<string, unknown>, f: string, kind: string): number => {
  if (typeof o[f] !== "number" || !isFinite(o[f] as number)) throw new MoveError(kind, `${f} must be a finite number`);
  return o[f] as number;
};
const v = <T>(parse: (i: unknown) => T): Validator<T> => ({ parse });

export function registerCoreMoves(): void {
  registerMoveKind<{ name: string; categoryKey?: string | null; unitPrice?: number | null }>({
    kind: "select", capability: "proposal.configure", boundaries: ["items"],
    schema: v((i) => { const o = obj(i, "select");
      const out: { name: string; categoryKey?: string | null; unitPrice?: number | null } = { name: str(o, "name", "select") };
      if (o.categoryKey !== undefined && o.categoryKey !== null) out.categoryKey = str(o, "categoryKey", "select");
      if (o.unitPrice !== undefined && o.unitPrice !== null) out.unitPrice = num(o, "unitPrice", "select");
      return out; }),
    plan: (p) => [{ boundary: "items", mutation: { op: "add_item", categoryKey: p.categoryKey ?? null, name: p.name, unitPrice: p.unitPrice ?? null } }],
    describe: (p) => `added ${p.name}`,
  });

  registerMoveKind<{ itemId: string; name: string }>({
    kind: "deselect", capability: "proposal.configure", boundaries: ["items"],
    schema: v((i) => { const o = obj(i, "deselect");
      return { itemId: str(o, "itemId", "deselect"), name: str(o, "name", "deselect") }; }),
    plan: (p) => [{ boundary: "items", mutation: { op: "remove_item", itemId: p.itemId } }],
    describe: (p) => `removed ${p.name}`,
  });

  registerMoveKind<{ key: string; value: string }>({
    kind: "set_choice", capability: "proposal.configure", boundaries: ["config"],
    schema: v((i) => { const o = obj(i, "set_choice"); return { key: str(o, "key", "set_choice"), value: str(o, "value", "set_choice") }; }),
    plan: (p) => [{ boundary: "config", mutation: { op: "set_choice", key: p.key, value: p.value } },
                  { boundary: "config", mutation: { op: "mark_customized", dimension: `choice:${p.key}` } }],
    invert: (p, before) => {
      const prev = before.choice(p.key);
      return prev === undefined ? null
        : { kind: "set_choice", instanceId: "", payload: { key: p.key, value: prev }, origin: "facet" };
    },
    describe: (p) => `${p.key.replace(/_/g, " ")} → ${p.value.replace(/_/g, " ")}`,
  });

  registerMoveKind<{ key: string; value: number }>({
    kind: "set_scalar", capability: "proposal.configure", boundaries: ["config"],
    schema: v((i) => { const o = obj(i, "set_scalar"); return { key: str(o, "key", "set_scalar"), value: num(o, "value", "set_scalar") }; }),
    plan: (p) => [{ boundary: "config", mutation: { op: "set_scalar", key: p.key, value: p.value, overridden: true } }],
    describe: (p) => `${p.key.replace(/_/g, " ")}: you set ${p.value}`,
  });

  registerMoveKind<{ key: string }>({
    kind: "clear_override", capability: "proposal.configure", boundaries: ["config"],
    schema: v((i) => ({ key: str(obj(i, "clear_override"), "key", "clear_override") })),
    plan: (p) => [{ boundary: "config", mutation: { op: "clear_override", key: p.key } }],
    describe: (p) => `${p.key.replace(/_/g, " ")}: back to suggested`,
  });

  registerMoveKind<{ slot: string; from: string; to: string }>({
    kind: "substitute", capability: "proposal.configure", boundaries: ["config"],
    schema: v((i) => { const o = obj(i, "substitute");
      return { slot: str(o, "slot", "substitute"), from: str(o, "from", "substitute"), to: str(o, "to", "substitute") }; }),
    plan: (p) => [{ boundary: "config", mutation: { op: "set_substitution", slot: p.slot, from: p.from, to: p.to } }],
    describe: (p) => `${p.slot}: ${p.from} → ${p.to}`,
  });

  // ── apply_scheme: COMPOUND — expands against the copied seed, never the live
  //    definition (SPEC-001 §1.6 invariant 3) ──
  registerMoveKind<{ schemeId: string }>({
    kind: "apply_scheme", capability: "proposal.configure", boundaries: ["config"],
    schema: v((i) => ({ schemeId: str(obj(i, "apply_scheme"), "schemeId", "apply_scheme") })),
    plan: (p) => [{ boundary: "config", mutation: { op: "set_scheme", schemeId: p.schemeId, resetCustomized: true } }],
    compound: (p, ctx: PlanCtx): MoveProposal[] => {
      const scheme = ctx.seed.schemes[p.schemeId];
      if (!scheme) throw new MoveError("apply_scheme", `scheme "${p.schemeId}" not in this instance's seed`);
      const children: MoveProposal[] = [];
      for (const [key, value] of Object.entries(scheme.sets.choices ?? {}))
        children.push({ kind: "scheme_set_choice", instanceId: "", payload: { key, value }, origin: "scheme" });
      return children;
    },
    describe: (p) => `look → ${p.schemeId.replace(/_/g, " ")}`,
  });

  // scheme children set choices WITHOUT marking customized (the scheme did it,
  // not the operator) — a distinct kind so the distinction is in the log
  registerMoveKind<{ key: string; value: string }>({
    kind: "scheme_set_choice", capability: "proposal.configure", boundaries: ["config"],
    schema: v((i) => { const o = obj(i, "scheme_set_choice"); return { key: str(o, "key", "scheme_set_choice"), value: str(o, "value", "scheme_set_choice") }; }),
    plan: (p) => [{ boundary: "config", mutation: { op: "set_choice", key: p.key, value: p.value } }],
    describe: (p) => `· ${p.key.replace(/_/g, " ")}: ${p.value.replace(/_/g, " ")}`,
  });

  registerMoveKind<{ layerKey: string; logicalKey: string }>({
    kind: "suppress_requirement", capability: "proposal.configure", boundaries: ["requirements"],
    schema: v((i) => { const o = obj(i, "suppress_requirement");
      return { layerKey: str(o, "layerKey", "suppress_requirement"), logicalKey: str(o, "logicalKey", "suppress_requirement") }; }),
    plan: (p) => [{ boundary: "requirements", mutation: { op: "suppress", layerKey: p.layerKey, logicalKey: p.logicalKey } }],
    invert: (p) => ({ kind: "restore_requirement", instanceId: "", payload: p, origin: "facet" }),
    describe: (p) => `struck: ${p.logicalKey.split(".").pop()!.replace(/_/g, " ")}`,
  });

  registerMoveKind<{ layerKey: string; logicalKey: string }>({
    kind: "restore_requirement", capability: "proposal.configure", boundaries: ["requirements"],
    schema: v((i) => { const o = obj(i, "restore_requirement");
      return { layerKey: str(o, "layerKey", "restore_requirement"), logicalKey: str(o, "logicalKey", "restore_requirement") }; }),
    plan: (p) => [{ boundary: "requirements", mutation: { op: "restore", layerKey: p.layerKey, logicalKey: p.logicalKey } }],
    describe: (p) => `restored: ${p.logicalKey.split(".").pop()!.replace(/_/g, " ")}`,
  });

  registerMoveKind<{ layerKey: string; name: string; category?: string }>({
    kind: "add_requirement", capability: "proposal.configure", boundaries: ["requirements"],
    schema: v((i) => { const o = obj(i, "add_requirement");
      const out: { layerKey: string; name: string; category?: string } =
        { layerKey: str(o, "layerKey", "add_requirement"), name: str(o, "name", "add_requirement") };
      if (o.category !== undefined) out.category = str(o, "category", "add_requirement");
      return out; }),
    plan: (p) => [{ boundary: "requirements", mutation: { op: "add_manual", layerKey: p.layerKey, name: p.name, category: p.category } }],
    describe: (p) => `requires: ${p.name}`,
  });

  registerMoveKind<Record<string, never>>({
    kind: "reset_all", capability: "proposal.configure", boundaries: ["config"],
    schema: v((i) => { obj(i, "reset_all"); return {}; }),
    plan: (_p, ctx: PlanCtx) => [{ boundary: "config",
      mutation: { op: "reset_to_seed", seed: { scalars: ctx.seed.scalars, choices: ctx.seed.choices } } }],
    describe: () => "reset everything to the definition",
  });

  registerMoveKind<{ dimension: string }>({
    kind: "reset_dimension", capability: "proposal.configure", boundaries: ["config"],
    schema: v((i) => ({ dimension: str(obj(i, "reset_dimension"), "dimension", "reset_dimension") })),
    plan: (p, ctx: PlanCtx) => [{ boundary: "config",
      mutation: { op: "reset_dimension", dimension: p.dimension, seed: { scalars: ctx.seed.scalars, choices: ctx.seed.choices } } }],
    describe: (p) => `reset ${p.dimension.split(":").pop()!.replace(/_/g, " ")} — was the definition's`,
  });

  registerMoveKind<{ layerKey: string; text: string }>({
    kind: "annotate", capability: "proposal.configure", boundaries: ["annotations"],
    schema: v((i) => { const o = obj(i, "annotate");
      return { layerKey: str(o, "layerKey", "annotate"), text: str(o, "text", "annotate") }; }),
    plan: (p) => [{ boundary: "annotations", mutation: { op: "annotate", layerKey: p.layerKey, text: p.text } }],
    describe: (p) => `${p.layerKey} note`,
  });
}
