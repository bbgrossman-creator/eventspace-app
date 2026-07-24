# EventCore v288 — Operations Today
## The first production consumer of the Responsibility projection architecture

**Verdict: v288 — DEPLOYABLE.** The success criterion is certified: EventCore
now has one production screen whose entire operational understanding comes from
the constitutional projection architecture, without bypassing it, reconstructing
it, or mutating it.

---

## 1 · Implementation summary

One mounted production page. Nothing else.

| Added | Purpose |
|---|---|
| `src/app/today/page.tsx` | the `/today` route; minimum frame, no shell |
| `src/components/today/OperationsToday.tsx` | the surface itself |
| `browser-tests/today.harness.tsx`, `today.html` | mounts the **real** component |
| `browser-tests/live-supabase.ts` | test-only transport → live Postgres |
| `browser-tests/accept-today.mjs` | UI-1…UI-9 against live SQL |

**Zero SQL changes. Zero new projections. Zero migrations.**

Precise change scope — what was and was not modified:

| Surface | Modified? |
|---|---|
| Production/legacy components (`EventWorkspace`, `DailyOpsEvent`, `OpsWorkspace`, `TodoPanel`, all of `src/components/execution/*`) | **No** — untouched, verified by their runners passing unchanged |
| `execution/spine.ts` and every other `src/lib` module | **No** |
| SQL: migrations, functions, proofs, races | **No** |
| Existing browser runners and harnesses | **No** |
| `src/lib/permissions.ts` | **No** — consumed read-only (`loadSession()`) |
| **`tsconfig.deploycheck.json`** | **YES — modified.** Its `include` was widened from `src/lib/projection/**` to all application code (`src/**`, excluding `__tests__`), so the new component is gated at the deployment build target. This is an existing **TypeScript configuration file**, not a production, legacy, SQL or proof surface. |

The earlier blanket phrase "no existing file modified" was imprecise and is
withdrawn: exactly one existing file changed, and it is a build-verification
config that widens coverage rather than altering any behaviour.

### How the page consumes truth
- Imports `@/lib/projection/feed` only. It does **not** import
  `execution/spine.ts` directly or transitively, and never calls `.rpc()`.
- **One projection request per render.** Every visible element — five bands,
  four counts, every state, every risk badge — comes from a single envelope
  carrying one `as_of` and one `truth_version`. Proven by UI-6b.
- Bands are resolved by **id lookup** against that envelope (`resolveBand`),
  never by re-filtering rows.
- Counts are read from `envelope.counts`; nothing is recounted.
- Read-only: there is no write path in the file. No ceremony, no evidence, no
  assignment, no dispatch, no optimistic update.

### Tenant and viewer resolution (corrected before freeze)

**Where trusted tenant identity comes from.** Only from `loadSession()` in
`src/lib/permissions.ts`, which reads the authenticated user via
`supabase.auth.getUser()` and their **active `tenant_users` row**. Tenant
identity is never taken from a route parameter, a query string, a header, or
any client-supplied value. The database independently enforces the same
boundary: `current_tenant_id()` resolves the tenant from `auth.uid()` through
`tenant_users`, so an unauthenticated connection has **no tenant at all**.

**Trust is resolved before any projection request**, with exactly two
outcomes:

| Condition | Behaviour |
|---|---|
| **Trusted tenant, viewer unresolved** (session + active tenant row, but no usable user id) | My Work **refuses**; the general tenant bands **do** render. `p_viewer` is sent as `null`, so SQL returns an empty My Work band. The client never fabricates a personal work list. **UI-9c** |
| **No trusted tenant** (signed out · no active tenant membership · no tenant bound · session unavailable) | The **whole projection refuses** (`TENANT_UNRESOLVED`). **No operational band renders, no row renders, and no projection request is issued at all.** **UI-9a** |

**A defect was found and corrected during this review.** The original
implementation treated "signed out" the same as "viewer unresolved": it still
issued the projection request. With no session, `current_tenant_id()` is NULL,
so SQL correctly returns an **empty envelope** — but the page rendered that as
*"Nothing is owed today. That is an empty day, not a failed read."* Zero rows
leaked, so this was never a data-exposure fault; it was a **truthfulness
fault** — an untrusted read presented as a statement about the tenant's work.
The surface now refuses without asking.

**The live acceptance also had to be corrected**, and this is worth recording:
the test bridge previously injected the session context into every SQL call
regardless of auth state, so the signed-out path was silently executed *with* a
tenant. The original UI-8c therefore did **not** prove the anonymous case. The
bridge now injects session context only when authenticated, so UI-9a exercises
a genuinely anonymous connection. **UI-9b** adds defence in depth, asserting
directly against the database that an anonymous read returns zero rows from
both `projection_operations_today` and `responsibility_feed`, independently of
the client.

### Three distinct outcomes, never collapsed
`ready` · `refusal` (a named projection refusal) · `transport` (could not
reach the projection). Plus `empty truth` inside `ready`, which reads
"Nothing is owed today. That is an empty day, not a failed read." A refusal
renders **no bands at all** — no stale fallback, no invented view (UI-8a/8b).

### The Changed band
No persistence was introduced: no `last viewed`, no `localStorage`, no
timestamp writes. `p_since` is sent as `null`, so the band renders present and
empty with an explicit reason. See §6 — this is the one directive I could not
satisfy as written, and I have not papered over it.

---

## 2 · Constitutional compliance review

| Requirement | Status | Evidence |
|---|---|---|
| Consumes `feed.ts` only | ✓ | import audit; no `spine.ts` in the bundle |
| Never calls `.rpc()` | ✓ | UI-6: only `projection_*` reached the bridge |
| React never derives state | ✓ | UI-3: every rendered state equals `responsibility_state()` in SQL |
| React never derives membership | ✓ | UI-4: rendered membership ≡ `responsibility_feed('{}')`; every band a subset |
| React never derives counts | ✓ | UI-5: displayed counts equal `envelope.counts` |
| React never derives risk / actions / readiness | ✓ | risk read from `envelope.data.risk`; no action surface exists |
| One coherent snapshot | ✓ | UI-6b: exactly one projection request per render |
| Read-only | ✓ | UI-6: evidence/ownership/obligation fingerprint unchanged |
| Ownerless never shrinks | ✓ | **UI-2**, the primary gate |
| Refusal ≠ empty ≠ transport | ✓ | UI-8a/8b |
| Identity never fabricated | ✓ | UI-9c |
| No trusted tenant ⇒ whole projection refuses, zero bands | ✓ | UI-9a |
| Tenant isolation holds at the database, independently of the client | ✓ | UI-9b |
| Label pack is presentation only | ✓ | UI-7 |
| No shell chrome mounted | ✓ | no tray, omnibox, rail, search, department nav |
| Legacy consumers untouched | ✓ | regression: all legacy runners unchanged |

---

## 3 · Browser acceptance — **13 PASS / 0 FAIL, against live Postgres**

`accept-today.mjs` creates a disposable database (`createdb -T ec
ec_today288`), seeds real truth, executes the **real** projection functions,
and mounts the **real** component. Dropped afterwards; verified 0 remaining.

| Claim | Result |
|---|---|
| **UI-1** live end-to-end, no fixtures | PASS — page `truth_version` matched the value SQL independently returned |
| **UI-2** ownerless completeness *(primary gate)* | PASS — Nobody's band ≡ `feed({"unowned":true})`, and rendered row count equals it |
| **UI-3** no client-derived state | PASS — each rendered state compared against `responsibility_state()` per row |
| **UI-4** no client-derived membership | PASS — page membership ≡ `feed('{}')`; no band invented an id |
| **UI-5** counts equal projection counts | PASS — compared against a live `->'counts'` read |
| **UI-6** zero writes across the sweep | PASS — fingerprint unchanged; only `projection_*` calls made |
| **UI-6b** one envelope per render | PASS — exactly 1 projection request |
| **UI-7** label pack presentation-only | PASS — Pulls→Warehouse; membership, state, order identical |
| **UI-8a** genuine SQL refusal | PASS — real `PROJECTION_FILTER_INVALID` from Postgres; zero bands rendered |
| **UI-8b** transport failure distinguished | PASS |
| **UI-9a** no trusted tenant | PASS — whole projection refuses `TENANT_UNRESOLVED`; zero bands, zero rows, **zero projection requests issued** |
| **UI-9b** anonymous read empty at the DB | PASS — `projection_operations_today` and `responsibility_feed` both return 0 rows anonymously |
| **UI-9c** trusted tenant, unresolved viewer | PASS — My Work refused; tenant bands rendered |

**On UI-1's honesty.** A browser cannot open a Postgres socket, so the
*transport* is substituted (`live-supabase.ts` proxies to the runner, which
runs `psql`). Everything else is real: the component, `feed.ts`, `client.ts`,
`state.ts`, `labels.ts`, and the SQL functions themselves. No projection value
is fabricated anywhere — each assertion cross-checks the page against an
independent live query.

---

## 4 · Regression

```
SQL      : 421 PASS / 0 FAIL   (unchanged — zero SQL touched)
residue  : 0 (ec ≡ eczr fingerprint)
tsc      : v281 · v283 · v284 · strictcheck · deploycheck — all CLEAN
browser  : 259 PASS / 0 FAIL across 26 certified runners · 0 zero-emission
           (floor rose 246 → 259; +13 from accept-today)
           accept-regression 14 PASS / 1 FAIL — unchanged, still quarantined
unit     : 20 PASS / 0 FAIL
```

`deploycheck` was widened this slice to cover **all** application code (was
`src/lib/projection` only), so the new component is gated at the deployment
build target too.

---

## 5 · A harness finding worth carrying forward

The first live run failed with `PAGEERROR: supabaseUrl is required` — the real
Supabase client was being loaded despite the alias. Cause: the harness
convention aliases **`@/lib/supabase`**, but much of `src/lib` imports
**`"./supabase"` relatively** (`permissions.ts`, `capabilities.ts`,
`configureSupabase.ts`, and ~10 more). A relative import silently bypasses the
alias.

Corrected in `accept-today.mjs` to intercept every path that resolves to the
client. **Registered as shared test-infrastructure debt — TID-1**, so future runners
do not each rediscover it:

> **TID-1 · Supabase transport interception is incomplete in every harness.**
> Harnesses alias only `@/lib/supabase`. At least a dozen `src/lib` modules
> (`permissions.ts`, `capabilities.ts`, `configureSupabase.ts`,
> `componentGallery.ts`, `designResolver.ts`, `automation.ts`, `photoData.ts`,
> `blueprintGuideSupabase.ts`, `blueprintInstantiateSupabase.ts`,
> `productionLensSupabase.ts`, `componentBackfill.ts`, …) import
> `"./supabase"` relatively and therefore bypass the alias, loading the real
> client and failing with `supabaseUrl is required` — a message that gives no
> hint the cause is aliasing.
>
> Existing harnesses pass only because their component trees happen not to
> reach those modules. **Any harness that does will hit this.**
>
> **Remedy (not applied here — it would modify existing runners, which v288
> forbids):** extract the interception into one shared
> `browser-tests/alias-plugin.mjs` exporting the esbuild plugin used by
> `accept-today.mjs`, which catches every path resolving to the client
> (`@/lib/supabase`, `./supabase`, `../supabase`, `../lib/supabase`), and have
> every runner import it. Schedule as its own test-infrastructure slice with a
> full browser regression.

---

## 6 · Known limitations

1. **The Changed band is empty — RULED, and the correction is registered as
   v288a.** No canonical operational window exists in
   `projection_operations_today`: `p_since` is a caller-supplied timestamp with
   no SQL-side default. Populating the band would have required persisting a
   last-viewed marker (forbidden) or deriving a window client-side (React
   deriving an operational boundary, forbidden). Neither was done: `p_since` is
   `null` and the band renders present-and-empty with the reason on screen.
   The refusal to invent `p_since` is confirmed correct. **No client-derived
   time and no persistence will be added.** The fix is a bounded projection
   correction — **v288a**, scoped in `docs/v288a_REGISTERED_CORRECTION.md` —
   and **Event Command equivalence (v289) does not begin until v288a is
   certified.**
2. **No shell.** No ceremony tray, omnibox, command rail, search, or department
   navigation — the tray in particular implies writes.
3. **Read-only.** Claiming, assigning, evidence capture and dispatch are later
   slices.
4. **`/today` is not linked from navigation.** Reaching it means typing the
   URL. Adding it to the Sidebar would modify an existing surface, which this
   slice forbids.
5. **Risk badges show findings, not remedies** — no action affordances exist,
   by design.
6. **DEBT-1 / DEBT-2 unchanged** (v287c §11a): `EventWorkspace` still infers
   evidence kind from `c.state`, and the v275 vocabulary still reaches legacy
   clients. Both belong to v289 equivalence, untouched here.

---

## 7 · Deployment instructions

No migration. Application code only.

```
src/app/today/page.tsx
src/components/today/OperationsToday.tsx
```

The route is live at `/today` once deployed. **It requires a trusted
authenticated tenant.**

- **No trusted tenant** — signed out, no active `tenant_users` membership, no
  tenant bound to the session, or the session is unavailable: the projection
  **refuses** (`TENANT_UNRESOLVED`), **no operational bands render**, and no
  projection request is issued.
- **Trusted tenant, viewer identity unresolvable:** **My Work refuses** while
  the general tenant bands continue to render.

The refusal is deliberate rather than an empty result: an unauthenticated read
would return an empty envelope from SQL, and presenting that as "an empty day"
would misreport an untrusted read as a statement about the tenant's work.

Verify:
```bash
./node_modules/.bin/tsc -p tsconfig.deploycheck.json                    # clean
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-today.mjs   # 11 PASS
```

The acceptance runner requires a local Postgres with the full chain applied; it
creates and drops its own disposable database.

---

## 8 · Certification statement

**Constitutional compliance.** R-3 (no client-side lifecycle state — UI-3),
R-9 (projections non-authoritative; the surface writes nothing — UI-6),
R-13 (presentation never changes membership — UI-4, UI-7), R-5 (no task object,
no task state), R-10 (no AI surface), R-7 (no completion path exists, so
discharge cannot be faked from the UI).

**Change review.** No SQL altered. v287a, v287b and v287c frozen and unmodified.
No existing component, library module, proof or browser runner changed. The
only pre-existing file consumed is `src/lib/permissions.ts` (read-only use of
`loadSession()`).

**Certification floors.** All held; browser floor increased by the new runner.
No proof was modified, no assertion weakened, no quarantine changed.

**The success criterion, certified.** EventCore has one production screen —
`/today` — whose entire operational understanding (membership, state,
ownership, counts, risk) originates in the constitutional projection
architecture. It does not bypass it (no `.rpc()`, no `spine.ts`), does not
reconstruct it (UI-3, UI-4, UI-5), and does not mutate it (UI-6).

---

**v288 — DEPLOYABLE and FROZEN**, with the pre-freeze corrections above
applied: precise change scope (§1), tenant trust model implemented and proven
(§1, UI-9a/9b/9c), the Changed-band ruling recorded and its fix registered as
**v288a**, and the harness gap registered as **TID-1**.

**Sequencing:** v289 (Event Command equivalence) **does not begin until v288a
is certified.** Neither has been started.
