# EventCore v288a — SQL-Owned Canonical Operational Window
## Implementation & Certification Report

**Verdict: v288a — DEPLOYABLE and CERTIFIED.**

The registered correction is implemented. `projection_operations_today` now
owns its operational window, derives it from the tenant's operating day and the
envelope's own `as_of`, and the Operations Today surface renders a populated
Changed band **while sending no time at all**. Nothing is persisted; no client
derives time.

---

## 1 · Deliverables

| Item | File |
|---|---|
| SQL migration | `supabase/v288a_operational_window.sql` |
| Proof | `supabase/tests/v288a_proof.sql` — **34 PASS / 0 FAIL** |
| Surface acceptance | `browser-tests/accept-today.mjs` — **14 PASS / 0 FAIL** (UI-10 added) |
| Deployment package | `eventcore-v288a.zip` |

Application change was one component: the Changed band's empty-state copy, which
previously said *"No change marker in this slice — persistence arrives later."*
That statement is no longer true, so it now reads *"Nothing has appeared or been
withdrawn in this operating window."*

---

## 2 · The three rulings, finalized

These were registered as open questions. You asked for finalized definitions, so
they are ruled here and implemented. Each is overridable by a later ruling; each
is stated with its reasoning so a reversal is cheap.

### 2.1 · The tenant operational day

**Validation at the database boundary (added on review).** The first cut shipped
the two columns bare — no constraint, no trigger. Two failure modes were
demonstrated against the live database before fixing:

- `operational_day_start_hour = 25` was **accepted**, and silently produced a
  wrong day boundary rather than an error;
- `operational_timezone = 'Not/AZone'` was **accepted at the write**, then made
  `canonical_operational_window()` raise *"time zone not recognized"* — i.e. a
  configuration typo would take Operations Today down for that tenant at **read**
  time, long after the mistake.

Both are now guarded, at the write and again at the read:

```sql
-- (i) range
alter table public.tenants add constraint tenants_operational_day_start_hour_check
  check (operational_day_start_hour is null
         or (operational_day_start_hour >= 0 and operational_day_start_hour <= 23));

-- (ii) timezone — a trigger, because pg_timezone_names is a catalogue view and
--      is therefore not legal inside a CHECK constraint
create or replace function public.tenants_operational_config_guard()
returns trigger language plpgsql as $$
begin
  if new.operational_timezone is not null then
    if btrim(new.operational_timezone) = '' then
      raise exception 'TENANT_TIMEZONE_INVALID: operational_timezone may not be blank; leave it NULL to use the default';
    end if;
    if not exists (select 1 from pg_timezone_names z where z.name = new.operational_timezone) then
      raise exception 'TENANT_TIMEZONE_INVALID: % is not a time zone this database can resolve', new.operational_timezone;
    end if;
  end if;
  return new;
end $$;

create trigger tenants_operational_config
  before insert or update on public.tenants
  for each row execute function public.tenants_operational_config_guard();

-- (iii) read-time fallback (defence in depth): an unusable stored value
--       resolves to the documented default instead of raising
create or replace function public.tenant_operational_timezone(p_tenant uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.operational_timezone from public.tenants t
      where t.id = p_tenant
        and t.operational_timezone is not null
        and exists (select 1 from pg_timezone_names z where z.name = t.operational_timezone)),
    'America/New_York');
$$;

create or replace function public.tenant_operational_day_start_hour(p_tenant uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.operational_day_start_hour from public.tenants t
      where t.id = p_tenant and t.operational_day_start_hour between 0 and 23),
    0);
$$;
```

Proof coverage: **CFG-1…CFG-10**. Notably CFG-10 records that the start hour
cannot be corrupted even by disabling the trigger, because a CHECK constraint is
not lifted that way — a stronger guarantee than the timezone's fallback.


**Ruling.** The operating day is defined by two nullable **configuration**
columns on `tenants`:

- `operational_timezone` — IANA zone. NULL ⇒ **`America/New_York`** (EventCore's
  first domain is Jackson, NJ).
- `operational_day_start_hour` — local hour the day begins, 0–23. NULL ⇒ **0**.
  A caterer finishing at 01:00 can set `4` so the small hours belong to the
  prior operating day.

`operational_day_of(at, tz, hour)` returns the local operating date containing an
instant, honouring the start hour. `operational_day_start(day, tz, hour)` returns
its opening instant.

**Why configuration and not state.** These describe how a tenant's day is
*shaped*; they are never written by a projection, are nullable with documented
defaults, and carry no per-user or per-read value. The persistence ban was on
remembering *what someone has seen* — a last-viewed marker. Nothing here
remembers anything (W-6, W-6d).

### 2.2 · The Shabbos window

**Ruling.** Shabbos is an operational **blackout**, not a short day. Saturday in
the tenant's own timezone carries no operational work. **The window begins at the
start of the current operating day; when a blackout intervenes, it reaches back
across the blackout to the start of the last day on which work actually
happened.**

Measured behaviour (America/New_York, start hour 0):

| Instant | Window begins | Why |
|---|---|---|
| Mon–Fri | that same day | preceded by an operating day |
| **Saturday** | **Friday** | inside the blackout, the operating context is still Friday |
| **Sunday** | **Friday** | reaches back across Shabbos |

**Why the reach-back matters.** Without it, a Sunday console would silently omit
everything that changed on **Friday** — the single likeliest day for late changes
before a Sunday event. That omission is precisely the failure the Changed band
exists to prevent. Proven by SH-1…SH-5.

**Sunset precision is deliberately not modelled.** Making the window depend on
astronomical data, for a value whose only job is to bound a "what changed" read,
buys accuracy nobody can act on. A whole-day blackout errs in the safe direction:
it *widens* the window rather than hiding change.

### 2.3 · The exact meaning of Changed

**Ruling.** A responsibility is **changed** when it **appeared** or was
**withdrawn** inside the window:

```
changed  =  derived since the window opened
          ∪ superseded since the window opened
```

**Discharge is excluded.** Discharge alters *whether something is done*, not
*what is owed* — and the state column already reports it in every other band.
Including it would make Changed approximate "everything that happened today",
which is noise rather than signal.

**Why supersession is the important half.** "What moved while I wasn't looking"
is operationally dangerous mainly in one direction: a pull you believed you had,
withdrawn by an amendment. Appearance you will notice; disappearance you will
not. Proven by CHG-1…CHG-5.

---

## 3 · W-1 through W-6 — results

`supabase/tests/v288a_proof.sql` — **24 PASS / 0 FAIL** on first run,
self-rolling-back (`V288A_PROOF_ROLLBACK`), rerunnable, zero residue.

| Claim | Result |
|---|---|
| **W-1** window resolved in SQL | **PASS** — with no `p_since`, the projection resolved the window itself and echoed it as `data.since` |
| **W-1b** Changed populated from SQL alone | **PASS** — 2 rows, no client time, nothing persisted |
| **W-1c** window auditable | **PASS** — echoed window equals `canonical_operational_window(envelope.as_of)` exactly |
| **W-2** purity | **PASS** — identical inputs yield an identical window |
| **W-2b** byte-identical envelopes | **PASS** — PRJ-1 upheld with the window included |
| **W-3** clock discipline | **PASS** — moving only the clock across a boundary moved the window |
| **W-3b** zero writes | **PASS** — resolving across three clocks wrote nothing |
| **W-4** composition unaffected | **PASS** — contents still ≡ `responsibility_feed(scope, as_of)`; scope still `{}` |
| **W-4b** band invents nothing | **PASS** — every Changed row is in the envelope's membership |
| **W-5** ownerless unaffected | **PASS** — ownerless band still ≡ `feed(unowned)` (4 rows) |
| **W-6** no persistence | **PASS** — no last-viewed table and no last-viewed column exists anywhere |
| **W-6b** window is STABLE | **PASS** — the engine forbids it writing |
| **W-6c** projection still STABLE | **PASS** — PRJ-3 upheld after the correction |
| **W-6d** settings are configuration | **PASS** — both columns nullable with documented defaults |
| **SH-1…SH-5** Shabbos ruling | **PASS** ×5 |
| **CHG-1…CHG-5** meaning of Changed | **PASS** ×5 |
| **CFG-1, CFG-2** start hour 24 / −1 refused by check constraint | **PASS** |
| **CFG-3** 0, 23 and NULL accepted | **PASS** |
| **CFG-4** unresolvable timezone refused `TENANT_TIMEZONE_INVALID` | **PASS** |
| **CFG-5** blank timezone refused (NULL is how to ask for the default) | **PASS** |
| **CFG-6** a genuine IANA zone accepted and resolves through | **PASS** |
| **CFG-7** NULL settings resolve through documented defaults | **PASS** |
| **CFG-8** an unconfigured tenant still resolves a window | **PASS** |
| **CFG-9** a corrupt timezone bypassing the guard falls back at read time | **PASS** |
| **CFG-10** start hour cannot be corrupted even with the trigger disabled | **PASS** |

---

## 4 · UI-10 — result

**PASS.** `accept-today.mjs`, live Postgres, real mounted surface:

- the projection resolved a canonical window (`data.since` non-null);
- the Changed band rendered **populated**;
- band membership equals `counts.changed` in the same envelope;
- every Changed row is inside the page's single membership set;
- **wire-level assertion:** every `p_since` the client put on the wire was
  `null`. The surface contributes no time whatsoever.

That last check is the one that matters: it proves the window is SQL-owned in
practice, not merely in intent.

---

## 5 · Regression totals

```
SQL      : 455 PASS / 0 FAIL   (v288 floor 421 held EXACTLY; v288a adds 34)
residue  : 0 (ec ≡ eczr fingerprint)
tsc      : v281 · v283 · v284 · strictcheck · deploycheck — all CLEAN
browser  : 260 PASS / 0 FAIL across 26 certified runners · 0 zero-emission
           (floor 259 → 260; accept-today 13 → 14 with UI-10)
           accept-regression 14 PASS / 1 FAIL — unchanged, still quarantined
unit     : 20 PASS / 0 FAIL
```

No existing proof modified. No assertion weakened. No quarantine changed. Every
legacy runner unchanged: `EventWorkspace`, `DailyOpsEvent`, `OpsWorkspace`,
`TodoPanel` and `execution/spine.ts` remain untouched.

---

## 6 · Change scope, precisely

| Surface | Modified? |
|---|---|
| `supabase/v288a_operational_window.sql` | **NEW** |
| `supabase/tests/v288a_proof.sql` | **NEW** |
| `public.tenants` | **YES** — two nullable configuration columns, one CHECK constraint, one BEFORE INSERT/UPDATE validation trigger (all additive; existing NULL rows valid and unaffected) |
| `projection_operations_today` | **YES** — the registered correction; scope, envelope shape and volatility unchanged |
| `src/components/today/OperationsToday.tsx` | **YES** — Changed band empty-state copy only; no logic change |
| `browser-tests/accept-today.mjs` | **YES** — UI-10 added |
| `execution/spine.ts`, `EventWorkspace`, `DailyOpsEvent`, `OpsWorkspace`, `TodoPanel` | **No** |
| Every other projection (`feed`, `event_command`, `department_queue`, `day_sheet`, `risk_findings`) | **No** |
| Any existing proof or race | **No** |

---

## 7 · Deployment

Apply after v287b, to **both** `ec` and `eczr`:

```
supabase/v288a_operational_window.sql
```

Grants are inside the file (`authenticated` only). Re-runnable: columns are
`if not exists`, functions are `create or replace`.

Optional per-tenant configuration (defaults apply if unset):

```sql
update public.tenants
   set operational_timezone = 'America/New_York',
       operational_day_start_hour = 0
 where id = '<tenant>';
```

Verify:
```bash
psql -d ec -f supabase/tests/v288a_proof.sql                              # 34 PASS
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-today.mjs   # 14 PASS
```

---

## 8 · Known limitations

1. **Sunset is not modelled** — Shabbos is a whole-day blackout (§2.2). Friday
   evening changes after sunset would still fall inside Friday's window; this
   errs toward showing more, never less.
2. **Only Shabbos is a blackout.** Yom Tov is not yet modelled, so a Sunday
   following a two-day Yom Tov reaches back only across Saturday. Extending
   `is_blackout_day()` to the Jewish festival calendar is a natural follow-on
   and needs no change to the window logic — the reach-back loop already walks
   contiguous blackout days.
3. **The window is tenant-wide, not per-user.** By design: per-user windows are
   persistence wearing a different hat.
4. **`America/New_York` is the default timezone** for tenants that set none.
   Documented and overridable per tenant.
5. **Changed excludes discharge** (§2.3) — a deliberate ruling, reversible by
   changing one predicate and one proof claim.

---

## 9 · Certification statement

**Constitutional compliance.** R-3 (nothing materialized, no stored state —
W-6), R-9 (the window is STABLE and writes nothing — W-3b, W-6b), R-13
(the window is a band, never a membership filter — W-4, W-4b), R-5, R-7, R-10
unaffected. The composition law and the ownerless guarantee both re-proven
after the change (W-4, W-5).

**Registered-correction compliance.** No persistence introduced (W-6). No
client-derived time (UI-10, wire-level). Envelope shape unchanged — the window
rides in the existing `data.since`. Filter grammar untouched. Scope still `{}`.

**Sequencing.** v288a is certified, so the block on v289 is lifted. **v289
(Event Command equivalence) has NOT been started.**

---

**v288a — DEPLOYABLE and CERTIFIED.** Stopping here.
