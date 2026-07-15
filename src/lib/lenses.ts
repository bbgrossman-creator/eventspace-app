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

/** The lens to open on. Never assume "customer" — a chef who may not price an
 *  event would land on a page of numbers they cannot read. First visible wins,
 *  and LENSES is ordered maker-first deliberately. */
export function defaultLens(config: LensConfig, session: Session | null): LensKey | null {
  return visibleLenses(config, session)[0]?.key ?? null;
}

/** Is a lens legal for this session? Used to reject a URL naming a lens the
 *  user may not open — because a lens grants no permission (Interaction
 *  Doctrine), the URL must be checked, not trusted. */
export function lensAllowed(key: LensKey, config: LensConfig, session: Session | null): boolean {
  return visibleLenses(config, session).some((l) => l.key === key);
}
