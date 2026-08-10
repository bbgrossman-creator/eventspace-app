# Availability Constitutional Integration

## Constitutional instrument · C1 · RATIFIED 10 August 2026 · v306 authorized

**Ratification.** Ratified as a whole by the owner on 10 August 2026. A‑1, A‑2, A‑3 and A‑4
are each RATIFIED as drafted; no substance was altered in recording. Recorded at
`docs/constitutional-record/amendment-three.md` under the convention of Amendments One and
Two, with R‑14 seated in place in the operative Atlas text
(`docs/RESPONSIBILITY_OS_CONSTITUTION.md` §7) per owner rulings A6 and A5. Implementation of
**v306 is authorized**; no later release in the sequence is.

**Standing.** Constitutional work under Operational Constitution Freeze F‑I2. Produces a
document before it produces code. C1 remains document‑only: no version number, no manifest,
no marker, no migration, no deployment. The `obligation_state` → `responsibility_state`
re‑vocabulary of §2.4 remains deferred and must not be folded into v306–v310.

**Ratified ruling this instrument integrates** (2026‑08‑06, owner):

> A ceremony is the sole authority that determines operational admissibility. Availability
> is a derived preview of ceremony admissibility. Availability may summarize, explain, or
> project the ceremony's expected outcome, but it may not introduce, omit, or alter business
> conditions. Both availability and ceremony admissibility shall derive from the same
> canonical predicate source.

**Investigation status.** Accepted and closed. This instrument does not reopen it and cites
its evidence only where a boundary depends on a specific call site.

---

# Part 1 · The minimal constitutional amendments

Minimality is tested against Framework Article VI (amendment bars), VI.3 (the corpus grows
only on proof), and VII.2 (prefer reduction to expansion). Four amendments are required.
Nothing else in the corpus moves.

## A‑1 · Framework, Article III — locate the question

**Defect.** The Article III jurisdiction matrix is declared exhaustive for the questions the
corpus can be asked. The question the ruling answers —

> *May this act be performed now, and on what grounds?*

— appears nowhere in it. The three nearest rows govern adjacent questions and not this one:
*"When is work discharged, lapsed, void or superseded?"* (Atlas) is about a subject's state,
not about an act's acceptability; *"How is a capability met by an operator?"* (Interaction)
is expression; PC‑7.4's next action (Product) is selection over grounds, not admission.

Under IV.4 clause 3 an absent question is **unlocated**, and VII.4 holds that silence is not
permission. Locating it is constitutional work. It cannot be located by implementation, and
VII.5 forbids inferring the location from what was built.

**Amendment.** Add one row to the Article III matrix:

| Constitutional question | Governing document |
|---|---|
| Is this act admissible now, and on what grounds? | **Atlas** |

**Derivation of the assignment.** Apply the three tests of III.1 to the statement
*"`start_service` is admissible for event X as of moment T"*:

- *Is there a counterparty?* No. Admission is internal; the counterparty's act (acceptance)
  is already discharged into Atlas at release (V.1, first transfer).
- *Is it a claim about a subject?* **Yes.** It is a claim about an event, composed from
  evidence, answerable as of a moment — every property Atlas governs.
- *Is it a thing we hold?* No. It is not an artefact and cannot be outdated, only wrong.

One test is satisfied; the assignment is unambiguous. Product is excluded by V ("Product
decides belonging… it may not say what makes one of those facts true"); Interaction by V
("Interaction expresses. It does not decide what is expressed"); the Freeze by IV.2 Level 5
(it governs *when*, not *what*).

**Bar.** Framework amendment — highest, per VI.1. **VI.3 is not triggered**: no document is
added, no jurisdiction is created, and no truth failing all three tests has been claimed.
This is a location, not a growth.

## A‑2 · Atlas — one new law, R‑14 · Admissibility

**Defect.** Once located, Atlas is the governing document, and Atlas has no article stating
what admissibility is, where it is authored, or who may restate it. R‑1…R‑13 are silent on
the point.

**Why R‑9 and R‑13 are insufficient.** R‑9 makes projections non‑authoritative and requires
caches be reproducible from source. R‑13 forbids presentation from feeding derivation. The
observed defect satisfies neither prohibition: `action_evaluate` writes nothing, feeds
nothing inward, and is independently reproducible. Its defect is that it **restates** a rule
it does not author. R‑9's "reproducible from source" is satisfied by any function that
happens to agree; the ruling requires that availability and ceremony be the **same
predicate**, not two predicates that agree. *Agreement is a test. Identity is a
construction.* No existing law compels identity, so the ruling cannot be derived and must be
enacted.

**Amendment.** Add to the Responsibility OS Constitution's invariant registry:

> **R‑14 · Admissibility is authored once.**
>
> **R‑14.1** A ceremony's *admissibility* is the conjunction of its preconditions, evaluated
> over canonical truth as of a moment. It is derived and re‑derivable, never stored
> (PC‑9.12, Framework VII.8 — restated here by citation only).
>
> **R‑14.2** Each precondition is authored in exactly one named predicate. A ceremony
> enforces a precondition by calling its predicate. **No other function may restate it.**
> Restatement refuses: `ADMISSIBILITY_RESTATED`.
>
> **R‑14.3** Any projection that answers *"may this act be performed"* is a **preview**. It
> must evaluate the same predicates in the same conjunction. It may vary wording only
> (R‑13, PC‑7.10). It may not introduce, omit, or alter a condition.
>
> **R‑14.4** A refusal code and the corresponding preview reason code derive from the same
> predicate identity, so that a refusal and the preview that failed to anticipate it are
> mechanically comparable.
>
> **R‑14.5** A precondition that cannot be evaluated without the proposed act's arguments is
> **declared**, not silently omitted. An undeclared argument predicate is the same defect as
> an omitted subject predicate.

**F‑C2 test — is this invented ontology?** No. R‑14 names a relationship among objects the
corpus already rules (ceremony, evidence, fact‑as‑of‑a‑moment, projection). It adds no
object, and per VII.2 it *reduces* — it removes an implementation freedom rather than
creating a thing. R‑14.5 is the only clause introducing a distinction not previously named,
and that distinction is derived in Part 2 from the existing ceremony bodies rather than
proposed.

**Bar.** Highest — ratification required (VI.1, Atlas row). Ground: a demonstrated
contradiction between two functions claiming one answer.

## A‑3 · Freeze — erratum E‑4, the unregistered duplicate authority

**Defect.** E‑3 names four grandfathered duplicate authorities and F‑C2 forbids a fifth
joining them. Per‑action availability is a fifth **in fact** and is unregistered: it answers
a question the ceremony also answers, in independently written conditions. Framework VIII.2
records the repository count as four; the count is wrong as written.

**Amendment.** Record a fourth erratum:

> **E‑4 · Per‑action availability was found to be an unregistered duplicate authority.**
> Its remedy is **binding, not retirement**: under R‑14 an availability projection that
> evaluates the canonical predicates is a preview and not a second authority, and once bound
> it ceases to be a duplicate. Until it is bound it is counted with E‑3's four. It sets no
> precedent, and the prohibition on a fifth is unrelaxed.

This preserves VI.4 — what was constitutional on a given date remains knowable — and
corrects VIII.2's count with the reason attached rather than by silent renumbering.

**Bar.** F‑R1–F‑R4 only. Ground: **F‑R4 · constitutional inconsistency** — E‑3's enumeration
is inconsistent with the repository, located by citation. **F‑R5 does not apply**: this is
not an elegance argument, and the erratum would be required even if the current
implementation were considered well‑formed.

## A‑4 · Freeze — F‑4 / F‑6 boundary note, admissibility is not readiness

**Defect, stated as an F‑R1 case.** F‑4 requires that *"Only `impedes` moves a verdict —
never risk, completeness, ownership or lateness."* In the canonical stack an open exception
is carried as **risk** (`risk_findings` emits it as an `exceptions` count alongside
`lapse_soon` and `unowned`), therefore non‑impeding, therefore it cannot move a readiness
verdict. The `close_event` ceremony refuses on an open exception
(`CLOSE_EXCEPTION_OPEN`). A single predicate set cannot honour both: if admissibility is
sourced from readiness, `close_event` silently stops refusing; if readiness is sourced from
admissibility, F‑4 is violated. Two frozen positions, one named case — F‑R1 satisfied.

**Amendment.** Add to F‑4 *Must preserve*:

> Readiness answers whether anything is in the way of the work. It does not answer whether a
> ceremony will accept an act. **Admissibility predicates are a distinct family** and may
> include conditions readiness classifies as non‑impeding. A readiness verdict is never an
> admissibility verdict, and neither is derived from the other.

And to F‑6 *Must preserve*:

> The next action is selected over readiness grounds. It asserts no admissibility. That an
> action was selected is not a statement that a ceremony would accept it.

**Why this amendment is not optional.** Without it the derivation from the ruling's words
"the same canonical predicate source" runs directly into `occurrence_readiness`, which is the
most canonical composed verdict in the system and the wrong one. The amendment is the guard
rail that prevents a correct reading of the ruling from producing an incorrect
implementation.

## What is *not* amended

- **No new constitution.** VI.3 is not triggered; no truth fails all three tests.
- **Product Constitution — unchanged.** PC‑9.14 ("gates never cause… a gate reports whether
  conditions are met") already governs the preview's non‑causality, PC‑9.5 its
  non‑commitment, PC‑7.10 its wording, PC‑7.4 the next action, PC‑9.7 its decomposition to
  grounds. The ruling requires nothing Product does not already say.
- **Interaction Constitution — unchanged.** Wording variance between preview and refusal is
  already licensed; no new pattern is legislated.
- **Dependency Map — unchanged.** It explains propagation. Admissibility is not propagation.
- **Engagement, Knowledge — unchanged.**
- **`event_stage` retirement requires no amendment.** It is already authorized by F‑C1
  (retire the grandfathered duplicates) and already scheduled by F‑I3 (retirement should not
  be deferred indefinitely). Retirement is implementation under settled law.

---

# Part 2 · The shared predicate boundary

## 2.1 Definition

A **predicate** is a named, tenant‑scoped, `STABLE` function over *(subject, as‑of moment)*
that returns a verdict together with its ground, that is authored exactly once, and that
answers exactly one precondition of one ceremony family.

The **predicate boundary** is the set of these functions.

- **Above the boundary** — ceremonies, which enforce by conjunction and write; and previews,
  which report the same conjunction and never write.
- **Below the boundary** — canonical truth: Atlas facts, evidence, responsibility state,
  promise facts.
- **Across the boundary** — nothing but predicate calls. A ceremony that inlines a condition
  and a preview that restates one are the same violation of R‑14.2, differing only in which
  side they sit on.

The boundary is defined at the level of the **predicate**, not the state vocabulary. A
predicate's internal vocabulary is an implementation detail so that a later change of
vocabulary is provable as predicate‑identity‑preserving rather than as a diffuse behaviour
change.

## 2.2 The three predicate classes

The classification is derived from the ceremony bodies as they exist, not proposed.

### Class S · Subject predicates

Evaluable from *(tenant, subject, moment)* alone. Fully previewable. **Availability's verdict
is the conjunction of Class‑S predicates and Class‑U authority, and of nothing else.**

| Predicate | Ceremony refusal it authors |
|---|---|
| subject exists in tenant | `CEREMONY_NOT_FOUND` (I‑40, no existence leak) |
| occurrence is active | `OCCURRENCE_CANCELLED` |
| unrescinded acceptance exists | `RELEASE_PREDICATE_UNSATISFIED: commitment` |
| engagement holds exactly one occurrence | `RELEASE_OCCURRENCE_AMBIGUOUS` |
| event already materialised for occurrence | `RELEASE_ALREADY_RELEASED` |
| `event_closed` fact present | `START_SERVICE_EVENT_CLOSED`, `CLOSE_ALREADY_CLOSED`, `STAFFING_EVENT_CLOSED` |
| `service_start` fact present | `SERVICE_ALREADY_STARTED` |
| `service_start` fact absent | `CLOSE_NOT_IN_SERVICE` |
| pre‑service obligations all resolved | `SERVICE_NOT_READY` |
| staffing coverage met | `SERVICE_STAFFING_UNCOVERED` |
| breakdown obligations resolved | `CLOSE_BREAKDOWN_PENDING` |
| no open exception on the event | `CLOSE_EXCEPTION_OPEN` |
| assignment not already released | staffing `already_completed` |

### Class A · Argument predicates

Not evaluable from the subject; they require the proposed act's arguments.

| Predicate | Ceremony refusal it authors |
|---|---|
| closeout override supplied | `CLOSE_CLOSEOUT_UNRESOLVED` |
| sign‑off reference supplied | `RELEASE_PREDICATE_UNSATISFIED: sign_off` |
| clearance or waiver reference supplied | `RELEASE_PREDICATE_UNSATISFIED: clearance` |
| staff exists and is active | `STAFFING_STAFF_INVALID` |
| window well‑formed (`end > start`, both present) | `STAFFING_WINDOW_INVALID` |
| no live assignment for (requirement, staff) | `STAFFING_DUPLICATE_ASSIGNMENT` |
| evidence kind in the closed vocabulary | `EVIDENCE_KIND_INVALID` |
| evidence event agrees with obligation's event | `EVIDENCE_EVENT_MISMATCH` |

**The rule for Class A (R‑14.5).** A preview may not report `available: true` where a Class‑A
predicate exists and is undeclared. It must **declare the required arguments**. The
declaration channel already exists — `action_required_fields` — and is materially incomplete:
`close_event` and `release_event` both declare the empty array while both carry Class‑A
predicates that will refuse.

Formally:

```
availability_verdict(action, subject) =
      ⋀ Class‑S predicates(subject)
    ∧   Class‑U authority(action)
  qualified by
      declared Class‑A obligations(action)
```

Availability is a preview of *admissibility given arguments*. The arguments must be named, or
the preview is asserting a conjunction it did not evaluate.

### Class U · Authority predicates

`action_authorized` and its constituents (`is_active_member`, `can_manage_staffing`, …).

**Finding governing this class.** Authority is enforced inconsistently at the ceremony
boundary. `assign_staff`, `correct_staffing_assignment`, `release_staffing_assignment`,
`release_promise` and the venue ceremonies each enforce their own. **`start_service` and
`close_event` enforce none** — their only authority gate is `perform_event_action`, and
`src/lib/execution/spine.ts` calls both RPCs directly, bypassing it. Under the ruling's first
sentence the ceremony is the sole authority; a Class‑U predicate living only in the
availability/dispatch layer is precisely the inversion the ruling forbids. Class‑U predicates
must sit inside the ceremony body.

*(Deployed grant posture was not verified — the captured baseline carries no ACLs. The
assertion here is about the code path, not about what the grants currently permit.)*

## 2.3 What the boundary is not

- **Not `occurrence_readiness`.** F‑4 readiness answers impediment; admissibility answers
  acceptance. `CLOSE_EXCEPTION_OPEN` is admissibility‑blocking and readiness‑non‑impeding.
  See A‑4.
- **Not `occurrence_phase`.** Phase enumerates `preparing | released | settled | cancelled`
  and carries no `in_service` or `closed`. The Class‑S fact predicates for service start and
  close derive from evidence — `occurrence_execution_facts.by_kind`, shipped v305 for exactly
  this purpose — never from a phase token. v305's refusal to synthesise a progress label is
  load‑bearing here and must not be undone.
- **Not `event_stage`.** See Part 4.
- **Not the command dispatcher.** `perform_event_action` never calls `action_evaluate`; it
  dispatches straight to the ceremony. That is correct and must stay correct: the preview is
  not in the write path, and binding it must not put it there (PC‑9.14 — gates never cause).

## 2.4 The one open value

Class‑S obligation predicates are today stated in `obligation_state` vocabulary —
`invalidated | exception | complete | active | ready | blocked`. Canonical composition is
stated in `responsibility_state` vocabulary — `superseded | void | discharged | lapsed |
derived | standing | active`. **These are not interconvertible.** `exception` exists only in
the former. `lapsed` and `derived` exist only in the latter, and `responsibility_state`
additionally incorporates ownership and the clock, which `obligation_state` does not.

Consequently, re‑stating admissibility predicates in canonical vocabulary changes ceremony
behaviour in two directions unless done deliberately: an exception would stop blocking
`close_event`, and a lapsed or ownerless responsibility would begin blocking `start_service`.

**The value to be supplied:** whether admissibility predicates are stated in responsibility
vocabulary and, if so, how `exception` is expressed — it must remain admissibility‑blocking
for `close_event` while remaining non‑impeding for readiness (A‑4).

This is one value, of the same kind as F‑5's ranking. **Supplying it completes the boundary;
it does not reopen it.** Until it is supplied, predicate bodies preserve current vocabulary
and the re‑vocabulary is a separate, later release (Part 3, deferred).

---

# Part 3 · Revised migration and version plan

Constraints: F‑I2 (a release is exactly one kind, declared); F‑I3 (E‑3 retirement not
deferred indefinitely); the established release convention (one migration, one‑shot proofs,
permanent proof, deploy manifest, `min_release` chain). Last deployed release: **v305**.

**Ordering invariant.** `predicates → ceremonies → availability → duplicate previews →
retirement`. Any other order requires at least one release in which two truths knowingly
coexist.

## C1 · Constitutional work — Admissibility

Document only. Carries no version number, no manifest, no marker, no migration; a
version‑numbered release in this project is a deployment, and C1 deploys nothing. Ratifies
A‑1 through A‑4. This file is its draft. **Ratified before v306 begins.**

## v306 · Implementation — the predicate boundary

Strictly additive. Creates the named Class‑S predicate functions, each returning verdict plus
ground, each a faithful restatement of the condition **as the ceremony enforces it today** —
current vocabulary preserved, no behaviour change anywhere. No ceremony modified, no consumer
migrated, no identity signature changed.

Proof obligation: for every predicate, a differential proof that the predicate agrees with
the ceremony's outcome on that condition in isolation, with negative controls. This is the
only release in the sequence whose correctness is provable without changing any observable
answer, which makes it the load‑bearing evidence for everything after it.

`min_release v305`.

## v307 · Implementation — ceremonies call the predicates

Each ceremony's precondition becomes a call rather than a restatement. Class‑U predicates
move **into** `start_service` and `close_event`. Identity signatures unchanged
(`create or replace`, same argument lists), so no composed version guard moves.

One declared behaviour change: direct‑RPC `start_service` / `close_event` begin enforcing
authority. This is a **correction of a defect, not a contract change** — it must be declared
as such, proved with a negative control, and not smuggled in as a refactor.

Highest‑risk release in the sequence; carries the full race‑regress set.

## v308 · Implementation — availability derives from the predicates

`action_evaluate` rewritten as the conjunction of the same predicate calls.
`action_required_fields` completed for the Class‑A predicates. `available_actions` and
`event_available_actions` unchanged in shape. Reason codes derived from predicate identity
(R‑14.4).

Declared verdict changes — each a movement of the preview toward the ceremony, with the
ceremony stationary:

1. `start_service` becomes available on an event carrying zero pre‑service obligations. The
   `v_pre_total > 0` clause is availability's own; the ceremony never had it.
2. `close_event` becomes unavailable‑pending‑argument where the closeout override is
   undeclared, in place of reporting plain availability against a ceremony that will refuse.
3. `release_event` gains the occurrence‑active, occurrence‑uniqueness and per‑occurrence
   targeting predicates, and stops reporting `already_completed` for an engagement in which
   only one of several occurrences has been released.

## v309 · Implementation — the duplicate previews retire

`event_workspace.next_actions` becomes a projection of `action_evaluate` or is removed in
favour of the existing `actions` key. `event_stage_detail.next_action` and `.blockers` reduce
to wording over predicate grounds. React‑side gating is removed: `EventLifecycle.tsx`'s stage
conditionals and `EventWorkspace.tsx`'s `!override` disable become renderings of declared
required fields rather than rules. Browser suites re‑accepted.

## v310 · Implementation — `event_stage` retirement

Only here is it callerless. Drops `event_stage`, `event_stage_detail` and `event_readiness`
(E‑3's second entry). Rollback custody is already captured in
`proofs/v305_legacy_definitions.sql` and `proofs/r2_command_path_definitions.sql`. Requires a
non‑reference proof over `pg_proc.prosrc` in `public`, mirroring the NA‑4 / EF‑5 pattern
already used at v304 and v305.

## Deferred, explicitly

`obligation_state` → `responsibility_state` predicate re‑vocabulary (E‑3's first entry). A
separate release, gated on the open value of §2.4. **It must not be folded into v306–v310**:
doing so converts every predicate proof into a simultaneous behaviour‑change proof and
forfeits the only clean evidence base in the plan.

---

# Part 4 · Every caller that must migrate off `event_stage`

Canonical source is `db/captured/functions.sql`; `db/captured/schema.sql` mirrors it and the
two custody archives duplicate it deliberately.

## 4.1 SQL — reads of `event_stage`

| # | Call site | Values consumed | Becomes |
|---|---|---|---|
| 1 | `action_evaluate` · `start_service` branch — `functions.sql:273` | `ready`, `in_service`, `closed` | closed‑fact, service‑start‑fact, pre‑service‑resolved, staffing‑covered predicates |
| 2 | `action_evaluate` · `close_event` branch — `:281` | `closed`, `in_service` | closed‑fact, service‑start‑fact predicates (breakdown and exception already inlined) |
| 3 | `action_evaluate` · `record_execution_evidence` branch — `:293` | `closed` | closed‑fact predicate |
| 4 | `action_evaluate` · `assign_staff` branch — `:296` | `closed` | closed‑fact predicate |
| 5 | `action_evaluate` · staffing correct/release branch — `:302` | `closed` | closed‑fact predicate |
| 6 | `close_event` return envelope — `:1585` | returns `stage` | returns facts, or drops the key — declared contract change |
| 7 | `start_service` return envelope — `:7827` | returns `stage` | as above |
| 8 | `event_stage_detail` — `:2991` | whole body | retires with `event_stage`; wording moves client‑side under R‑13, blockers become predicate grounds |
| 9 | `event_workspace` — `:3061` (`v_stage`), `:3110` (`lifecycle` key) | `in_service` for the closeout‑seam blocker | predicates |
| 10 | `event_workspace.next_actions` — `:3162`ff | `ready`, `in_service` | projection of `action_evaluate` |

`event_readiness` is not a caller but retires alongside, as the third name in E‑3's second
entry.

**Load‑bearing observation for the retirement.** Across every consumer, `released` and
`in_prep` are distinguished in exactly one place: the `v_why` / `v_next` narrative strings of
`event_stage_detail`. `event_stage_detail`'s blocker branch treats them identically. Nothing
else in SQL or in the client reads either value. The activity heuristic that produces the
distinction therefore has **no successor and needs none** — consistent with v305's ruling
that a collapsed progress token would create an unowned authority.

## 4.2 Client — TypeScript

| # | Site | Nature | Disposition |
|---|---|---|---|
| 11 | `src/lib/execution/spine.ts:150` `getEventStageDetail` | RPC wrapper | migrate or delete |
| 12 | `src/lib/execution/spine.ts:156` `getEventStage` | RPC wrapper | delete — no successor for the values it uniquely exposes |
| 13 | `spine.ts:136,138,182,206` — `EventStage`, `EventStageDetail`, `WsHeader.stage`, `EventWorkspace.lifecycle` | type surface | re‑typed at v309 |
| 14 | `spine.ts:163,171` — direct `start_service` / `close_event` RPCs | bypasses `perform_event_action`; carries the Class‑U finding | migrates at v307/v309 |
| 15 | `src/components/execution/EventLifecycle.tsx:54,59,101,107` | stage rail **and button gating on `detail.stage`** — a third availability implementation, in React | migrates to declared actions |
| 16 | `src/components/execution/EventWorkspace.tsx:70,83,87` stage chip and rail; `:95–111` renders `next_actions`; `:103` `!override` disable | the `!override` disable is presently the **only** pre‑invocation enforcement of the closeout Class‑A predicate anywhere in the system | becomes a rendering of declared required fields |
| 17 | `src/lib/projection/types.ts:31` | comment only, no runtime dependency | update with the retirement |
| 18 | `src/components/execution/ActionPanel.tsx` | pure renderer of `available_actions` | **no migration required** — this is the compliant pattern the others converge on |

## 4.3 Test and harness surfaces

| # | Site | Disposition |
|---|---|---|
| 19 | `browser-tests/mock-supabase.ts:32,41` — mocks `event_stage_detail`, derives `event_stage` from it | both stubs retire |
| 20 | `browser-tests/event-ops.harness.tsx`, `accept-workspace.mjs`, `accept-actions.mjs`, `accept-staffing.mjs` — consume `data-lifecycle-stage`, `data-ws-stage`, `data-start-service`, `data-action-available` | re‑accepted at v309 |
| 21 | `supabase/tests/v303_permanent_proof.sql:46`, `supabase/tests/v304_permanent_proof.sql:360`, `proofs/v304_proofs.sh:53`, `proofs/v305_proofs.sh:56` | **negative controls asserting non‑reference.** Preserve through retirement, then extend to the retirement release itself |

## 4.4 Custody archives — not callers, do not migrate

`proofs/v305_legacy_definitions.sql`, `proofs/r2_command_path_definitions.sql`,
`db/captured/functions.sql`, `db/captured/schema.sql`. Rollback sources, frozen by their own
headers.

## 4.5 Totals

**10 SQL call sites across 6 function bodies · 8 client sites across 4 modules · 6
test/harness surfaces · 4 negative‑control proofs to preserve · 3 custody archives to leave
untouched · 1 consumer already compliant.**
