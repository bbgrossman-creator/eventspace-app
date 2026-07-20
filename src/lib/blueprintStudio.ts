// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT STUDIO (v260 · Object-Centric Authoring & Simulation) — pure
// presentation law. UX-ONLY over the frozen BP-1..BP-8 architecture: no
// storage, no evaluation, no publication change. This module PROJECTS the
// one constitutional content shape into object-centric views, DESCRIBES
// conditions in plain language, and SIMULATES instantiation decisions —
// where every inclusion verdict is computed EXCLUSIVELY by the existing
// evaluation law (evaluateCondition / branchMap from BP-7). There is no
// second rule engine here: this file never indexes into an answer map
// itself (unit-pinned by absence) — it only hands answers to the law
// and renders what the law says. Nothing persists; nothing infers; every
// authoring decision belongs to the user.
// ═══════════════════════════════════════════════════════════════════════════
import {
  BlueprintCondition, PredicateNode, evaluateCondition, branchMap, ParameterAnswers,
} from "./blueprintConditions";
import { conditionParamRefs } from "./blueprintCompose";
import {
  BlueprintContent, BlueprintChapter, BlueprintSection, ComponentEntry, ParameterDecl,
} from "./blueprintContent";

// ── locating an object inside the one shape ─────────────────────────────────

export interface EntryPath { ci: number; si: number; ei: number; }

export function findEntryPath(c: BlueprintContent, entryKey: string): EntryPath | null {
  for (let ci = 0; ci < c.structure.length; ci++) {
    const ch = c.structure[ci];
    for (let si = 0; si < ch.sections.length; si++) {
      const se = ch.sections[si];
      for (let ei = 0; ei < se.entries.length; ei++) {
        if (se.entries[ei].key === entryKey) return { ci, si, ei };
      }
    }
  }
  return null;
}

// ── the object view: everything about one reusable thing, cross-referenced ──

export interface ObjectView {
  entry: ComponentEntry;
  chapter: BlueprintChapter;
  section: BlueprintSection;
  path: EntryPath;
  /** the entry's own condition plus every inherited gate above it. */
  inheritedConditions: { from: "chapter" | "section"; at: string; condition: BlueprintCondition }[];
  /** parameter keys that influence this object (via any governing condition,
   *  own or inherited, including item selections). */
  influencingParams: string[];
  /** declared parameters resolved from those keys — the questions. */
  questions: ParameterDecl[];
  /** section dress for this object's section role, if the portable carries it. */
  sectionDress: unknown;
}

export function objectView(c: BlueprintContent, entryKey: string): ObjectView | null {
  const path = findEntryPath(c, entryKey);
  if (!path) return null;
  const chapter = c.structure[path.ci];
  const section = chapter.sections[path.si];
  const entry = section.entries[path.ei];
  const inherited: ObjectView["inheritedConditions"] = [];
  if (chapter.condition) inherited.push({ from: "chapter", at: chapter.title || chapter.key, condition: chapter.condition });
  if (section.condition) inherited.push({ from: "section", at: section.title || section.key, condition: section.condition });
  const refs = new Set<string>();
  conditionParamRefs(chapter.condition, refs);
  conditionParamRefs(section.condition, refs);
  conditionParamRefs(entry.condition, refs);
  entry.itemSelections.forEach((it) => conditionParamRefs(it.condition, refs));
  const influencingParams = Array.from(refs).sort();
  const questions = c.parameters.filter((p) => refs.has(p.key));
  const dress = section.role && c.presentation
    ? (c.presentation.portable.sectionDress as Record<string, unknown>)[section.role] ?? null
    : null;
  return { entry, chapter, section, path, inheritedConditions: inherited, influencingParams, questions, sectionDress: dress };
}

// ── plain language for conditions — WORDING only, never evaluation ──────────

const PARAM_WORD = (c: BlueprintContent | null, key: string): string =>
  c?.parameters.find((p) => p.key === key)?.label || key;

const PREDICATE_WORD: Record<PredicateNode["predicate"], string> = {
  "equals": "is", "not-equals": "is not",
  "greater-than": "is more than", "at-least": "is at least",
  "less-than": "is under", "at-most": "is at most",
  "one-of": "is one of", "present": "is answered",
};

export function describeCondition(cond: BlueprintCondition, content: BlueprintContent | null): string {
  if ("predicate" in cond) {
    const p = PARAM_WORD(content, cond.param);
    if (cond.predicate === "present") return `${p} ${PREDICATE_WORD["present"]}`;
    const op = Array.isArray(cond.operand) ? cond.operand.join(", ") : String(cond.operand);
    return `${p} ${PREDICATE_WORD[cond.predicate]} ${op}`;
  }
  if ("all" in cond) return cond.all.map((x) => describeCondition(x, content)).join(" AND ");
  if ("any" in cond) return cond.any.map((x) => describeCondition(x, content)).join(" OR ");
  return `NOT (${describeCondition(cond.not, content)})`;
}

// ── the behavior summary — DESCRIPTIVE ONLY, assembled from the shape ───────

export interface BehaviorSummary {
  appears: string;              // condition wording or "always"
  pricing: string;              // the intent form, named
  conditions: string[];         // every governing condition, described
  questions: string[];          // influencing parameter labels
  choices: string[];            // choice group labels on the object
}

const INTENT_WORD: Record<string, string> = {
  "reference-current": "From the catalog at arrival",
  "authored-suggestion": "Suggested",
  "formula": "Per-guest formula",
  "fixed-package": "Fixed (policy-backed)",
};

export function behaviorSummary(c: BlueprintContent, entryKey: string): BehaviorSummary | null {
  const v = objectView(c, entryKey);
  if (!v) return null;
  const governing: string[] = [];
  for (const g of v.inheritedConditions) governing.push(describeCondition(g.condition, c));
  if (v.entry.condition) governing.push(describeCondition(v.entry.condition, c));
  return {
    appears: governing.length === 0 ? "Always (no conditions)" : governing.join("; AND "),
    pricing: v.entry.pricingIntent ? INTENT_WORD[v.entry.pricingIntent.form] ?? v.entry.pricingIntent.form : "No pricing guidance",
    conditions: governing,
    questions: v.questions.map((q) => q.label || q.key),
    choices: v.entry.choiceGroups.map((g) => g.label),
  };
}

// ── SIMULATION — the existing law, run without saving anything ──────────────
// Inclusion is decided by branchMap/evaluateCondition — the exact functions
// BP-3's SQL mirrors (name-set parity pinned since v257). This module adds
// WORDS around those verdicts, never verdicts of its own.

export interface SimLeafExplanation { text: string; held: boolean; }

/** Per-node explanation: each leaf predicate rendered with the law's own
 *  verdict for that leaf (evaluateCondition on the node itself). */
export function explainCondition(
  cond: BlueprintCondition, answers: ParameterAnswers, content: BlueprintContent | null,
): SimLeafExplanation[] {
  if ("predicate" in cond) {
    return [{ text: describeCondition(cond, content), held: evaluateCondition(cond, answers) }];
  }
  if ("all" in cond) return cond.all.flatMap((x) => explainCondition(x, answers, content));
  if ("any" in cond) return cond.any.flatMap((x) => explainCondition(x, answers, content));
  return explainCondition(cond.not, answers, content).map((e) => ({ text: `NOT (${e.text})`, held: !e.held }));
}

export interface SimEntryResult {
  key: string; title: string; included: boolean;
  reasons: SimLeafExplanation[];       // empty when unconditioned
  itemDecisions: { name: string; applies: boolean; reasons: SimLeafExplanation[] }[];
}
export interface SimSectionResult {
  key: string; title: string; included: boolean;
  reasons: SimLeafExplanation[];
  entries: SimEntryResult[];
}
export interface SimulationResult {
  ok: true;
  sections: SimSectionResult[];
  decisions: ReturnType<typeof branchMap>;
}
export interface SimulationBlocked {
  ok: false;
  missing: ParameterDecl[];           // required questions without answers
}

export function simulate(
  c: BlueprintContent, answers: ParameterAnswers,
): SimulationResult | SimulationBlocked {
  // the presence check is the law's own `present` predicate — no direct read
  const missing = c.parameters.filter((p) =>
    p.required && !evaluateCondition({ predicate: "present", param: p.key }, answers));
  if (missing.length > 0) return { ok: false, missing };

  // THE VERDICTS — the law's, wholesale:
  const decisions = branchMap(c.structure, answers);
  const included = new Map<string, boolean>();
  decisions.forEach((d) => included.set(`${d.unit}:${d.at}`, d.included));

  const gate = (unit: string, at: string, parent: boolean): boolean =>
    parent && (included.get(`${unit}:${at}`) ?? true);

  const sections: SimSectionResult[] = [];
  for (const ch of c.structure) {
    const chIn = gate("chapter", ch.key, true);
    for (const se of ch.sections) {
      const seIn = gate("section", se.key, chIn);
      const entries: SimEntryResult[] = [];
      for (const en of se.entries) {
        const enIn = gate("entry", en.key, seIn);
        entries.push({
          key: en.key, title: en.title || "(component)", included: enIn,
          reasons: en.condition ? explainCondition(en.condition, answers, c) : [],
          itemDecisions: en.itemSelections
            .filter((it) => it.condition)
            .map((it) => ({
              name: it.name,
              applies: gate("itemSelection", it.name, enIn),
              reasons: explainCondition(it.condition!, answers, c),
            })),
        });
      }
      sections.push({
        key: se.key, title: se.title || "(section)", included: seIn,
        reasons: se.condition ? explainCondition(se.condition, answers, c) : [],
        entries,
      });
    }
  }
  return { ok: true, sections, decisions };
}

// ── READ-ONLY diagnostics for Review Before Publishing ──────────────────────

export interface Diagnostics {
  unresolvedQuestions: ParameterDecl[];          // required questions a new event must answer
  unusedParameters: ParameterDecl[];             // declared but referenced by no condition
  conditionsMissingQuestions: { at: string; param: string }[];
}

export function reviewDiagnostics(c: BlueprintContent): Diagnostics {
  const referenced = new Set<string>();
  const collect = (cond?: BlueprintCondition) => conditionParamRefs(cond, referenced);
  for (const ch of c.structure) {
    collect(ch.condition);
    for (const se of ch.sections) {
      collect(se.condition);
      for (const en of se.entries) {
        collect(en.condition);
        en.itemSelections.forEach((it) => collect(it.condition));
      }
    }
  }
  const declared = new Set(c.parameters.map((p) => p.key));
  const missing: Diagnostics["conditionsMissingQuestions"] = [];
  Array.from(referenced).forEach((key) => {
    if (!declared.has(key)) missing.push({ at: "conditions", param: key });
  });
  return {
    unresolvedQuestions: c.parameters.filter((p) => p.required),
    // guest_count is always asked by the instantiation act itself, so it is
    // never "unused" even when no condition references it.
    unusedParameters: c.parameters.filter((p) => !referenced.has(p.key) && p.key !== "guest_count"),
    conditionsMissingQuestions: missing,
  };
}
