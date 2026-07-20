// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT CONDITIONS (v257 · BP-7) — pure law, zero imports.
//
// THE CONSTITUTIONAL DISTINCTION, preserved by shape:
//   parameter — a QUESTION answered at instantiation (§10, BP-2/BP-3);
//   condition — a PREDICATE over parameter ANSWERS, evaluated exactly once
//               during BP-3's act; it never asks, never chooses for a
//               customer, and never survives into the Design;
//   choice    — content presented for later HUMAN selection (choiceGroups).
//
// CLOSED PREDICATE SET — nothing programmable: no expressions, no scripts,
// no user code. Each predicate declares its admitted parameter types, its
// operand shape, deterministic evaluation, normalization, and named
// failures. Composition is closed and bounded: all · any · not, with an
// explicit maximum depth and predicate count; cycles are impossible by
// shape (JSON has no references) and depth is refused, not recovered.
//
// ATTACHMENT IS CLOSED: chapter · section · component entry · item
// selection. Nothing else — not presentation, not pricing intent, not
// parameters, not the root (all named refusals). The condition field is
// COPIED authored structure (BP-2 §6) whose RESOLUTION happens once, at
// instantiation, into the branch map the citation records.
// ═══════════════════════════════════════════════════════════════════════════

// ── the vocabulary ──────────────────────────────────────────────────────────

export const CONDITION_PREDICATES = [
  "equals", "not-equals", "greater-than", "at-least", "less-than", "at-most",
  "one-of", "present",
] as const;
export type ConditionPredicate = (typeof CONDITION_PREDICATES)[number];

/** Which parameter types admit which predicates (the admission matrix). */
export const PREDICATE_ADMISSION: Record<ConditionPredicate, ReadonlyArray<"count" | "choice" | "flag">> = {
  "equals":       ["count", "choice", "flag"],
  "not-equals":   ["count", "choice", "flag"],
  "greater-than": ["count"],
  "at-least":     ["count"],
  "less-than":    ["count"],
  "at-most":      ["count"],
  "one-of":       ["count", "choice"],
  "present":      ["count", "choice", "flag"],
};

export interface PredicateNode {
  predicate: ConditionPredicate;
  /** The parameter's STABLE authored key — never a label, never an index. */
  param: string;
  /** Typed literal operand; absent for `present`. */
  operand?: number | string | boolean | Array<number | string>;
}
export type BlueprintCondition =
  | PredicateNode
  | { all: BlueprintCondition[] }
  | { any: BlueprintCondition[] }
  | { not: BlueprintCondition };

export const CONDITION_MAX_DEPTH = 3;
export const CONDITION_MAX_PREDICATES = 10;

/** The closed attachment points (unit kinds), for messages and walks. */
export const CONDITION_UNITS = ["chapter", "section", "entry", "itemSelection"] as const;

export const CONDITION_FAILURES = [
  "CONDITION_UNKNOWN_PREDICATE", "CONDITION_PARAM_MISSING",
  "CONDITION_TYPE_UNSUPPORTED", "CONDITION_OPERAND_INVALID",
  "CONDITION_EMPTY_GROUP", "CONDITION_DEPTH_EXCEEDED",
  "CONDITION_COUNT_EXCEEDED", "CONDITION_DUPLICATE_PARAM_KEY",
] as const;
export type ConditionFailure = (typeof CONDITION_FAILURES)[number];

export interface ConditionProblem { failure: ConditionFailure; at: string; detail?: string; }

// ── validation — refuses by name, repairs nothing ───────────────────────────

interface ParamDecl { key: string; type: "count" | "choice" | "flag"; options?: string[]; required?: boolean; }

const isNode = (c: unknown): c is PredicateNode =>
  typeof c === "object" && c !== null && "predicate" in (c as Record<string, unknown>);

function operandValid(p: ConditionPredicate, type: ParamDecl["type"], operand: unknown): boolean {
  if (p === "present") return operand === undefined;
  if (p === "one-of") {
    if (!Array.isArray(operand) || operand.length === 0) return false;
    return type === "count"
      ? operand.every((x) => typeof x === "number" && isFinite(x))
      : operand.every((x) => typeof x === "string");
  }
  if (type === "count") {
    return typeof operand === "number" && isFinite(operand);
  }
  if (type === "choice") return (p === "equals" || p === "not-equals") && typeof operand === "string";
  return (p === "equals" || p === "not-equals") && typeof operand === "boolean";
}

export function validateCondition(
  cond: unknown, params: ParamDecl[], at: string,
): ConditionProblem[] {
  const problems: ConditionProblem[] = [];
  const byKey = new Map(params.map((p) => [p.key, p]));
  const seen = new Set<string>();
  for (const p of params) {
    if (seen.has(p.key)) problems.push({ failure: "CONDITION_DUPLICATE_PARAM_KEY", at, detail: p.key });
    seen.add(p.key);
  }
  let count = 0;
  const walk = (c: unknown, depth: number): void => {
    if (depth > CONDITION_MAX_DEPTH) {
      problems.push({ failure: "CONDITION_DEPTH_EXCEEDED", at, detail: `max ${CONDITION_MAX_DEPTH}` });
      return;
    }
    if (isNode(c)) {
      count++;
      if (count > CONDITION_MAX_PREDICATES) {
        problems.push({ failure: "CONDITION_COUNT_EXCEEDED", at, detail: `max ${CONDITION_MAX_PREDICATES}` });
        return;
      }
      if (!CONDITION_PREDICATES.includes(c.predicate)) {
        problems.push({ failure: "CONDITION_UNKNOWN_PREDICATE", at, detail: String(c.predicate) });
        return;
      }
      const decl = byKey.get(c.param);
      if (!decl) { problems.push({ failure: "CONDITION_PARAM_MISSING", at, detail: c.param }); return; }
      if (!PREDICATE_ADMISSION[c.predicate].includes(decl.type)) {
        problems.push({ failure: "CONDITION_TYPE_UNSUPPORTED", at, detail: `${c.predicate} over ${decl.type} (${c.param})` });
        return;
      }
      if (!operandValid(c.predicate, decl.type, c.operand)) {
        problems.push({ failure: "CONDITION_OPERAND_INVALID", at, detail: `${c.predicate} on ${c.param}` });
      }
      return;
    }
    const o = c as Record<string, unknown>;
    if (typeof c === "object" && c !== null && ("all" in o || "any" in o)) {
      const arr = (o["all"] ?? o["any"]) as unknown;
      if (!Array.isArray(arr) || arr.length === 0) {
        problems.push({ failure: "CONDITION_EMPTY_GROUP", at });
        return;
      }
      arr.forEach((x) => walk(x, depth + 1));
      return;
    }
    if (typeof c === "object" && c !== null && "not" in o) { walk(o["not"], depth + 1); return; }
    problems.push({ failure: "CONDITION_UNKNOWN_PREDICATE", at, detail: "unrecognized condition shape" });
  };
  walk(cond, 1);
  return problems;
}

// ── evaluation — deterministic, total over valid input ──────────────────────

export type ParameterAnswers = Record<string, number | string | boolean | null | undefined>;

/** Normalization: count answers must arrive numeric (the act types them);
 *  choice answers compare after trim; flags compare strictly. `present`
 *  means answered (non-null, non-undefined, non-empty-string). */
export function evaluateCondition(cond: BlueprintCondition, answers: ParameterAnswers): boolean {
  if (isNode(cond)) {
    const raw = answers[cond.param];
    if (cond.predicate === "present") {
      return raw !== null && raw !== undefined && raw !== "";
    }
    if (raw === null || raw === undefined) return false;
    const a = typeof raw === "string" ? raw.trim() : raw;
    switch (cond.predicate) {
      case "equals": return a === (typeof cond.operand === "string" ? cond.operand.trim() : cond.operand);
      case "not-equals": return a !== (typeof cond.operand === "string" ? cond.operand.trim() : cond.operand);
      case "greater-than": return typeof a === "number" && a > (cond.operand as number);
      case "at-least": return typeof a === "number" && a >= (cond.operand as number);
      case "less-than": return typeof a === "number" && a < (cond.operand as number);
      case "at-most": return typeof a === "number" && a <= (cond.operand as number);
      case "one-of": return (cond.operand as Array<number | string>).some((x) =>
        (typeof x === "string" ? x.trim() : x) === a);
    }
  }
  const o = cond as { all?: BlueprintCondition[]; any?: BlueprintCondition[]; not?: BlueprintCondition };
  if (o.all) return o.all.every((c) => evaluateCondition(c, answers));
  if (o.any) return o.any.some((c) => evaluateCondition(c, answers));
  if (o.not) return !evaluateCondition(o.not, answers);
  return false;
}

// ── the branch map — every conditioned unit, decided once ───────────────────

export interface BranchDecision {
  unit: (typeof CONDITION_UNITS)[number];
  at: string;              // the unit's authored key
  included: boolean;
  condition: BlueprintCondition;
}

/** Walks content-shaped structure and decides every conditioned unit.
 *  Structure typing stays loose here (the shape module owns the types);
 *  the walk reads only `key`, `condition`, and the child arrays. */
export function branchMap(
  structure: Array<{ key: string; condition?: BlueprintCondition;
    sections: Array<{ key: string; condition?: BlueprintCondition;
      entries: Array<{ key: string; condition?: BlueprintCondition;
        itemSelections: Array<{ name: string; condition?: BlueprintCondition }> }> }> }>,
  answers: ParameterAnswers,
): BranchDecision[] {
  const out: BranchDecision[] = [];
  for (const ch of structure) {
    if (ch.condition) out.push({ unit: "chapter", at: ch.key, included: evaluateCondition(ch.condition, answers), condition: ch.condition });
    for (const se of ch.sections) {
      if (se.condition) out.push({ unit: "section", at: se.key, included: evaluateCondition(se.condition, answers), condition: se.condition });
      for (const en of se.entries) {
        if (en.condition) out.push({ unit: "entry", at: en.key, included: evaluateCondition(en.condition, answers), condition: en.condition });
        for (const it of en.itemSelections) {
          if (it.condition) out.push({ unit: "itemSelection", at: it.name, included: evaluateCondition(it.condition, answers), condition: it.condition });
        }
      }
    }
  }
  return out;
}
