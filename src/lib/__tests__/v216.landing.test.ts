// ═══════════════════════════════════════════════════════════════════════════
// v216 — the interaction matrix's Library rows: the landing ROUTE (empty is
// direct, populated is a decision — UI_GRAMMAR §11), DECLARED legality
// (canvasDragMimes computed from registrations, KA §6), and the "land" pick
// action flowing through the registry with no Library knowledge of any kind.
// The decision COMPONENT's claims (commits nothing until chosen, Replace
// confirms twice, Choose sends exactly the chosen ids) are Chromium's —
// accept-landing.mjs, with the auto-commit variant as the teeth.
// ═══════════════════════════════════════════════════════════════════════════
import { landingRoute } from "../landing";
import {
  registerLibraryKind, _unregisterLibraryKindForTests, libraryKind,
  canvasDragMimes, LibraryEntry,
} from "../libraryRegistry";

let passed = 0, failed = 0;
function T(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
}
const eq = (a: unknown, b: unknown, why = "") => {
  const aj = JSON.stringify(a), bj = JSON.stringify(b);
  if (aj !== bj) throw new Error(`${why} — got ${aj}, wanted ${bj}`);
};
const env = (kind: string, id: string, title: string): LibraryEntry => ({
  id, kind, title, subtitle: null, cover: null, tenant: "tenant", tags: [],
  facets: {}, text: null, layer_badges: [], provenance: null, pointer: { href: null },
});

T("the routing rule: empty Canvas is direct (no ceremony without a decision); populated opens the decision", () => {
  eq(landingRoute(0), "direct", "empty");
  eq(landingRoute(1), "decision", "one component");
  eq(landingRoute(17), "decision", "many");
});

T("legality is declared: canvasDragMimes carries exactly the kinds that drag AND name canvas", () => {
  registerLibraryKind({ kind: "fx-landable", label: "L", icon: "✦",
    search: async () => [], pick: () => ({ type: "none" }),
    legalDestinations: ["canvas"], dragMime: "text/fx-landable",
    drag: (e) => ({ mime: "text/fx-landable", payload: e.id }) });
  registerLibraryKind({ kind: "fx-clickonly", label: "C", icon: "✦",
    search: async () => [], pick: () => ({ type: "none" }),
    legalDestinations: ["canvas"] });                       // no drag ⇒ no mime
  registerLibraryKind({ kind: "fx-elsewhere", label: "E", icon: "✦",
    search: async () => [], pick: () => ({ type: "none" }),
    dragMime: "text/fx-elsewhere", legalDestinations: ["layer"],
    drag: (e) => ({ mime: "text/fx-elsewhere", payload: e.id }) });
  const mimes = canvasDragMimes();
  _unregisterLibraryKindForTests("fx-landable");
  _unregisterLibraryKindForTests("fx-clickonly");
  _unregisterLibraryKindForTests("fx-elsewhere");
  let landable = false, elsewhere = false;
  for (const m of mimes) { if (m === "text/fx-landable") landable = true; if (m === "text/fx-elsewhere") elsewhere = true; }
  if (!landable) throw new Error("declared landable kind missing");
  if (elsewhere) throw new Error("a kind whose legality is elsewhere leaked onto the canvas");
});

T("a registration is a refusal by default: no declaration, no landing", () => {
  registerLibraryKind({ kind: "fx-mute", label: "M", icon: "✦",
    search: async () => [], pick: () => ({ type: "none" }),
    dragMime: "text/fx-mute", drag: (e) => ({ mime: "text/fx-mute", payload: e.id }) });
  const mimes = canvasDragMimes();
  _unregisterLibraryKindForTests("fx-mute");
  for (const m of mimes) if (m === "text/fx-mute") throw new Error("undeclared destination accepted");
});

T("the land action flows through the registry — kind unnamed by any Library file", () => {
  registerLibraryKind({ kind: "fx-menu", label: "Menus", icon: "▤",
    search: async () => [], pick: (e) => ({ type: "land", id: e.id, name: e.title }),
    legalDestinations: ["canvas"], dragMime: "text/fx-menu",
    drag: (e) => ({ mime: "text/fx-menu", payload: e.id }) });
  const reg = libraryKind("fx-menu");
  const action = reg!.pick(env("fx-menu", "m1", "Summer Gala Menu"));
  _unregisterLibraryKindForTests("fx-menu");
  eq(action, { type: "land", id: "m1", name: "Summer Gala Menu" }, "land action");
});

console.log(`\nv216.landing: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
