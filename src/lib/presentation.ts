// ═══════════════════════════════════════════════════════════════════════════
// PRESENTATION MODEL (v188A) — the single, field-whitelisted gateway from
// internal truth to customer view. EVERY proposal-facing surface (authenticated
// preview now, public share + PDF later) flows through buildPresentationModel.
//
// Security by construction: this model is a plain object containing ONLY what a
// customer may see. It has no concept of booking, tenant, vendor, cost, or
// internal note — those fields never enter it, so no renderer over it can leak
// them, independent of RLS. RLS is the moat; this whitelist is the wall.
//
// Translation (not mere copying) happens HERE:
//   • package components show customer_description, NEVER notes/vendor/cost
//   • unconfirmed/carried prices present as included, never "$0" or "⚠"
//   • unselected optional items are dropped (unless part of a choice group)
//   • bands become headings with their group_description
//   • price visibility (full | sections | hidden) is applied
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { loadSession } from "./permissions";

export interface PresentationItem {
  name: string;
  description: string | null;
  price: number | null;          // null when not shown (visibility/basis)
  priceLabel: string | null;     // "$18 / person", "$450", "Pricing pending", or null
  servedWith: string | null;     // accompaniment, e.g. "Whole-grain Dijon"
  optional: boolean;             // an upgrade the customer may add
}
export interface PresentationChoiceGroup {
  label: string; chooseCount: number;
  options: { name: string; description: string | null; priceLabel: string | null }[];
}
export interface PresentationComponent {
  title: string;
  description: string | null;    // customer_description (package) or null
  isPackage: boolean;
  priceLabel: string | null;     // shown per visibility
  items: PresentationItem[];     // empty for package mode
}
export interface PresentationBand {
  label: string;                 // "" for ungrouped run
  description: string | null;
  components: PresentationComponent[];
}
export interface PresentationSection {
  name: string;
  bands: PresentationBand[];
  choiceGroups: PresentationChoiceGroup[];
  subtotalLabel: string | null;  // shown when visibility = sections
}
export interface PresentationModel {
  title: string;
  eventLine: string;             // "Wedding · October 12, 2025 · 200 guests" — no customer PII beyond what they gave
  intro: string | null;
  closing: string | null;
  priceVisibility: "full" | "sections" | "hidden";
  sections: PresentationSection[];
  totalLabel: string | null;     // shown only when visibility = full
  status: string;                // draft | sent | approved … (for a "DRAFT" ribbon)
  hasUnconfirmedVisiblePrice: boolean;  // a visible price is still amber/carried
}

const money = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** THE gateway. Given a proposal version, returns only what a customer may see.
 *  Enforces tenant ownership BEFORE returning anything — whitelisting stops
 *  internal-field leakage, but only this check stops cross-tenant access to
 *  another tenant's customer-safe proposal. Required while RLS is still off.
 *  Returns null on not-found OR unauthorized (indistinguishable to the caller,
 *  so a wrong UUID can't confirm a proposal exists in another tenant). */
export async function buildPresentationModel(versionId: string): Promise<PresentationModel | null> {
  const { data: v } = await supabase.from("proposal_versions")
    .select("id,proposal_id,version,status,price_visibility,customer_intro,customer_closing")
    .eq("id", versionId).maybeSingle();
  if (!v) return null;
  const ver = v as { id: string; proposal_id: string; version: number; status: string; price_visibility: string; customer_intro: string | null; customer_closing: string | null };

  // ── Ownership gate ── resolve this version's tenant (version→proposal→
  // booking→tenant) and require it to match the caller's session tenant.
  const { data: pOwn } = await supabase.from("proposals").select("booking_id").eq("id", ver.proposal_id).maybeSingle();
  const ownBookingId = (pOwn as { booking_id: string } | null)?.booking_id;
  if (!ownBookingId) return null;
  const { data: bOwn } = await supabase.from("bookings").select("tenant_id").eq("id", ownBookingId).maybeSingle();
  const versionTenant = (bOwn as { tenant_id: string | null } | null)?.tenant_id ?? null;
  const session = await loadSession();
  // If the version carries a tenant, the caller must belong to it. (A null
  // session tenant only passes when the version is also untenanted — e.g. a
  // pre-tenancy single-tenant deploy — never as a cross-tenant wildcard.)
  if (versionTenant !== null && session?.tenantId !== versionTenant) return null;
  if (versionTenant === null && session == null) return null;
  const visibility = (["full", "sections", "hidden"].includes(ver.price_visibility) ? ver.price_visibility : "full") as "full" | "sections" | "hidden";

  const { data: p } = await supabase.from("proposals").select("title").eq("id", ver.proposal_id).maybeSingle();
  const prop = p as { title: string } | null;

  // Event line: only customer-appropriate facts (type, date, guests). No
  // internal status, invoice, tenant, or contact details beyond the name.
  let eventLine = "";
  {
    const { data: bk } = await supabase.from("bookings")
      .select("event_type,event_date,est_guests").eq("id", ownBookingId).maybeSingle();
    const b = bk as { event_type: string | null; event_date: string | null; est_guests: number | null } | null;
    const parts: string[] = [];
    if (b?.event_type) parts.push(b.event_type);
    if (b?.event_date) parts.push(new Date(b.event_date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }));
    if (b?.est_guests) parts.push(`${b.est_guests} guests`);
    eventLine = parts.join(" · ");
  }

  // Guests for per-person math.
  const { data: g } = await supabase.from("version_guests").select("count").eq("version_id", versionId);
  const totalGuests = ((g ?? []) as { count: number }[]).reduce((s, x) => s + x.count, 0);

  const [{ data: sts }, { data: vsec }, { data: cgs }] = await Promise.all([
    supabase.from("section_types").select("id,name"),
    supabase.from("version_sections").select("section_type_id,position").eq("version_id", versionId).order("position"),
    supabase.from("choice_groups").select("id,section_type_id,label,choose_count,position").eq("version_id", versionId).order("position"),
  ]);
  const secName: Record<string, string> = {};
  for (const s of (sts ?? []) as { id: string; name: string }[]) secName[s.id] = s.name;

  const { data: cs } = await supabase.from("event_components")
    .select("id,title,section_type_id,group_label,group_position,group_description,pricing_mode,package_price,package_basis,package_price_confirmed,customer_description,notes,position,proposal_display")
    .eq("proposal_version_id", versionId).order("position");
  const comps = (cs ?? []) as {
    id: string; title: string; section_type_id: string | null;
    group_label: string | null; group_position: number; group_description: string | null;
    pricing_mode: string; package_price: number | null; package_basis: string | null;
    package_price_confirmed: boolean;
    customer_description: string | null; notes: string | null; position: number;
    proposal_display: string | null;
  }[];

  type ItemRow = { component_id: string; name: string; description: string | null; unit_price: number | null; quantity: number | null; quantity_basis: string | null; applies_to_category_id: string | null; item_role: string | null; selected: boolean; choice_group_id: string | null; price_confirmed: boolean; served_with: string | null; show_on_proposal: boolean };
  const itemsBy: Record<string, ItemRow[]> = {};
  if (comps.length) {
    const { data: its } = await supabase.from("component_items")
      .select("component_id,name,description,unit_price,quantity,quantity_basis,applies_to_category_id,item_role,selected,choice_group_id,price_confirmed,served_with,show_on_proposal")
      .in("component_id", comps.map((c) => c.id)).order("position");
    for (const i of (its ?? []) as ItemRow[]) {
      (itemsBy[i.component_id] ??= []).push(i);
    }
  }

  const lineCount = (basis: string | null, quantity: number | null) =>
    basis === "per_person" ? totalGuests : (quantity ?? 1);
  const priceLabelFor = (unit: number | null, basis: string | null, confirmed: boolean) => {
    if (visibility === "hidden") return null;
    if (unit == null) return null;
    // Unconfirmed = historical price awaiting confirmation. NEVER show it as a
    // real number and NEVER let it read as included — say pricing is pending.
    if (!confirmed) return "Pricing pending";
    return basis === "per_person" ? `${money(unit)} / person` : money(unit);
  };

  // Choice groups: collect their option items (by choice_group_id) to lift out
  // of normal component rendering and present as a "Choose N".
  const choiceItems: Record<string, PresentationChoiceGroup> = {};
  for (const cg of (cgs ?? []) as { id: string; section_type_id: string | null; label: string; choose_count: number; position: number }[]) {
    choiceItems[cg.id] = { label: cg.label, chooseCount: cg.choose_count, options: [] };
  }

  // Build components, honoring translation rules.
  interface Built { sectionId: string; comp: PresentationComponent; band: string; bandDesc: string | null; bandPos: number; }
  const built: Built[] = [];
  for (const c of comps) {
    const isPackage = c.pricing_mode === "package";
    const rawItems = itemsBy[c.id] ?? [];

    // Proposal display mode decides how much of the component the customer sees.
    // Legacy rows without the column fall back to: package→description,
    // itemized→items (preserves prior behavior while fixing the "items never
    // rendered" bug for itemized components).
    const displayMode = (c.proposal_display ?? (isPackage ? "description" : "items")) as
      "title_only" | "description" | "items";
    const showItems = displayMode === "items";

    // Route choice-group items into their group, out of the normal list.
    for (const i of rawItems) {
      if (i.choice_group_id && choiceItems[i.choice_group_id]) {
        choiceItems[i.choice_group_id].options.push({
          name: i.name, description: i.description,
          priceLabel: priceLabelFor(i.unit_price, i.quantity_basis, i.price_confirmed),
        });
      }
    }

    // Items render only in 'items' mode, and only those flagged
    // show_on_proposal. Internal-only items stay in the operational model for
    // cost/ops/purchasing but never reach the customer projection.
    const presItems: PresentationItem[] = !showItems ? [] : rawItems
      // Drop unselected optional items, choice-group members (shown elsewhere),
      // and internal-only items.
      .filter((i) => !i.choice_group_id && i.show_on_proposal !== false
                     && (i.item_role !== "optional" || i.selected))
      .map((i) => ({
        name: i.name, description: i.description,
        price: null,
        priceLabel: priceLabelFor(i.unit_price, i.quantity_basis, i.price_confirmed),
        servedWith: i.served_with,
        optional: i.item_role === "optional",
      }));

    // Offer UNSELECTED optionals as "available upgrade" only in items mode with
    // full visibility, and only if customer-visible.
    if (showItems && visibility !== "hidden") {
      for (const i of rawItems) {
        if (!i.choice_group_id && i.show_on_proposal !== false
            && i.item_role === "optional" && !i.selected) {
          presItems.push({
            name: i.name, description: i.description, price: null,
            priceLabel: priceLabelFor(i.unit_price, i.quantity_basis, i.price_confirmed),
            servedWith: i.served_with, optional: true,
          });
        }
      }
    }

    // Description shows in 'description' mode (any component) OR when a package
    // component is set to items but we still want its blurb — v1: description
    // renders in description mode only; title_only shows neither.
    const compDescription = displayMode === "description" ? c.customer_description : null;

    const compPriceLabel = isPackage
      ? (visibility === "hidden" || c.package_price == null ? null
         : !c.package_price_confirmed ? "Pricing pending"
         : c.package_basis === "per_person" ? `${money(c.package_price)} / person` : money(c.package_price))
      : null;

    built.push({
      sectionId: c.section_type_id ?? "__none__",
      band: (c.group_label ?? "").trim(),
      bandDesc: c.group_description,
      bandPos: c.group_label ? c.group_position : c.position + 100000,
      comp: {
        title: c.title,
        description: compDescription, // NEVER notes; only customer_description in description mode
        isPackage,
        priceLabel: compPriceLabel,
        items: presItems,
      },
    });
  }

  // Assemble sections in version_sections order, then any extra referenced,
  // then ungrouped "__none__" last.
  const sectionOrder: string[] = [];
  const seen = new Set<string>();
  for (const vs of (vsec ?? []) as { section_type_id: string; position: number }[]) {
    if (secName[vs.section_type_id]) { sectionOrder.push(vs.section_type_id); seen.add(vs.section_type_id); }
  }
  for (const b of built) if (b.sectionId !== "__none__" && !seen.has(b.sectionId) && secName[b.sectionId]) { sectionOrder.push(b.sectionId); seen.add(b.sectionId); }
  if (built.some((b) => b.sectionId === "__none__")) sectionOrder.push("__none__");

  const sumComp = (c: typeof comps[number]) => {
    if (c.pricing_mode === "package") {
      if (c.package_price == null) return 0;
      return c.package_basis === "per_person" ? c.package_price * totalGuests : c.package_price;
    }
    return (itemsBy[c.id] ?? []).reduce((s, i) => {
      if (i.unit_price == null || i.choice_group_id) return s;
      if (i.item_role === "optional" && !i.selected) return s;
      return s + i.unit_price * lineCount(i.quantity_basis, i.quantity);
    }, 0);
  };
  const compById: Record<string, typeof comps[number]> = {};
  for (const c of comps) compById[c.id] = c;

  const sections: PresentationSection[] = [];
  let grandTotal = 0;
  for (const sid of sectionOrder) {
    const inSection = built.filter((b) => b.sectionId === sid);
    if (!inSection.length && sid === "__none__") continue;

    // Bands within section (min group_position rule).
    const bandKeys: string[] = [];
    const bandMeta: Record<string, { label: string; desc: string | null; minPos: number; comps: PresentationComponent[] }> = {};
    for (const b of inSection) {
      const k = b.band ? b.band.toLowerCase() : `__bare__${b.comp.title}${bandKeys.length}`;
      if (!bandMeta[k]) { bandMeta[k] = { label: b.band, desc: b.bandDesc, minPos: b.bandPos, comps: [] }; bandKeys.push(k); }
      bandMeta[k].comps.push(b.comp);
      bandMeta[k].minPos = Math.min(bandMeta[k].minPos, b.bandPos);
      if (!bandMeta[k].desc && b.bandDesc) bandMeta[k].desc = b.bandDesc;
    }
    const bands: PresentationBand[] = bandKeys.sort((a, z) => bandMeta[a].minPos - bandMeta[z].minPos)
      .map((k) => ({ label: bandMeta[k].label, description: bandMeta[k].desc, components: bandMeta[k].comps }));

    // Section subtotal (sum of its components).
    let secTotal = 0;
    for (const c of comps) if ((c.section_type_id ?? "__none__") === sid) secTotal += sumComp(c);
    grandTotal += secTotal;

    const groups = (cgs ?? []).filter((cg: { section_type_id: string | null }) => (cg.section_type_id ?? "") === (sid === "__none__" ? "" : sid))
      .map((cg: { id: string }) => choiceItems[cg.id]).filter((x): x is PresentationChoiceGroup => !!x && x.options.length > 0);

    sections.push({
      name: sid === "__none__" ? "More" : secName[sid],
      bands, choiceGroups: groups,
      subtotalLabel: visibility === "sections" ? money(secTotal) : null,
    });
  }

  // Flag: any visible commercial price still unconfirmed? (For the preview
  // warning and the future public-share block.)
  let hasUnconfirmedVisiblePrice = false;
  if (visibility !== "hidden") {
    for (const c of comps) {
      if (c.pricing_mode === "package") { if (c.package_price != null && !c.package_price_confirmed) hasUnconfirmedVisiblePrice = true; }
      else for (const i of (itemsBy[c.id] ?? [])) {
        if (i.unit_price != null && !i.price_confirmed && (i.item_role !== "optional" || i.selected)) hasUnconfirmedVisiblePrice = true;
      }
    }
  }

  return {
    title: prop?.title ?? "Proposal",
    eventLine,
    intro: ver.customer_intro,
    closing: ver.customer_closing,
    priceVisibility: visibility,
    sections,
    totalLabel: visibility === "full" ? money(grandTotal) : null,
    status: ver.status,
    hasUnconfirmedVisiblePrice,
  };
}
