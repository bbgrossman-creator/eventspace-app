# EventCore v287a — Projection Spine
## Implementation Report · Certification

**Slice.** The first of four v287 slices: the feed spine, the closed filter
grammar, and the SQL-owned envelope. Infrastructure only — no UI, no product
surface. Architecture closed by the owner's five rulings; from this point v287
is an implementation project. Product Architecture 1.0 and Application Shell
1.0 were not reopened.

**Verdict: v287a — DEPLOYABLE.** Stopping here for review, as planned.

---

## 1 · Rulings compliance

| Ruling | Implementation | Proof |
|---|---|---|
| **1 · JSONB filter grammar, closed validation** | `validate_projection_filter()` — closed key set, closed value vocabularies (states, departments, scope), typed booleans, nested `window` keys closed, uuid validated. Refuses by name. | FG-1…FG-5 |
| **2 · SQL owns the envelope** | `projection_envelope()` supplies `projection · version · as_of · scope · counts · provenance.truth_version`. The client cannot manufacture any of them. | ENV-1…ENV-3 |
| **3 · `event_workspace` remains** | Untouched. Not called, not altered, not deprecated. Its consumer (`EventWorkspace.tsx`) and its browser runner are unchanged and still green. | regression |
| **4 · Search deferred** | No search function built. Deferred to v287d. | — |
| **5 · PRJ-10 completeness** | Proven in four directions at feed level. | PRJ-10a…10d |

---

## 2 · What was built

**L2 primitives** (the layer the whole product will consume):

- `responsibility_feed(filter, now)` — the spine. The **only** place a
  Responsibility Record becomes a projected row. Returns a total, reproducible
  order (risk → state rank → window → natural key, no ties).
- `responsibility_detail(id, now)` — "why does this exist?" in one read:
  anchors, ownership history, evidence trail, dependencies, supersession chain.
- `ownership_history(id)` — the ledger, projected.

**Supporting:** `validate_projection_filter()`, `projection_truth_version()`,
`projection_envelope()`.

**First composed projection:** `projection_feed(filter, now)` — deliberately
thin (feed + counts + envelope, no state logic) to prove the envelope
convention end to end before four more are built on it.

Every function is `STABLE`, tenant-scoped, and clock-parameterized.

---

## 3 · Proof mapping

`supabase/tests/v287a_proof.sql` — **21 PASS / 0 FAIL** on first run,
self-rolling-back (`V287A_PROOF_ROLLBACK`), rerunnable, zero residue.

| Claim | Proves |
|---|---|
| FG-1…FG-4 | unknown key, unknown state, unknown department, unknown nested window key — each refused as `PROJECTION_FILTER_INVALID` |
| FG-5 | a lawful filter is accepted and projects |
| **PRJ-10a** | unfiltered feed = every responsibility in the tenant (nothing hidden by default) |
| **PRJ-10b** | soundness — a filtered projection introduces no row absent from the feed |
| **PRJ-10c** | completeness — everything satisfying the filter appears; omission is by filter alone |
| **PRJ-10d** | the ownerless projection cannot silently shrink — the debt list is provably complete |
| **PRJ-4** | every projected state equals `responsibility_state()` for the same row and clock |
| PRJ-9 | only the constitutional seven states are emitted; the v275 vocabulary is unreachable |
| PRJ-1 / 1b | byte-identical envelopes on repeat; total reproducible ordering |
| ENV-1…3 | envelope completeness; scope echoed exactly; counts agree with contents |
| PRJ-8 / 8b | advancing only `as_of` moved a row `derived → lapsed` with zero writes; risk is clock-relative |
| PRJ-2 | full projection sweep left the record/ledger/evidence fingerprint unchanged |
| PRJ-3 | every projection function is `STABLE` — the engine forbids writing or calling volatile |
| DET-1 | detail returns anchors + ownership + evidence together |

**Why PRJ-10d earns its place.** PRJ-10a–c prove the general property;
PRJ-10d aims it at the single axis where a UI bug would do the most damage.
The ownerless list is the product's conscience (Application Shell §3: it can
never be filtered away). Proving it cannot silently shrink is what makes that
promise mechanical rather than a UI convention.

---

## 4 · Regression

```
SQL      : 395 PASS / 0 FAIL   (v286 floor 374 held exactly; v287a adds 21)
residue  : 0 (ec ≡ eczr fingerprint)
tsc      : v281 / v283 / v284 / strictcheck — all CLEAN
browser  : 228 PASS / 0 FAIL across 24 certified runners · 0 zero-emission
           accept-regression 14 PASS / 1 FAIL — unchanged, still quarantined
```

No existing function altered. No proof modified. No browser runner changed.

---

## 5 · Design notes worth recording

**The feed is the anti-drift mechanism, not a convenience.** Because every
composed projection must be `responsibility_feed` with a different filter,
there is exactly one place that decides what a responsibility looks like.
PRJ-4 and PRJ-10 together make that structural: a surface cannot invent a
*state* (PRJ-4) and cannot invent *membership* (PRJ-10).

**The envelope echoing its own scope is what makes PRJ-10 checkable at L3.**
In v287b, completeness becomes set equality — *projection contents ≡
`responsibility_feed(envelope.scope)`* — because the projection has already
declared the filter it claims to have applied. A surface could then only hide
work by declaring a filter it did not apply, which the proof catches.

**`truth_version` exists without a cache existing.** No materialized view, no
cached status, no refresh job — a materialized responsibility state is a
stored lifecycle state in disguise (R-3). The fingerprint is present so a
future lawful, reconstructible, always-labeled cache remains possible without
reopening the envelope shape.

**Ordering is a total order by construction.** Ties would make pagination
non-deterministic and PRJ-1b unprovable; `natural_key` is the final
tiebreaker, so ordering is reproducible across reads and across databases.

---

## 6 · Known limitations (deliberate, in scope)

1. **No composed projections beyond `projection_feed`.** Operations Today,
   Event Command, Department Queue, Day Sheet are v287b.
2. **`risk` is minimal** — lapse-soon within 24h, exception count, unowned.
   Staleness (v282) and blocked-chain risk join in v287b's `risk_findings`.
3. **No client module yet** (`src/lib/projection/*` is v287c). Nothing in
   React consumes the spine, by design — the layer is proven before it is
   depended upon.
4. **No race certification yet.** RACE-P1/P2 belong to v287b, where composed
   projections make multi-read tearing possible. `v287a`'s functions are
   single-statement reads.
5. **`text` filter is a simple `ilike`**, not ranked search — ranking is
   deferred by ruling 4 and search is v287d.
6. **The v275↔v286 vocabulary migration of `spine.ts` / `EventWorkspace.tsx`
   is untouched**, per ruling 3.

---

## 7 · Deployment sequence

Apply after the full v284→v286 chain, to **both** `ec` and `eczr`:

```
supabase/v287a_projection_spine.sql
```

Then grants per `RESTORATION_NOTES_v284.md` §1. Verify:

```bash
psql -d ec -f supabase/tests/v287a_proof.sql     # expect 21 PASS / 0 FAIL
```

Re-runnable: every function is `create or replace`; no schema objects are
created, altered, or dropped by this slice.

---

## 8 · Certification statement

**Constitutional compliance.** R-3 (no stored lifecycle state — nothing
materialized), R-9 (projections non-authoritative — all `STABLE`, purity
fingerprinted), R-13 (content independence — presentation is not a derivation
input anywhere in the layer), R-5 (no task table), R-10 (no AI surface).
The constitutional state vocabulary is the only vocabulary the layer emits.

**Migration review.** Additive only. No table, column, constraint, trigger, or
existing function was created, altered, or dropped. `event_workspace`,
`obligation_state`, and every v275–v286 function are untouched.

**Proof review.** 21 claims green on first run, self-rolling-back, zero
residue, rerunnable.

**Regression review.** SQL 395/0 (374 floor held exactly), browser floor 228/0
across 24 certified runners unchanged, four tsc configs clean, residue zero.

**Race review.** Not applicable to this slice: all v287a functions are
single-statement `STABLE` reads that write nothing. RACE-P1/P2 are scheduled
for v287b, where composition introduces multi-read tearing risk.

**Explicit statements.**
- No constitutional invariant was weakened.
- No architectural redesign occurred; Product Architecture 1.0 and Application
  Shell 1.0 were not reopened.
- v285 Rev B remains frozen.
- No UI, no Daily Operations, no department surface, no search, no task
  object, no cached status, and no mutable responsibility state was built.

---

**v287a — DEPLOYABLE.** Stopping for review as planned: if the filter grammar
or the envelope shape is wrong, everything downstream inherits it. v287b
(risk + composed projections + races), v287c (client module), and v287d
(search) await review.
