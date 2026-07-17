// v210 unit suite — the back-reference matcher: the pure rule where this
// slice's bugs would live. Same idiom as v208.promotion.test.ts.
import { matchBackReferences, backReferenceText, PromotionActRef } from "../backReference";

let passed = 0, failed = 0;
function eq(a: unknown, b: unknown, msg: string) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { passed++; } else { failed++; console.log(`FAIL ${msg}\n  got ${A}\n  want ${B}`); }
}

const BASE = "2026-07-01T00:00:00.000Z";
const act = (id: string, createdAt: string, keys: string[], note = "Season review"): PromotionActRef =>
  ({ actId: id, note, createdAt, keys });
const D = (...dims: string[]) => dims.map((dimension) => ({ dimension }));

// 1 — only promoted keys match; unmatched acts are absent, not empty
eq(matchBackReferences(D("choice:service", "scalar:pieces"),
    [act("a1", "2026-07-10T00:00:00Z", ["choice:service", "item:Dragon Roll"]),
     act("a2", "2026-07-11T00:00:00Z", ["choice:presentation"])], BASE)
    .map((r) => [r.actId, r.matchedKeys]),
  [["a1", ["choice:service"]]],
  "matches intersect current divergence only; zero-match acts omitted");

// 2 — acts at-or-before the baseline are excluded (strictly newer)
eq(matchBackReferences(D("choice:service"),
    [act("old", "2026-06-01T00:00:00Z", ["choice:service"]),
     act("atb", BASE, ["choice:service"]),
     act("new", "2026-07-02T00:00:00Z", ["choice:service"])], BASE)
    .map((r) => r.actId),
  ["new"],
  "newer-than-baseline is strict; the baseline already contains earlier promotions");

// 3 — no baseline moment ⇒ no back-reference (no honest comparison point)
eq(matchBackReferences(D("choice:service"), [act("a1", "2026-07-10T00:00:00Z", ["choice:service"])], null),
  [], "null baselineAt yields nothing — honesty over guessing");

// 4 — matched keys follow the divergence panel's order; duplicates collapse
eq(matchBackReferences(D("scalar:pieces", "choice:service", "item:Dragon Roll"),
    [act("a1", "2026-07-10T00:00:00Z",
      ["item:Dragon Roll", "choice:service", "choice:service", "choice:never_diverged"])], BASE)[0].matchedKeys,
  ["choice:service", "item:Dragon Roll"],
  "panel order governs; citation duplicates collapse");

// 5 — acts render newest-first
eq(matchBackReferences(D("choice:service"),
    [act("a1", "2026-07-05T00:00:00Z", ["choice:service"]),
     act("a2", "2026-07-12T00:00:00Z", ["choice:service"])], BASE).map((r) => r.actId),
  ["a2", "a1"], "newest act first");

// 6 — a reverted change stops matching: the diff wins over history
eq(matchBackReferences(D("scalar:pieces"),
    [act("a1", "2026-07-10T00:00:00Z", ["choice:service"])], BASE),
  [], "divergence since reverted ⇒ no line (state-vs-baseline wins, SPEC-002 §1.5)");

// 7 — the line speaks in computed past-tense facts (KA §9)
eq(backReferenceText({ actId: "a", note: "n", createdAt: "2026-07-10T00:00:00Z",
    matchedKeys: ["choice:service", "item:Dragon Roll"] }, 4).startsWith("2 of these 4 changes were promoted"),
  true, "partial match names both numbers");
eq(backReferenceText({ actId: "a", note: "n", createdAt: "2026-07-10T00:00:00Z",
    matchedKeys: ["choice:service"] }, 1).startsWith("This change was promoted"),
  true, "full single match reads naturally");

console.log(`v210.backref: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`v210.backref: ${failed} failed`);
