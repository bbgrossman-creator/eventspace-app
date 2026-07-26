# v291 — RESPONSIBILITY DETAIL
## Implementation report · certification · deployment

| | |
|---|---|
| **Baseline** | v290 |
| **Type** | Application only. No SQL, no schema, no build config, no unit runner, no verifier change. |
| **Browser** | **+23 new claims** · 2 v290 claims rewritten to your new nav ruling |
| **SQL floor** | **130 — unchanged** |
| **Schema objects added** | none |

Runner totals after v291:

```
accept-responsibility-detail   20 PASS / 0 FAIL   (new)
accept-department-queue        24 PASS / 0 FAIL   (21 from v290 + 3 added)
accept-operations-shell        11 PASS / 0 FAIL   (2 rewritten, count unchanged)
accept-today                   14 PASS / 0 FAIL   (untouched)
```

---

## 1 · The navigation ruling, resolved

You gave two branches. I checked which one applies before choosing.

`NavItem` is `{ href, label, icon, cap?, perm? }` — **no `children` field** — and
`renderGroup` renders items as leaf `Link`s. The rail supports exactly one nesting
level, and Operations already spends it. A "Departments" subgroup containing five
links would require changing the nav data model and the renderer, which is the
redesign you forbade.

So the second branch would apply — except your first sentence offered a better
route: *"selectable within the Departments surface."* That needs no nav change at
all, so I took it rather than deferring.

**One rail position.** `Operations → Today · Departments`. The five
closed-vocabulary departments are chosen inside the surface via a picker built
from `DEPARTMENT_KEYS` with words from the active label pack.

`/operations/departments` is **not an empty index route**. It is the same
`DepartmentQueue` component with no department chosen: it renders the picker, says
plainly that nothing is read until you pick, and **issues zero projection
requests**. DQ-23 asserts that. Choosing navigates to
`/operations/departments/<key>`, where the picker stays visible with the active
department marked.

Rail positions consumed by Operations: **two**, and it stays two as Day Sheet and
Event Command arrive.

---

## 2 · What shipped

| File | Action |
|---|---|
| `src/lib/projection/types.ts` | `ResponsibilityDetail`, `OwnershipEntry`, `EvidenceEntry`, `ResponsibilityAnchors` |
| `src/lib/projection/client.ts` | `fetchObject<T>()` — object-returning reads |
| `src/lib/projection/feed.ts` | `responsibilityDetail()`, `riskForResponsibility()` |
| `src/components/responsibilities/ResponsibilityDetail.tsx` | new — the surface |
| `src/app/operations/responsibilities/[id]/page.tsx` | new route |
| `src/app/operations/departments/page.tsx` | new — the Departments surface, no department chosen |
| `src/components/departments/DepartmentQueue.tsx` | rows clickable · picker · `choose` outcome |
| `src/components/Sidebar.tsx` | five department entries → one Departments entry |
| `browser-tests/responsibility-detail.{harness.tsx,html}` | new |
| `browser-tests/accept-responsibility-detail.mjs` | new — 20 claims |
| `browser-tests/accept-department-queue.mjs` | +3 claims (DQ-21…23) |
| `browser-tests/accept-operations-shell.mjs` | SH-3, SH-3b rewritten; SH-5, SH-7 adjusted |

**On the client additions.** `responsibility_detail()` returns a **bare jsonb
object**, not an envelope — no `projection`, no `version`, no `counts`, no
`as_of` — so `fetchProjection` would have rejected it through `assertEnvelope`.
`fetchObject` is the third primitive that was missing, alongside
`fetchProjection` (envelopes) and `fetchRows` (set-returning). It also
distinguishes SQL `NULL` from an error: `responsibility_detail()` returns NULL for
anything the tenant cannot see, which is a genuine not-found and is surfaced as
`null` rather than dressed up as an empty detail.

No SQL function was touched. The certified contract is unchanged; v291 typed a
function that was already certified and had no client.

---

## 3 · One call, not two — proven rather than asserted

Your ruling 3 folded Ownership History into v291 and forbade a second request for
the same information. RD-6 proves the two are the same data:

```
responsibility_detail(id) -> 'ownership'   ≡   ownership_history(id)
```

Same table, same tenant filter, same `seq` ordering. RD-6 compares the two
projections field-by-field in SQL and asserts they are identical, then asserts the
rendered entry count equals `ownership_history()`'s row count. RD-3 asserts
`ownership_history` **never reaches the wire**. Between them, "a second call would
be redundant" is a certified claim rather than a design note.

---

## 4 · The v295 ruling, honoured on both sides

Your amended ruling: *a list surface must not claim that assignment evidence
exists unless that fact is explicitly present in its projection envelope.*

The two surfaces have different envelopes, so they get different behaviour:

| Surface | Envelope carries assignment evidence? | Behaviour |
|---|---|---|
| Department Queue | No — `responsibility_feed` has no such column | renders ownership debt **alone**, says nothing about assignment |
| Responsibility Detail | **Yes** — `responsibility_detail().evidence` carries every recorded fact including `assignment` | renders the debt **and** the assignment fact, stating explicitly that assignment does not establish ownership |

RD-11b asserts the detail surface's assignment count equals
`execution_evidence` for that obligation, that the note is present, and that its
text says assignment *does not* establish constitutional ownership. DQ-21 asserts
the list makes no `responsibility_detail` request — no N+1, per ruling 6.

This resolves part of the v295 problem early: the fact you wanted shown *can* be
shown, on the surface whose envelope genuinely contains it.

---

## 5 · Risk scoping and the standing edge case

`responsibility_detail()` carries **no risk key**, so risk is a second,
deliberately separate request. The closed filter grammar has no
`responsibility` key, so scoping is as honest as the grammar permits:

| Responsibility | Filter used | Breadth |
|---|---|---|
| event-scoped | `{"event": <its event>}` | the event's findings, indexed to the row |
| **standing** | `{"scope": "standing"}` | **every standing finding for the tenant**, indexed to the row |

The standing read is broader than the row. That breadth is **disclosed on
screen**, not just in a comment — the surface tells the reader that findings were
read for every standing responsibility and indexed to this one, and that the read
is broader than the row while the display is not. RD-13b asserts both the wire
filter and that the disclosure text is present.

It was not narrowed client-side. Re-filtering a projection is exactly the drift
PRJ-10 exists to prevent; narrowing it properly needs a grammar change, which is
not v291's to make.

---

## 6 · Certification

### `accept-responsibility-detail.mjs` — 20 PASS / 0 FAIL

Real Chromium, real `responsibility_detail()` and `risk_findings()` in real
Postgres on a disposable clone (`createdb -T ec ec_rd291`). Fixtures cover a
richly-populated responsibility (two ownership transfers, exception evidence, a
dependency), an ownerless one carrying assignment evidence, a supersession pair,
a standing responsibility with no event, and a foreign-tenant row.

| Claim | Proves |
|---|---|
| RD-1 | renders from the real `responsibility_detail`; state matches `responsibility_state()` |
| RD-2 | one detail request supplies all five sections |
| RD-3 | `ownership_history()` never reaches the wire; no unexpected projection is called |
| RD-4 | anchors shown are the obligation's real origin |
| RD-5 | ownership timeline equals the ledger in `seq` order |
| RD-6 | that timeline is identical to `ownership_history()` — a second call would be redundant |
| RD-7 | evidence list equals `execution_evidence` in `moment` order |
| RD-8 | declared dependencies come from the envelope |
| RD-9 | state and risk stay separate elements with separate vocabularies |
| RD-10 | findings equal `risk_findings()` for the row |
| RD-11a | an ownerless responsibility renders ownership debt, no fabricated owner |
| RD-11b | assignment evidence is stated **because this envelope carries it**, and explicitly does not imply ownership |
| RD-12 | supersession renders in both directions |
| RD-13a | event-scoped risk is read by event, verified on the wire |
| RD-13b | standing risk uses `{scope:'standing'}` and the broader read is disclosed on screen |
| RD-14 | unknown responsibility → not-found, never an empty detail |
| RD-15 | a foreign tenant's responsibility is not found and never rendered |
| RD-16 | untrusted tenant → refusal, zero projection requests |
| RD-17 | transport failure distinguished from refusal and from not-found |
| RD-18 | zero writes; exactly one detail + one risk request per render |

### `accept-department-queue.mjs` — 24 PASS / 0 FAIL (+3)

| Claim | Proves |
|---|---|
| DQ-21 | every row links to `/operations/responsibilities/<id>`, and the list makes **no** detail request — no N+1 |
| DQ-22 | the picker offers exactly the five closed-vocabulary departments, with the active one marked |
| DQ-23 | the Departments surface with nothing chosen renders the picker and issues **zero** projection requests |

All 21 v290 claims re-ran unchanged and passed.

### `accept-operations-shell.mjs` — 11 PASS / 0 FAIL (2 rewritten)

**Disclosed plainly:** v290's SH-3 and SH-3b asserted five per-department rail
entries. You overruled that shape, so those two claims were **rewritten**, not
retired — SH-3 now asserts Departments occupies exactly one position and the rail
advertises no per-department path; SH-3b asserts Operations advertises Today and
Departments only. SH-5 and SH-7 were adjusted for the same reason. The claim count
is unchanged at 11. This is a ruling-driven rewrite, not a repair of a broken
claim.

---

## 7 · Regression

```
SQL      : 130 unique claims / 0 FAIL — UNCHANGED
           v286 24 · v287a 21 · v287b 26 · v288a 34 · v289 25
           every proof rolled back · residue 0/0/0/0
browser  : accept-today 14 — UNCHANGED
           accept-operations-shell 11 · accept-department-queue 24 · accept-responsibility-detail 20
unit     : No new unit claims. The previously reported 20-pass result remains
           historical pending identification or restoration of its authoritative
           execution path.
tsc      : v281 · v283 · v284 · strictcheck · deploycheck — 0 errors each
           (deploycheck is the config that compiles the v291 files)
```

---

## 8 · Preserved, as required

Every existing surface and destination is intact. `Sidebar.tsx` remains the only
existing visual file v290/v291 touched, and the only change in v291 is five nav
lines becoming one. Event Studio, Canvas, Inspector, Live Lens, Proposal Studio,
the Lookbook, Blueprint Shelf, Price Book, bookings, calendar and every other
route are untouched — no route was removed, renamed or redirected except `/today`,
which v290 turned into a redirect and which still resolves.

The detail surface uses the existing EventCore operational language: the same
Tailwind neutral/rose/amber/teal scale, the same seven state marks from
`statePresentation()`, the same severity classes, the same section and row idiom
as `OperationsToday`. No new design system, no new tokens, no new component
library.

---

## 9 · Still parked, untouched by v291

The four verifier corrections, the older-runner sentinel defect, and the base
`tsconfig.json` question remain registered and outside this slice.

One note on the last of these, because it now has a second consequence: with no
base `tsconfig.json`, `npx next build` cannot resolve the `@/` alias, so it fails
on pre-existing modules and is unavailable as a gate for v291 exactly as it was
for v290. `deploycheck` remains the config that actually compiles the new files.

## 10 · What v291 leaves open

1. **`/` Daily Ops is still pre-constitutional.** v292 by your sequence.
2. **The `active`/`derived` presentation ruling** is still owed before v295.
3. **Risk cannot be scoped to one responsibility** without a filter-grammar
   change. The standing case is disclosed rather than solved.
4. **Nothing on the detail surface is actionable.** No ceremony, no evidence
   recording, no ownership transfer. Reading is complete; writing is a separate
   programme and not implied by anything here.
