# EventCore v286 — Responsibility Record + Ownership Ledger + Deterministic Derivation
## Implementation Report · Certification

**Slice.** Infrastructure only. Implements Responsibility OS Constitution
v285 Rev B (frozen). No product expansion, no UX, no redesign, no speculative
features. Repository-verified before implementation: the `obligation` relation,
its constraints, its RLS policies, and the `execution_evidence` ledger were
inspected in the live database, not recalled.

**Verdict: v286 — DEPLOYABLE.**

---

## 1 · What was built

| Pillar | Delivered |
|---|---|
| Responsibility Record | `obligation` **widened in place** and constitutionally recognized as the Responsibility Record. Provenance generalized to five origins; revision pinning; scope; supersession chain; anchors. |
| Ownership Ledger | Dedicated append-only `responsibility_owner` with a serialized transfer ceremony. |
| Deterministic Derivation | `derive_responsibilities()` — the only writer — over three truth resolvers (T1/T2/T3), natural-key idempotent. |
| Projection primitives | `responsibility_state()`, `responsibility_current_owner()`, `department_workspace()`, `day_sheet()` — all read-only. |

**No parallel `responsibility` table was created.** The physical relation
remains `obligation`; `responsibility` is the canonical vocabulary at every
function boundary, exactly as ruled.

---

## 2 · Constitutional traceability (R-1 … R-13)

| Invariant | Implementation | Proof |
|---|---|---|
| **R-1** truth anchor required | `origin_ref NOT NULL`; `responsibility_anchor_guard` trigger; derivation refuses anchorless rows | RSP-2, RSP-2b |
| **R-2** deterministic, idempotent | `responsibility_natural_key()` (immutable, identity+content); insert-or-do-nothing upsert | RSP-1, RSP-1b, RSP-1c |
| **R-3** no stored lifecycle state | No status column; `responsibility_state()` projects from evidence+truth+clock | RSP-3, RSP-3b |
| **R-4** append-only, corrections cite | `responsibility_no_edit` trigger; ledger `prior_ref`; RLS select+insert only | AO-1, AO-2 |
| **R-5** no task table | None created. Nothing in this slice stores task state. | schema review §5 |
| **R-6** ≤1 current owner; unassigned lawful | Ledger max-seq projection; serialized ceremony; `OWNERSHIP_CONFLICT` | OWN-1…OWN-5, **RSP-6** |
| **R-7** discharge only from evidence | `responsibility_state()` returns `discharged` solely on a `completion` fact | LC-2 |
| **R-8** no in-place edit; supersession cites | `RESP_EDIT_REFUSED` trigger; `supersedes_ref`; appended `superseded` evidence | AO-1, SUP-1, SUP-2 |
| **R-9** projections non-authoritative | All projections `STABLE`; fingerprint unchanged across projection calls | RSP-8, RSP-8b |
| **R-10** AI never authoritative | No AI surface exists in this slice; ceremonies require a human `p_actor` (`RESP_ACTOR_REQUIRED`) | §6 limitations |
| **R-11** sealed basis / revision pin | `origin_revision` mandatory for knowledge origin; T2 resolver pins `profile_revision_id` | RSP-2, SC-3 |
| **R-12** closed department vocabulary | Existing check constraint untouched; T2 mapping targets only lawful departments | unchanged from v275 |
| **R-13** content independence | Derivation reads only truth; no presentation input anywhere in the writer | R13-1 |

Constitutional §4 lifecycle vocabulary is implemented verbatim:
`derived · standing · active · discharged · lapsed · superseded · void`.

---

## 3 · Proof mapping

`supabase/tests/v286_proof.sql` — **24 PASS / 0 FAIL**, self-rolling-back
(`V286_PROOF_ROLLBACK`), rerunnable, zero residue.

| Claim | Covers |
|---|---|
| RSP-1 / 1b / 1c | derivation determinism, zero duplicate natural keys, key recomputes purely from truth |
| RSP-2 / 2b | `RESP_NO_TRUTH_ANCHOR` on unpinned knowledge origin and on scopeless derivation |
| RSP-3 / 3b | no status-like column; `responsibility_state()` is STABLE |
| SC-1 / 2 / 3 | scope/anchor coherence; lawful standing responsibility |
| AO-1 / AO-2 | `RESP_EDIT_REFUSED`, `RESP_OWNER_LEDGER_APPEND_ONLY` |
| OWN-1…5 | unassigned lawful → Derived; assign; stale-prior refusal; total history; release |
| LC-1 / LC-2 | Active projection; Discharged derives only from a completion fact |
| SUP-1 / SUP-2 | supersession by appended fact with the row untouched |
| RSP-8 / 8b | projection purity by fingerprint and by declared volatility |
| R13-1 | responsibility set identical by natural key across department lenses |

`supabase/tests/v286_race.sql` — **RSP-6**, genuine two-backend concurrency on a
disposable database (`createdb -T ec ec_race286`), 2-second barrier, **both
launch orders**. Result: exactly one transfer won, the loser was refused
`OWNERSHIP_CONFLICT`, history retained both acts. The winner **differed by
order** (yitzy in order A, dovid in order B), confirming a genuine race rather
than a fixed outcome. Disposable database dropped; zero race objects remain.

---

## 4 · Regression

```
SQL      : 374 PASS / 0 FAIL   (v284 floor 350 held exactly; v286 adds 24)
residue  : 0 (ec ≡ eczr row-count fingerprint)
tsc      : v281 / v283 / v284 / strictcheck — all CLEAN
browser  : 228 PASS / 0 FAIL across 24 certified runners · 0 zero-emission
           accept-regression 14 PASS / 1 FAIL — unchanged, still quarantined
```

No prior proof was modified. No browser runner changed.

---

## 5 · Design decisions worth recording

**Idempotency is insert-or-do-nothing, not upsert-with-update.** R-2 requires
idempotent regeneration; R-8 forbids in-place edits. These reconcile only if
regeneration never updates. The natural key therefore spans identity **and**
content, so a content change is a *new identity* whose predecessor is
superseded — never a row rewritten underneath a reader.

**Supersession is an appended fact.** Because the record is append-only,
"no longer implied" cannot be a column write. Derivation appends
`execution_evidence(kind='superseded')` — reusing the shipped I-35 correction
vocabulary rather than inventing a second mechanism.

**One schema widening was required for correctness, not convenience.**
`execution_evidence.event_ref` was NOT NULL. A **standing** responsibility
carries no event, so it could never receive a completion fact and its lifecycle
would have been unreachable — a constitution-violating dead end. The column is
now nullable under a new check: every fact must anchor to an event **or** a
responsibility. Widening only; every existing row remains valid.

**Single-writer discipline** is enforced by `pg_advisory_xact_lock` per
tenant+event in the writer, and by `SELECT … FOR UPDATE` on the responsibility
row in the ownership ceremony.

---

## 6 · Known limitations (deliberate, in scope discipline)

1. **No browser test was added.** This slice has no UI surface, and building one
   to test it would be the forbidden Daily Operations work. Every constitutional
   behavior here is SQL-provable and is proven in SQL. The browser suite was run
   as regression only.
2. **Recurrence (L-5) is not implemented.** Standing responsibilities are
   *representable* (SC-3 proves one), but no recurrence rule carrier and no
   scheduler exist. Deferred as its own slice; no speculative columns were added
   for it.
3. **T1 derivation is minimal by design** — one execution responsibility per
   released event. Richer event-truth derivation belongs to the domain slices,
   not to infrastructure.
4. **T2 derivation maps requirement kinds to departments** with a fixed mapping
   (`staff→staffing`, `equipment/rental→equipment`, `supply→culinary`). If a
   future domain slice needs a different mapping, it becomes promoted knowledge,
   not a code edit.
5. **`obligation_state()` (v275) is untouched** and still returns the v275
   vocabulary. `responsibility_state()` is the constitutional projection. Both
   coexist deliberately; retiring the former is a later, certified rename.
6. **The physical table is still named `obligation`**, per ruling.

---

## 7 · Deployment sequence

Apply after the full v284 chain, to **both** `ec` and `eczr`:

```
supabase/v286_responsibility.sql
```

Then grants (per RESTORATION_NOTES_v284.md §1):
```sql
grant select,insert,update,delete on all tables in schema public to app_user,authenticated;
grant execute on all functions in schema public to app_user,authenticated;
```

Verify:
```bash
psql -d ec -f supabase/tests/v286_proof.sql          # expect 24 PASS / 0 FAIL
dropdb --if-exists ec_race286 && createdb -T ec ec_race286
psql -d ec_race286 -f supabase/tests/v286_race.sql   # then arm / go×2 / verdict
dropdb ec_race286
```

The migration is re-runnable: every column addition is `if not exists`, every
constraint is dropped-then-added, every function is `create or replace`.

---

## 8 · Certification statement

**Constitutional compliance review.** All thirteen invariants are implemented
and traced in §2. The §4 lifecycle vocabulary is used verbatim. No invariant was
weakened, bypassed, or reinterpreted.

**Migration review.** Widening only. Every added column is nullable or
defaulted; existing rows and all v275-era inserts remain valid; no historical
obligation was invalidated. The single NOT NULL relaxation
(`execution_evidence.event_ref`) is strictly widening and is justified in §5.

**Race review.** RSP-6 executed with two genuine backends on a disposable
database, barrier-synchronized, in both orders, with order-dependent winners.
Cleanup verified: zero race objects remain in `ec`.

**Proof review.** 24 claims green, self-rolling-back, zero residue, rerunnable.

**Regression review.** SQL 374/0 (the 350 floor held exactly), browser floor
228/0 across 24 certified runners unchanged, all four tsc configs clean,
residue zero.

**Explicit statements.**
- No constitutional invariant was weakened.
- No architectural redesign occurred.
- v285 Rev B remains frozen and was not reinterpreted.
- The implementation conforms exactly to the accepted Responsibility
  Constitution.
- No Daily Operations, workspace UI, notification, escalation, capacity,
  AI recommender, scheduler, task manager, task table, or mutable
  responsibility state was built.

---

**v286 — DEPLOYABLE.** Stopping here per the stopping condition. v287 not
begun; no Daily Operations work started. Awaiting review.
