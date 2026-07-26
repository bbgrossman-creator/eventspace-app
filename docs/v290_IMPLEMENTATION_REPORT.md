# v290 — OPERATIONS SHELL · TODAY MOUNTED · DEPARTMENT QUEUE
## Implementation report · certification · deployment

| | |
|---|---|
| **Baseline** | v289 (independently certified on PostgreSQL 18.4, Windows) |
| **Type** | Application only. No SQL, no schema, no projection contract, no build config, no unit runner. |
| **Browser** | **+32 claims** — `accept-department-queue` 21/0, `accept-operations-shell` 11/0 |
| **SQL floor** | **130 — unchanged** |
| **Schema objects added** | none |
| **Migration** | none |

---

## 1 · What shipped

Operations Today was certified in v288a and **was not reachable**. It had no rail
entry; you could only arrive by typing `/today`. v290 gives the certified
projection stack a home in the shell and fills the one Operations lens that had
no incumbent surface.

| File | Action |
|---|---|
| `src/app/operations/today/page.tsx` | new — mounts the unchanged `OperationsToday` |
| `src/app/today/page.tsx` | replaced with a server `redirect("/operations/today")` |
| `src/app/operations/departments/[department]/page.tsx` | new — passes the route param through unvalidated |
| `src/components/departments/DepartmentQueue.tsx` | new — the surface |
| `src/components/Sidebar.tsx` | `OPERATIONS_GROUP`, renderer generalized, nav data attributes |
| `browser-tests/department-queue.{harness.tsx,html}` | new |
| `browser-tests/accept-department-queue.mjs` | new — 21 claims |
| `browser-tests/shell.{harness.tsx,html}`, `shell-supabase.ts`, `shell-next-{link.tsx,navigation.ts}` | new harness shims |
| `browser-tests/accept-operations-shell.mjs` | new — 11 claims |

`OperationsToday.tsx` is **byte-for-byte unchanged**. v290 moved where it mounts,
not what it renders.

---

## 2 · Rulings as implemented

**Operations carries `perm: "ops.view"` and no capability gate.** `NavItem.cap`
is typed `keyof Capabilities`, and `Capabilities` has ten keys — none named
`production`. The old reserved slot could never have compiled. More to the point,
`cap` gates modules a business may genuinely lack; R-1…R-13 guarantee every
tenant has responsibilities, so there is no coherent configuration in which
Operations is absent. **SH-5 proves this is not merely an omission**: with every
optional module switched off, Operations survives while the genuinely gated Price
Book and Library disappear. Without that control the claim would be vacuous.

**Nested routes.** `/operations/today` and
`/operations/departments/[department]`. No flat `/departments/...` route exists.
`/today` is retained as a server redirect and is deliberately **not** advertised
in the rail — SH-2b asserts the legacy path is a redirect, not a destination.

**Risk separation is enforced, not merely intended.** DQ-9a checks that no row
nests a finding inside its state badge or a state inside its risk badge, that
every state badge reads one of the seven state words, and that no risk badge
reads a state word. DQ-9b exercises the case that matters: a row carrying
`exception_recorded` whose state is still `active` — risk decorates, it never
reclassifies. DQ-10 checks each row's findings against `risk_findings()`
row-by-row, so a finding can be neither invented nor dropped.

**Unit floor.** No new unit claims. The previously reported 20-pass result
remains historical pending identification or restoration of its authoritative
execution path.

---

## 3 · Certification

### `accept-department-queue.mjs` — 21 PASS / 0 FAIL

Real Chromium, real `projection_department_queue` executing in real Postgres on a
disposable clone (`createdb -T ec ec_dq290`). Only the transport is substituted;
the component, `feed.ts`, `client.ts`, `state.ts` and `labels.ts` are the real
modules.

| Claim | Proves |
|---|---|
| DQ-1 | mounted surface renders from the real projection; `truth_version` matches live SQL |
| DQ-2 | rendered membership equals `feed({department})` exactly — the client cannot shrink a queue |
| DQ-3 | every rendered state equals `responsibility_state()`, and lies inside the seven |
| DQ-4 | displayed counts are the envelope's — nothing recounted |
| DQ-5 | `by_state` matches the envelope and reconciles to `total` |
| DQ-6 | every group's members equal the envelope's declared members exactly |
| DQ-7 | groups partition membership — one group per row, none invented |
| DQ-8 | changing `group_by` issues a new projection request; grouping is SQL's, not a client regroup |
| DQ-9a | state and risk are separate elements with separate vocabularies |
| DQ-9b | a finding does not change state — risk decorates, never reclassifies |
| DQ-10 | each row's findings equal `risk_findings()` for that row |
| DQ-11 | unknown department → genuine `PROJECTION_FILTER_INVALID`, no rows, not an empty queue |
| DQ-12 | unknown `group_by` → genuine `PROJECTION_GROUP_BY_INVALID` |
| DQ-13 | untrusted tenant → refusal, and **zero** projection requests issued |
| DQ-14 | defence in depth — an anonymous department read is empty at the database |
| DQ-15 | transport failure distinguished from refusal and from empty truth |
| DQ-16 | a department with no work renders empty truth honestly |
| DQ-17 | label pack swap changes words only — membership, state, grouping, order identical |
| DQ-18 | a foreign tenant's culinary work appears nowhere on the surface |
| DQ-19 | zero writes across the sweep — ledger fingerprint unchanged |
| DQ-20 | one projection envelope per render; no direct table reads beyond the session lookup |

### `accept-operations-shell.mjs` — 11 PASS / 0 FAIL

| Claim | Proves |
|---|---|
| SH-1 | the shell renders an Operations group for a holder of `ops.view` |
| SH-2 | Operations Today is reachable at `/operations/today` — the v288a orphan is closed |
| SH-2b | the rail does not advertise the legacy `/today` path |
| SH-3 | exactly the five constitutional departments have queue entries, no others |
| SH-3b | department words come from the label pack, not the shell |
| SH-4 | Operations is open on arrival — a collapsed rail is how `/today` stayed invisible |
| SH-5 | Operations survives every optional module being off, while cap-gated entries vanish |
| SH-6 | a role without `ops.view` sees no Operations group; that role keeps its own entries |
| SH-6b | signed out, no operations entry renders |
| SH-7 | a department route marks its own entry active, not a sibling |
| SH-8 | (source) `/today` is a server redirect and **no `next.config` was introduced** |

A **new** runner rather than an extension of `accept-today.mjs`: that file carries
certified v288a claims, and editing it to add shell assertions would put a frozen
floor at risk for no benefit.

---

## 4 · Regression

```
SQL      : 130 unique claims / 0 FAIL — UNCHANGED
           v286 24 · v287a 21 · v287b 26 · v288a 34 · v289 25
           every proof rolled back · residue 0/0/0/0
browser  : accept-today.mjs 14 PASS / 0 FAIL — UNCHANGED
           accept-department-queue 21 · accept-operations-shell 11  (NEW)
unit     : no new claims (see §2)
tsc      : v281 · v283 · v284 · strictcheck · deploycheck — 0 errors each
```

Nothing in v290 reaches the database layer, so the SQL floor could not have moved;
it was re-run anyway rather than asserted.

**One precision about the TypeScript matrix.** Four of the five configs are narrow
per-slice gates — `strictcheck` includes seven studio files, `v281` four binding
files, and so on. They are clean, but they do **not** compile the v290 files.
`deploycheck` declares no `include` and therefore compiles the whole project;
`tsc --listFiles` confirms all five new files are in its scope, and it reports
zero errors. **deploycheck is the config that actually gates v290.** The
five-config matrix stays provisional as ruled; nothing here argues for expanding
it.

---

## 5 · Two findings worth registering

**The snapshot has no base `tsconfig.json`.** `ls tsconfig*.json` returns
`deploycheck`, `strictcheck`, `test`, `v280`, `v281`, `v283`, `v284` — no base
file. Next.js reads the base config for the `@/` path alias, so `npx next build`
fails on **pre-existing** modules it cannot resolve (`@/lib/automation`,
`@/lib/sendEmail`, `@/components/PageGuard`, `@/lib/supabase`). None of the four
is a v290 file, and no build error mentions any v290 file. A base
`tsconfig.json` was **not** created, because v290 forbids build-config change —
and SH-8 asserts no `next.config` appeared either. The consequence is that
`next build` is not available as a v290 gate in this environment; `deploycheck`
is.

**A test-probe defect was found and fixed during certification.** DQ-10 initially
failed. The cause was the probe, not the product: with `psql -tA` an empty
`string_agg` prints an empty line, so `.split("\n").pop()` on trimmed output
returned the preceding `set_config` row instead of the aggregate. The probe now
prefixes its result with a sentinel and asserts the sentinel is present. Recorded
because the same pattern appears in existing runners and would misreport the same
way.

---

## 6 · One deviation from the sketch, for your ruling

Your sketch had four Operations entries, one of them "Department Queues". The
implementation lists **Today plus the five departments individually** — six
entries.

Reasoning: a single "Department Queues" entry needs a target, and there is no
index route. Building one would have added a route whose only job is to link to
five others. Listing the five puts every queue one click away, and the entries
are generated from `DEPARTMENT_KEYS` with words from the active label pack, so the
rail can never drift from the closed vocabulary `validate_projection_filter()`
enforces — SH-3 asserts exactly the five, no more and no fewer.

If you want the single collapsed entry, it is a small v291 addition: an index
route plus one nav line.

---

## 7 · Change scope, precisely

| Object | Changed |
|---|---|
| `OperationsToday.tsx` | no — byte-for-byte unchanged |
| `Sidebar.tsx` | yes — Operations group, shared group renderer, `data-nav-*` attributes |
| Any SQL function, schema object, RLS policy or grant | no |
| Projection contract (`types.ts`, `client.ts`, `feed.ts`, `state.ts`, `labels.ts`) | no |
| `accept-today.mjs` and every existing runner | no |
| `package.json`, tsconfigs, `next.config` | no |
| `/` Daily Ops, `/calendar`, the 42 direct-supabase components | no |

The `data-nav-item` / `data-nav-group` attributes were added at the shared
renderer, so back-office groups carry them too. `Sidebar.tsx` holds no existing
browser claims — verified before editing — so this could not disturb a certified
assertion.

---

## 8 · Deployment

Nothing to apply to `ec` or `eczr`. No migration, no chain entry, no `CHAIN.txt`
change. Deploy the application build.

```bash
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-department-queue.mjs
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-operations-shell.mjs
npx tsc --noEmit -p tsconfig.deploycheck.json
./db/verify.sh          # 130, unchanged
```

Note for your Windows environment: every `accept-*.mjs` runner, including the two
new ones, shells out through `su postgres -c "psql ..."`. That is the existing
house pattern and it is Linux-shaped. The browser floor has always been a Linux
artifact; v290 does not change that, and making the runners portable belongs with
the registered tooling corrections rather than inside a product slice.

---

## 9 · What v290 deliberately left alone

1. **`/` Daily Ops is still pre-constitutional.** It reads tables directly and
   derives tasks with `buildTasks()`. The app now has a constitutional queue and a
   client-derived home page at the same time. That is v292's question by your
   sequence, and naming it is better than letting it look accidental.
2. **`event_workspace` and `EventWorkspace.tsx` are untouched.** v295.
3. **The `active`/`derived` presentation ruling is still owed** before Event
   Command renders beside Event Workspace.
4. **`responsibility_detail()` and `ownership_history()` remain untyped in the
   client.** v291.
5. **No row on the Department Queue is clickable.** There is nowhere to go until
   Responsibility Detail exists. A queue you cannot drill into is the honest state
   of v290, not an oversight.
