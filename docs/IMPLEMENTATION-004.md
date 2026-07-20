# IMPLEMENTATION-004 — Promotion & Executive Curation
**Status: Implementation plan for SPEC-004 Rev B (accepted). This document is
not constitutional; it is a work order. Release numbers are assigned here
because the slices are being scheduled, and will be confirmed in SPEC-004's
status line only after each ships.**

---

## 0. Ground already covered (what this builds on)

- `component_definition_config` — revisioned (live-unique partial index,
  `superseded_by`, `archived_at`, `created_by`), complete-document `data`
  (dimensions / instanceDefaults / schemes / defaultItems). **Unchanged by
  this work** except through supersession — promotion adds writers, never
  columns.
- `component_layers` — revisioned definition layers (same supersession
  machinery).
- `event_component_config` — frozen `baseline` + `baseline_provenance` +
  `baseline_at` (Rev E). Instances are read as evidence; nothing here is
  ever written by SPEC-004 code paths.
- `computeDivergence()` — returns `DivergenceLine { dimension, text }` with
  semantic keys (`choice:presentation`, `scalar:pieces_per_person`). The
  ceremony **extends** this shape (adds structured `from`/`to`), never
  duplicates the logic.
- `apply_move_batch` one-applier precedent — INV-1's sibling.
- Capability system in `featureCapabilities.ts` (`currentCan()`).

## 0a. One design gap the plan must close: item evidence has no frozen baseline

Rev E froze the **config** baseline. Items were deliberately left out — a
component's items are live operational rows. So the ceremony's item lines
("Dragon Roll added", "Ginger removed") need an honest comparison rule:

- **Stamped instances** (`instantiation_stamp`): compare current
  `component_items` (by name) against the stamped revision's
  `defaultItems`. The stamp is immutable, so the comparison point is honest.
- **Initialized / reconstructed / unknown baselines**: there is no honest
  item baseline. Item lines render as *"current selection (no item
  baseline)"* — promotable as *adopting the current state*, cited with
  baseline-kind so the provenance chain never overstates what was compared.

No schema change; a display and citation rule. Recorded here so it is
implemented deliberately, not improvised mid-slice.

---

## 1. New database objects (all slices, summarized once)

**`definition_revision_acts`** — the ledger of deliberate acts (INV-1's
"one ledger"). Append-only: RLS grants SELECT + INSERT only; no UPDATE or
DELETE policies exist.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid | RLS anchor, denormalized for cheap policies |
| definition_id | uuid → component_definitions | the one subject (§6a) |
| origin | text CHECK in ('promotion','executive_curation') | the discriminator |
| *(artifacts)* | — | **Readiness amendment F-1:** produced artifacts live in the junction below, not in columns here |
| note | text | required non-empty (both origins — policy states itself) |
| review_session_key | text, nullable | §6a grouping annotation — v209 |
| actor | uuid | auth.uid() |
| created_at | timestamptz | |

**`act_produced_artifacts`** *(Readiness amendment F-1)* — one row per
artifact an act produced. Append-only, same policy shape. The RPC enforces
≥ 1 row per act.

| column | type | notes |
|---|---|---|
| act_id | uuid → definition_revision_acts | |
| artifact_kind | text CHECK in ('config_revision','layer_revision') | future specs extend the set — never a migration |
| revision_id | uuid | the produced revision |
| layer_key | text, nullable | set for layer_revision |
| superseded_revision | uuid, nullable | null for a first revision |

**`promotion_citations`** — per-line evidence. Append-only, same policy
shape. Rows exist iff `origin='promotion'` (enforced in the RPC).
`dimension_key` follows the recorded grammar `kind:identifier` with an open
prefix set (Readiness F-3); `item:*` keys by name-at-citation-time, which is
honest for an append-only historical record.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| act_id | uuid → definition_revision_acts | |
| component_id | uuid → event_components | the source instance |
| dimension_key | text | the semantic key: `choice:presentation`, `scalar:guests`, `item:Dragon Roll`, `layer:staffing` |
| from_value | jsonb, nullable | what the baseline said (null when no honest baseline) |
| to_value | jsonb | what the instance says |
| baseline_kind | text | the instance's `baseline_provenance` at citation time |
| baseline_revision | uuid, nullable | the stamp, when there is one |
| created_at | timestamptz | |

**`author_definition_revision(...)` RPC** — INV-1 made literal. SECURITY
INVOKER, one transaction:

```
author_definition_revision(
  p_definition uuid,
  p_expected_live_revision uuid,   -- null only when the definition has no revision yet
  p_data jsonb,                    -- the COMPLETE new document; nullable from
                                   -- v209 semantics (Readiness F-2): a layer-only
                                   -- act sends null; the RPC requires p_data
                                   -- and/or p_layers (≥1 artifact, F-1)
  p_schema_version int,
  p_origin text,                   -- 'promotion' | 'executive_curation'
  p_note text,                     -- required non-empty
  p_citations jsonb default null,  -- REQUIRED ≥1 for promotion; must be null/empty for curation
  p_layers jsonb default null,     -- v209: [{layer_key, expected_live, schema_version, data}]
  p_session_key text default null
) returns jsonb                    -- { act_id, revision_id }
```

Behavior, in order, one transaction: (1) origin/citation cross-validation —
`promotion` with no citations → `CITATIONS_REQUIRED`; `executive_curation`
with citations → `CITATIONS_FORBIDDEN` (operating principle 10's enforcement
point); empty note → `NOTE_REQUIRED`. (2) staging-race check — required exactly when `p_data` is present: the
current live revision must equal `p_expected_live_revision`, else
`REVISION_SUPERSEDED` (the §6 refusal); layer races are checked per-layer
against each `expected_live` (v209). (3) insert the new revision;
(4) stamp `superseded_by` on the old; (5) insert the act; (6) insert
citations; (7) v209: per-layer expected-live checks and layer revision
writes. Any failure anywhere → nothing persisted.

**No other schema changes.** No columns on instances, no columns on
revisions, no triggers. Promotion's stillness (SPEC-004 §5 step 7) is
partially guaranteed by what this plan refuses to build.

---

## 2. The slices

### v207 — The one writing path + Executive Curation ceremony

*Why curation ships first:* INV-1 demands one path; the path should be
built and hardened against its **simplest** caller. Executive curation is
that caller — no evidence reader, no citations, no composition. It is also
immediately useful: Ben currently curates by SQL seed script; v207 replaces
that with the product. Promotion (v208) then lands on a proven writer.

**DB:** `definition_revision_acts` + RLS; `author_definition_revision`
(full signature above; `p_layers` accepted but refused non-null until v209
— `LAYERS_NOT_YET_SUPPORTED` — so the signature never changes);
`promotion_citations` table ships now too (the RPC validates against it),
though no UI writes it yet.

**Server proof (`v207_proof.sql`):**
- A-1 curation supersedes the live revision atomically; act row carries
  origin, actor, note; old revision's `superseded_by` points at the new.
- A-2 staging race: authoring against a superseded revision →
  `REVISION_SUPERSEDED`, nothing persisted.
- A-3 discriminator validation: promotion + zero citations refused;
  curation + citations refused; empty note refused.
- A-4 cross-tenant authoring refused (RLS).
- A-5 acts are append-only: UPDATE and DELETE refused for authenticated role.
- A-6 first-revision path (`p_expected_live_revision` null succeeds only
  when no live revision exists; null + existing live → refused).
- A-7 stillness: authoring v19 changes no `event_component_config` row, no
  baseline, no move — the V6-1 pattern re-proven at this tier.

**TS:** `src/lib/curation.ts` — `authorRevision()` (thin RPC wrapper),
`loadLiveRevision(definitionId)`, revision-document types shared with the
facet's seed types. Capability: `knowledge.curate` added to
`featureCapabilities.ts`; every ceremony surface gates on it (distinct from
`proposal.configure`, per SPEC-004 review question 6).

**UI:** the **Definition view** — opened from a LibraryBrowser component
result ("View definition"). Read surface: the live document rendered in the
facet's visual language (dimensions, defaults, schemes, default items) plus
the revision history (act ledger: date, origin, actor, note). Edit surface
(gated on `knowledge.curate`): structured editing of the four existing
homes only — principle 9 means this editor has **no "add field"
affordance** by construction. Flow: edit → **stage** (side-by-side vs live,
differences highlighted) → note (required) → confirm →
`authorRevision(origin='executive_curation')`.

**Browser tests (`accept-curation.mjs`, real Chromium):**
- C-1 staged-never-silent: edits render in staging; nothing persists until
  confirm; cancel discards.
- C-2 confirm produces exactly one act (memory-adapter twin asserts origin,
  note, complete document — not a diff).
- C-3 empty note blocks confirm with the reason named.
- C-4 race refusal surfaces in-ceremony and re-opens against the new live.
- C-5 without `knowledge.curate` the edit affordances are absent; the read
  surface remains.

**Ships when:** all of the above green + full regression bar (35 browser,
6 Postgres harnesses, 31 unit) + es5 check. Deploy: one SQL file
(`v207_curation.sql`), app, no seed. *After this slice, the seed script is
retired for new curation (kept for bootstrap docs).*

---

*(Readiness F-4/F-5, binding on the slices below: the ceremony's line
rendering and `composeRevision` are built as kind registries in the
codebase's existing `registerMoveKind`/`registerLayer` idiom, so future
homes register rather than rewrite; the Definition view is sectioned panels
from day one so SPEC-005/005a/006 add sections, not rework. Pre-v207
revisions display as "pre-ledger (bootstrap)" — the ledger is authoritative
from v207 forward.)*

### v208 — The Promotion ceremony (single-definition, multi-event evidence)

**TS (evidence read side):**
- Extend `DivergenceLine` with optional structured fields
  `{ from?: unknown; to?: unknown }` — additive; the chip is untouched.
- `loadDefinitionEvidence(definitionId)`: every instance of the definition
  (live and evidence lifecycles), each with frozen baseline, provenance,
  booking title/date/status, config, items, annotations. Read-only by
  construction — the module imports no write path. Divergence computed
  client-side with the **same** `computeDivergence` (no duplicated truth);
  item lines per §0a's rule.
- `aggregateEvidence(lines[])`: frequency by `dimension_key` ("acrylic — 7
  of 9 since March") — pure, unit-tested.
- `composeRevision(live, selectedLines)`: the §3 translation table as code —
  `choice:*` → `instanceDefaults.choices`; `scalar:*` →
  `instanceDefaults.scalars` (value + derivation carried intact);
  `item:*` add/remove → `defaultItems`. Pure, heavily unit-tested (this is
  where promotion bugs would live). Schemes/dimension-options as *targets*
  → v209.
- `checkCoherence(document)`: scheme references a missing item; default
  choice outside its dimension's options; derivation referencing an absent
  scalar. Returns named findings, never repairs.

**UI:** the Promotion review — two entries: a component's divergence panel
gains "Promote…"; the Definition view gains "Review divergence across
events". One surface: evidence list (per-line: business text, frozen
baseline + provenance label, event, date, frequency; annotations as context
cards; evidence-lifecycle events marked read-only), **nothing pre-checked**,
where-it-lands label per line, coherence findings, staged complete-document
side-by-side, note, confirm → `authorRevision(origin='promotion',
citations=selected)`.

**Server proof (`v208_proof.sql`):**
- B-1 a promotion act persists with citation rows (dimension_key,
  from/to, baseline_kind, baseline_revision) and the produced revision
  contains exactly the composed document.
- B-2 **the Goldberg stillness test**: promote three of four lines from a
  *completed* event → that event's config row, baseline, divergence inputs,
  items, and moves are byte-identical before and after. (V6-1's promotion-
  era twin; this is the acceptance test of the whole spec.)
- B-3 citations referencing another tenant's component refused.

**Browser tests (extend `accept-configure` family, new
`accept-promotion.mjs`):**
- P-1 lines render vs frozen baselines with provenance labels; evidence
  events readable, visibly non-writable.
- P-2 opt-in only; confirm disabled at zero selections.
- P-3 unchecked lines are absent from the staged document; checked lines
  land where their label said.
- P-4 coherence finding blocks staging with the finding named (fixture:
  select "remove Ginger" while a scheme references Ginger).
- P-5 confirm persists act + per-line citations (memory-adapter twin).
- P-6 after promotion, the source component's facet is unchanged: same
  chip count, same baseline line. Stillness, at the pixel tier.
- P-7 item lines on a non-stamped instance render the §0a "no item
  baseline" form and cite `baseline_kind` accordingly.

**Ships when:** green bar as v207, plus `composeRevision` /
`aggregateEvidence` / `checkCoherence` unit suites. Deploy: no SQL (v207's
objects suffice), app only.

---

### v209 — Layers, schemes-as-target, sessions, aggregation depth

Four additions, one slice, each small once v208 exists:

1. **Layer promotion.** `p_layers` activates: per-layer expected-live check,
   layer revision writes inside the same act, `produced_layer_revisions`
   recorded. Ceremony gains layer lines (staffing content diff vs the
   instance layer's `copied_from`). Proof: L-1 layer revision + config
   revision land in one act atomically; L-2 layer staging race refused
   independently; L-3 stillness for instance layers.
2. **"Promote as scheme" framing.** The ceremony's first question when >1
   presentation-ish line is selected (SPEC-004 review question 2): land as
   defaults, or compose into a new/updated scheme. `composeRevision` gains
   the scheme target. Browser: S-1 the same selection produces different
   documents under each framing, both staged honestly.
3. **Review sessions.** `review_session_key` threading: the definition view
   review can hold a session open across several definitions' ceremonies
   (each its own staged confirm — §6a is untouched); acts share the key.
   Proof: one query reconstructs "Season review, Feb 2027 → 4 revisions".
4. **Dimension-option formalization.** An ad-hoc substitution line offers
   "formalize as option" (lands in `dimensions.*.options`). Coherence check
   extends.

---

### v210 — The back-reference (closing the loop, deliberately last)

The instance-side context line: *"3 of these changes were promoted into
v19."* Implemented as a read: match the open component's divergence
`dimension_key`s against `promotion_citations` for its definition, newer
than its baseline. Purely informational — renders in the divergence panel,
changes no computation, no write path exists. Kept last because SPEC-004
review question 4 asked whether it earns its complexity; shipping it after
the ceremony has real usage answers that with evidence instead of debate.
Browser: R-1 the line appears only for promoted keys, links to the act's
note, and its absence changes nothing.

---

## 3. Order-of-work rationale, restated in one paragraph

The writer ships first against its simplest caller (v207), because INV-1's
guarantee is only real if promotion arrives to find the path already
load-bearing. The evidence reader and composer ship second (v208) as the
bulk of the risk — all of it in pure, unit-testable TS. Everything that
*extends* the ceremony (layers, framings, sessions) waits until a real
ceremony exists to extend (v209), and the one feature whose worth was
questioned in review ships last, judged against usage (v210). Every slice
leaves the product strictly more useful than the last, and every slice's
stillness test re-proves the constitutional core: **nothing about the past
ever moves.**

## 4. Standing verification bar (every slice)

Unit suites (existing 31 + new per slice) · all Postgres harnesses
(v200→v206 + new) rebuilt from the fixture on real Postgres · full Chromium
bar (35 + new) with the regression variant confirming teeth · es5 downlevel
check on touched files · zip + individually presented runnable SQL, per
standing rule.
