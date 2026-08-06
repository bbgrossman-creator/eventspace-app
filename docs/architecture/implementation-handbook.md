# EventCore Implementation Handbook

**Constitutional Guardianship · Permanent reference for every release**

*This handbook is execution discipline, not constitutional law. It creates no rule. Every item carries the provision it derives from; an item without a citation is a defect in this handbook, not a rule to be followed.*

---

## 1 · Constitutional evidence required before coding begins

No implementation task starts without a **Derivation Record**. Framework Article III establishes the method: *"Reading order to answer a question: the Article III matrix, then the one document it names."*

| # | Evidence | Derived from |
|---|---|---|
| **E1** | **Routing determination** — which of the three ordered tests places this work | Framework Art. III.1 |
| **E2** | **Governing document** — the one document the Article III matrix names | Framework Art. III |
| **E3** | **Governing provision, cited by identifier** — e.g. `R‑13`, `PC‑4`, `K‑VIII.2`, `E‑VIII.1`, `OC‑nn` | Freeze F‑R4, which requires inconsistency to be *"located by citation"*; a provision that cannot be cited cannot be relied on |
| **E4** | **Work class declared** — Implementation · Product refinement · Constitutional work | Freeze work-class definitions |
| **E5** | **Ontology statement** — every concept used already has a definition, and where | Freeze F‑C2: *"If a concept needs a definition that does not exist, implementation stops"* |
| **E6** | **Ownership statement** — which operator owns the truth | Product PC‑2, PC‑3; Atlas `R‑12` |
| **E7** | **Authorship location** — if the work produces truth, it is authored where truth is authored | Atlas `R‑13` (content independence); v303 precedent — a readiness verdict is truth, therefore SQL-authored |
| **E8** | **Grain statement** — the grain at which the truth is authored, and the sole authority at that grain | Freeze F‑C2: no duplicate authority |
| **E9** | **Exclusions** — what this work explicitly does not do | Freeze work classes; a class is only meaningful if its boundary is stated |
| **E10** | **Proof obligation** — what will be proved, and how failure would show | Freeze: implementation is *"judged by whether it is faithful and proved"* |
| **E11** | **Governance dependencies** — whether the work depends on A5, A6, A9, A10b, A11 or A3b | Governance Assignment; Freeze F‑5 for open values |

**If E3 cannot be completed, the task does not begin.** That is F‑C2 operating, not a preference.

---

## 2 · Mandatory implementation workflow

The corpus requires a workflow with **two halt points before design**, because F‑C2 halts on derivation failure and the Freeze requires constitutional work to *"produce a document before it produces code."*

```
  1  REQUIREMENT
        │
  2  ROUTE ──────────── Framework Art. III.1 → Art. III matrix
        │
  3  DERIVE ─────────── cite the governing provision (E3)
        │                     └── fails ──▶ HALT · F-C2 · return as constitutional work
  4  CLASSIFY ───────── Implementation | Product refinement | Constitutional work
        │                     └── constitutional ──▶ HALT · document first, ratified before code
  5  GATE ───────────── Product PC-10.6, in its stated order
        │                     └── fails 1–3 ──▶ HALT · "does not become acceptable by being easy to build"
  6  DESIGN ─────────── within the frozen concept; no new pattern
        │
  7  IMPLEMENT ─────── manifest declares scope; nothing outside it
        │
  8  PROVE ─────────── permanent · one-shot · race · negative control
        │
  9  CERTIFY ───────── full gate run; standing floor maintained
        │
 10  DEPLOY ────────── ceremony; production evidence captured verbatim
        │
 11  ARCHIVE ───────── evidence committed unaltered
```

**Why PROVE and CERTIFY are separate steps:** the repository's own practice distinguishes claim-level proofs from the gate run that admits a release. Collapsing them would let a release pass without its claims having been independently established.

**Why ROUTE precedes DERIVE:** Framework Article III directs a reader to the matrix *first*, then to the one document it names. Deriving before routing risks citing a document that does not govern.

---

## 3 · Constitutional Compliance Checklist

Every commit, PR and release satisfies all of the following. Each item states the provision it enforces.

| # | Requirement | Authority |
|---|---|---|
| **C1** | The governing provision is cited by identifier | Framework Art. III; F‑R4 |
| **C2** | The routing test that placed the work is recorded | Framework Art. III.1 |
| **C3** | The work class is declared, and classes are not mixed without separation | Freeze work classes; owner's ruling that no release may mix categories without declaring and separating them |
| **C4** | No ontology is invented; every concept has a pre-existing definition | Freeze F‑C2 |
| **C5** | No constitutional ownership moves | Freeze F‑C2 |
| **C6** | No duplicate authority is introduced; the four grandfathered are not precedent and no fifth joins them | Freeze F‑C2, E‑3 |
| **C7** | Nothing becomes true in one place and false in another | Freeze F‑C2 |
| **C8** | No new interaction pattern is introduced | Freeze F‑C2 — and the Article 11 extension test is presently inapplicable, so this is currently absolute |
| **C9** | Truth is authored where truth is authored; the client renders and does not decide | Atlas `R‑13` |
| **C10** | Append-only discipline is preserved | Atlas discipline; Engagement E‑VIII.3 — *"Work released is Atlas's, and Atlas is append-only"* |
| **C11** | Nothing is deleted; superseded and retired material remains answerable | Knowledge K‑XI.14; Framework VI.4 |
| **C12** | Ownership of every affected truth is stated | Product PC‑2, PC‑3; `R‑12` |
| **C13** | Proof obligations are discharged, with a negative control wherever a guard is claimed | Freeze — *"judged by whether it is faithful and proved"*; the CT‑04 precedent, where a registry-only fix was shown a placebo by negative control |
| **C14** | The standing claim floor is maintained or raised, never lowered | Repository certification practice |
| **C15** | Exclusions are declared explicitly | Freeze work classes |
| **C16** | Every citation in the release resolves | F‑R4 — a citation that resolves to nothing cannot locate anything |
| **C17** | Deployment evidence is archived verbatim, unaltered and unnormalised | Deploy-manifest practice; v299 and v300 precedent |
| **C18** | No dependency on an unratified governance decision | Governance Assignment; Freeze F‑5 |

**A release failing any item does not ship.** C4–C8 are not gradable — they are F‑C2 prohibitions, and a single breach is disqualifying.

---

## 4 · Constitutional Stop Conditions

Implementation halts and returns the question to constitutional governance when **any** of the following holds. All derive from F‑C2 or the reopening provisions.

### From F‑C2 — halt during derivation or design

| | Condition | Provision |
|---|---|---|
| **S1** | A concept requires a definition that does not exist | *"invent ontology"* |
| **S2** | The work would change constitutional ownership | *"change constitutional ownership"* |
| **S3** | The work would introduce a duplicate authority | *"introduce a duplicate authority… no fifth may join them"* |
| **S4** | The work requires a new interaction pattern | *"redesign the interaction language… Article 11 extension test binds every new pattern"* |
| **S5** | The work would make something true in one place and false in another | stated in F‑C2 |
| **S6** | The work implements anything in Part II | *"implement anything in Part II"* |

### From F‑R1–F‑R4 — halt and reopen

| | Condition | Provision |
|---|---|---|
| **S7** | Implementation impossibility | F‑R1 |
| **S8** | Operator evidence — observed use, not anticipated preference | F‑R2 |
| **S9** | Demonstrated contradiction | F‑R3 |
| **S10** | Constitutional inconsistency, **located by citation** | F‑R4 |

### From the governance record

| | Condition | Provision |
|---|---|---|
| **S11** | The work depends on an unratified governance decision — A5, A6, A9, A10b, A11, A3b | Freeze F‑5 for open values; Governance Assignment |

### Expressly not stop conditions

**Elegance is not a reopening ground** — F‑R5: *"That a different architecture appears cleaner, more modern or more satisfying is not a ground."* Nor is implementation difficulty, nor engineering preference, nor a defect in code. **An implementation defect does not reopen architecture unless it demonstrates a contradiction under F‑R3.**

---

## 5 · Constitutional Review Template

Applied whenever implementation proposes a new concept, workflow, interaction, ownership rule or data relationship.

### Common spine — answered for every proposal, in this order

Product PC‑10.6 supplies the ordered test and states its own severity: *"A feature that fails 1–3 does not become acceptable by being easy to build."*

1. **Which routing test places it?** (Framework III.1)
2. **Which document governs?** (Article III matrix)
3. **Which provision already settles it?** — cite it. *No provision → **STOP (S1)***
4. **Does it serve PC‑1?**
5. **Does it belong to an operator who owns that truth?** (PC‑2)
6. **Does it violate any principle in Product Article 9?**
7. **Can the interaction language express it without a new pattern?** *No → **STOP (S4)***
8. **Only then: how would it be built?**

### Proposal-specific questions

**A new concept**
- Is this ontology? → **STOP (S1)**
- Is it a *kind* of an existing canonical object rather than a new object? Knowledge Article III merged five kinds into one species on the ground that *"a constitution that enumerated kinds would need amending every time the business named a new one."* Kinds are domain vocabulary; implement as a kind.
- Does it assert something, undertake something, or is it a thing we hold? That answer routes it.

**A new workflow**
- Is this dependency or workflow? The Dependency Map has ruled workflow is not structure. Workflow requires no constitutional act; dependency does.
- Does it create a state? States are truth and belong to a truth jurisdiction.

**A new interaction**
- **STOP (S4), unconditionally.** The Article 11 extension test has no text and cannot be applied. No new pattern may be introduced.
- Permitted: expressing a capability using patterns that already exist.

**A new ownership rule**
- Does it move constitutional ownership? → **STOP (S2)**
- Does it create a second owner for one truth? → **STOP (S3)**
- Otherwise: cite PC‑2/PC‑3 and `R‑12`, and state the single owner.

**A new data relationship**
- Does it create a second authority over an existing truth? → **STOP (S3)**
- Is the relationship **asserted** or **derived**? Derived relationships have no independent authority and must not be storable as if they did.
- Does it reach across a jurisdictional boundary? If it touches an instantiated term, Knowledge K‑VIII.2 applies — authority transferred absolutely and the copy is frozen. If it crosses release, Engagement E‑VIII applies.
- Would it let practice become policy silently? → **STOP**; Knowledge K‑XI.13 requires divergence to be recorded as an operational fact and promoted deliberately.

---

## 6 · Permanent operating contract

### Precedence, when parties conflict

Freeze L199 states it directly: *"Where implementation and this freeze conflict, the freeze governs. Where the freeze and the Atlas Constitution conflict, Atlas governs."* Framework Article IV.3 supplies the remainder, with **Implementation at Level 6 — last.**

### Who decides what

| Party | Decides | Authority |
|---|---|---|
| **Architecture** *(original constitutional author)* | Authors and confirms constitutional text; answers whether a text exists (A10a); drafts on instruction | Holds the text it authored |
| **Governance** *(Owner)* | Ratifies; rules open values (F‑5); corpus membership; supersession; narrow legislation; approves reopening under F‑R1–F‑R4 | *"Rev A accepted by the owner"* — the acceptance convention of record |
| **Implementation** *(engineer / Guardian)* | Derivation, design within a frozen concept, build, proofs; declares work class; **halts** under S1–S11 | Freeze F‑C1 |
| **Certification** | Whether what was built is faithful to what was ruled and is proved; whether a release may ship | Freeze — implementation *"judged by whether it is faithful and proved"* |

### Who is forbidden from deciding what

| Party | May not |
|---|---|
| **Implementation** | Legislate · invent ontology · move ownership · introduce a duplicate authority · redesign the interaction language · resolve an open value · declare supersession · amend any document · treat elegance as grounds *(F‑C2, F‑R5)* |
| **Certification** | Decide what is true. It establishes only correspondence between ruling, build and proof. A passing gate is not a ratification |
| **Governance** | Certify. A ruling does not make code correct, and no ruling substitutes for a gate run |
| **Architecture** | Implement or certify. Level 6 is not its level |
| **All parties** | Reopen settled architecture absent F‑R1–F‑R4, located by citation |

### Escalation paths

```
Implementation
  ├─ missing definition ..................▶ Governance   (S1 · F-C2)
  ├─ missing constitutional text .........▶ Architecture (A10a)
  ├─ open value required .................▶ Governance   (S11 · F-5)
  ├─ contradiction demonstrated ..........▶ Governance   (S9 · F-R3, with citation)
  ├─ impossibility .......................▶ Governance   (S7 · F-R1)
  └─ new interaction pattern needed ......▶ HALT — no path exists while Art. 11 is textless

Certification failure ...................▶ Implementation  (defect)
        └─ only if it demonstrates a contradiction ▶ Governance (F-R3)

Governance
  └─ legislation requires drafting .......▶ Architecture
        └─ drafted text ..................▶ Governance for ratification
              └─ ratified text ...........▶ Repository for import
                    └─ imported ..........▶ Implementation
```

**The single most load-bearing rule in this contract:** a certification failure escalates to Implementation, never to Architecture. Code that fails its proof is defective code. Only a demonstrated contradiction — F‑R3, located by citation — converts a defect into a constitutional question. Without that rule, every hard bug becomes a reason to redesign, and the Freeze becomes advisory.

---

## Standing state at issue

**Constitutional phase: CLOSED.** **Default mode: Architectural Execution.**

**Blocked on governance:** A9 (priority ranking) · A10b‑i and A10b‑ii (corpus membership) · A11 (supersession) · A6, A5, A3b (conditional).

**Blocked absolutely:** any new interaction pattern, until the Article 11 question resolves.

**Proceeding:** D0 · import of the six existing corpus documents · Product and Knowledge errata · Event File implementation · enumeration · station registry · role ownership · next action · certification planning · sequencing.