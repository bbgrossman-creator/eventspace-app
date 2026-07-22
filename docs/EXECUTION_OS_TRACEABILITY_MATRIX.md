# EventCore — Execution OS · TRACEABILITY MATRIX (v274)

*For every Execution-OS invariant (I-31…I-41) and every Master-Spec capability
group, this fixes the seven-column quality bar the mission requires:
constitutional statement · authoritative relation/evidence · SQL enforcement
point · application behavior · proof obligation · race obligation (where
concurrency is relevant) · visible user consequence. It is the contract each
v275+ slice is verified against, to the PL-4 standard.*

---

## Part A — Invariant traceability (I-31 … I-41)

### I-31 — Canonical event singularity
- **Constitutional:** exactly one canonical event per released engagement;
  amendments attach additively; no duplicate events.
- **Relation/evidence:** `event` row keyed by the released-engagement identity;
  the release fact in the operational evidence ledger.
- **SQL point:** `UNIQUE` over the released-engagement key on `event`;
  materialization only inside the release ceremony under thread-first lock.
- **App behavior:** release resolves-or-creates the event; amendments resolve the
  existing event; no code path inserts a second event.
- **Proof:** two releases / a release+amendment → the *same* event id; the UNIQUE
  is the backstop.
- **Race:** two backends race release of one engagement → exactly one event, one
  release fact, loser refused; no deadlock.
- **Visible:** every department opens the *same* event; no divergent copies.

### I-32 — Operational Release is default-deny, layered, evidence-grounded
- **Constitutional:** release succeeds only on a satisfied policy predicate over
  immutable facts; never from mutable status.
- **Relation/evidence:** unrescinded `offer_accepted`; clearance facts (I-37);
  sign-off fact; (reserved) Agreement fact.
- **SQL point:** `release_event()` SECURITY DEFINER, `current_tenant_id()`
  authorization, predicate evaluated over the ledger relations under lock; refuse
  `RELEASE_PREDICATE_UNSATISFIED` / `RELEASE_ALREADY_RELEASED`.
- **App behavior:** the release action is offered only when the predicate is
  computable; the ceremony re-checks; the UI never gates on a status string.
- **Proof:** release with an unsatisfied layer refuses; forging a booking/status
  flag does **not** enable release (the load-bearing negative control).
- **Race:** release vs rescission of the underlying acceptance → release refuses
  if the acceptance is rescinded first; if release wins, a later rescission is
  handled by amendment, not silent event deletion.
- **Visible:** "Release event" is enabled with an explained checklist; a blocked
  layer names what is missing.

### I-33 — Obligation provenance permanence
- **Constitutional:** every obligation retains its originating approved decision;
  identity+provenance immutable.
- **Relation/evidence:** `obligation` row with `origin_ref` (release / acceptance
  / selection / authorized manual origin), insert+select-only RLS.
- **SQL point:** `NOT NULL origin_ref`; no update/delete policy (v269 pattern).
- **App behavior:** every generated obligation carries a resolvable origin link;
  the UI can always answer "why does this exist?"
- **Proof:** update/delete on `obligation` reaches zero rows under the app role;
  every obligation resolves an origin.
- **Race:** n/a (write-once).
- **Visible:** each DailyOps item shows its origin ("from: approved carving
  station, 250 guests").

### I-34 — Obligation & event state is a projection
- **Constitutional:** state derived from dependency predicates + append-only
  evidence; never stored mutable truth.
- **Relation/evidence:** obligation dependency edges; execution evidence facts.
- **SQL point:** no mutable `status` column carries truth; state is a view/derived
  function over evidence; any stored projection is written atomically with its
  grounding fact (I-30 pattern).
- **App behavior:** `deriveObligations`-style single derivation extended with the
  operational modules; `computed:false` honesty preserved.
- **Proof:** replaying evidence reconstructs the projected state exactly; no state
  exists that evidence+dependencies do not entail.
- **Race:** concurrent evidence writes → deterministic projection (last-fact-wins
  over an append-only set, never a lost update on a status cell).
- **Visible:** an item flips `blocked → ready` the instant its blocker's evidence
  lands, with no manual status toggle anywhere.

### I-35 — Execution evidence permanence
- **Constitutional:** evidence append-only; completed evidence never mutated/
  deleted; corrections additive with satisfied/invalidated/superseded/cancelled.
- **Relation/evidence:** `execution_evidence` ledger (kind, obligation_ref,
  actor, moment, payload), insert+select-only.
- **SQL point:** no update/delete policy; correction = a new fact citing the prior.
- **App behavior:** a late change writes an invalidation/supersession fact; the
  original completion stays visible in history.
- **Proof:** after a correction, prior evidence byte-identical; the four outcomes
  are distinguishable structurally.
- **Race:** two corrections race → both recorded, projection resolves one
  effective outcome; no evidence lost.
- **Visible:** history shows "packed ✓ (invalidated: guest count raised)", never a
  silently rewritten row.

### I-36 — Deterministic, idempotent generation
- **Constitutional:** generation is a deterministic function; regeneration
  produces no duplicates; late change regenerates additively.
- **Relation/evidence:** natural key `(event, origin_decision, kind, resource
  role)` on `obligation`.
- **SQL point:** `UNIQUE` natural key; generation upserts-by-identity, never blind
  insert; obsolete obligations invalidated (I-35), not deleted.
- **App behavior:** the generator is a pure function of the approved decision +
  rules; re-run on the same decision is a no-op.
- **Proof:** run generation twice → identical obligation set, zero duplicates;
  change guest count → additive delta, completed evidence untouched.
- **Race:** two generation runs race → one obligation per natural key (UNIQUE
  backstop), no deadlock.
- **Visible:** re-opening an event never multiplies its task list; a guest-count
  change adds/*invalidates* precisely, explaining each delta.

### I-37 — Financial clearance is evidence, not a flag
- **Constitutional:** clearance is immutable evidence; the result is derived.
- **Relation/evidence:** clearance facts (deposit/credit/waiver) in the evidence
  ledger.
- **SQL point:** clearance facts insert+select-only; the release predicate reads
  them, never a `paid` boolean.
- **App behavior:** recording a deposit writes a clearance fact; release
  recomputes.
- **Proof:** release refuses without a clearance fact; a waiver fact (authorized)
  satisfies the layer; flipping a legacy `paid` flag does nothing.
- **Race:** deposit vs release → release sees the committed clearance fact or
  refuses; never a partial read.
- **Visible:** the release checklist shows "deposit received ✓ (waiver by …)".

### I-38 — DailyOps derives; completion invokes a ceremony
- **Constitutional:** DailyOps state is a projection; completing an action invokes
  the domain ceremony; never a second truth.
- **Relation/evidence:** obligations + evidence + dependencies + deadlines.
- **SQL point:** DailyOps reads only; every "complete" button calls a domain write
  path (assign/scan/inspect/complete/acknowledge) that writes evidence.
- **App behavior:** three scopes (company/event/personal); recalculation on
  evidence write; no DailyOps-local status store.
- **Proof:** a DailyOps completion produces exactly one domain evidence fact and
  no DailyOps-owned status row; the projection matches replay.
- **Race:** two users complete the same item → one evidence fact effective, the
  other sees the resolved projection; no double-write.
- **Visible:** checking off "confirm chef" records a staffing assignment and the
  blocker disappears everywhere at once.

### I-39 — Single event truth
- **Constitutional:** one authoritative event; every object points back; no copy.
- **Relation/evidence:** `event_ref` FK on every operational object.
- **SQL point:** `NOT NULL event_ref` FKs; no parallel event table.
- **App behavior:** reports are views of the live event; no export becomes a
  source.
- **Proof:** every operational object resolves to exactly one event; no second
  event-of-record exists.
- **Race:** n/a.
- **Visible:** a change on the event propagates to every department view; nothing
  is stale.

### I-40 — Operational tenant isolation & provenance traceability
- **Constitutional:** tenant-scoped, no owner bypass; every value traceable.
- **Relation/evidence:** `tenant_id` + RLS on every execution table; provenance
  fields on evidence.
- **SQL point:** RLS `tenant_id = current_tenant_id()` select+insert; cross-tenant
  resolves to not-found (no leak).
- **App behavior:** role-filtered lens presentation (SPEC 57/61).
- **Proof:** cross-tenant read/ceremony → not-found; rows invisible under the
  constrained role; each value cites source/author/time/decision/authority.
- **Race:** n/a.
- **Visible:** users see only their tenant's, and only their role's, operational
  surface.

### I-41 — Work-item class distinctness
- **Constitutional:** obligation | manual task | approval | decision request |
  exception | communication follow-up | project milestone remain distinct by
  authority/provenance/lifecycle/completion.
- **Relation/evidence:** a `work_item_class` discriminator + class-specific
  provenance/completion contracts.
- **SQL point:** class is structural (own tables or a constrained discriminator);
  a manual task has no `origin_ref`, an obligation must.
- **App behavior:** DailyOps surfaces all classes together but labels authority
  and origin; only operational obligations carry generation provenance.
- **Proof:** a manual task cannot acquire generation provenance; an obligation
  cannot be created without one; classes never collapse.
- **Race:** n/a.
- **Visible:** "system-generated" vs "created by you" is always distinguishable.

---

## Part B — Master-Spec capability coverage (which invariant carries each group)

| Spec group | Carrying invariant(s) | First delivering slice |
|------------|----------------------|------------------------|
| SPEC 01 canonical event | I-31, I-39 | v275 |
| SPEC 02 lifecycle/stage | I-34 (stage=projection) | v276 |
| SPEC 03 versioning/freeze | I-35, I-36 (freeze=evidence gate) | v277 |
| SPEC 04–08 sales / CRM / proposal / choices | carried by frozen PL-1…PL-4 (I-20/I-26/I-30) + existing Studio; execution reads, never rewrites | existing (extended reads only) |
| SPEC 10–13 menu / recipe / dietary / kashrus | I-33, I-35, I-36 (recipe = versioned evidence; dietary = derived constraint) | v286 |
| SPEC 14–15 costing / pricing (operational) | I-35, I-40 (cost = evidence-derived); PL-3 design-money boundary preserved | v287 |
| SPEC 16–18 demand / purchasing / food inventory | I-34, I-35, I-36 (demand aggregated from released events; inventory = evidence) | v286 |
| SPEC 19 & 21 production planning / food safety | I-34, I-35 | v280 |
| SPEC 64 obligation generator | I-33, I-36 | v275 |
| SPEC 65 readiness | I-34 | v275 (kernel), v278 (full) |
| SPEC 66 next action | I-34, I-38 | v278 |
| SPEC 20 production execution | I-34, I-35 | v280+ |
| SPEC 22–29 equipment/warehouse | I-33..I-36, I-40 | v281+ |
| SPEC 30–34 staffing | I-33..I-36 | v279+ |
| SPEC 35–38 timeline/dependency/risk | I-34, I-36 | v278 |
| SPEC 39–42 transportation | I-34, I-35 | v283+ |
| SPEC 43–47 venue execution | I-35, I-38 | v284+ |
| SPEC 48–52 breakdown/return/clean | I-35 (returned≠available) | v285+ |
| SPEC 53–56 close/analytics | I-35, I-40 | v286+ |
| SPEC 57 role workspaces | I-38, I-40 | v275 (event scope), v282 (all) |
| SPEC 58 mobile/scanning | I-35, I-38 | v281+ |
| SPEC 60 notifications | I-38 | v278 |
| SPEC 61 permissions | I-40 | v275 (reuse), extended per slice |
| SPEC 59 search / command | I-40 (tenant-scoped), I-38 | v282+ |
| SPEC 62 audit/provenance | I-33, I-35, I-40 | v275 |
| SPEC 63 integration layer | I-35 (inbound → evidence, never silent commitment write) | v289+ |
| SPEC 66 recommended next action | I-34, I-38 | v278 |
| SPEC 67 scenario planning | I-34, I-36 (projection over hypothetical evidence) | v289+ |
| SPEC 68–71 nonfunctional (reliability/perf/usability/security) | I-40 + the standing-bar discipline (Plan Part E); security = I-40 | every slice |
| SPEC 09 contract/payment; PL-5 Agreement | I-32 (reserved), I-37 | Agreement slice |
| DailyOps orchestration | I-38, I-41 | v275 (event), v282 (company/personal) |

Every Master-Spec capability maps to a carrying invariant and a delivering slice;
none requires reopening I-15…I-30.
