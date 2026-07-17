// ═══════════════════════════════════════════════════════════════════════════
// PROMOTION — the pure core of the ceremony (v208 · SPEC-004 Rev B).
// Kind REGISTRIES per READINESS F-4: future homes (media:*, catalog:*)
// register a composer; nothing here gets rewritten. Selection is opt-in,
// composition is translation (§3 of the spec), coherence findings are named
// and never repaired, and NOTHING in this module can write — it imports no
// persistence.
// ═══════════════════════════════════════════════════════════════════════════
import { DivergenceLine } from "./moves/registry";
import { RevisionDoc } from "./curation";
import { Citation } from "./curation";
import { BaselineProvenance } from "./configure";

// ── an evidence line: a divergence line in its event's context ──
export interface EvidenceLine {
  key: string;                       // dimension_key (kind:identifier)
  text: string;
  from?: unknown;
  to?: unknown;
  componentId: string;
  eventLabel: string;                // "Goldberg Wedding · Aug 2026"
  isEvidence: boolean;               // completed/archived/cancelled lifecycle
  baselineKind: BaselineProvenance | "none";
  baselineRevision: string | null;
  noItemBaseline?: boolean;          // §0a: item line on a non-stamped instance
  /** v209: a layer line — the instance's layer content vs its copied_from.
   *  Layer lines compose into p_layers, never into the config document. */
  layer?: { layerKey: string; data: unknown; expectedLive: string | null; schemaVersion: number };
  /** v209: for a choice value outside its dimension's options, the operator
   *  may deliberately formalize it as a new option in the same act. */
  formalizeOption?: boolean;
}

export interface EvidenceAnnotation {
  componentId: string; eventLabel: string; layerKey: string; text: string;
}

// ── F-4: the promotion-kind registry ──
export interface PromotionKind {
  prefix: string;                                    // "choice" | "scalar" | "item" | future
  whereItLands: (line: EvidenceLine) => string;      // shown per line in the review
  compose: (doc: RevisionDoc, line: EvidenceLine) => void;  // mutates a deep copy
}
const kinds = new Map<string, PromotionKind>();
export function registerPromotionKind(k: PromotionKind): void {
  if (kinds.has(k.prefix)) throw new Error(`promotion kind '${k.prefix}' already registered`);
  kinds.set(k.prefix, k);
}
export function promotionKindFor(key: string): PromotionKind | undefined {
  return kinds.get(key.split(":")[0]);
}
export function _resetPromotionKindsForTests(): void { kinds.clear(); }

// ── the core kinds ──
export function registerCorePromotionKinds(): void {
  registerPromotionKind({
    prefix: "choice",
    whereItLands: (l) => `becomes the default ${l.key.split(":")[1]}${l.formalizeOption ? " (and a new option)" : ""}`,
    compose: (doc, l) => {
      const k = l.key.split(":")[1];
      const v = String(l.to);
      doc.instanceDefaults.choices[k] = v;
      // formalization is DELIBERATE: without the flag, an out-of-options value
      // stays incoherent and the coherence check blocks by name (P-4)
      if (l.formalizeOption && doc.dimensions?.[k] && !doc.dimensions[k].options.includes(v))
        doc.dimensions[k].options.push(v);
    },
  });
  registerPromotionKind({
    prefix: "layer",
    whereItLands: (l) => `revises the ${l.key.split(":")[1]} layer`,
    compose: () => { /* layer lines land via composeLayers, never in the doc */ },
  });
  registerPromotionKind({
    prefix: "scalar",
    whereItLands: (l) => `becomes the default ${l.key.split(":")[1].replace(/_/g, " ")}`,
    compose: (doc, l) => {
      const k = l.key.split(":")[1];
      const v = Number(l.to);
      const prev = doc.instanceDefaults.scalars[k];
      doc.instanceDefaults.scalars[k] = {
        value: v, overridden: false,
        derivation: prev?.derivation ? { ...prev.derivation, suggested: v } : { formula: "promoted standard", suggested: v },
      };
    },
  });
  registerPromotionKind({
    prefix: "item",
    whereItLands: (l) => l.to === null
      ? `removes ${l.key.split(":").slice(1).join(":")} from default items`
      : `adds ${l.key.split(":").slice(1).join(":")} to default items`,
    compose: (doc, l) => {
      const name = l.key.split(":").slice(1).join(":");
      const items = doc.defaultItems ?? [];
      if (l.to === null) {
        doc.defaultItems = items.filter((i) => i.name !== name);
      } else if (!items.some((i) => i.name === name)) {
        const t = l.to as { unit_price?: number; quantity_basis?: string };
        doc.defaultItems = [...items, { name, unit_price: t?.unit_price, quantity_basis: t?.quantity_basis ?? "per_person", position: items.length }];
      }
    },
  });
}

// ── frequency across events, by semantic key+value ──
export interface Frequency { key: string; toText: string; count: number; ofEvents: number }
export function aggregateEvidence(lines: EvidenceLine[], eventCount: number): Map<string, Frequency> {
  const m = new Map<string, Frequency>();
  for (const l of lines) {
    const id = `${l.key}=${JSON.stringify(l.to ?? null)}`;
    const f = m.get(id) ?? { key: l.key, toText: String(l.to ?? "removed"), count: 0, ofEvents: eventCount };
    f.count += 1;
    m.set(id, f);
  }
  return m;
}

// ── composition: fold SELECTED lines into a deep copy of the live document.
//    v209 framing: choice lines may compose into a NEW SCHEME instead of the
//    defaults — the ceremony's first question (SPEC-004 review question 2).
export interface SchemeFraming { id: string; label: string }
export function composeRevision(live: RevisionDoc, selected: EvidenceLine[], framing?: SchemeFraming): RevisionDoc {
  const doc: RevisionDoc = JSON.parse(JSON.stringify(live));
  const asScheme: Record<string, string> = {};
  for (const l of selected) {
    const kind = promotionKindFor(l.key);
    if (!kind) throw new Error(`NO_HOME: '${l.key}' has no promotion home — that is a spec change, not a promotion`);
    if (framing && l.key.startsWith("choice:")) {
      const k = l.key.split(":")[1];
      asScheme[k] = String(l.to);
      // formalization still applies under scheme framing — the option must
      // exist for the scheme to be coherent
      if (l.formalizeOption && doc.dimensions?.[k] && !doc.dimensions[k].options.includes(String(l.to)))
        doc.dimensions[k].options.push(String(l.to));
      continue;
    }
    kind.compose(doc, l);
  }
  if (framing && Object.keys(asScheme).length > 0) {
    doc.schemes = { ...(doc.schemes ?? {}),
      [framing.id]: { id: framing.id, label: framing.label, sets: { choices: asScheme } } };
  }
  return doc;
}

/** v209: layer lines → the act's p_layers. One plan per layer key; a second
 *  selected line for the same key is a selection error, named. */
export function composeLayers(selected: EvidenceLine[]): { layer_key: string; expected_live: string | null; schema_version: number; data: unknown }[] {
  const seen = new Set<string>();
  const out: { layer_key: string; expected_live: string | null; schema_version: number; data: unknown }[] = [];
  for (const l of selected) {
    if (!l.layer) continue;
    if (seen.has(l.layer.layerKey))
      throw new Error(`LAYER_CONFLICT: two selected lines both revise the ${l.layer.layerKey} layer — choose one`);
    seen.add(l.layer.layerKey);
    out.push({ layer_key: l.layer.layerKey, expected_live: l.layer.expectedLive,
      schema_version: l.layer.schemaVersion, data: l.layer.data });
  }
  return out;
}

// ── coherence: named findings, never repairs ──
export function checkCoherence(doc: RevisionDoc): string[] {
  const out: string[] = [];
  const dims = doc.dimensions ?? {};
  for (const [k, v] of Object.entries(doc.instanceDefaults.choices)) {
    if (dims[k] && !dims[k].options.includes(v))
      out.push(`default ${k} is '${v}', which is not among its options (${dims[k].options.join(", ")})`);
  }
  for (const sch of Object.values(doc.schemes ?? {})) {
    for (const [k, v] of Object.entries(sch.sets.choices ?? {})) {
      if (dims[k] && !dims[k].options.includes(v))
        out.push(`scheme '${sch.label}' sets ${k} to '${v}', which is not among its options`);
    }
  }
  const itemNames = new Set((doc.defaultItems ?? []).map((i) => i.name));
  for (const s of Object.values(doc.schemes ?? {})) {
    const refs = (s as { sets: { items?: string[] } }).sets.items ?? [];
    for (const r of refs) if (!itemNames.has(r))
      out.push(`scheme '${s.label}' references '${r}', which is not a default item`);
  }
  for (const [k, s] of Object.entries(doc.instanceDefaults.scalars)) {
    const refs = (s.derivation?.formula ?? "").match(/\{(\w+)\}/g) ?? [];
    for (const r of refs) {
      const name = r.slice(1, -1);
      if (!doc.instanceDefaults.scalars[name]) out.push(`${k}'s derivation references '${name}', which does not exist`);
    }
  }
  return out;
}

// ── citations from a selection: the provenance the act will carry ──
export function citationsFor(selected: EvidenceLine[]): Citation[] {
  return selected.map((l) => ({
    component_id: l.componentId,
    dimension_key: l.key,
    from_value: l.from ?? null,
    to_value: l.to ?? null,
    baseline_kind: l.noItemBaseline ? "no_item_baseline" : String(l.baselineKind),
    baseline_revision: l.baselineRevision,
  }));
}
