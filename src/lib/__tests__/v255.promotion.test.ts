// v255 (BP-5) — PROMOTION. Normalization is pure: design in, lawful BP-2
// content + a NAMED stripping report out, validated by BP-2's own
// validator (one shape, one law). Partial scope is first-class. Money
// converts to INTENT, never to a copied confirmation. The ceremony
// produces DRAFTS only — no publish call exists anywhere in the slice
// (server-proven PM-1..PM-6 on real Postgres: one-promotion-one-blueprint,
// the barred belt, busy targets, the untouched design, tenancy, no guessed
// names). The v182 reconciliation lands: the legacy pointer surface is
// retired in place, readable, unlinked, superseded by the lawful ceremony.
import * as fs from "fs";
import { normalizeDesignToContent } from "../blueprintPromote";
import { validateBlueprintContent, BARRED_KEYS } from "../blueprintContent";
import { MaterializedDesign } from "../blueprintDivergence";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const design = (): MaterializedDesign => ({
  sections: [{ section_type_id: "role-a", position: 0 }, { section_type_id: "role-b", position: 1 }],
  components: [
    { id: "c1", title: "Sushi", section_type_id: "role-a", definition_id: "d1", instantiation_id: "i1",
      pricing_mode: "package", package_price: 1800, package_price_confirmed: true,
      config: { schemeId: "live-chef", choices: { service: "live_chef" }, scalars: { attendants: 2 } },
      seed_config_revision: "cfg1",
      items: [{ name: "Salmon", unit_price: 12, price_confirmed: true }, { name: "Dragon Roll", unit_price: null, price_confirmed: false }] },
    { id: "c2", title: "Mystery", section_type_id: "role-b", definition_id: null, instantiation_id: null,
      pricing_mode: "itemized", package_price: null, package_price_confirmed: false,
      config: null, seed_config_revision: null, items: [] },
  ],
  presentation: {
    theme_key: "classic",
    theme_override: { colors: { accent: "#123456" }, treatments: { sections: { "role-a": { tone: "warm" } }, components: { c1: { emphasis: "hero" } } } },
    photo_pins: { sections: { "role-a": { id: "p1" } }, cover: { id: "p9" } },
  },
  guests: [{ category_id: "adults", count: 120 }],
});
const names = { "role-a": "Cocktail Hour", "role-b": "Dinner" };

T("NORMALIZATION IS THE BP-3 REVERSAL: schemeId→scheme, choices+scalars→values, items→selections (include, no prices), package money→authored-suggestion intent, portable rebuilt (delta without treatments, sectionDress from treatments.sections, pins split) — and the result passes BP-2's validator", () => {
  const plan = normalizeDesignToContent(design(), names, { sections: "all", components: "all" }, "Test Chapter");
  ok(plan.validation.ok, `refused: ${JSON.stringify(plan.validation.refusals)}`);
  const s0 = plan.content.structure[0].sections[0];
  ok(s0.role === "role-a" && s0.title === "Cocktail Hour", "role + name");
  const e = s0.entries[0];
  ok(e.definitionId === "d1", "definition identity travels");
  ok(e.configuration.scheme === "live-chef" && e.configuration.values["service"] === "live_chef" && e.configuration.values["attendants"] === 2,
    `config reversal: ${JSON.stringify(e.configuration)}`);
  ok(e.itemSelections.length === 2 && e.itemSelections.every((i) => i.include && !("unit_price" in i)), "selections carry names, never prices");
  ok(e.pricingIntent !== null && e.pricingIntent.form === "authored-suggestion" && (e.pricingIntent as { amount: number }).amount === 1800,
    "package → suggestion intent");
  const p = plan.content.presentation!;
  ok(p.portable.themeKey === "classic", "theme travels");
  ok(!("treatments" in (p.portable.delta as Record<string, unknown>)), "treatments must not ride the delta");
  ok(JSON.stringify(p.portable.sectionDress) === JSON.stringify({ "role-a": { tone: "warm" } }), "section dress extracted");
  ok((p.portable.documentPin as { id: string }).id === "p9", "cover → documentPin");
  ok(p.provenance === null, "promotion invents no template provenance");
});

T("EVERYTHING STRIPPED IS STRIPPED BY NAME: guests, item prices, the confirmed-price conversion, bound dress, and the defless component each appear in the staged report — nothing leaves silently", () => {
  const plan = normalizeDesignToContent(design(), names, { sections: "all", components: "all" }, "T");
  const reasons = plan.stripped.map((s) => s.reason);
  for (const r of ["STRIPPED_GUESTS", "STRIPPED_ITEM_PRICES", "CONFIRMED_PRICE_TO_SUGGESTION", "STRIPPED_BOUND_DRESS", "SKIPPED_NO_DEFINITION"]) {
    ok(reasons.includes(r as never), `${r} missing from the report: ${JSON.stringify(reasons)}`);
  }
  ok(plan.stripped.find((s) => s.reason === "SKIPPED_NO_DEFINITION")!.at === "Mystery", "the skipped component is named");
});

T("PARTIAL PROMOTION IS FIRST-CLASS: scoping to one section carries only it, the rest appear as OUT_OF_SCOPE by name, and the scoped result still validates", () => {
  const plan = normalizeDesignToContent(design(), names, { sections: ["role-a"], components: "all" }, "T");
  ok(plan.content.structure[0].sections.length === 1 && plan.content.structure[0].sections[0].role === "role-a", "scope not honored");
  ok(plan.stripped.some((s) => s.reason === "OUT_OF_SCOPE" && s.at === "Dinner"), "the left-behind section is named");
  ok(plan.validation.ok, "scoped result must validate");
  const noC1 = normalizeDesignToContent(design(), names, { sections: "all", components: ["c2"] }, "T");
  ok(noC1.content.structure[0].sections[0].entries.length === 0, "component scope not honored");
  ok(noC1.stripped.some((s) => s.reason === "OUT_OF_SCOPE" && s.at === "Sushi"), "the left-behind component is named");
});

T("§5 NOTHING BARRED CAN BE EMITTED: the normalized content's keys never intersect BP-2's barred set — the design's guest counts, confirmations, and prices structurally cannot survive normalization", () => {
  const plan = normalizeDesignToContent(design(), names, { sections: "all", components: "all" }, "T");
  const seen: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object" && v !== null) {
      for (const [k, c] of Object.entries(v)) { seen.push(k); walk(c); }
    }
  };
  walk(plan.content);
  const leaked = seen.filter((k) => BARRED_KEYS.has(k));
  ok(leaked.length === 0, `barred keys emitted: ${JSON.stringify(leaked)}`);
  ok(validateBlueprintContent(plan.content).ok, "validator disagreement");
});

T("MONEY BECOMES INTENT, NEVER FIXED-PACKAGE: promotion cannot invent a policy, so a confirmed design price arrives as authored-suggestion with the conversion named — no fixed-package form is ever produced by normalization", () => {
  const plan = normalizeDesignToContent(design(), names, { sections: "all", components: "all" }, "T");
  const forms = plan.content.structure[0].sections.flatMap((s) => s.entries)
    .map((e) => e.pricingIntent?.form).filter(Boolean);
  ok(!forms.includes("fixed-package"), `normalization produced fixed-package: ${JSON.stringify(forms)}`);
  const src = fs.readFileSync("src/lib/blueprintPromote.ts", "utf8");
  ok(!src.includes('"fixed-package"'), "the module can construct the fixed form");
});

T("DRAFTS ONLY — THE PIN SET: no promotion file calls or imports publishRevision; the migration's RPC contains no publish statement and inserts exactly one identity and one revision; the server proof covers PM-1..PM-6", () => {
  const pure = fs.readFileSync("src/lib/blueprintPromote.ts", "utf8");
  const data = fs.readFileSync("src/lib/blueprintPromoteSupabase.ts", "utf8");
  const surf = fs.readFileSync("src/components/PromoteToBlueprint.tsx", "utf8");
  for (const [name, src] of [["blueprintPromote.ts", pure], ["blueprintPromoteSupabase.ts", data], ["PromoteToBlueprint.tsx", surf]] as const) {
    ok(!src.includes("publishRevision") && !src.includes("publish_blueprint_revision"), `${name} reaches publication`);
  }
  const sql = fs.readFileSync("supabase/v255_promotion.sql", "utf8");
  const rpc = sql.slice(sql.indexOf("promote_design_to_draft"));
  ok(!/update public\.blueprint_revisions\s+set state/i.test(rpc), "the RPC changes revision state");
  ok(!rpc.includes("published_revision_id ="), "the RPC touches the offered pointer");
  ok((rpc.match(/insert into public\.blueprint_identities/g) ?? []).length === 1, "identity inserts ≠ 1");
  ok((rpc.match(/insert into public\.blueprint_revisions/g) ?? []).length === 1, "revision inserts ≠ 1");
  const proof = fs.readFileSync("supabase/tests/v255_proof.sql", "utf8");
  for (const c of ["PM-1", "PM-2", "PM-3", "PM-4", "PM-5", "PM-6"]) ok(proof.includes(`PASS ${c}`), `proof missing ${c}`);
});

T("ONE WORDING, ONE SOURCE for the barred belt: the SQL walker's key array equals BP-2's BARRED_KEYS exactly", () => {
  const sql = fs.readFileSync("supabase/v255_promotion.sql", "utf8");
  const m = sql.match(/barred text\[\] := array\[([\s\S]*?)\];/);
  ok(m !== null, "walker array missing");
  const sqlKeys = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  const tsKeys = Array.from(BARRED_KEYS).sort();
  ok(JSON.stringify(sqlKeys) === JSON.stringify(tsKeys),
    `belt drift — sql:${sqlKeys.length} ts:${tsKeys.length} — first diff: ${sqlKeys.find((k, i) => k !== tsKeys[i]) ?? tsKeys.find((k, i) => k !== sqlKeys[i])}`);
});

T("THE v182 RECONCILIATION: the legacy nav entry is gone, the legacy page carries the retirement notice and stays readable, the legacy module still exists untouched by imports from the promotion slice, and provenance uses a plain uuid (no FK — a recorded fact, not a dependency)", () => {
  const sidebar = fs.readFileSync("src/components/Sidebar.tsx", "utf8");
  ok(!sidebar.includes('href: "/blueprints"'), "legacy nav entry survives");
  ok(sidebar.includes('href: "/blueprint-shelf"'), "the shelf entry vanished");
  const legacy = fs.readFileSync("src/app/blueprints/page.tsx", "utf8");
  ok(legacy.includes("data-legacy-retired") && legacy.includes("BlueprintsInner"), "retired-in-place banner + readable list");
  ok(fs.existsSync("src/lib/blueprints.ts"), "the legacy module was deleted — history must stay readable");
  for (const f of ["src/lib/blueprintPromote.ts", "src/lib/blueprintPromoteSupabase.ts", "src/components/PromoteToBlueprint.tsx"]) {
    const src = fs.readFileSync(f, "utf8");
    ok(!src.includes('@/lib/blueprints"') && !src.includes('.from("blueprints")'), `${f} touches the legacy world`);
  }
  const sql = fs.readFileSync("supabase/v255_promotion.sql", "utf8");
  ok(sql.includes("promoted_from_version_id uuid;") && !/promoted_from_version_id uuid references/.test(sql),
    "provenance must be a plain uuid, never a foreign key");
});

console.log(`\nv255.promotion: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
