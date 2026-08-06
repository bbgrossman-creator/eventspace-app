# Dependency Closure Audit

**Headline finding: not one of the six blockers is a whole-document dependency.** Every one reduces to a proposition answerable in one or two sentences by whoever holds the missing material. In four of six cases, the missing text need not be supplied at all.

---

## 1 · Interaction Article 12

**1. Current blocker:** Interaction Constitution Articles 1–11 unavailable.

**2. Exact proposition required:**

> **A1 — "No provision of the Interaction Constitution designates a canonical interaction specimen."**

**3. Further reduction:** Article 12's entire existence turns on A1 and nothing else. If a designation clause exists, 12.1 and 12.1a are withdrawn; if none exists, the designation power is unowned and 12.1 stands. A1 is a single negative existential proposition over one document. **Irreducible.**

A second dependency exists but is **not irreducible**:

> **A2 — "Articles 1–11 do / do not legislate the identity band, workspace strip, scope note, next-action chip and colour language."**

A2 is required only because 12.2 is drafted as an *enumeration*. Were 12.2 expressed as a reference to the language as legislated, A2 would become moot. **The dependency on A2 is drafting-contingent, not constitutionally necessary.** I note this as a reduction available; performing it would be amendment, which is out of scope.

**4. Would A1 alone fully unblock?** For the question *does Article 12 exist* — yes, completely. For ratification of its current text — no; A2 remains while 12.2 enumerates.

**Dependency type: SINGLE CONSTITUTIONAL PROPOSITION.**

---

## 2 · Interaction verification

**1. Current blocker:** whole document unavailable.

**2. Exact propositions required** — three, each a single sentence:

> **A3a — "An extension test for new interaction patterns exists, and it is located at Article 11."**
> **A4i — "The Interaction Constitution's jurisdiction is [scope]."**
> **A4ii — "The Interaction Constitution governs manner and not requirement."**

**3. Further reduction:** A4i and A4ii verify only the Framework's Interaction row and Level 4 placement. A3a is the sole proposition on which any *other* blocker depends. A distinct and more demanding proposition is required to legislate rather than merely cite:

> **A3b — "The extension test's criteria are [criteria]."**

A3a establishes that the citation in Framework L265 and Freeze F‑C2 resolves. A3b is required to *apply* it. These are separately atomic.

**4. Would supplying them fully unblock?** A3a + A4i + A4ii fully unblock Framework verification of the Interaction row. They do not unblock Daily Operations, which needs A3b.

**Dependency type: CLAUSE-LEVEL.** Three scope propositions, not eleven articles.

---

## 3 · Atlas verification

**1. Current blocker:** consolidated Atlas Constitution unavailable.

**2. Exact proposition required:**

> **A6 — "The `R‑nn` rulings and the `OC‑nn` occurrence provisions are / are not provisions of the Atlas Constitution."**

**3. Further reduction — this is the highest-leverage reduction in the audit.** If A6 is answered *yes*, Atlas's operative content is already in the repository, and the Framework's Atlas row, Level 1 placement and jurisdiction statement become **verifiable against `RESPONSIBILITY_OS_CONSTITUTION.md` and the v292a1 occurrence specification — documents already readable.** No new text is required. A whole-document dependency collapses to a single identity proposition plus verification against present material.

Two residual propositions survive independently:

> **A5 — "Atlas's amendment rule is [rule]."** Required because `RESPONSIBILITY_OS_CONSTITUTION.md` carries *"changes by RFC amendment only"* while Framework L262 states *"highest — ratification required."* One proposition determines whether these are one rule or two.
>
> **A7 — "`OC‑25`, `OB‑9` and `OB‑10` are / are not valid citations."** These resolve to nothing; the proposition determines whether the Freeze's citations are sound.

**4. Would A6 alone fully unblock?** Substantially. Jurisdiction, Level 1 placement and the routed questions all become verifiable. A5 and A7 remain outstanding and are independent of it.

**Dependency type: SINGLE CONSTITUTIONAL PROPOSITION** (A6), with two small independent residuals.

---

## 4 · Daily Operations

**1. Current blocker:** Interaction Article 11 unavailable.

**2. Exact proposition required — and it is prior to Article 11:**

> **A8 — "The Day view requires an interaction pattern not expressible in the existing interaction language."**

**3. Further reduction:** F‑C2 forbids *redesigning the interaction language* and binds *every new pattern* to the extension test. A view composed entirely of existing patterns is neither. **If A8 is false, F‑C2's bar never fires and Daily Operations carries no interaction dependency whatsoever.** Only if A8 is true does the dependency advance to:

> **A3b — "The extension test's criteria are [criteria]."**

The station × operational-period projection underlying the view is truth rather than pattern and is already unblocked.

**4. Would supplying A3b fully unblock?** Only if A8 is true. **A8 must be answered first, and it may eliminate the blocker entirely without any Interaction text.**

**Dependency type: SINGLE CONSTITUTIONAL PROPOSITION (A8), conditionally chaining to a second (A3b). Possibly zero.**

---

## 5 · Priority

**1. Current blocker:** Operational Freeze F‑5 records the priority ranking as an open value.

**2. Exact proposition required:**

> **A9 — "The priority ranking is [ordered list]."**

**3. Further reduction:** no document is required and none is missing. F‑5 already reserves this value to you within present, frozen law. The proposition is one ordered list. **Irreducible.**

One separation is available: the ranking *mechanism* — a total order with a defined tiebreak — realises a frozen concept and does not require A9. Only the *ordering value* does.

**4. Would A9 alone fully unblock?** **Yes, completely.**

**Dependency type: SINGLE CONSTITUTIONAL PROPOSITION. No document dependency.**

---

## 6 · v304 repository constitutional integration

**1. Current blocker:** two of eight enumerated documents have no text.

**2. Exact proposition required:**

> **A10 — "The corpus consists of [N] documents, and they are [list]."**

**3. Further reduction — the missing texts are not required.** Import is custody and confers nothing. What blocks v304 is not the absence of two documents but the absence of a ruling on what the corpus *is*. If the corpus is ruled to be the six that exist, v304 proceeds immediately at full scope for those six.

One further proposition is separable and likewise needs no missing text:

> **A11 — "The corpus supersedes [named predecessor documents]."** Required because nothing in evidence enacts supersession of the fourteen predecessor documents.

**4. Would A10 alone fully unblock?** Yes for import of what exists. A11 is required additionally for the supersession markings.

**Dependency type: SINGLE CONSTITUTIONAL PROPOSITION. No document dependency.**

---

# Graph A · Blocked work → immediate authority → atomic proposition

```
Interaction Article 12
  └─ Interaction Arts. 1–11 ──────▶ A1  designation absence          [ATOMIC]
                                    A2  content inventory      [drafting-contingent]

Interaction verification
  └─ Interaction scope ──────────▶ A3a extension test exists at Art. 11   [ATOMIC]
                                    A4i jurisdiction statement            [ATOMIC]
                                    A4ii manner-not-requirement           [ATOMIC]

Atlas verification
  └─ Atlas identification ───────▶ A6  R-nn / OC-nn are Atlas       [ATOMIC · highest leverage]
                                    A5  Atlas amendment rule              [ATOMIC]
                                    A7  OC-25 / OB-9 / OB-10 validity     [ATOMIC]

Daily Operations
  └─ F-C2 new-pattern bar ───────▶ A8  does the Day view need a new pattern?  [ATOMIC · may be zero]
        └─ only if A8 = true ────▶ A3b extension test criteria             [ATOMIC]

Priority
  └─ Freeze F-5 open value ──────▶ A9  the priority ranking          [ATOMIC · no document]

v304 integration
  └─ corpus enumeration ─────────▶ A10 what the corpus is            [ATOMIC · no document]
                                    A11 supersession of predecessors [ATOMIC · no document]
```

# Graph B · Atomic proposition → everything it immediately unblocks

```
A6  R-nn / OC-nn are Atlas
      ▶ Framework Atlas row · Level 1 placement · the eight routed questions
      ▶ Converts Atlas verification into verification against PRESENT documents
      ▶ Removes the last whole-document framing from the Atlas jurisdiction

A10 what the corpus is
      ▶ v304 integration at full scope for existing documents
      ▶ The Framework completeness question
      ▶ Repository custody of the corpus

A9  the priority ranking
      ▶ Priority, in full
      ▶ The ordering portion of Next Action
      ▶ Every downstream item that consumes an ordered work list

A8  does the Day view need a new pattern
      ▶ If FALSE: Daily Operations, in full, with no further dependency
      ▶ If TRUE: advances the dependency to A3b and nothing else

A1  designation absence
      ▶ Whether Article 12 exists at all
      ▶ Resolves 12.1 and 12.1a in either direction

A3a extension test exists at Art. 11
      ▶ Framework L265 amendment grant — citation integrity
      ▶ Freeze F-C2 — citation integrity

A3b extension test criteria
      ▶ Daily Operations (only when A8 = true)
      ▶ Any future interaction legislation

A2  content inventory
      ▶ The form of Article 12.2 only

A5  Atlas amendment rule
      ▶ The Framework / RESPONSIBILITY_OS amendment conflict

A7  OC-25 / OB-9 / OB-10 validity
      ▶ Freeze citation integrity

A11 supersession of predecessors
      ▶ Supersession markings in v304
```

---

## Closure

**Eleven atomic propositions replace six whole-document blockers.**

**Three require no missing document at all** — A9, A10, A11 are rulings within present law.

**One may eliminate its blocker outright** — A8, if false, unblocks Daily Operations with no further input.

**One converts a whole-document dependency into verification against present material** — A6.

**Whole-document dependencies remaining after closure: none.**

# Governance Assignment — A1 through A11

---

### A1 · "No provision of the Interaction Constitution designates a canonical specimen"

**Current state:** unanswerable; the text is unavailable.
**Existing constitutional authority? NO.** No instrument answers it, because the answer is not a rule — it is the content of a document. Where a document exists, its own text is the authority; where none exists, there are no provisions to examine and the proposition is moot.
**Resolution mechanism: requires factual confirmation.**
**Decision authority:** none. This is not a decision. It is a reading, performed by whoever holds the text. **Conditional on A10a.**

### A2 · "Articles 1–11 do / do not legislate the identity band, workspace strip, scope note, next-action chip and colour language"

**Current state:** unanswerable; text unavailable.
**Existing constitutional authority? NO** — same reason as A1.
**Resolution mechanism: requires factual confirmation.**
**Decision authority:** none; a reading. **Conditional on A10a.**

### A3a · "An extension test exists, located at Article 11"

**Current state:** asserted at Framework L265 and Freeze F‑C2 L193/L235; resolves to no text.
**Existing constitutional authority? NO.** The two instruments that cite it are the same two under audit, and neither is the Interaction Constitution. A citation is not authority for its own referent.
**Resolution mechanism: requires factual confirmation.**
**Decision authority:** none; a reading. **Conditional on A10a.**

### A3b · "The extension test's criteria are [criteria]"

**Current state:** unknown.
**Existing constitutional authority? CONDITIONAL.** If the Interaction Constitution exists, its Article 11 is the authority. If it does not, **NO** authority exists — no instrument in the corpus states criteria for legislating an interaction pattern.
**Resolution mechanism:** *requires factual confirmation* if the text exists; **requires constitutional legislation** if it does not.
**Decision authority:** the original constitutional author, if the text exists. Otherwise **the ratification authority — the owner**, per the acceptance convention recorded in `RESPONSIBILITY_OS_CONSTITUTION.md` (*"Rev A accepted by the owner"*).

### A4i · "The Interaction Constitution's jurisdiction is [scope]" · A4ii · "It governs manner and not requirement"

**Current state:** characterised at Framework L371 and L195–196; unverified.
**Existing constitutional authority? NO** for verification purposes — the Framework's characterisation is the thing requiring verification and cannot verify itself.
**Resolution mechanism: requires factual confirmation.**
**Decision authority:** none; a reading. **Conditional on A10a.**

### A5 · "Atlas's amendment rule is [rule]"

**Current state:** two rules stand over one body of law — `RESPONSIBILITY_OS_CONSTITUTION.md` (*"changes by RFC amendment only, per the VISION.md convention"*) and Framework L262 (*"highest — ratification required"*).
**Existing constitutional authority? NO.** Each instrument states a rule for itself; **no instrument states which governs where they meet.** The corpus contains no conflict-of-laws provision.
**Resolution mechanism: requires constitutional legislation.** Selecting between two ratified amendment rules requires a power no instrument confers.
**Decision authority: the ratification authority — the owner.** **Fires only if A6 resolves affirmatively.**

### A6 · "`R-nn` and `OC-nn` are / are not provisions of Atlas"

**Current state:** asserted only in the Operational Freeze, which I authored during the phase under audit, without primary text. `RESPONSIBILITY_OS_CONSTITUTION.md` nowhere identifies itself as Atlas.
**Existing constitutional authority? CONDITIONAL.** If a consolidated Atlas text exists and cites `R‑nn`/`OC‑nn`, that text is the authority and the question is factual. If none exists, **NO** authority establishes the identification.
**Resolution mechanism:** *requires historical confirmation* if a text exists; **requires governance ruling** if none does.
**Decision authority:** the original constitutional author, for confirmation of existing text; otherwise **the owner**.

### A7 · "`OC-25`, `OB-9` and `OB-10` are / are not valid citations"

**Current state:** cited in the Operational Freeze; resolve to nothing in any searched source.
**Existing constitutional authority? NO** — but only because the question is not one of rule. Either the identifiers exist somewhere or the citations are erroneous.
**Resolution mechanism: requires factual confirmation.**
**Decision authority:** none for the finding. If the citations prove erroneous, correcting a frozen document falls to **the owner** under Freeze F‑R4 (constitutional inconsistency, located by citation).

### A8 · "The Day view requires a pattern not expressible in the existing interaction language"

**Current state:** unanswered; the Day view has not been designed.
**Existing constitutional authority? NO.** This is a question about what a design requires, not about what a rule provides.
**Resolution mechanism: requires factual confirmation** — by attempting expression in the existing language.
**Decision authority:** whoever designs the Day view makes the factual determination. **No existing instrument names a reviewer of that determination while F‑C2 is inapplicable.** This is the one identified gap in the decision-maker map, and I record it rather than fill it.

### A9 · "The priority ranking is [ordered list]"

**Current state:** recorded by Operational Freeze **F‑5** as the one open value in the frozen operational articles.
**Existing constitutional authority? YES.** F‑5 itself — the Freeze reserved the slot and declared it open.
**Resolution mechanism: requires governance ruling.** Filling a slot the Freeze deliberately reserved is not legislation; the reservation is already law.
**Decision authority: the owner**, per the acceptance convention and F‑5's reservation.

### A10a · "The Interaction Constitution and a consolidated Atlas Constitution do / do not exist"

**Current state:** absent from every available source; existence outside those sources undetermined.
**Existing constitutional authority? NO.** Existence is a fact about the world, not a provision.
**Resolution mechanism: requires historical confirmation.**
**Decision authority:** **the original constitutional author**, who alone can state whether they authored them. **This is the root proposition — A1, A2, A3a, A3b, A4i, A4ii and A6 all resolve differently depending on it.**

### A10b · "The corpus consists of [N] documents, and they are [list]"

**Current state:** Framework Article II enumerates eight; two have no text.
**Existing constitutional authority? NO.** Article II enumerates, but **no provision addresses what becomes of an enumerated member that has no text**. The Framework cannot resolve a case it does not contemplate.
**Resolution mechanism: requires governance ruling.**
**Decision authority: the owner.** **Conditional on A10a.**

### A11 · "The corpus supersedes [named predecessor documents]"

**Current state:** fourteen predecessor documents assert constitutional authority; nothing in evidence supersedes them.
**Existing constitutional authority? NO.** Framework VI.4 governs *retention of superseded text* — it presupposes supersession and does not enact it.
**Resolution mechanism: requires governance ruling.**
**Decision authority: the owner.**

---

# Governance Matrix

| Atomic Proposition | Decision Type | Decision Authority | Blocks | Unblocks |
|---|---|---|---|---|
| **A10a** existence of the two texts | Historical confirmation | **Original constitutional author** | A1, A2, A3a, A3b, A4i, A4ii, A6, A10b | The entire remaining graph |
| **A10b** what the corpus is | Governance ruling | **Owner** | v304 | v304 import · corpus custody · completeness question |
| **A9** priority ranking | Governance ruling | **Owner** (Freeze F‑5) | Priority | Priority in full · ordering of Next Action |
| **A11** supersession of predecessors | Governance ruling | **Owner** | v304 supersession markings | Predecessor document standing |
| **A6** `R-nn`/`OC-nn` are Atlas | Historical confirmation, else governance ruling | **Author**, else **Owner** | Atlas verification | Framework Atlas row · Level 1 · routed questions — verifiable against present documents |
| **A5** Atlas amendment rule | Constitutional legislation | **Owner** | Atlas amendment integrity | The Framework / RESPONSIBILITY_OS conflict |
| **A3b** extension test criteria | Factual confirmation, else legislation | **Author**, else **Owner** | Daily Operations (if A8 true) | Daily Operations · all future interaction legislation |
| **A1** designation absence | Factual confirmation | Reading — text holder | Article 12 | Whether Article 12 exists |
| **A2** content inventory | Factual confirmation | Reading — text holder | Article 12.2's form | Form of 12.2 only |
| **A3a** extension test at Art. 11 | Factual confirmation | Reading — text holder | Framework L265 · F‑C2 | Citation integrity |
| **A4i / A4ii** Interaction scope | Factual confirmation | Reading — text holder | Framework Interaction row | Framework row · Level 4 |
| **A7** `OC-25`/`OB-9`/`OB-10` | Factual confirmation | Reading; correction to **Owner** under F‑R4 | Freeze citation integrity | Freeze integrity |
| **A8** Day view needs a new pattern | Factual confirmation | Design determination — **no reviewer named** | Daily Operations | Daily Operations entirely, if false |

---

# Propositions removed from constitutional governance

**Seven of thirteen are not constitutional questions.**

| Proposition | Actual character |
|---|---|
| **A1, A2, A3a, A4i, A4ii** | **Factual — textual.** Answered by reading a document, not by ruling. No decision-maker required, only a text holder. |
| **A7** | **Factual — repository.** Whether three identifiers exist. |
| **A8** | **Operational — design.** Whether a view can be expressed in an existing language. |
| **A10a** | **Historical.** Whether two documents were ever authored. |

These require no constitutional authority and consume none. They are removed from constitutional governance and belong to reading, searching and designing.

**Six remain genuinely constitutional:** A3b (conditionally), A5, A6 (conditionally), A9, A10b, A11. **Four are governance rulings within existing law; two become legislation only if the missing texts do not exist.**

---

# Closure

Every unanswered question now has a named lawful decision-maker, with one exception recorded rather than resolved: **A8 has no named reviewer while F‑C2 is inapplicable.**

The governance structure reduces to three actors:

- **The original constitutional author** holds one root question — A10a — on which seven others depend.
- **The owner**, as ratification authority evidenced by *"Rev A accepted by the owner"*, holds every governance ruling and both conditional legislative acts.
- **No one need decide** the seven factual, historical and design questions; they require reading, not authority.