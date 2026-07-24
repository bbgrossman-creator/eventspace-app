# EventCore v287b — Composed Projections, Risk Findings, Race Certification
## Implementation Report · Certification

**Slice.** The second v287 slice: `risk_findings()` plus the four composed
projections, built as thin compositions over the v287a spine. Infrastructure
only — no UI, no client, no search, no Resources, no Pipeline. Nothing in the
frozen stack was reopened.

**Verdict: v287b — DEPLOYABLE.** Stopping for review before v287c.

---

## 1 · What was built

| Function | Scope declared | Composition |
|---|---|---|
| `risk_findings(filter, now)` | caller's filter | strictly over `responsibility_feed(filter)` |
| `projection_operations_today(viewer, since, now)` | `{}` — whole tenant | feed + 5 bands + risk + counts |
| `projection_event_command(event, now)` | `{"event": …}` | feed + state columns + risk + counts |
| `projection_department_queue(dept, group_by, now)` | `{"department": …}` | feed + groups + risk + counts |
| `projection_day_sheet(day, group_by, now)` | `{"window":{from,to}}` | feed + groups + risk + counts |

Supporting: `validate_projection_group_by()` (closed grouping vocabulary,
`PROJECTION_GROUP_BY_INVALID`) and `projection_group_key()` (pure, immutable).

`event_workspace()` (v277) is **untouched** and keeps its consumer.

---

## 2 · The composition law, proven for every projection

> **projection contents ≡ `responsibility_feed(envelope.scope, envelope.as_of)`**

Proven independently for all four (PRJ-6a…6d), by re-running the feed with the
scope the envelope itself declared and comparing membership. No hidden filters,
no implicit exclusions, no screen-specific membership logic: membership exists
only because of the declared scope.

**Operations Today deserves a note.** Its declared scope is `{}` — the whole
tenant. `viewer` and `since` are carried in `data`, deliberately **not** in
scope, because narrowing membership by viewer would hide other people's
ownerless work. The five questions are answered as **bands over one membership
set**, not as five separate queries. OWN-2 proves this directly: changing the
viewer leaves the ownerless band identical.

---

## 3 · Risk is projection, not state

Four concepts kept mechanically separate, and proven so:

| Concept | Where it lives | Proof |
|---|---|---|
| Constitutional state | `responsibility_state()` — the seven words, only | PRJ-9a, PRJ-4b |
| Risk finding | `risk_findings()` — a decoration | RSK-1, RSK-3 |
| Exception evidence | an appended fact, surfaced as a finding | RSK-4 |
| Staleness finding | v282 venue knowledge, **event-level** (`responsibility` is null) | implemented |

Findings emitted: `lapsed`, `lapse_approaching`, `ownerless_nearing_window`,
`dependency_blocked`, `exception_recorded`, and `venue_stale` /
`venue_expired` / `venue_renovation_reverification` from v282.

**`blocked`, `exception` and `invalidated` are never emitted as states** —
RSK-5 asserts no finding even carries those names. RSK-2 and RSK-4 prove the
decorated responsibility keeps its constitutional state (`active`, `derived`)
while risk is attached alongside it. RSK-6 proves risk can never reference a
responsibility outside the feed for the same scope — risk cannot invent
membership.

---

## 4 · Grouping never moves membership

`group_by` is closed (`department · event · state · owner · resource_role ·
none`). GRP-1 iterates **every** grouping mode on the department queue and
asserts byte-identical membership; GRP-2 does the same for the day sheet.
CNT-3 additionally proves every row lands in exactly one group and the group
members sum to both the contents and the count.

---

## 5 · Snapshot consistency

**Every composed projection assembles its entire envelope in a single SQL
statement** — one `WITH` over `responsibility_feed` and `risk_findings`,
feeding contents, bands, groups, risk and counts. There is therefore **no
snapshot boundary to document**: contents, counts and decorations are computed
from one database snapshot by construction, which is why counts can never
disagree with contents.

---

## 6 · Proofs

`supabase/tests/v287b_proof.sql` — **26 PASS / 0 FAIL** on first run,
self-rolling-back (`V287B_PROOF_ROLLBACK`), rerunnable, zero residue.

| Claim | Proves |
|---|---|
| PRJ-6a…6d | composition fidelity + completeness for all four projections |
| GRP-1, GRP-2 | grouping never changes membership |
| GRP-3 | closed grouping vocabulary refuses by name |
| OWN-1 | ownerless band ≡ `feed(unowned)` exactly |
| OWN-2 | viewer is context, never a membership filter |
| RSK-1…RSK-6 | risk is a finding; state unchanged; concepts distinct; no invented membership |
| CNT-1…CNT-3 | counts equal contents; groups partition the contents |
| PRJ-9a, PRJ-9b | constitutional vocabulary only; no projection calls `obligation_state()` |
| PRJ-4b | every projected state equals `responsibility_state()` |
| PRJ-8c, PRJ-8d | clock-only change moves risk with zero writes; envelope echoes its clock |
| PRJ-7 | tenant isolation |
| PRJ-2b, PRJ-3b | purity by fingerprint; every projection STABLE/IMMUTABLE |

---

## 7 · Race certification

`supabase/tests/v287b_race.sql`, disposable database (`createdb -T ec
ec_race287`), 2-second barrier, cleanup verified (0 race objects, 0 race
functions remain in `ec`).

**RACE-P1 — projections vs derivation.** **1080 composed-projection reads**
taken while a second backend ran **40 derive/supersede cycles**. Every envelope
was internally consistent: counts equalled contents in all 1080 reads, no
responsibility appeared under two states in one envelope, and the ownerless
count always matched the ownerless band.

**RACE-P2 — projections vs ownership transfer.** **910 department-queue reads**
against **49 ownership transfers**. The contested responsibility never showed
more than one current owner, every projected owner matched a committed ledger
act, counts equalled contents throughout, and the ledger retained all 50 acts.
**Re-run in the reversed launch order** — 554 reads against 37 transfers, same
verdict.

The doctrine both races encode: a projection may be **stale**; it may never be
**incoherent**.

---

## 8 · Regression

```
SQL      : 421 PASS / 0 FAIL   (v287a floor 395 held EXACTLY; v287b adds 26)
residue  : 0 (ec ≡ eczr fingerprint)
tsc      : v281 / v283 / v284 / strictcheck — all CLEAN
browser  : 228 PASS / 0 FAIL across 24 certified runners · 0 zero-emission
           accept-regression 14 PASS / 1 FAIL — unchanged, still quarantined
```

No existing function altered. No proof modified. No browser runner changed.
All grants target `authenticated` only, per `SQL_RELEASE_CONVENTIONS.md`
Rule 2; no `extensions.digest` call was needed in this slice.

---

## 9 · Known limitations (deliberate, in scope)

1. **Day sheet surfaces undated work.** The frozen filter grammar's `window`
   predicate never excludes a responsibility that carries no window. Undated
   work therefore appears in a day sheet rather than being silently hidden —
   the same doctrine that protects the ownerless collection. Membership still
   equals `feed(scope)` exactly, so PRJ-10 holds. Changing this would require
   reopening the frozen grammar; it is documented rather than worked around.
2. **`changed` band requires an explicit `since`.** With no `since`, the band
   is empty rather than guessing a window.
3. **Staleness findings are event-level**, not per-responsibility — v282
   findings are venue-scoped and attaching them to individual responsibilities
   would manufacture a precision the underlying truth does not have.
4. **No client module, no UI, no search** — v287c and v287d.
5. **`event_workspace()` untouched**; the v275↔v286 vocabulary migration of its
   consumer remains a separate future slice.

---

## 10 · Deployment sequence

Apply after v287a, to **both** `ec` and `eczr`:

```
supabase/v287b_projection_composed.sql
```

Grants are inside the file (authenticated only). Verify:

```bash
psql -d ec -f supabase/tests/v287b_proof.sql        # expect 26 PASS / 0 FAIL
dropdb --if-exists ec_race287 && createdb -T ec ec_race287
psql -d ec_race287 -f supabase/tests/v287b_race.sql
# then: race287_arm(); race287_read + race287_derive concurrently; verdict_p1
#       race287_arm(); race287_read_dept + race287_transfer concurrently; verdict_p2
dropdb ec_race287
```

Re-runnable: every function is `create or replace`; no schema objects created,
altered or dropped.

---

## 11 · Certification statement

**Constitutional compliance.** R-3 (no stored lifecycle state — nothing
materialized, nothing cached), R-9 (projections non-authoritative — all
STABLE, purity fingerprinted), R-13 (content independence — grouping proven
not to change membership), R-5 (no task table), R-10 (no AI surface). Only the
constitutional seven states are emitted anywhere.

**Migration review.** Additive only. No table, column, constraint, trigger or
existing function created, altered or dropped.

**Race review.** RACE-P1 and RACE-P2 executed with genuine concurrent backends
on a disposable database, barrier-synchronized, RACE-P2 in both launch orders.
Cleanup verified.

**Proof review.** 26 claims green on first run, self-rolling-back, zero residue.

**Regression review.** SQL 421/0 (395 floor held exactly), browser floor 228/0
across 24 certified runners unchanged, four tsc configs clean, residue zero,
quarantined behaviour unchanged.

**Explicit statements.**
- No constitutional invariant was weakened.
- The Constitution, Product Architecture 1.0, Application Shell 1.0 and the
  Projection Architecture were **not** reopened or redesigned.
- No UI, client module, mobile, search, Resources, Pipeline, task table,
  cached lifecycle state or materialized responsibility state was built.

---

**v287b — DEPLOYABLE.** Stopping for review before v287c (client projection
module).
