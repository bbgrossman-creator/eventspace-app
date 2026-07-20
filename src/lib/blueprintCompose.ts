// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT COMPOSITION (v258 · BP-8) — pure law. THE ACT: an author
// deliberately COPIES selected lawful authored material from an EXACT
// source revision into a destination DRAFT. After the act the copied
// material belongs entirely to the destination — there is no edge back.
//
// COPY-ONLY, BY CONSTRUCTION: this module produces ordinary BP-2 content
// (deep-copied structure, stable identity references, resolve-later fields
// absent, barred fields impossible). It creates NO live edge of any kind —
// no source foreign key in content, no subscription node, no runtime
// assembly. The result is validated by BP-2's OWN validator before it is
// written; provenance is recorded OUTSIDE content, citation-only.
//
// FRESH LOCAL IDS: every copied node gets a new authored key — the source's
// keys never travel, so no authored-id collision is possible and no two
// blueprints ever share a key by accident.
//
// This file imports only the content shape and the condition law — the same
// two the shape itself depends on. No supabase, no runtime.
// ═══════════════════════════════════════════════════════════════════════════
import {
  BlueprintContent, BlueprintChapter, BlueprintSection, ComponentEntry,
  ItemSelection, ParameterDecl, BlueprintPresentation,
} from "./blueprintContent";
import { BlueprintCondition } from "./blueprintConditions";

// ── SELECTION at lawful authored boundaries ─────────────────────────────────

export interface CompositionSelection {
  /** chapter keys to copy wholesale. */
  chapters: string[];
  /** section keys to copy (brings their chapter as minimum ancestry). */
  sections: string[];
  /** entry keys to copy (brings section + chapter). */
  entries: string[];
  /** parameter keys to copy alongside (dependencies also auto-carried). */
  parameters: string[];
  /** copy the source's portable presentation. */
  presentation: boolean;
  /** copy the source's reusable constraints. */
  constraints: boolean;
}

export const COLLISION_CHOICES = ["append", "insert-at", "refuse"] as const;
export type CollisionChoice = (typeof COLLISION_CHOICES)[number];

export interface CompositionPlan {
  /** where the copied material goes when a role/section already exists. */
  onRoleCollision: CollisionChoice;
  /** position for insert-at (0-based chapter index); ignored otherwise. */
  insertAt?: number;
  /** when the destination already carries portable presentation. */
  onPresentation: "keep-destination" | "replace-with-source";
  /** operator-directed parameter remaps: source key → destination key,
   *  explicit and recorded (keys are NEVER renamed silently). */
  parameterRemap: Record<string, string>;
}

export const COMPOSITION_CONFLICTS = [
  "COMPOSE_PARAM_MISSING_DEP", "COMPOSE_PARAM_TYPE_INCOMPATIBLE",
  "COMPOSE_PARAM_MEANING_INCOMPATIBLE", "COMPOSE_PREDICATE_UNADMITTED",
  "COMPOSE_DEPTH_EXCEEDED", "COMPOSE_ROLE_COLLISION", "COMPOSE_TAXONOMY_COLLISION",
  "COMPOSE_PRESENTATION_COLLISION", "COMPOSE_FIXED_PRICE_NO_POLICY",
  "COMPOSE_DEFINITION_UNAVAILABLE", "COMPOSE_INCOMPLETE_PARENT",
  "COMPOSE_NOTHING_SELECTED",
] as const;
export type CompositionConflict = (typeof COMPOSITION_CONFLICTS)[number];

export interface CompositionProblem { conflict: CompositionConflict; at: string; detail?: string; }

export interface CompositionResult {
  content: BlueprintContent;
  problems: CompositionProblem[];
  /** what actually traveled — for the review surface and provenance. */
  copied: { chapters: number; sections: number; entries: number; parameters: string[] };
  omissions: string[];
}

// ── fresh authored ids ──────────────────────────────────────────────────────

let _freshCounter = 0;
function freshId(prefix: string): string {
  // deterministic-enough uniqueness without a runtime dep: time + counter.
  _freshCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${_freshCounter.toString(36)}`;
}

// ── deep copy of lawful authored structure, with fresh keys ─────────────────

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** Collect every parameter key a condition references (for dependency
 *  carriage). Pure structural walk — never evaluates. */
export function conditionParamRefs(cond: BlueprintCondition | undefined, into: Set<string>): void {
  if (!cond) return;
  if ("predicate" in cond) { into.add(cond.param); return; }
  if ("all" in cond) { cond.all.forEach((c) => conditionParamRefs(c, into)); return; }
  if ("any" in cond) { cond.any.forEach((c) => conditionParamRefs(c, into)); return; }
  if ("not" in cond) { conditionParamRefs(cond.not, into); return; }
}

function copyItemSelection(src: ItemSelection): ItemSelection {
  return { name: src.name, include: src.include, note: src.note,
    condition: clone(src.condition) };
}

function copyEntry(src: ComponentEntry): ComponentEntry {
  return {
    key: freshId("e"),
    definitionId: src.definitionId,                 // STABLE IDENTITY, referenced
    title: src.title,
    configuration: clone(src.configuration),
    itemSelections: src.itemSelections.map(copyItemSelection),
    choiceGroups: src.choiceGroups.map((g) => ({ ...clone(g), key: freshId("cg") })),
    pricingIntent: clone(src.pricingIntent),        // intent, never resolved
    notes: src.notes,
    condition: clone(src.condition),                // predicate, never evaluated
  };
}

function copySection(src: BlueprintSection, entryFilter?: (e: ComponentEntry) => boolean): BlueprintSection {
  return {
    key: freshId("s"),
    title: src.title,
    prose: src.prose,
    role: src.role,                                 // shared identity reference
    entries: src.entries.filter((e) => !entryFilter || entryFilter(e)).map(copyEntry),
    condition: clone(src.condition),
  };
}

function copyChapter(src: BlueprintChapter, sectionFilter?: (s: BlueprintSection) => boolean,
  entryFilter?: (e: ComponentEntry) => boolean): BlueprintChapter {
  return {
    key: freshId("ch"),
    title: src.title,
    prose: src.prose,
    sections: src.sections.filter((s) => !sectionFilter || sectionFilter(s)).map((s) => copySection(s, entryFilter)),
    condition: clone(src.condition),
  };
}

// ── THE COMPOSITION ─────────────────────────────────────────────────────────

/** Pure: (source content, destination content, selection, plan,
 *  destination definition availability) → candidate destination content +
 *  staged problems. Never writes, never publishes, never evaluates. The
 *  caller validates the result through BP-2 and refuses on any problem. */
export function composeIntoDraft(
  source: BlueprintContent,
  destination: BlueprintContent,
  selection: CompositionSelection,
  plan: CompositionPlan,
  destinationHasDefinition: (definitionId: string) => boolean,
): CompositionResult {
  const problems: CompositionProblem[] = [];
  const omissions: string[] = [];

  // ── normalize selection into required ancestry (minimum lawful parents) ──
  const wantChapter = new Set(selection.chapters);
  const wantSection = new Set(selection.sections);
  const wantEntry = new Set(selection.entries);

  const srcSectionParent = new Map<string, BlueprintChapter>();
  const srcEntryParent = new Map<string, { ch: BlueprintChapter; se: BlueprintSection }>();
  for (const ch of source.structure) {
    for (const se of ch.sections) {
      srcSectionParent.set(se.key, ch);
      for (const en of se.entries) srcEntryParent.set(en.key, { ch, se });
    }
  }
  // selecting an entry brings its section + chapter; a section brings its chapter
  Array.from(wantEntry).forEach((enKey) => {
    const p = srcEntryParent.get(enKey);
    if (p) { wantSection.add(p.se.key); wantChapter.add(p.ch.key); }
  });
  Array.from(wantSection).forEach((seKey) => {
    const ch = srcSectionParent.get(seKey);
    if (ch) wantChapter.add(ch.key);
  });

  if (wantChapter.size === 0 && !selection.presentation && !selection.constraints && selection.parameters.length === 0) {
    problems.push({ conflict: "COMPOSE_NOTHING_SELECTED", at: "selection" });
  }

  // ── build the copied chapters (fresh ids, deep copy, filtered) ──
  const chapterInScope = (ch: BlueprintChapter) => wantChapter.has(ch.key);
  const sectionInScope = (se: BlueprintSection) =>
    wantSection.has(se.key) || (wantEntry.size === 0 && wantSection.size === 0);
  const entryInScope = (en: ComponentEntry) =>
    wantEntry.size === 0 || wantEntry.has(en.key)
    || (srcEntryParent.get(en.key) !== undefined && wantSection.has(srcEntryParent.get(en.key)!.se.key) && !someEntryChosenIn(srcEntryParent.get(en.key)!.se));

  function someEntryChosenIn(se: BlueprintSection): boolean {
    return se.entries.some((e) => wantEntry.has(e.key));
  }

  // definition availability — refuse rather than embed or guess
  for (const ch of source.structure) {
    if (!chapterInScope(ch)) continue;
    for (const se of ch.sections) {
      if (!sectionInScope(se)) continue;
      for (const en of se.entries) {
        if (!entryInScope(en)) continue;
        if (!destinationHasDefinition(en.definitionId)) {
          problems.push({ conflict: "COMPOSE_DEFINITION_UNAVAILABLE", at: en.title || en.key,
            detail: `definition ${en.definitionId} is not available to the destination tenant` });
        }
      }
    }
  }

  const copiedChapters: BlueprintChapter[] = source.structure
    .filter(chapterInScope)
    .map((ch) => copyChapter(ch, sectionInScope, entryInScope));

  // ── parameter dependency carriage ──
  const neededParams = new Set<string>(selection.parameters);
  const collectConds = (c: BlueprintCondition | undefined) => conditionParamRefs(c, neededParams);
  for (const ch of copiedChapters) {
    collectConds(ch.condition);
    for (const se of ch.sections) {
      collectConds(se.condition);
      for (const en of se.entries) {
        collectConds(en.condition);
        for (const it of en.itemSelections) collectConds(it.condition);
      }
    }
  }

  const srcParamByKey = new Map(source.parameters.map((p) => [p.key, p]));
  const destParamByKey = new Map(destination.parameters.map((p) => [p.key, p]));
  const carriedParams: ParameterDecl[] = [];
  for (const key of Array.from(neededParams)) {
    const srcP = srcParamByKey.get(key);
    if (!srcP) {
      problems.push({ conflict: "COMPOSE_PARAM_MISSING_DEP", at: key,
        detail: "a copied condition references a parameter that is neither selected nor present in the source" });
      continue;
    }
    const destKey = plan.parameterRemap[key] ?? key;
    const destP = destParamByKey.get(destKey);
    if (destP) {
      // same key already in destination — must be compatible, never overwritten
      if (destP.type !== srcP.type) {
        problems.push({ conflict: "COMPOSE_PARAM_TYPE_INCOMPATIBLE", at: destKey,
          detail: `source ${srcP.type} vs destination ${destP.type}` });
      } else if ((destP.label || "") !== (srcP.label || "") || JSON.stringify(destP.options ?? []) !== JSON.stringify(srcP.options ?? [])) {
        problems.push({ conflict: "COMPOSE_PARAM_MEANING_INCOMPATIBLE", at: destKey,
          detail: "same key, different label or options — meaning may differ; remap or align explicitly" });
      }
      // compatible: destination keeps its own; no carry needed
    } else {
      const carried = { ...clone(srcP), key: destKey };
      carriedParams.push(carried);
    }
  }
  // apply remap to copied conditions (explicit, recorded — never silent)
  if (Object.keys(plan.parameterRemap).length > 0) {
    const remap = (c: BlueprintCondition | undefined): void => {
      if (!c) return;
      if ("predicate" in c) { if (plan.parameterRemap[c.param]) c.param = plan.parameterRemap[c.param]; return; }
      if ("all" in c) c.all.forEach(remap);
      if ("any" in c) c.any.forEach(remap);
      if ("not" in c) remap(c.not);
    };
    for (const ch of copiedChapters) {
      remap(ch.condition);
      for (const se of ch.sections) { remap(se.condition);
        for (const en of se.entries) { remap(en.condition); en.itemSelections.forEach((it) => remap(it.condition)); } }
    }
  }

  // ── fixed-package pricing may travel only with its policy (§11) ──
  for (const ch of copiedChapters) for (const se of ch.sections) for (const en of se.entries) {
    if (en.pricingIntent?.form === "fixed-package" && (!en.pricingIntent.policy || en.pricingIntent.policy.trim() === "")) {
      problems.push({ conflict: "COMPOSE_FIXED_PRICE_NO_POLICY", at: en.title || en.key,
        detail: "fixed-package intent copies only with its declared policy" });
    }
  }

  // ── role collisions with existing destination sections ──
  const destRoles = new Set<string>();
  for (const ch of destination.structure) for (const se of ch.sections) if (se.role) destRoles.add(se.role);
  const incomingRoles = new Set<string>();
  for (const ch of copiedChapters) for (const se of ch.sections) if (se.role) incomingRoles.add(se.role);
  const collidingRoles = Array.from(incomingRoles).filter((r) => destRoles.has(r));
  if (collidingRoles.length > 0 && plan.onRoleCollision === "refuse") {
    problems.push({ conflict: "COMPOSE_ROLE_COLLISION", at: collidingRoles.join(", "),
      detail: "a copied section shares a semantic role with the destination — choose append or insert, or refuse" });
  }

  // ── presentation: no silent blending ──
  let presentation: BlueprintPresentation | null = clone(destination.presentation);
  if (selection.presentation && source.presentation) {
    if (destination.presentation && plan.onPresentation === "keep-destination") {
      omissions.push("source presentation omitted — destination portable kept by choice");
    } else if (destination.presentation && plan.onPresentation === "replace-with-source") {
      presentation = { portable: clone(source.presentation.portable), provenance: clone(source.presentation.provenance) };
    } else if (!destination.presentation) {
      presentation = { portable: clone(source.presentation.portable), provenance: clone(source.presentation.provenance) };
    }
  }

  // ── assemble the candidate content ──
  let structure: BlueprintChapter[];
  if (plan.onRoleCollision === "insert-at" && typeof plan.insertAt === "number") {
    structure = [...destination.structure];
    structure.splice(Math.max(0, Math.min(plan.insertAt, structure.length)), 0, ...copiedChapters);
  } else {
    structure = [...destination.structure, ...copiedChapters];  // append (default)
  }

  const content: BlueprintContent = {
    version: destination.version,
    structure: clone(structure),
    presentation,
    constraints: selection.constraints && destination.structure.length === 0
      ? clone(source.constraints) : clone(destination.constraints),
    parameters: [...clone(destination.parameters), ...carriedParams],
  };

  return {
    content,
    problems,
    copied: {
      chapters: copiedChapters.length,
      sections: copiedChapters.reduce((n, c) => n + c.sections.length, 0),
      entries: copiedChapters.reduce((n, c) => n + c.sections.reduce((m, s) => m + s.entries.length, 0), 0),
      parameters: carriedParams.map((p) => p.key),
    },
    omissions,
  };
}
