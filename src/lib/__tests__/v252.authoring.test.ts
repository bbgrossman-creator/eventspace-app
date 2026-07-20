// v252 (BP-2) — AUTHORING: the lawful content shape. THE DEFINING PROOF:
// every field declares exactly one treatment (copied · referenced ·
// resolved-as-absence); nothing unclassified, nothing doubly classified.
// The §5 barred list refuses; bound dress never travels; §11 money is
// intent with no representable confirmed price; §10 parameters are
// questions without defaults; and the negative pins prove authored content
// can neither create a live dependency nor become an Event Design.
import * as fs from "fs";
import {
  BlueprintContent, emptyContent, validateBlueprintContent,
  FIELD_TREATMENTS, FieldTreatment, PRICING_INTENT_FORMS, PARAMETER_TYPES,
  attachTemplatePresentation, fingerprintPortable, PortablePresentation,
} from "../blueprintContent";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };
const refuses = (content: unknown, needle: string, what: string) => {
  const v = validateBlueprintContent(content);
  ok(!v.ok && v.refusals.some((r) => r.includes(needle)), `${what}: expected a refusal containing "${needle}", got ${JSON.stringify(v.refusals)}`);
};

const portable = (): PortablePresentation => ({
  themeKey: "classic", delta: { fonts: { pairing: "playfair-inter" } },
  sectionDress: { "menu": { accent: "#123456" } as never }, sectionPins: {}, documentPin: null,
});

/** A fully-populated lawful content — every field of the shape present. */
const full = (): BlueprintContent => ({
  version: 1,
  structure: [{
    key: "ch1", title: "Reception", prose: "The arc of the evening.",
    sections: [{
      key: "s1", title: "Stations", prose: "Abundance without lines.", role: "menu",
      entries: [{
        key: "e1", definitionId: "def-sushi", title: "Sushi Station",
        configuration: { values: { presentation: "acrylic", attendants: 2 }, scheme: "live-chef", annotations: "runner keeps the boats moving" },
        itemSelections: [{ name: "Dragon Roll", include: true, note: "the Goldberg lesson" }],
        choiceGroups: [{ key: "cg1", label: "Protein", options: ["salmon", "tuna"], required: true }],
        pricingIntent: { form: "fixed-package", amount: 1800, policy: "station-flat-2026" },
        notes: "chef never leaves the board",
      }],
    }],
  }],
  presentation: {
    portable: portable(),
    provenance: { template_id: "tpl-1", fingerprint: "abc123", applied_at: "2026-07-20T00:00:00Z", mode: "creation" },
  },
  constraints: { character: "meat", supervision: "KCL on site", calendarSensitive: true, serviceStyle: "stations" },
  parameters: [{ key: "p1", label: "Guest count", type: "count", required: true },
               { key: "p2", label: "Daypart", type: "choice", required: true, options: ["lunch", "evening"] }],
});

T("§6 THE DEFINING PROOF — treatment totality and exclusivity: a fully-populated content walks clean (zero unclassified), the registry's values come from the closed set, one treatment per path by construction, and empty content is lawful", () => {
  const v = validateBlueprintContent(full());
  ok(v.ok, `full lawful content refused: ${JSON.stringify(v.refusals)}`);
  const treatments = new Set<FieldTreatment>(["copied", "referenced", "resolved"]);
  for (const [path, t] of Object.entries(FIELD_TREATMENTS)) {
    ok(treatments.has(t), `registry path ${path} carries unknown treatment ${t}`);
  }
  ok(Object.keys(FIELD_TREATMENTS).length === new Set(Object.keys(FIELD_TREATMENTS)).size, "duplicate registry paths");
  ok(validateBlueprintContent(emptyContent()).ok, "emptyContent must be lawful");
  const alien = { ...full(), somethingNew: 1 } as unknown;
  refuses(alien, "UNCLASSIFIED", "an undeclared field must be a constitutional violation");
});

T("§6 RESOLVED IS ABSENCE: material that resolves at instantiation or later has no field — its presence is refused by name (definition revision · current price · company facts · conditions, with the BP-7 note)", () => {
  const withRev = full(); (withRev.structure[0].sections[0].entries[0] as unknown as Record<string, unknown>).definitionRevision = "r18";
  refuses(withRev, "RESOLVED IS ABSENCE", "captured definition revision");
  const withPrice = full(); (withPrice.structure[0].sections[0].entries[0] as unknown as Record<string, unknown>).currentPrice = 42;
  refuses(withPrice, "RESOLVED IS ABSENCE", "captured current price");
  refuses({ ...full(), companyFacts: {} }, "RESOLVED IS ABSENCE", "company facts stored");
  refuses({ ...full(), conditions: [] }, "never at the root", "root-level conditions");
  const withUnitCondition = full();
  withUnitCondition.parameters.push({ key: "daypart", label: "Daypart", type: "choice", required: true, options: ["lunch", "evening"] });
  withUnitCondition.structure[0].sections[0].condition = { predicate: "equals", param: "daypart", operand: "evening" };
  ok(validateBlueprintContent(withUnitCondition).ok, "a lawful unit condition must validate (v257)");
});

T("§5 THE BARRED LIST refuses anywhere, regardless of value: event-specific and commercial material never enters organizational knowledge", () => {
  for (const key of ["customer", "event_date", "guestCount", "deposit", "agreement", "signature", "delivery", "actuals", "approval", "confirmed", "tax_id"]) {
    refuses({ ...full(), [key]: "x" }, "BARRED (§5)", `barred key at root: ${key}`);
    const nested = full();
    (nested.structure[0].sections[0].entries[0] as unknown as Record<string, unknown>)[key] = "x";
    refuses(nested, "BARRED (§5)", `barred key nested: ${key}`);
  }
});

T("NOT AN EVENT DESIGN: event identity keys are refused — authored content cannot smuggle a booking, event, version, proposal, or instantiation", () => {
  for (const key of ["booking_id", "event_id", "version_id", "proposal_id", "instantiation_id"]) {
    refuses({ ...full(), [key]: "x" }, "NOT AN EVENT DESIGN", `event identity key: ${key}`);
  }
});

T("§5+v241 BOUND NEVER TRAVELS: bound keys inside the portable refuse; alien keys refuse as not-portable; the lawful five-key portable passes; template attach is BY VALUE (deep copy — later template mutation changes nothing) with provenance recorded at application time", () => {
  const bound = full();
  (bound.presentation!.portable as unknown as Record<string, unknown>).components = {};
  refuses(bound, "BOUND NEVER TRAVELS", "components inside portable");
  const alien = full();
  (alien.presentation!.portable as unknown as Record<string, unknown>).extraDress = {};
  refuses(alien, "NOT PORTABLE", "alien key inside portable");
  const tpl = { id: "tpl-9", portable: portable() };
  const attached = attachTemplatePresentation(tpl);
  ok(attached.provenance !== null && attached.provenance.template_id === "tpl-9", "provenance records the template");
  ok(attached.provenance!.fingerprint === fingerprintPortable(attached.portable), "provenance fingerprint is the portable's own");
  tpl.portable.themeKey = "MUTATED-AFTER";
  ok(attached.portable.themeKey === "classic", "attach must deep-copy — the template stays a citation, never a dependency");
});

T("§11 MONEY IS INTENT: the four forms are the closed set; fixed-package must name its policy; an unknown form refuses; no confirmed price is representable (the key itself is barred)", () => {
  for (const form of PRICING_INTENT_FORMS) {
    const c = full();
    c.structure[0].sections[0].entries[0].pricingIntent =
      form === "reference-current" ? { form }
      : form === "authored-suggestion" ? { form, amount: 10 }
      : form === "formula" ? { form, perGuest: 4 }
      : { form, amount: 100, policy: "p" };
    ok(validateBlueprintContent(c).ok, `${form} must be lawful`);
  }
  const noPolicy = full();
  (noPolicy.structure[0].sections[0].entries[0].pricingIntent as unknown as Record<string, unknown>).policy = "  ";
  refuses(noPolicy, "must name its declared policy", "fixed-package without policy");
  const unknown = full();
  (unknown.structure[0].sections[0].entries[0] as unknown as Record<string, unknown>).pricingIntent = { form: "confirmed-price" };
  refuses(unknown, "unknown form", "unknown intent form");
});

T("§10 PARAMETERS ARE QUESTIONS: closed types; a default masquerading as a fact refuses; an unknown type refuses", () => {
  ok(JSON.stringify(PARAMETER_TYPES) === JSON.stringify(["count", "choice", "flag"]), "closed parameter type set");
  const withDefault = full();
  (withDefault.parameters[0] as unknown as Record<string, unknown>).default = 150;
  refuses(withDefault, "no default masquerading as a fact", "parameter default");
  const badType = full();
  (badType.parameters[0] as unknown as Record<string, unknown>).type = "script";
  refuses(badType, "unknown type", "unknown parameter type");
});

T("NEGATIVE PINS — no live dependency, no event work, no legacy table: the shape module imports only ./portable (no client, no studio, no designs); the authoring reads touch only component_definitions and publication_themes; no new file names the legacy v182 table or module; no instantiation call exists anywhere in the slice; banned vocabulary absent", () => {
  const shape = fs.readFileSync("src/lib/blueprintContent.ts", "utf8");
  const data = fs.readFileSync("src/lib/blueprintAuthoringSupabase.ts", "utf8");
  const page = fs.readFileSync("src/app/blueprint-shelf/page.tsx", "utf8");
  // AMENDED v257 (BP-7): the shape lawfully imports the condition law —
  // its import set is exactly these two, still supabase-free, still pure.
  const shapeImports = [...shape.matchAll(/from "([^"]+)";/g)].map((m) => m[1]);
  ok(JSON.stringify(shapeImports) === JSON.stringify(["./blueprintConditions", "./portable"]), `shape imports: ${JSON.stringify(shapeImports)}`);
  const tables = [...data.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]).sort();
  ok(JSON.stringify(tables) === JSON.stringify(["component_definitions", "publication_themes"]), `authoring reads: ${JSON.stringify(tables)}`);
  for (const [name, src] of [["blueprintContent.ts", shape], ["blueprintAuthoringSupabase.ts", data], ["page.tsx", page]] as const) {
    ok(!/from "(\.\.?\/)*(lib\/)?blueprints"/.test(src) && !src.includes('@/lib/blueprints"'), `${name} imports the legacy module`);
    ok(!/from\("blueprints"\)/.test(src) && !src.includes('.from("blueprints")'), `${name} reads the legacy table`);
    ok(!/override/i.test(src), `'override' appears in ${name}`);
    ok(!/blueprint publication/i.test(src), `the banned noun appears in ${name}`);
  }
  // AMENDED v253: the page now hosts BP-3's instantiation surface — the
  // BP-2 boundary pins below apply to the SHAPE and DATA modules forever
  // (authored content itself never instantiates), no longer to the page.
  for (const [name, src] of [["blueprintContent.ts", shape], ["blueprintAuthoringSupabase.ts", data]] as const) {
    ok(!/instantiate\s*\(/.test(src), `an instantiation call appears in ${name}`);
    ok(!src.includes("offeredRevisionId"), `${name} consumes the offered revision`);
  }
});

console.log(`\nv252.authoring: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
