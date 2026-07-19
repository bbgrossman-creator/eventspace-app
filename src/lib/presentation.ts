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
import { parseLocalDate } from "./workflow";
import { resolveTaxForTenant } from "./tax";
import { computeVersionTotals, PricedItem, PackageLine, Adjustment, VersionGuestCount, ChoiceGroupDef } from "./pricingEngine";
import { loadSession } from "./permissions";

/** v195 P1.4 — the renderer must never branch on English. A price label is
 *  copy; a price STATUS is data. Renaming the label used to silently break the
 *  amber styling, with no type error and no failing test. */
export type PriceStatus = "none" | "quoted" | "pending" | "included" | "free";

export interface PresentationItem {
  name: string;
  description: string | null;
  price: number | null;          // null when not shown (visibility/basis)
  priceLabel: string | null;     // "$18 / person", "$450", "Included", or null
  priceStatus: PriceStatus;      // v195 P1.4: what the label MEANS
  /** Presentation copy attached to the item — a complete sentence, printed as
   *  given. NOT accompaniment-only: "Served with au jus", "Carved to order",
   *  "Choose one sauce". (v191: renamed from servedWith; the renderer no longer
   *  prefixes anything.) */
  note: string | null;
  optional: boolean;             // an upgrade the customer may add
  /** v196 X-RAY. These fields are populated ONLY when the model is built with
   *  { xray: true }, and are undefined otherwise — so a customer-facing build
   *  cannot leak them even by accident. The renderer shows them only in X-ray;
   *  the projection decides they exist at all. Belt and braces, deliberately:
   *  this is the one place where a leak is a breach rather than a bug. */
  internal?: boolean;            // show_on_proposal = false — never sent
  unconfirmed?: boolean;         // a carried price awaiting confirmation
  hiddenReason?: string | null;  // why the customer won't see this
}
export interface PresentationChoiceGroup {
  label: string; chooseCount: number;
  /** v195 P1.7: choices honour the layout system like any other run of items. */
  layout: "vertical" | "comma" | "dot";
  options: { name: string; description: string | null; priceLabel: string | null; priceStatus: PriceStatus }[];
}
/** A run of items rendered together — one category, or the ungrouped run.
 *  Presentation-only: no pricing, no identity beyond its component. */
export interface PresentationBlock {
  label: string | null;          // null = the ungrouped run
  showHeading: boolean;          // false = render items without the heading
  layout: "vertical" | "comma" | "dot";
  items: PresentationItem[];
}
export interface PresentationComponent {
  title: string;
  description: string | null;    // customer_description (description mode)
  /** v195 P1.2: copy about the COMPONENT ("Carved to order by our chefs") —
   *  no longer welded to a representative item. */
  note: string | null;
  isPackage: boolean;
  priceLabel: string | null;     // shown per visibility
  priceStatus: PriceStatus;      // v195 P1.4
  blocks: PresentationBlock[];   // empty unless display mode is 'items'
  /** v195 P1.1: the choice belonging to THIS component, rendered in place
   *  rather than orphaned at the foot of the section. */
  choice: PresentationChoiceGroup | null;
}
export interface PresentationBand {
  label: string;                 // "" for ungrouped run
  description: string | null;
  components: PresentationComponent[];
}
export interface PresentationSection {
  /** v226 — the PRESENTATION IDENTITY treatments attach to (§6.2):
   *  the section-as-published, keyed by its section type within this
   *  publication ("__none__" for the unassigned tail). */
  id: string;
  name: string;
  bands: PresentationBand[];
  choiceGroups: PresentationChoiceGroup[];
  subtotalLabel: string | null;  // shown when visibility = sections
}
/** v195 — the ending, made intentional. Derived entirely from the canonical
 *  totals; stores nothing, decides nothing. A projection of a projection. */
export interface PresentationSummary {
  lines: { label: string; amount: string }[];
  totalLabel: string;
  preparedFor: string | null;
  preparedBy: string | null;
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
  summary: PresentationSummary | null;  // v195: shown only at full visibility
}

/** v195 P1.3 — "Soup Course — choose one" inside the "Soup Course" component
 *  is the same words twice. If the group's label merely restates the component,
 *  drop it and let the card speak with "Choose N" alone. */
function dedupeChoiceLabel(groupLabel: string, componentTitle: string): string {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const g = norm(groupLabel), t = norm(componentTitle);
  if (!g || g === t || g.startsWith(t)) return "";
  return groupLabel;
}

/** v196: the compositional outline — chapters ▸ components ▸ items.
 *  A PROJECTION, not shell furniture (banked correction: a Layout lens's
 *  outline is rooms ▸ zones ▸ stations, so the rail belongs to a lens's
 *  rendering). Debt ROLLS UP so a chapter can say "something inside me is
 *  unresolved" without the user opening all 17 components. Derived on every
 *  build; never stored. */
export interface OutlineNodeModel {
  id: string; label: string; kind: "chapter" | "component" | "item";
  children?: OutlineNodeModel[]; debt?: number; internal?: boolean;
}

export function outlineFromModel(model: PresentationModel): OutlineNodeModel[] {
  return model.sections.map((sec, si) => {
    const comps: OutlineNodeModel[] = [];
    for (const band of sec.bands) {
      for (const comp of band.components) {
        const items: OutlineNodeModel[] = [];
        let compDebt = 0;
        for (const block of comp.blocks) {
          for (const it of block.items) {
            const d = (it.unconfirmed === true || it.priceStatus === "pending") ? 1 : 0;
            compDebt += d;
            items.push({
              id: `i:${si}:${comps.length}:${items.length}`, label: it.name,
              kind: "item", debt: d, internal: it.internal === true,
            });
          }
        }
        if (comp.priceStatus === "pending") compDebt += 1;
        comps.push({
          id: `c:${si}:${comps.length}`, label: comp.title, kind: "component",
          children: items.length ? items : undefined, debt: compDebt,
        });
      }
    }
    return {
      id: `s:${si}`, label: sec.name, kind: "chapter",
      children: comps.length ? comps : undefined,
      debt: comps.reduce((n, c) => n + (c.debt ?? 0), 0),
    };
  });
}

const money = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type ItemLayout = "vertical" | "comma" | "dot";
const LAYOUTS: ItemLayout[] = ["vertical", "comma", "dot"];
/** Anything unrecognised (or null) falls back to the safe vertical list. */
function normLayout(v: unknown): ItemLayout {
  return typeof v === "string" && (LAYOUTS as string[]).includes(v) ? (v as ItemLayout) : "vertical";
}

interface CategoryDef {
  key: string; label: string; position: number;
  layout: ItemLayout | null;        // null = inherit the component default
  showHeading: boolean | null;      // null = default (true, unless single-category)
}
/** Parse the component-local item_categories jsonb defensively: the DB only
 *  guarantees it's an array. Malformed entries are skipped rather than thrown —
 *  a bad category must never break a customer proposal. Explicit `position`
 *  drives order (array index is only a fallback), so a partial jsonb update
 *  can't silently reshuffle the menu. */
function parseCategories(raw: unknown): CategoryDef[] {
  if (!Array.isArray(raw)) return [];
  const out: CategoryDef[] = [];
  raw.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") return;
    const o = entry as Record<string, unknown>;
    if (typeof o.key !== "string" || !o.key) return;
    if (out.some((d) => d.key === o.key)) return;   // first definition wins
    out.push({
      key: o.key,
      label: typeof o.label === "string" && o.label.trim() ? o.label : o.key,
      position: typeof o.position === "number" ? o.position : idx * 10,
      layout: typeof o.layout === "string" && (LAYOUTS as string[]).includes(o.layout)
        ? (o.layout as ItemLayout) : null,
      showHeading: typeof o.show_heading === "boolean" ? o.show_heading : null,
    });
  });
  return out.sort((a, b) => a.position - b.position);
}

/** THE gateway. Given a proposal version, returns only what a customer may see.
 *  Enforces tenant ownership BEFORE returning anything — whitelisting stops
 *  internal-field leakage, but only this check stops cross-tenant access to
 *  another tenant's customer-safe proposal. Required while RLS is still off.
 *  Returns null on not-found OR unauthorized (indistinguishable to the caller,
 *  so a wrong UUID can't confirm a proposal exists in another tenant). */
/** v196: build options. `xray` includes the truths the customer never sees —
 *  internal-only items, unconfirmed flags — each marked for what it is. It is
 *  NOT a rendering flag: it changes what the MODEL CONTAINS, which is why a
 *  non-xray build cannot leak. Same projection, two models. */
export interface BuildOptions { xray?: boolean }

export async function buildPresentationModel(
  versionId: string, opts: BuildOptions = {},
): Promise<PresentationModel | null> {
  const xray = opts.xray === true;
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
  // v195: the customer's own name on their own proposal — not a PII widening.
  let prepFor: string | null = null;
  {
    const { data: bk } = await supabase.from("bookings")
      .select("event_type,event_date,est_guests,contact_name").eq("id", ownBookingId).maybeSingle();
    const b = bk as { event_type: string | null; event_date: string | null; est_guests: number | null; contact_name: string | null } | null;
    const parts: string[] = [];
    if (b?.event_type) parts.push(b.event_type);
    // v194 P0.7: event_date is a DATE column ('2026-06-30'). Raw new Date()
    // parses it as UTC midnight, which renders as the PREVIOUS day anywhere
    // west of Greenwich. parseLocalDate (which already existed and was simply
    // not used here) anchors it to local noon — immune to any offset.
    if (b?.event_date) parts.push(parseLocalDate(b.event_date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }));
    if (b?.est_guests) parts.push(`${b.est_guests} guests`);
    eventLine = parts.join(" · ");
    prepFor = b?.contact_name ?? null;
  }

  // Guests for per-person math.
  // v194 P0.2: category_id is required — the preview previously ignored
  // per-category targeting entirely and multiplied everything by ALL guests.
  const { data: g } = await supabase.from("version_guests").select("category_id,count").eq("version_id", versionId);
  const guestRows = ((g ?? []) as { category_id: string; count: number }[]);
  const guestCounts: VersionGuestCount[] = guestRows.map((x) => ({ category_id: x.category_id, count: x.count }));
  const totalGuests = guestRows.reduce((s, x) => s + x.count, 0);

  // v194 P0.2: adjustments were never fetched here, so the preview omitted the
  // service charge, the mashgiach fee and tax entirely.
  const { data: adjRows } = await supabase.from("version_adjustments")
    .select("label,kind,value,taxable,position").eq("version_id", versionId);
  const adjustments = ((adjRows ?? []) as Adjustment[]);

  const [{ data: sts }, { data: vsec }, { data: cgs }] = await Promise.all([
    supabase.from("section_types").select("id,name"),
    supabase.from("version_sections").select("section_type_id,position").eq("version_id", versionId).order("position"),
    supabase.from("choice_groups").select("id,section_type_id,component_id,label,choose_count,position").eq("version_id", versionId).order("position"),
  ]);
  const secName: Record<string, string> = {};
  for (const s of (sts ?? []) as { id: string; name: string }[]) secName[s.id] = s.name;

  const { data: cs } = await supabase.from("event_components")
    .select("id,title,section_type_id,group_label,group_position,group_description,pricing_mode,package_price,package_basis,package_taxable,package_price_confirmed,customer_description,notes,position,proposal_display,item_categories,item_layout,uncategorized_position,package_audience,presentation_note")
    .eq("proposal_version_id", versionId).order("position");
  const comps = (cs ?? []) as {
    id: string; title: string; section_type_id: string | null;
    group_label: string | null; group_position: number; group_description: string | null;
    pricing_mode: string; package_price: number | null; package_basis: string | null;
    package_taxable: boolean | null; package_price_confirmed: boolean;
    customer_description: string | null; notes: string | null; position: number;
    proposal_display: string | null;
    item_categories: unknown;
    item_layout: string | null;
    uncategorized_position: string | null;
    package_audience: string[] | null;
    presentation_note: string | null;
  }[];

  type ItemRow = { component_id: string; name: string; description: string | null; unit_price: number | null; quantity: number | null; quantity_basis: string | null; applies_to_category_id: string | null; item_role: string | null; selected: boolean; choice_group_id: string | null; price_confirmed: boolean; presentation_note: string | null; show_on_proposal: boolean; category_key: string | null; id: string; is_default_choice: boolean; position: number; price_state: string | null; taxable: boolean | null };
  const itemsBy: Record<string, ItemRow[]> = {};
  if (comps.length) {
    const { data: its } = await supabase.from("component_items")
      .select("id,component_id,name,description,unit_price,quantity,quantity_basis,applies_to_category_id,item_role,selected,choice_group_id,price_confirmed,presentation_note,show_on_proposal,category_key,is_default_choice,position,price_state,taxable")
      .in("component_id", comps.map((c) => c.id)).order("position");
    for (const i of (its ?? []) as ItemRow[]) {
      (itemsBy[i.component_id] ??= []).push(i);
    }
  }

  const lineCount = (basis: string | null, quantity: number | null) =>
    basis === "per_person" ? totalGuests : (quantity ?? 1);
  /** v195 P1.4 — returns the label AND its typed status, so the renderer never
   *  has to read English to decide how to style a price.
   *  v194 P0.5 states are honoured here: an "included" line says Included, and
   *  crucially does NOT read as an unpriced gap or a $0.00 insult. */
  const priceInfo = (
    unit: number | null, basis: string | null, confirmed: boolean, state?: string | null,
  ): { label: string | null; status: PriceStatus } => {
    if (visibility === "hidden") return { label: null, status: "none" };
    const st = state ?? "quoted";
    if (st === "internal") return { label: null, status: "none" };
    if (st === "included") return { label: "Included", status: "included" };
    if (st === "free") return { label: "Complimentary", status: "free" };
    if (unit == null) return { label: null, status: "none" };
    // Unconfirmed = historical price awaiting confirmation. NEVER show it as a
    // real number and NEVER let it read as included — say pricing is pending.
    if (!confirmed) return { label: "Pricing pending", status: "pending" };
    return {
      label: basis === "per_person" ? `${money(unit)} / person` : money(unit),
      status: "quoted",
    };
  };
  const priceLabelFor = (unit: number | null, basis: string | null, confirmed: boolean) =>
    priceInfo(unit, basis, confirmed).label;

  // Choice groups: collect their option items (by choice_group_id) to lift out
  // of normal component rendering and present as a "Choose N".
  const choiceItems: Record<string, PresentationChoiceGroup> = {};
  for (const cg of (cgs ?? []) as { id: string; section_type_id: string | null; label: string; choose_count: number; position: number }[]) {
    choiceItems[cg.id] = { label: cg.label, chooseCount: cg.choose_count, layout: "vertical", options: [] };
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
        const pi = priceInfo(i.unit_price, i.quantity_basis, i.price_confirmed, i.price_state);
        choiceItems[i.choice_group_id].options.push({
          name: i.name, description: i.description,
          priceLabel: pi.label, priceStatus: pi.status,
        });
      }
    }

    // Items render only in 'items' mode, and only those flagged
    // show_on_proposal. Internal-only items stay in the operational model for
    // cost/ops/purchasing but never reach the customer projection.
    // Each survivor keeps its category_key so it can be grouped below.
    type Pair = { item: PresentationItem; key: string | null };
    const pairs: Pair[] = [];
    const toItem = (i: (typeof rawItems)[number], optional: boolean): PresentationItem => ({
      name: i.name, description: i.description,
      price: null,
      priceLabel: priceInfo(i.unit_price, i.quantity_basis, i.price_confirmed, i.price_state).label,
      priceStatus: priceInfo(i.unit_price, i.quantity_basis, i.price_confirmed, i.price_state).status,
      note: i.presentation_note,
      optional,
      // Populated only under X-ray — see PresentationItem.
      ...(xray ? {
        internal: i.show_on_proposal === false,
        unconfirmed: i.price_confirmed === false,
        hiddenReason: i.show_on_proposal === false
          ? ((i.price_state ?? "quoted") === "internal" ? "Operational only" : "Hidden from proposal")
          : null,
      } : {}),
    });
    if (showItems) {
      // Drop unselected optional items, choice-group members (shown elsewhere),
      // and — UNLESS X-RAY — internal-only items.
      //
      // v196: under X-ray the internal rows come back, flagged. This is the
      // whole of "compose on the projection": the author sees the customer's
      // page WITH the truth showing, rather than a schematic beside a preview.
      for (const i of rawItems) {
        const customerVisible = i.show_on_proposal !== false;
        if (!i.choice_group_id && (customerVisible || xray)
            && (i.item_role !== "optional" || i.selected)) {
          pairs.push({ item: toItem(i, i.item_role === "optional"), key: i.category_key });
        }
      }
      // Offer UNSELECTED optionals as "available upgrade" only with full
      // visibility, and only if customer-visible. They trail their peers.
      if (visibility !== "hidden") {
        for (const i of rawItems) {
          if (!i.choice_group_id && i.show_on_proposal !== false
              && i.item_role === "optional" && !i.selected) {
            pairs.push({ item: toItem(i, true), key: i.category_key });
          }
        }
      }
    }

    // ── Group into presentation blocks ──────────────────────────────────────
    // Categories are component-local presentation metadata. An item whose
    // category_key matches no definition falls back to ungrouped: graceful by
    // design, since jsonb keys carry no FK integrity.
    const catDefs = parseCategories(c.item_categories);
    const compLayout = normLayout(c.item_layout);
    const byCat = new Map<string, PresentationItem[]>();
    const ungrouped: PresentationItem[] = [];
    for (const p of pairs) {
      const known = p.key != null && catDefs.some((d) => d.key === p.key);
      if (known) (byCat.get(p.key!) ?? byCat.set(p.key!, []).get(p.key!)!).push(p.item);
      else ungrouped.push(p.item);
    }

    // Keep each block paired with the def that produced it — labels may legally
    // repeat, so the def can only be re-identified by key.
    const catPairs: { def: CategoryDef; block: PresentationBlock }[] = [];
    for (const d of catDefs) {
      const its = byCat.get(d.key);
      if (!its || its.length === 0) continue;   // never print an empty heading
      catPairs.push({
        def: d,
        block: {
          label: d.label,
          showHeading: d.showHeading ?? true,
          layout: d.layout ?? compLayout,
          items: its,
        },
      });
    }

    // Single-category rule: one category and nothing ungrouped means the
    // heading only repeats what the component title already says — suppress it
    // unless that category explicitly asked to be shown.
    if (catPairs.length === 1 && ungrouped.length === 0) {
      catPairs[0].block.showHeading = catPairs[0].def.showHeading === true;
    }
    const catBlocks: PresentationBlock[] = catPairs.map((p) => p.block);

    const ungroupedBlock: PresentationBlock | null = ungrouped.length
      ? { label: null, showHeading: false, layout: compLayout, items: ungrouped }
      : null;

    // Ungrouped placement is a component choice, defaulting to bottom: a
    // stray uncategorized item must not leapfrog above Entrées.
    const blocks: PresentationBlock[] = !ungroupedBlock
      ? catBlocks
      : c.uncategorized_position === "top"
        ? [ungroupedBlock, ...catBlocks]
        : [...catBlocks, ungroupedBlock];

    // Description shows in 'description' mode (any component) OR when a package
    // component is set to items but we still want its blurb — v1: description
    // renders in description mode only; title_only shows neither.
    const compDescription = displayMode === "description" ? c.customer_description : null;

    // v195 P1.4 — the component price now carries a typed status too.
    const compPI = isPackage
      ? priceInfo(c.package_price, c.package_basis, c.package_price_confirmed)
      : { label: null, status: "none" as PriceStatus };

    // v195 P1.1/P1.3 — the choice that belongs to THIS component renders inside
    // it, not orphaned at the foot of the section. Its label is de-duplicated:
    // a group called "Soup Course — choose one" sitting inside the "Soup
    // Course" component was saying the same thing twice, so the component's own
    // title wins and the card just says "Choose N".
    const ownGroupId = (cgs ?? []).find(
      (g: { id: string; component_id: string | null }) => g.component_id === c.id,
    )?.id;
    const ownChoice = ownGroupId ? choiceItems[ownGroupId] : undefined;
    const choice: PresentationChoiceGroup | null =
      ownChoice && ownChoice.options.length > 0
        ? { ...ownChoice, layout: compLayout, label: dedupeChoiceLabel(ownChoice.label, c.title) }
        : null;

    built.push({
      sectionId: c.section_type_id ?? "__none__",
      band: (c.group_label ?? "").trim(),
      bandDesc: c.group_description,
      bandPos: c.group_label ? c.group_position : c.position + 100000,
      comp: {
        title: c.title,
        description: compDescription, // NEVER notes; only customer_description in description mode
        // v195 P1.2 — component-level copy, no longer welded to a proxy item.
        note: c.presentation_note,
        isPackage,
        priceLabel: compPI.label,
        priceStatus: compPI.status,
        blocks,
        choice,
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

  // ── v194 P0.2: ONE CANONICAL TOTALS CALCULATION ──────────────────────────
  // This function used to do its own arithmetic (`sumComp`), and it was wrong
  // in four independent ways versus the Studio, which is why the two surfaces
  // disagreed by $12,388.68:
  //   1. it EXCLUDED every choice-group item (the engine included them ALL);
  //   2. it ignored applies_to_category_id, multiplying by all 278 guests
  //      instead of the targeted category;
  //   3. it applied NO adjustments (service charge, mashgiach);
  //   4. it added NO tax.
  // A projection must never reconstruct the fact it projects. The renderer and
  // the Studio now consume the same computeVersionTotals output.
  const toPriced = (i: ItemRow & { id: string }): PricedItem => ({
    id: i.id, component_id: i.component_id, name: i.name,
    quantity: i.quantity, quantity_basis: i.quantity_basis,
    unit_price: i.unit_price, applies_to_category_id: i.applies_to_category_id,
    catalog_item_id: null, price_confirmed: i.price_confirmed,
    pricing_reason: null, taxable: i.taxable !== false,
    item_role: (i.item_role === "optional" ? "optional" : "included"),
    selected: i.selected, show_on_proposal: i.show_on_proposal,
    choice_group_id: i.choice_group_id, is_default_choice: i.is_default_choice,
    position: i.position,
    price_state: (i.price_state as PricedItem["price_state"]) ?? "quoted",
  });
  const itemizedIds = new Set(comps.filter((c) => c.pricing_mode !== "package").map((c) => c.id));
  const allPriced: PricedItem[] = [];
  for (const c of comps) {
    if (!itemizedIds.has(c.id)) continue;
    for (const i of (itemsBy[c.id] ?? [])) allPriced.push(toPriced(i as ItemRow & { id: string }));
  }
  const allPackages: PackageLine[] = comps.filter((c) => c.pricing_mode === "package").map((c) => ({
    id: c.id, title: c.title, package_price: c.package_price,
    package_basis: c.package_basis ?? "flat",
    package_taxable: c.package_taxable !== false,
    package_price_confirmed: c.package_price_confirmed,
    package_audience: c.package_audience,
  }));
  const groupDefs: ChoiceGroupDef[] = ((cgs ?? []) as { id: string; label: string; choose_count: number }[])
    .map((cg) => ({ id: cg.id, choose_count: cg.choose_count, label: cg.label }));

  // F0: resolve tax at the edge; the engine only multiplies.
  const taxRes = await resolveTaxForTenant();
  const canonical = computeVersionTotals(allPriced, guestCounts, adjustments, allPackages, groupDefs, taxRes.rate);

  /** Section subtotal: the SAME engine, scoped to one section and given no
   *  adjustments — so a subtotal can never drift from the grand total's rules. */
  const sumSection = (sid: string) => {
    const ids = new Set(comps.filter((c) => (c.section_type_id ?? "__none__") === sid).map((c) => c.id));
    return computeVersionTotals(
      allPriced.filter((i) => ids.has(i.component_id)),
      guestCounts, [], allPackages.filter((p) => p.id != null && ids.has(p.id)), groupDefs, taxRes.rate,
    ).itemsSubtotal;
  };
  const compById: Record<string, typeof comps[number]> = {};
  for (const c of comps) compById[c.id] = c;

  const sections: PresentationSection[] = [];
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
    // v195 P1.8 — a component whose every item is hidden, with no description,
    // no note, no price and no choice, has nothing to say to the customer. It
    // printed as a bare heading over blank space. Drop it — and drop any band
    // left empty as a result. (title_only components DO survive: a title and a
    // price IS the intended message there.)
    // v195 P1.8 unchanged in meaning — but note it now works FOR X-ray too:
    // the Sushi Condiments category (every item hidden) stays suppressed for
    // the customer and reappears under X-ray, because the model itself differs.
    const speaks = (comp: PresentationComponent) =>
      !!comp.description || !!comp.note || !!comp.priceLabel || !!comp.choice ||
      comp.blocks.some((b) => b.items.length > 0);

    const bands: PresentationBand[] = bandKeys.sort((a, z) => bandMeta[a].minPos - bandMeta[z].minPos)
      .map((k) => ({ label: bandMeta[k].label, description: bandMeta[k].desc, components: bandMeta[k].comps.filter(speaks) }))
      .filter((b) => b.components.length > 0);

    const secTotal = sumSection(sid);

    // v195 P1.1 — a group attached to a component already rendered INSIDE it.
    // Only unattached (legacy) groups still fall back to section level, so
    // nothing renders twice and old data keeps working.
    const groups = (cgs ?? [])
      .filter((cg: { section_type_id: string | null; component_id: string | null }) =>
        cg.component_id == null && (cg.section_type_id ?? "") === (sid === "__none__" ? "" : sid))
      .map((cg: { id: string }) => choiceItems[cg.id])
      .filter((x): x is PresentationChoiceGroup => !!x && x.options.length > 0);

    if (bands.length === 0 && groups.length === 0) continue;   // v195 P1.8
    sections.push({
      id: sid,
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

  // ── v195: the ending, made intentional ─────────────────────────────────
  // Every figure here comes from `canonical` — the same object the Studio
  // reads. The summary decides nothing and stores nothing; it is a projection
  // of a projection, which is why it cannot drift from the total above it.
  let summary: PresentationSummary | null = null;
  if (visibility === "full") {
    const lines: { label: string; amount: string }[] = [];
    const enhancements = canonical.itemsSubtotal - canonical.baseSubtotal;   // selected optionals
    if (canonical.baseSubtotal > 0) lines.push({ label: "Food & Beverage", amount: money(canonical.baseSubtotal) });
    if (enhancements > 0.005) lines.push({ label: "Enhancements", amount: money(enhancements) });
    // Adjustments are named by the tenant — never invented, never relabelled.
    for (const a of [...adjustments].sort((x, z) => x.position - z.position)) {
      const amt = a.kind === "percent" ? (canonical.itemsSubtotal * a.value) / 100 : a.value;
      if (Math.abs(amt) > 0.005) lines.push({ label: a.label, amount: money(amt) });
    }
    if (canonical.tax > 0.005) lines.push({ label: "Tax", amount: money(canonical.tax) });
    summary = {
      lines,
      totalLabel: money(canonical.total),
      preparedFor: prepFor,
      preparedBy: null,   // tenant identity is Phase 3 (theming) — not invented here
    };
  }

  return {
    title: prop?.title ?? "Proposal",
    eventLine,
    intro: ver.customer_intro,
    closing: ver.customer_closing,
    priceVisibility: visibility,
    sections,
    totalLabel: visibility === "full" ? money(canonical.total) : null,   // v194 P0.2: THE canonical number
    status: ver.status,
    hasUnconfirmedVisiblePrice,
    summary,
  };
}
