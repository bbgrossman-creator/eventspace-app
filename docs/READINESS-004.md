# READINESS-004 — Engineering Readiness Review of IMPLEMENTATION-004
**Status: Final pre-implementation dependency review. SPEC-004 Rev B, the
Gap Analysis, and the Roadmap are assumed accepted. Scope: hidden
dependencies, ordering problems, build-twice risks, and cheap extension
points only. No new architecture is proposed except where an implementation
dependency makes it unavoidable — two findings meet that bar.**

---

## Verdict, stated first

**Proceed with v207 — after two schema-shape corrections applied to
IMPLEMENTATION-004 (already amended, see §1–§2) and with three conventions
recorded (§3–§5). No slice is in the wrong order. No API or UI flow in
v207–v210 requires redesign for any roadmap domain.** The corrections cost
nothing at v207 and each eliminates a known, dated future migration; that is
the entire reason this review was worth running.

---

## Findings that materially affect implementation (2)

### F-1 — The act ledger's artifact shape forces two future migrations as drafted

As drafted, `definition_revision_acts` carries `produced_revision uuid`
(implying NOT NULL) plus `produced_layer_revisions jsonb`. Two dated
collisions:

- **v209, layer-only promotion.** A staffing-only promotion produces layer
  revisions and **no config revision**. As drafted, either
  `produced_revision` must go nullable (a migration) or the act must write a
  **no-op config revision** — which is worse than a migration: it churns the
  revision chain, fragments future instantiation stamps, and makes the
  ledger lie about what changed.
- **SPEC-005, media promotion.** "Promote photo → definition exemplar"
  produces a media artifact — neither a config nor a layer revision. The
  jsonb column cannot express it without becoming a schema-less dumping
  ground, and a *second ledger* is constitutionally barred ("two acts, one
  ledger").

**Correction (applied to IMPLEMENTATION-004):** replace the
`produced_revision` column and the `produced_layer_revisions` jsonb with a
normalized junction, **`act_produced_artifacts`** (`act_id`,
`artifact_kind` CHECK in `('config_revision','layer_revision')` — extended
by future specs, never migrated — `revision_id`, `layer_key` nullable,
`superseded_revision` nullable). The RPC enforces **≥ 1 artifact per act**.
Same data, normalized once, at identical v207 cost; v209 inserts rows
instead of altering columns; SPEC-005 adds a kind value instead of a table.
This is implementation shape, not new architecture — the unavoidable-
dependency bar is met by the v209 collision alone.

### F-2 — `p_data` required makes layer-only acts impossible by signature

Downstream of F-1: `author_definition_revision(p_data jsonb, …)` as drafted
*requires* a complete config document, so a v209 layer-only act cannot be
expressed. **Correction (applied):** `p_data` nullable; the RPC requires
`p_data` and/or `p_layers` to be present (≥1 artifact, same rule as F-1);
the staging-race parameter `p_expected_live_revision` is required exactly
when `p_data` is present. v207 callers are unaffected — curation always
sends a document. The signature still never changes across v207–v210, which
was the plan's own goal; it just becomes true.

## Conventions recorded now, costing one sentence each (3)

### F-3 — `dimension_key` grammar is a contract; write it down

Citations key on `kind:identifier` (`choice:presentation`,
`scalar:guests`, `item:Dragon Roll`, `layer:staffing`). Two rules recorded
so future domains extend rather than collide: **(a)** the prefix set is
open — SPEC-005/006 add `media:*`, `catalog:*` etc. without touching v207
schema; **(b)** `item:*` keys by *name-at-citation-time*, which is honest
for an append-only evidence record (citations are historical facts, not
live references) — when SPEC-006 gives items catalog identity, new
citations use `catalog:<id>`; old ones remain true statements about their
moment. No migration in either direction.

### F-4 — Build the ceremony's line list and `composeRevision` as kind registries

The v208 review surface renders lines and composes documents per kind. If
both are `switch` statements, SPEC-005a/006 rewrite them; if both follow the
codebase's own established idiom — `registerMoveKind`, `registerLayer` —
then a future home is a *registration* (`registerPromotionKind({ prefix,
renderLine, compose, checkCoherence })`), not surgery. Zero extra cost at
v208; this is how the code around it is already built.

### F-5 — The Definition view is sectioned from day one

v207's Definition view will be extended by SPEC-005 (media section), 005a
(prose), and 006 (item knowledge). Built as sectioned panels — the
Inspector's existing pattern — future homes add sections; built as a single
form, they force a rework. A structure choice, not scope.

## Accepted, stated, and left alone (2)

- **Pre-ledger revisions.** Revisions created before v207 (the bootstrap
  seed, v205) have no act. Backfilling synthetic acts would fabricate
  provenance — worse than the gap. Rule: the ledger is authoritative **from
  v207 forward**; earlier revisions display as *"pre-ledger (bootstrap)"*.
  A display rule, not debt. The plan's existing decision to retire the seed
  script for new curation stands and is what actually closes the gap.
- **Evidence loader vs SPEC-009.** `loadDefinitionEvidence` will someday
  also carry outcomes. Additive field on an existing return type; nothing to
  pre-build, nothing to migrate.

## Ordering audit (explicit, per the review's charge)

- **v207 before v208** — sound and load-bearing (INV-1 hardened against the
  simplest caller). No v207 dependency is missing: LibraryBrowser entry,
  lifecycle join, capability plumbing all exist as of v206.
- **v208 before v209** — sound: layers/framings/sessions extend a ceremony
  that must first exist. With F-1/F-2 applied, v209 requires **no schema or
  signature change**, which was the last ordering risk.
- **v210 last** — correct for the reason the plan already gives (review
  question 4 answered by usage).
- **Track 0 (layer registrations) concurrent** — no interaction with any
  slice; `warehouse` can land any week Ben has content.

## What was checked and found clean

Citations RLS shape against future kinds; `review_session_key` as
informational text; capability naming (`knowledge.curate` correctly covers
future media/item curation — curating organizational knowledge is one
permission regardless of medium); the §0a item-baseline rule against
SPEC-006 (name-keyed citations stay honest, per F-3); one-definition-per-act
against SPEC-010 (relationships are not promotable acts in any current
spec — no collision); outcomes (SPEC-009) against every v207–v210 table (no
contact); the browser/Postgres verification bar's capacity to absorb four
more suites (mechanical).

---

**Final statement:** with F-1 and F-2 folded into IMPLEMENTATION-004 (done,
see its "Readiness amendments" note) and F-3/F-4/F-5 recorded as
conventions, IMPLEMENTATION-004 leaves behind no known migration debt and
establishes no API, schema, or UI flow that Media, Item Knowledge,
Inventory/Rental Mapping, Relationships, or Outcomes would force us to
redesign. **Proceed with v207.**
