# SPEC-001 — Component Knowledge Foundation

**Status: Implemented in v200 (Rev D — configurable-family invariant made explicit post-implementation review) · Supersedes: none**

*EventCore · architecture specification (RFC sequence, independent of release versions)*

**Rev B — principal review pass.** Line-by-line review against the four documents found and fixed: (1) definition-level versioning fragmented the stable graph node — versioning moved to layers, where change actually happens; (2) tenants had no legal way to attach knowledge to global starters — fork rule added; (3) the compatibility view could bypass RLS — `security_invoker` mandated and verified; (4) the layer uniqueness constraint made archive a delete in disguise — partial index; (5) the customer layer's grandfathered storage is now named honestly. Title renamed: kitchen is the first consumer of this foundation, not its definition.

**Rev C — targeted refinements from principal review** (approved-with-changes): fork independence stated as law; `created_from` split into mechanism (`created_by_process`) and provenance pointer (`source_definition_id`); architectural invariants section added covering layer opacity, registry ownership, instantiation exclusivity, and layer independence.

**Rev D — post-implementation review.** Made the configurable-family invariant explicit (§1.4: a definition identifies a reusable concept, not a frozen composition); documented definition-layer data as *seed knowledge* — copied at instantiation, thereafter owned by the instance; added verify-matrix check V-B10 proving two instances of one definition diverge completely without spawning a definition. No schema, model, or behavior changed: the foundation already satisfied the invariant, which was latent in the title-keyed trigger and is now stated where it binds.

**Citations** — implements VISION "One source of truth", "The design is an object graph", "Every layer is equally real"; KNOWLEDGE_ARCHITECTURE §2 (Knowledge Model), §6 (Grammar), §11 (Roadmap, first entry — cited there as SPEC-001); UI_GRAMMAR unchanged in its entirety; ENGINEERING_PRINCIPLES "No duplicated truth", "Render decisions never persisted", "Grammar grows by declaration", "Every capability is declarative", "Provenance is never discarded", "Tenant isolation is proven".

---

## 1. Architecture

### 1.1 The decision that shapes everything else

v192 already created the graph node: `component_identities` — `{id, tenant_id, name}` — with every `event_components` row pointing at it via `identity_id`, an auto-assign trigger covering all 87 insert sites, and media galleries already keyed to it. v192's own comment reserves this move: *"ComponentDefinition can absorb it at Layer 2; instances already point here."*

**ComponentDefinition is therefore not a new table. `component_identities` is renamed and grown into `component_definitions`.** Creating a parallel table would be a second source of truth for "what is a Sushi Station" — the exact sin ENGINEERING_PRINCIPLES forbids — and would orphan the FK graph that already exists (instances, galleries, the Rolodex). The identity *is* the definition, at its minimal stage of growth.

One honesty note, so no reviewer trips on it: the **customer presentation layer is grandfathered** in the dedicated `event_components`/`event_items` columns it has always lived in. "Every layer is equally real" (VISION) is a claim about status, not storage — the customer layer is not privileged, it is merely older. Converging it into the generic layer table is possible later and is deliberately not attempted here (§1.5); attempting it now would put the Studio's every read path inside this migration's blast radius.

### 1.2 The honesty rule of this migration

**Migration must not manufacture curated knowledge.** KNOWLEDGE_ARCHITECTURE §2: the only bridge from evidence/live work to curated knowledge is Promote — a human act. Existing identities were auto-derived from titles; they are *references*, not decisions. So:

- Every migrated definition gets `status = 'implicit'`. An implicit definition is a graph node: it names the object, anchors galleries and usage counts, and can carry nothing normative.
- `status = 'curated'` is reachable **only** through the Promote ceremony (a later slice) or deliberate authoring. Layers attached to an implicit definition promote it to curated *explicitly, by the person attaching them* — attaching kitchen knowledge to "Sushi Station" is a curation act and the UI will say so.
- Nothing in this migration, and no trigger, ever sets `curated`.

This single rule keeps the Evidence/Curated/Live triad intact through the platform's most invasive migration.

### 1.3 Layers: one generic attachment, one registry

A layer is operational knowledge attached to a definition or to a live component instance. Two properties are non-negotiable:

- **The graph does not know the consumers.** Kitchen discovers kitchen data; the storage never mentions Kitchen. There is one generic layer table, keyed by `layer_key` text — no per-layer tables, no enum, no CHECK constraint listing layers (a new layer must not require DDL).
- **Behavior is registered, never switched.** A TypeScript **LayerRegistry** is the sole authority on what a `layer_key` means: its payload schema (versioned), its capability key, its lens integration, its future Library projection. The Postgres side stores validated JSONB and stays permanently generic. Adding Photography = one registration file. If adding a layer touches any file outside its registration, this architecture has failed (the Library zero-diff discipline, applied one level down).

### 1.4 Definition vs. instance layers — both exist, for different reasons

- `component_layers` on a **definition**: curated knowledge. "A Sushi Station requires refrigeration, a sushi chef, black slate platters." Written by curation, read at instantiation.
- `component_instance_layers` on a **live** `event_components` row: live work. "*This* Sushi Station, at the Goldberg wedding, needs a second chef." Created by deep copy at instantiation (lossless reuse — VISION), then freely edited without touching the source (source never changed — KA §1).

Same shape, different knowledge states, and the state is carried by *where the row lives*, not by a flag. The Production lens (SPEC-002) reads instance layers; the Library (later) reads definition layers. When an event executes, its instance layers become part of the evidence — no copying needed, they already belong to the version tree.

**A definition is a configurable family, never a frozen composition.** A ComponentDefinition identifies a reusable *concept* — "Sushi Station" — not one fixed bill of materials. Instances of the same definition may select, add, remove, substitute, and override their items, recipes, props, presentation, equipment, staffing, and operational requirements without creating a new definition; one event's Sushi Station is traditional rolls on black slate with a live chef, another's is specialty rolls on acrylic risers with no preparation, and both are the same definition. Definition-layer data is **seed knowledge** — defaults, available choices, rules — copied at instantiation and thereafter owned entirely by the instance; it is never a mandate. Presentation *schemes* and choice structures, when they arrive, are payload evolutions inside layers (a `schema_version` bump), never new tables and never new definitions. A new definition is created only when the business recognizes a genuinely different reusable concept — which is exactly what the title-keyed trigger already implements: different composition, same name → same definition. The verify matrix encodes this as V-B10.

**Versioning lives on layers, not definitions.** The definition row is the permanent graph node — the identity that galleries, usage counts, and instances aggregate on. It can be archived (retired), never superseded: "Sushi Station" does not become a new row when its kitchen procedure improves. What changes over time is the *knowledge*, so `component_layers` carries the supersede chain: updating a curated layer inserts a new revision and stamps the old one `superseded_by`, never rewriting it. "Which version did Goldberg actually use?" (KA §7, Time) is answered by the instance layer's `copied_from` pointing at the exact revision that was copied — precise history with an unfragmented graph.

### 1.5 Global starters and the fork rule

Tenants read global (`tenant_id NULL`) definitions and their layers; they never write them. A tenant that wants to customize a global starter — attach their own kitchen procedure to the global "Sushi Station" — **forks it**: a tenant-scoped definition is created (`created_by_process = 'fork'`, `source_definition_id` → the global), layers deep-copied with `copied_from` stamps, and the tenant edits their copy. This is the same verb instantiation uses and the same one the Library will need; without it, every tenant hits an invisible wall the first time they try to make a starter their own. Fork is explicit and user-initiated — never a silent side effect of an attempted write.

**A fork is permanently independent.** Upstream changes never propagate automatically — a global starter improved six months later does not alter, notify, or invalidate any tenant's fork. If "the starter you forked has improved" ever becomes a surface, it is a product feature built on `source_definition_id`, designed and shipped deliberately — never schema behavior, never a trigger, never a sync. The governing rule: **forked knowledge belongs to the tenant from the moment of the fork, completely.**

### 1.6 Architectural invariants

Stated once, enforced in review forever:

1. **Layer payloads are opaque to the platform.** Only the registered layer owns its internal schema. No code outside a layer's registration may reach into its JSONB — `SELECT data->>'chefCount'` in unrelated code is a review-blocking violation, because it silently couples the platform to a schema the registry is supposed to own and migrate.
2. **The registration owns everything about its layer**: schema, validation, migration, rendering, projection, defaults. If any behavior about a layer lives outside its registration file, the registry has been bypassed and the zero-diff property is already lost.
3. **Instantiation is the only operation that copies definition knowledge into live work.** No background sync, no lazy hydration, no "refresh from definition" side channel — one verb, one code path, one `copied_from` stamp.
4. **Layers never reference each other.** No foreign keys, no embedded IDs, no read-time joins from one layer's payload into another's. Layers are independent projections of the same object; the moment Kitchen references Warehouse, they stop being layers and become a hidden module with a hidden schema. Cross-layer knowledge, if ever needed, belongs to the definition itself or to a new, deliberately designed relationship — never inside a payload.

### 1.7 What this slice deliberately does not build

Named so nobody "helpfully" adds them during implementation: no layer editors (SPEC-002 (Production lens)+ per layer), no Promote ceremony, no Library projection, no definition versioning UI — the architecture deliberately has none; only layers are revisioned (§1.4), no auto-derivation of layer content from historical events, no per-layer tables, no cross-tenant definition sharing beyond the global (`tenant_id NULL`) scope.

## 2. Object graph

```
                       KNOWLEDGE STATE            TABLE
  ┌──────────────────────┐
  │ ComponentDefinition  │  implicit → curated    component_definitions
  │  "Sushi Station"     │  (Promote/authoring     (grown from
  │  PERMANENT NODE      │   only; archivable,     component_identities)
  └─────────┬────────────┘   never superseded)
            │ 1:N
  ┌─────────┴────────────┐
  │ Definition layer     │  curated               component_layers
  │  kitchen · warehouse │  REVISIONED            (definition_id, layer_key,
  │  staffing · floor …  │  (superseded_by chain;  schema_version, data,
  │                      │   history never         superseded_by)
  └──────────────────────┘   overwritten)
            ▲ deep-copied at instantiation (never referenced live)
            │
  ┌─────────┴────────────┐
  │ Component instance   │  live work             event_components
  │  in a proposal ver.  │  → evidence when       (+ definition_id = renamed
  │                      │    executed             identity_id; copied_from
  └─────────┬────────────┘                         and instantiation stamps)
            │ 1:N
  ┌─────────┴────────────┐
  │ Instance layer       │  live → evidence       component_instance_layers
  └──────────────────────┘

  event_items ──(unchanged)── event_components        (v191 category_key intact)
  media/galleries ──(unchanged FK, renamed)── component_definitions
```

Features discover these objects through the registry and capabilities; no feature owns any row (VISION: "Features discover objects; they do not own them").

## 3. SQL migration plan (additive-only; one file, `v200_component_definitions.sql`)

All steps idempotent, v189 RLS pattern throughout, nothing dropped, no data rewritten.

1. **Rename** `component_identities` → `component_definitions`; keep a compatibility view `component_identities` (SELECT-only, **`with (security_invoker = true)`** — a default-privilege view would execute as its owner and bypass RLS, the exact leak the verify matrix exists to catch) for one release, so any missed reference fails soft and loud in logs rather than hard in production. All four RLS policies re-created under the new name; global-scope amendment: `tenant_id` becomes nullable, `NULL` = global starter (read: `tenant_id IS NULL OR tenant_id = current_tenant_id()`; write: tenant rows only; global rows service-role only; tenant customization of a global goes through the fork rule, §1.5).
2. **Grow the definition**: add `status text not null default 'implicit' check (status in ('implicit','curated'))`, `description text`, `archived_at timestamptz`, `promoted_by uuid`, `promoted_at timestamptz`, `created_by_process text not null` — the creation *mechanism*: `'v200_migration'` for rows existing at migration, `'auto_title'` stamped by the retained trigger, `'fork'`, `'authored'`, and later `'promotion'` — and `source_definition_id uuid references component_definitions(id)` — the provenance *pointer* (set by fork and, later, promotion; null for original creations). These are different concepts and get different columns: mechanism answers "how did this row come to exist," provenance answers "what did it come from." Overloading one text column with both is how a schema accumulates `'import'`, `'duplicate'`, `'api'`, `'template'` in a single field two years from now. **No `version`/`superseded_by` on definitions** — the definition is the permanent node (§1.4); versioning belongs to layers. Definitions archive, never delete (KA §7 Time).
3. **Rename column** `event_components.identity_id` → `definition_id` (plus compatibility view exposure). The v192 auto-assign trigger is retained verbatim (find-or-create by title still produces `implicit` definitions — correct by 1.2).
4. **Create** `component_layers` (`id, definition_id FK, layer_key text, schema_version int, data jsonb, created_by, created_at, superseded_by uuid references component_layers(id), archived_at`). Uniqueness is over **live** rows only — `create unique index … on (definition_id, layer_key) where superseded_by is null and archived_at is null` — a full unique constraint would make archive a delete in disguise and forbid ever re-attaching a layer. Updates insert a new revision and stamp the old row's `superseded_by`; rows are never rewritten. RLS derives from the owning definition's tenancy; layers on global definitions are service-role write only (tenants fork, §1.5).
5. **Create** `component_instance_layers` (same shape; `component_id FK → event_components`; `copied_from uuid references component_layers(id)` — the lossless-reuse stamp; RLS derived from the owning component's version→booking→tenant chain, matching `event_items`).
6. **Verify matrix** additions (extends `v189_verify_matrix.sql`): tenant A cannot read B's definitions or layers; both read globals; neither writes globals or global layers; a tenant write against a global definition is refused (the fork path is the only door); instance layers unreachable across tenants; **the compatibility view is exercised under tenant credentials and proven to return exactly what the base table would** — not assumed.

**Explicitly absent from the migration**: no backfill of `component_layers` (would manufacture curated knowledge), no touch of `event_items`, `proposal_versions`, pricing, or any Studio-read column.

## 4. TypeScript model

```ts
// The knowledge object (curated / implicit)
interface ComponentDefinition {
  id: string;
  tenantId: string | null;              // null = global starter
  name: string;
  description: string | null;
  status: "implicit" | "curated";
  archivedAt: string | null;            // definitions archive; they never supersede
  provenance: {
    createdByProcess: "v200_migration" | "auto_title" | "fork" | "authored" | "promotion";
    sourceDefinitionId: string | null;  // fork/promotion origin; the family pointer
    promotedBy?: string; promotedAt?: string;
  };
}

// One attached layer, on a definition or an instance
interface ComponentLayer<K extends LayerKey = LayerKey> {
  id: string;
  ownerId: string;                      // definition_id or component_id
  ownerKind: "definition" | "instance";
  layerKey: K;
  schemaVersion: number;
  data: LayerData[K];                   // typed via the registry
  supersededBy?: string;                // definition layers: revision chain (KA §7 Time)
  copiedFrom?: string;                  // instance layers: the exact source revision
}
```

`LayerData` is assembled from registrations (declaration merging or a generated map) — the model file never enumerates layers by hand.

## 5. Registry interfaces

```ts
interface LayerRegistration<T> {
  key: string;                          // "kitchen", "warehouse", …
  capability: string;                   // "production.kitchen" — declared, not derived
  schemaVersion: number;
  schema: Validator<T>;                 // zod; the ONLY writer-side gate
  migrations: Record<number, (old: unknown) => unknown>;
                                        // pure fns, vN→vN+1; read path upgrades lazily
  emptyState: () => T;
  label: { singular: string; icon: string };
  // Consumption is declared here too — the layer says how it is seen;
  // no lens or feature ever switches on `key`:
  lens?: LensContribution;              // how SPEC-003's Production lens renders it
  libraryProjection?: (d: ComponentDefinition, l: T) => Partial<LibraryEntry>; // later
}

interface LayerRegistry {
  register<T>(r: LayerRegistration<T>): void;   // build-time; duplicate key = build error
  get(key: string): LayerRegistration<unknown> | undefined;
  all(): LayerRegistration<unknown>[];
  available(can: (cap: string) => boolean): LayerRegistration<unknown>[];
}
```

SPEC-001 (v200) registers **exactly one** layer (`kitchen` may register with `emptyState` only, as the registry's proof-of-life); the point of this slice is the socket, not the plugs. API write path: `registry.get(key)` → capability check → `schema.parse(data)` → insert. Unknown key or failed parse = refusal; the database never sees an unvalidated payload.

## 6. Capability integration

Layer registrations declare their capability key; nothing else does. Enforcement is layered per KA §10: the UI renders `registry.available(can)` (absent, not disabled — UI_GRAMMAR §3); the API re-checks on every layer read/write. **Disabling a capability never touches the graph**: a tenant that turns Warehouse off keeps every warehouse row; the layer merely stops rendering, and re-enabling restores it intact. Surfaces render the *intersection* of what the object carries and what the tenant may see. No `if (plan === …)` anywhere; the tier tables from KA §10 are data this slice consumes, not code it contains.

## 7. Migration strategy — Studio behaves identically, by construction

The strongest regression guarantee is that **no code path the Studio reads is modified**: `event_components` columns the Stage selects (`id,title,domain,position,notes,…`) are untouched; `event_items` untouched; the only rename (`identity_id → definition_id`) is bridged by the compatibility view *and* a coordinated app-side rename in the same deploy (three read sites found: RolodexPanel, KnowledgeCard, gallery lookups).

Proof, not assertion: the 15 real-Chromium acceptance tests run unchanged against the migrated build — same 15/15 bar, same regression variant. Deploy order: SQL first (additive, invisible), app rename second, compatibility view removed one release later. Rollback: the view makes step 2 independently revertible; step 1 is additive and needs no rollback.

Provenance across the migration: every existing `copied_from` chain, `definition_id` pointer, and gallery FK survives because the underlying rows and ids never change — only one table and one column are renamed. Backfilled definitions carry `created_by_process = 'v200_migration'` so the genealogy records that these nodes were inferred, not authored.

## 8. Risk analysis

| Risk | Severity | Mitigation |
|---|---|---|
| JSONB layer payloads drift from their schemas over time | High — silent data rot | `schema_version` on every row; registry `migrations` as pure functions; read path upgrades lazily and write path re-validates; a layer without a current-version validator fails the build |
| Migration blurs Evidence/Curated (auto-manufactured knowledge) | High — constitutional | `status='implicit'` default; no layer backfill; `curated` writable only by ceremony code paths; review checklist item |
| Missed `identity_id` reference breaks a surface | Medium | Compatibility view catches stragglers softly; repo-wide grep is a listed implementation step; acceptance suite + Rolodex/gallery smoke checks |
| Generic JSONB invites bypassing the registry ("just write to the table") | Medium — erodes the whole design | RLS permits writes only via the API role; API has exactly one insert path, through `schema.parse`; documented in ENGINEERING_PRINCIPLES terms in the PR description |
| Premature generality (building layer editors, versioning UI, Library hooks "while we're here") | Medium — schedule and design debt | §1.5 is the contract; the PR is scoped to the socket |
| RLS gap on new tables or the global scope | High — tenant leak | Verify-matrix rows in the same migration file; the slice is not done until the matrix passes |
| Definition growth makes the auto-assign trigger produce junk nodes from typo titles | Low | Already true under v192; unchanged here; nodes stamped `created_by_process = 'auto_title'` so curation can find them; dedup/merge is a curation feature (KA §7 `merged`) for a later slice |
| Layer revision chains grow unbounded on frequently-edited layers | Low | Append-only is the design (Time); chains are linear and read paths touch only live rows; if volume ever matters, cold revisions can move to archival storage without model change |
| Fork proliferation: many tenant copies of one global starter drift apart | Low–Medium | Expected and legitimate (each tenant's knowledge is their own); `source_definition_id` keeps the family visible; any future "upstream changed" notification is a feature, not a schema change |

---

**Decisions of record** (answered at approval; retained because the reasoning binds future slices): `implicit`/`curated` confirmed as the status vocabulary — "implicit" admits the node was inferred rather than decided. The compatibility view remains for one release with `security_invoker = true`, and the tenant verification matrix is required before completion (executed: see `supabase/tests/v200_rls_proof.sql`). `kitchen` ships as the proof-of-life registration — registration, schema, empty state, capability declaration, and tests only; no editor, no Production workflow (the lens is SPEC-003) — because an untested socket is a promise, not a foundation.
