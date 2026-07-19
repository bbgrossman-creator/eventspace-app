// v233 — Photography's pure claims: proposals rank by relevance and stay
// deterministic; pins are immutable version facts that denormalize at pin
// time; the registries keep side/full in their lanes.
import { proposePhotos, pinPhoto, unpinPhoto, pinnedFor, PhotoRecord } from "../photos";
import { TREATMENT_OPTIONS, DOCUMENT_PHOTO_OPTIONS, SYSTEM_DEFAULT_THEME } from "../publication";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const LIB: PhotoRecord[] = [
  { id: "a", url: "u-a", label: "The venue at dusk", tags: ["venue"] },
  { id: "b", url: "u-b", label: "Passed cocktails", tags: ["cocktail", "drinks"] },
  { id: "c", url: "u-c", label: "Plated dessert", tags: ["dessert"] },
];
T("proposals RANK: 'Cocktail Hour' proposes the cocktail photo first; unknown slots degrade to library order", () => {
  const r = proposePhotos("Cocktail Hour", LIB);
  if (r[0].id !== "b") throw new Error(`proposed ${r[0].id}`);
  const cold = proposePhotos("Zzz Qqq", LIB);
  if (cold.map((p) => p.id).join() !== "a,b,c") throw new Error("cold slot lost determinism");
  if (proposePhotos("Cocktail Hour", [], 3).length !== 0) throw new Error("empty library invented photos");
});
T("pins are immutable version facts, denormalized at pin time", () => {
  const p1 = pinPhoto(null, "sec-1", LIB[1]);
  const p2 = pinPhoto(p1, "__document__", LIB[0]);
  if (pinnedFor(p2, "sec-1")?.url !== "u-b" || pinnedFor(p2, "__document__")?.id !== "a")
    throw new Error("pins lost");
  if (pinnedFor(p1, "__document__") !== null) throw new Error("p1 mutated — pin isn't immutable");
  const p3 = unpinPhoto(p2, "sec-1");
  if (pinnedFor(p3, "sec-1") !== null) throw new Error("unpin failed");
  if (pinnedFor(p2, "sec-1") === null) throw new Error("unpin mutated its input");
  const ref = pinnedFor(p2, "sec-1")!;
  if (!("url" in ref && "label" in ref)) throw new Error("pin didn't denormalize — a stamped doc couldn't render");
});
T("placement stays in its lane: sections offer side never full; the document offers full never side; default band", () => {
  const secPhoto = TREATMENT_OPTIONS.filter((g) => g.key === "photo")[0];
  if (!secPhoto || secPhoto.options.some((o) => o.value === "full")) throw new Error("full leaked into sections");
  if (!secPhoto.options.some((o) => o.value === "side")) throw new Error("side missing from sections");
  // "side" is UNREPRESENTABLE in DOCUMENT_PHOTO_OPTIONS' type — the lane is
  // enforced statically; the widened check below guards against a future
  // type loosening.
  if ((DOCUMENT_PHOTO_OPTIONS as { value: string }[]).some((o) => o.value === "side")) throw new Error("side leaked into the document");
  if (SYSTEM_DEFAULT_THEME.treatments!.document!.photo !== "band") throw new Error("default drifted");
});
console.log(`\nv233.photos: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
