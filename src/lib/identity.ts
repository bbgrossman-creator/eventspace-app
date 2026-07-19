// ═══════════════════════════════════════════════════════════════════════════
// COMPANY IDENTITY & PUBLICATION POLICY (v239 · PA-1 · PUBLISHING_ASSETS §1)
//
// The Brand owns company TRUTH; publication POLICY governs which truths
// may enter a customer document. Every fact declares: eligibility ·
// default region · default visibility. The registry is CODE (the law);
// values and policy are DATA (app_settings — no migration for facts).
//
// ELIGIBILITY is a one-way gate:
//   customer    — may appear; shown unless policy hides it
//   sensitive   — may appear; HIDDEN unless policy shows it (ACH)
//   restricted  — NEVER appears unless policy explicitly enables it (tax id)
//
// The snapshot freezes only the facts actually RESOLVED into a
// publication — never the company's whole identity record.
// ═══════════════════════════════════════════════════════════════════════════

export type Eligibility = "customer" | "sensitive" | "restricted";
export type FactRegion = "header" | "contact" | "footer" | "payment" | "terms";
export type FactGroup = "identity" | "commerce" | "legal" | "socials";

export interface FactDef {
  key: string;
  group: FactGroup;
  label: string;
  eligibility: Eligibility;
  /** The region this fact enters BY DEFAULT when resolved. */
  region: FactRegion;
  /** Starting visibility WITHIN its eligibility (policy may override). */
  defaultVisible: boolean;
  multiline?: boolean;
}

/** THE REGISTRY — the publishing law for every company fact.
 *  Constitutional pins: tax id is RESTRICTED (never included unless
 *  explicitly enabled); ACH is SENSITIVE (payment region, hidden by
 *  default); trade name is header, visible. */
export const COMPANY_FACTS: FactDef[] = [
  { key: "identity.trade_name",  group: "identity", label: "Trade name",        eligibility: "customer",   region: "header",  defaultVisible: true },
  { key: "identity.legal_name",  group: "identity", label: "Legal name",        eligibility: "customer",   region: "terms",   defaultVisible: false },
  { key: "identity.address",     group: "identity", label: "Address",           eligibility: "customer",   region: "contact", defaultVisible: true, multiline: true },
  { key: "identity.phone",       group: "identity", label: "Phone",             eligibility: "customer",   region: "contact", defaultVisible: true },
  { key: "identity.email",       group: "identity", label: "Email",             eligibility: "customer",   region: "contact", defaultVisible: true },
  { key: "identity.website",     group: "identity", label: "Website",           eligibility: "customer",   region: "contact", defaultVisible: true },
  { key: "commerce.tax_id",      group: "commerce", label: "Tax ID",            eligibility: "restricted", region: "payment", defaultVisible: false },
  { key: "commerce.payment_terms", group: "commerce", label: "Payment terms",   eligibility: "customer",   region: "payment", defaultVisible: true, multiline: true },
  { key: "commerce.ach",         group: "commerce", label: "Bank / ACH instructions", eligibility: "sensitive", region: "payment", defaultVisible: false, multiline: true },
  { key: "legal.terms",          group: "legal",    label: "Terms & conditions", eligibility: "customer",  region: "terms",   defaultVisible: true, multiline: true },
  { key: "legal.disclaimers",    group: "legal",    label: "Disclaimers",       eligibility: "customer",   region: "terms",   defaultVisible: true, multiline: true },
  { key: "legal.supervision",    group: "legal",    label: "Licensing / supervision", eligibility: "customer", region: "footer", defaultVisible: true },
  { key: "legal.signature_name", group: "legal",    label: "Signature default", eligibility: "customer",   region: "footer",  defaultVisible: false },
  { key: "socials.handles",      group: "socials",  label: "Social handles",    eligibility: "customer",   region: "footer",  defaultVisible: false, multiline: true },
];

/** Company truth — fact key → value. Empty/absent means the company has
 *  not said (empty-is-information: nothing renders, nothing is invented). */
export type CompanyIdentity = Record<string, string>;

/** Publication policy — per-fact visibility overrides. "shown" is the
 *  ONLY thing that lets a restricted or sensitive fact through. */
export type PublicationPolicy = Record<string, "shown" | "hidden">;

/** A fact RESOLVED into a publication: what the snapshot freezes. */
export interface ResolvedFact {
  key: string;
  label: string;
  value: string;
  region: FactRegion;
}

/** THE PROJECTION — company truth × policy → the facts that may enter
 *  this customer document. Pure; deterministic; order = registry order. */
export function projectIdentity(identity: CompanyIdentity, policy: PublicationPolicy): ResolvedFact[] {
  const out: ResolvedFact[] = [];
  for (const f of COMPANY_FACTS) {
    const value = (identity[f.key] ?? "").trim();
    if (!value) continue;                                   // unsaid stays unsaid
    const p = policy[f.key];
    if (f.eligibility === "restricted") {
      if (p !== "shown") continue;                          // explicit enablement ONLY
    } else if (f.eligibility === "sensitive") {
      if (p !== "shown") continue;                          // hidden unless shown
    } else {
      if (p === "hidden") continue;                         // shown unless hidden
      if (!f.defaultVisible && p !== "shown") continue;     // quiet by default
    }
    out.push({ key: f.key, label: f.label, value, region: f.region });
  }
  return out;
}

/** The facts of one region, in registry order. */
export const factsIn = (facts: ResolvedFact[], region: FactRegion): ResolvedFact[] =>
  facts.filter((f) => f.region === region);

/** The company footer LINE, derived from footer-region facts + the trade
 *  name — used only when Brand Studio's explicit footer words are absent. */
export function derivedFooterLine(facts: ResolvedFact[]): string | null {
  const trade = facts.find((f) => f.key === "identity.trade_name")?.value;
  const parts = [trade, ...factsIn(facts, "footer").map((f) => f.value)].filter(Boolean) as string[];
  return parts.length ? parts.join("  ·  ") : null;
}
