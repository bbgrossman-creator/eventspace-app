# PL-4 — CONSTITUTIONAL CLOSEOUT

*v274 · documentation-only · the formal closing chapter of the Proposal Lifecycle.
This document does not add implementation — none remains. It records, deliberately
and for the historical record, that the constitutional era begun with PL-1 and
completed through the v273 implementation is closed, certified, and frozen, and it
adopts the final certification of record before the platform transitions into the
Execution OS program (v275+).*

---

## 1. What the Proposal Lifecycle established

Across PL-1 through PL-4, EventCore built a single, coherent answer to one
question: **what is a commitment, and how is it made safe?** The answer is now
constitutional law, enforced in the database, proven under genuine concurrency,
and certified:

- **PL-1 — the append-only spine.** The `engagement_ledger` as the source of
  truth; facts are recorded, immutably; names are interpretations of facts.
- **PL-2 — relationship.** The engagement graph binding bookings, proposals, and
  their history.
- **PL-3 — publication (Model C).** The first Send seals a Version into an Offer,
  1:1 with one immutable Snapshot identified by a SHA-256 fingerprint that
  excludes renderer identity; the publication ordering (archive ≺ publish ≺
  visibility); invariants I-15…I-19 — one current Offer per thread, verified
  promotion, the seal spanning the whole customer-visible surface, endpoints
  serving only immutable Snapshot bytes.
- **PL-4 — acceptance & rescission.** The commitment itself: an Offer accepted at
  most once, bound to the exact fingerprint, current-only, immutable, atomic and
  thread-serialized, with valid selections, permanent evidence, no fabrication,
  authority-gated rescission, and ledger primacy — invariants **I-20…I-30**.

The through-line is one principle, held without exception: **the relation is
authoritative; status is a projection.** What is true is what has been recorded;
every lifecycle name is a derivation of immutable facts, never an independent
mutable truth.

## 2. The state of PL-4 at close

PL-4 is complete through the **v273** implementation. The implemented surface —
**Observed Acceptance and Rescission** — is frozen. Every invariant I-20…I-30 is
traced to enforceable SQL, a functional proof, and, where concurrency is claimed,
a genuine two-backend race proof, with no reliance on mutable status text or
application convention:

- Single acceptance, fingerprint binding, current-only acceptance **including
  expiry** (v273), immutability, atomic thread-serialization.
- Selection validity **including frozen min/max cardinality** with the legacy
  precedence (v273).
- Evidence permanence, no fabricated acceptance, authority-gated default-deny
  rescission, ledger primacy with the two release projections derived
  structurally from the binding rescission record.

**One capability is explicitly reserved, not missing: Attested Acceptance.** Its
record slots are provisioned; its deferral is recorded (canon §6.43); it is
additive, not corrective. It is carried forward into the next era as a reserved
constitutional capability (see the Transition Document), to be built to this same
standard as its own slice, before, during, or after PL-5, without reopening any
frozen law.

## 3. Adoption of the final certification of record

The **`PL-4_CERTIFICATION.md`** produced at v273 is hereby adopted as the **final
certification of record** for the Proposal Lifecycle. It carries the full
I-15…I-30 traceability matrix; the object, ceremony, lock-order, authority, and
projection-derivation maps; the deferred-seam register; and the constitutional
stability statement. This closeout does not restate or supersede it — it ratifies
it as the authoritative certification at the close of the era.

## 4. Constitutional stability at close

The v273 audit — grounded in the constitution, reconciliation addendum,
implementation plan, reconnaissance, deployed SQL, proofs, and observed race
behavior — found **no constitutional contradictions** among those seven layers.
Every discrepancy discovered was either an implementation omission corrected in
place (expiry and selection cardinality; one proof defect) or a documented
deferred capability recognized before build. **No constitutional law required
amendment.** The Constitution, Reconciliation Addendum, Implementation Plan, and
Reconnaissance stand as written. The law is stable; the implemented surface
conforms to it and is frozen; the one unbuilt capability is a reserved extension
of that stable law, not a pending correction to it.

## 5. Formal declaration

**PL-1 through PL-4 are complete and frozen.**

The commitment model is constitutional infrastructure. It is not reopened by
future work. It is not redesigned because another implementation is possible. It
is extended, built upon, and relied upon. Any future change to the frozen surface
requires the discovery of a genuine constitutional contradiction — of which none
exists at close.

This chapter closes the constitutional definition of the commitment. The next
chapter — the Execution OS — begins from it.

---

*Adopted at v274. Certification of record: `PL-4_CERTIFICATION.md`. Continues in:
`PL-4_TO_EXECUTION_OS_TRANSITION.md`.*
