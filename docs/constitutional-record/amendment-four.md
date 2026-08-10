# Amendment Four to the EventCore Constitutional Framework

**Adopted 10 August 2026. Amendments One, Two and Three stand unaltered.**

This amendment reconciles instrument **C1 · Admissibility** — adopted the same day by
Amendment Three — with the owner rulings issued after C1's ratification during v306 design
closure, and with the recovered frozen design `de44d131`.

C1 is not rewritten. Its ratified text stands as adopted. This amendment supersedes two of
its provisions **prospectively and by name**, and adds one interpretive provision. A reader
of C1 must read it together with this amendment; a reader of this amendment can see exactly
what C1 said before it.

Adopted under the cumulative rule settled by owner ruling A5: RFC-form amendment is the
**vehicle**, owner ratification is the **authorization**, and neither substitutes for the
other. The authorizations recorded here were given as design rulings R1–R5 on
10 August 2026 at 17:37:49Z, and by architect ruling on the same date. This amendment is the
vehicle those authorizations lacked.

---

## The rulings this amendment integrates

**Owner ruling R1**, 10 August 2026, verbatim in the operative part:

> `RELEASE_ALREADY_RELEASED` is a write-time guard, not a Class-S ceremony rung.
> Preserve the existing race-safe unique-constraint / insert-on-conflict authority at
> execution time. It may be previewed as an informative state where appropriate, but no
> readable precheck may replace, weaken, or become authoritative over the write-time
> conflict.
>
> The v306 authority model must explicitly distinguish:
>
> - S = state/admissibility predicate
> - A = required act argument
> - U = authority
> - W = write-time guard
>
> A W condition may be represented in the specification/registry for completeness and
> preview mapping, but `admissibility_evaluate` must not pretend that evaluating it proves
> the write can subsequently succeed under concurrency.

**Architect ruling**, 10 August 2026, on conjunction and precedence:

> Availability truth is conjunctive. Ordered admissibility precedence does not alter truth;
> it determines the canonical failed predicate and ground reported when the conjunction is
> false.

Two amendments and one interpretive provision are required to seat these. Nothing else in
the corpus moves.

---

## A · C1 §2.2 — the taxonomy is four classes, and `RELEASE_ALREADY_RELEASED` is not Class-S

### Defect

C1 §2.2 declares three predicate classes — S, A and U — and enumerates thirteen Class-S
predicates. Among them:

> | event already materialised for occurrence | `RELEASE_ALREADY_RELEASED` |

Ceremony-body inspection during v306 design closure established that this condition is not
of the same kind as the other twelve. Finding **Y3** of `de44d131`, verified against
`db/captured/schema.sql`: `staffing_release` carries `PRIMARY KEY (id)` and a **non-unique**
`staffing_release_assignment_idx` on `(tenant_id, assignment_ref)`, while
`RELEASE_ALREADY_RELEASED` is enforced by a real `on conflict (tenant_id, occurrence_ref)`
at write time.

The constitutional defect is not the classification alone. It is that a three-class taxonomy
forces a write-time guard to be modelled as a readable state predicate, and a readable
precheck **cannot prove that a subsequent write will succeed under concurrency**. Modelling
it as Class-S invites exactly the substitution R-14 exists to prevent: a preview that appears
to author the same truth as the ceremony, where in fact the ceremony's authority is the
conflict at write time and the preview's is a read that may already be stale.

### Superseded text — C1 §2.2

> ## 2.2 The three predicate classes
>
> The classification is derived from the ceremony bodies as they exist, not proposed.

and, within the Class S table:

> | event already materialised for occurrence | `RELEASE_ALREADY_RELEASED` |

### Replacement text

> ## 2.2 The four condition classes
>
> The classification is derived from the ceremony bodies as they exist, not proposed.
>
> - **S · state/admissibility predicate.** Evaluable from *(tenant, subject, moment)*.
>   Fully previewable. A conjunct of the availability verdict.
> - **A · required act argument.** Not evaluable from the subject; requires the proposed
>   act's arguments. Governed by R-14.5 — declared, never silently omitted.
> - **U · authority.** Whether this actor may perform this action. A conjunct of the
>   availability verdict.
> - **W · write-time guard.** Enforced by a constraint, conflict clause, lock or other
>   execution-time mechanism. **A W condition is not a conjunct of the availability
>   verdict.** It may be represented in the registry for completeness and preview mapping,
>   and may be previewed as an informative state, but no readable precheck may replace,
>   weaken, or become authoritative over the write-time mechanism, and no evaluation of it
>   may be represented as proof that the write will subsequently succeed.
>
> `RELEASE_ALREADY_RELEASED` is Class-W. It is removed from the Class-S enumeration above.

### Consequential clarifications

1. **Class-W is not a fifth kind of authority.** It records that authority for that condition
   already lies at write time, where it is race-safe, and that admissibility evaluation must
   not claim it.
2. **The Class-S enumeration is now twelve.** C1's remaining twelve Class-S rows stand
   unaltered.
3. **Ceremony behaviour does not change.** No ceremony gains or loses a check. This amendment
   classifies an existing condition; it does not move one.
4. **This is a prospective supersession.** C1 §2.2 as ratified said what it said. This
   amendment does not edit that text in place, and any implementation reading C1 alone is
   reading an incomplete rule.

---

## B · Atlas R-14 — conjunction owns truth; ordering owns explanation

### Defect

R-14.1 states that admissibility is *"the conjunction of its preconditions"*, and R-14.3
requires a preview to evaluate *"the same predicates in the same conjunction."* A conjunction
is unordered. A refusal is order-sensitive, because a ceremony reports only its **first**
failure.

The consequence was identified during design closure and is recorded verbatim in
`docs/v306_FROZEN_DESIGN_de44d131.md`: a set of independent predicates satisfies R-14.3
literally while still permitting a preview to report a different ground than the ceremony
refuses with. R-14 as written secures *whether* an act is admissible and leaves *which
ground is reported* undetermined — the defect the corpus records as F3.

The recovered design answers this with an ordered admissibility ladder. Nothing in R-14
authorises or forbids that construction, so its constitutional standing must be stated rather
than inferred.

### Replacement text — R-14, new provision R-14.6

> **R-14.6** Admissibility **truth** is conjunctive. Where a ceremony's conditions are
> evaluated in a declared order, that order determines only the **canonical failed
> predicate and ground reported** when the conjunction is false. Ordered precedence shall
> never alter whether an act is admissible.
>
> Accordingly: predicate conjunction owns truth; ladder ordering owns deterministic failure
> selection and explanation. A projection that changes an admissibility verdict by reordering
> conditions violates R-14.1 and R-14.3 regardless of the order it declares.

### Consequential clarifications

1. **R-14.1 and R-14.3 are unaltered.** Conjunction remains the definition of admissibility.
   R-14.6 constrains what ordering may and may not do; it does not license ordering to
   replace conjunction.
2. **The recovered ladder architecture of `de44d131` is preserved on this basis** — it
   determines reported ground, not truth.
3. **This resolves F3 rather than preserving it.** Ordering is what makes a preview's reported
   ground mechanically comparable to a ceremony's refusal, which is what R-14.4 requires.

---

## C · The Class-U version boundary

Recorded as a binding architectural constraint rather than a change to any constitutional
text, because it constrains a release sequence and not a rule.

> A release may evaluate the Class-S and Class-A portion of a ceremony's conditions without
> Class-U where that release is additive and unwired. The resulting value **is not the
> complete C1 availability verdict, and must not be documented, named, or consumed as
> such.** Class-U shall be incorporated before availability is exposed as consumer or
> interface authority.

Applied to the settled sequence: v306 evaluates S and A only, at ordinal 0 reserved for
Class-U; **v307b** seats Class-U at that reserved ordinal; **v308** may expose availability
as consumer authority only after v307b. Reserving ordinal 0 in v306 means that seating
renumbers no rung and invalidates no order proof.

---

## Verification

| Claim | Where checked |
|---|---|
| R1 issued after C1 ratification | C1 written 16:57 EDT; R1 issued 17:37:49Z = 13:37 EDT — R1 is later |
| `de44d131` postdates C1 | authored 17:41:19Z; records *"C1 recorded, R-14 seated"* |
| `RELEASE_ALREADY_RELEASED` has a real conflict clause | `de44d131` finding Y3, verified against `db/captured/schema.sql` |
| `STAFFING_ALREADY_RELEASED` has none | same finding; non-unique index confirmed |
| C1 §2.2 listed it as Class-S | C1 §2.2 Class S table, row 5 |
| Conjunction/ordering reasoning | report `6dcf9753`, 17:10:44Z, quoted in the frozen-design record |
| Recovery provenance | report `e91a4f6d` |

---

## What this amendment does not change

- **C1's ratified text.** Not edited in place. Superseded prospectively and by name.
- **R-14.1 through R-14.5.** Unaltered. R-14.6 is additive.
- **Amendment Three.** Stands entirely. R-14's seating in the invariant registry is
  unaffected.
- **Any ceremony.** No condition is added, removed, or moved. No behaviour changes.
- **The release sequence.** v306 remains additive and unwired; v307a remains
  behaviour-preserving; v307b remains the Class-U release; v308–v310 are unchanged.
- **The `obligation_state` → `responsibility_state` re-vocabulary.** Remains deferred and
  must not be folded into v306–v310.
- **A7.** Remains open and is not decided here.

---

## Procedural note

Adopted under Article VI.1, appended and dated, with superseded text retained under VI.4.
The authorizations are owner ruling R1 of 10 August 2026 and the architect ruling of the same
date; this instrument supplies the RFC form that the cumulative A5 rule requires alongside
them.

**Custody.** This amendment is committed together with C1 (`docs/AVAILABILITY_CONSTITUTIONAL_INTEGRATION.md`),
its ratification record (`docs/constitutional-record/amendment-three.md`), and the recovered
frozen design (`docs/v306_FROZEN_DESIGN_de44d131.md`). Until that commit, C1 existed only as
an untracked working file and `de44d131` only inside a session transcript — a state
Amendment Three itself warns against, in its own words: a corpus may *"be complete in force
while incomplete in custody, and the two failures look identical from inside an audit."*

**One custody item remains open and is deliberately not closed here.** The seating of R-14
into the invariant registry of `docs/RESPONSIBILITY_OS_CONSTITUTION.md` is present in the
working tree as an uncommitted modification and is **not** included in this commit, because
that file is one of five inherited tracked modifications whose staging was expressly excluded
from this authorization. Amendment Three's record is therefore committed while its
constitutional effect on the registry is not. This is recorded, not repaired.
