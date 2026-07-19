// v239 — Company Identity & Publication Policy: the eligibility model's
// pure claims. Eligibility is a one-way gate; the snapshot freezes only
// what was RESOLVED; unsaid stays unsaid.
import { COMPANY_FACTS, projectIdentity, factsIn, derivedFooterLine } from "../identity";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};

T("constitutional pins: tax id RESTRICTED · ACH sensitive+payment+hidden · trade name header+visible", () => {
  const tax = COMPANY_FACTS.find((f) => f.key === "commerce.tax_id");
  if (tax?.eligibility !== "restricted") throw new Error("tax id is not restricted");
  const ach = COMPANY_FACTS.find((f) => f.key === "commerce.ach");
  if (ach?.eligibility !== "sensitive" || ach.region !== "payment" || ach.defaultVisible)
    throw new Error("ACH must be sensitive, payment region, hidden by default");
  const trade = COMPANY_FACTS.find((f) => f.key === "identity.trade_name");
  if (trade?.region !== "header" || !trade.defaultVisible) throw new Error("trade name must be header, visible");
  const dup = new Set(COMPANY_FACTS.map((f) => f.key));
  if (dup.size !== COMPANY_FACTS.length) throw new Error("duplicate fact keys — the registry contradicts itself");
});

T("the one-way gate: restricted NEVER passes without explicit enablement; sensitive hidden by default; customer shown by default", () => {
  const id = { "commerce.tax_id": "22-1234567", "commerce.ach": "Routing 021000021", "identity.phone": "(732) 555-0100" };
  const closed = projectIdentity(id, {});
  if (closed.some((f) => f.key === "commerce.tax_id")) throw new Error("restricted leaked with no policy");
  if (closed.some((f) => f.key === "commerce.ach")) throw new Error("sensitive shown without being shown");
  if (!closed.some((f) => f.key === "identity.phone")) throw new Error("customer-facing fact missing by default");
  // even a malicious policy value can't invert eligibility semantics
  const open = projectIdentity(id, { "commerce.tax_id": "shown", "commerce.ach": "shown", "identity.phone": "hidden" });
  if (!open.some((f) => f.key === "commerce.tax_id")) throw new Error("explicit enablement refused");
  if (!open.some((f) => f.key === "commerce.ach")) throw new Error("shown sensitive refused");
  if (open.some((f) => f.key === "identity.phone")) throw new Error("hidden customer fact still shown");
});

T("the snapshot freezes only RESOLVED facts: unsaid stays unsaid, and the projection is facts — never the record or the policy", () => {
  const facts = projectIdentity({ "identity.trade_name": "  Event Space by Burger Bar  ", "identity.email": "" }, {});
  if (facts.length !== 1) throw new Error(`empty values must be absent — got ${facts.length}`);
  if (facts[0].value !== "Event Space by Burger Bar") throw new Error("value not trimmed");
  const keys = Object.keys(facts[0]);
  if (keys.includes("eligibility") || keys.includes("defaultVisible"))
    throw new Error("the resolved fact carries policy machinery — the snapshot would freeze the law, not the outcome");
  if (factsIn(facts, "header")[0]?.key !== "identity.trade_name") throw new Error("region filter broken");
});

T("the derived footer line: trade name + footer facts, explicit words always win at the renderer", () => {
  const facts = projectIdentity({ "identity.trade_name": "Event Space", "legal.supervision": "Under KCL supervision" }, {});
  const line = derivedFooterLine(facts);
  if (line !== "Event Space  ·  Under KCL supervision") throw new Error(`derived line wrong: ${line}`);
  if (derivedFooterLine([]) !== null) throw new Error("no facts must derive nothing — never a placeholder");
});

console.log(`\nv239.identity: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
