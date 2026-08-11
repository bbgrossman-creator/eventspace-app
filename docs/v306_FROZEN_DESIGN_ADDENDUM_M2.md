# v306 Frozen-Design Addendum — M-2 contract correction

**Bounded correction to the frozen v306 design `de44d131`. Custody, not a rewrite.**
Issued 2026-08-10 under architect ruling accepting Fable audit finding M-2 (Option 1).
The historical design text in `docs/v306_FROZEN_DESIGN_de44d131.md` is preserved verbatim and
is NOT edited; this addendum records what was corrected and why, and governs where it bears.

---

## 1 · The original contradiction

The frozen design `de44d131` is internally inconsistent at exactly the point the Fable audit
flagged:

- **`ADMISSIBILITY_EVALUATE_API_DECISION`** fixes the evaluator return contract at nine columns:
  `admissible, failed_ordinal, condition, condition_class, refusal_code, reason_code, ground,
  rendered_ground, pending_arguments`. There is **no field for a completeness/previewability
  distinction.**
- **`COMPOSITE_RELEASE_MODEL` (R2)** requires `admissibility_evaluate('release_event', booking)`
  to report *"admissible-so-far with a declared `partial_previewability` note … the limitation is
  declared, never silently converted into a behaviour change."*

The nine-column contract cannot carry the note R2 requires. The shipped implementation
faithfully built the nine columns and therefore returned bare `admissible=true` for a
`release_event` verdict that had only reached the seam — the exact "silent conversion" R2 forbids.

Fable reproduced the consequence: `evaluate('release_event', booking)` returned `admissible=true`
for a booking whose single occurrence was cancelled (ceremony refuses `OCCURRENCE_CANCELLED`) and
for a zero-occurrence booking with no acceptance (ceremony refuses `RELEASE_PREDICATE_UNSATISFIED`).
Both were false claims of complete admissibility.

## 2 · Why `evaluation_complete` is required

The distinction R2 demands — "completely evaluated" versus "admissible-so-far, delegated authority
unresolved" — is a genuine property of a composite ceremony and cannot be expressed within the
nine columns without overloading a field or inventing a taxonomy value (both rejected: overloading
`pending_arguments` conflates missing-arguments with un-evaluated-ladders; a new `condition_class`
breaks the S/A/U/W taxonomy of Amendment Four A). The minimum faithful correction is one
additive boolean.

## 3 · The corrected contract — 10 columns

`admissibility_evaluate(p_action_key text, p_subject uuid, p_args jsonb default null)` now returns
the original nine columns **plus** `evaluation_complete boolean`. The pair `(admissible,
evaluation_complete)` is read as:

| admissible | evaluation_complete | Meaning |
|---|---|---|
| false | true | Definitive refusal from authority the evaluator evaluated. |
| true | true | All authority relevant at this contract level evaluated; predicts admissibility. |
| true | false | No refusal found in previewable authority, but deeper/delegated authority is unresolved. **MUST NOT be consumed as an unconditional prediction the ceremony will succeed.** |
| false | false | Not produced by v306; reserved. No legitimate case established, none invented. |

`evaluation_complete` is derived from **actual authority coverage**, not operation-name hardcoding
in the evaluator. The `admissibility_ladder()` authority declares, per action, a `delegates_to`
column: null when the ladder covers the ceremony's full authority, and the delegated action key
when it does not. Exactly one action delegates: `release_event → release_occurrence` (its ladder
ends at rung 2, `single_occurrence`; the ceremony then delegates the occurrence-level authority).
The evaluator sets `evaluation_complete = (delegates_to is null)` on the admissible path and
`= true` on any definitive refusal.

## 4 · release_event

`evaluate('release_event', booking)`:

- **> 1 occurrence** → `RELEASE_OCCURRENCE_AMBIGUOUS`, `admissible=false, evaluation_complete=true`
  (definitive; the ceremony stops here and never delegates).
- **≤ 1 occurrence** → rungs 1–2 pass, ladder ends at the seam → `admissible=true,
  evaluation_complete=false`. The occurrence-level authority the ceremony delegates to
  `release_occurrence` (active / acceptance / clearance / sign-off) is **not** evaluated here.

This ends the false-admissible: the two reproduced counterexamples now return `true/false`
(admissible-so-far, incomplete), not `true` (complete). v306 does **not** implement v307b
occurrence resolution to make the path complete — the v306/v307b boundary is preserved. v307b
seats the delegated evaluation at reserved ordinal 0 and closes the seam.

## 5 · Scope of the correction

- Additive only: one ladder column (`delegates_to`, declared) and one evaluator column
  (`evaluation_complete`, derived).
- **No** existing refusal code, ordinal, rendered ground, argument requirement, subject
  visibility, or authority semantic changed.
- Resolves Fable M-2. Does not touch the Class-U/Class-W boundaries or the write-guard model.

## 6 · What remains deferred

v307b occurrence resolution (the "cleaner alternative, reported not substituted" in `de44d131`)
remains deferred. `evaluation_complete=false` is the honest v306 representation of the seam until
then.
