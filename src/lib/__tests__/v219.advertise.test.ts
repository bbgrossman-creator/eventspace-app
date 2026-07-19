// v219 — the Advertising Rule's pure claim: the picker offers exactly the
// active, not-yet-present moment types (present = absent from the offer,
// not disabled — a duplicate-in-waiting is not an option).
import { availableMomentTypes } from "../moments";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
const t = (id: string, active = true) => ({ id, name: id, active });
T("offers active types not already on the version", () => {
  const out = availableMomentTypes([t("cocktail"), t("dinner"), t("dessert")], [{ section_type_id: "dinner" }]);
  if (out.map((x) => x.id).join(",") !== "cocktail,dessert") throw new Error(out.map((x) => x.id).join(","));
});
T("inactive types never offered; empty present offers all active", () => {
  const out = availableMomentTypes([t("a"), t("b", false)], []);
  if (out.map((x) => x.id).join(",") !== "a") throw new Error(out.map((x) => x.id).join(","));
});
T("everything present ⇒ the offer is honestly empty", () => {
  if (availableMomentTypes([t("a")], [{ section_type_id: "a" }]).length !== 0) throw new Error("not empty");
});
console.log(`\nv219.advertise: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
