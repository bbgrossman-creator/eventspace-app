// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT GUIDE (v259 · Editor Foundation) — pure presentation law for
// the first Blueprint Editor experience. UX-ONLY over the frozen BP-1..BP-8
// architecture: nothing here touches a validator, resolver, ceremony, or
// table. This module knows how to SAY things and what to SUGGEST — it never
// decides. Every content-changing action it describes is a deliberate,
// confirmed authoring act performed by the user through existing editors.
//
// HONESTY RULES ENCODED HERE:
//  · A promoted draft is identified by its exact BP-5 PROMOTION ACT — never
//    by seeded/promoted_from heuristics, so composition and future creation
//    paths can never wear event-learning language by accident.
//  · The software knows what was TRANSFORMED or OMITTED; it does not know
//    what should become optional, conditional, or parameterized. The panel
//    is titled by what the record IS — a review of what came from the
//    event — never by a claim of machine insight.
//  · Dismissal is a personal UI preference, never Blueprint state; the
//    checklist is guidance with no completion checkmarks.
// ═══════════════════════════════════════════════════════════════════════════
import { STRIP_REASONS, StripReason, StripEntry } from "./blueprintPromote";
import { BlueprintContent, ParameterDecl } from "./blueprintContent";

// ── friendly copy, ONE-TO-ONE with the constitutional vocabulary ────────────
// The exact code and raw detail stay available behind Advanced; this map is
// TOTAL over STRIP_REASONS (unit-pinned) so no reason ever renders raw-only.

export interface FriendlyStrip { title: string; body: string; }

export const FRIENDLY_STRIP_COPY: Record<StripReason, FriendlyStrip> = {
  STRIPPED_GUESTS: {
    title: "Guest count belongs to an event",
    body: "Blueprints ask this question later, when a new event is created.",
  },
  STRIPPED_ITEM_PRICES: {
    title: "Item prices stay with your catalog",
    body: "Future events will resolve them automatically at arrival.",
  },
  CONFIRMED_PRICE_TO_SUGGESTION: {
    title: "Pricing converted into reusable guidance",
    body: "Future events will begin with this as a suggestion rather than a confirmed price.",
  },
  STRIPPED_BOUND_DRESS: {
    title: "Component styling stays with the event",
    body: "Only the portable look travels; per-component dress is applied fresh each time.",
  },
  SKIPPED_NO_DEFINITION: {
    title: "A component had no catalog identity",
    body: "Blueprints reference your catalog; this component couldn't travel without one.",
  },
  OUT_OF_SCOPE: {
    title: "Left behind by your choice",
    body: "You chose not to bring this along.",
  },
  PRICING_OMITTED: {
    title: "Pricing left behind by your choice",
    body: "The draft carries no pricing guidance here; you can add it in the editor.",
  },
  FACT_TO_QUESTION: {
    title: "An event fact became a reusable question",
    body: "Future events will be asked this instead of inheriting yesterday's answer.",
  },
  ORPHANED_SELECTION: {
    title: "Selected, but its section wasn't",
    body: "Nothing travels without its parent structure.",
  },
};

// ── the editor's permanent information architecture ─────────────────────────
// Named areas, even while this release implements a modest form of each.

export const EDITOR_AREAS = [
  { id: "area-structure",    label: "Reusable Structure",         hint: "Chapters, sections, components, and items — the shape future events start from." },
  { id: "area-questions",    label: "Questions for Future Events", hint: "Parameters. Every new event answers these before the design exists." },
  { id: "area-rules",        label: "Rules",                      hint: "Conditions decide what appears, from the answers. They attach on sections, components, and items inside Reusable Structure." },
  { id: "area-choices",      label: "Choices",                    hint: "Optional or selectable content a future event picks from. Choice groups live on components inside Reusable Structure." },
  { id: "area-pricing",      label: "Pricing Guidance",           hint: "Intent for future events — never a confirmed price. Pricing lives on components inside Reusable Structure." },
  { id: "area-presentation", label: "Portable Presentation",      hint: "The look that travels by value: theme, section dress, pins." },
  { id: "area-review",       label: "Review Before Publishing",   hint: "Open questions, omissions, and validation — then the publication ceremony." },
] as const;

// ── the guidance checklist — bullets, not state ─────────────────────────────
// No checkboxes, no completion: readiness is judged by the validator and by
// the author, never by dismissing a banner.

export const GUIDE_CHECKLIST = [
  { text: "Review pricing guidance", jump: "area-pricing" },
  { text: "Replace event facts with reusable questions", jump: "area-questions" },
  { text: "Consider conditions for situational content", jump: "area-rules" },
  { text: "Review titles and descriptions for reusable language", jump: "area-structure" },
  { text: "Publish when ready — a separate, deliberate ceremony", jump: "area-review" },
] as const;

/** localStorage key for dismissing the onboarding banner — a personal UI
 *  preference scoped to this exact draft. NEVER read as Blueprint state. */
export const onboardDismissKey = (revisionId: string) => `ec:bp-onboard-dismissed:${revisionId}`;

// ── opportunities to generalize, derived from the ACT's recorded detail ─────
// The act knows facts; the author decides meaning. Every opportunity either
// NAVIGATES to an existing editor or proposes a change the user must CONFIRM.

export interface PromotionActDetail {
  selected_regions?: unknown;
  transformations?: StripEntry[];
  omissions?: StripEntry[];
}

export type Opportunity =
  | { kind: "ask-guest-count"; entry: StripEntry }     // proposes a parameter; user confirms
  | { kind: "review-pricing"; entry: StripEntry }      // navigates to pricing guidance
  | { kind: "info"; entry: StripEntry };               // informational; "leave event-specific"

/** The proposed guest-count question — shown IN FULL before the author
 *  commits it. Never applied silently. */
export const PROPOSED_GUEST_PARAMETER: ParameterDecl = {
  key: "guest_count", label: "How many guests are expected?", type: "count", required: true,
};

export function deriveOpportunities(
  detail: PromotionActDetail | null,
  content: BlueprintContent,
): Opportunity[] {
  if (!detail) return [];
  const all: StripEntry[] = [
    ...(Array.isArray(detail.transformations) ? detail.transformations : []),
    ...(Array.isArray(detail.omissions) ? detail.omissions : []),
  ];
  const hasGuestParam = content.parameters.some((p) => p.key === "guest_count");
  const out: Opportunity[] = [];
  for (const entry of all) {
    if (entry.reason === "STRIPPED_GUESTS" && !hasGuestParam) {
      out.push({ kind: "ask-guest-count", entry });
    } else if (entry.reason === "CONFIRMED_PRICE_TO_SUGGESTION" || entry.reason === "PRICING_OMITTED") {
      out.push({ kind: "review-pricing", entry });
    } else {
      out.push({ kind: "info", entry });
    }
  }
  return out;
}

// ── quick counts for the area summaries ─────────────────────────────────────

export function contentCounts(c: BlueprintContent): {
  conditions: number; choiceGroups: number; pricedEntries: number; entries: number;
} {
  let conditions = 0, choiceGroups = 0, pricedEntries = 0, entries = 0;
  for (const ch of c.structure) {
    if (ch.condition) conditions++;
    for (const se of ch.sections) {
      if (se.condition) conditions++;
      for (const en of se.entries) {
        entries++;
        if (en.condition) conditions++;
        for (const it of en.itemSelections) if (it.condition) conditions++;
        choiceGroups += en.choiceGroups.length;
        if (en.pricingIntent) pricedEntries++;
      }
    }
  }
  return { conditions, choiceGroups, pricedEntries, entries };
}

// completeness guard used by the unit suite: the copy map must stay total
export const FRIENDLY_COPY_REASONS: readonly StripReason[] = STRIP_REASONS;
