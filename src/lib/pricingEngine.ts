// ═══════════════════════════════════════════════════════════════════════════
// PRICING ENGINE (v178) — present intent, present history, record the decision.
//
// PRICE MEMORY is derived, never stored: queries over items in APPROVED
// proposal versions and OPERATIONAL components of real events. Draft prices
// are negotiation exhaust and never enter memory. Match quality is labeled:
//   lineage  — found in this component's copied_from ancestry (strongest)
//   catalog  — same catalog_item_id
//   name     — exact title match ("same name" — shown, never silently trusted)
// Range appears only at 3+ sales in 12 months, always with its count.
//
// TOTALS: per_person items multiply against the version's frozen guest
// counts (by category, or all). Percent adjustments compute against the
// components subtotal ONLY — adjustments never compound. Tax uses the same
// the resolved tax rate the invoice uses (F0: lib/tax.ts resolves it;
// this engine only multiplies by it).
//
// GENERATION: approval offers one-way generation into charges, each line
// stamped source_proposal_version_id. Regeneration from a later version
// diffs first and never touches unstamped (manual) lines.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase, logActivity } from "./supabase";
import { PRICING } from "./pricing";

export interface GuestCategory { id: string; name: string; position: number; active: boolean; }
export interface VersionGuestCount { category_id: string; count: number; }
export interface Adjustment {
  id: string; version_id: string; label: string;
  kind: "percent" | "flat"; value: number; taxable: boolean; position: number;
}
export interface PricedItem {
  id: string; component_id: string; name: string;
  quantity: number | null; quantity_basis: string | null;
  unit_price: number | null; applies_to_category_id: string | null;
  catalog_item_id: string | null; price_confirmed: boolean;
  pricing_reason: string | null; taxable?: boolean;
  /** 'included' = normal line; 'optional' = upgrade. Optional + !selected
   *  contributes to Potential Upside only — never totals, invoices, memory. */
  item_role?: "included" | "optional";
  selected?: boolean;
  /** Presentation copy attached to the item — a complete sentence, printed
   *  as given (v191: renamed from served_with; no longer accompaniment-only). */
  presentation_note?: string | null;
  /** Component-local presentation category key; null = ungrouped. */
  category_key?: string | null;
  /** Customer-facing visibility. false = internal-only (kept for cost/ops/
   *  purchasing, never rendered on the proposal). Default true. */
  show_on_proposal?: boolean;
  /** v194 P0.1: THE root cause of choice groups being charged in full — this
   *  field did not exist, so computeVersionTotals was structurally blind to
   *  choice groups. It could not have been fixed with arithmetic. */
  choice_group_id?: string | null;
  is_default_choice?: boolean;
  position?: number;
  /** v194 P0.5: what unit_price MEANS. See v194 SQL. */
  price_state?: PriceState;
}

/** v194 P0.5 — the four authored intents that unit_price/NULL/0 used to carry
 *  ambiguously. "Pending" is NOT here: it stays price_confirmed=false, which
 *  is orthogonal (a quoted price can be pending; an included one cannot). */
export type PriceState = "quoted" | "included" | "free" | "internal";

/** Does this row contribute a sell line at all? */
export const isFinancial = (i: { price_state?: PriceState }) =>
  (i.price_state ?? "quoted") === "quoted";

/** Would a missing price on this row be real debt a salesperson must clear?
 *  v194 P0.6: an internal-only heat lamp is NOT sales debt. */
export const isPriceDebt = (i: { price_state?: PriceState; unit_price: number | null }) =>
  isFinancial(i) && i.unit_price == null;
export const isActive = (i: PricedItem) => i.item_role !== "optional" || i.selected !== false;

// ── v194 P0.1: DETERMINISTIC CHOICE-GROUP RESOLUTION ────────────────────────
// A choice group offers N alternatives of which the customer takes
// `choose_count`. Charging all N is a fabrication; charging none is a
// different fabrication. Neither may depend on the customer having decided —
// a quote must be answerable the moment it is authored.
//
// THREE BUCKETS, not two. An unchosen ALTERNATIVE is not "upside": upside
// means "might be added on top"; an alternative will never be added, it will
// be swapped. Conflating them inflates Potential Upside by the entire menu.
//
// Rule (deterministic, no customer selection required):
//   1. Candidates = group members that are not excluded optional upgrades.
//   2. Explicit defaults (is_default_choice) win, by position, up to N.
//   3. Short of N, fill by HIGHEST unit price, then position. Never
//      under-quote: an over-quote is visible and correctable, an under-quote
//      is discovered at the invoice.
//   4. Charge exactly min(N, candidates). The rest are alternatives.
//   5. Where every option shares one price the rule is a no-op — any
//      selection yields the same figure, so the quote is exact, not assumed.
export interface ChoiceGroupDef { id: string; choose_count: number; label?: string }
export interface ChoiceResolution {
  charge: Set<string>;        // item ids that DO price
  alternatives: Set<string>;  // group members that do not (and are not upside)
  assumptions: { groupId: string; label: string; detail: string }[];
}

export function resolveChoices(items: PricedItem[], groups: ChoiceGroupDef[]): ChoiceResolution {
  const charge = new Set<string>();
  const alternatives = new Set<string>();
  const assumptions: ChoiceResolution["assumptions"] = [];

  const byGroup = new Map<string, PricedItem[]>();
  for (const i of items) {
    const g = i.choice_group_id;
    if (!g) continue;
    const arr = byGroup.get(g);
    if (arr) arr.push(i); else byGroup.set(g, [i]);
  }
  const defOf = new Map<string, ChoiceGroupDef>();
  for (const g of groups) defOf.set(g.id, g);

  const pos = (i: PricedItem) => i.position ?? 0;
  const price = (i: PricedItem) => i.unit_price ?? 0;

  byGroup.forEach((members, gid) => {
    const def = defOf.get(gid);
    // An orphaned choice_group_id (group deleted) must not silently charge
    // every member. Fall back to choose-1 — conservative and predictable.
    const n = Math.max(1, def?.choose_count ?? 1);
    const label = def?.label ?? "Choice group";

    // An optional upgrade sitting inside a group is an ADD-ON to the choice,
    // not one of the alternatives. It is governed by item_role/selected and
    // never consumes a choice slot.
    const upgrades = members.filter((m) => m.item_role === "optional");
    const candidates = members.filter((m) => m.item_role !== "optional");

    const chosen: PricedItem[] = candidates
      .filter((m) => m.is_default_choice)
      .sort((a, b) => pos(a) - pos(b))
      .slice(0, n);

    if (chosen.length < n) {
      const rest = candidates
        .filter((m) => !chosen.includes(m))
        .sort((a, b) => price(b) - price(a) || pos(a) - pos(b));
      const need = n - chosen.length;
      chosen.push(...rest.slice(0, need));
      const prices = new Set(candidates.map(price));
      if (rest.length > need && prices.size > 1) {
        assumptions.push({
          groupId: gid, label,
          detail: `No default marked — quoting the ${need} highest-priced of ${candidates.length} options.`,
        });
      }
    }
    for (const m of candidates) (chosen.includes(m) ? charge : alternatives).add(m.id);
    // Upgrades keep normal optional semantics (charged iff selected).
    for (const u of upgrades) charge.add(u.id);
  });
  return { charge, alternatives, assumptions };
}

/** Guests covered by a package audience. NULL/empty = all guests (v194 P0.4). */
export function audienceCount(audience: string[] | null | undefined, guests: VersionGuestCount[]): number {
  if (!audience || audience.length === 0) return guests.reduce((s, g) => s + g.count, 0);
  return guests.reduce((s, g) => (audience.includes(g.category_id) ? s + g.count : s), 0);
}

/** A package-mode component contributes one line. Callers must pass only
 *  items belonging to ITEMIZED components (a package's leftover items are
 *  hidden and never counted), plus the packages themselves here. */
export interface PackageLine {
  /** v194: component id — lets a caller scope packages to a section. */
  id?: string;
  title: string;
  package_price: number | null;
  package_basis: string | null;          // flat | per_person
  package_taxable?: boolean | null;
  package_price_confirmed?: boolean | null;
  /** v194 P0.4: guest categories this per-person package applies to.
   *  null/empty = all guests. */
  package_audience?: string[] | null;
}
export interface CatalogItem {
  id: string; name: string; domain: string; quantity_basis: string | null;
  srp: number | null; srp_set_at: string | null; unit_cost: number | null; active: boolean;
}

// ── Guest categories ──
export async function loadGuestCategories(): Promise<GuestCategory[]> {
  const { data } = await supabase.from("guest_categories")
    .select("id,name,position,active").eq("active", true).order("position");
  return (data ?? []) as GuestCategory[];
}

// ── Memory ──
export interface MemoryPoint {
  unit_price: number; quantity_basis: string | null;
  customer: string; event_type: string | null; date: string | null;
  guests: number | null; booking_id: string;
  match: "lineage" | "catalog" | "name";
}
export interface PriceMemory {
  points: MemoryPoint[];               // newest first, capped
  range: { low: number; high: number; count: number } | null;  // 12mo, 3+ sales
}

/** Walk a component's copied_from ancestry (bounded). */
async function ancestryOf(componentId: string | null, maxDepth = 6): Promise<Set<string>> {
  const seen = new Set<string>();
  let cur = componentId;
  for (let d = 0; d < maxDepth && cur; d++) {
    const { data } = await supabase.from("event_components")
      .select("copied_from").eq("id", cur).maybeSingle();
    const parent = (data as { copied_from: string | null } | null)?.copied_from ?? null;
    if (!parent || seen.has(parent)) break;
    seen.add(parent);
    cur = parent;
  }
  return seen;
}

/** Approved-version item ids (for the sold-only rule). Archived versions are
 *  RETRACTED from commercial knowledge — excluded here so their prices never
 *  enter memory, ranges, or last-sold. A simple filter, never a rewrite. */
async function approvedVersionIds(): Promise<string[]> {
  const { data } = await supabase.from("proposal_versions").select("id")
    .eq("status", "approved").is("archived_at", null);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export async function loadPriceMemory(item: {
  name: string; catalog_item_id: string | null; component_id: string | null;
}): Promise<PriceMemory> {
  // Candidate sold items: same catalog id OR exact name (ilike, exact string).
  let q = supabase.from("component_items")
    .select("unit_price,quantity_basis,component_id,catalog_item_id,name,item_role,selected")
    .not("unit_price", "is", null);
  q = item.catalog_item_id
    ? q.or(`catalog_item_id.eq.${item.catalog_item_id},name.ilike.${item.name.replace(/[,%()]/g, " ").trim()}`)
    : q.ilike("name", item.name.replace(/[,%()]/g, " ").trim());
  const { data: rows } = await q.limit(200);
  const items = ((rows ?? []) as { unit_price: number; quantity_basis: string | null; component_id: string; catalog_item_id: string | null; name: string; item_role?: string; selected?: boolean }[])
    .filter((i) => i.item_role !== "optional" || i.selected !== false); // unchosen = never sold
  if (!items.length) return { points: [], range: null };

  // Resolve their components → keep only SOLD ones: operational, or in an approved version.
  const compIds = Array.from(new Set(items.map((i) => i.component_id)));
  const { data: comps } = await supabase.from("event_components")
    .select("id,booking_id,proposal_version_id").in("id", compIds);
  const compRows = (comps ?? []) as { id: string; booking_id: string; proposal_version_id: string | null }[];
  const approved = new Set(await approvedVersionIds());
  const soldComp: Record<string, { booking_id: string }> = {};
  for (const c of compRows) {
    if (c.proposal_version_id === null || approved.has(c.proposal_version_id)) {
      soldComp[c.id] = { booking_id: c.booking_id };
    }
  }

  const ancestors = await ancestryOf(item.component_id);
  const bookingIds = Array.from(new Set(Object.values(soldComp).map((c) => c.booking_id)));
  const { data: bks } = bookingIds.length
    ? await supabase.from("bookings").select("id,contact_name,event_type,event_date,est_guests").in("id", bookingIds)
    : { data: [] };
  const bMap: Record<string, { contact_name: string; event_type: string | null; event_date: string | null; est_guests: number | null }> = {};
  for (const b of (bks ?? []) as { id: string; contact_name: string; event_type: string | null; event_date: string | null; est_guests: number | null }[]) bMap[b.id] = b;

  const points: MemoryPoint[] = [];
  for (const i of items) {
    const sc = soldComp[i.component_id];
    if (!sc) continue;
    const bk = bMap[sc.booking_id];
    if (!bk) continue;
    points.push({
      unit_price: i.unit_price, quantity_basis: i.quantity_basis,
      customer: bk.contact_name, event_type: bk.event_type, date: bk.event_date,
      guests: bk.est_guests, booking_id: sc.booking_id,
      match: ancestors.has(i.component_id) ? "lineage"
        : (item.catalog_item_id && i.catalog_item_id === item.catalog_item_id) ? "catalog" : "name",
    });
  }
  // lineage first, then newest
  points.sort((a, z) => {
    const rank = (m: MemoryPoint["match"]) => (m === "lineage" ? 0 : m === "catalog" ? 1 : 2);
    if (rank(a.match) !== rank(z.match)) return rank(a.match) - rank(z.match);
    return (z.date ?? "").localeCompare(a.date ?? "");
  });

  // 12-month range, 3+ sales only, always with count.
  const cutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const recent = points.filter((p) => (p.date ?? "") >= cutoff);
  const range = recent.length >= 3
    ? { low: Math.min(...recent.map((p) => p.unit_price)), high: Math.max(...recent.map((p) => p.unit_price)), count: recent.length }
    : null;

  return { points: points.slice(0, 3), range };
}

// ── Totals ──
export interface VersionTotals {
  itemsSubtotal: number;      // included + SELECTED options
  baseSubtotal: number;       // included only ("Base")
  upside: number;             // unselected options ("Potential Upside")
  adjustmentsTotal: number;
  taxable: number;        // taxable base (items marked taxable + taxable adjustments)
  tax: number;
  total: number;
  unconfirmed: number;    // count of carried, not-yet-confirmed prices
  unpriced: number;       // v194: rows in state 'quoted' with NO price — real sales debt.
                          //       internal/included/free rows are NOT counted.
  /** v194 P0.1: choice groups quoted without an explicit default — the figure
   *  rests on an assumption the salesperson should see, not discover. */
  choiceAssumptions: { groupId: string; label: string; detail: string }[];
}

export function computeVersionTotals(
  items: PricedItem[],
  guests: VersionGuestCount[],
  adjustments: Adjustment[],
  packages: PackageLine[] = [],
  choiceGroups: ChoiceGroupDef[] = [],
  /** F0: the RESOLVED tax rate for this event (see lib/tax.ts). The engine
   *  stays pure — it does no IO and knows nothing about tenants. Omitted =
   *  the legacy NJ constant, so every existing caller is unchanged until it
   *  opts in. */
  taxRate: number = PRICING.TAX_RATE,
): VersionTotals {
  const allGuests = guests.reduce((s, g) => s + g.count, 0);
  const countFor = (categoryId: string | null) =>
    categoryId === null ? allGuests : (guests.find((g) => g.category_id === categoryId)?.count ?? 0);

  // v194 P0.1 — resolve choice groups BEFORE summing anything.
  const choice = resolveChoices(items, choiceGroups);

  let itemsSubtotal = 0, baseSubtotal = 0, upside = 0, taxableBase = 0, unconfirmed = 0, unpriced = 0;
  for (const i of items) {
    // v194 P0.5 — non-'quoted' rows carry no financial line by construction.
    // v194 P0.6 — and therefore create no price debt either.
    if (!isFinancial(i)) continue;
    if (i.unit_price == null) { unpriced++; continue; }

    // v194 P0.1 — an unchosen ALTERNATIVE is neither charged nor upside.
    if (i.choice_group_id && choice.alternatives.has(i.id)) continue;

    const line =
      i.quantity_basis === "per_person" ? i.unit_price * countFor(i.applies_to_category_id)
      : i.unit_price * (i.quantity ?? 1);
    if (!isActive(i)) { upside += line; continue; }   // unselected UPGRADE: upside only
    if (!i.price_confirmed) unconfirmed++;
    itemsSubtotal += line;
    if (i.item_role !== "optional") baseSubtotal += line;
    if (i.taxable) taxableBase += line;
  }

  for (const pk of packages) {
    if (pk.package_price == null) { unpriced++; continue; }
    if (pk.package_price_confirmed === false) unconfirmed++;
    // v194 P0.4 — a package multiplies against its AUDIENCE, not blindly
    // against every guest. NULL audience preserves the old meaning (all).
    const line = pk.package_basis === "per_person"
      ? pk.package_price * audienceCount(pk.package_audience, guests)
      : pk.package_price;
    itemsSubtotal += line; baseSubtotal += line;
    if (pk.package_taxable !== false) taxableBase += line;
  }

  // Percent adjustments: against ITEMS SUBTOTAL only — never compounding.
  let adjustmentsTotal = 0;
  for (const a of [...adjustments].sort((x, z) => x.position - z.position)) {
    const amt = a.kind === "percent" ? (itemsSubtotal * a.value) / 100 : a.value;
    adjustmentsTotal += amt;
    if (a.taxable) taxableBase += amt;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const tax = r2(taxableBase * taxRate);   // F0: resolved, not assumed
  return {
    itemsSubtotal: r2(itemsSubtotal),
    baseSubtotal: r2(baseSubtotal),
    upside: r2(upside),
    adjustmentsTotal: r2(adjustmentsTotal),
    taxable: r2(taxableBase),
    tax,
    total: r2(itemsSubtotal + adjustmentsTotal + tax),
    unconfirmed, unpriced,
    choiceAssumptions: choice.assumptions,
  };
}

// ── Promotion: "save as standard price" ──
export async function promoteToCatalog(item: {
  id: string; name: string; unit_price: number | null; quantity_basis: string | null;
  catalog_item_id: string | null;
}, domain: string): Promise<{ ok: boolean; detail?: string; catalogId?: string }> {
  if (item.unit_price == null) return { ok: false, detail: "Price the item first." };
  if (item.catalog_item_id) {
    const { error } = await supabase.from("catalog_items").update({
      srp: item.unit_price, srp_set_at: new Date().toISOString(), quantity_basis: item.quantity_basis,
    }).eq("id", item.catalog_item_id);
    return error ? { ok: false, detail: error.message } : { ok: true, catalogId: item.catalog_item_id };
  }
  const { data, error } = await supabase.from("catalog_items").insert({
    name: item.name, domain, quantity_basis: item.quantity_basis,
    srp: item.unit_price, srp_set_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !data) return { ok: false, detail: error?.message ?? "insert failed — run v178 SQL" };
  await supabase.from("component_items").update({ catalog_item_id: data.id }).eq("id", item.id);
  return { ok: true, catalogId: data.id };
}

// ── Invoice generation ──
export interface GenerationPlan {
  add: { description: string; quantity: number; unit_price: number; taxable: boolean }[];
  removeStamped: number;    // existing lines from OTHER versions of any proposal on this booking
  manualUntouched: number;  // unstamped lines that will not be touched
}

export async function planGeneration(
  bookingId: string, versionId: string,
  items: PricedItem[], comps: { id: string; title: string }[],
  guests: VersionGuestCount[], adjustments: Adjustment[],
  packages: PackageLine[] = [],
): Promise<GenerationPlan> {
  const allGuests = guests.reduce((s, g) => s + g.count, 0);
  const countFor = (cid: string | null) =>
    cid === null ? allGuests : (guests.find((g) => g.category_id === cid)?.count ?? 0);
  const titleOf: Record<string, string> = {};
  for (const c of comps) titleOf[c.id] = c.title;

  const add: GenerationPlan["add"] = [];
  for (const i of items) {
    if (i.unit_price == null) continue;
    if (!isActive(i)) continue;   // unchosen options are never sold
    const qty = i.quantity_basis === "per_person" ? countFor(i.applies_to_category_id) : (i.quantity ?? 1);
    if (qty <= 0) continue;
    add.push({
      description: `${i.name}${titleOf[i.component_id] ? ` — ${titleOf[i.component_id]}` : ""}`,
      quantity: qty, unit_price: i.unit_price, taxable: !!i.taxable,
    });
  }
  const allCount = guests.reduce((s2, g) => s2 + g.count, 0);
  for (const pk of packages) {
    if (pk.package_price == null) continue;
    const perPerson = pk.package_basis === "per_person";
    if (perPerson && allCount <= 0) continue;
    add.push({
      description: pk.title,
      quantity: perPerson ? allCount : 1,
      unit_price: pk.package_price,
      taxable: pk.package_taxable !== false,
    });
  }
  let itemsSubtotal = 0;
  for (const a of add) itemsSubtotal += a.quantity * a.unit_price;
  for (const a of [...adjustments].sort((x, z) => x.position - z.position)) {
    const amt = a.kind === "percent" ? Math.round(itemsSubtotal * a.value) / 100 : a.value;
    if (amt !== 0) add.push({ description: a.label, quantity: 1, unit_price: Math.round(amt * 100) / 100, taxable: a.taxable });
  }

  const { data: existing } = await supabase.from("charges")
    .select("id,source_proposal_version_id").eq("booking_id", bookingId);
  const rows = (existing ?? []) as { id: string; source_proposal_version_id: string | null }[];
  return {
    add,
    removeStamped: rows.filter((r) => r.source_proposal_version_id !== null).length,
    manualUntouched: rows.filter((r) => r.source_proposal_version_id === null).length,
  };
}

/** Executes the plan: deletes ONLY stamped lines, inserts the new stamped set.
 *  Manual (unstamped) lines are never touched. */
export async function executeGeneration(
  booking: { id: string; invoice_num: string },
  versionId: string, versionLabel: string, plan: GenerationPlan,
): Promise<{ ok: boolean; detail?: string }> {
  const { error: delErr } = await supabase.from("charges")
    .delete().eq("booking_id", booking.id).not("source_proposal_version_id", "is", null);
  if (delErr) return { ok: false, detail: delErr.message };
  if (plan.add.length) {
    const { error: insErr } = await supabase.from("charges").insert(plan.add.map((a) => ({
      booking_id: booking.id, description: a.description, quantity: a.quantity,
      unit_price: a.unit_price, taxable: a.taxable, source_proposal_version_id: versionId,
    })));
    if (insErr) return { ok: false, detail: insErr.message };
  }
  await logActivity(booking.id, booking.invoice_num, "Invoice Generated from Proposal",
    `🧾 ${plan.add.length} line${plan.add.length === 1 ? "" : "s"} from ${versionLabel}${plan.removeStamped ? ` (replaced ${plan.removeStamped} prior proposal line${plan.removeStamped === 1 ? "" : "s"})` : ""}; ${plan.manualUntouched} manual line${plan.manualUntouched === 1 ? "" : "s"} untouched.`);
  return { ok: true };
}
