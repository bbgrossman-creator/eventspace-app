// v312 unit suite — the Function addressing law.
// Pure, no DOM, no supabase: ../events/functionContext imports nothing, which is
// what makes this law provable on its own.
//
// Claims FC-1..FC-9.
import {
  ALL_FUNCTIONS, functionLabel, functionLensApplies, resolveFunctionContext,
  selectedFunction, type ProductFunction,
} from "../events/functionContext";

let passed = 0, failed = 0;
function eq(a: unknown, b: unknown, msg: string) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { passed++; } else { failed++; console.log(`FAIL ${msg}\n  got ${A}\n  want ${B}`); }
}

const fn = (id: string, ordinal: number, o: Partial<ProductFunction> = {}): ProductFunction => ({
  function_id: id, ordinal, name: null, occasion_kind: null, active: true,
  open_basis: "declared", operational_event_ref: `ev-${id}`, ...o,
});

const NONE: ProductFunction[] = [];
const ONE = [fn("fn-kid", 1, { name: "Kiddush" })];
const MANY = [
  fn("fn-cer", 1, { name: "Ceremony" }),
  fn("fn-rec", 2, { name: "Reception" }),
  fn("fn-bru", 3, { name: "Brunch", operational_event_ref: null }),
];

// FC-1 · a lens is a choice, so it exists only where a choice exists.
eq(functionLensApplies(NONE), false, "FC-1 zero Functions offer no lens");
eq(functionLensApplies(ONE), false, "FC-1 one Function is not a lens");
eq(functionLensApplies(MANY), true, "FC-1 many Functions offer a lens");

// FC-2 · a generic entry carries no context and resolves to All Functions.
eq(resolveFunctionContext(MANY, null), ALL_FUNCTIONS, "FC-2 null context → ALL");
eq(resolveFunctionContext(MANY, undefined), ALL_FUNCTIONS, "FC-2 absent context → ALL");
eq(resolveFunctionContext(MANY, ""), ALL_FUNCTIONS, "FC-2 empty context → ALL");

// FC-3 · an explicit, valid Function is honoured exactly.
eq(resolveFunctionContext(MANY, "fn-rec"), "fn-rec", "FC-3 explicit valid Function is honoured");
eq(resolveFunctionContext(MANY, "fn-bru"), "fn-bru", "FC-3 an unreleased Function is still addressable");

// FC-4 · an unknown or foreign identity falls back safely, never throws.
eq(resolveFunctionContext(MANY, "fn-not-mine"), ALL_FUNCTIONS, "FC-4 unknown id → ALL");
eq(resolveFunctionContext(MANY, "00000000-0000-0000-0000-000000000000"),
   ALL_FUNCTIONS, "FC-4 foreign uuid → ALL");
eq(resolveFunctionContext(MANY, "ALL-ish"), ALL_FUNCTIONS, "FC-4 near-miss literal → ALL");

// FC-5 · where no lens applies, ANY requested context resolves to All Functions.
eq(resolveFunctionContext(ONE, "fn-kid"), ALL_FUNCTIONS,
   "FC-5 the only Function is not a selectable context");
eq(resolveFunctionContext(NONE, "fn-kid"), ALL_FUNCTIONS, "FC-5 no Functions → ALL");

// FC-6 · the literal ALL is accepted and is not treated as a Function id.
eq(resolveFunctionContext(MANY, ALL_FUNCTIONS), ALL_FUNCTIONS, "FC-6 explicit ALL → ALL");
eq(selectedFunction(MANY, ALL_FUNCTIONS), null, "FC-6 ALL selects no Function");

// FC-7 · selection resolves to the Function itself, by stable identity.
eq(selectedFunction(MANY, "fn-cer")?.function_id, "fn-cer", "FC-7 selection resolves the Function");
eq(selectedFunction(MANY, "fn-nope"), null, "FC-7 an unknown selection resolves to none");

// FC-8 · labels never invent a name and never fall back to a date.
eq(functionLabel(MANY[0]), "Ceremony", "FC-8 a named Function uses its name");
eq(functionLabel(fn("fn-x", 2)), "Function 2", "FC-8 an unnamed Function falls back to its ordinal");
eq(functionLabel(fn("fn-x", 4, { name: "   " })), "Function 4", "FC-8 a blank name is not a name");

// FC-9 · resolution is pure: the same inputs give the same answer, and the
// caller's array is never mutated.
const before = JSON.stringify(MANY);
resolveFunctionContext(MANY, "fn-rec");
resolveFunctionContext(MANY, "bogus");
eq(JSON.stringify(MANY), before, "FC-9 resolution does not mutate the Function list");

console.log(`\nv312.functionContext: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
