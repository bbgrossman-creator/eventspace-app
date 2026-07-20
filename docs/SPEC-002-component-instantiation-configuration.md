# SPEC-002 — Component Instantiation & Configuration

**Status: Approved (Rev C, amended Rev D) · v201: schema + engine · v202: instantiation + facet + browser proof · v203: the Studio wiring — facet mounted in the real Inspector (component selections only), config state loaded per selection, instantiation forked (seed-configured definitions → `instantiate_component()`; the legacy copy survives only as a property of the data: no live seed revision), and all three Canvas item write sites rerouted through `select`/`deselect`/`update_item` with the boundary stated in code: selection identity flows through the grammar; pricing, position, and display flags remain their own systems' paths. Remaining: deterministic intent (test 21), a deliberate follow-up.**

**Rev E (baseline honesty, v206)** — review finding sustained: v205's legacy fallback let present-day curation appear as a past event's baseline. Amended semantics: **a baseline is a frozen snapshot on the instance with named provenance** (`instantiation_stamp` · `legacy_initialized_from_definition` · `reconstructed_from_instance` · `baseline_unknown`), never a pointer to anything mutable. Executed/archived/cancelled events never acquire configuration implicitly (proven V6-1); a first write must state its baseline or the RPC refuses (`BASELINE_REQUIRED`, V6-2); a plain first edit on a live legacy component freezes its pre-edit state (V6-3); later curation cannot move any frozen comparison point (V6-4). Divergence is measured against the frozen baseline, labeled by provenance in the facet. Live legacy components are *offered* deliberate initialization — dated, so it never pretends the seed existed at creation.

**Rev D — consequence storage reconciled with a pre-existing table (constitutional, minimal).** Implementation discovered `component_requirements` (v164): per-instance requirements with live tenant data and an active UI, unknown to the spec drafts. Storing consequences in instance-layer payloads as written would create a second requirements truth — refused per ENGINEERING_PRINCIPLES. Amendment: consequences persist in `component_requirements`, extended additively with `layer_key text`, `logical_key text` (null = manual/legacy), `derived boolean`, `suppressed_at timestamptz`; derived identity is the partial-unique `(component_id, layer_key, logical_key)`. Nothing else changes: rules still emit logical keys from ConfigView, suppressions still target keys, recompute still replaces derived rows wholesale, the lens (SPEC-003) reads one table filtered by layer. Storage location moved; architecture did not.

**Rev D addendum — multi-layer consequence ownership (review-prompted hardening).** One configuration choice legitimately produces requirements across many operational layers — live chef ⇒ kitchen (handwash, prep table), warehouse (station kit), staffing (sushi chef), transportation, photography. The mechanism: `layer_key` is a per-row tag, so one atomic batch persists rows spanning any number of layers, each independently suppressible by its own logical key (proven: engine fan-out test; DB harness V2-7). Ownership is enforced, not assumed: consequence rules are registered *by* a layer and may emit only rows tagged with that layer and namespaced under it — a kitchen rule emitting a warehouse row is refused at recompute. One choice fans out because many layers each declare what it means *for them*, never because one layer writes another's domain (SPEC-001 §1.6, invariants 2 and 4, applied to consequences).

**Rev C — internal-consistency corrections (no architectural or scope change).** §1.1's pre-Rev-B claim that the move log explains divergence replaced with the Rev B rule; risk-table wording aligned to logical-key identity; `RecordedMove.before` reconciled with storage — `configuration_moves` gains a nullable `before jsonb`, written in the move's own transaction, populated only where the kind's `invert` needs prior values.

**Rev B — principal review corrections.** (1) Current divergence is a deterministic state-vs-seed comparison; the move log is causal and gesture history that may *annotate* the diff but never derives it — replay-narrated diffs mislead the moment an edit is reverted and redone. (2) Confirmed batches apply atomically: full-set validation before any mutation; application, consequence recomputation, state writes, and log records in one transaction; any failure rolls back everything. (3) Registered move handlers no longer receive an open `apply()`: they *return* mutations within their declared ownership boundary and the central transaction applies them. (4) Derived consequences carry deterministic logical keys; suppressions and edits target keys, never ephemeral row ids. (5) Instantiation is provenance, not a configuration move — the log begins after the baseline exists. (6) MoveProposal (requested) and RecordedMove (applied fact) are distinct shapes. Additionally: undo language corrected from "for free" to "the necessary foundation for deliberate inverse operations"; deterministic intent's *contract* remains specified here, its parser/UI deferred to the immediate follow-up so the core configuration release doesn't carry language parsing.

**Citations** — implements VISION "One source of truth", "Knowledge is reused without loss", "The design is an object graph"; KNOWLEDGE_ARCHITECTURE §2 (instantiation crosses curated → live), §6 (Grammar: Library → Canvas = instantiate), §7 (`instantiated_from` + `instantiation_id`), §11 (Roadmap, second entry); UI_GRAMMAR §1 (all three governing rules), §8, §11; ENGINEERING_PRINCIPLES "State is derived whenever possible", "No duplicated truth", "Grammar grows by declaration", "Verify against the project's own build config"; SPEC-001 §1.4 (configurable family), §1.6 (invariants); Pre-work I (the seven kinds); Pre-work II (the interaction model, approved, including §10 intent-as-input-method).

**Prime directive for this spec (per approval instruction):** the **move grammar is a first-class architectural concept**. The Inspector facet, the Canvas, scheme application, deterministic intent, future model-assisted intent, and future evidence replay are all specified as *producers of one registered move vocabulary*. Intent is an input adapter to the editing grammar, never a special subsystem.

---

## 1. Architecture

### 1.1 One vocabulary, many speakers

Every configuration change to a component instance is a **move**: a small, validated, self-describing operation from a closed vocabulary. There is exactly one applier. Nothing writes configuration state except by submitting moves to it.

```
  PRODUCERS (speakers)                    THE GRAMMAR                APPLICATION
  ─────────────────────                   ───────────                ───────────
  Configure facet   ──┐
  Canvas (items)    ──┤
  Scheme picker     ──┼──▶  Move[]  ──▶  validate ──▶ stage? ──▶  apply ──▶ record
  Deterministic     ──┤     (closed,      (per-kind    (compound     (one      (append-
   intent           ──┤      registered)   schema +     producers     applier)   only log)
  Model intent*     ──┤                    capability)  stage as
  Evidence replay*  ──┘                                 a diff)
                                          * future adapters — zero architectural change
```

Why this is the architecture and not a convenience: (a) **divergence** ("7 changes from definition") is computed from current state versus the stamped seed; the move log may annotate it with causal and gesture history but never derives the current diff (§1.5); (b) **undo** — deferred twice in this project for want of an inverse-operation model — gains here **the necessary foundation for deliberate inverse operations** (not "free": dependent later moves, occupied positions, archived options, and upgraded rules are real inversion problems that deserve their own slice); (c) **intent** at every tier is an adapter emitting moves, so "like Goldberg but for 120" is a replay of recorded moves, not a new subsystem; (d) **promotion** (SPEC-004) reviews moves — the judgment calls — not table diffs. The move log is the operator's expertise, captured as data.

### 1.2 The vocabulary (closed; grows by registration, never by exception)

Core moves, owned by the platform:

| Kind | Payload (validated) | Notes |
|---|---|---|
| `select` | item spec (category_key, name, price…) | adds a menu item |
| `deselect` | item id | removes one |
| `substitute` | slot, from → to | swap preserving the slot's role |
| `set_scalar` | scalar key, value | records override state vs. derivation |
| `clear_override` | scalar key | return to derived |
| `set_choice` | dimension key, option | service style, display name, etc. |
| `apply_scheme` | scheme id | **compound**: expands to child moves, recorded as one gesture with children |
| `add_requirement` | layer key, requirement | manual consequence |
| `suppress_requirement` / `restore_requirement` | layer key, requirement id | strike-through, never delete (Kitchen sees it was considered) |
| `annotate` | layer key, text | the different material |
| `reset_dimension` | dimension key | **compound** |
| `reset_all` | — | **compound**, ceremony-gated |

Layer registrations may register **layer-scoped move kinds** (namespaced `kitchen.…`) exactly as they register schemas — the vocabulary grows by declaration (ENGINEERING_PRINCIPLES), and the applier learns nothing: it routes namespaced moves to the owning registration's handler.

Every move carries: `instance_id`, `kind`, `payload`, **`origin`** (`facet | canvas | scheme | intent.deterministic | intent.model | intent.replay | system`), `parent_move_id` (compound children), `cause` (for intent: the source text span — "live chef ×2 ← 'two of them'"), `actor`, `created_at`.

**Staging rule (from the interaction model):** single moves from direct manipulation apply live; **compound producers stage** — `apply_scheme`, `reset_all`, and *every* intent submission present the business-language diff and commit nothing until confirmed. Never-silently-merge, generalized to presets and to language.

**Atomicity invariant:** a confirmed batch applies **atomically or not at all**. Validation runs over the *entire expanded move set* before any mutation; application, consequence recomputation, state writes, and move-log records occur in **one transaction**; any failure — an archived option at child 11 of 14, a capability revoked mid-flight — rolls back the whole batch. A component is never left half Acrylic and half Black Slate. Without this, never-silently-merge protects the preview but not the commit.

### 1.3 Configuration state: choices are core; consequences are layers

Pre-work I's fifth finding governs storage: **configuration is choices; layers are consequences.** They live in different strata:

- **Choices** (scheme, scalars + override state, service style, display overrides, substitutions) live in a platform-owned configuration object per instance — *not* a peer layer. It cannot be a layer because consequence rules must read it, and SPEC-001 §1.6 invariant 1 makes layer payloads opaque to everyone but their owner. The platform owns configuration, parses it, and exposes a typed **`ConfigView`** to consequence rules — layers consume the view, never the payload. Opacity holds: exactly one owner parses.
- **Consequences** are written into `component_requirements`, extended per Rev D — one requirements truth for derived and manual alike, each row tagged with its owning `layer_key` by that layer's registered **consequence rules** — pure functions `(ConfigView) → derived requirements`, declared in the registration per SPEC-001 §1.6 invariant 2. Every derived requirement carries a **deterministic logical key** emitted by its rule — `kitchen.live_chef.handwash_station` — stable across recomputations. Suppressions, manual edits, and history attach to the logical key, never to a row id: recomputation replaces the derived set wholesale, and identity survives because identity is the key, so a suppression stays suppressed, an edit stays attached, and an unrelated choice cannot resurrect a struck requirement. Derived entries are marked derived; suppressions and manual additions are moves targeting keys. SPEC-003's lens reads `component_requirements` filtered by layer — one table, one contract.
- **Selections** remain `event_items` — the existing system *is* the selections axis. The applier's `select`/`deselect`/`substitute` handlers are thin wrappers calling the same item functions the Studio calls today, and the Studio's existing item-edit sites are rerouted through those wrappers (a mechanical change: same functions, one hop earlier). One write path achieved without rewriting proven code; the 15 Chromium tests are the regression gate.

Definition side (the seed): option sets, default scalars, available schemes, and consequence-rule parameters are **definition config**, stored with the same revision semantics as definition layers (supersede-and-chain, Time preserved). Instantiation copies the then-current revision and stamps it — "which seed did Goldberg get" stays answerable forever.

### 1.4 Instantiation (the verb, implemented)

`instantiate(definition_id, target)` — one transaction: create the `event_components` row (`definition_id`, `created_by_process='instantiated'` via the existing mechanism column… no: instances aren't definitions; the stamp is `instantiation_id`), create seed `event_items` from the definition's default selections, deep-copy definition layers into instance layers (`copied_from` → exact revisions), copy definition config into instance config (source revision stamped), and run all registered consequence rules once. **Instantiation is provenance, not a configuration move**: it creates the baseline, and a baseline is not a divergence from itself. The configuration move log begins *after* instantiation; the event is recorded by the provenance stamps — `definition_id`, seed revision refs, `instantiation_id` — which already preserve everything ("a unified domain-event stream, if ever wanted, is a different object than this log"). Every created row carries the shared **`instantiation_id`** — KA §7's atomic-removal group, added to `event_components`, `event_items`, and instance config/layers in this slice's migration.

Instantiation is **the only operation that copies definition knowledge into live work** (SPEC-001 §1.6 invariant 3) — schemes and resets read the *already-copied* seed, never the definition live.

Entry points: drag from the existing Library line onto chapter gaps (the drag grammar's Library → Canvas row, unchanged), and the click path (UI_GRAMMAR: every drag has one). Full-menu instantiation and the landing-decision panel are the Library slice, not this one.

### 1.5 Divergence and reset

Three things, kept apart because conflating them misleads: **current divergence** is a deterministic comparison of current state against the stamped seed — computed, never narrated (set live chef, revert, set again: the diff is one line; the log is three moves; the diff wins). **Causal history** is the recorded moves; the divergence UI may link a diff line to the moves that contributed to it, as annotation only. **Gesture history** is the operator's grouped actions (parent moves with children), the material for audit and for the future undo surface. The current diff is never derived by replaying raw history. Rendering stays business past tense per the interaction model §8. Per-dimension reset emits `reset_dimension` (inverse derived from seed); `reset_all` stages the full diff as its confirmation — explicitly listing ad-hoc additions that will be removed — per UI_GRAMMAR §11.

### 1.6 Deterministic intent (contract specified here; implementation is the immediate follow-up)

Token → move mapping, no model: option-set names, scheme names, scalar patterns ("for 250", "×2"), service styles, and negations ("no ginger") compile to **MoveProposals**, each carrying its `cause` span; unmapped fragments return as **residue, displayed, never guessed**; the submission stages as a compound diff under the atomicity invariant. The producer *contract* is fixed by this spec. The parser and its UI ship in the immediate follow-up release, not this one: the slice already carries instantiation, definition and instance configuration, the move registry, Canvas rerouting, schemes, derivations, consequences, divergence, and resets — and the "one grammar, several speakers" claim is already proven by three independent producers (facet, Canvas, scheme picker). When intent lands, the acceptance criterion stands ready: a sentence applied through intent leaves state **byte-identical** to the same edits made through the facet, and the model/replay tiers after it are adapters with zero architectural change.

### 1.7 What this slice deliberately does not build

Model-assisted intent; evidence replay ("like Goldberg but for 120" — own spec: it touches the provenance graph and deserves deliberate design); the undo surface (moves enable it; the inverse-operation stack is its own slice); promotion (SPEC-004); full-menu instantiation and the landing decision (Library slice); constraint *sources* beyond what exists (venue/kashrut constraint objects arrive with their layers — this slice ships the constraint *rendering* contract: marked-not-hidden, source named); scheme authoring UI (schemes are definition-config content; seeding them is curation tooling, later).

## 2. Data model (summary — SQL detail in §3)

```
component_definitions ─── definition config (revisioned, like layers) ── schemes,
        │                                                                option sets,
        │ instantiate (one transaction, one instantiation_id)            defaults, rules
        ▼
event_components ──┬── event_items (selections; existing, + instantiation_id)
                   ├── instance config (choices; platform-owned; move-written)
                   ├── component_requirements (consequences, Rev D: derived by
                   │     rule + manual, one truth, logical-key identity)
                   ├── component_instance_layers (layer knowledge + annotations)
                   └── configuration_moves (append-only log; the grammar's memory)
```

## 3. SQL migration plan (one file, named by its shipping release; additive-only)

1. `component_definition_config` — `definition_id FK, schema_version, data jsonb, superseded_by (deferrable), archived_at`; partial live-unique on `definition_id`; RLS identical in shape to `component_layers` (global read, tenant write, fork rule).
2. `event_component_config` — one row per instance; `component_id FK cascade, schema_version, data jsonb, seed_config_revision uuid, updated_at`; RLS via the component's tenant, matching `component_instance_layers`.
3. `configuration_moves` — **append-only**: `id, component_id FK, kind, payload jsonb, before jsonb, origin, parent_move_id, cause, actor, created_at`; `before` is nullable and persists the immutable prior-state values `RecordedMove.before` carries, written in the same transaction as the move — populated only where the kind's `invert` will need them, null otherwise; RLS: select/insert via component tenant; **no update policy, no delete policy** — the absence is the design (Time: history is never overwritten), and the verify matrix proves updates/deletes are refused, not just unimplemented.
4. `instantiation_id uuid` added to `event_components` and `event_items` (nullable; stamped by instantiation only).
5. Verify-matrix additions: cross-tenant isolation on all three new tables; move UPDATE and DELETE refused for the owning tenant itself; instance config unreachable across tenants; append-only proven under a constrained role on real Postgres, per the v200 harness pattern.

Nothing existing is altered beyond the two additive columns; the Studio's read paths are untouched.

## 4. TypeScript model & registry integration (interfaces only)

```ts
type MoveOrigin = "facet" | "canvas" | "scheme"
  | "intent.deterministic" | "intent.model" | "intent.replay";

// COMMAND vs EVENT — two jobs, two shapes. A proposal is a request awaiting
// validation; a recorded move is the immutable fact of what applied, carrying
// what explanation and future inversion need. Conflating them makes schema
// evolution, undo, and replay ambiguous later.
interface MoveProposal<K extends string = string> {
  kind: K; instanceId: string; payload: unknown;
  origin: MoveOrigin; parentProposalId?: string; cause?: string;
}
interface RecordedMove<K extends string = string> {
  id: string; kind: K; instanceId: string;
  payload: unknown;                   // the VALIDATED payload actually applied
  origin: MoveOrigin; parentMoveId?: string; cause?: string;
  actor: string; createdAt: string;
  before?: unknown;                   // prior values where inversion needs them;
                                      // persisted as configuration_moves.before (§3.3)
}

// A handler DESCRIBES mutations within its ownership boundary; the central
// transaction applies them. An open apply() callback would let a registration
// write anywhere — around the applier, across layers, into opaque payloads —
// making the registry an escape hatch from the architecture it enforces.
type OwnedMutation =
  | { boundary: "config";      op: ConfigMutation }       // core kinds only
  | { boundary: "items";       op: ItemMutation }         // core kinds; routed
                                                          // through the existing
                                                          // item services
  | { boundary: "layer:self";  op: LayerPayloadMutation }; // layer-scoped kinds:
                                                          // their OWN instance
                                                          // layer, nothing else

interface MoveKindRegistration<P> {
  kind: string;                       // core or namespaced "kitchen.…"
  schema: Validator<P>;               // the only write gate, as ever
  capability: string;                 // declarative, per KA §10
  plan(p: P, view: ConfigView): OwnedMutation[];   // pure: describes, never writes
  invert?(p: P, before: ConfigView): MoveProposal | null; // foundation for undo
  compound?: (p: P, view: ConfigView) => MoveProposal[];  // scheme, resets, intent
  describe(p: P): string;             // business language for diffs & divergence
}
// The applier enforces the boundary: a "kitchen.…" kind returning a config or
// cross-layer mutation is refused at validation, before the transaction opens.

interface ConfigView { /* typed, read-only choices exposed to consequence rules */ }
interface LayerRegistration<T> {      // extends SPEC-001 §5
  consequenceRules?: (config: ConfigView) => DerivedRequirement[];
  moves?: MoveKindRegistration<unknown>[];          // layer-scoped verbs
}
```

`describe()` is not decoration: it is the constrained vocabulary's enforcement point — every diff line, staging panel, and divergence entry renders through it, so no surface can invent language the move didn't declare.

## 5. Capability integration

Move kinds declare capabilities; the applier checks before validating (UI hides per registry `available()`; the applier refuses regardless — a hidden button is not a security boundary). `intent.*` origins additionally gate on an `intent.deterministic` capability so the adapter can be tenant-flagged independently of the grammar it speaks.

## 6. Acceptance tests (real Chromium, extending the existing suite; 15 existing unchanged)

16. Instantiation lands complete: drag definition → instance renders with seeded items, config summary reads correctly, **zero further interaction required** (landed-is-legitimate, asserted).
17. Scheme staging: choosing a scheme shows the diff, commits nothing until confirm; confirm applies; per-value scheme tags flip to *customized* on edit.
18. Derived scalar shows its work; override persists; later input change updates the *suggestion*, never the override.
19. Requires whispers: service-style change ticks the count; suppression strikes through and persists; **an unrelated choice change triggers recomputation and the suppression survives it** (logical-key identity, proven); reload preserves all of it.
20. Divergence chip counts correctly; per-dimension reset restores seed; `reset_all` ceremony lists ad-hoc removals and performs them.
21. *(follow-up release, specified now)* Deterministic intent: a sentence stages the correct move diff with cause spans; residue displayed; confirm applies; **the applied state is byte-identical to the same edits made through the facet** (one grammar, proven).
22. Canvas item edit and facet both produce log entries in the same vocabulary (single write path, proven).
23. Append-only: no UI path mutates a recorded move (asserted at the DB tier by the matrix).
24. Atomicity: a scheme batch with one invalid child (archived option) applies **nothing** — state, consequences, and log all unchanged; the failure names the child.

## 7. Risk analysis

| Risk | Severity | Mitigation |
|---|---|---|
| Rerouting Canvas item writes through move wrappers regresses the Studio | High | Wrappers call the exact existing functions; the 15 Chromium tests are the gate; reroute is one mechanical commit, revertible alone |
| Move vocabulary proves too narrow and pressure mounts to bypass the applier | High — erodes the architecture | `annotate` is the honest escape hatch; layer-scoped registration is the legitimate growth path; bypass is review-blocking per SPEC-001 §1.6 discipline |
| Consequence rules trigger recompute storms on every move | Medium | Rules are pure `(ConfigView) → requirements`; recompute per applied batch, not per keystroke; derived rows replaced wholesale; suppressions and overrides preserved by deterministic logical key |
| Config jsonb schema churn | Medium | Same regime as layers: `schema_version` + registered pure migrations; the v200 pattern, reused |
| Move log growth | Low | Append-only linear per instance; read paths touch divergence summaries, not full scans; archival is a later storage move, never a model change |
| Deterministic intent maps a token wrongly and the operator trusts it | Medium | Staging is mandatory for intent; every line shows its cause span; residue never guessed; the diff **is** the safeguard |

## 8. Decisions of record (review questions answered at approval)

1. **Selections rerouting — full, in this slice.** A knowingly partial log would create two classes of history from day one, under everything divergence, promotion, and undo will depend on. The wrappers call the exact existing item services; the reroute lands as its own isolated, independently revertible commit; the 15 Chromium tests gate it.
2. **Deterministic intent — contract retained here, implementation deferred** to the immediate follow-up against a stabilized grammar (§1.6). If scheduling ever pulls it forward, it ships as the last independently removable piece and never blocks the core release.
3. **Schemes — seeded by an explicit tenant-scoped curation script.** Not hard-coded in product code; stamped as deliberately authored seed knowledge (`created_by_process='authored'`); tenant-scoped; written in the *exact* definition-config format the future authoring UI will produce, so the UI's arrival changes nothing already seeded.
