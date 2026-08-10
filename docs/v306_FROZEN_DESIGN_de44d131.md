# v306 · Frozen Design — recovered report `de44d131`

**Recovered 10 August 2026. This file is custody, not authorship.**

The v306 design was closed on 10 August 2026 in a session whose report was never
exported to any artifact. It survived only inside a Claude session transcript, and a
later session — finding no trace of it in the repository — correctly refused to
implement v306 from a summary and stopped. This file exists so that never recurs.

---

## Provenance

| Field | Value |
|---|---|
| Report ID | `de44d131` |
| Recovered from | `~/.claude/projects/-mnt-c-Users-bbgro-Downloads-eventspace-deploy/45220cd7-b417-414f-ada2-9939eca753a8.jsonl` |
| Record | line 598, role `assistant` |
| Authored | 2026-08-10T17:41:19.326Z |
| Size | 23388 bytes · 173 lines |
| sha256 of reproduced text | `f462f5ba4022832466ee0e7506ee1699149e7cc4406fd8dbac63af900700786d` |
| Recovery report | `e91a4f6d` |

**Report lineage in that session**, all UTC 2026-08-10:

```
14:35:55  user       IN_RESPONSE_TO f77a42d
14:40:36  assistant  7ca600b0   opens from C1: "Class-S predicate functions
                                (13 of them, enumerated at §2.2)"
16:45:29  assistant  eacab67a
17:02:12  assistant  dbfcbb8f
17:10:44  assistant  6dcf9753   the pivot — see Interpretive note below
17:23:47  assistant  a8a7359a   findings X1/X2/X3
17:37:49  user       OWNER RULINGS R1-R5; assigns REPORT_ID de44d131
17:41:19  assistant  de44d131   this document
17:52:14  assistant  4b1e77c2   production-evidence report
```

**Chronology against C1.** `docs/AVAILABILITY_CONSTITUTIONAL_INTEGRATION.md` (C1) was
written 16:57 EDT and `docs/constitutional-record/amendment-three.md` 16:53 EDT on the
same day. `de44d131` postdates C1 ratification by roughly 44 minutes and records the
constitutional layer as *"Green — C1 recorded, R-14 seated."* It is not a competing
architecture authored in ignorance of C1; it is C1's model extended under five explicit
owner rulings.

---

## Interpretive note — why the ladder exists

Recovered verbatim from report `6dcf9753`, 2026-08-10T17:10:44Z, the reasoning that
produced the ordered ladder:

> **Order is unmodelled.** **[C]** R-14.3 says "the same predicates in the same
> conjunction". A conjunction is unordered; a refusal is order-sensitive because only
> the first failure is reported. Thirteen independent functions satisfy R-14.3
> literally and still permit v308 to report a different ground than v307 refuses —
> which is exactly F3, preserved rather than fixed.

The ladder was introduced to make **failure selection** deterministic, not to change
what is true. That reading is now binding law under Amendment Four, Article B.

---

## Binding constraints on any v306 implementation

Established by Amendment Four (`docs/constitutional-record/amendment-four.md`) and by
architect ruling of 10 August 2026. These govern where they bear on the design below.

1. **Truth is conjunctive (Amendment Four · B).** Ordered precedence determines the
   canonical failed predicate and ground reported when the conjunction is false. First-failure
   precedence must never change *whether* an action is admissible.

2. **The taxonomy is S / A / U / W (Amendment Four · A).** `RELEASE_ALREADY_RELEASED` is
   Class-W, a write-time guard. It may appear in the registry for completeness and preview
   mapping. It must never be evaluated as though pre-evaluation proves the write will
   succeed under concurrency.

3. **Class-U boundary — the version rule.** v306 may evaluate the S/A portion without
   Class-U, because v306 is additive and unwired. The resulting `admissible` value **is not
   the complete C1 `availability_verdict` and must not be documented or consumed as
   such.** v307b must incorporate Class-U at reserved ordinal 0 **before** v308 exposes
   availability as consumer or UI authority. Ordinal 0 is reserved for exactly this
   insertion, so seating Class-U renumbers no rung and invalidates no order proof.

4. **The Y3 serialization invariant stands.** `STAFFING_ALREADY_RELEASED` has no unique
   index; the `staffing_requirement` lock is its only protection. v307a must not move,
   widen, weaken, or drop it.

---

## Recovered report — verbatim

Reproduced exactly as authored. **Nothing below this line has been edited, corrected,
reordered, or annotated.** Where it differs from the constraints above, the constraints
govern and this text stands as the historical record of what was designed.

---

Inventory complete. `STAFFING_ALREADY_RELEASED` has **no unique constraint** behind it — a finding that makes the lock load-bearing.

===== CLAUDE REPORT BEGIN =====
REPORT_ID: de44d131
STATUS: COMPLETE
TASK: EventCore task
REPOSITORY: /mnt/c/Users/bbgro/Downloads/eventspace-deploy
FILES_MODIFIED: NO

**OWNER_RULINGS_ACCEPTED:** R1 (W class, write-guard authority preserved), R2 (composite release with declared partial previewability), R3 (IMMUTABLE ladder function), R4 (ordinal 0 reserved for Class-U), R5 (structured operands retained; v308 detail increase declared). All five are implemented in the spec below. No settled choice reopened.

**MISSING_CEREMONY_INSPECTION_RESULT: COMPLETE.** Both bodies read in full, plus the `staffing_release` schema. Four findings, one of which contradicts the current preview.

**CORRECT_STAFFING_ASSIGNMENT_AUTHORITY_MAP** · subject `staffing_assignment`
| Order | Step | Class | Code |
|---|---|---|---|
| 0 | `can_manage_staffing()` | **U** | `STAFFING_NOT_AUTHORIZED` |
| 1 | assignment exists in tenant — **unlocked select** | S | `CEREMONY_NOT_FOUND` |
| — | `for update` on derived `staffing_requirement` | *serialization point* | — |
| 2 | no `staffing_release` for assignment | S | `STAFFING_ALREADY_RELEASED` |
| 3 | `event_closed` absent on derived event | S | `STAFFING_EVENT_CLOSED` |
| 4 | new staff exists and active | A | `STAFFING_STAFF_INVALID` |
| 5 | window well-formed | A | `STAFFING_WINDOW_INVALID` |
Writes (both after all checks): `staffing_release` row, then replacement `staffing_assignment`. Success payload calls `requirement_coverage(v_req)`. No `event_stage` use. Derived subjects: assignment → requirement, assignment → event.

**RELEASE_STAFFING_ASSIGNMENT_AUTHORITY_MAP** · subject `staffing_assignment`
| Order | Step | Class | Code |
|---|---|---|---|
| 0 | `can_manage_staffing()` | **U** | `STAFFING_NOT_AUTHORIZED` |
| 1 | assignment exists in tenant — **unlocked select** | S | `CEREMONY_NOT_FOUND` |
| — | `for update` on derived `staffing_requirement` | *serialization point* | — |
| 2 | no `staffing_release` for assignment | S | `STAFFING_ALREADY_RELEASED` |
Writes: one `staffing_release` row. Success payload calls `requirement_coverage(v_req)`. No `event_stage` use.

**Four findings from these bodies:**

**Y1 — the preview introduces a condition the ceremony does not have.** `action_evaluate` blocks `release_staffing_assignment` when `event_stage(...) = 'closed'` with detail `'event is closed'`. **The ceremony has no `event_closed` check at all.** This is the mirror image of F8: not an omission but an *introduction*, and R-14.3 forbids both. Today availability is *more restrictive* than the ceremony for this action.

**Y2 — existence is checked unlocked, and the lock is on a different relation whose absence is unchecked.** Both ceremonies `select … from staffing_assignment` with no `for update`, then `perform 1 from staffing_requirement … for update` with **no `if not found`**. So the serialization point is on a derived subject and is best-effort. This differs structurally from `start_service`/`close_event`, where existence-check and lock are one statement (F5).

**Y3 — `STAFFING_ALREADY_RELEASED` has no constraint backstop.** Verified in `schema.sql`: `staffing_release` has `PRIMARY KEY (id)` and a **non-unique** `staffing_release_assignment_idx` btree on `(tenant_id, assignment_ref)`. Nothing prevents two release rows for one assignment. Its race safety rests **entirely** on the requirement lock. Contrast `RELEASE_ALREADY_RELEASED`, which has a real `on conflict (tenant_id, occurrence_ref)`. **Consequence: it is Class-S (readable, so a genuine rung), but if v307a moves or drops that lock, double-release becomes possible with nothing to catch it.**

**Y4 — asymmetry, observed not fixed.** `assign_staff` enforces `STAFFING_DUPLICATE_ASSIGNMENT`; `correct_staffing_assignment` does not, so correcting onto an already-assigned staff member is permitted. Recorded as an observed semantic asymmetry. Not a v306 concern and not to be "tidied".

**COMPLETE_ACTION_AUTHORITY_MAP / FINAL_LADDER** — seven actions, 30 in-scope rungs. `U` rungs declared at ordinal 0 but not evaluated; `W` declared but never authoritative in evaluation.

**`start_service`** (event): 1 subject_exists `CEREMONY_NOT_FOUND`/stale_target · 2 event_not_closed `START_SERVICE_EVENT_CLOSED`/already_completed · 3 service_not_started `SERVICE_ALREADY_STARTED`/already_completed · 4 pre_service_obligations_resolved `SERVICE_NOT_READY`/blocked ⟨unresolved⟩ · 5 staffing_covered `SERVICE_STAFFING_UNCOVERED`/blocked. Lock: rung 1 statement.

**`close_event`** (event): 1 subject_exists · 2 event_not_closed `CLOSE_ALREADY_CLOSED` · 3 service_started (**polarity true**) `CLOSE_NOT_IN_SERVICE` · 4 breakdown_resolved `CLOSE_BREAKDOWN_PENDING` ⟨unresolved⟩ · 5 no_open_exception `CLOSE_EXCEPTION_OPEN` ⟨unresolved⟩ · 6 **[A]** closeout_override_supplied `CLOSE_CLOSEOUT_UNRESOLVED`. Lock: rung 1 statement.

**`release_event`** (bookings): 1 booking_exists · 2 single_occurrence `RELEASE_OCCURRENCE_AMBIGUOUS` ⟨count, ordinals⟩ · then **compatibility-write seam** (R2). Lock: rung 1 statement.

**`release_occurrence`** (engagement_occurrence): 1 occurrence_exists · 2 occurrence_active `OCCURRENCE_CANCELLED` · 3 unrescinded_acceptance `RELEASE_PREDICATE_UNSATISFIED: commitment` · 4 **[A]** clearance_supplied `…: clearance` · 5 **[A]** signoff_supplied `…: sign_off` · **W** not_already_materialised `RELEASE_ALREADY_RELEASED`. Lock: rung 1 statement. Note clearance precedes sign-off in the body.

**`assign_staff`** (staffing_requirement): 0 **[U]** · 1 subject_exists · 2 event_not_closed `STAFFING_EVENT_CLOSED` (subject_path requirement→event) · 3 **[A]** staff_valid · 4 **[A]** window_wellformed · 5 **[A]** no_duplicate_assignment. Lock: rung 1 statement.

**`correct_staffing_assignment`** (staffing_assignment): 0 **[U]** · 1 subject_exists (**unlocked**) · 2 already_released `STAFFING_ALREADY_RELEASED` · 3 event_not_closed · 4 **[A]** staff_valid · 5 **[A]** window_wellformed. **Serialization after rung 1, on derived requirement.**

**`release_staffing_assignment`** (staffing_assignment): 0 **[U]** · 1 subject_exists (**unlocked**) · 2 already_released. **Serialization after rung 1, on derived requirement.**

**S_A_U_W_CLASSIFICATION_RESULT:** 20 S, 10 A, 4 U (declared, unevaluated), 1 W. Every condition classified; none forced.

**NEW_EXCEPTION_CLASSES_IF_ANY: NONE.** The four-way taxonomy holds for *conditions*. One **non-condition annotation** is required, and it is not a fifth class: the **serialization point**. Y2 proves the lock is not always co-located with a rung and can sit on a derived relation, so the ladder needs `serialization_after_ordinal` + `serialization_relation` per action — metadata describing where v307a must keep the lock. It authors no refusal, so it is not a condition class.

**EVALUATOR_FAMILY_FINAL_RESULT: SIX, not five — one addition, evidence-driven.** Families 1–5 stand (visibility · execution-fact presence · commitment/occurrence · obligation counting · coverage/assignment, now also serving `staffing_release` presence and `staff` active). **New family 6: argument well-formedness** — pure, `IMMUTABLE`, no database read. Justified by `STAFFING_WINDOW_INVALID` (pure comparison of two timestamps), `CLOSE_CLOSEOUT_UNRESOLVED` and the two release ref-presence checks. Folding pure argument checks into `STABLE` state evaluators would misdeclare volatility and force needless planner conservatism. Not preserved at five for its own sake.

**FINAL_V306_OBJECT_PLAN** — all new; all `SET search_path TO 'public'`; state readers `SECURITY DEFINER` matching every ceremony; pure functions `IMMUTABLE` and INVOKER.

| Object | Volatility | Sec | Inputs | Returns | Surface | Reuses | Serves |
|---|---|---|---|---|---|---|---|
| `admissibility_ladder()` | IMMUTABLE | INVOKER | — | setof rung | **public** | — | all |
| `admissibility_subject_visible` | STABLE | DEFINER | subject_type text, id uuid | boolean | internal | `current_tenant_id` | all rung 1 |
| `admissibility_execution_fact` | STABLE | DEFINER | event uuid, kind text | boolean | internal | `current_tenant_id` | 5 rungs |
| `admissibility_commitment_facts` | STABLE | DEFINER | subject uuid, subject_type text | record | internal | `occurrence_is_active` | release rungs |
| `admissibility_obligation_pending` | STABLE | DEFINER | event uuid, kinds text[], states text[] | int | internal | `obligation_state` | 3 rungs |
| `admissibility_assignment_state` | STABLE | DEFINER | subject uuid, subject_type text | record | internal | `requirement_coverage`, `event_staffing_ready` | staffing + staffing_covered |
| `admissibility_argument_valid` | **IMMUTABLE** | INVOKER | condition text, args jsonb | boolean | internal | — | pure A rungs |
| `admissibility_render_ground` | IMMUTABLE | INVOKER | template text, operands jsonb | text | internal | — | all grounds |
| `admissibility_evaluate` | STABLE | DEFINER | see below | table | **public** | all above | — |
| `admissibility_required_arguments` | IMMUTABLE | INVOKER | action_key text | jsonb | **public** | ladder | Class-A declaration |
| `v306_admissibility()` | — | — | — | marker | — | — | release marker |

**ADMISSIBILITY_EVALUATE_API_DECISION** — the provisional `(action_key, subject uuid)` is **too weak** and is revised:

```
admissibility_evaluate(p_action_key text, p_subject uuid, p_args jsonb default null)
returns table(admissible boolean, failed_ordinal int, condition text, condition_class text,
              refusal_code text, reason_code text, ground jsonb, rendered_ground text,
              pending_arguments text[])
```

Three decisions and why. **Subject stays a bare `uuid`** — all seven subjects are uuid-keyed, and `subject_type` comes from the ladder, not the caller; derived subjects (`requirement→event`, `assignment→requirement→event`) resolve **inside** evaluators via `subject_path`, which is what keeps action-specific logic out of v307/v308. **`p_args` is optional, and its absence is meaningful**: null → Class-A rungs are skipped and named in `pending_arguments`, which is precisely v308's "unavailable-pending-argument" and a direct implementation of R-14.5; supplied → evaluated, which is what v307a needs. One optional parameter serves both consumers. **Rejected alternatives:** per-action signatures (pushes dispatch into consumers), a `subject_type` parameter (caller could lie, and tenancy/identity would depend on caller discipline), and separate `evaluate_state`/`evaluate_args` entry points (splits first-failure ordering across two calls, destroying the one property the ladder exists to own).

**COMPOSITE_RELEASE_MODEL** (R2): `release_event` and `release_occurrence` are **two ladders under two action keys**, not one flattened path. `release_event`'s ladder ends at rung 2; the zero-occurrence compatibility write is recorded as a declared **seam**, not a rung. `admissibility_evaluate('release_event', booking)` is authoritative only up to the seam; for a booking with zero occurrences it reports admissible-so-far with a declared `partial_previewability` note, because the occurrence the later rungs would judge does not yet exist. Nothing is manufactured for a nonexistent subject; the limitation is declared, never silently converted into a behaviour change. **Cleaner alternative, reported not substituted:** `release_event` could resolve-or-declare the occurrence without writing, making the whole path previewable — but that changes when the compatibility row is created, which is observable, so it belongs to v307b or later.

**LOCKING_AND_CONCURRENCY_CONTRACT** — binding on v307a:
1. Evaluators are observational and take **no** locks.
2. `start_service`, `close_event`, `release_event`, `release_occurrence`, `assign_staff`: `CEREMONY_NOT_FOUND` must continue to arise from the **locking** statement (`perform … for update` / `select … for update`). Rung 1 exists to give the *preview* an authority; it must not replace the ceremony's locked lookup.
3. `correct_staffing_assignment`, `release_staffing_assignment`: existence stays **unlocked** and the `for update` stays on the **derived requirement, in the same position** (after existence, before `already_released`). Its unchecked `not found` is preserved as-is.
4. **Y3 is the sharpest constraint: `STAFFING_ALREADY_RELEASED` has no unique index.** The requirement lock is its only protection. Moving, widening or dropping it permits double-release silently.
5. `RELEASE_ALREADY_RELEASED` stays the write-time conflict (R1).
6. Full race set mandatory at v307a and v307b.

**WRITE_GUARD_MODEL** (R1): W rungs appear in the ladder for completeness and preview mapping, carry `in_scope_v306 = false`, and are **never evaluated** by `admissibility_evaluate`. The API contract states explicitly that admissibility does not predict write success under concurrency. Exactly one W condition exists: `RELEASE_ALREADY_RELEASED`.

**GROUND_CONTRACT** (R5): `ground` is `jsonb` carrying operands only; `rendered_ground` reproduces the ceremony string byte-for-byte. Seven templates matter — four operand-bearing (`SERVICE_NOT_READY` ⟨unresolved⟩, `CLOSE_BREAKDOWN_PENDING` ⟨unresolved⟩, `CLOSE_EXCEPTION_OPEN` ⟨unresolved⟩, `RELEASE_OCCURRENCE_AMBIGUOUS` ⟨count, ordinals⟩) and three static-suffix variants of `RELEASE_PREDICATE_UNSATISFIED` that must not collapse into one. Counts are retained in the authority; v308 may surface them as a declared change.

**CLASS_A_DECLARATIONS:** `admissibility_required_arguments(action_key)` projects the ladder's A rungs — argument name, condition, refusal code. **Unwired**; `action_required_fields` is untouched and keeps returning `array[]::text[]` for `close_event` and `release_event`.

**FINAL_DIFFERENTIAL_PROOF_MATRIX:** one discriminating state per in-scope rung (**30**) + one all-pass per action (**7**) = **37**. Method unchanged: fixture → `savepoint` → real ceremony → capture `SQLERRM` → `rollback to savepoint` → evaluate → compare code *and* rendered ground, with time pinned.

**FINAL_ORDER_PROOF_MATRIX:** adjacent pairs only, n−1 per action — 4+5+1+4+4+4+1 = **23**. Mandatory cases: start_service rungs 4/5 (the live F3 divergence) and correct_staffing rungs 2/3 (already_released before event_closed).

**FINAL_NON_LEAK_PROOF_MATRIX:** five subject types (`event`, `bookings`, `engagement_occurrence`, `staffing_requirement`, `staffing_assignment`) × {absent uuid, cross-tenant uuid} = **10**, each asserting ceremony and authority agree *and* that absent and cross-tenant remain mutually indistinguishable.

**FINAL_RACE_PROOF_MATRIX: 5** — the three existing regressions (`v295_race`, `v292d_race`, `v293_race`) plus two new interleavings: concurrent `release_staffing_assignment` on one assignment must yield exactly one release (Y3, the constraint-free case), and concurrent `release_occurrence` must yield exactly one `RELEASE_ALREADY_RELEASED` (the W guard).

**FINAL_STRUCTURAL_PROOFS: 6** — totality; injectivity; ordinal integrity (contiguous, 0 reserved); template/operand coverage; no-reference; **exclusion-registry integrity**. That last one answers the escape-hatch concern directly: every code excluded from rungs must appear on a declared exclusion list with class U or W *and a named reason*, and the totality proof fails if a ceremony code is neither a rung nor an explicitly registered exclusion. "Declared out of scope" cannot be asserted implicitly, so totality cannot go vacuous. The current exclusion list is exactly five entries: four `STAFFING_NOT_AUTHORIZED` (U) and one `RELEASE_ALREADY_RELEASED` (W).

**FINAL_MUTATION_CONTROLS: 7** — rung always-passes → differential fails · adjacent transposition → order fails · operand dropped → ground equality fails · tenant scoping altered → non-leak fails · ceremony code added with no rung → totality fails · **exclusion entry removed → totality fails** · **Class-A rung skipped when args supplied → differential fails**. Run against a scratch copy inside a rolled-back transaction; the shipped artifact is never left altered.

**FINAL_ESTIMATED_ASSERTION_COUNT: ~92 discriminating** — 37 differential, 23 order, 7 ground equality, 10 non-leak, 5 race, 6 structural, 2 W-guard controls, 2 composite-release controls. Plus 7 mutation controls counted separately as proof-system validation. The rise from the provisional 69 is inventory growth (4 actions → 7), not padding; every assertion fails for a distinct reason.

**V306_FILE_SET** — five, per the v305 convention: `supabase/v306_admissibility.sql` · `supabase/tests/v306_permanent_proof.sql` · `proofs/v306_proofs.sh` · `ec/manifests/v306.manifest` · `ec/deploy-manifests/v306.deploy`. Migration shape: `begin;` → `do $preflight$` asserting `v306_admissibility` absent, each new object absent, and `execution_evidence` / `obligation` / `engagement_occurrence` / `staffing_requirement` / `staffing_assignment` / `staffing_release` present → objects → marker → `commit;`. **None created — the evidence gate holds.**

**V306_ZERO_BEHAVIOR_CHANGE_ARGUMENT:** structural, not statistical. Every object is new; no existing function, view, trigger, policy or client path is altered; no data migrates; no constraint is added. The no-reference proof establishes that no existing consumer references any new object — if nothing calls it, nothing can change. The differential suite proves the authority is *correct*; the no-reference proof proves the release is *inert*. Both are needed and they prove different things.

**V307A_READINESS:** ready in principle. Its migration is mechanical — replace inline conditions with one `admissibility_evaluate` call per ceremony, preserving locks per the contract above, re-raising the returned `refusal_code` with `rendered_ground`. Its proof is this same differential suite re-run against migrated ceremonies. Two hazards to carry: the Y3 lock and the R1 write-guard.

**V307B_BOUNDARY:** Class-U enforcement only. Adds `action_authorized`-family checks at ordinal 0, where four ceremonies already place them and where `start_service`/`close_event` currently have none. Refusal precedence must match the preview's, where unauthorized outranks the base verdict. Separately certified with its own negative controls and full race set. Not collapsed into v307a.

**V308_DECLARED_CHANGE_FORECAST — five, one newly discovered:**
1. **NEW (Y1):** `release_staffing_assignment` becomes *available* on a closed event, because the ceremony never blocked it. The preview becomes less restrictive — the opposite direction from every other correction, so it needs explicit declaration.
2. `start_service` blocked-detail order corrects to the ceremony's (F3).
3. `release_event` gains occurrence-active and occurrence-uniqueness (F8).
4. `close_event` reports unavailable-pending-argument rather than plain availability.
5. Count operands surface in preview detail (R5).
Plus the retirement of `action_reason_of`'s `LIKE`-based inference wherever the ladder now supplies reason identity.

**V310_EVENT_STAGE_COMPATIBILITY_FINDING — carried forward and sharpened.** `start_service` and `close_event` both return `jsonb_build_object('event_id', …, 'stage', public.event_stage(p_event))`. Retiring `event_stage` therefore **changes externally observable ceremony return payloads**, so v310 cannot be described as internal cleanup. Compatibility work implied, not implemented: either replace the `stage` key with a projection over v305's canonical execution facts, or declare the payload change and migrate every client reading `.stage`. C1 Part 4's caller inventory should be extended to include these two success-path uses, which a read-of-`event_stage` scan would catch but a caller-of-`event_stage_detail` scan would not.

**PRODUCTION_EVIDENCE_GATE_STATUS: OUTSTANDING and untouched.** No v306 artifacts, no manifest edits (so no pending digest invalidated), no staging, no commits, no deployment, no `min_release` declared, no production state inferred. The operator step is unchanged from report dbfcbb8f, so I am **not** re-issuing it.

**IMPLEMENTATION_READY_STATUS: YES — design-complete for all seven ceremonies.** No stop condition fired: no C1/R-14 contradiction, no misclassified condition left in Class-S, the taxonomy held, the API preserves semantics without hidden action-specific behaviour, and v306 remains structurally zero-behaviour-change. The production-evidence gate is the sole remaining external blocker.

**FILES_MODIFIED: NO.** No documentation correction proved necessary; the design record is not false anywhere, so nothing was changed opportunistically.

**WORKTREE_PRESERVATION_RESULT: PRESERVED.** Read-only throughout. No reset, clean, checkout, restore, add, stage or commit. Inherited state intact: 3 pre-existing modified tracked files, the four constitutional files from workflow 6, nothing staged.

**RELAY_CARRIED_FINDINGS — both carried, neither acted on, neither erased:**
1. Intermittent `"Approval not activatable: no-command-node. Manual approval required."` on some non-Bash Write/Edit ceremonies, against later workflows that wrote files autonomously. Both observations stand.
2. **New:** a post-freeze return-path stall — a completed report held at *"Report observed once; waiting for a second stable observation before returning it"*, requiring operator delivery after roughly two minutes. This is a **zero-intervention defect after the freeze**, and it is recorded as such rather than absorbed by the workflows that did complete cleanly.
Both are Relay findings, not EventCore blockers. RC4.29 remains frozen and uninspected. This workflow: 4 operations, all read-only, zero interruptions.

**BLOCKERS:** one — **v305 production evidence**. Design work is complete and needs nothing further.

**NEXT_REQUIRED_PRODUCT_ACTION:** run the v305 production ceremony (unchanged). On a clean grade: commit the ten enumerated v304/v305 artifacts as one explicit bounded stage, then implement v306 against this specification. ChatGPT's review of this closure can proceed in parallel; the five earlier owner decisions are ratified, and the only new items needing a ruling are informational — Y1's direction-reversing v308 change and Y4's asymmetry, neither of which blocks implementation.

**PROJECT_BAROMETER**

| Axis | Reading |
|---|---|
| Constitutional layer | **Green** — C1 recorded, R-14 seated |
| v306 specification | **Green — closed for all 7 ceremonies** |
| Authority model | **Green** — S/A/U/W held; one non-condition annotation added on evidence |
| Concurrency safety | **Amber, understood** — Y3 leaves one guard with no constraint backstop; documented as v307a's sharpest constraint |
| Release chain | **Amber** — one read-only query outstanding |
| Scope discipline | **Green** — no Class-U, no deferred vocabulary, no edits, no artifacts |
| Relay | **Green as infrastructure, two open findings carried** |
| Worktree | **Preserved** |

Closing the last two bodies was worth the workflow. They produced a preview that forbids what the ceremony allows (Y1), a serialization point on a derived relation with an unchecked lookup (Y2), and a duplicate guard with no unique index behind it (Y3) — the last of which would have been the easiest thing in the sequence to break during v307a, and the hardest to detect afterwards.
===== CLAUDE REPORT END =====
