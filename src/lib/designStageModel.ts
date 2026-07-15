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
    if (!mine.length) continue;
    const built = mine.map(toComp);
    chapters.push({
      id: s.id, name: s.name, components: built,
      subtotal: built.reduce((n, c) => n + (c.subtotal ?? 0), 0) || null,
    });
  }
  const orphans = comps.filter((c) => !c.section_type_id || !sections.some((s) => s.id === c.section_type_id));
  if (orphans.length) {
    chapters.push({ id: "__none__", name: "Unassigned", components: orphans.map(toComp), subtotal: null });
  }
  return chapters;
}
