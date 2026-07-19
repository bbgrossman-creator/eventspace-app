// ═══════════════════════════════════════════════════════════════════════════
// v215 — Library slice 1: the envelope + registry (KA §4) and the grouped
// search semantics (KA §5). Pure over the registry; the three real
// registrations are Supabase projections and are exercised by the Chromium
// suite over fixtures — this file never imports them, which is itself part
// of the claim: the registry works with no knowledge of any kind.
//
// The FIXTURE-KIND ZERO-DIFF PROOF (the v211 fixture-lens precedent,
// registry suite only, per the adopted draft position): a kind the Library
// has never heard of registers here, flows through search, grouping,
// ranking, rails ordering, pick and drag — with zero changes to any Library
// file. That is KA §4's discipline, held by a test instead of a promise.
// ═══════════════════════════════════════════════════════════════════════════
import {
  registerLibraryKind, _unregisterLibraryKindForTests, libraryKind,
  searchLibraryRails, railCount, rankPrefix, IDLE_RAILS,
  LibraryEntry, RankedEntry,
} from "../libraryRegistry";

let passed = 0, failed = 0;
function T(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS ${name}`); })
    .catch((e) => { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); });
}
const eq = (a: unknown, b: unknown, why = "") => {
  const aj = JSON.stringify(a), bj = JSON.stringify(b);
  if (aj !== bj) throw new Error(`${why} — got ${aj}, wanted ${bj}`);
};

const env = (kind: string, id: string, title: string, over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id, kind, title, subtitle: null, cover: null, tenant: "tenant", tags: [],
  facets: {}, text: null, layer_badges: [], provenance: null,
  pointer: { href: null }, ...over,
});

const fixtureKind = (kind: string, entries: RankedEntry[], extra: Partial<Parameters<typeof registerLibraryKind>[0]> = {}) =>
  registerLibraryKind({
    kind, label: kind.toUpperCase(), icon: "✦",
    search: async ({ q }) => entries.filter((r) => r.entry.title.toLowerCase().includes(q)),
    pick: (e) => e.pointer.href ? { type: "navigate", href: e.pointer.href } : { type: "none" },
    ...extra,
  });

async function main() {

await T("duplicate registration throws — the registerLayer/registerLens idiom", () => {
  fixtureKind("fx-dup", []);
  let threw = false;
  try { fixtureKind("fx-dup", []); } catch { threw = true; }
  _unregisterLibraryKindForTests("fx-dup");
  if (!threw) throw new Error("second registration accepted");
});

await T("under two characters is IDLE, not empty — different facts", async () => {
  fixtureKind("fx-idle", [{ entry: env("fx-idle", "1", "anything"), weight: 1 }]);
  const r = await searchLibraryRails("a");
  _unregisterLibraryKindForTests("fx-idle");
  eq(r.idle, true, "idle flag");
  eq(r.rails.length, 0, "no rails while idle");
  eq(IDLE_RAILS.idle, true, "exported idle shape");
});

await T("rails appear ONLY when non-empty (KA §5)", async () => {
  fixtureKind("fx-hit", [{ entry: env("fx-hit", "1", "sushi station"), weight: 10 }]);
  fixtureKind("fx-miss", []);
  const r = await searchLibraryRails("sushi");
  _unregisterLibraryKindForTests("fx-hit");
  _unregisterLibraryKindForTests("fx-miss");
  eq(r.rails.map((x) => x.kind), ["fx-hit"], "only the non-empty rail");
  eq(railCount(r), 1, "count");
});

await T("ranking is WITHIN a kind; rails order by their best hit", async () => {
  fixtureKind("fx-a", [
    { entry: env("fx-a", "1", "sushi platter"), weight: 50 },
    { entry: env("fx-a", "2", "sushi station"), weight: 100 },
  ]);
  fixtureKind("fx-b", [
    { entry: env("fx-b", "1", "sushi menu"), weight: 120 },
  ]);
  const r = await searchLibraryRails("sushi");
  _unregisterLibraryKindForTests("fx-a");
  _unregisterLibraryKindForTests("fx-b");
  eq(r.rails.map((x) => x.kind), ["fx-b", "fx-a"], "best hit leads the rails");
  eq(r.rails[1].entries.map((e) => e.id), ["2", "1"], "within-kind order by weight");
});

await T("the ranking model: prefix beats substring; bonus breaks ties only", () => {
  const q = "sus";
  const prefix = rankPrefix("Sushi Station", q);
  const substr = rankPrefix("Couscous Salad", q);
  if (!(prefix > substr)) throw new Error("prefix did not beat substring");
  // a capped usage bonus (20) can never lift a substring over a prefix
  if (!(prefix > rankPrefix("Couscous Salad", q, 20))) throw new Error("bonus buried an exact match");
  if (!(rankPrefix("Sushi A", q, 5) > rankPrefix("Sushi B", q, 0))) throw new Error("bonus did not break the tie");
});

await T("a throwing projection yields an empty rail, never a sunk pane", async () => {
  registerLibraryKind({
    kind: "fx-throw", label: "X", icon: "✦",
    search: async () => { throw new Error("shelf on fire"); },
    pick: () => ({ type: "none" }),
  });
  fixtureKind("fx-ok", [{ entry: env("fx-ok", "1", "sushi"), weight: 1 }]);
  const r = await searchLibraryRails("sushi");
  _unregisterLibraryKindForTests("fx-throw");
  _unregisterLibraryKindForTests("fx-ok");
  eq(r.rails.map((x) => x.kind), ["fx-ok"], "the healthy shelf survived");
});

await T("ZERO-DIFF PROOF: an unheard-of kind flows whole through the Library", async () => {
  // "venue" — a kind no Library file names. Registration only.
  fixtureKind("fx-venue", [
    { entry: env("fx-venue", "v1", "Sunset Terrace",
        { subtitle: "Rooftop · 220 max", pointer: { href: "/venues/v1" } }), weight: 100 },
  ], {
    drag: (e) => ({ mime: "text/eventcore-fixture", payload: e.id }),
    secondary: (e) => ({ label: "details", id: e.id, title: e.title }),
  });
  const r = await searchLibraryRails("sunset");
  const reg = libraryKind("fx-venue");
  eq(r.rails.map((x) => x.kind), ["fx-venue"], "the rail exists");
  eq(r.rails[0].label, "FX-VENUE", "heading from the registration");
  const entry = r.rails[0].entries[0];
  eq(reg!.pick(entry), { type: "navigate", href: "/venues/v1" }, "pick action");
  eq(reg!.drag!(entry), { mime: "text/eventcore-fixture", payload: "v1" }, "drag payload");
  eq(reg!.secondary!(entry)!.label, "details", "secondary affordance");
  _unregisterLibraryKindForTests("fx-venue");
  // and after unregistration the Library forgets it entirely
  const r2 = await searchLibraryRails("sunset");
  eq(r2.rails.length, 0, "forgotten after unregistration");
});

await T("the envelope carries only what is true: badges/cover/facets empty is a fact", () => {
  const e = env("fx", "1", "thing");
  eq(e.layer_badges, [], "no badge before a layer slice ships its projection");
  eq(e.cover, null, "no cover before §8");
  eq(e.facets, {}, "no facets before Explore");
});

console.log(`\nv215.library: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
}
main();
