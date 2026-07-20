// v259 (Editor Foundation / Guided Draft Entry) — the first Blueprint
// Editor experience, UX-ONLY over the frozen BP-1..BP-8 architecture.
// Acceptance coverage per spec: the exact created draft opens by deep-link
// with tenant-scoped resolution and NAMED failure states; event-review
// content is gated on THIS draft's exact BP-5 promotion act (composed and
// seeded drafts never wear event-learning language); friendly copy maps
// ONE-TO-ONE onto the constitutional strip vocabulary with the raw codes
// preserved under Advanced; every content-changing action requires explicit
// confirmation with the full proposal shown first; dismissal is a personal
// UI preference that changes nothing but visibility; and no law, validator,
// resolver, SQL ceremony, or publication behavior changed (write-free guide
// modules; zero SQL in the slice; the ceremony untouched).
import * as fs from "fs";
import {
  FRIENDLY_STRIP_COPY, FRIENDLY_COPY_REASONS, EDITOR_AREAS, GUIDE_CHECKLIST,
  onboardDismissKey, deriveOpportunities, PROPOSED_GUEST_PARAMETER, contentCounts,
} from "../blueprintGuide";
import { STRIP_REASONS, StripEntry } from "../blueprintPromote";
import { emptyContent } from "../blueprintContent";

let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(what); };

const page = fs.readFileSync("src/app/blueprint-shelf/page.tsx", "utf8");
const dialog = fs.readFileSync("src/components/PromoteToBlueprint.tsx", "utf8");
const guide = fs.readFileSync("src/lib/blueprintGuide.ts", "utf8");
const guideData = fs.readFileSync("src/lib/blueprintGuideSupabase.ts", "utf8");

T("FRIENDLY COPY IS ONE-TO-ONE with the constitutional vocabulary: the map is TOTAL over STRIP_REASONS (every code has a title and body; no extra keys), and the exact codes stay available — the dialog renders them under an Advanced disclosure", () => {
  const mapKeys = Object.keys(FRIENDLY_STRIP_COPY).sort();
  const reasons = [...STRIP_REASONS].sort();
  ok(JSON.stringify(mapKeys) === JSON.stringify(reasons), `map drift — map:${mapKeys.length} vocab:${reasons.length}`);
  ok(FRIENDLY_COPY_REASONS === STRIP_REASONS, "the totality guard must alias the real vocabulary");
  for (const r of STRIP_REASONS) {
    ok(FRIENDLY_STRIP_COPY[r].title.length > 0 && FRIENDLY_STRIP_COPY[r].body.length > 0, `${r} lacks copy`);
    ok(!FRIENDLY_STRIP_COPY[r].title.includes("_"), `${r} title leaks a code`);
  }
  ok(dialog.includes("data-advanced-toggle") && dialog.includes("data-stripped-advanced"), "Advanced disclosure missing");
  ok(/data-stripped-advanced[\s\S]*?\{s\.reason\}/.test(dialog), "Advanced must show the exact constitutional code");
});

T("EVENT-REVIEW IS GATED ON THE EXACT PROMOTION ACT: the data read filters act='promote' AND revision_id = this draft; the panel and onboarding render only under promotionAct — no seeded/promoted_from heuristic anywhere in the gate, so composed and seeded drafts never wear event-learning language", () => {
  ok(guideData.includes('.eq("revision_id", revisionId)') && guideData.includes('.eq("act", "promote")'), "the act query is not exact");
  ok(page.includes("{promotionAct && !onboardDismissed &&") && page.includes("{promotionAct && opportunities.length > 0 &&"), "panels not gated on the act");
  const gateRegion = page.slice(page.indexOf("data-onboarding") - 400, page.indexOf("data-event-review") + 400);
  ok(!gateRegion.includes("seeded_from_revision_id") && !gateRegion.includes("promoted_from_version_id"), "a lineage heuristic leaked into the gate");
});

T("OPPORTUNITIES DERIVE FROM THE ACT'S RECORDED DETAIL AND CLAIM NO LEARNING: guests-omitted yields ask-guest-count only while no guest_count parameter exists; pricing entries yield navigation; everything else is informational; a null act yields nothing", () => {
  const entries: StripEntry[] = [
    { reason: "STRIPPED_GUESTS", at: "guests" },
    { reason: "CONFIRMED_PRICE_TO_SUGGESTION", at: "Sushi" },
    { reason: "STRIPPED_ITEM_PRICES", at: "Sushi" },
  ];
  const c = emptyContent();
  const ops = deriveOpportunities({ omissions: entries }, c);
  ok(ops.length === 3, `${ops.length} opportunities`);
  ok(ops[0].kind === "ask-guest-count" && ops[1].kind === "review-pricing" && ops[2].kind === "info", "kinds wrong");
  c.parameters.push({ ...PROPOSED_GUEST_PARAMETER });
  const withParam = deriveOpportunities({ omissions: entries }, c);
  ok(withParam[0].kind === "info", "the guest offer must vanish once the question exists");
  ok(deriveOpportunities(null, c).length === 0, "a null act must yield nothing");
  ok(!guide.toLowerCase().includes('"learned') && !page.includes("Learned from this event"), "learning language leaked");
  ok(page.includes("Review what came from the event"), "the honest panel title is missing");
});

T("EVERY CONTENT-CHANGING ACTION IS A CONFIRMED AUTHORING ACT: the guest-question offer opens a preview showing the FULL proposed parameter (label · key · type · required) and only the confirm button patches content; pricing actions only navigate; info rows do nothing", () => {
  ok(page.includes("data-offer-guest-param") && page.includes("data-confirm-parameter") && page.includes("data-confirm-guest-param"), "the confirm flow is missing");
  const offerIdx = page.indexOf("data-offer-guest-param");
  const confirmIdx = page.indexOf("data-confirm-guest-param");
  const offerBtn = page.slice(page.lastIndexOf("<button", offerIdx), page.indexOf("</button>", offerIdx));
  ok(!offerBtn.includes("patch("), "the OFFER button must not change content");
  const confirmBtn = page.slice(page.lastIndexOf("<button", confirmIdx), page.indexOf("</button>", confirmIdx));
  ok(confirmBtn.includes("patch(") && confirmBtn.includes("PROPOSED_GUEST_PARAMETER"), "only the CONFIRM button may patch, with the shown proposal");
  const preview = page.slice(page.indexOf("data-confirm-parameter"), confirmIdx);
  ok(preview.includes("PROPOSED_GUEST_PARAMETER.label") && preview.includes("PROPOSED_GUEST_PARAMETER.key"), "the preview must show the full proposal");
  ok(/review-pricing[\s\S]{0,400}jump\("area-pricing"\)/.test(page), "pricing action must navigate, not mutate");
});

T("DEEP-LINK OPENS THE EXACT DRAFT WITH NAMED FAILURE STATES: ?draft=<revision id> resolves by id (RLS scopes tenant — a foreign draft is NOT_FOUND), verifies state='draft' (else NOT_A_DRAFT), opens the editor on success, and renders data-deeplink-failed with named copy instead of silently falling back", () => {
  ok(guideData.includes('.eq("id", revisionId)') && guideData.includes('!== "draft"'), "resolution checks missing");
  ok(guideData.includes('"NOT_FOUND"') && guideData.includes('"NOT_A_DRAFT"'), "named states missing");
  ok(page.includes('q.get("draft")') && page.includes("loadDraftById"), "the page must resolve the param");
  ok(page.includes("data-deeplink-failed"), "the named failure surface is missing");
  ok(page.includes("setSelected(res.identity)") && page.includes("setOpenRevision(res.revision)"), "success must open the exact draft");
  ok(dialog.includes("?draft=${res.revision_id}&onboard=1") && dialog.includes("data-open-editor"), "promotion success must deep-link to the exact new draft");
});

T("DISMISSAL IS A PERSONAL UI PREFERENCE, NOT BLUEPRINT STATE: it writes only the scoped localStorage key and flips visibility; the checklist renders plain guidance bullets with jump links — no checkbox inputs, no completion checkmarks, and the copy says readiness is judged by the validator and the author", () => {
  ok(onboardDismissKey("r1") === "ec:bp-onboard-dismissed:r1", "key shape drifted");
  const dismissFn = page.slice(page.indexOf("const dismissOnboard"), page.indexOf("};", page.indexOf("const dismissOnboard")));
  ok(dismissFn.includes("localStorage.setItem") && dismissFn.includes("setOnboardDismissed(true)"), "dismiss must set the key and hide");
  ok(!dismissFn.includes("save") && !dismissFn.includes("patch("), "dismiss must not touch content or persistence");
  const checklist = page.slice(page.indexOf("GUIDE_CHECKLIST.map"), page.indexOf("</ul>", page.indexOf("GUIDE_CHECKLIST.map")));
  ok(!checklist.includes('type="checkbox"') && !checklist.includes("✓"), "the checklist must carry no completion state");
  ok(page.includes("not by dismissing this note"), "the non-authority copy is missing");
  ok(GUIDE_CHECKLIST.every((i) => EDITOR_AREAS.some((a) => a.id === i.jump)), "every checklist jump must target a real area");
});

T("THE EDITOR'S PERMANENT AREAS EXIST AND HOLD THE EXISTING EDITORS: seven named, anchorable areas in order — Reusable Structure (structure + constraints), Questions (parameters), Rules, Choices, Pricing Guidance, Portable Presentation, Review Before Publishing — with the knowledge banner declaring company knowledge", () => {
  ok(EDITOR_AREAS.length === 7, "area count drifted");
  const ids = EDITOR_AREAS.map((a) => a.id);
  let last = -1;
  for (const id of ids) {
    const at = page.indexOf(`data-editor-area={props.area.id}`) >= 0 ? page.indexOf(`EDITOR_AREAS[${ids.indexOf(id)}]`) : -1;
    ok(at > last, `area ${id} missing or out of order`);
    last = at;
  }
  ok(/EDITOR_AREAS\[0\]\}>[\s\S]*?StructureEditor[\s\S]*?ConstraintsEditor[\s\S]*?<\/EditorArea>/.test(page), "structure area must hold structure + constraints");
  ok(/EDITOR_AREAS\[1\]\}>[\s\S]*?ParametersEditor/.test(page), "questions area must hold parameters");
  ok(/EDITOR_AREAS\[5\]\}>[\s\S]*?PresentationEditor/.test(page), "presentation area must hold the presentation editor");
  ok(page.includes("ReviewBeforePublishing content={content}"), "the review area is missing");
  ok(page.includes("data-knowledge-banner") && page.includes("Reusable Knowledge"), "the knowledge banner is missing");
  ok(page.includes("cookbook"), "the cookbook framing is missing");
});

T("REVIEW BEFORE PUBLISHING IS READ-ONLY AND THE CEREMONY IS UNTOUCHED: the review component renders status prose only (no patch, no save, no publish call); the publish path remains the existing data-open-ceremony button with the constitutional declaration; nothing in the slice publishes", () => {
  const review = page.slice(page.indexOf("function ReviewBeforePublishing"), page.indexOf("function DraftEditor"));
  ok(!review.includes("patch") && !review.includes("saveDraftContent") && !review.includes("publishRevision"), "the review area must be read-only");
  ok(review.includes("Nothing here publishes"), "the read-only declaration is missing");
  ok(page.includes("data-open-ceremony") && page.includes("PUBLISH_DECLARATION"), "the existing ceremony path must remain");
  for (const [name, src] of [["guide", guide], ["guideData", guideData]] as const) {
    ok(!src.includes("publish"), `${name} reaches publication`);
  }
});

T("NOTHING IN THE LAW CHANGED — THE SLICE IS PRESENTATION-ONLY: the guide modules are write-free (no insert/update/delete/upsert/rpc), the pure module imports only promote + content shapes, no SQL file exists for v259, and the validator/condition/compose/promote law files carry no v259 edits", () => {
  ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/.test(guideData), "the guide data layer writes or performs");
  const imports = [...guide.matchAll(/from "([^"]+)";/g)].map((m) => m[1]).sort();
  ok(JSON.stringify(imports) === JSON.stringify(["./blueprintContent", "./blueprintPromote"]), `guide imports: ${JSON.stringify(imports)}`);
  ok(!fs.existsSync("supabase/v259_editor.sql") && fs.readdirSync("supabase").every((f) => !f.includes("259")), "a v259 migration exists — the slice must be UX-only");
  for (const law of ["src/lib/blueprintContent.ts", "src/lib/blueprintConditions.ts", "src/lib/blueprintCompose.ts", "src/lib/blueprintPromote.ts", "src/lib/blueprintShelf.ts"]) {
    ok(!fs.readFileSync(law, "utf8").includes("v259"), `${law} was edited by the UX slice`);
  }
});

T("COUNTS FOR THE AREA SUMMARIES COUNT HONESTLY: conditions across all four units, choice groups, priced entries, entries", () => {
  const c = emptyContent();
  c.structure.push({ key: "ch", title: "T", prose: "", condition: { predicate: "present", param: "x" },
    sections: [{ key: "s", title: "S", prose: "", role: null, condition: { predicate: "present", param: "x" },
      entries: [{ key: "e", definitionId: "d", title: "E",
        configuration: { values: {}, scheme: null, annotations: "" },
        itemSelections: [{ name: "i", include: true, note: "", condition: { predicate: "present", param: "x" } }],
        choiceGroups: [{ key: "g", label: "G", options: ["a"], required: false }],
        pricingIntent: { form: "reference-current" }, notes: "",
        condition: { predicate: "present", param: "x" } }] }] });
  const n = contentCounts(c);
  ok(n.conditions === 4 && n.choiceGroups === 1 && n.pricedEntries === 1 && n.entries === 1, JSON.stringify(n));
});

console.log(`\nv259.editor: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
