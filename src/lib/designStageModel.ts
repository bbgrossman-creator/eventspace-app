// ═══════════════════════════════════════════════════════════════════════════
// THE DESIGN STAGE PROJECTION (v196b)
//
// Canonical rows → the structured list the Design lens renders. Under the
// renderer contract: this queries nothing and renders nothing. It is handed
// what the Studio already loaded and shapes it.
//
// It is DELIBERATELY not PresentationModel. The Customer projection drops
// internal rows, resolves choice groups, and formats money — because a
// customer must not see any of that. The maker must see ALL of it, unformatted
// and editable. Same canonical objects, two projections, and the difference is
// what makes a leak impossible rather than merely unlikely (v196 X-ray tests).
// ═══════════════════════════════════════════════════════════════════════════
import { StageChapter, StageComponent, StageCategory, StageItem } from "@/components/studio/renderers/DesignStage";
import { OutlineNode } from "@/components/studio/renderers/DesignOutline";

export interface RawComp {
  id: string; title: string; section_type_id: string | null; position: number;
  pricing_mode: string; package_price: number | null; package_basis: string | null;
  package_price_confirmed: boolean; proposal_display: string | null;
  presentation_note?: string | null; item_categories: unknown;
  item_layout: string | null;
}
export interface RawItem {
  id: string; component_id: string; name: string; unit_price: number | null;
  quantity_basis: string | null; price_confirmed: boolean; show_on_proposal: boolean;
  item_role: string | null; category_key: string | null; choice_group_id: string | null;
  price_state?: string | null; position: number;
}
interface CatDef { key: string; label: string; position: number; layout?: string; show_heading?: boolean }

export function buildDesignStage(
  comps: RawComp[], items: RawItem[],
  sections: { id: string; name: string }[],
  subtotalFor: (compId: string) => number | null,
): StageChapter[] {
  const byComp: Record<string, RawItem[]> = {};
  for (const i of items) (byComp[i.component_id] ??= []).push(i);
  for (const k of Object.keys(byComp)) byComp[k].sort((a, b) => a.position - b.position);

  const toItem = (i: RawItem): StageItem => ({
    id: i.id, name: i.name, unitPrice: i.unit_price, basis: i.quantity_basis,
    priceState: i.price_state ?? "quoted", confirmed: i.price_confirmed !== false,
    visible: i.show_on_proposal !== false, optional: i.item_role === "optional",
    categoryKey: i.category_key, choiceGroupId: i.choice_group_id,
  });

  const toComp = (c: RawComp): StageComponent => {
    const raw = Array.isArray(c.item_categories) ? (c.item_categories as CatDef[]) : [];
    const defs = [...raw].sort((a, b) => a.position - b.position);
    const mine = byComp[c.id] ?? [];
    const cats: StageCategory[] = [];

    for (const d of defs) {
      cats.push({
        key: d.key, label: d.show_heading === false ? null : d.label,
        layout: d.layout ?? c.item_layout ?? "vertical",
        items: mine.filter((i) => i.category_key === d.key).map(toItem),
      });
    }
    // Uncategorised rows are NOT dropped — in the maker's lens every row must
    // appear somewhere or it becomes invisible work.
    const loose = mine.filter((i) => !i.category_key || !defs.some((d) => d.key === i.category_key));
    if (loose.length) cats.push({ key: null, label: null, layout: c.item_layout ?? "vertical", items: loose.map(toItem) });

    const isPkg = c.pricing_mode === "package";
    return {
      id: c.id, title: c.title, isPackage: isPkg,
      packagePrice: c.package_price, packageBasis: c.package_basis,
      packageConfirmed: c.package_price_confirmed !== false,
      display: c.proposal_display ?? "items",
      note: c.presentation_note ?? null,
      categories: cats.filter((x) => x.items.length > 0),
      subtotal: isPkg ? null : subtotalFor(c.id),
    };
  };

  const chapters: StageChapter[] = [];
  for (const s of sections) {
    const mine = comps.filter((c) => c.section_type_id === s.id).sort((a, b) => a.position - b.position);
    // v220 — EMPTY-IS-INFORMATION (binding rule): an empty section RENDERS.
    // The `if (!mine.length) continue;` that stood here made "＋ section"
    // appear to lie — the version_sections row was created and the maker's
    // lens silently refused to show it. Availability never depends on
    // content; an empty chapter is a true statement ("Dinner exists and has
    // nothing yet") and carries the section's own + component affordance.
    const built = mine.map(toComp);
    chapters.push({
      id: s.id, name: s.name, components: built,
      subtotal: built.length ? (built.reduce((n, c) => n + (c.subtotal ?? 0), 0) || null) : null,
    });
  }
  const orphans = comps.filter((c) => !c.section_type_id || !sections.some((s) => s.id === c.section_type_id));
  if (orphans.length) {
    chapters.push({ id: "__none__", name: "Unassigned", components: orphans.map(toComp), subtotal: null });
  }
  return chapters;
}


// ═══════════════════════════════════════════════════════════════════════════
// THE DESIGN OUTLINE — projected from the DESIGN model, not the Customer one.
//
// ─── THE BUG THIS FIXES, AND WHY IT WAS A DOCTRINE VIOLATION ──────────────
// The Outline was built from `outlineFromModel(PresentationModel)` — the
// CUSTOMER projection — while the Stage rendered `designChapters` from raw
// rows. Two consequences, both reported:
//
//   1. **Nothing scrolled.** The Customer projection has no database ids, so
//      it invented synthetic ones (`c:0:1`). The Stage's rows carry REAL ids.
//      `selectedId` from the Outline could never equal a Stage row's id, so
//      selection matched nothing — silently, because both id spaces looked
//      perfectly reasonable on their own.
//   2. **Expanding revealed nothing.** The Customer model has no CATEGORY
//      level (it has presentation *blocks*), so a component's children were
//      either flattened or absent.
//
// The root cause is the banked correction, ignored in my own code: **the rail
// is a projection too** — so it must project from the SAME model its Stage
// renders. An outline built from a different projection is a second source of
// truth about identity, which is the one thing the Canonical Rule cannot
// tolerate: two views of one object that disagree about which object it is.
//
// Each lens now owns its outline. Customer keeps `outlineFromModel`; Design
// gets this. When Layout arrives it brings a third (rooms ▸ zones ▸ stations)
// and does not have to fight either.
// ═══════════════════════════════════════════════════════════════════════════

/** chapters ▸ components ▸ categories ▸ items — with REAL ids at every level,
 *  so a click in the rail addresses the same object the Stage rendered. */
export function outlineFromDesignChapters(chapters: StageChapter[], xray: boolean): OutlineNode[] {
  return chapters.map((ch) => {
    const comps: OutlineNode[] = ch.components.map((c) => {
      const cats: OutlineNode[] = [];
      let compDebt = 0;

      for (const cat of c.categories) {
        const items: OutlineNode[] = [];
        let catDebt = 0;
        for (const it of cat.items) {
          if (!it.visible && !xray) continue;   // the rail cannot show what the Stage hides
          // A carried price is debt. An internal/included/free row is not —
          // v194 P0.5/P0.6: a hidden heat lamp must never manufacture debt.
          const d = (it.priceState ?? "quoted") === "quoted" && it.unitPrice != null && !it.confirmed ? 1 : 0;
          catDebt += d;
          items.push({ id: it.id, label: it.name, kind: "item", debt: d, internal: !it.visible });
        }
        if (!items.length) continue;
        compDebt += catDebt;
        // A category with no heading is a real grouping the author still needs
        // to see — it gets a node, labelled honestly.
        cats.push({
          id: `${c.id}::${cat.key ?? "_"}`,
          label: cat.label ?? "(uncategorised)",
          kind: "component",   // an intermediate grouping, rendered like one
          children: items, debt: catDebt,
        });
      }

      if (c.isPackage && c.packagePrice != null && !c.packageConfirmed) compDebt += 1;

      return {
        id: c.id, label: c.title, kind: "component",
        // A component with ONE unlabelled category is a component with a flat
        // item list — don't make the user open two levels to reach a roll.
        children: cats.length === 1 && cats[0].label === "(uncategorised)"
          ? cats[0].children
          : (cats.length ? cats : undefined),
        debt: compDebt,
      };
    });

    return {
      id: ch.id, label: ch.name, kind: "chapter",
      children: comps.length ? comps : undefined,
      debt: comps.reduce((n, c) => n + (c.debt ?? 0), 0),
    };
  });
}
