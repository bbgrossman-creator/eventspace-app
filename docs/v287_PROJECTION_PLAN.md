# EventCore v287 — Projection Infrastructure
## Implementation Plan · the read model beneath every operational surface

**Standing.** Implementation plan only — no SQL written, no code written, per
the directive. Constitutional stack frozen (v285 Rev B; R-1…R-13). Product
Architecture 1.0 and Application Shell 1.0 frozen and treated as the surface
contract this layer must satisfy. Repository-reviewed before proposing:
every claim in §1 was verified in the live database and the shipped tree.

**The thesis.** EventCore does not need a projection layer invented. It needs
**one projection layer generalized from the one that already works** —
`event_workspace` (v277) consumed by `EventWorkspace.tsx` — and the four other
projection families brought under that same contract. The failure mode this
slice prevents is not "no projections"; it is *many projections with different
shapes, two different state vocabularies, and each future screen free to
reinterpret what a responsibility means.*

---

## 1 · Repository review — what already exists

Verified in the live `ec` database and `src/`:

**Projection functions already shipped (all `STABLE`, all read-only):**

| Function | Slice | Returns | Vocabulary |
|---|---|---|---|
| `event_workspace(event)` | v277 | jsonb envelope (header, readiness, workboard, blockers, next_actions, activity) | v275 |
| `event_readiness(event)` | v275 | roll-up by department with named blockers | v275 |
| `event_stage_detail(event)` | v276 | stage + next_action | v276 |
| `obligation_state(obligation)` | v275 | text | **v275** |
| `responsibility_state(resp, now)` | v286 | text | **v286 constitutional** |
| `responsibility_current_owner(resp)` | v286 | text | — |
| `department_workspace(dept, now)` | v286 | table | v286 |
| `day_sheet(day, now)` | v286 | table | v286 |
| `available_actions(target_type, id)` · `action_evaluate` | v279 | action envelopes | — |
| `requirement_coverage(requirement)` | v278 | staffing coverage | — |
| `venue_knowledge_findings(venue, at, conditions)` | v282 | findings | — |

**Client seam already exists and is clean.** Zero components call `.rpc()`
directly; 16 `src/lib` modules do. The house pattern is a pure/data split
(`blueprintCompose.ts` ÷ `blueprintComposeSupabase.ts`). `src/lib/execution/
spine.ts` is the typed fetch seam; `src/components/execution/EventWorkspace.tsx`
is the reference consumer, and its own header already states the v287 doctrine:
*"ALL rendered from one authoritative SQL projection… Nothing is computed here…
Every action refreshes the projection and never optimistically contradicts the
database."*

**Three real problems this slice must fix:**

1. **Two state vocabularies are in flight.** The shipped client speaks
   `blocked · ready · active · complete · exception · invalidated` (v275).
   The constitution mandates `derived · standing · active · discharged ·
   lapsed · superseded · void` (v285 §4, implemented in v286). `active` means
   different things in each. Every future surface built before this is
   reconciled will inherit the wrong words.
2. **Projection shapes disagree.** Some return `jsonb` envelopes
   (`event_workspace`), some return `TABLE` (`department_workspace`,
   `day_sheet`), parameter conventions differ, and only v286's take a clock
   parameter. A shared client cannot type over this.
3. **No cross-event projection primitive exists.** Every shipped projection is
   scoped to one event, one department, or one day. Operations Today, My Work,
   Ownerless, At-Risk, and Search are all *cross-cutting* reads that nothing
   currently serves.

**Conclusion: generalize, do not replace.** `event_workspace` keeps working
and keeps its consumer. v287 introduces the contract it should have had, brings
the v286 functions under it, and adds only the primitives genuinely missing.

---

## 2 · Projection architecture

### 2.1 · The one rule

> **A projection is a `STABLE`, tenant-scoped, clock-parameterized, read-only
> function returning a versioned envelope, and it is the only way any surface
> learns what work exists or what state it is in.**

Corollaries, each traceable to law: `STABLE` makes writing impossible at the
engine level (R-9, RSP-8); tenant-scoped keeps RLS honest; the clock is a
*parameter* because time is a derivation input and never truth (v285 §2); the
envelope is versioned so surfaces can evolve without silent shape drift; and
"the only way" is the operative clause — it is what stops each screen inventing
its own reading (R-13 in practice).

### 2.2 · Three layers

```
  L3  COMPOSED PROJECTIONS   what a surface asks for, in one round trip
      projection_operations_today · projection_event_command
      projection_department_queue · projection_day_sheet · projection_search
                     ▲ composed from, never duplicating ▲
  L2  PROJECTION PRIMITIVES  the cross-cutting reads, one question each
      responsibility_feed(filter…)  ← the spine of the whole layer
      responsibility_detail(id) · ownership_history(id) · risk_findings(scope)
                     ▲ built on, never bypassing ▲
  L1  STATE RESOLVERS        already shipped in v286; unchanged
      responsibility_state() · responsibility_current_owner()
```

**L1 is finished.** v286 shipped it and proved it. v287 adds nothing here.

**L2 is the slice's real work, and it is mostly one function.**
`responsibility_feed` is a single filtered, ordered, decorated read over the
Responsibility Record — the *only* place a responsibility row is turned into a
projected row. Filters (any combination, all optional): tenant-implicit,
`event`, `department`, `owner`, `state[]`, `unowned`, `window` (from/to),
`at_risk`, `scope`, `text`. Every L3 projection is this function with different
filters. That is what makes "one engine, many projections" mechanically true
rather than aspirational: **there is one place that decides what a
responsibility looks like, and every surface goes through it.**

**L3 is thin by construction.** A composed projection = 1..n feed calls +
counts + surface-specific context, assembled into one envelope so a screen
makes one round trip. L3 functions contain no state logic — if an L3 function
ever needs to decide what state something is in, the layering has been
violated.

### 2.3 · The envelope

Every projection returns the same outer shape:

```
{
  projection: "operations_today",     -- name, for logging and cache keys
  version: 1,                          -- shape version; surfaces pin it
  as_of: "2026-07-24T06:40:00Z",       -- the clock used (echoed, never stored)
  scope: { ... },                      -- the filters that produced this
  data: { ... },                       -- the projection's own payload
  counts: { ... },                     -- cheap headline numbers
  provenance: { truth_version: … }     -- what truth this reflects (see §2.4)
}
```

`as_of` echoed rather than assumed is what makes projections testable and
reproducible: two calls with the same `as_of` over the same truth must return
identical bytes. That property becomes proof PRJ-1.

### 2.4 · Composability and the freshness question

**Composability rule:** L3 may call L2 and L1. L2 may call L1. Nothing may call
sideways or upward. No projection may call a `VOLATILE` function — enforced
mechanically, since a `STABLE` function calling `VOLATILE` is a Postgres error,
which means the layering is guarded by the engine rather than by review.

**Freshness:** projections read live truth. **No materialized views, no cached
status, no refresh jobs in v287.** This is a deliberate constraint, not an
oversight: a materialized responsibility state is a stored lifecycle state
wearing a disguise, and R-3 forbids it. If performance ever demands
materialization, the only lawful form is a *cache keyed by a truth version*
that is provably reconstructible and always labeled — deferred to a later slice
with its own proofs. The `provenance.truth_version` field is included now so
that door stays open without any cache existing yet.

### 2.5 · What v287 does NOT build

No UI. No Operations Today screen. No Daily Ops. No task table, no stored UI
state, no cached status, no lifecycle mutation, no writes of any kind. The
slice ends when every surface *could* be built thinly — not when one is.

---

## 3 · The vocabulary reconciliation (the slice's hardest decision)

Two vocabularies cannot both be right in one read model.

**Ruling proposed:** the projection layer speaks **only the constitutional
vocabulary** (`derived · standing · active · discharged · lapsed · superseded ·
void`). `responsibility_state()` is the sole authority.

**`obligation_state()` (v275) is not deleted and not changed.** It stays,
serving v275-era consumers and its own proofs, exactly as `obligation` kept its
physical name. But no v287 projection calls it, and no new surface may.

**Migration of the existing consumer** (`spine.ts` + `EventWorkspace.tsx`,
which speak v275 words) is **explicitly deferred to its own slice**, and this
is the one place I would push back on doing more now: reconciling a working,
certified surface mid-foundation risks the 228/0 browser floor for no
functional gain. v287 delivers the layer and a documented mapping; v288+ moves
the consumer. Recording the mapping now is what prevents it being invented
later:

| v275 (`obligation_state`) | v286 constitutional | Note |
|---|---|---|
| `ready` | `derived` (unowned) or `active` (owned, unblocked) | ownership now discriminates |
| `blocked` | `standing` | waiting on dependency or window |
| `active` | `active` | same word, narrower meaning |
| `complete` | `discharged` | |
| `exception` | *(not a state)* | an exception is evidence; state stays as derived |
| `invalidated` | `void` | |
| — | `lapsed`, `superseded` | no v275 equivalent; new information |

That table is itself a v287 deliverable, and the `exception` row is the
substantive finding: v275 treated an exception as a lifecycle state; the
constitution treats it as evidence that does not by itself move the lifecycle.
The projection layer must surface exceptions as *decorations on a row*, not as
a state — otherwise the UI will show "exception" where the constitution says
"active, with an exception recorded."

---

## 4 · APIs

### 4.1 · SQL surface (proposed signatures — shapes, not code)

```
-- L2 primitives
responsibility_feed(p_filter jsonb, p_now timestamptz default now())
    → TABLE(responsibility uuid, scope text, event_ref uuid, department text,
            kind text, required_outcome text, resource_role text,
            owner text, state text, timing jsonb, risk jsonb,
            exceptions int, natural_key text, ordering_key text)

responsibility_detail(p_responsibility uuid, p_now timestamptz default now())
    → jsonb   -- the row, its anchors (why it exists), ownership history,
              --   evidence trail, dependencies, supersession chain

ownership_history(p_responsibility uuid) → TABLE(...)   -- ledger, append-only
risk_findings(p_filter jsonb, p_now timestamptz default now()) → TABLE(...)
    -- lapse-approaching, staleness (v282), blocked chains, unowned-and-near

-- L3 composed
projection_operations_today(p_filter jsonb, p_now …)  → jsonb envelope
projection_event_command(p_event uuid, p_now …)       → jsonb envelope
projection_department_queue(p_department text, p_group_by text, p_now …) → jsonb
projection_day_sheet(p_day date, p_group_by text, p_now …)  → jsonb
projection_search(p_query text, p_limit int, p_now …)       → jsonb
```

`projection_my_work`, `projection_ownerless`, and `projection_at_risk` from the
directive's illustrative list are **deliberately not separate functions** —
they are `responsibility_feed` with `owner=me`, `unowned=true`, and
`at_risk=true` respectively, and `projection_operations_today` already composes
all three. Adding them as functions would be three more places to keep
consistent for zero capability. This is the plan's clearest reuse decision.

`p_group_by` on queue and day sheet is presentation (station/truck/route). It
may reorder and regroup; it may never change membership — which is R-13, and
becomes proof PRJ-5.

### 4.2 · Client surface (`src/lib/projection/`)

Following the shipped pure/data split:

```
src/lib/projection/
  types.ts        -- Envelope<T>, ResponsibilityRow, State, Risk; the ONE
                  --   definition of a projected responsibility for all of React
  client.ts       -- fetchProjection(name, params) → Envelope<T>; single rpc
                  --   seam, version pinning, refusal normalization
  feed.ts         -- typed wrappers: feed(filter), myWork(), ownerless(dept)…
  labels.ts       -- label packs (Application Shell §10): key → label + verbs
  state.ts        -- PURE: state → glyph/tone (Shell §8), ordering comparators,
                  --   grouping — no fetching, unit-testable, no DB
```

`labels.ts` and `state.ts` being pure and DB-free is what lets the browser
suite test the shell's visual language without a database, and what makes the
label-pack ruling implementable without touching SQL.

**React integration rules** (the contract every future surface signs):

1. Components never call `.rpc()` — unchanged from today's discipline.
2. A surface consumes **one** composed projection, not several primitives.
3. No client-side state derivation. If a screen needs to know a state, it reads
   `row.state`. Computing state in TypeScript is the drift this slice exists to
   prevent.
4. After any ceremony, **refetch the projection** — never patch local state
   optimistically. Already the shipped pattern in `EventWorkspace.tsx`.
5. Grouping/sorting/filtering *within a fetched projection* is allowed and
   encouraged client-side (it is presentation, R-13) — but never *membership*
   changes, which require a new fetch with a new filter.

---

## 5 · Slicing

Four slices; each independently certifiable, each leaving the tree green.

**v287a · Feed spine + envelope.** `responsibility_feed`,
`responsibility_detail`, `ownership_history`, the envelope convention, the
volatility/layering guards. Proofs PRJ-1…PRJ-4, PRJ-8. The largest slice and
the one everything else depends on.

**v287b · Risk + composed projections.** `risk_findings`, then
`projection_operations_today`, `projection_event_command`,
`projection_department_queue`, `projection_day_sheet`. Proofs PRJ-5…PRJ-7.

**v287c · Client projection module.** `src/lib/projection/*`, typed envelopes,
label packs, pure state/glyph/order helpers. Unit tests + one browser harness
that renders a projection fixture through the real modules (no new product
UI — a harness, exactly as `accept-basis` does today).

**v287d · Search projection.** `projection_search` — relationship-ranked across
events, customers, responsibilities, knowledge, resources-when-they-exist.
Separated because ranking is genuinely different work and should not hold up
the operational spine.

Recommended stop-and-review after **v287a**, because if the feed's filter
grammar and envelope are wrong, everything downstream inherits it.

---

## 6 · Proof obligations

Constitutional proofs (RSP-1…RSP-11) remain mandatory for anything touching
responsibilities. New projection-specific claims:

| Claim | Proves |
|---|---|
| **PRJ-1 · Determinism** | Same truth + same `as_of` ⇒ byte-identical envelope, across repeated calls and across the two databases. |
| **PRJ-2 · Purity** | Every projection is `STABLE`; row-count fingerprint of every table unchanged across a full sweep of every projection (the `ec`/`eczr` technique, already proven in v286's RSP-8). |
| **PRJ-3 · No layering violation** | Schema assertion: no projection function is `VOLATILE`; no L2/L3 function calls a `VOLATILE` function; no L3 computes state (asserted by dependency inspection on `responsibility_state`). |
| **PRJ-4 · Single source of state** | Every projected `state` value equals `responsibility_state(id, as_of)` for the same row and clock — the anti-drift proof, and the most important one in the slice. |
| **PRJ-5 · Content independence (R-13)** | Same filter, every `p_group_by` permutation ⇒ identical membership by natural key; only ordering/grouping differs. Paired negative: a genuine truth change *does* alter membership. |
| **PRJ-6 · Composition fidelity** | `projection_operations_today` contents equal the union of the equivalent direct `responsibility_feed` calls — composition adds no rows and hides none. |
| **PRJ-7 · Tenant isolation** | Projections under tenant B never surface tenant A's rows, including through search ranking and cross-event aggregates. |
| **PRJ-8 · Clock discipline** | `as_of` is honored and echoed; a lapse boundary crossed only by moving `p_now` flips `lapsed` with zero writes — time changes projections, never truth. |
| **PRJ-9 · Vocabulary conformance** | No projection emits any state outside the constitutional seven; `obligation_state` is not reachable from any v287 projection (call-graph assertion). |

**Browser obligations (v287c only):** a harness renders a fixture envelope
through the real client modules and asserts the state glyph/tone language
(Shell §8) and label-pack resolution — no product UI, following the existing
harness convention.

---

## 7 · Race implications

Projections are `STABLE` and write nothing, so they cannot *lose* a race. The
real risks are **torn reads** and **lying to the operator**:

**RACE-P1 · Read consistency under concurrent derivation.** A composed
projection makes several sub-reads; if `derive_responsibilities()` commits
mid-projection, a surface could show a superseded row beside its replacement,
or a count that disagrees with its own list. **Mitigation:** every composed
projection resolves its snapshot once — a single statement-level read where
possible, and `REPEATABLE READ` semantics documented for multi-statement L3
functions. **Certification:** genuine two-backend race on a disposable
database — backend A loops a composed projection while backend B runs a
derivation that supersedes and creates rows; assert every returned envelope is
internally consistent (counts match contents, no row appears in two mutually
exclusive states, no replacement without its predecessor's supersession).

**RACE-P2 · Ownership transfer during projection.** Backend A projects a
department queue while backend B transfers ownership (the v286 RSP-6 ceremony).
Assert: no envelope ever shows two current owners for one responsibility, and
every envelope's owner matches some committed ledger act — a projection may be
stale, but it may never be *incoherent*.

Both run barrier-synchronized, both orders, disposable database, cleanup
verified — the established race discipline.

---

## 8 · Migration sequence

Additive throughout; no existing function is dropped or altered.

```
v287a_projection_spine.sql       feed, detail, ownership_history, guards
v287a_proof.sql                  PRJ-1..4, PRJ-8
v287b_projection_composed.sql    risk_findings + the four composed projections
v287b_proof.sql                  PRJ-5..7, PRJ-9
v287b_race.sql                   RACE-P1, RACE-P2 (disposable db)
v287d_projection_search.sql      search + ranking
v287d_proof.sql
```

Apply to both `ec` and `eczr`, in order, after the full v284→v286 chain. Grants
per `RESTORATION_NOTES_v284.md`. Client slice v287c is code-only, no migration.

**Regression floors carried forward, unchanged:** SQL 374 PASS / 0 FAIL (v286's
number) plus each slice's new claims; browser 228 PASS / 0 FAIL across 24
certified runners with `accept-regression` quarantined; four tsc configs clean;
residue zero by `ec`/`eczr` fingerprint.

---

## 9 · RULINGS (accepted — architecture closed)

Recorded as binding for v287. From this point v287 is an implementation
project; Product Architecture 1.0 and Application Shell 1.0 are not reopened
unless implementation exposes a genuine contradiction.

1. **JSONB filter grammar with closed validation.** Not open JSON. Unknown
   keys refuse; unknown values refuse. The grammar is part of the
   constitutional API surface. Refusal: `PROJECTION_FILTER_INVALID`.
2. **SQL owns the envelope.** `as_of`, `truth_version`, and `counts` come from
   the database that answered. The client never manufactures them.
3. **`event_workspace` (v277) remains.** Both systems run; v277 retires only
   after the browser suite proves equivalence.
4. **Search ranking deferred.** `projection_search` returns *relationships,
   not opinions*, and stays deterministic. Ranking is a later slice.
5. **PRJ-10 added** — projection completeness (below).

### PRJ-10 · Projection completeness
> Every responsibility visible through any projection is present in
> `responsibility_feed`; every responsibility omitted is omitted **solely** by
> explicit filter criteria.

Formulated provably: because every envelope echoes the `scope` that produced
it, completeness is set equality —

```
projection contents  ≡  responsibility_feed(envelope.scope)
Feed → Filter → Projection      (nothing added, nothing silently hidden)
```

Two directions, both required: **soundness** (nothing appears that the feed
does not contain) and **completeness** (the difference between the unfiltered
feed and the projection equals exactly the rows the declared filter excludes).
A UI bug could then only hide work by declaring a filter it did not apply —
which the proof catches. Ranked with PRJ-4 as the two anti-drift proofs of the
slice: PRJ-4 stops a surface inventing *state*, PRJ-10 stops a surface
inventing *membership*.

At v287a the claim is proven at feed level: `feed(∅)` equals every
responsibility in the tenant, and `feed(F)` equals exactly the subset of
`feed(∅)` satisfying `F`. The composed-projection form is proven in v287b.

---

## 9b · Questions resolved by the rulings above

1. **Feed filter grammar: `jsonb` or explicit parameters?** `jsonb` is
   extensible without signature churn; explicit parameters are type-safe and
   self-documenting. Recommend `jsonb` with a validating guard that refuses
   unknown keys by name (`PROJECTION_FILTER_INVALID`) — extensibility with a
   closed vocabulary, matching how the codebase already treats department keys.
2. **Envelope in SQL or assembled in the client?** Recommend SQL: one round
   trip, and the envelope's `as_of`/`provenance` must come from the database
   that answered, not from the caller's clock.
3. **Does `projection_event_command` supersede `event_workspace`?** Recommend
   **no** for v287 — build the new one beside it, migrate the consumer in a
   later slice, retire v277's only when its consumer is certified on the new
   shape. Two projections briefly coexisting is cheaper than a mid-foundation
   rewrite of a certified surface.
4. **Search ranking inputs.** Relationship-ranked search needs a stated ranking
   basis (recency, usage count, relationship distance). Worth a ruling before
   v287d, not before v287a.

---

## 10 · Why this order is right

The directive's reasoning holds, and the repository confirms it. The one
surface EventCore has already built the constitutional way —
`EventWorkspace.tsx` over `event_workspace` — is thin, honest, and has stayed
correct through eleven slices, *because* its meaning lives in SQL. The surfaces
that predate that discipline are where meaning leaked into components. Building
the read model first is not architectural patience; it is the difference
between six thin consumers and six independent interpretations of what
"active" means.
