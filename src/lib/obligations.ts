// ═══════════════════════════════════════════════════════════════════════════
// OBLIGATIONS (v196)
//
// The one derivation. Lens badges, the task rail, Daily Ops, and admin
// oversight ALL call this function. If any of them ever computes its own
// count, they will disagree — and the disagreement will be silent, because
// both numbers will look plausible. That is exactly how v194 P0.2 happened:
// presentation.ts did its own arithmetic and drifted $12,388 from the Studio.
// One derivation, many renderings. No exceptions.
//
// ─── WHAT AN OBLIGATION IS ────────────────────────────────────────────────
// A PROJECTION OF UNRESOLVED STATE. Not a row. Nobody creates one; nobody
// completes one. It exists because a fact is unresolved and it CEASES TO
// EXIST when the fact resolves. There is no `done` — a checkbox on a
// projection would be a second copy of the truth, free to drift from it.
//
// ─── blocked | ready | (gone) ─────────────────────────────────────────────
// Never todo/doing/done. `blocked` means a readiness predicate over STATE is
// unmet — and it says WHAT it is waiting for, because "nothing here" is a
// worse answer than "waiting on the menu." Blockedness is computed, never
// stored. (The Execution Graph adds `due soon`/`overdue`/`at risk` in v197
// when deliverables have due times; the three states below are their base.)
//
// ─── THE HONEST PART: computed ≠ zero ─────────────────────────────────────
// A module with no derivation yet returns { computed: false }, NOT an empty
// list. The difference is the whole point:
//
//   Production shows nothing  because there is no Production module yet
//   Customer shows nothing    because there is genuinely nothing owed
//
// Rendering both as a blank badge tells the user "Production is fine." It is
// not fine; it is unknown. The Library taught this lesson already ("type to
// search" ≠ "no results"), and a silent false clean is worse in an oversight
// strip than in a search box.
// ═══════════════════════════════════════════════════════════════════════════
import { LensKey } from "./lenses";
import { VersionTotals } from "./pricingEngine";

/** Modules that can own obligations. Mirrors the module list in the Workspace
 *  Architecture; only `events` is implemented today. */
export type ObligationModule = "events" | "production" | "operations" | "photography" | "finance";

export interface Obligation {
  id: string;
  /** Imperative, and specific enough to act on WITHOUT opening it.
   *  "4 prices unconfirmed" — not "Pricing". */
  label: string;
  state: "blocked" | "ready";
  /** Only when blocked. Names what is being waited on, and by whom. A blocked
   *  obligation that cannot say why is just an error message. */
  blockedBy?: string;
  /** Where to go to resolve it. Becomes `?lens=` on the link — which is how
   *  rung 1 (explicit) of the landing ladder gets fed, and why arriving from
   *  an obligation needs no inference at all. */
  lens?: LensKey;
}

export interface ModuleObligations {
  /** FALSE = no derivation exists for this module yet. NOT the same as zero.
   *  See the header — this flag is the honesty. */
  computed: boolean;
  items: Obligation[];
}

/** Everything the derivation needs. Passed in — no ambient reads, so this
 *  stays a pure function and the 120 tests keep running without a DOM. */
export interface ObligationContext {
  totals: VersionTotals | null;
  /** Version lifecycle: draft | sent | approved | … */
  versionStatus?: string | null;
  hasIntro?: boolean;
  componentCount?: number;
}

const NOT_COMPUTED: ModuleObligations = { computed: false, items: [] };

/**
 * The single derivation. One module at a time, so each renderer asks only for
 * what it shows and the oversight strip asks for all of them.
 */
export function deriveObligations(module: ObligationModule, ctx: ObligationContext): ModuleObligations {
  switch (module) {
    case "events":
      return deriveSales(ctx);

    // Deliberately NOT `{ computed: true, items: [] }`. These modules have no
    // derivation because they have no data model yet (v197+). Claiming zero
    // would be claiming they are clean. They are unknown.
    case "production":
    case "operations":
    case "photography":
    case "finance":
      return NOT_COMPUTED;
  }
}

/** Sales/Design obligations — the only module with a real model today. */
function deriveSales(ctx: ObligationContext): ModuleObligations {
  const items: Obligation[] = [];
  const t = ctx.totals;

  if (t) {
    // v194 P0.5/P0.6 pay off here: `unconfirmed` and `unpriced` already exclude
    // internal, included and free rows, so a hidden heat lamp cannot manufacture
    // a sales obligation. The debt this counts is real sales debt.
    if (t.unconfirmed > 0) {
      items.push({
        id: "prices-unconfirmed",
        label: `${t.unconfirmed} carried price${t.unconfirmed === 1 ? "" : "s"} unconfirmed`,
        state: "ready", lens: "design",
      });
    }
    if (t.unpriced > 0) {
      items.push({
        id: "prices-missing",
        label: `${t.unpriced} item${t.unpriced === 1 ? "" : "s"} with no price`,
        state: "ready", lens: "design",
      });
    }
    // A quoted choice group with no default is an ASSUMPTION the quote rests
    // on. v194 surfaced it in the engine; here it becomes a thing to resolve.
    for (const a of t.choiceAssumptions) {
      items.push({
        id: `choice-${a.groupId}`,
        label: `${a.label}: quoted on an assumption`,
        state: "ready", lens: "design",
      });
    }
  }

  const empty = (ctx.componentCount ?? 0) === 0;

  if (ctx.versionStatus === "draft") {
    items.push(
      empty
        // A readiness predicate over state — and it names its blocker rather
        // than showing an empty rail.
        ? { id: "send", label: "Send the proposal", state: "blocked",
            blockedBy: "Nothing composed yet", lens: "design" }
        : { id: "send", label: "Proposal not sent", state: "ready", lens: "customer" },
    );
  }

  if (!ctx.hasIntro && !empty) {
    items.push({ id: "intro", label: "No introduction written", state: "ready", lens: "customer" });
  }

  return { computed: true, items };
}

/** The badge. `null` = nothing to show AND nothing claimed — the caller must
 *  render nothing at all rather than a zero, because a zero is a claim. */
export function obligationBadge(m: ModuleObligations): { n: number; blocked: boolean } | null {
  if (!m.computed || m.items.length === 0) return null;
  return { n: m.items.length, blocked: m.items.some((i) => i.state === "blocked") };
}

/** For the tooltip: says which of the two silences this is. */
export function badgeTitle(m: ModuleObligations): string {
  if (!m.computed) return "Not yet computed — this workspace doesn't exist yet";
  if (m.items.length === 0) return "Nothing outstanding";
  return m.items.map((i) => (i.state === "blocked" ? `⛔ ${i.label} — ${i.blockedBy}` : i.label)).join("\n");
}
