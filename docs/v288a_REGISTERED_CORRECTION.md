# v288a — REGISTERED CORRECTION
## SQL-owned canonical operational window for `projection_operations_today`

**Status.** Registered, not begun. Bounded projection correction. **Event
Command equivalence (v289) does not begin until v288a is certified.**

---

## 1 · Why this exists

v288 shipped Operations Today with an empty **Changed** band. The directive
required "the projection's canonical operational window" and forbade
persistence. No such window exists: `projection_operations_today(p_viewer,
p_since, p_now)` takes `p_since` as a caller-supplied timestamp with **no
SQL-side default**, so the only ways to populate the band were:

- **persist a last-viewed marker** — forbidden (introduces state, and a write
  from a read-only surface); or
- **derive a window in React** — forbidden (the client would be deriving an
  operational boundary, which is operational truth).

Declining both was ruled correct. The gap is therefore in the **projection
layer**, and it is fixed there.

**Binding constraint:** no client-derived time, no persistence, in this
correction or any surface built on it. The client continues to send no `since`.

---

## 2 · The correction

Give the projection a **canonical operational window it owns itself**, derived
from the tenant's operational day and the envelope's own `as_of`.

Sketch (shapes only — the slice will settle the details under proof):

- A tenant-scoped operational-day boundary — the moment the operating day
  containing `as_of` began. EventCore's day is not the civil midnight of the
  server's timezone: the business runs on a Jewish weekly rhythm with a Shabbos
  blackout, and the tenant already carries operating context. The boundary
  function must be **immutable/stable, tenant-aware, and clock-parameterized**,
  never reading a stored "last viewed" value.
- `p_since` gains a **SQL-side default of that boundary** rather than `null`,
  so a caller that supplies nothing gets the canonical window instead of an
  empty band.
- The envelope echoes the resolved window (`data.since`, already present) so
  the value is auditable and reproducible, exactly as `as_of` is today.

**Explicitly excluded:** any `last_viewed` table or column; any write; any
client-supplied time; any per-user personalization of the window (that is
persistence wearing a different hat).

---

## 3 · Constraints inherited

- Envelope shape frozen — no new top-level fields; the window rides in
  `data.since`.
- Filter grammar frozen — no new keys.
- Composition law holds: contents must still ≡ `responsibility_feed(scope,
  as_of)`. The window governs the **Changed band**, which is a band over the
  same membership, not a membership filter.
- `projection_operations_today` keeps its declared scope of `{}`.

---

## 4 · Proof obligations

| Claim | Proves |
|---|---|
| **W-1** | With no `p_since`, the projection resolves the canonical window itself; the Changed band is populated from SQL alone. |
| **W-2** | The window is a pure function of tenant + `as_of`: same inputs ⇒ same window, byte-identical envelopes (extends PRJ-1). |
| **W-3** | Clock discipline — moving only `as_of` across an operational-day boundary moves the window, with zero writes (extends PRJ-8). |
| **W-4** | Composition unaffected: contents still ≡ `responsibility_feed(envelope.scope, as_of)` (PRJ-6/PRJ-10 unchanged). |
| **W-5** | Ownerless completeness unaffected — the Changed band never removes a row from the ownerless band (guards the v288 primary gate). |
| **W-6** | No persistence: schema assertion that no `last_viewed`-like column or table exists, and the ledger fingerprint is unchanged across a projection sweep. |
| **UI-10** | The v288 surface renders a populated Changed band **without sending `since`** and without any client-derived time. |

Existing floors carried forward unchanged: SQL 421+, browser 259 across 26
certified runners, five tsc configs including `deploycheck`, residue zero,
`accept-regression` quarantine unchanged.

---

## 5 · Open questions for ruling before v288a begins

1. **What defines the tenant's operational day?** A tenant setting, a fixed
   civil-day boundary in a tenant timezone, or the Jewish-calendar operating
   day already implicit in the business? This is the substantive question and
   should be ruled before implementation, not discovered inside it.
2. **Does Shabbos collapse or shift the window?** A Saturday `as_of` may need
   the window to reach back to the previous operating day rather than to an
   inert boundary.
3. **Does "changed" mean created-since, or created-or-superseded-since?**
   v288 currently reports created-since only. Superseded-since is arguably the
   more useful signal, and it is cheap to include — but it changes what the
   band means and deserves an explicit ruling.
