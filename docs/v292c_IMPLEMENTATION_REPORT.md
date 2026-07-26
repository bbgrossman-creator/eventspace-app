# v292c — OCCURRENCE PREPARATION CONSOLE
## Implementation specification · certification · deployment

| | |
|---|---|
| **Baseline** | v292b (SQL 177) |
| **Type** | Application only. No SQL, no schema, no ceremony, no projection change. |
| **Browser** | **+16 claims** (`accept-occurrence-prep` 16/0) · floor **69 → 85** |
| **SQL floor** | **177 — unchanged** (v292c writes no SQL) |
| **tsc** | 5/5 clean |

---

## 0 · A regression I introduced and did not catch

**The v292a1 harness migration covered the SQL proofs but not the browser
runners.** Three runners — `accept-today`, `accept-department-queue`,
`accept-responsibility-detail` — seed fixtures with
`insert into public.event (tenant_id, engagement_ref, …)` using a fabricated
`engagement_ref`. Under I-31′ that violates `occurrence_ref NOT NULL`, so all
three have been failing since v292a1 landed.

**The v292a1 and v292b reports both claimed the browser floor was unchanged. I
asserted that instead of running it.** That was wrong, and it is the same error
class the certification discipline exists to prevent.

Corrected in this slice by the same principle already ruled for the SQL proofs —
fixture construction only, claims identical:

| Runner | Sites migrated | Claims before | Claims after |
|---|---|---|---|
| `accept-today` | 1 | 14 | **14** |
| `accept-department-queue` | 3 | 24 | **24** |
| `accept-responsibility-detail` | 2 | 20 | **20** |
| `accept-operations-shell` | 0 (no event fixture) | 11 | **11** |

Every count reproduced exactly. No claim retired, reworded or weakened.

## 0.1 · An unrelated observation about `db/`

The working tree contains a certification harness I did not author: `db/clean.sh`,
`db/clean.ps1`, and a revised `db/verify.sh` with `--require-pristine`,
certification status separated from environment status, and **proof residue
detected by comparing row counts before and after** rather than asserting absolute
zero. That last change fixes a genuine defect in my version, which would
false-fail against any database holding legitimate seeded rows. Reported because
my earlier statements about `verify.sh`'s contents are now stale.

Its current output on `ec`: **177 unique claims, CERTIFICATION PASSED**, proof
residue none, with "NOT PRISTINE — 3 historical rows" correctly reported as
environment state rather than a certification failure.

---

## 1 · Implementation specification

**Objective.** Expose the certified promise ceremonies so facts can be recorded
by an operator rather than only through `psql`. The UI collects input, invokes
ceremonies, displays projection results, surfaces refusals — and implements no
business rule.

| File | Role |
|---|---|
| `src/lib/promise/ceremonies.ts` | **new** — the write client |
| `src/components/occurrence/OccurrencePrep.tsx` | **new** — the console |
| `src/app/operations/occurrences/[id]/prepare/page.tsx` | **new** — route |
| `browser-tests/prep.{harness.tsx,html}`, `prep-supabase.ts` | **new** — harness |
| `browser-tests/accept-occurrence-prep.mjs` | **new** — 16 claims |
| three existing runners | fixture migration only (§0) |

**Why a new client module.** `src/lib/projection/` is read-only by contract —
its header states components never call `.rpc()`, and its three primitives are
all reads. Ceremonies write. Putting them there would make a read-pure module
capable of mutation. The separation is now legible at the import line: a
component importing `projection/*` cannot write; one importing
`promise/ceremonies` visibly does.

## 2 · UI flow

An operator does not fill in a form. Information arrives **out of order over
weeks** — the date at sale, an estimate, the venue, the guarantee at 72 hours,
supervision booked separately, milestones in the final week. So this is not a
wizard and not a field layout. It is a **ledger of facts**, and the job is to
record whichever one just arrived, alone, in seconds, and leave.

```
arrive at an occurrence
  → read the identity strip:  which one am I preparing, and is it released?
  → read readiness:           N of 7 recorded · what is still missing
  → open ONE ledger row       (the rest stay collapsed)
  → record → ceremony fires → brief re-read → whole screen updates
  → row collapses, readiness advances, the missing list shrinks
  → leave, or open the next row
```

Progressive completion, never a gate. Nothing is required before anything else,
because the operation does not work that way.

## 3 · Screen layout

Four zones, in descending order of how often an operator needs them:

1. **Identity strip** — display name (or `Occurrence N`), occasion, client with a
   `(from booking contact)` marker when it is the fallback, engagement name,
   ordinal, and a regime badge: **Preparing** or **Released — under execution**.
   Plus `Cancelled`, and `(implied by a legacy release)` when `open_basis` says so.
2. **Readiness** — `N of 7 facts recorded`, the named missing list, and once
   released a work-side line (outstanding · unowned · exceptions).
3. **The ledger** — one row per fact in the order information arrives: operating
   date, covers, venue, occurrence name, client, supervision, schedule. Each row
   shows its current value or *not recorded*, plus **Record** or **Amend**. One
   row expands at a time.
4. **Advisories** — overlapping windows, and department readiness with a link to
   the queues once released.

**The ledger's spine is `completeness` from the projection.** The checklist is
not invented in the client; it is read. That is why the screen needs no
knowledge of what a complete occurrence is.

## 4 · Ceremony integration

| Ledger row | Ceremony |
|---|---|
| Operating date | `set_schedule_milestone(…, 'operating_date', p_at_date)` |
| Covers | `commit_attendance` |
| Venue | `bind_occurrence_venue` |
| Occurrence name | `set_occurrence_profile` |
| Client | `set_engagement_profile` |
| Supervision | `bind_occurrence_supervision` |
| Schedule | `set_schedule_milestone` |

Four disciplines, each proven:

- **No optimistic state.** After every ceremony the brief is re-read and the
  screen re-renders from SQL (PR-4). A local guess that disagreed with the ledger
  would be a second source of truth.
- **Refusals rendered verbatim as codes.** `PROMISE_REASON_REQUIRED` (PR-7),
  `PROMISE_UNCHANGED` (PR-8) — the client never decides that a reason is needed
  or that a value is unchanged. It offers the input; SQL refuses.
- **A reason field is offered whenever the fact already exists**, derived from
  the projection's `completeness`. This only avoids *hiding* the field — the
  ceremony still decides.
- **The milestone selector offers 15 keys**: `supervision_start` is absent
  because supervision has its own object, and `operating_date` is absent because
  it is a date with its own row (PR-10).

## 5 · Client contract

`ceremonies.ts` exports one thin wrapper per ceremony, `CeremonyRefusal`,
`normalizeCeremonyRefusal`, the 19 refusal codes, and the closed
`MILESTONE_KEYS` / `AttendanceBasis` vocabularies. No validation, no defaulting
of business meaning, no ordering rules.

**One table read, declared:** `listVenues()` reads the venue catalogue. It is
reference data — a list of places, carrying no derived state, no responsibility
and no promise. Binding one is a ceremony; naming the options is a catalogue
read, RLS-scoped. PR-2 asserts `venue` and `tenant_users` are the **only** tables
the console touches.

## 6 · Proof additions

**None, and deliberately.** v292c adds no SQL, so it adds no SQL claims; the
floor stays at 177. Manufacturing a proof for a slice that touches no SQL would
inflate the floor without certifying anything. The entire proof burden is browser,
which is where the behaviour lives.

## 7 · Browser acceptance — 16 PASS / 0 FAIL

Real Chromium, real ceremonies, real Postgres on a disposable clone. **Ceremony
writes commit**, so the console's re-read observes them — this exercises the
actual capture loop rather than simulating it.

| Claim | Proves |
|---|---|
| PR-1 | a bare occurrence renders a usable console naming all 7 missing facts — day one is the normal state |
| PR-2 | one projection read per render; only `venue` and `tenant_users` are read |
| PR-3 | recording the date invokes the real ceremony and the value lands in SQL |
| PR-4 | the screen re-reads the brief rather than patching local state |
| PR-5 | covers record with a basis; the contracted delta comes from the projection |
| PR-6 | the venue selector offers the catalogue; binding is by ceremony |
| PR-7 | amending without a reason renders `PROMISE_REASON_REQUIRED`, and the write does not land |
| PR-8 | restating a value renders `PROMISE_UNCHANGED` — the client did not pre-judge |
| PR-9 | a reasoned amendment succeeds and **appends** — two records, not an edit |
| PR-10 | the selector offers 15 keys; `supervision_start` and `operating_date` are absent |
| PR-11 | two overlapping windows are stated as **overlapping**, never as a conflict |
| PR-12 | an engagement-level supervision default renders as **inherited** |
| PR-13 | an occurrence binding overrides it and the badge disappears |
| PR-14 | a future-effective count shows as scheduled, never as the operative number |
| PR-15 | every value on screen equals the projection — missing count, regime, truth_version, overlaps |
| PR-16 | an absent or foreign occurrence renders not-found with no ledger |

## 8 · Deployment sequence

No migration. No SQL. Deploy the application build.

```bash
npx tsc --noEmit -p tsconfig.deploycheck.json     # the config that compiles v292c
./db/verify.sh ec                                 # 177, unchanged
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-occurrence-prep.mjs
# and the three migrated runners, which must reproduce 14 / 24 / 20
```

Reachable at `/operations/occurrences/<id>/prepare`.

## 9 · Known limitation: no navigation entry

**The console has no rail entry, and I did not invent one.** An "occurrences
needing preparation" list requires a *list* projection — the brief is
per-occurrence — and building one is a new projection, outside an
application-only slice. Adding a rail entry pointing at a page that cannot list
anything would recreate the `/today` orphan in a worse form.

Registered instead: **Day Sheet (v292d) is the natural entry point**, and linking
to prep from it is one line. If you would rather have standing rail access
sooner, the honest prerequisite is a small occurrence-list projection, which I
would spec rather than improvise.

## 10 · What v292c did not do

1. No Day Sheet — v292d, and it consumes `projection_occurrence_brief` exclusively.
2. No release affordance. `release_occurrence` is certified but unexposed: its
   predicates are commercial (acceptance, clearance, sign-off), and surfacing it
   beside promise capture would imply preparation completeness gates release,
   which the v292a ruling explicitly rejected.
3. No `open_occurrence` / `cancel_occurrence` in the UI. Creating an occurrence
   belongs to the engagement surface, not the console that prepares one.
4. No resource model, no typed offer decomposition, no typed obligation timing,
   no true `engagement` root, no `event.engagement_ref` FK — all still registered
   only.
