# SPEC-003 — Operational Lenses
**Status: ACCEPTED (Rev A) · July 2026 · the SPEC-003 number is hereby bound
per the KA §11 numbering registry · release numbers recorded against slices
only after they ship. Every claim below about what exists was verified
against the v210 codebase, not recalled.**

**Advisory of record (accepted with the spec):** the first operational lens
(Kitchen) is the validation of the *pipeline*, not merely of the feature.
It must ship preserving the ownership chain (§3), zero lens diffs for
future registrations, read-only projection (§6), and the projection
contract (§2) — and its slice report addresses those four criteria by
name. On that proof, Warehouse, Staffing, Photography, and Finance become
applications of the pattern rather than tests of it.

**Rev A — adversarial review corrections (three findings sustained).**
(1) Finance narrowed to *design-money* — the version's own items, prices,
confirmations, comps, and totals; payments, invoices, realized margin, and
accounting excluded by name; binds last in the wave; the spec now carries
its own spin-off trigger (§9). (2) The `operations` key survives untouched
until both Warehouse and Staffing are registered and shipping, then serves
one release as a deprecated alias before retirement — an abstraction is not
retired before its replacements exist (§9). (3) LensSection versioning
removed as a category error: an ephemeral derived shape carries no version
field, because versioning implies persistence and invites storage; the
shape evolves by amendment with an atomic code change, and becomes a
versioned public surface only if the tenant-defined-lenses reservation is
ever resolved in favor (§3). Additionally, the five-level pipeline the
review named — Objects → Layers → Layer Contributions → Lens Projection →
Renderer — is written into §3 with per-level ownership, so the boring sixth
lens is enforced architecture rather than an emergent property.

*EventCore · architecture specification (RFC sequence, independent of release
versions)*

**Citations** — implements KNOWLEDGE_ARCHITECTURE §10 ("Lenses", added by
AMENDMENT-001) and UI_GRAMMAR §2a (the Lens contract, cited below by clause);
VISION ("Every layer is equally real"; "Features discover objects; they do
not own them"; "The design is an object graph"; documents are projections);
KA §4 (`layer_badges` honesty), §9 (constrained vocabulary; everything is
explainable), §10 (capabilities; intersection; layered enforcement);
SPEC-001 §1.6 (invariant 1: layer payloads are opaque; invariant 2: the
registration owns everything about its layer), §5 (the reserved
`lens?` socket — verified present at `layers/registry.ts:81`, comment: "the
Production lens plugs in via SPEC-003"); SPEC-002 §1.3 (the lens reads
`component_requirements` filtered by layer, instance layers, and the
configured instance — never the definition), §1.5 (divergence vs. history),
Rev E (baseline provenance labels); ENGINEERING_PRINCIPLES (derived state;
no duplicated truth; grammar grows by declaration; the browser is the source
of truth for interaction claims); AMENDMENT-001 B.5 (the two scoping
decisions this spec must make knowingly).

**Prime directive for this spec:** define what it means to be a Lens in
enough detail that the sixth and seventh lenses require almost no
architectural discussion. The acceptance criterion is structural, not
aspirational: **adding a lens is one registration and one renderer module,
with zero diffs anywhere else** — the Library's zero-diff discipline,
applied one level up (§10).

---

## 0. What exists (verified inventory)

This spec grows a mechanism the codebase already proved; building a parallel
one would be the duplicated-truth sin at architecture scale. The inventory:

1. **The lens registry** — `src/lib/lenses.ts` (v196). Data-driven
   `LENSES: LensDef[]` (key, label, blurb, capability gate, permission gate,
   forward-declared module, `editable` flag); `visibleLenses(config,
   session)` computing the capability × permission intersection;
   `lensAllowed()` treating a URL's lens as *a request, never an
   authorization*; `resolveLens()` — a provenance-beats-inference ladder
   (explicit link → typed search intent → workspace → obligations →
   preference → maker-first surrender); and the doctrine, already written in
   its header: **"EMPTY IS INFORMATION."** Five keys registered today:
   `design · customer · production · operations · photography`.
2. **The renderer contract** — `src/lib/lensRenderer.ts` (v196).
   `LensRenderer<M>`: `project(bookingId, versionId, ctx) → Promise<M>` —
   pure over its reads, no JSX; `Render({model, affordances})` — pure, **no
   queries** ("if a renderer needs a fact the model lacks, the projection is
   wrong"); optional `Empty`; `Affordances` computed by the shell, never the
   renderer. Four strata: projection (lib) · kit (shared primitives) ·
   renderer (the only per-lens stratum) · shell (chrome, selection,
   constant). The **Customer lens is the proven instance**: `presentation.ts`
   is its projection, `ProposalRenderer` its renderer, and the model's
   omissions are its security ("the Customer renderer *cannot* show a cost,
   because PresentationModel has no cost field — not discipline;
   arithmetic").
3. **The one-event boundary, already drawn** — `lenses.ts` header: "A lens
   is a projection of ONE Event Design for one audience. (A Surface — Daily
   Ops, Calendar, the Library — is a screen that is NOT event-scoped and
   does not belong here.)" The amendment's one-event/many-events division
   (B.5) was independently reached by the code a season earlier.
4. **What operational lenses read** (SPEC-002's contract, shipped):
   `component_requirements` rows carrying `layer_key`, `logical_key`,
   `derived`, `suppressed_at` (one requirements truth, Rev D); instance
   layers with `copied_from` stamps; the platform-owned instance
   configuration exposed as **ConfigView**; scalars with derivations;
   annotations per layer (the `annotate` move); frozen baselines with named
   provenance (Rev E). The v210 back-reference reads the same panel.
5. **The layer registry** — `registerLayer()` with the reserved `lens?`
   socket (SPEC-001 §5), one production registration (`kitchen`), and the
   opacity invariant this spec must not breach: **no code outside a layer's
   registration may parse its payload.**
6. **Capabilities** — `featureCapabilities.ts` (`currentCan()`, tier
   bundles as data) — feature licensing, deliberately distinct from
   `capabilities.ts` (business-model shape). `LensDef.cap` currently gates
   on the *business-model* module; §5 reconciles this.
7. **Evidence-side media** — photos and Component Galleries (v192b),
   instance-attached, definition-groupable. The curated half (exemplars,
   shot standards) does not exist and is SPEC-005's.

## 1. The Lens registration

One declaration per lens, in two modules because the registry must stay
React-free (v196's separation, kept: metadata and machinery apart, the
pure side testable without a DOM):

```ts
// PURE side — lenses.ts grows; no React, no queries
interface LensRegistration {
  key: string;                    // stable identifier; never stored as an
                                  // entitlement; URLs carry it as a REQUEST
  label: string;                  // what the UI prints
  blurb: string;                  // one line for tooltips and empty states
  concern: string;                // the declared operational concern —
                                  // "the graph, turned for one kind of work"
                                  // (KA §10); documentation, not a gate
  capability: string | null;      // feature-licensing key (currentCan());
                                  // null = available wherever the Studio is
  perm: Permission;               // user permission (a perm, never a role)
  verbs: string[];                // move kinds this lens may speak; [] = read-only
  anatomy: "editing" | "sheet";   // §7 — which frame hosts it
  module: ModuleKey;              // Phase B forward-declaration (unread today)
}

// RENDERER side — the per-lens module, looked up by key
interface LensRenderer<M> {       // v196 contract, unchanged and now cited
  key: string;
  project(bookingId: string, versionId: string, ctx: ProjectionContext): Promise<M>;
  Render(props: { model: M; affordances: Affordances }): React.ReactNode;
  Empty?(props: { model: M }): React.ReactNode;
}
```

Registration is by declaration (`registerLens(reg)` on the pure side; a row
in the renderer map on the other), duplicate key = build error, same idiom
as `registerLayer`/`registerMoveKind`/`registerPromotionKind`. **Nothing
anywhere switches on a lens key** except the two registries' own lookups.
`M` stays deliberately unconstrained per v196: the Customer model and a
floor-plan model share nothing but the contract's shape — uniform seams,
free interiors.

Migration of the existing rows: `LensDef` grows into `LensRegistration`
additively (`concern`, `verbs`, `anatomy`, `capability` added; `editable`
becomes `verbs.length > 0` computed, retained as a compatibility read for
one release; the business-model `cap` field's disposition is §5). The five
existing rows are the first five registrations — nothing is rebuilt.

## 2. The projection contract

Elevating v196's rules from module comments to specification:

1. **`project()` is the only stratum that reads.** It may batch any
   canonical reads its registration's concern requires; it returns data
   only. It is pure *over its reads*: same rows in, same model out.
2. **`Render()` never queries.** A renderer needing a fact the model lacks
   is a defective projection, fixed at the projection — never worked around.
   This is what makes the model's omissions load-bearing (the Customer
   lens's cost-blindness is arithmetic, not discipline), and it is the
   mechanism by which §2a clause 2 (withhold, never falsify) is *enforced*
   rather than reviewed for.
3. **The model carries its explanations.** Any field a renderer will present
   as a claim ships with its why: a derived quantity carries its formula and
   override status (`"suggested 240 · 180 guests × 8 ÷ 6"`), a requirement
   carries its cause and its suppression state, an evidence mark carries its
   provenance label (Rev E's `BASELINE_LABEL` vocabulary), a back-reference
   carries its act. A renderer cannot invent a why it wasn't given — KA §9's
   "everything is explainable," made structural (§2a clause 3).
4. **Divergence semantics travel intact.** Where a lens presents configured
   values, it presents the *current state*; where it marks divergence, it
   computes against the frozen baseline with `computeDivergence` — never a
   second implementation, never replayed history (SPEC-002 §1.5).
5. **Suppressed is struck, never hidden.** A suppressed requirement renders
   struck-through with its cause — the kitchen deserves to know it was
   considered and declined (Pre-work II §5). Hiding it would make the lens
   contradict the record.

## 3. Layer opacity and the LensContribution

The reserved socket (`layers/registry.ts:81`) is made concrete, and it is
the load-bearing joint of this spec: **an operational lens must render layer
content it is forbidden to parse** (SPEC-001 §1.6 invariant 1). The
resolution is that the layer renders itself, into a lens-neutral shape:

```ts
interface LensSection {
  id: string;                          // stable, for tests and anchors
  title: string;                       // "Kitchen — staffing"
  rows: { label: string; value: string; why?: string }[];
  note?: string | null;                // the layer's annotation, if any —
                                       // rendered as the different material
  missing?: string | null;             // honest absence: what isn't here and
                                       // what act would create it
}

// on LayerRegistration — the socket, filled:
lens?: {
  sections(payload: T, ctx: LensSectionCtx): LensSection[];
}
```

The lens composes; the layer parses. A kitchen lens asking for kitchen
content calls the kitchen registration's `sections()`; it never touches the
JSONB. Consequently a layer's arrival *automatically deepens* every lens
that consumes layer content — registering `warehouse` (Track 0) makes the
Warehouse lens's layer section light up with **zero lens diffs**, which is
the zero-diff discipline propagating exactly as SPEC-001 promised.

**LensSection is an ephemeral contract, not a schema — it carries no
version field.** The shape is derived per render and never stored; there
are no old rows, therefore no migration problem, therefore versioning it
would be storage-world machinery imported into a place it can only do harm
(a version field on a derived shape implies persistence and invites someone
to persist it). The shape is owned by this specification and evolves by
amendment, with an atomic code change to its producers (layer
registrations) and its one consumer (the sheet frame), which deploy
together. A layer whose content outgrows the shape argues for that
amendment — never for a lens reaching into a payload. The shape becomes a
*versioned, published* surface in exactly one future: if the
tenant-defined-lenses reservation (UI_GRAMMAR §2a) is ever resolved in
favor, third-party producers exist and the contract must then be published
and versioned — that cost is recorded here as a dependency of that
reservation, not paid speculatively now.

**The pipeline, named — five levels, each with exactly one owner:**

```
  Objects              the graph            owned by: the object graph; no
                                            feature owns any row (VISION)
     │
  Layers               opaque payloads      owned by: the layer registration
                                            (schema, validation, migration —
                                            SPEC-001 §1.6 inv. 1–2)
     │
  Layer Contributions  sections()           owned by: the SAME registration —
                                            how its content is seen, declared
                                            beside how it is stored
     │
  Lens Projection      project() → M        owned by: the lens registration;
                                            pure over its reads; composes
                                            contributions, never parses them
     │
  Renderer             Render(M) → pixels   owned by: the lens's renderer
                                            module; no queries; the shell
                                            owns chrome and selection
```

The middle level is what makes the sixth lens boring: a lens composes
content it is forbidden to parse, so most of a new operational lens is
already written the day its concern's layers exist. Review enforces the
pipeline by ownership — any code performing a level's work outside that
level's owner is the violation, whatever it is called.

## 4. The standard operational projection

The five operational lenses share one skeleton, stated once so each
registration is small and the sixth is smaller. An operational lens for
concern *K* projects, in order:

1. **Identity** — event title, date, guest count, version, lens name. Only
   fields that canonically exist: the mockup's kashrut line ("fleishig ·
   Rabbi Gruen supervision") **waits for SPEC-006's home** and is not
   simulated (§2a clause 6: never simulated; KA §4 honesty).
2. **Honesty band** — read-only marking when the version is locked or the
   event is evidence ("Historical event — reads as it was"); baseline
   provenance where divergence is shown.
3. **Derived quantities** — the scalars and rollups relevant to *K*, from
   ConfigView, each with its derivation and override status (§2 rule 3).
4. **Requirements[K]** — live rows grouped, suppressed struck with causes,
   manual rows marked manual, every derived row naming its logical key's
   origin choice.
5. **Layer[K] content** — via the owning registration's `sections()` (§3).
   Absent layer ⇒ an explicit `missing` line, not an absent section.
6. **Annotations[K]** — the different material, left-ruled, never
   interleaved with structure (Pre-work II §7).

Photography and Finance deviate by concern, not by contract: Photography's
sections read evidence-side media (galleries, hero flags, v192b) and the
design's components as a derived shot list; Finance's sections read the
pricing system's outputs (items, confirmations, totals) and are
permission-gated to the cost-eligible — its model simply *has no rows* for
an ineligible session, the Customer-lens mechanism reused. Neither stores
anything; both are reads of systems that own their own truth
(NOT-DEFINITION boundaries, Gap Analysis §1).

## 5. Availability, gating, and the empty state

**Availability is the three-term intersection and never depends on
content** — this spec hereby decides the reservation AMENDMENT-001 left it
(B.4 item 4): a lens is available exactly when it is *registered*, the
tenant's *capability* allows it, and the person's *permission* admits them
(§2a clause 6). Content-dependence is rejected because absence must not be
self-conceiving: the Warehouse lens over an event with no warehouse
planning exists precisely to say so. `visibleLenses()` already computes
this; it gains the capability-source correction below and nothing else.
Unavailable = **absent, not disabled** (UI_GRAMMAR §3); a deep link naming
an unavailable lens is refused by `lensAllowed()` — a lens grants no
permission, so the URL is checked, not trusted, and the API re-checks on
every lens read (layered enforcement, KA §10).

**Empty is information — adopted as the rule, not a style.** An available
lens over an event with nothing for its concern renders its `Empty` state:
what is absent, and — when derivable — the blocking reason or the act that
would create content ("quantities open once the menu is confirmed"; "no
warehouse layer is registered — its content arrives with the warehouse
registration"). Redirecting the person to a lens their job doesn't need
would be the app pretending to know better (v196's words, now binding).
Empty is not an error state and never renders as one.

**Capability-source correction (decision of record).** `LensDef.cap`
currently gates on the business-model module (`capabilities.ts`), predating
KA §10's feature-licensing system. `LensRegistration.capability` is a
feature-licensing string checked via `currentCan()`, per KA §10 — the only
legal gate. Assigned: `design → null`, `customer →
"proposal.customer_view"`, and each operational lens declares
`"lens.<key>"` (`lens.production`, `lens.warehouse`, `lens.staffing`,
`lens.photography`, `lens.finance`), bundled into tiers as data. The
business-model `cap` is retained as a second AND-term for one transitional
release, then removed — two gates that "do the same thing" diverge, and one
of them isn't constitutional. Layer capabilities compose independently
*inside* the lens (a tenant licensed for the production lens but not the
warehouse layer sees the lens with that section's capability-absence
rendered per the intersection rule) — neither gate reasons about the other.

**Lens selection** — `resolveLens()`'s ladder (explicit → typed intent →
workspace → obligations → preference → maker-first) is recorded as the
decided mechanism: provenance beats inference; every rung filters through
availability; "most useful" is never computed where a breadcrumb exists.
`LENS_FOR_KIND`'s dormant entries (`invoice → finance`, `vendor →
operations-successor`) activate as their lenses register — a map, not a
scorer, no weights, no invented confidence (KA §9).

## 6. Read/write semantics and verbs

The default is read-only, and read-only is structural: a lens with
`verbs: []` receives `mayEdit: false` from the shell unconditionally, and
its projection modules import no write path (the `promotionSupabase`
read-only-by-construction pattern, reused). An editing lens declares its
verbs from the registered move vocabulary; every action it exposes submits
through the one applier or the domain's own authoritative path — a lens may
expose an authorized verb; it may never implement one (§2a clause 4,
review-blocking). `Affordances.mayEdit` remains shell-computed
(`verbs.length > 0` × session perms × version lock) because a renderer that
decides its own permissions will eventually get it wrong (v196, retained).

**Decision of record: the five operational lenses ship read-only** —
`verbs: []` — including `annotate`. The chef's "86 the ginger" from the
kitchen sheet is a real and wanted act, and it is deliberately a follow-up:
the first slices prove the read contract under the regression bar before
any lens gains a pen, and when annotation arrives it is one verb in one
registration, through the existing `annotate` move — no architecture. The
Design lens keeps its editing grammar unchanged (§2a clause 4's final
sentence; UI_GRAMMAR §6–§11 govern it as ever). X-ray remains a modifier on
every lens, not a lens (One-Stage doctrine, v196, retained).

## 7. Anatomy

Two anatomies, per §2a clause 8:

- **`editing`** — Stage · Inspector · Outline. The authoring workspace,
  unchanged, hosting the lenses that speak verbs (today: Design; Customer
  rides the same shell read-only).
- **`sheet`** — the operational frame: identity header, honesty band, then
  the projection's sections in the F-5 sectioned-panel idiom. Each lens
  organizes its interior for its work; the frame owns chrome, the honesty
  band, and nothing else. Print and export are **second renderers over the
  same model** — a printable kitchen sheet is the same projection on paper
  (documents are projections; there is nothing to keep in sync) — and no
  print path may extend the model with facts the screen lacks.

The shell owns selection and chrome in both anatomies; a renderer never
draws chrome and never knows another lens exists (v196, retained).

## 8. Projection lifecycle and performance

Load → project → render, recompute on committed writes. The expectations,
stated so nobody negotiates them per-lens:

- `project()` batches its reads (the `loadDefinitionEvidence` pattern);
  the renderer is synchronous over the model.
- Memoization is in-memory, keyed by (version, lens), invalidated by any
  successful `submitBatch`/domain write touching the version — a
  **disposable projection** in AMENDMENT-001's terms. Nothing a lens
  computes is ever persisted as fact; render decisions die with the
  interaction (ENGINEERING_PRINCIPLES). Where a *snapshot* is ever wanted
  (a kitchen sheet as it was printed for the event), it is a
  provenance-bearing artifact created by a deliberate act through a
  domain's own path — a future concern, named here only so nobody builds
  it as a cache.
- A projection too slow to derive per render argues for a better read
  batch or a materialized *database* view owned by the platform — never
  for lens-side storage.

## 9. The five canonical operational lenses

Registration sketches — identity, concern, reads, and scope boundaries.
Pixel design belongs to implementation; these paragraphs are what binds.

**Production (kitchen).** `key: production` (retained — deep links and the
preference memory carry it). The promise SPEC-002 §1.3 has cited since Rev
A, kept: reads the **configured instance** — ConfigView quantities with
derivations, `requirements['kitchen']`, the kitchen instance layer via its
registration's `sections()`, kitchen annotations. First to ship because it
is the only lens provable against real registered content rather than
fixtures.

**Warehouse.** `key: warehouse`, new. Reads `requirements['warehouse']`
(which exist today via consequence fan-out), the warehouse instance layer
via its registration — which does not yet exist in production: the lens
ships honestly against requirements with the layer section reporting its
absence, and deepens automatically the week the Track 0 `warehouse`
registration lands (§3). The Partini trigger may pull both forward
together; this spec is indifferent to the order because the seam absorbs
it.

**Staffing.** `key: staffing`, new. Projects the staffing shapes that
canonically exist — kitchen-layer staffing rosters, staffing-relevant
scalars and their derivations, `requirements` tagged to staffing concerns —
and reports honestly that a dedicated `staffing` layer does not yet exist.
When one earns its Track 0 registration (real content, never speculative),
the lens deepens with zero diffs.

**Photography.** `key: photography` (retained; its registry row exists with
blurb "Shot list derived from the design"). Evidence-side only, per the
AMENDMENT-001 B.5 scoping decision made here explicitly: reads galleries,
hero flags, and instance-attached photos (v192b), and derives a shot list
from the design's components. Curated exemplars, shot standards, and
marketing selects are **SPEC-005's homes and are out of scope** — this lens
may not force media architecture through a rendering PR, and its sections
name that absence rather than simulating it.

**Finance.** `key: finance`, new — **scoped strictly to design-money: the
same cards, read as money.** It reads the version's own money fields —
items, unit prices, confirmation states, comps and adjustments, computed
totals — which are exactly the objects Design reads, in one bounded
context, permission-gated by model omission (§4). **Excluded by name:
payments, invoices, deposits, realized margin, labor actuals, and any
accounting boundary.** Those are booking-lifecycle and cross-event
concerns, not design-version projections. Finance binds *last* in the
wave, and this spec carries its own spin-off trigger: **the moment its
implementation wants to read a payment, an invoice, or a realized cost,
that is not scope to absorb — it is the evidence that a Financial
Operations specification exists**, and the lens stops at the design's edge.
Stores nothing; computes per KA §9 (visible arithmetic, no invented
figures).

**The `operations` key (decision of record, Rev A).** The v196 placeholder
("Staffing, equipment, timing, logistics") predates the layer system and
names no single reader; Warehouse and Staffing take its ground. The
schedule respects that an abstraction is not retired before its
replacements exist: **(a)** the row survives untouched — visible,
functioning as today — until *both* Warehouse and Staffing are registered
and shipping; **(b)** it then serves one release as a **deprecated alias**:
absent from the lens bar, with `?lens=operations` resolving to Warehouse
(the ladder's request-never-authorization semantics make this a one-line
data change, and a stale bookmark degrades to the ladder's next rung, never
to an error); `LENS_FOR_KIND.asset` remaps to `warehouse` in the same
release; **(c)** the row is then retired — never reused, never reassigned,
mirroring the numbering registry's discipline.

## 10. The sixth-lens test

The acceptance criterion of the whole spec, enforced twice:

- **By review:** a lens PR that touches any file other than its
  registration row and its renderer module fails review, with the same
  standing the Library's zero-diff discipline carries.
- **By harness:** the browser suite registers a fixture lens
  (`key: "fixture"`, trivial projection) and proves: it appears in the lens
  bar exactly when its capability and permission hold; it is absent — not
  disabled — otherwise; its empty state renders; and **no other lens's
  suite changed**. The fixture registration is the proof that the seam is
  real, the same way `kitchen` was SPEC-001's proof-of-life.

## 11. Explicitly out of scope

Named so nobody helpfully adds them: the **score/timeline surface**
(composition per UI_GRAMMAR §2a's reservation — narrowly defined there;
every lens in §9 is projection under that definition, reading many object
types inside one lens, and none composes registered lens projections);
**cross-event surfaces** (Daily Ops, Today's Kitchen, the Operations
Workspace — a different subject, its own future spec; the lenses here are
its raw material and none of its architecture); **tenant-defined lenses**
(reserved); **proactive retrieval** (§2a clause 10; the Stein card waits
for its own deliberate act); **requirement editing and annotation from
lenses** (§6's decision; follow-up verbs, not architecture); **media
curation** (SPEC-005), **prose homes** (SPEC-005a), **kashrut and item
claims in lens headers** (SPEC-006 — rendered only when their homes exist);
**payments, invoices, deposits, realized margin, labor actuals, and
accounting** (beyond the Finance lens's design-money boundary, §9 — their
specification is triggered, not absorbed); **Phase B** modules, jobs, and
workspaces (forward-declared fields stay unread); **plugin publication**
(the contract is the seam; publishing it is a commitment nobody needs yet —
v196's judgment, retained; §3 names the one future that changes this).

## 12. Verification

Per the standing bar, with the lens-specific rows stated now so each slice
inherits them:

- **Projection unit suites** — pure, no DOM: model completeness (every
  claim-bearing field carries its why), suppressed-included-struck,
  provenance labels, permission-omission (an ineligible session's Finance
  model has no cost rows — asserted on the model, where it is arithmetic).
- **Real-Chromium acceptance per lens** — availability: present exactly
  under capability × permission, absent otherwise (absent, not disabled);
  empty-is-information rendering with its reason; read-only probes (no
  mutation path reachable from a `verbs: []` lens; the memory adapter's log
  does not grow); explainability probes (rendered numbers trace to model
  whys); honesty band on evidence and locked versions; the fixture-lens
  zero-diff proof (§10).
- **Regression variant** — each suite ships with the variant proving it
  still catches its target bug (a projection edited to drop a `why`; a
  renderer edited to query), per ENGINEERING_PRINCIPLES: tests must have
  teeth.
- **Tenancy** — lens loaders read through existing RLS-governed paths and
  add no new surfaces; any new read query joins the verify matrix like
  every other secondary surface (KA §5: a leak through a projection is
  still a leak).

## 13. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Lens projections quietly accumulate write paths ("just this one toggle") | High — erodes §2a clause 4 | `verbs: []` is structural: read-only lens modules import no write path; review-blocking rule stated in both the spec and the registration file headers |
| `LensSection` proves too narrow and layers pressure lenses to parse payloads | Medium — breaches opacity | The shape evolves by amendment with an atomic code change (§3 — no version field, nothing persisted, one repo); the escape hatch is widening the neutral shape, never reaching into JSONB; kitchen's real content is the first stress test |
| Finance's reads drift past the design-money boundary one convenient join at a time | Medium — recreates the multi-context lens review rejected | The boundary is named in §9 and §11; the spin-off trigger converts the first out-of-boundary read into a specification event, not a code review debate; Finance binds last so the boundary is tested by the most mature bar |
| Capability double-gating during the transition confuses enforcement | Medium | One release only, both terms ANDed (fail-closed); removal is a listed step of the slice that lands the last operational lens capability |
| The `operations` alias lingers past its one deprecated release | Low | The retirement is step (c) of a three-step schedule (§9) with its trigger named (both replacements shipping); the alias is a data row, so lingering is visible in the registry, not buried in code |
| Fixture lens leaks into production bundles | Low | Registered only in the harness entrypoint, per the existing harness-boot pattern |
| Per-lens models drift stylistically (the v195 badge lesson, multiplied) | Medium | The kit stratum is mandatory for shared concerns (price, badge, heading); new shared concerns are added to the kit, never solved locally — the v196 rule, now specified |

## 14. Decisions of record and review questions

**Decided in this draft** (each reversible only by review before
acceptance): availability never depends on content (§5); empty is
information (§5); feature-licensing capabilities replace the business-model
gate, one transitional double-gated release (§5); the five operational
lenses ship read-only, verbs deferred (§6); photography is evidence-side
only (§9); the score view is excluded as composition (§11); `LensSection`
is the opacity-preserving joint, unversioned and ephemeral (§3); the
five-level pipeline with per-level ownership is the review-enforcement
model (§3).

**Decided in Rev A** (sustained adversarial findings): Finance is
design-money only, binds last, and carries its spin-off trigger (§9);
`operations` survives until both replacements ship, then one release as a
deprecated alias, then retirement — never reuse (§9); LensSection carries
no version field; publication and versioning are a recorded dependency of
the tenant-defined-lenses reservation, paid only if that reservation
resolves in favor (§3).

**For acceptance review (remaining):**

1. Is `"lens.<key>"` the right capability grammar, or should operational
   lenses reuse their dominant layer's capability (`production.kitchen`) to
   keep the tier tables smaller? (Draft position: separate — a lens and a
   layer are different licensable things, and conflating them makes the
   intersection rule circular.)
2. Does the `sheet` anatomy need a declared section-ordering contract now,
   or is per-lens ordering (with the §4 skeleton as convention) enough
   until a second consumer (print) exists?
3. Should the fixture-lens proof live in every suite run or only in the
   registry's own suite? (Draft position: registry suite only; it proves
   the seam once.)

---

*Constitutional anchors: KNOWLEDGE_ARCHITECTURE §10 (Lenses) · UI_GRAMMAR
§2a clauses 1–10 and both reservations · VISION (projections; features
discover objects) · SPEC-001 §1.6, §5 · SPEC-002 §1.3, §1.5, Rev E ·
SPEC-004 (read-only evidence; act-based writes) · ENGINEERING_PRINCIPLES ·
AMENDMENT-001 A.3 (numbering: this document binds SPEC-003 on acceptance),
B.5 (scoping decisions, both made herein).*
