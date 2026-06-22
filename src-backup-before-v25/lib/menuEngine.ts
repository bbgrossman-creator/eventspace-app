// ═══════════════════════════════════════════════════════════════════════════
// MENU TEMPLATE ENGINE
// Menus are DATA (stored in menu_templates table), not code.
// This file defines the template shape and the pricing engine that turns
// (template + selections + guest counts) into invoice charge lines.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Price models ───
// `unit` is an optional display label for quantity-based pricing, so the same
// math serves trays, stations, hours, fixtures, arrangements, staff, tables…
export type PriceModel = (
  | { model: "per_person"; amount: number }        // × whole party (adults+children)
  | { model: "per_adult"; amount: number }         // × adults only
  | { model: "per_side_person"; amount: number }   // × that side's guest count (men/women)
  | { model: "flat"; amount: number }              // fixed price
  | { model: "per_tray"; amount: number }          // × quantity entered (any unit)
  | { model: "per_table"; amount: number }         // × number of tables (rep enters)
  | { model: "per_person_qty"; amount: number }    // × a people-count the rep enters
) & { unit?: string };

export interface MenuOption {
  label: string;
  price?: PriceModel;       // surcharge when selected (omit = included)
  desc?: string;
}

// ─── How many options may/must be chosen ───
export type CountRule =
  | { fixed: { min: number; max: number } }
  | { by_answer: { key: string; map: Record<string, number> } }   // N depends on another answer
  | { by_tier: { source: "men" | "women" | "total"; tiers: { min: number; choose: number }[] } };

export interface VisibleIf {
  key: string;
  equals?: string;
  any?: string[];
  not_equals?: string;
  exists?: boolean;
  gt?: number;
}

export interface MenuSection {
  key: string;                    // unique within template; selections stored under this key
  title: string;
  help?: string;
  type: "choose" | "multi" | "toggle" | "qty" | "text" | "info";
  required?: boolean;
  optional_group?: boolean;       // multi: allow zero selections (else count rule enforced)
  count?: CountRule;              // for multi
  options?: MenuOption[];
  // price applied once when the section has any selection (e.g. appetizer platter +$7pp)
  section_price?:
    | { model: "per_person" | "flat"; amount: number }
    | { model: "per_person_by_count"; by_count: Record<string, number> }; // e.g. soups {"1":4,"2":6}
  visible_if?: VisibleIf;
  side?: "men" | "women";         // for per_side_person pricing context
}

export interface MenuTemplate {
  slug: string;
  name: string;
  base: {
    adult_pp: number;
    child_pp: number;
    min_guests?: number;
    min_total?: number;
    notes?: string;
  };
  sections: MenuSection[];
}

// ─── Selections shape (stored in bookings.menu jsonb) ───
// {
//   template: "single_buffet",
//   guests: { men: 40, women: 40, children: 6 },
//   answers: {
//     starter: "Caesar Steak Salad",                  // choose
//     mains: ["Crispy Chicken","Brisket"],            // multi
//     sliders: "Yes",                                  // toggle
//     slider_trays: { "Slider Platter": 3 },           // qty
//     second_chicken_count: 25,                        // per_person_qty companion
//     notes: "..."                                     // text
//   }
// }
export interface MenuSelections {
  template: string;
  guests: { men: number; women: number; children: number; adults?: number };
  answers: Record<string, unknown>;
  min_guests?: number;
}

export interface MenuChargeLine {
  description: string;
  quantity: number;
  unit_price: number;
  taxable: boolean;
}

// ─── Helpers ───
export function isVisible(s: MenuSection, answers: Record<string, unknown>): boolean {
  if (!s.visible_if) return true;
  const v = answers[s.visible_if.key];
  const val = typeof v === "string" ? v : Array.isArray(v) ? v.join(",") : String(v ?? "");
  if (s.visible_if.equals !== undefined) return val === s.visible_if.equals;
  if (s.visible_if.not_equals !== undefined) return val !== s.visible_if.not_equals && val !== "";
  if (s.visible_if.any) return s.visible_if.any.includes(val);
  if (s.visible_if.exists) return val !== "" && val !== "undefined" && val !== "null";
  if (s.visible_if.gt !== undefined) return Number(val || 0) > s.visible_if.gt;
  return true;
}

export function requiredCount(
  s: MenuSection,
  answers: Record<string, unknown>,
  guests: { men: number; women: number; total: number }
): { min: number; max: number } {
  if (!s.count) return { min: 0, max: 99 };
  if ("fixed" in s.count) return s.count.fixed;
  if ("by_answer" in s.count) {
    const a = String(answers[s.count.by_answer.key] ?? "");
    const n = s.count.by_answer.map[a] ?? 0;
    return { min: n, max: n };
  }
  // by_tier
  const src = s.count.by_tier.source;
  const g = src === "men" ? guests.men : src === "women" ? guests.women : guests.total;
  let choose = 0;
  for (const t of s.count.by_tier.tiers) if (g >= t.min) choose = t.choose;
  return { min: choose, max: choose };
}

function priceAmount(
  p: PriceModel,
  ctx: { party: number; adults: number; side: number; qty: number; pqty: number }
): { qty: number; unit: number } {
  switch (p.model) {
    case "per_person":     return { qty: ctx.party, unit: p.amount };
    case "per_adult":      return { qty: ctx.adults, unit: p.amount };
    case "per_side_person":return { qty: ctx.side, unit: p.amount };
    case "flat":           return { qty: 1, unit: p.amount };
    case "per_tray":       return { qty: ctx.qty, unit: p.amount };
    case "per_table":      return { qty: ctx.qty, unit: p.amount };
    case "per_person_qty": return { qty: ctx.pqty, unit: p.amount };
  }
}

// ─── The pricing engine ───
export function computeMenuCharges(
  template: MenuTemplate,
  sel: MenuSelections
): MenuChargeLine[] {
  const lines: MenuChargeLine[] = [];
  const guests = sel.guests ?? { men: 0, women: 0, children: 0 };
  const adults = (guests.men || 0) + (guests.women || 0);
  const party = adults + (guests.children || 0);
  const a = sel.answers ?? {};

  for (const s of template.sections) {
    if (!isVisible(s, a)) continue;
    const side = s.side === "men" ? guests.men || 0 : s.side === "women" ? guests.women || 0 : party;
    const raw = a[s.key];

    // gather selected option labels
    let selected: string[] = [];
    if (s.type === "choose" || s.type === "toggle") {
      if (typeof raw === "string" && raw) selected = [raw];
    } else if (s.type === "multi") {
      if (Array.isArray(raw)) selected = raw as string[];
    } else if (s.type === "qty") {
      // raw: Record<label, qty>
      const q = (raw ?? {}) as Record<string, number>;
      for (const opt of s.options ?? []) {
        const qty = Number(q[opt.label] ?? 0);
        if (qty > 0 && opt.price) {
          const { qty: cq, unit } = priceAmount(opt.price, { party, adults, side, qty, pqty: qty });
          lines.push({ description: `${s.title}: ${opt.label}`, quantity: cq, unit_price: unit, taxable: true });
        }
      }
      continue;
    } else if (s.type === "text") {
      // text with a section_price = priced when filled (e.g. second chicken +$5pp)
      if (typeof raw === "string" && raw.trim() && s.section_price && s.section_price.model !== "per_person_by_count") {
        const { qty, unit } = priceAmount(
          { model: s.section_price.model, amount: s.section_price.amount } as PriceModel,
          { party, adults, side, qty: 1, pqty: 1 }
        );
        lines.push({ description: s.title, quantity: qty, unit_price: unit, taxable: true });
      }
      continue;
    } else {
      continue; // info
    }

    // option-level surcharges
    for (const label of selected) {
      const opt = (s.options ?? []).find((o) => o.label === label);
      if (opt?.price) {
        // per_person_qty options look for a companion answer "<key>__qty_<label>"
        const pqty = Number(a[`${s.key}__qty_${label}`] ?? 0) || side;
        const { qty, unit } = priceAmount(opt.price, { party, adults, side, qty: 1, pqty });
        lines.push({ description: `${s.title}: ${label}`, quantity: qty, unit_price: unit, taxable: true });
      }
    }

    // section-level price when anything is selected (and not an explicit "No ..." option)
    const meaningful = selected.filter((l) => !/^no\b/i.test(l));
    if (s.section_price && meaningful.length > 0) {
      if (s.section_price.model === "per_person_by_count") {
        const unit = s.section_price.by_count[String(meaningful.length)] ?? 0;
        if (unit > 0) lines.push({ description: `${s.title} (${meaningful.length})`, quantity: side, unit_price: unit, taxable: true });
      } else {
        const { qty, unit } = priceAmount(
          { model: s.section_price.model, amount: s.section_price.amount } as PriceModel,
          { party, adults, side, qty: 1, pqty: 1 }
        );
        lines.push({ description: s.title, quantity: qty, unit_price: unit, taxable: true });
      }
    }
  }
  return lines.filter((l) => l.quantity > 0 && l.unit_price !== 0);
}

// ─── Base package total from template ───
export function menuBaseTotal(template: MenuTemplate, sel: MenuSelections): number {
  const g = sel.guests ?? { men: 0, women: 0, children: 0 };
  // Adult heads come from either the gendered fields (men+women) or the
  // non-gendered "adults" field — whichever the rep used.
  const adults = (g.adults || 0) > 0 ? (g.adults || 0) : (g.men || 0) + (g.women || 0);
  return adults * template.base.adult_pp + (g.children || 0) * template.base.child_pp;
}
