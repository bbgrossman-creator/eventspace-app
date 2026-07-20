// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT DIVERGENCE & CITATION (v254 · BP-4) — pure law, zero imports.
//
// ONE SOURCE OF TRUTH: divergence derives EXCLUSIVELY from
//     current materialized Design state  ↔  frozen baseline (v253)
// Never from the current blueprint, the currently offered revision, event
// history, or log reconstruction. This module enforces that by SHAPE: the
// comparison takes exactly two arguments and imports nothing — there is no
// parameter through which a blueprint could arrive.
//
// HONESTY TIERS (constitution §8): unchanged · light · heavy — derived from
// NAMED STRUCTURAL CRITERIA, not a weighted score (no numeric ranking
// exists in the report; pinned). earlier-revision is ORTHOGONAL: it speaks
// about the shelf (is the cited revision still the offered one?), never
// about the design. The two axes never collapse.
//
// DISPLAY, NEVER JUDGMENT: the report ranks nothing, urges nothing,
// blocks nothing, and prices nothing. Empty divergence is information —
// "unchanged" renders as itself.
//
// BASELINE INTEGRITY: the frozen baseline is immutable history. This
// module READS it; it never rewrites, normalizes, or repairs. A malformed
// baseline surfaces as a NAMED integrity state and comparison refuses.
//
// THE CITATION VOICE: "Started from {name} r{N}" — permanent, resolving to
// the exact historical revision, surviving supersession and retirement.
// ═══════════════════════════════════════════════════════════════════════════

// ── the materialized shape (identical for baseline and current) ─────────────

export interface MaterializedSection { section_type_id: string; position: number; }
export interface MaterializedItem { name: string; unit_price: number | null; price_confirmed: boolean | null; }
export interface MaterializedComponent {
  id: string;
  title: string | null;
  section_type_id: string | null;
  definition_id: string | null;
  instantiation_id: string | null;
  pricing_mode: string | null;
  package_price: number | null;
  package_price_confirmed: boolean | null;
  config: unknown;
  seed_config_revision: string | null;
  items: MaterializedItem[];
}
export interface MaterializedPresentation {
  theme_key: string | null;
  theme_override: unknown;
  photo_pins: unknown;
}
export interface MaterializedGuests { category_id: string; count: number; }
export interface MaterializedDesign {
  sections: MaterializedSection[];
  components: MaterializedComponent[];
  presentation: MaterializedPresentation | null;
  guests: MaterializedGuests[];
  structure_prose?: unknown;
}

// ── findings: the closed vocabulary, every kind classified exactly once ─────

export const HEAVY_CRITERIA = [
  "component-added", "component-removed", "component-moved",
  "section-added", "section-removed",
  "presentation-replaced",       // a different theme is a different garment
  "config-scheme-changed",       // the scheme is the configuration's spine
  "pricing-mode-changed",        // itemized↔package reshapes the money
] as const;

export const LIGHT_CRITERIA = [
  "component-retitled",
  "section-reordered", "component-reordered",
  "config-value-changed",
  "item-added", "item-removed", "item-reordered", "item-price-changed",
  "price-confirmation-changed", "package-price-changed",
  "dress-adjusted",              // delta/dress/pins moved under the same theme
  "guest-count-changed",
] as const;

export type FindingKind = (typeof HEAVY_CRITERIA)[number] | (typeof LIGHT_CRITERIA)[number];

export interface Finding {
  kind: FindingKind;
  at: string;          // human anchor: component title, section id, item name
  detail?: string;
}

export type DivergenceTier = "unchanged" | "light" | "heavy";

export const INTEGRITY_PROBLEMS = [
  "BASELINE_MISSING_SECTIONS", "BASELINE_MISSING_COMPONENTS",
  "BASELINE_MISSING_GUESTS", "BASELINE_COMPONENT_WITHOUT_ID",
  "BASELINE_NOT_AN_OBJECT",
] as const;
export type IntegrityProblem = (typeof INTEGRITY_PROBLEMS)[number];

export type DivergenceReport =
  | { integrity: "ok"; tier: DivergenceTier; findings: Finding[];
      prose: "unavailable";  // no native prose surface exists; reported, not invented
    }
  | { integrity: "malformed"; problems: IntegrityProblem[] };

// ── deterministic helpers ───────────────────────────────────────────────────

const canon = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
};
export const sameValue = (a: unknown, b: unknown): boolean => canon(a) === canon(b);

// ── integrity: read, never repair ───────────────────────────────────────────

export function baselineIntegrity(baseline: unknown): IntegrityProblem[] {
  const problems: IntegrityProblem[] = [];
  if (typeof baseline !== "object" || baseline === null || Array.isArray(baseline)) {
    return ["BASELINE_NOT_AN_OBJECT"];
  }
  const b = baseline as Partial<MaterializedDesign>;
  if (!Array.isArray(b.sections)) problems.push("BASELINE_MISSING_SECTIONS");
  if (!Array.isArray(b.components)) problems.push("BASELINE_MISSING_COMPONENTS");
  else if (b.components.some((c) => !c || typeof (c as MaterializedComponent).id !== "string")) {
    problems.push("BASELINE_COMPONENT_WITHOUT_ID");
  }
  if (!Array.isArray(b.guests)) problems.push("BASELINE_MISSING_GUESTS");
  return problems;
}

// ── THE COMPARISON — (current, baseline) and nothing else ───────────────────

export function compareToBaseline(current: MaterializedDesign, baseline: unknown): DivergenceReport {
  const problems = baselineIntegrity(baseline);
  if (problems.length > 0) return { integrity: "malformed", problems };
  const base = baseline as MaterializedDesign;
  const findings: Finding[] = [];

  // sections: presence, then ordering
  const baseSecs = base.sections.map((s) => s.section_type_id);
  const curSecs = current.sections.map((s) => s.section_type_id);
  for (const s of curSecs) if (!baseSecs.includes(s)) findings.push({ kind: "section-added", at: s });
  for (const s of baseSecs) if (!curSecs.includes(s)) findings.push({ kind: "section-removed", at: s });
  const sharedOrderBase = baseSecs.filter((s) => curSecs.includes(s));
  const sharedOrderCur = curSecs.filter((s) => baseSecs.includes(s));
  if (sharedOrderBase.join("|") !== sharedOrderCur.join("|")) {
    findings.push({ kind: "section-reordered", at: "sections" });
  }

  // components: keyed by stable id (fresh identities from the act)
  const baseById = new Map(base.components.map((c) => [c.id, c]));
  const curById = new Map(current.components.map((c) => [c.id, c]));
  for (const c of current.components) {
    if (!baseById.has(c.id)) findings.push({ kind: "component-added", at: c.title ?? c.id });
  }
  for (const c of base.components) {
    const cur = curById.get(c.id);
    if (!cur) { findings.push({ kind: "component-removed", at: c.title ?? c.id }); continue; }
    if ((cur.section_type_id ?? null) !== (c.section_type_id ?? null)) {
      findings.push({ kind: "component-moved", at: cur.title ?? c.id });
    }
    if ((cur.title ?? "") !== (c.title ?? "")) findings.push({ kind: "component-retitled", at: c.title ?? c.id });
    // configuration: scheme is the spine; the rest are values
    const bCfg = (c.config ?? {}) as Record<string, unknown>;
    const cCfg = (cur.config ?? {}) as Record<string, unknown>;
    if ((bCfg["schemeId"] ?? null) !== (cCfg["schemeId"] ?? null)) {
      findings.push({ kind: "config-scheme-changed", at: cur.title ?? c.id });
    }
    const seenKeys: Record<string, true> = {};
    const valueKeys: string[] = [];
    for (const k of Object.keys(bCfg).concat(Object.keys(cCfg))) {
      if (k !== "schemeId" && !seenKeys[k]) { seenKeys[k] = true; valueKeys.push(k); }
    }
    for (const k of valueKeys) {
      if (!sameValue(bCfg[k], cCfg[k])) {
        findings.push({ kind: "config-value-changed", at: `${cur.title ?? c.id} · ${k}` });
      }
    }
    // items by name
    const bNames = c.items.map((i) => i.name);
    const cNames = cur.items.map((i) => i.name);
    for (const n of cNames) if (!bNames.includes(n)) findings.push({ kind: "item-added", at: `${cur.title ?? c.id} · ${n}` });
    for (const n of bNames) if (!cNames.includes(n)) findings.push({ kind: "item-removed", at: `${cur.title ?? c.id} · ${n}` });
    const bShared = bNames.filter((n) => cNames.includes(n));
    const cShared = cNames.filter((n) => bNames.includes(n));
    if (bShared.join("|") !== cShared.join("|")) findings.push({ kind: "item-reordered", at: cur.title ?? c.id });
    for (const n of bShared) {
      const bi = c.items.find((i) => i.name === n)!;
      const ci = cur.items.find((i) => i.name === n)!;
      if ((bi.unit_price ?? null) !== (ci.unit_price ?? null)) findings.push({ kind: "item-price-changed", at: `${cur.title ?? c.id} · ${n}` });
      if ((bi.price_confirmed ?? null) !== (ci.price_confirmed ?? null)) findings.push({ kind: "price-confirmation-changed", at: `${cur.title ?? c.id} · ${n}` });
    }
    // package money
    if ((c.pricing_mode ?? null) !== (cur.pricing_mode ?? null)) findings.push({ kind: "pricing-mode-changed", at: cur.title ?? c.id });
    if ((c.package_price ?? null) !== (cur.package_price ?? null)) findings.push({ kind: "package-price-changed", at: cur.title ?? c.id });
    if ((c.package_price_confirmed ?? null) !== (cur.package_price_confirmed ?? null)) {
      findings.push({ kind: "price-confirmation-changed", at: `${cur.title ?? c.id} · package` });
    }
  }
  // component ordering inside shared sections (by shared ids)
  const bOrder = base.components.map((c) => c.id).filter((id) => curById.has(id));
  const cOrder = current.components.map((c) => c.id).filter((id) => baseById.has(id));
  if (bOrder.join("|") !== cOrder.join("|")) {
    // moved-across-sections already reported; same-membership order change is light
    const moved = new Set(findings.filter((f) => f.kind === "component-moved").map((f) => f.at));
    if (moved.size === 0) findings.push({ kind: "component-reordered", at: "components" });
  }

  // presentation: a different theme is replacement; same-theme motion is dress
  const bp = base.presentation ?? { theme_key: null, theme_override: null, photo_pins: null };
  const cp = current.presentation ?? { theme_key: null, theme_override: null, photo_pins: null };
  if ((bp.theme_key ?? null) !== (cp.theme_key ?? null)) {
    findings.push({ kind: "presentation-replaced", at: `${bp.theme_key ?? "—"} → ${cp.theme_key ?? "—"}` });
  } else if (!sameValue(bp.theme_override, cp.theme_override) || !sameValue(bp.photo_pins, cp.photo_pins)) {
    findings.push({ kind: "dress-adjusted", at: "presentation" });
  }

  // guests
  const bGuests = [...base.guests].sort((a, z) => a.category_id.localeCompare(z.category_id));
  const cGuests = [...current.guests].sort((a, z) => a.category_id.localeCompare(z.category_id));
  if (!sameValue(bGuests, cGuests)) findings.push({ kind: "guest-count-changed", at: "guests" });

  const heavy = new Set<string>(HEAVY_CRITERIA);
  const tier: DivergenceTier =
    findings.length === 0 ? "unchanged"
    : findings.some((f) => heavy.has(f.kind)) ? "heavy"
    : "light";

  return { integrity: "ok", tier, findings, prose: "unavailable" };
}

// ── THE CITATION — orthogonal to divergence ─────────────────────────────────

export function citationLine(blueprintName: string, revisionNumber: number): string {
  return `Started from ${blueprintName} r${revisionNumber}`;
}

export interface CitationStatus {
  /** true when the cited revision is still the identity's offered one. */
  fromCurrentRevision: boolean;
  /** "earlier-revision" is about the SHELF, never about the design. */
  shelfNote: "current" | "earlier-revision";
  identityRetired: boolean;
}

export function citationStatus(input: {
  citedRevisionId: string;
  publishedRevisionId: string | null;
  identityStatus: string;
}): CitationStatus {
  const fromCurrent = input.publishedRevisionId === input.citedRevisionId;
  return {
    fromCurrentRevision: fromCurrent,
    shelfNote: fromCurrent ? "current" : "earlier-revision",
    identityRetired: input.identityStatus === "retired",
  };
}
