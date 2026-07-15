// ═══════════════════════════════════════════════════════════════════════════
// LENSES — the registry (v196, slice 1)
//
// A lens is a projection of ONE Event Design for one audience. (A Surface —
// Daily Ops, Calendar, the Library — is a screen that is NOT event-scoped and
// does not belong here.)
//
// This file exists before any lens UI does, because it is the piece everything
// else hangs off. Getting it data-driven now is trivial; retrofitting it later
// is surgery — and shipping a hard-coded row of tabs is exactly how v189B
// happened, at a fraction of this surface area.
//
// ─── THE THREE CONDITIONS (Workspace Architecture §4) ─────────────────────
// v196 may proceed in parallel with the role migration ONLY while all three
// hold. They are enforced here, in one file, so they are checkable rather
// than hoped for:
//
//   1. NEVER read session.role. Read session.perms. `perms` is already a
//      permission ARRAY and is unaffected by role → security_level + jobs;
//      Phase B changes how it is COMPUTED, not what it IS.
//   2. visibleLenses takes the whole CONFIG OBJECT, not (caps, role). When
//      config later gains `modules`, this signature does not change and the
//      lens bar inherits modules for free.
//   3. Gate on CAPABILITIES only — never on modules, jobs, security, tier, or
//      business_type. Capabilities are the only feature-gating input in
//      application code, and this file is the only place lenses are decided.
//
// ─── WHY `module` IS DECLARED BUT NOT ENFORCED ────────────────────────────
// Each lens names the module it will belong to. Nothing reads it yet —
// tenant_modules does not exist (Phase B). It is recorded now so that the day
// modules land, enforcement is one added clause in one function, and the map
// does not have to be reconstructed from memory by whoever ships Phase B.
// ═══════════════════════════════════════════════════════════════════════════
import { Capabilities } from "./capabilities";
import { Permission, Session } from "./permissions";

/** Stable identifiers. Code-side only — a lens is NEVER stored as an
 *  entitlement (Workspace Architecture R3: workspaces and lenses are derived
 *  from modules ∩ jobs, never purchased). */
export type LensKey = "design" | "customer" | "production" | "operations" | "photography";

export interface LensDef {
  key: LensKey;
  /** What the UI prints. Architecture speaks Greek; the interface speaks
   *  English (event-studio-design.md naming table). */
  label: string;
  /** One line of what this audience sees — for tooltips and empty states. */
  blurb: string;
  /** Tenant capability required. The ONLY gate this file applies (condition 3).
   *  null = always available wherever the Studio itself is. */
  cap: keyof Capabilities | null;
  /** User permission required (condition 1: a perm, never a role). */
  perm: Permission;
  /** Phase B forward-declaration. NOT read today. See header. */
  module: "events" | "production" | "operations" | "photography";
  /** Does this lens accept edits (X-ray on) or is it read-only today?
   *  Compose is not a lens — X-ray is a modifier on every lens (One-Stage
   *  Doctrine). This flag says which lenses have earned an editor yet. */
  editable: boolean;
}

/** THE registry. One place. Adding a lens is a row here, never a new tab in a
 *  component — that is the difference between a lens bar and a nav bar. */
export const LENSES: LensDef[] = [
  {
    key: "design", label: "Design",
    blurb: "The maker's view — every truth, nothing hidden.",
    cap: null, perm: "bookings.edit", module: "events", editable: true,
  },
  {
    key: "customer", label: "Customer",
    blurb: "Exactly what the client receives.",
    cap: "proposals", perm: "bookings.view", module: "events", editable: false,
  },
  {
    key: "production", label: "Production",
    blurb: "Quantities, prep, and fulfilment — internal, vendor, or both.",
    cap: "requirements", perm: "ops.view", module: "production", editable: false,
  },
  {
    key: "operations", label: "Operations",
    blurb: "Staffing, equipment, timing, logistics.",
    cap: "requirements", perm: "ops.view", module: "operations", editable: false,
  },
  {
    key: "photography", label: "Photography",
    blurb: "Shot list derived from the design.",
    cap: "photos_retrieval", perm: "knowledge.view", module: "photography", editable: false,
  },
];

/** Config shape. An OBJECT (condition 2) so that adding `modules` later is a
 *  field, not a signature change. */
export interface LensConfig {
  caps: Capabilities;
  /** Phase B: `modules?: ModuleKey[]` lands here and visibleLenses gains one
   *  clause. No caller changes. That is the entire point of taking an object. */
}

/**
 * The lens bar, computed. Requires BOTH tenant capability AND user permission —
 * the rule permissions.ts has stated since it was written ("A nav item or page
 * requires BOTH. Never a one-off showX boolean").
 *
 * Returns [] rather than throwing for a session with no perms: an empty lens
 * bar is a correct rendering of "you may not look at this event," and the
 * caller decides how to say so.
 */
export function visibleLenses(config: LensConfig, session: Session | null): LensDef[] {
  if (!session) return [];
  return LENSES.filter((lens) => {
    const capOk = lens.cap === null || config.caps[lens.cap] === true;
    const permOk = session.perms.includes(lens.perm);   // ← condition 1
    return capOk && permOk;
  });
}

// ─── WHICH LENS OPENS? ─────────────────────────────────────────────────────
// The instinct "resolve permissions → resolve responsibilities → open the most
// useful lens" is right about the ORDER and wrong about the MECHANISM, and the
// difference matters:
//
//   "Most useful" implies the app COMPUTES usefulness. It almost never has to.
//   The question is nearly always already answered before it is asked, because
//   nobody opens an event from nowhere — they arrive from a workspace, from an
//   obligation, from a search. **Provenance beats inference.** Building a
//   usefulness scorer would be an oracle where a breadcrumb would do.
//
// The multi-job problem dissolves the same way. You are never "a user with four
// jobs opening an event" — you are *standing in a workspace*, and the event
// renders through that workspace's lens (R16: Job 1:1 Workspace). A chef in the
// Production workspace opens an event in Production because that is the door
// they came through, not because a heuristic ranked it highest.
//
// So the ladder is mostly memory, and inference is only the FALLBACK — for the
// genuinely context-free arrival: a bookmark, an emailed link, a calendar click.
//
//   ── PROVENANCE — what we KNOW ──
//   1. EXPLICIT      — the URL names a lens (deep link, or a link built by an
//                      obligation: "your 3 production items on this event")
//   2. INTENT        — you searched for a TYPED object and opened the event
//                      through it. Ctrl+K "Prime Rib" → a component → you were
//                      thinking Production, not Customer. Ctrl+K "invoice
//                      560018" → Finance. This is NOT inference: the result
//                      type is a fact about what you clicked. It outranks the
//                      workspace because an ACT in this moment is more specific
//                      than a PLACE you happen to stand in — an admin sitting
//                      in Sales who searches an invoice wants Finance.
//                      Silent when the result carries no signal (searching the
//                      EVENT itself says nothing about lens).
//   3. WORKSPACE     — the door you are standing in            [needs Phase B]
//
//   ── INFERENCE — what we can DERIVE ──
//   4. OBLIGATIONS   — where YOUR unresolved work on THIS event actually is
//                      (the tiebreak for a multi-job user, and it is derived)
//   5. JOB           — your primary job's lens                 [needs Phase B]
//
//   ── MEMORY — what you DID ──
//   6. PREFERENCE    — the lens you left open last
//
//   ── SURRENDER — a defensible guess ──
//   7. FIRST VISIBLE — maker-first ordering; never "customer" by assumption
//
// The four tiers are the shape: the ladder consumes provenance until it runs
// out, then derives, then remembers, and only then guesses. Every rung is less
// opinionated than the one above it. **Provenance beats inference** — the
// system's job is to notice what it already knows, not to be clever.
//
// Rungs 3 and 5 need jobs/workspaces (Phase B). 1, 2, 6 and 7 work today. Rung
// 4 arrives with deriveObligations. The ladder is written whole so that landing
// each rung is a filled-in branch, not a redesign.
//
// AND: EMPTY IS INFORMATION. A chef opening an Exploring event lands in
// Production and sees nothing — that is CORRECT. Redirecting them to a lens
// their job does not need would be the app pretending to know better than the
// person. The honest rendering is the empty lens plus its blocking reason
// ("quantities open once the menu is confirmed") — which is just the
// obligation's `blocked` state, rendered.

/** What kind of thing did the user open the event THROUGH? Not the event
 *  itself — that carries no signal. A typed object does. */
export type SearchResultKind =
  | "event" | "component" | "recipe" | "blueprint"
  | "invoice" | "payment" | "photo" | "person" | "vendor" | "asset";

/** The home lens of a kind of object. `null` = says nothing; skip the rung.
 *  This is a map, not a scorer: no weights, no "92% confident". */
const LENS_FOR_KIND: Record<SearchResultKind, LensKey | null> = {
  event: null,          // searching the event itself says nothing about lens
  person: null,         // could be staff or a client — ambiguous, so silent
  component: "design",  // you were thinking about what's IN the event
  recipe: "production",
  blueprint: "design",
  invoice: null,        // → "finance" once the Finance lens exists
  payment: null,        // → "finance"
  photo: "photography",
  vendor: null,         // → "operations" once vendor work has a home
  asset: "operations",
};

export function lensForKind(kind: SearchResultKind | null | undefined): LensKey | null {
  return kind ? LENS_FOR_KIND[kind] ?? null : null;
}

export interface LensIntent {
  /** From the URL (?lens=production) or a link an obligation built. Wins. */
  explicit?: LensKey | null;
  /** The KIND of object the user opened the event through (Ctrl+K result). */
  viaKind?: SearchResultKind | null;
  /** The workspace the user is standing in. Phase B fills this. */
  workspaceLens?: LensKey | null;
  /** Lens keys where this user has unresolved work on THIS event, most first.
   *  The multi-job tiebreak. Derived, never stored. */
  byObligation?: LensKey[];
  /** The lens they left open last. */
  preference?: LensKey | null;
}

/** The ladder. Every rung is filtered through visibleLenses() — a lens grants
 *  no permission, so a remembered or deep-linked lens is a REQUEST, never an
 *  authorization. */
export function resolveLens(
  config: LensConfig, session: Session | null, intent: LensIntent = {},
): LensKey | null {
  const allowed = visibleLenses(config, session);
  const ok = (k: LensKey | null | undefined): k is LensKey =>
    !!k && allowed.some((l) => l.key === k);

  if (ok(intent.explicit)) return intent.explicit;
  const viaLens = lensForKind(intent.viaKind);       // rung 2 — provenance, not inference
  if (ok(viaLens)) return viaLens;
  if (ok(intent.workspaceLens)) return intent.workspaceLens;
  for (const k of intent.byObligation ?? []) if (ok(k)) return k;
  if (ok(intent.preference)) return intent.preference;
  return allowed[0]?.key ?? null;   // maker-first; never "customer" by assumption
}

/** Context-free arrival. Kept as the bottom rung of resolveLens(), named
 *  separately because "no intent at all" is a real and common case. */
export function defaultLens(config: LensConfig, session: Session | null): LensKey | null {
  return resolveLens(config, session, {});
}

/** Is a lens legal for this session? Used to reject a URL naming a lens the
 *  user may not open — because a lens grants no permission (Interaction
 *  Doctrine), the URL must be checked, not trusted. */
export function lensAllowed(key: LensKey, config: LensConfig, session: Session | null): boolean {
  return visibleLenses(config, session).some((l) => l.key === key);
}
