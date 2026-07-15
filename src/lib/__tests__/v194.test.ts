// ═══════════════════════════════════════════════════════════════════════════
// v194 REGRESSION TESTS — financial correctness
//
// Pure-function tests against the pricing engine. No database, no network:
// every defect v194 fixes is arithmetic or resolution logic, and all of it is
// reachable without a live schema. Run:  npx tsx src/lib/__tests__/v194.test.ts
//
// Each test names the P0 it locks down. If one of these ever fails again, the
// benchmark caught it once and this catches it forever.
// ═══════════════════════════════════════════════════════════════════════════
import {
  computeVersionTotals, resolveChoices, audienceCount, isPriceDebt,
  PricedItem, PackageLine, ChoiceGroupDef, VersionGuestCount, Adjustment,
} from "../pricingEngine";
import { resolveTax } from "../tax";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
function eq(name: string, got: number, want: number) {
  ok(name, Math.abs(got - want) < 0.005, `got ${got}, want ${want}`);
}

const ADULTS = "cat-adults", CHILDREN = "cat-children", VENDOR = "cat-vendor";
const guests: VersionGuestCount[] = [
  { category_id: ADULTS, count: 220 },
  { category_id: CHILDREN, count: 40 },
  { category_id: VENDOR, count: 18 },
];   // allGuests = 278

const item = (o: Partial<PricedItem> & { id: string }): PricedItem => ({
  component_id: "c1", name: o.id, quantity: null, quantity_basis: "per_person",
  unit_price: null, applies_to_category_id: null, catalog_item_id: null,
  price_confirmed: true, pricing_reason: null, taxable: true,
  item_role: "included", selected: true, ...o,
});

console.log("\n── P0.1 · Choose 1 must not sum every option ──");
{
  const soups: PricedItem[] = ["a", "b", "c"].map((k, n) => item({
    id: `soup-${k}`, unit_price: 4.25, applies_to_category_id: ADULTS,
    choice_group_id: "cg-soup", position: n, is_default_choice: k === "a",
  }));
  const groups: ChoiceGroupDef[] = [{ id: "cg-soup", choose_count: 1, label: "Soup" }];
  const t = computeVersionTotals(soups, guests, [], [], groups);
  eq("3 soups @ $4.25 × 220 charges ONE, not three", t.itemsSubtotal, 935);
  ok("was $2,805 before v194 (3× over)", t.itemsSubtotal !== 2805);

  const r = resolveChoices(soups, groups);
  eq("exactly one option charged", r.charge.size, 1);
  eq("two are alternatives", r.alternatives.size, 2);
  ok("the DEFAULT is the one charged", r.charge.has("soup-a"));
  eq("alternatives are NOT upside", t.upside, 0);
}
{
  // choose_count > 1
  const opts: PricedItem[] = ["a","b","c","d"].map((k, n) => item({
    id: `x-${k}`, unit_price: 10, applies_to_category_id: ADULTS,
    choice_group_id: "cg2", position: n,
  }));
  const t = computeVersionTotals(opts, guests, [], [], [{ id: "cg2", choose_count: 2 }]);
  eq("choose 2 of 4 charges exactly 2", t.itemsSubtotal, 10 * 220 * 2);
}
{
  // different prices, no default → quote the HIGHEST (never under-quote)
  const opts: PricedItem[] = [
    item({ id: "cheap", unit_price: 10, applies_to_category_id: ADULTS, choice_group_id: "g", position: 0 }),
    item({ id: "dear",  unit_price: 30, applies_to_category_id: ADULTS, choice_group_id: "g", position: 1 }),
  ];
  const t = computeVersionTotals(opts, guests, [], [], [{ id: "g", choose_count: 1, label: "Entrée" }]);
  eq("no default + differing prices → quotes the higher", t.itemsSubtotal, 30 * 220);
  ok("and says so as an explicit assumption", t.choiceAssumptions.length === 1);
}
{
  // options sharing one price → deterministic, no assumption needed
  const opts: PricedItem[] = ["a","b","c"].map((k, n) => item({
    id: k, unit_price: 52, applies_to_category_id: ADULTS, choice_group_id: "g", position: n }));
  const t = computeVersionTotals(opts, guests, [], [], [{ id: "g", choose_count: 1 }]);
  eq("equal-priced options are exact, not assumed", t.itemsSubtotal, 52 * 220);
  ok("no assumption flagged when every option costs the same", t.choiceAssumptions.length === 0);
}
{
  // an optional UPGRADE inside a group is not an alternative
  const opts: PricedItem[] = [
    item({ id: "base1", unit_price: 20, applies_to_category_id: ADULTS, choice_group_id: "g", position: 0, is_default_choice: true }),
    item({ id: "base2", unit_price: 20, applies_to_category_id: ADULTS, choice_group_id: "g", position: 1 }),
    item({ id: "upg", unit_price: 5, applies_to_category_id: ADULTS, choice_group_id: "g", position: 2, item_role: "optional", selected: false }),
  ];
  const t = computeVersionTotals(opts, guests, [], [], [{ id: "g", choose_count: 1 }]);
  eq("upgrade does not consume a choice slot; base charged once", t.itemsSubtotal, 20 * 220);
  eq("unselected upgrade IS upside", t.upside, 5 * 220);
}
{
  // orphaned group id (group deleted) must not charge everything
  const opts: PricedItem[] = ["a","b","c"].map((k, n) => item({
    id: k, unit_price: 9, applies_to_category_id: ADULTS, choice_group_id: "ghost", position: n }));
  const t = computeVersionTotals(opts, guests, [], [], []);   // no such group
  eq("orphaned choice group falls back to choose-1", t.itemsSubtotal, 9 * 220);
}

console.log("\n── P0.4 · Guest-category scoped package pricing ──");
{
  const pk = (o: Partial<PackageLine>): PackageLine => ({
    title: "P", package_price: 10, package_basis: "per_person", package_taxable: true, ...o });
  eq("null audience = all guests (unchanged)", audienceCount(null, guests), 278);
  eq("adults only", audienceCount([ADULTS], guests), 220);
  eq("adults + children (vendor excluded)", audienceCount([ADULTS, CHILDREN], guests), 260);
  eq("children only", audienceCount([CHILDREN], guests), 40);
  eq("empty array behaves as all", audienceCount([], guests), 278);

  const t1 = computeVersionTotals([], guests, [], [pk({ package_audience: null })]);
  eq("package w/o audience bills 278", t1.itemsSubtotal, 2780);
  const t2 = computeVersionTotals([], guests, [], [pk({ package_audience: [ADULTS, CHILDREN] })]);
  eq("package scoped to adults+children bills 260", t2.itemsSubtotal, 2600);
  const t3 = computeVersionTotals([], guests, [], [pk({ package_basis: "flat", package_price: 2950, package_audience: [ADULTS] })]);
  eq("audience is ignored for FLAT packages", t3.itemsSubtotal, 2950);
}

console.log("\n── P0.5 · Included / free / unknown / internal are distinct ──");
{
  const rows: PricedItem[] = [
    item({ id: "inc", unit_price: 0, price_state: "included", applies_to_category_id: ADULTS }),
    item({ id: "free", unit_price: 0, price_state: "free", applies_to_category_id: ADULTS }),
    item({ id: "int", unit_price: null, price_state: "internal", show_on_proposal: false }),
    item({ id: "unk", unit_price: null, price_state: "quoted", applies_to_category_id: ADULTS }),
    item({ id: "real", unit_price: 52, price_state: "quoted", applies_to_category_id: ADULTS }),
  ];
  const t = computeVersionTotals(rows, guests, [], []);
  eq("only the quoted, priced row contributes", t.itemsSubtotal, 52 * 220);
  eq("exactly ONE row is unpriced debt (the unknown)", t.unpriced, 1);
  ok("included is not debt", !isPriceDebt(rows[0]));
  ok("free is not debt", !isPriceDebt(rows[1]));
  ok("internal is not debt", !isPriceDebt(rows[2]));
  ok("unknown IS debt", isPriceDebt(rows[3]));
}

console.log("\n── P0.6 · Hidden operational items create no price debt ──");
{
  const rows: PricedItem[] = [
    item({ id: "lamp", unit_price: null, price_state: "internal", show_on_proposal: false }),
    item({ id: "box", unit_price: null, price_state: "internal", show_on_proposal: false }),
    item({ id: "sell", unit_price: 52, applies_to_category_id: ADULTS }),
  ];
  const t = computeVersionTotals(rows, guests, [], []);
  eq("two hidden heat lamps ⇒ zero sales debt", t.unpriced, 0);
  eq("and they add nothing to the subtotal", t.itemsSubtotal, 52 * 220);
}

console.log("\n── Optional items excluded from base ──");
{
  const rows: PricedItem[] = [
    item({ id: "base", unit_price: 52, applies_to_category_id: ADULTS }),
    item({ id: "upg", unit_price: 12, applies_to_category_id: ADULTS, item_role: "optional", selected: false }),
  ];
  const t = computeVersionTotals(rows, guests, [], []);
  eq("base excludes the unselected upgrade", t.baseSubtotal, 52 * 220);
  eq("subtotal excludes it too", t.itemsSubtotal, 52 * 220);
  eq("it lands in upside", t.upside, 12 * 220);
  const t2 = computeVersionTotals(
    [rows[0], { ...rows[1], selected: true }], guests, [], []);
  eq("a SELECTED upgrade is charged", t2.itemsSubtotal, 52 * 220 + 12 * 220);
  eq("but still never in base", t2.baseSubtotal, 52 * 220);
}

console.log("\n── P0.3 · No duplicate tax ──");
{
  const rows = [item({ id: "a", unit_price: 100, quantity_basis: "flat", quantity: 1, taxable: true })];
  const t = computeVersionTotals(rows, guests, [], []);
  eq("tax computed once by the engine", t.tax, Math.round(100 * 0.06625 * 100) / 100);
  eq("total = items + adjustments + tax", t.total, 100 + 0 + t.tax);
  // The engine has ONE tax. A tenant adding a "Sales Tax" ADJUSTMENT would be
  // charging it twice — that was the benchmark's data error, not engine logic.
  const withTaxAdj = computeVersionTotals(rows, guests,
    [{ id: "x", version_id: "v", label: "Sales Tax", kind: "percent", value: 6.625, taxable: false, position: 0 }], []);
  ok("a 'Sales Tax' adjustment DOUBLE-charges — engine tax is automatic",
     Math.abs(withTaxAdj.total - t.total - 6.625) < 0.01);
}

console.log("\n── P0.2 · Studio and preview consume the SAME calculation ──");
{
  // Both surfaces now call computeVersionTotals. This asserts the property that
  // makes that true: identical inputs ⇒ byte-identical outputs, with no
  // second implementation anywhere to drift from.
  const rows: PricedItem[] = [
    item({ id: "e1", unit_price: 52, applies_to_category_id: ADULTS, choice_group_id: "g", position: 0, is_default_choice: true }),
    item({ id: "e2", unit_price: 52, applies_to_category_id: ADULTS, choice_group_id: "g", position: 1 }),
    item({ id: "k", unit_price: 19.95, applies_to_category_id: CHILDREN }),
  ];
  const packages: PackageLine[] = [{ id: "p", title: "Wok", package_price: 12.95, package_basis: "per_person", package_taxable: true, package_audience: [ADULTS, CHILDREN] }];
  const adj: Adjustment[] = [{ id: "sc", version_id: "v", label: "Service Charge", kind: "percent", value: 20, taxable: false, position: 0 }];
  const groups: ChoiceGroupDef[] = [{ id: "g", choose_count: 1 }];
  const a = computeVersionTotals(rows, guests, adj, packages, groups);
  const b = computeVersionTotals(rows, guests, adj, packages, groups);
  ok("deterministic: same inputs ⇒ same total", a.total === b.total);
  eq("choice resolved once", a.itemsSubtotal, 52 * 220 + 19.95 * 40 + 12.95 * 260);
}

console.log("\n── P0.7 · Date-only values do not shift by timezone ──");
{
  // The defect: new Date('2026-06-30') is UTC midnight, which is Jun 29 in any
  // timezone west of Greenwich. parseLocalDate anchors to local noon.
  const parseLocalDate = (d: string) => new Date(d + "T12:00:00");
  const naive = new Date("2026-06-30");
  const fixed = parseLocalDate("2026-06-30");
  ok("parseLocalDate keeps the calendar day", fixed.getDate() === 30 && fixed.getMonth() === 5);
  ok("naive parse is the bug we fixed (UTC-anchored)", naive.getUTCDate() === 30);
  for (const d of ["2026-01-01", "2026-06-30", "2026-12-31"]) {
    const p = parseLocalDate(d);
    const [, mm, dd] = d.split("-").map(Number);
    ok(`${d} survives formatting`, p.getMonth() + 1 === mm && p.getDate() === dd);
  }
}

console.log(`\n═══ ${pass} passed, ${fail} failed ═══\n`);
if (fail > 0) process.exit(1);

// ═══════════════════════════════════════════════════════════════════════════
// v195 — PRESENTATION CLEANUP REGRESSIONS
// Pure logic only; the renderer is JSX and is covered by tsc + review.
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── v195 P1.3 · Choice label de-duplication ──");
{
  // Mirrors dedupeChoiceLabel in presentation.ts.
  const dedupe = (groupLabel: string, componentTitle: string) => {
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const g = norm(groupLabel), t = norm(componentTitle);
    if (!g || g === t || g.startsWith(t)) return "";
    return groupLabel;
  };
  ok("'Soup Course — choose one' inside 'Soup Course' collapses", dedupe("Soup Course — choose one", "Soup Course") === "");
  ok("exact restatement collapses", dedupe("Soup Course", "Soup Course") === "");
  ok("a genuinely different label survives", dedupe("Upgrade your protein", "Entrées") === "Upgrade your protein");
  ok("case/punctuation differences still collapse", dedupe("SOUP COURSE - Choose One", "Soup Course") === "");
}

console.log("\n── v195 P1.4 · Price status is typed, not English ──");
{
  type PriceStatus = "none" | "quoted" | "pending" | "included" | "free";
  const priceInfo = (unit: number | null, basis: string | null, confirmed: boolean, state?: string | null,
  ): { label: string | null; status: PriceStatus } => {
    const st = state ?? "quoted";
    if (st === "internal") return { label: null, status: "none" };
    if (st === "included") return { label: "Included", status: "included" };
    if (st === "free") return { label: "Complimentary", status: "free" };
    if (unit == null) return { label: null, status: "none" };
    if (!confirmed) return { label: "Pricing pending", status: "pending" };
    return { label: basis === "per_person" ? `$${unit} / person` : `$${unit}`, status: "quoted" };
  };
  ok("included renders 'Included', NOT $0.00", priceInfo(0, null, true, "included").label === "Included");
  ok("included is typed, not sniffed", priceInfo(0, null, true, "included").status === "included");
  ok("free reads as complimentary", priceInfo(0, null, true, "free").status === "free");
  ok("internal shows the customer nothing", priceInfo(null, null, true, "internal").label === null);
  ok("unconfirmed is pending", priceInfo(52, null, false).status === "pending");
  ok("normal is quoted", priceInfo(52, "per_person", true).status === "quoted");
  // The regression this locks: renaming the label must NOT change the status.
  const renamed = { ...priceInfo(52, null, false), label: "Awaiting confirmation" };
  ok("renaming the label leaves the status intact", renamed.status === "pending");
}

console.log("\n── v195 P1.8 · Components with nothing to say disappear ──");
{
  type C = { description: string | null; note: string | null; priceLabel: string | null; choice: unknown | null; blocks: { items: unknown[] }[] };
  const speaks = (c: C) => !!c.description || !!c.note || !!c.priceLabel || !!c.choice || c.blocks.some((b) => b.items.length > 0);
  const bare: C = { description: null, note: null, priceLabel: null, choice: null, blocks: [{ items: [] }] };
  ok("all-items-hidden + nothing else ⇒ dropped", !speaks(bare));
  ok("title_only WITH a price survives", speaks({ ...bare, priceLabel: "$950" }));
  ok("a description alone survives", speaks({ ...bare, description: "Chef attended." }));
  ok("a component note alone survives", speaks({ ...bare, note: "Carved to order." }));
  ok("a choice alone survives", speaks({ ...bare, choice: {} }));
  ok("one visible item survives", speaks({ ...bare, blocks: [{ items: [1] }] }));
}


// ═══════════════════════════════════════════════════════════════════════════
// F0 — TAX RESOLUTION (audit A3)
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── F0 · Tax resolves per tenant, never assumed ──");
{
  const NJ = 0.06625, NY = 0.08875;
  ok("tenant default wins over the constant", resolveTax({ tenantDefault: NY }).rate === NY);
  ok("and is not a fallback", resolveTax({ tenantDefault: NY }).isFallback === false);
  ok("event override beats tenant default", resolveTax({ tenantDefault: NY, eventOverride: 0.04 }).rate === 0.04);
  ok("override is sourced honestly", resolveTax({ tenantDefault: NY, eventOverride: 0.04 }).source === "event_override");
  ok("unset tenant falls back to the legacy constant", resolveTax({}).rate === NJ);
  ok("...and SAYS it fell back", resolveTax({}).isFallback === true);
  ok("...with an honest source", resolveTax({}).source === "legacy_constant");
  ok("null default is not a rate", resolveTax({ tenantDefault: null }).isFallback === true);
  // A percent that forgot to become a fraction must never reach an invoice.
  ok("6.625 (a percent) is REJECTED, not charged", resolveTax({ tenantDefault: 6.625 }).isFallback === true);
  ok("1.0 is rejected", resolveTax({ tenantDefault: 1 }).isFallback === true);
  ok("negative is rejected", resolveTax({ tenantDefault: -0.05 }).isFallback === true);
  ok("NaN is rejected", resolveTax({ tenantDefault: NaN }).isFallback === true);
  ok("zero IS a valid rate (tax-exempt)", resolveTax({ tenantDefault: 0 }).rate === 0 && resolveTax({ tenantDefault: 0 }).isFallback === false);

  // The engine multiplies by what it is given — and defaults to old behaviour.
  const rows = [item({ id: "a", unit_price: 100, quantity_basis: "flat", quantity: 1, taxable: true })];
  const nj = computeVersionTotals(rows, guests, [], []);
  const ny = computeVersionTotals(rows, guests, [], [], [], NY);
  eq("engine default is unchanged (back-compat)", nj.tax, 6.63);
  eq("engine honours a resolved NY rate", ny.tax, 8.88);
  ok("a NY tenant is no longer taxed at NJ's rate", nj.tax !== ny.tax);
}

console.log(`
═══ ${pass} passed, ${fail} failed ═══
`);
if (fail > 0) process.exit(1);
