// ═══════════════════════════════════════════════════════════════════════════
// CURATION — the client seam for the ONE writing path (SPEC-004 INV-1).
// authorRevision() is the only way organizational knowledge changes; origin
// is data, and the adapter is injectable so the browser harness exercises
// the SAME validations the RPC enforces.
// ═══════════════════════════════════════════════════════════════════════════
import { SchemeDef } from "./moves/registry";
import { ScalarState } from "./moves/types";

export interface RevisionDoc {
  dimensions?: Record<string, { label: string; options: string[] }>;
  instanceDefaults: {
    schemeId: string | null;
    customized: string[];
    scalars: Record<string, ScalarState>;
    choices: Record<string, string>;
    display: Record<string, unknown>;
    substitutions: Record<string, unknown>;
  };
  schemes?: Record<string, SchemeDef>;
  defaultItems?: { name: string; quantity_basis?: string; unit_price?: number; position?: number }[];
}

export function emptyDoc(): RevisionDoc {
  return { dimensions: {}, schemes: {}, defaultItems: [],
    instanceDefaults: { schemeId: null, customized: [], scalars: {}, choices: {}, display: {}, substitutions: {} } };
}

export interface Citation {
  component_id: string;
  dimension_key: string;             // kind:identifier (READINESS F-3)
  from_value?: unknown;
  to_value?: unknown;
  baseline_kind: string;
  baseline_revision?: string | null;
}

export interface LayerRevisionPlan {
  layer_key: string;
  expected_live: string | null;          // null ONLY for the key's first revision
  schema_version: number;
  data: unknown;
}

export interface AuthorArgs {
  definitionId: string;
  expectedLiveRevision: string | null;   // null ONLY for a definition's first revision
  data: RevisionDoc | null;              // null for a LAYER-ONLY act (v209, F-2)
  schemaVersion: number;
  layers?: LayerRevisionPlan[];
  origin: "promotion" | "executive_curation";
  note: string;
  citations?: Citation[];
  sessionKey?: string | null;
}

export type AuthorResult =
  | { ok: true; actId: string; revisionId: string }
  | { ok: false; error: string };

export interface AuthorAdapter { (a: AuthorArgs): Promise<AuthorResult>; }

/** Client-side pre-validation mirroring the RPC exactly — the RPC remains the
 *  authority; this just gives the ceremony instant, named refusals. */
export function validateAuthorArgs(a: AuthorArgs): string | null {
  if (a.origin === "promotion" && (!a.citations || a.citations.length === 0))
    return "CITATIONS_REQUIRED: a promotion must cite at least one divergence line";
  if (a.origin === "executive_curation" && a.citations && a.citations.length > 0)
    return "CITATIONS_FORBIDDEN: executive curation cites a decision, not events";
  if (!a.note || a.note.trim() === "") return "NOTE_REQUIRED: the act must state its reason";
  if (!a.data && (!a.layers || a.layers.length === 0))
    return "NO_ARTIFACTS: an act must produce at least one artifact";
  return null;
}

export async function authorRevision(a: AuthorArgs, adapter: AuthorAdapter): Promise<AuthorResult> {
  const invalid = validateAuthorArgs(a);
  if (invalid) return { ok: false, error: invalid };
  return adapter(a);
}

/** A one-glance summary of what changed between two documents — the staging
 *  panel's content. Paths in business language, not JSON pointers. */
export function diffDocs(a: RevisionDoc, b: RevisionDoc): string[] {
  const out: string[] = [];
  const ad = a.instanceDefaults, bd = b.instanceDefaults;
  for (const k of Array.from(new Set(Object.keys(ad.choices).concat(Object.keys(bd.choices))))) {
    if (ad.choices[k] !== bd.choices[k])
      out.push(`default ${k}: ${ad.choices[k] ?? "—"} → ${bd.choices[k] ?? "—"}`);
  }
  for (const k of Array.from(new Set(Object.keys(ad.scalars).concat(Object.keys(bd.scalars))))) {
    const av = ad.scalars[k]?.value, bv = bd.scalars[k]?.value;
    if (av !== bv) out.push(`default ${k}: ${av ?? "—"} → ${bv ?? "—"}`);
  }
  const aDims = a.dimensions ?? {}, bDims = b.dimensions ?? {};
  for (const k of Array.from(new Set(Object.keys(aDims).concat(Object.keys(bDims))))) {
    const ao = (aDims[k]?.options ?? []).join("|"), bo = (bDims[k]?.options ?? []).join("|");
    if (!aDims[k]) out.push(`dimension ${k}: added`);
    else if (!bDims[k]) out.push(`dimension ${k}: removed`);
    else if (ao !== bo) out.push(`dimension ${k}: options ${ao.replace(/\|/g, ", ")} → ${bo.replace(/\|/g, ", ")}`);
  }
  const aS = a.schemes ?? {}, bS = b.schemes ?? {};
  for (const k of Array.from(new Set(Object.keys(aS).concat(Object.keys(bS))))) {
    if (!aS[k]) out.push(`scheme ${bS[k].label}: added`);
    else if (!bS[k]) out.push(`scheme ${aS[k].label}: removed`);
    else if (JSON.stringify(aS[k]) !== JSON.stringify(bS[k])) out.push(`scheme ${bS[k].label}: revised`);
  }
  const aI = new Map((a.defaultItems ?? []).map((i) => [i.name, i]));
  const bI = new Map((b.defaultItems ?? []).map((i) => [i.name, i]));
  const names = new Set(Array.from(aI.keys()).concat(Array.from(bI.keys())));
  names.forEach((nm) => {
    if (!aI.has(nm)) out.push(`default item ${nm}: added`);
    else if (!bI.has(nm)) out.push(`default item ${nm}: removed`);
    else if (aI.get(nm)!.unit_price !== bI.get(nm)!.unit_price)
      out.push(`default item ${nm}: $${aI.get(nm)!.unit_price ?? "—"} → $${bI.get(nm)!.unit_price ?? "—"}`);
  });
  return out;
}

/** The harness twin: refuses everything the RPC refuses, records what lands,
 *  and can simulate a staging race once. */
export function memoryCurationAdapter() {
  const acts: (AuthorArgs & { actId: string; revisionId: string })[] = [];
  let liveRevision: string | null = null;
  let raceOnce = false;
  const adapter: AuthorAdapter = async (a) => {
    const invalid = validateAuthorArgs(a);
    if (invalid) return { ok: false, error: invalid };
    if (raceOnce) {
      raceOnce = false;
      liveRevision = `rev-race-${acts.length}`;
      return { ok: false, error: "REVISION_SUPERSEDED: the revision you staged against is no longer live" };
    }
    // mirror the RPC: the config staging check applies only when a config
    // document is present — a layer-only act (data:null, F-2) skips it
    if (a.data !== null && a.expectedLiveRevision !== liveRevision)
      return { ok: false, error: liveRevision === null
        ? "REVISION_SUPERSEDED: the revision you staged against is no longer live"
        : "EXPECTED_REQUIRED: a live revision exists; stage against it" };
    const rec = { ...JSON.parse(JSON.stringify(a)), actId: `act-${acts.length + 1}`, revisionId: a.data !== null ? `rev-${acts.length + 1}` : null };
    acts.push(rec);
    if (a.data !== null) liveRevision = rec.revisionId!;
    return { ok: true, actId: rec.actId, revisionId: rec.revisionId };
  };
  return { adapter, acts,
    setLive: (r: string | null) => { liveRevision = r; },
    getLive: () => liveRevision,
    armRace: () => { raceOnce = true; } };
}
