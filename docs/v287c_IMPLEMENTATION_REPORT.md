# EventCore v287c — Projection Client
## Implementation Report · Certification

**Slice.** Entirely application code. `src/lib/projection/` becomes the only
application interface for operational reads. No product UI, no Operations Today
screen. v287a and v287b are frozen and were not modified — **zero SQL changes
in this slice.**

**Verdict: v287c — DEPLOYABLE.** Stopping before Operations Today UI.

---

## 1 · What was built

```
src/lib/projection/
  types.ts    — the ONE definition of a projected responsibility for all of React
  client.ts   — typed, version-aware, envelope-aware rpc seam + refusal normalization
  feed.ts     — typed wrappers per certified projection + band/column resolvers
  labels.ts   — label packs (Application Shell §10)
  state.ts    — PURE presentation: glyph, tone, class, ordering, grouping
```

Following the established pure/data split: `state.ts` and `labels.ts` are pure
and DB-free (unit-testable with no database); `client.ts` and `feed.ts` are the
data half. Components never call `.rpc()` — they import `feed.ts`.

Plus verification:

```
browser-tests/projection.harness.tsx  — fixtures through the REAL modules
browser-tests/projection.html
browser-tests/accept-projection.mjs   — 18 browser claims
browser-tests/unit-projection.mjs     — 20 runnable unit claims (no browser, no DB)
```

---

## 2 · State discipline — the central constraint

**No TypeScript in this slice derives lifecycle state.** Every displayed state
arrives already computed by `responsibility_state()` through the projection and
is carried, never recomputed.

- `types.ts` declares `state` as a carried field with the constitutional seven
  as its only legal values.
- `state.ts` functions all take an *already-projected* state and answer only
  presentation questions. If any of them ever needed to inspect timing,
  ownership or evidence to decide a state, that would be exactly the drift the
  projection layer exists to prevent.
- `feed.ts` band and column resolvers are **lookups over ids the SQL projection
  already decided** — never client-side re-filtering. Re-filtering would
  reintroduce the membership drift PRJ-10 exists to prevent.
- `isResponsibilityState()` rejects the v275 vocabulary (`blocked`,
  `exception`, `invalidated`) explicitly — proven in U-3.

The client may sort, group, label, format and decorate. It may not reinterpret
truth, and the tests assert that at every level.

---

## 3 · Label packs

All user-facing terminology resolves through `labels.ts`. Two packs ship —
`catering` (default: Prep · Pulls · Routes · Roster) and `generic`
(Production · Warehouse · Deliveries · Staffing) — and `registerLabelPack()`
accepts more without touching a component. Departments, evidence verbs, state
words, risk phrasing and surface titles all live in the pack.

**Constitutional keys never change.** U-12 and P-12 both prove a pack swap
changes every word while the underlying key (`equipment`) and every projected
state are untouched. R-13 is what makes this safe: renaming a department is
presentation and can never create, destroy or alter a responsibility.

---

## 4 · Envelope and refusal handling

`assertEnvelope()` enforces shape, projection name, and version, each with its
own refusal code:

| Violation | Code |
|---|---|
| not an envelope | `PROJECTION_SHAPE_INVALID` |
| wrong projection returned | `PROJECTION_NAME_MISMATCH` |
| unsupported shape version | `PROJECTION_VERSION_UNSUPPORTED` |

Version awareness is deliberate: a surface pinned to v1 must **fail loudly**
rather than silently render a shape it does not understand.

`normalizeRefusal()` maps server refusals to typed codes
(`PROJECTION_FILTER_INVALID`, `OWNERSHIP_CONFLICT`, `RESP_EDIT_REFUSED`, …)
while preserving the raw text, so a surface can branch on a code instead of
matching message strings.

`as_of`, `counts` and `provenance.truth_version` are **carried, never
manufactured** (P-6).

---

## 5 · Verification

### Browser — `accept-projection.mjs`: **18 PASS / 0 FAIL**
Renders fixtures through the real client modules in Chromium, no SQL.

| Claim | Proves |
|---|---|
| P-1…P-4 | envelope accepted; version, name and shape violations each refused by code |
| P-5 | server refusal normalized to a typed code with a clean message |
| P-6 | SQL-owned `truth_version` and counts carried, not recomputed |
| P-7 | the seven-glyph state language renders from the projected state |
| P-8 | **the client never computes state** — every row renders what SQL supplied, and every value is inside the seven |
| P-9 | risk decorates without altering state (discharged stays discharged; derived stays derived) |
| P-10 | event-level findings kept separate from row findings |
| P-11 | catering pack supplies departments, verbs, state words |
| P-12 | a pack swap changes every word and **nothing else** — ordering and states unchanged |
| P-13 | sorting changes reading order only, never membership |
| P-14 | grouping partitions every row exactly once, in **every** mode |
| P-15 | group keys labelled through the pack; the key itself unchanged |
| P-16, P-17 | bands resolve from the same envelope; the ownerless band matches the envelope's own count — the debt list cannot shrink in the client |
| P-18 | Event Command columns keyed by constitutional state |

### Unit — `unit-projection.mjs`: **20 PASS / 0 FAIL**
The repository has **no configured test runner** (`npm test` exits 1), so
existing `.test.ts` files are type-checked but never executed. Rather than add
nominal tests, this slice ships a runnable harness that bundles the real
modules with esbuild and executes them in-process:

```
node browser-tests/unit-projection.mjs
```

U-1…U-10 cover state helpers (distinct glyphs, totality, v275-vocabulary
rejection, sort/group membership invariance, non-mutation, ownerless sentinel,
risk indexing, severity ranking); U-11…U-15 cover label packs; U-16…U-20 cover
envelope validation, refusal normalization and filter serialization.

**U-20 found a real defect during this slice.** `isEnvelopeLike` used
`"data" in o`, which accepts a key present with an `undefined` value. The guard
was tightened to `o.data !== undefined` — the assertion was **not** weakened to
match the implementation.

---

## 6 · Regression

```
SQL      : 421 PASS / 0 FAIL   (v287b floor held EXACTLY — zero SQL changed)
residue  : 0 (ec ≡ eczr fingerprint)
tsc      : v281 / v283 / v284 / strictcheck — all CLEAN
           deploycheck (es5, deployment-equivalent) — CLEAN, 0 errors
browser  : 246 PASS / 0 FAIL across 25 certified runners · 0 zero-emission
           (floor rose 228 → 246; +18 from accept-projection)
           accept-regression 14 PASS / 1 FAIL — unchanged, still quarantined
unit     : 20 PASS / 0 FAIL
```

No existing runner changed. No existing proof modified. No SQL touched.

---

## 6b · POST-RELEASE DEFECT — deployment build failure (fixed)

**Reported.** A production `next build` failed:
`Type 'MapIterator<[string, string[]]>' can only be iterated through when using
the '--downlevelIteration' flag` at `src/lib/projection/state.ts:105`.

**Root cause — a verification blind spot, not a logic error.** `groupRows()`
spread a `Map` iterator (`[...map.entries()]`). Every config I verified
(`tsconfig.v281/v283/v284/strictcheck.json`) targets **es2020**, where that is
legal. The deployment `tsconfig.json` targets **es5**, and **that file does not
exist in this repository** — it lives only in the deploy tree. So the entire
type-check suite was structurally incapable of catching this class.

**Fix.** `groupRows()` rewritten iterator-free (plain record + key array +
indexed loop). Target-agnostic, and narrower than enabling
`downlevelIteration`, which would change emitted output for the whole
application to accommodate one helper. Behaviour is unchanged: U-7, U-8, P-14
and P-15 (grouping partitions every row exactly once, in every mode) all still
pass.

**Permanent gate.** `tsconfig.deploycheck.json` now reproduces the deployment
build — es5, no `downlevelIteration`, `__tests__` excluded exactly as
`next build` excludes them — and is recorded as Rule 5 in
`SQL_RELEASE_CONVENTIONS.md`.

**Tree-wide audit at the deployment target.** 21 further TS2802 occurrences
exist, and **all 21 are in `src/lib/__tests__/`** (`[...set]`,
`[...str.matchAll()]`, `[...map]`). Next.js does not build those files, which
is exactly why only the projection module broke the build. **Application code
is clean at the deployment target: 0 errors.** The test-file occurrences are
recorded, not fixed — they are inert for deployment, and rewriting twenty
untouched legacy test files to chase a non-building defect would risk the
certified floor for no deployment gain.

---

## 7 · A harness finding worth recording

`accept-projection` initially failed P-14/P-15 with a `waitForSelector`
timeout, and the cause is worth carrying forward: **Playwright's
`waitForSelector` defaults to `state: "visible"`**, and the grouping list is an
attribute carrier whose `<li>` elements have no text. Under the real compiled
Tailwind stylesheet, preflight resets list padding and the element collapses to
zero size — therefore "not visible", therefore never matched. A probe with an
empty stylesheet passed, which is what made it look like a logic fault.

Corrected to `{ state: "attached" }`, which is the honest wait for an element
whose purpose is to carry data attributes rather than to be seen. This is the
same class of issue as the earlier `app.css` finding: an empty stylesheet is
not a neutral stand-in for the real one.

---

## 8 · Known limitations (deliberate, in scope)

1. **No product UI.** Operations Today, department surfaces and mobile are
   later slices. The harness is a test fixture, not a screen.
2. **No search client** — `projection_search` does not exist yet (v287d).
3. **`spine.ts` / `EventWorkspace.tsx` untouched.** They still speak the v275
   vocabulary; migrating that consumer remains its own slice, per the standing
   ruling that `event_workspace` stays until equivalence is certified.
4. **`labels.ts` holds an active-pack singleton** set at boot. Per-tenant packs
   in a multi-tenant client session would need it lifted into context; not
   needed until a surface exists.
5. **No localization layer yet** — the pack model is the seam that will accept
   one without component changes.

---

## 9 · Deployment

No migration. Application code only.

```
src/lib/projection/{types,client,feed,labels,state}.ts
browser-tests/{projection.harness.tsx,projection.html,accept-projection.mjs,unit-projection.mjs}
```

Verify:
```bash
node browser-tests/unit-projection.mjs                                   # 20 PASS
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-projection.mjs   # 18 PASS
```

---

## 10 · Certification statement

**Constitutional compliance.** R-3 (no client-side lifecycle state — proven by
P-8 and U-3), R-9 (the client reads projections and never writes), R-13
(sorting, grouping and relabelling proven not to change membership — P-13, P-14,
P-12, U-4, U-7), R-5 (no task object), R-10 (no AI surface). Only the
constitutional seven states are representable.

**Change review.** No SQL was altered. v287a and v287b remain frozen. No
existing component, library module, proof or browser runner was modified.

**Explicit statements.**
- No constitutional invariant was weakened.
- The Constitution, Product Architecture 1.0, Application Shell 1.0 and the
  Projection Architecture were **not** reopened.
- No assertion was weakened to obtain green; one implementation defect found by
  U-20 was fixed in the implementation.
- No Operations Today UI, department UI, mobile surface or search was built.

---

**v287c — DEPLOYABLE.** Stopping for review. v287d (search projection) and the
first Responsibility-based surface await direction.
