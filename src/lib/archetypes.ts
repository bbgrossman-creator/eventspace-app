// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL ARCHETYPES (v221) — there are (at least) two event grammars, and
// one skeleton cannot serve both. A wedding is a TIMELINE (Cocktail Hour →
// Dinner → Dessert); a corporate reception is CONTINUOUS SERVICE (Stations,
// Beverages — no meal phases at all). So the seed is a QUESTION at proposal
// creation, never an assumption. Sections are named here (labels only —
// content never comes from a seed); the data layer maps names to
// section_types, coining missing ones (the vocabulary belongs to the
// caterer). Blueprint and seed-from-event routes skip the question — their
// structure arrives with them.
// ═══════════════════════════════════════════════════════════════════════════
export interface ProposalArchetype {
  key: string;
  label: string;
  blurb: string;
  sections: string[];
}

export const ARCHETYPES: ProposalArchetype[] = [
  { key: "formal", label: "Timed Courses",
    blurb: "Cocktail Hour → Dinner → Dessert — the evening as a timeline.",
    sections: ["Cocktail Hour", "Dinner", "Dessert", "Late Night"] },
  { key: "reception", label: "Continuous Service",
    blurb: "Stations, passed hors d'oeuvres, food throughout — no meal phases.",
    sections: ["Stations", "Passed Hors d'Oeuvres", "Beverages"] },
  { key: "buffet", label: "Buffet",
    blurb: "One spread, start to finish.",
    sections: ["Buffet", "Dessert", "Beverages"] },
  { key: "blank", label: "Blank",
    blurb: "No outline — compose the chapters yourself.",
    sections: [] },
];

export const archetype = (key: string): ProposalArchetype | null =>
  ARCHETYPES.filter((a) => a.key === key)[0] ?? null;
