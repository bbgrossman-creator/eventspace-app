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
import { currentCan } from "./featureCapabilities";

/** Stable identifiers. Code-side only — a lens is NEVER stored as an
 *  entitlement (Workspace Architecture R3: workspaces and lenses are derived
 *  from modules ∩ jobs, never purchased). */
export type LensKey = "design" | "customer" | "production" | "operations" | "photography"
  // SPEC-003 §1: the registry grows by registration, so the key type must
  // admit keys it hasn't met. `string & {}` keeps autocomplete for the known
  // keys while accepting a registered sixth — the union stays documentation,
  // not a gate (gates are capability × permission, §5).
  | (string & {});

export interface LensDef {
  key: LensKey;
  /** SPEC-003 §1: the declared operational concern — the graph, turned for
   *  one kind of work (KA §10). Documentation, not a gate. */
  concern?: string;
  /** SPEC-003 §5: feature-licensing capability (currentCan()), the
   *  constitutional gate (KA §10). During the one transitional release both
   *  this AND the business-model `cap` are checked (fail-closed); `cap` is
   *  then removed. null = available wherever the Studio is. */
  capability?: string | null;
  /** SPEC-003 §6: move kinds this lens may speak. [] = read-only, and
   *  read-only is structural (shell computes mayEdit=false unconditionally).
   *  `editable` remains authoritative for the grandfathered editing lenses
   *  until sheet lenses gain their first verb. */
  verbs?: string[];
  /** SPEC-003 §7: which frame hosts it. Absent = "editing" (grandfathered). */
  anatomy?: "editing" | "sheet";
  /** What the UI prints. Architecture speaks Greek; the interface speaks
   *  English (event-studio-design.md naming table). */
  label: string;
  /** One line of what this audience sees — for tooltips and empty states. */
  blurb: string;
  /** v224 — LENS CAPABILITIES (PUBLICATION §5). Two axes, sparse by design.
   *  THE LAW: nothing outside this registry may ask `if (lens === X)` —
   *  every toolbar, drawer affordance, and modifier renders from these
   *  declarations. `edits` says which LAYER of the proposal this lens may
   *  change (structure and content belong to Design everywhere and always —
   *  PUBLICATION §0.2); `supports` says which machinery applies (xray
   *  absorbed from v218's xrayMode: "inherent" = the lens IS the x-ray
   *  edition, no toggle; "modifier" = the toggle appears and changes the
   *  rendering; absent = does not apply). */
  edits?: { presentation?: true; content?: true; structure?: true; pricing?: true };
  supports?: { xray?: "inherent" | "modifier"; print?: true; compare?: true };
  /** v230 — SELECTION CAPABILITIES (§6.3): which PRESENTATION identities
   *  this lens lets you select on the paper. Contextual toolbars render
   *  from this + the treatment registries — never from scattered
   *  type checks. Component/item join here when their treatments ship. */
  selects?: { document?: true; section?: true; component?: true };
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

/** SPEC-003 §1: registration by declaration; duplicate key = build error —
 *  the registerLayer/registerMoveKind idiom, one level up. The seed rows
 *  below register through the same door the sixth lens will use. */
const lensRegistry = new Map<string, LensDef>();
export function registerLens(def: LensDef): void {
  if (lensRegistry.has(def.key))
    throw new Error(`lens '${def.key}' already registered`);
  lensRegistry.set(def.key, def);
  LENSES.push(def);
}
/** Harness-only: the fixture lens registers and unregisters around its own
 *  suite. Never called in production code — enforced by review. */
export function _unregisterLensForTests(key: string): void {
  lensRegistry.delete(key);
  const i = LENSES.findIndex((l) => l.key === key);
  if (i >= 0) LENSES.splice(i, 1);
}

/** THE registry. One place. Adding a lens is a row here, never a new tab in a
 *  component — that is the difference between a lens bar and a nav bar. */
export const LENSES: LensDef[] = [];
const SEED_LENSES: LensDef[] = [
  {
    key: "design", label: "Design",
    blurb: "The maker's view — every truth, nothing hidden.",
    edits: { content: true, structure: true, pricing: true },
    supports: { xray: "inherent" },
    cap: null, perm: "bookings.edit", module: "events", editable: true,
    concern: "authoring the design", capability: null, verbs: [], anatomy: "editing",
  },
  {
    // PUBLICATION §4: the business object is a Proposal; this lens is the
    // PRESENTATION — the live customer publication. The key stays `customer`
    // (keys are wire-stable, the `operations` precedent); the label is the
    // user-facing truth.
    key: "customer", label: "Presentation",
    blurb: "The live customer publication — exactly what the client receives.",
    edits: { presentation: true },
    supports: { xray: "modifier", print: true, compare: true },
    selects: { document: true, section: true, component: true },   // v234: component treatments exist
    cap: "proposals", perm: "bookings.view", module: "events", editable: false,
    concern: "what the client receives", capability: "proposal.customer_view",
    verbs: [], anatomy: "editing",
  },
  {
    key: "production", label: "Production",
    blurb: "Quantities, prep, and fulfilment — internal, vendor, or both.",
    supports: { print: true },
    cap: "requirements", perm: "ops.view", module: "production", editable: false,
    concern: "producing the event (kitchen)", capability: "lens.production",
    verbs: [], anatomy: "sheet",
  },
  {
    // SPEC-003 §9 Rev A: survives untouched until Warehouse AND Staffing are
    // registered and shipping; then one release as a deprecated alias
    // (?lens=operations → warehouse); then retired — never reused.
    key: "operations", label: "Operations",
    blurb: "Staffing, equipment, timing, logistics.",
    cap: "requirements", perm: "ops.view", module: "operations", editable: false,
    concern: "operations (superseded-in-place per SPEC-003 §9)",
    capability: "lens.operations", verbs: [], anatomy: "sheet",
  },
  {
    key: "photography", label: "Photography",
    blurb: "Shot list derived from the design.",
    cap: "photos_retrieval", perm: "knowledge.view", module: "photography", editable: false,
    concern: "photographing the event (evidence-side)",
    capability: "lens.photography", verbs: [], anatomy: "sheet",
  },
];
for (const l of SEED_LENSES) registerLens(l);

/** Config shape. An OBJECT (condition 2) so that adding `modules` later is a
 *  field, not a signature change. */
export interface LensConfig {
  caps: Capabilities;
  /** SPEC-003 §5: the feature-licensing checker (KA §10). Defaults to
   *  currentCan() so no caller changes — condition 2's object shape doing
   *  exactly the job it was built for. */
  featureCan?: (capability: string) => boolean;
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
  const can = config.featureCan ?? currentCan();
  return LENSES.filter((lens) => {
    const capOk = lens.cap === null || config.caps[lens.cap] === true;
    // SPEC-003 §5: the constitutional gate. Transitional release: both this
    // AND `cap` are checked (fail-closed); `cap` is then removed.
    const featOk = lens.capability === undefined || lens.capability === null
      || can(lens.capability);
    const permOk = session.perms.includes(lens.perm);   // ← condition 1
    return capOk && featOk && permOk;
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

/** v224 — the one question chrome may ask: does this lens edit this layer?
 *  (Chrome consults declarations, never names.) */
/** The selection twin of lensEdits. */
export const lensSelects = (
  def: LensDef | null | undefined,
  kind: "document" | "section" | "component",
): boolean => def?.selects?.[kind] === true;

export const lensEdits = (
  def: LensDef | null | undefined,
  layer: "presentation" | "content" | "structure" | "pricing",
): boolean => def?.edits?.[layer] === true;
