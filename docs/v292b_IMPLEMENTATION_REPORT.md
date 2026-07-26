# v292b — OCCURRENCE BRIEF PROJECTION
## Implementation report · certification

| | |
|---|---|
| **Baseline** | v292a1 (157) |
| **Type** | SQL projection + client contract. No ceremony, no schema, no UI. |
| **Proof** | `v292b_proof.sql` — **20 PASS / 0 FAIL** |
| **SQL floor** | 157 → **177** (delta **20**) |
| **Race** | unchanged — 4 v292a1 claims, reported separately |
| **Replay** | `ec` and `eczr` rebuilt from `CHAIN.txt`, 79 files, 0 failures |
| **Residue** | 0 · `tsc` 5/5 clean |

---

## 1 · One call, the whole briefing

`projection_occurrence_brief(p_occurrence uuid, p_now timestamptz)` answers the
approved sixty-second contract in a single read:

```
WHO         Sunday brunch / brunch / client=Goldstein Family (engagement_profile)
WHERE       Main Ballroom (source=occurrence)
HOW MANY    current=285 guaranteed · contracted=300 · delta=-15 · scheduled=1
WHEN        operating_date=2026-07-26 · 4 milestones
SUPERVISION KCL (source=occurrence)
OVERLAPS    1 — Florist window vs load_in_start, with exact overlap bounds
HAS_EVENT   false → promise side complete, work side empty
MISSING     []
```

`delta=-15` is the fact no surface could previously show: the guarantee is fifteen
below what was contracted. "What changed since we signed" is now a projected
number rather than something an operator reconstructs.

## 2 · Occurrence-scoped, and why that matters

The brief is anchored on the **occurrence**, not the event. A briefing is needed
for planning, before release — which is most of an engagement's life. An
event-scoped brief could not answer anything until the day it stopped mattering.

`has_event` states which regime the reader is in. Before release the promise side
is complete and the work side is empty; after release the *same* projection adds
readiness, exceptions and ownerless work. One surface spans both regimes rather
than two surfaces disagreeing (OB-11, OB-12).

## 3 · Composition, not restatement

Every promise fact comes from the v292a1 resolvers. The bitemporal rule is **not**
restated in the projection, and the proof enforces that by comparing the brief
against the resolvers directly:

| Claim | Enforces |
|---|---|
| OB-4 | `attendance.current` is byte-equal to `promise_current_attendance` |
| OB-5 | the future-effective final count appears **only** under `scheduled` |
| OB-6 | milestones equal `promise_current_milestones` in the same order |
| OB-7 / OB-8 | venue and supervision equal their resolvers **including `source`** |

Two implementations of a bitemporal rule diverge. There is one, and this
projection consumes it.

## 4 · Rulings honoured

**Overlaps, not collisions.** `data.overlaps`, every entry `kind: 'temporal'`, no
`collisions` key anywhere. OB-16 asserts all three. OB-15 proves the boundary
case: `staff_call` beginning exactly when load-in ends is **not** reported —
windows that merely touch do not overlap. The projection claims two windows
coincide in time and says nothing about a shared resource.

**Contracted comes from `attendance_commitment`.** Basis `contracted`, resolved
through the same supersession discipline. OB-10 proves the negative: with no
contracted commitment recorded, `contracted` and `delta` are **NULL**. The
projection declines to guess a headcount it was never told, and never reads
`offer_snapshots.model`.

**Completeness over blanks.** OB-18: an occurrence with no promise facts returns a
**valid** envelope naming all eight absences, and falls back to `bookings
.contact_name` for client with `client_source: 'booking_contact'` so the surface
knows it is a fallback. Every promise fact is absent on day one — that is the
normal state, not an edge case.

**Inheritance stays visible.** `venue.source` and `supervision.source` travel in
the envelope, so a surface cannot present an engagement-level default as an
occurrence-specific fact.

## 5 · Read purity and isolation

`STABLE`, so the engine forbids writing (OB-2, with a fingerprint check either
side). NULL for an absent **or** foreign occurrence — indistinguishable, so no
existence leaks (OB-3, OB-19). As-of resolution honoured end to end: asked about a
moment before anything was recorded, the brief shows no attendance and no schedule
(OB-20).

## 6 · Client contract

`types.ts` gains the envelope shape field-for-field; `feed.ts` gains
`occurrenceBrief(occurrence, asOf?)` built on the v291 `fetchObject` primitive.
Nothing is renamed or added at the client boundary.

Two properties documented as consumer obligations rather than left implicit: an
empty work-side array is **not** "nothing is owed" unless `has_event` is checked;
and dropping `source` presents an inherited fact as a specific one.

## 7 · Certification

```
v286 24 · v287a 21 · v287b 26 · v288a 34 · v289 25 · v292a1 27 · v292b 20 = 177
every proof rolled back · residue 0 · no race scaffolding
race: RACE-OC1a/1b/2/3 PASS (v292a1, unchanged) — reported separately
tsc: v281 · v283 · v284 · strictcheck · deploycheck — 0 errors each
replay: ec and eczr rebuilt from CHAIN.txt (79 files), 0 failures each
certify.sh ec → CERTIFICATION COMPLETE, exit 0
```

## 8 · One implementation note worth keeping

`OVERLAPS` is a **reserved temporal operator** in SQL — `(a,b) OVERLAPS (c,d)` —
so a CTE named `overlaps` is a syntax error. The internal CTE is
`window_overlaps`; the envelope field remains `overlaps`, which is what the
ruling required.

## 9 · What v292b deliberately did not build

1. **No capture UI.** v292c. The ceremonies exist; nothing calls them yet.
2. **No Day Sheet.** v292d, and it consumes this projection exclusively.
3. **No resource model**, so no contention claim. Registered future architecture.
4. **No milestone → obligation timing derivation.** Registered candidate.
5. **No change to `projection_day_sheet(date,…)`**, which remains the certified
   date-scoped projection and is not the doctrinal Day Sheet.
