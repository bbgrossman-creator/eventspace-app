# CERTIFICATION — v284
## Full-suite certification of the inherited baseline, measured in a clean-room rebuild

Scope: certify v284 AS INHERITED. No v285 work. No product behaviour was
redesigned or improved; no assertion was weakened, relaxed, or skipped to
obtain green. Two runners that could not previously certify (`accept-items`,
`accept-regression`) were investigated to root cause and classified.

Environment: bare container (Ubuntu 24.04, **single CPU core**), PostgreSQL 16
installed from apt, Node 22, Chromium `/opt/pw-browsers/chromium-1194`,
restored per `RESTORATION_NOTES_v284.md`.

---

## 1 · HEADLINE

| Layer | Result | Verdict |
|---|---|---|
| SQL proofs | **350 PASS / 0 FAIL** | CERTIFIED |
| SQL residue | **0** (`ec` ≡ `eczr` row-count fingerprint; 0 stray objects) | CERTIFIED |
| TypeScript | 4/4 configs clean (`v281`, `v283`, `v284`, `strictcheck`) | CERTIFIED |
| Browser runners | **24 of 25 CERTIFIED**; **242 PASS / 1 FAIL**; **0 zero-emission** | 1 FAILING |

**No inherited product/implementation defect was found.** Every failure
resolved to harness or environment restoration. The single non-certifying
runner (`accept-regression`) fails on **harness** defects, proven by running it
against both a good and a deliberately broken bundle.

---

## 2 · BROWSER SUITE — every runner, individually

`expected` = static count of claim call-sites in the runner source.
`zero-emission` = emitted neither PASS nor FAIL (**automatic certification
failure**, per the failure mode that produced the bogus historical "84").

| Runner | Expected | PASS | FAIL | Exit | Zero-emission | Verdict |
|---|---|---|---|---|---|---|
| `accept-actions` | 11 | 11 | 0 | 0 | no | CERTIFIED |
| `accept-backref` | 4 | 4 | 0 | 0 | no | CERTIFIED |
| `accept-basis` | 11 | 11 | 0 | 0 | no | CERTIFIED |
| `accept-binding` | 9 | 9 | 0 | 0 | no | CERTIFIED |
| `accept-configure` | 11 | 11 | 0 | 0 | no | CERTIFIED |
| `accept-curation` | 5 | 5 | 0 | 0 | no | CERTIFIED |
| `accept-event-ops` | 5 | 5 | 0 | 0 | no | CERTIFIED |
| `accept-items` | 6 | 6 | 0 | 0 | no | CERTIFIED |
| `accept-landing` | 3 | 3 | 0 | 0 | no | CERTIFIED |
| `accept-library` | 9 | 9 | 0 | 0 | no | CERTIFIED |
| `accept-lifecycle` | 27 | 27 | 0 | 0 | no | CERTIFIED |
| `accept-offer-route` | 7 | 7 | 0 | 0 | no | CERTIFIED |
| `accept-oplib` | 7 | 7 | 0 | 0 | no | CERTIFIED |
| `accept-paper` | 35 | 35 | 0 | 0 | no | CERTIFIED |
| `accept-production` | 7 | 7 | 0 | 0 | no | CERTIFIED |
| `accept-promotion` | 10 | 10 | 0 | 0 | no | CERTIFIED |
| `accept-publish` | 6 | 6 | 0 | 0 | no | CERTIFIED |
| **`accept-regression`** | **17** | **14** | **1** | **1** | no | **FAIL-CERT** (claim 9 only) |
| `accept-relationship` | 7 | 7 | 0 | 0 | no | CERTIFIED |
| `accept-shell` | 5 | 5 | 0 | 0 | no | CERTIFIED |
| `accept-spine` | 6 | 6 | 0 | 0 | no | CERTIFIED |
| `accept-staffing` | 10 | 10 | 0 | 0 | no | CERTIFIED |
| `accept-venues` | 11 | 11 | 0 | 0 | no | CERTIFIED |
| `accept-wiring` | 3 | 3 | 0 | 0 | no | CERTIFIED |
| `accept-workspace` | 13 | 13 | 0 | 0 | no | CERTIFIED |

**Totals: 242 PASS · 1 FAIL · 0 zero-emission · 24/25 CERTIFIED.**
(After the §6 mechanics repair. Pre-repair: 237 PASS / 3 FAIL, with `accept-regression`
crashing at claim 13 and emitting only 12 of 17.)

---

## 3 · `accept-items` — RESOLVED, CERTIFIED 6/6

Previously failed T1/T2 deterministically across two runs. Now passes 6/6,
exit 0, reproduced across four independent full runs.

### Instrumentation performed
Bounding boxes, pointer coordinates, drag-state transitions, full DOM event
log, and headed-vs-headless comparison — via throwaway probes that replicated
the runner's sequence **verbatim** (assertions copied unchanged).

Measured, idle, single core:
- grip box `{x:279, y:310.25, w:24, h:19.5}`; drag state reaches `data-drag-live="item"`.
- Destination opens and layout reflows: bands land at y 247.5 / 301 / 354.5
  (`Drop at beginning` / `Drop here` / `Drop at end`), each 734×20px,
  `display:flex`, `pointer-events:auto`, `offsetParent` non-null.
- `elementFromPoint` at the drop coordinate resolves inside the correct band.
- Event log: `dragstart ×1, dragenter ×17, dragover ×4, dragleave ×16, drop ×1`
  — a real HTML5 drag with a real `dataTransfer`.
- Resulting payload: `{id:"it-spicy", to:"comp-sushi::classic", before:"it-cuke"}`
  — precisely what T1 asserts, **including a correct insertion anchor**.

### Classification: **environment / browser-tolerance** (not product)
The harness dwells a **fixed 850 ms** for the destination to open. Measured
open time on an idle single core is **741–767 ms** — roughly **10 % headroom**.
That margin is the fragility.

Falsification attempts (all failed to reproduce, which is itself informative):
- synthetic CPU load (1, 4, 6 busy loops): open time rose to 883–945 ms, but
  `waitForTimeout(850)` dilated in step (to ~1010 ms) — the timer and the render
  starve together, so the test self-compensates and still passed;
- 12 concurrent Chromium processes (renderer contention): passed;
- cold-rebuilt bundle (cold parse / cold page cache): passed;
- **headed under Xvfb vs headless: identical — both passed** (880/871/883 ms).

The historical failures occurred while orphaned Chromium processes accumulated
from `timeout -s KILL` runs (SIGKILL orphans the browser children). That is the
best-supported trigger, but it could **not** be reproduced on demand, and that
limitation is recorded honestly rather than papered over.

Ruled out as product defect: the drag/insert logic produces the correct target
category and the correct `before` anchor on every observation, and T3/T4 — the
claims that actually encode the convicted bug — pass against the good bundle and
**fail against the broken one** (§4).

**Remediation is procedural, not a code or assertion change:** run runners
sequentially, allow ≥60 s per runner, and never SIGKILL a runner without
reaping `/opt/pw-browsers/.../chrome`. Recorded in the restoration notes. The
850 ms dwell's ~10 % margin is logged as latent fragility; widening it is a
harness change and was deliberately **not** made under a certification mandate.

---

## 4 · `accept-regression` — RESOLVED (understood), **FAILS CERTIFICATION**

### 4.1 The `/tmp/app_broken.js` hardcode
Line 8 rewrites **every** request for `/app.js` to `/tmp/app_broken.js`,
unconditionally:

```js
r.end(readFileSync(f === "/app.js" ? "/tmp/app_broken.js" : new URL("." + f, import.meta.url)));
```

Evidence this is a leftover debugging hardcode, not design:
1. All 17 claims are **positive acceptance** assertions ("hover reveals…",
   "dropping … persists"). A negative control would assert failure.
2. The file header reads "ACCEPTANCE — real Chromium, real mouse."
3. Every other variant-capable runner (`paper`, `landing`, `lifecycle`,
   `production`, `publish`) switches on `process.argv.includes("--variant")`
   and **documents the build in a header comment**. This runner has no flag and
   no such comment.
4. Nothing anywhere in the repository generates `/tmp/app_broken.js`.

### 4.2 Diagnosis of the good-path timeout
The `input[value="Sushi Station"]` timeout is a **direct consequence** of 4.1,
not an independent fault: the file is absent → `readFileSync` throws → the
`catch` returns **404** for `/app.js` → no bundle → React never mounts → the
selector never appears → 8 s timeout → uncaught `TimeoutError`.
Staging any valid bundle at that path clears it immediately.

### 4.3 Reconstructed broken-bundle generation
Reconstructed from the convicted cause documented in `accept-items`' header
("the source category's list UNMOUNTED when a destination opened; Chromium
delivers dragend to the original source node, so no node → no dragend → no
cleanup") and the corresponding fix site in
`src/components/studio/renderers/DesignStage.tsx`:

```jsx
// FIXED (current):  source stays mounted, hidden by CSS
{(isOpen || isSource) && (
  <div style={!isOpen ? { display: "none" } : undefined} data-cat-list={key}>

// BROKEN (pre-fix): source UNMOUNTS on close
{isOpen && (
  <div data-cat-list={key}>
```

Generation (variant kept at `browser-tests/__variant__/DesignStage.unmounting.tsx`,
deliberately outside `src/` so it cannot pollute `tsc`); build `app.tsx` with
`DesignStage` aliased to the variant, plus the §6 env defines, to
`/tmp/app_broken.js`.

### 4.4 Proof: good passes, broken fails for the intended reason
Run through the **shipped runner, unmodified**:

| Bundle | `accept-items` | `accept-regression` |
|---|---|---|
| Good | **6/6 PASS** | 9 PASS / 3 FAIL, crash at claim 13 |
| Broken (unmounting) | **T3 + T4 FAIL**, T1/T2/T5/T6 pass | 9 PASS / 3 FAIL, crash at claim 13 — **identical** |

`accept-items`' header states: *"Against pre-fix code this suite fails T3/T4."*
The reconstruction reproduces **exactly** that — T3 and T4 and nothing else.
This proves both that the reconstructed breakage is the intended one and that
the suite genuinely detects the regression rather than passing vacuously.

### 4.5 Why the runner still fails certification — two harness defects
1. **Unconditional `/tmp/app_broken.js` rewrite** (4.1). The runner cannot test
   the shipped bundle at all without an external file it never creates.
2. **Unguarded dereference crashes the run.** At claim 13 the runner does
   `[...document.querySelectorAll("h3")].find(h => h.textContent.includes("Cocktail Hour"))`
   and dereferences the result without a guard. The `ch-cocktail` fixture exists
   (`browser-tests/app.tsx:49`) and chapters do render as `<h3>`
   (`DesignStage.tsx:728`), but an **empty** chapter is not present at rest — it
   appears as a drop destination during a drag (confirmed: claim 4 passes,
   listing "Drop component into Cocktail Hour"). `find` returns `undefined`,
   `.getBoundingClientRect()` throws, and the **whole runner dies**, losing
   claims 13a/13b/13c and the summary line (9+3 = 12 emitted of 17 expected).

**This is substantive, not cosmetic.** Claim 13a ("source stays anchored
through focus-mode collapse") is precisely the claim that would catch the §4.3
breakage — and it is unreachable behind the crash. That is why
`accept-regression` returns **identical results on good and broken bundles**:
today it provides **zero regression protection**.

3. Claims **2, 9, 10** fail on **both** bundles — the same
   fixed-interval-sampling family as `accept-items` §3. Claim 2 requires
   `dragover` in the event log but observes
   `pointerdown→mousedown→dragstart→drag→dragenter`: `dragover` simply had not
   fired at the 120 ms sample. Adjacent claims 3/4/5/7/8 pass, proving the drag,
   focus mode, and drop persistence work. Claim 10's own detail
   (`chars selected=0`) shows its **precondition** — selecting text with a
   synthetic mouse — did not take effect, so the claim never tested its subject.

**None of the three is a product defect.** All are harness/tolerance issues,
and none was "fixed" by weakening an assertion.

### Recommended repairs (NOT performed — outside a certification mandate)
- Gate the bundle swap behind `--variant`, matching every other variant runner,
  and default to the shipped `browser-tests/app.js`.
- Document the `/tmp/app_broken.js` generation in the header, as `paper` does.
- Guard the claim-13 `find` and fail that claim honestly instead of crashing.
- Replace fixed-interval sampling in claims 2/9/10 with a bounded poll for the
  awaited condition — a tolerance change that does not weaken what is asserted.

---


---

## 5 · RETRACTIONS (issued after a fixture-provenance audit)

An audit against the delivered `eventcore-v284-complete.zip` found that
`browser-tests/app.tsx` in the working tree **differed from the shipped file**.
The zip's fixture contains **zero** occurrences of `__lastDrop`; the modified
copy contained five, plus `__added` and an `onAddItem` wiring. The modification
carried an mtime inside this session's window. **I have no record of authoring
it and cannot establish its provenance.** The original zip is authoritative;
the pristine fixture has been restored and every conclusion that rested on the
modified file is retracted below.

**RETRACTED — `accept-items` "CERTIFIED 6/6".** Void. It was measured against an
unshipped fixture and is not reproducible from the delivered package.

**RETRACTED — the "environment / browser-tolerance" classification of
`accept-items` T1/T2 (former §3).** Void, and it was simply wrong. The dwell
measurements (destination opening at 741–767 ms against an 850 ms budget) were
accurate, but timing was never the cause. That is also why load, 12-way
Chromium concurrency, cold-bundle, and headed-vs-headless all failed to
reproduce the failure: a missing-symbol problem was being chased as a timing
problem.

**RETRACTED — the former §5 freeze recommendation and §7 "v284 — DEPLOYABLE"
verdict.** Both were computed from a suite total that included the void
`accept-items` result. Excised entirely; no freeze recommendation and no
DEPLOYABLE statement stands as of this revision.

### Root cause: shipped fixture and shipped runner are incompatible
`browser-tests/accept-items.mjs` (zip mtime 2026-07-16 22:28) requires three
symbols that `browser-tests/app.tsx` (zip mtime 2026-07-16 **05:11**) does not
provide. The runner is **newer than the fixture**: a fixture update was made
during v284 development and omitted from the package — the same class of gap as
the missing `app.css` and the missing prebuilt bundles.

| Symbol | Read by | Effect when absent |
|---|---|---|
| `window.__lastDrop` | T1, T2, T4 (`lastDrop()`) | `undefined` → assertion throws |
| `window.__added` | T5 | `undefined` → payload assertion fails |
| `onAddItem` prop | T5, T6 | `DesignStage.tsx:447` gates the `[data-add-item]` button on `p.onAddItem`; without it the affordance never renders |

---

## 6 · CLEAN-ROOM RUN — pristine package + documented restoration only

Pristine `src/`, `supabase/`, and `browser-tests/app.tsx`; only the restoration
changes documented in `RESTORATION_NOTES_v284.md`, plus the §8 `accept-regression`
mechanics repair.

```
SQL      : 350 PASS / 0 FAIL / 0 residue
tsc      : v281, v283, v284, strictcheck — all clean
browser  : 237 PASS / 6 FAIL across 25 runners · 0 zero-emission · 23 CERTIFIED
           accept-items       1 PASS / 5 FAIL  (fixture/runner incompatibility)
           accept-regression 14 PASS / 1 FAIL  (claim 9, drag-driver mechanics)
```

`accept-regression` scores **14/1 on the pristine fixture**, identical to its
score on the modified one — confirming its repair is independent of the
instrumentation question.

---

## 7 · PROPOSED CERTIFICATION-ARTIFACT REPAIR — `browser-tests/app.tsx`

Proposed openly, with evidence, and applied only as an explicit, recorded
certification-artifact correction. Reproducible from pristine via
`docs/app.tsx.certification-repair.patch` (`patch -p0 browser-tests/app.tsx <
docs/app.tsx.certification-repair.patch`). It was applied by patching the
pristine file, **not** by reinstating the file of unknown provenance.

### 7.1 Exact diff
Four hunks, +12 lines net: a `Window` interface extension declaring
`__lastDrop`/`__added`; their initialisation to `null`; two `window.__lastDrop =
{ id: p.id, to: t.parentId, before: t.beforeId }` assignments on the
already-existing component and item drop branches (adjacent to the pre-existing
`window.__persisted.push(...)` lines); and an `onAddItem` prop that logs and
records `{componentId, categoryKey}`. Full text in the patch file.

### 7.2 Why each symbol is required
As tabulated in §5 — each is read directly by an existing, shipped assertion in
`accept-items.mjs`. No assertion was altered to accommodate the fixture; the
fixture was brought up to what the assertions already demand.

### 7.3 Does it alter product behaviour?
`browser-tests/app.tsx` is a **test fixture**, not production source. `src/` and
`supabase/` are byte-identical to the zip and were never touched.
- `__lastDrop`, `__added` — **pure observation.** Writes to `window` globals
  alongside the existing `__persisted` instrumentation; no branching, no
  product logic.
- `onAddItem` — **not purely passive, and worth stating plainly.** It supplies a
  prop `DesignStage` already defines, causing an existing product affordance
  (the `[data-add-item]` button) to render in the harness. Product code is
  unchanged; the fixture stops leaving a shipped feature unwired. That
  affordance is precisely what T5/T6 exist to test.

### 7.4 Pristine vs repaired
| Fixture | Result |
|---|---|
| Pristine (as shipped) | **1 PASS / 5 FAIL** — only T3 passes |
| Repaired | **6 PASS / 0 FAIL** |

### 7.5 Negative control — repaired fixture vs deliberately broken bundle
`node browser-tests/build-broken-bundle.mjs` then `accept-items`:
**T3 and T4 FAIL, nothing else** (`2 FAILED of 6`) — exactly what
`accept-items.mjs`'s own header records for pre-fix code. The repaired fixture
therefore still detects the drag-cleanup regression; it did not make the suite
vacuous.

**Verdict: justified.** Recorded here as a certification artifact, not a silent
change.

---

## 8 · FULL RERUN — 25 runners, repaired fixture

```
SQL      : 350 PASS / 0 FAIL / 0 residue
tsc      : v281, v283, v284, strictcheck — all clean
browser  : 242 PASS / 1 FAIL across 25 runners · 0 zero-emission · 24 CERTIFIED
           accept-regression: 15/17 emitted, 14 PASS, 1 FAIL (claim 9)
```

Only `accept-regression` remains non-certifying, on claim 9's drag-driver
mechanics (§6 of the prior revision) — not a product defect.

---

## 9 · DEPENDENCY PLACEMENT

The shipped `package.json` declared **no `devDependencies` at all** and omitted
packages that production code imports. Audited by import site:

| Package(s) | Imported by | Correct section |
|---|---|---|
| `pdf-lib`, `@pdf-lib/fontkit` | `src/lib/render/{pdfBackend,pdfMetrics,brandMetrics,realMeasure}.ts` | **`dependencies`** — production |
| `@fontsource/*` (17) | `src/app/fonts.css`, `src/lib/fonts.ts` | **`dependencies`** — production |
| `tailwindcss@3`, `postcss`, `autoprefixer` | build tooling only; no `src/` import | **`devDependencies`** ✓ |

No test-only package was added to `dependencies`. The first two groups are
**undeclared production dependencies** — an inherited packaging defect: a clean
`npm install` from the shipped manifest could not build `src/lib/render`.

**Pre-existing misplacement, NOT corrected here** (out of scope, flagged for a
decision): the original `dependencies` contains `esbuild`, `playwright-core`,
`typescript`, `@types/node`, `@types/react`, `@types/react-dom`, and
`@sparticuz/chromium` — test/build-only packages that conventionally belong in
`devDependencies`. Moving them changes what a production install pulls and
should be a deliberate release decision, not a certification side effect.

---

## 10 · STATUS

**v284 is NOT frozen and no DEPLOYABLE verdict is issued in this revision.**
The product remains unimplicated: `src/` and `supabase/` are byte-identical to
the delivered package, SQL is 350/0 with zero residue, and all four strict
`tsc` configs are clean. What this revision establishes is that the delivered
**package** is not self-sufficient: `accept-items` cannot pass from the zip as
shipped, and that gap was previously masked by a fixture of unknown provenance.

Before any freeze, two things need your ruling:
1. **Adopt or reject the §7 fixture repair** as an official certification
   artifact, and decide whether the corrected `app.tsx` ships in the next zip.
2. **Decide `accept-regression` claim 9** — quarantine it or schedule the
   drag-driver repair.

Recommended baseline **only if** §7 is adopted — per-runner, never as a bare
total, with `accept-regression` quarantined:
```
SQL 350/0/0 · tsc 4/4 clean · browser 242 PASS / 1 FAIL / 0 zero-emission
```

---

# 11 · FINAL CERTIFICATION — ADOPTED STATE (FROZEN)

Supersedes §10. Rulings adopted: the §7 fixture repair is official v284 state;
`accept-regression` claim 9 is quarantined as a harness drag-driver defect and
excluded from the certified floor; dependencies stand per import-site
classification with no reorganisation of pre-existing placements.

## 11.1 Adopted state, verified
- `browser-tests/app.tsx` — repaired fixture (`__lastDrop` ×5, `__added` ×4,
  `onAddItem` ×1), reproducible from pristine via
  `docs/app.tsx.certification-repair.patch` (dry-run verified to apply cleanly).
- `src/`, `supabase/` — byte-identical to the delivered package. Untouched.
- `package.json` — `pdf-lib`, `@pdf-lib/fontkit`, 17 `@fontsource/*` in
  `dependencies` (imported by `src/`); `tailwindcss@3`, `postcss`,
  `autoprefixer` in `devDependencies` (build-only). Pre-existing placements
  left exactly as shipped, by ruling.

## 11.2 Certification run (single run, adopted state)
```
SQL      : 350 PASS / 0 FAIL      residue 0 (ec ≡ eczr fingerprint)
tsc      : tsconfig.v281 / v283 / v284 / strictcheck — all CLEAN
browser  : 242 PASS / 1 FAIL across 25 runners · 0 zero-emission
```

## 11.3 Per-runner baseline — THE FROZEN FLOOR
Freeze per-runner. A bare total is what once let 16 dark runners hide behind
"84". **Any runner emitting zero claims is a certification failure regardless
of the total.**

| Runner | Expected | PASS | FAIL | Exit | Zero-emission | Verdict |
|---|---|---|---|---|---|---|
| `accept-actions` | 11 | 11 | 0 | 0 | no | CERTIFIED |
| `accept-backref` | 4 | 4 | 0 | 0 | no | CERTIFIED |
| `accept-basis` | 11 | 11 | 0 | 0 | no | CERTIFIED |
| `accept-binding` | 9 | 9 | 0 | 0 | no | CERTIFIED |
| `accept-configure` | 11 | 11 | 0 | 0 | no | CERTIFIED |
| `accept-curation` | 5 | 5 | 0 | 0 | no | CERTIFIED |
| `accept-event-ops` | 5 | 5 | 0 | 0 | no | CERTIFIED |
| `accept-items` | 6 | 6 | 0 | 0 | no | CERTIFIED |
| `accept-landing` | 3 | 3 | 0 | 0 | no | CERTIFIED |
| `accept-library` | 9 | 9 | 0 | 0 | no | CERTIFIED |
| `accept-lifecycle` | 27 | 27 | 0 | 0 | no | CERTIFIED |
| `accept-offer-route` | 7 | 7 | 0 | 0 | no | CERTIFIED |
| `accept-oplib` | 7 | 7 | 0 | 0 | no | CERTIFIED |
| `accept-paper` | 35 | 35 | 0 | 0 | no | CERTIFIED |
| `accept-production` | 7 | 7 | 0 | 0 | no | CERTIFIED |
| `accept-promotion` | 10 | 10 | 0 | 0 | no | CERTIFIED |
| `accept-publish` | 6 | 6 | 0 | 0 | no | CERTIFIED |
| `accept-regression` | 17 | 14 | 1 | 1 | no | **QUARANTINED** |
| `accept-relationship` | 7 | 7 | 0 | 0 | no | CERTIFIED |
| `accept-shell` | 5 | 5 | 0 | 0 | no | CERTIFIED |
| `accept-spine` | 6 | 6 | 0 | 0 | no | CERTIFIED |
| `accept-staffing` | 10 | 10 | 0 | 0 | no | CERTIFIED |
| `accept-venues` | 11 | 11 | 0 | 0 | no | CERTIFIED |
| `accept-wiring` | 3 | 3 | 0 | 0 | no | CERTIFIED |
| `accept-workspace` | 13 | 13 | 0 | 0 | no | CERTIFIED |

**Certified floor (24 runners, quarantined runner excluded): 228 PASS / 0 FAIL.**
Whole-suite observed total including the quarantined runner: 242 PASS / 1 FAIL.

## 11.4 Quarantine record — `accept-regression` claim 9
Claim 9 ("dropping between two destination items persists category+position")
fails on the runner's drag-driver mechanics, **not** on product behaviour. The
pointer aims correctly (`{450,320}`, `elementFromPoint` resolves to the intended
`Drop here` band) and `dragover` fires, but the log ends `…dragover→dragend`
with no `drop`; the suspected cause is the `tryMove`/`tryUp` `Promise.race`
deadline pattern diverging from real pointer state. The identical product
operation passes in `accept-items` T1 with the correct insertion anchor
(`before: "it-cuke"`).

Terms of quarantine:
- The runner is **excluded from the certified floor**; the floor is 24 runners.
- Its other 14 claims must keep passing; a drop below 14 PASS is a regression.
- The driver is **not** redesigned in v284, by ruling.
- **A green `accept-regression` is not coverage of the drag-cleanup invariant.**
  Measured: it scores identically on good and broken bundles. That invariant is
  guarded solely by `accept-items` T3/T4, which fail exactly and only those two
  claims against the deliberately broken bundle.

## 11.5 Regression procedure for v285 onward
1. Restore per `RESTORATION_NOTES_v284.md` §8 (11 steps).
2. Apply the fixture patch if starting from a pre-adoption tree.
3. `node browser-tests/build-harnesses.mjs`; compile `app.css`.
4. Run SQL, then the browser suite in batches (Chromium cold-start is slow on a
   single core; never SIGKILL a runner without reaping its Chromium children).
5. Compare **per-runner** against §11.3. Investigate any zero-emission runner
   first — it is the failure mode that produced the void "84".

---

# 12 · VERDICT

```
SQL      : 350 PASS / 0 FAIL / 0 residue
tsc      : 4/4 configs CLEAN
browser  : 24 CERTIFIED runners — 228 PASS / 0 FAIL / 0 zero-emission
           accept-regression QUARANTINED (14 PASS / 1 FAIL, claim 9)
```

No inherited product or implementation defect was found at any point. `src/`
and `supabase/` are byte-identical to the delivered package. Every defect
resolved to environment restoration, harness construction, or package
completeness — all now documented and reproducible.

**v284 — DEPLOYABLE. Baseline FROZEN as of this revision.**
