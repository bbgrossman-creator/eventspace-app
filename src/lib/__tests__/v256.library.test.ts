// v256 (BP-6) — THE LIBRARY LEARNS THE SHELF. The fifth registered kind
// lands in ITS OWN module with zero Library-machinery diffs (the v215
// doctrine exercised for real). Visibility is the shelf's own law
// projected: active + offering, nothing else. Proof is provenance stated
// as fact — and NOTHING RANKS BY IT: the weight expression contains no
// citation variable. The v216 legacy kind (reading the retired v182
// pointer table) is superseded; the renderer wall stands; the preview
// wears today's clothes and says so.
import * as fs from "fs";
import { shelfEntryVisible, blueprintProofLine } from "../blueprintLibrary";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const kindSrc = fs.readFileSync("src/lib/blueprintLibraryKind.ts", "utf8");
const lawSrc = fs.readFileSync("src/lib/blueprintLibrary.ts", "utf8");
const kindsSrc = fs.readFileSync("src/lib/libraryKinds.ts", "utf8");
const registrySrc = fs.readFileSync("src/lib/libraryRegistry.ts", "utf8");
const previewSrc = fs.readFileSync("src/components/BlueprintPaperPreview.tsx", "utf8");
const shelfPage = fs.readFileSync("src/app/blueprint-shelf/page.tsx", "utf8");

T("THE VISIBILITY LAW is the shelf's own, projected: active + offering appears; retired hides; a draft-only identity hides — hiding is not a judgment, it is the absence of an offer", () => {
  ok(shelfEntryVisible({ status: "active", published_revision_id: "r1" }) === true, "offering identity hidden");
  ok(shelfEntryVisible({ status: "retired", published_revision_id: "r1" }) === false, "retired identity shown");
  ok(shelfEntryVisible({ status: "active", published_revision_id: null }) === false, "draft-only identity shown");
  ok(shelfEntryVisible({ status: "retired", published_revision_id: null }) === false, "retired draft-only shown");
});

T("THE PROOF LINE states provenance as fact: taxonomy · rN · citations, with zero citations said out loud ('not yet cited') and singular grammar for one", () => {
  ok(blueprintProofLine("weddings", 3, 5) === "weddings · r3 · cited by 5 designs", blueprintProofLine("weddings", 3, 5));
  ok(blueprintProofLine(null, 1, 0) === "r1 · not yet cited", blueprintProofLine(null, 1, 0));
  ok(blueprintProofLine("dinners", 2, 1) === "dinners · r2 · cited by 1 design", blueprintProofLine("dinners", 2, 1));
  ok(blueprintProofLine(null, null, 4) === "cited by 4 designs", blueprintProofLine(null, null, 4));
});

T("NOTHING RANKS BY CITATION: the weight expression is rankPrefix over the query alone — no citation variable, no count, no order-by-usage anywhere in the kind's search", () => {
  const weightLine = kindSrc.match(/weight: ([^\n]+)/);
  ok(weightLine !== null && weightLine![1].trim() === "rankPrefix(i.name, q) };", `weight line: ${weightLine?.[1]}`);
  ok(!/weight[^;\n]*(count|cite|citation)/i.test(kindSrc), "a citation reached the weight");
  ok(!/\.order\(["'](citation|count|usage)/.test(kindSrc), "the query orders by usage");
});

T("ZERO LIBRARY DIFFS (the v215 doctrine, exercised): the registry file contains no shelf vocabulary — the fifth kind arrived without touching the machinery; the kind registers exactly once in its own module", () => {
  ok(!/blueprint_identities|blueprint_instantiations|blueprint_revisions|shelfEntryVisible/.test(registrySrc),
    "the registry learned about the shelf");
  ok(!/^import /m.test(lawSrc), "the law module imports something — it must stay pure");
  ok((kindSrc.match(/registerLibraryKind\(/g) ?? []).length === 1, "the module registers ≠ 1 kinds");
  ok(kindSrc.includes('kind: "blueprint"'), "the kind key drifted");
});

T("THE LEGACY KIND IS SUPERSEDED: libraryKinds.ts no longer reads the retired v182 table, carries no land verb for blueprints, no legacy drag mime — and boots the shelf kind through the one idempotent door", () => {
  ok(!kindsSrc.includes('.from("blueprints")'), "the legacy table is still read");
  ok(!kindsSrc.includes("text/eventcore-blueprint"), "the legacy drag mime survives");
  ok(kindsSrc.includes("bootBlueprintShelfKind();"), "the shelf kind is not booted");
  ok(!/pick: \(e\) => \(\{ type: "land", id: e\.id, name: e\.title \}\)/.test(kindsSrc) || !kindsSrc.includes('kind: "blueprint"'),
    "a blueprint land verb survives in libraryKinds");
});

T("THE LIBRARY POINTS, THE SHELF PERFORMS: the kind's verb is navigate-only — no land, no drag, no instantiation shortcut around the guest-count ceremony", () => {
  ok(!kindSrc.includes('"land"'), "a land verb exists");
  ok(!/\bdrag\s*[:(]/.test(kindSrc), "a drag exists");
  ok(!kindSrc.includes("instantiate_blueprint") && !kindSrc.includes("instantiateBlueprint"), "the kind instantiates");
  ok(kindSrc.includes('"navigate"') && kindSrc.includes("/blueprint-shelf"), "the pointer is wrong");
});

T("THE RENDERER WALL STANDS: the preview imports only the content shape; src/lib/render still contains no blueprint vocabulary; the preview declares today's clothes out loud", () => {
  const imports = [...previewSrc.matchAll(/from "([^"]+)";/g)].map((m) => m[1]);
  ok(JSON.stringify(imports) === JSON.stringify(["@/lib/blueprintContent"]), `preview imports: ${JSON.stringify(imports)}`);
  for (const f of fs.readdirSync("src/lib/render")) {
    ok(!/blueprint/i.test(fs.readFileSync(`src/lib/render/${f}`, "utf8")), `the renderer knows blueprints (${f})`);
  }
  ok(previewSrc.includes("today's clothes") && previewSrc.includes("resolves at instantiation"),
    "the today's-clothes label is missing");
  ok(shelfPage.includes("<BlueprintPaperPreview content={c} />"), "the preview is not mounted on the shelf");
});

console.log(`\nv256.library: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
