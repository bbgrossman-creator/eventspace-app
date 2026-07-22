# PL-4 — ACCEPTANCE & RESCISSION · CERTIFICATION

*EventCore · the close-out certification produced at v273, grounded in the four
frozen constitutional documents (PL-4_ACCEPTANCE_CONSTITUTION, RECONCILIATION
ADDENDUM, IMPLEMENTATION_PLAN, ACCEPTANCE_RECON) and the actually-deployed SQL
(v263–v273), proofs, and genuine two-backend race artifacts. Every invariant is
traced to enforceable SQL, a functional proof claim, and — where concurrency is
claimed — a genuine race proof. No invariant is marked proven on the strength of
mutable status text or application convention. One constitutional capability
(attested acceptance) is explicitly deferred and named as the sole condition on
the freeze recommendation.*

---

## 1. Certification basis

- **Constitutional authority:** I-15–I-19 (PL-3, inherited & frozen) and I-20–I-30
  (PL-4), plus the Reconciliation Addendum's four settled decisions (offer expiry,
  selection contract, accepting-party identity, rescission authority).
- **Deployed artifacts audited:** `v268_offered_terms`, `v269_acceptance_records`,
  `v270_protective_compatibility`, `v271_acceptance_ceremonies`,
  `v272_rescission`, and the v273 close-out `v273_pl4_closeout` (accept_offer
  replace-in-place: expiry + selection cardinality).
- **Evidence:** `v273_proof.sql` (35 claims, disposable, self-rolling-back, zero
  residue), `v273_race.sql` (six load-bearing pairs, genuine two-backend, both
  serializations observed), and the v265–v272 regression proofs + v271/v272 race
  regressions, all green on the v273 stack.
- **Standing bar:** 54/54 unit suites; TypeScript diagnostic set unchanged from
  the v272 baseline (v273 is SQL-only — no `.ts`/`.tsx` modified); es5 gate at the
  pre-existing baseline; strict gate clean; eight Chromium suites (98 claims) +
  production (7) + offer-route (7); five variants biting.

---

## 2. What v273 changed, and why

The integrated audit found that PL-4 Phase A shipped as a **reduced observed-path
implementation**: two settled invariant clauses were under-enforced by the
deployed `accept_offer`, even though the frozen data to enforce them was already
present in every post-v268 Snapshot.

- **I-22 expiry (Addendum §A.1)** — `accept_offer` never read the frozen
  `validUntil`; an expired Offer was still acceptable.
- **I-26 cardinality (Addendum §A.2)** — `accept_offer` validated option
  membership and duplicate-freeness only; a frozen `min`/`max` (or `chooseCount`)
  bound was never checked, so "choose exactly N" could be satisfied with fewer,
  more, or none.

Neither was a false certification — the v271 proof (AC-1..AC-12) never claimed
expiry or cardinality; canon §6.43 recorded them by omission. They are honest
under-enforcement gaps. v273 closes both with a **narrow, no-schema, no-signature
replace-in-place** of `accept_offer`: it reads `validUntil` back and enforces the
half-open `[published_at, valid_until)` interval against the database server
clock (observed acceptance governs on the recorded moment), and it enforces each
frozen group's cardinality with the binding legacy precedence — explicit
`min`/`max` → frozen `chooseCount` as `min=max` → refuse
`ACCEPT_LEGACY_CHOICE_UNRESOLVED` (never infer a cardinality the artifact did not
freeze). Absent-mandatory and excessive selections are both refused. No other
object was touched.

---

## 3. Traceability matrix (I-15 … I-30)

Legend — Status: **PROVEN** (enforceable SQL + functional proof, + race where
concurrency is claimed) · **PROVEN (observed)** (proven for the shipped observed
path; the attested path is deferred) · **DEFERRED** (constitutionally recognized,
scheduled to a later slice) · **CONTRADICTION** (none found).

### PL-3 inherited (frozen; re-verified as regression)

| Inv | Requirement (short) | Mechanism | Functional | Race | Status |
|-----|--------------------|-----------|-----------|------|--------|
| I-15 | No supersession until replacement is complete & durable | `publish_offer` archive≺seal≺promote ordering | v265 PB-* | v266_race | PROVEN |
| I-16 | At most one current Offer per thread | thread-first lock; sent→superseded guard | v265/v266 | v266_race | PROVEN |
| I-17 | Promotion verified, not assumed | archive hash check, staged→promoted | v265 PB-* | — | PROVEN |
| I-18 | Seal spans the whole customer-visible surface | `guard_sealed_version` (7 content tables + version fields + `valid_until`) | v267 + v268 | — | PROVEN |
| I-19 | Endpoints serve immutable Snapshot bytes only | route reads `offer_endpoints`→`offer_snapshots` | offer-route 7/7 | — | PROVEN |

### PL-4 (this certification)

| Inv | Requirement (short) | Mechanism (SQL) | Functional proof | Race proof | Status |
|-----|--------------------|------------------|------------------|-----------|--------|
| **I-20** | Single acceptance | `offer_acceptances` `UNIQUE(snapshot_id)` + under-lock relation pre-check | v271 AC-2/AC-4/AC-11 | AR (2nd accept refused) | **PROVEN** |
| **I-21** | Fingerprint binding | `accept_offer` compares presented vs snapshot fingerprint under lock | v271 AC-5 | — | **PROVEN** |
| **I-22** | Current-only **incl. expiry** | status gate (sent/withdrawn/superseded) **+ v273 frozen `validUntil` half-open check** | v271 AC-1/AC-8/AC-9 **+ v273 XP-1..XP-4** | — | **PROVEN (observed)** ¹ |
| **I-23** | Commitment bars supersession | `publish_offer` accepted-bar via acceptance⋈rescission **relation**; `withdraw_offer` accepted-guard | v271 AC-8/AC-9; v273 CL-1/BY-2/BY-3 | RP, RW, TP, US | **PROVEN** |
| **I-24** | Immutability preserved | `accept_offer` writes no sealed content; snapshot never updated | v273 IM-4/IM-6 | — | **PROVEN** |
| **I-25** | Atomic, thread-serialized | thread→version lock in accept/rescind/publish/(v270) withdraw; single txn | v271 AC-6; v273 PX-4 | AR, RP, RW (no deadlock) | **PROVEN** |
| **I-26** | Selection validity & immutability | membership + duplicate refusal **+ v273 frozen min/max cardinality (legacy precedence)** | v271 AC-3/AC-7/AC-7b **+ v273 SC-1..SC-8** | — | **PROVEN** |
| **I-27** | Evidence permanence | insert+select-only RLS on acceptance/selection/rescission; rescission additive | v273 IM-1/IM-2/IM-3/IM-5 | — | **PROVEN** |
| **I-28** | No fabricated acceptance | observed requires resolvable capability (route token → version); attested distinct | v271 AC-1; TI-1 | — | **PROVEN (observed)** ² |
| **I-29** | Rescission authority-gated (default-deny) | `rescind_acceptance` per-class evidence gate; plain `UNIQUE(acceptance_id)` | v272 RS-5a..h; v273 BY-1/BY-4 | RR, US | **PROVEN** |
| **I-30** | Ledger primacy | projection written atomically with fact; `acceptance_rescinded.object_ref` = binding rescission record; two release projections | v272 RS-3/RS-3b; v273 LR-1/LR-3/BY-2/PX-1/PX-4 | RR, RP, TP | **PROVEN** |

¹ **I-22** — expiry now enforced for the shipped **observed** path (governs on the
recorded moment). The **attested** claimed-moment comparison (Addendum §A.1) is
written as a documented, unreachable seam in `accept_offer` that the deferred
attested slice populates; it is not live dead code. See §8.

² **I-28** — the observed evidence basis is proven; the observed **capability**
authority is enforced at the route (token→version resolution), not inside
`accept_offer`, which trusts its caller resolved the capability and re-checks
tenant membership. The **attested** evidence basis and its attestation-window /
`ACCEPTANCE_IMPOSSIBLE` refusal are deferred with the attested slice. See §8.

**No contradictions were found** between the constitutional documents, between
the documents and the deployed implementation, or among the deployed migrations.

---

## 4. Object map

| Object | Table / locus | Immutability | Key invariants |
|--------|---------------|-------------|----------------|
| Offer | a sealed `proposal_versions` row, 1:1 with its Snapshot | sealed (guard) | I-15/I-16/I-18 |
| Snapshot | `offer_snapshots` (frozen `model` incl. `validUntil`, `choiceGroups[].{groupId,min,max,chooseCount,options[].optionId}`) | insert+select RLS; never updated | I-18/I-21/I-24 |
| Acceptance | `offer_acceptances` (five identity slots reserved; observed populated) `UNIQUE(snapshot_id)` | insert+select RLS | I-20/I-27 |
| Selection Set | `acceptance_selection_sets` `UNIQUE(acceptance_id)`, canonical by-value | insert+select RLS | I-26/I-27 |
| Rescission | `acceptance_rescissions` `UNIQUE(acceptance_id)`, `republish_permission` on record, 5-class CHECK | insert+select RLS (no update/delete policy) | I-27/I-29/I-30 |
| Ledger facts | `engagement_ledger` — `offer_published`, `offer_superseded`, `offer_accepted`, `acceptance_rescinded` (free-text `ceremony`) | append-only | I-30 |
| Status projection | `proposal_versions.status` — `sent`/`accepted`/`rescinded_republishable`/`rescinded_terminal` (derived) | written atomically with grounding fact | I-30 |

## 5. Ceremony map

| Ceremony | Function | Writes | Bars / refusals (behavior) |
|----------|----------|--------|---------------------------|
| publish | `publish_offer` | snapshot, `offer_published`(+`offer_superseded`), sent projection | accepted-bar (`PUBLISH_BLOCKED_BY_ACCEPTANCE`), terminal-bar (`PUBLISH_BLOCKED_TERMINAL_RESCISSION`), republishable → supersede from true state |
| withdraw | `withdraw_offer` | withdrawn projection | accepted-guard via acceptance relation (`WITHDRAW_BLOCKED_BY_ACCEPTANCE`) |
| accept | `accept_offer` (v273-hardened) | acceptance, selection set, `offer_accepted`, accepted projection | not-published / superseded / withdrawn / already-accepted / fingerprint / **expired** / **incomplete/invalid/legacy-unresolved selection** |
| rescind | `rescind_acceptance` | rescission record, `acceptance_rescinded`, release projection | default-deny authority gate, unknown class, reason-required, already-rescinded, permission-required/invalid |

## 6. Lock-order map

All four current-Offer ceremonies take the **identical v266 total order**, so no
deadlock is constructible among {publish, withdraw, accept, rescind}:

1. **Thread** — `proposals` row `FOR UPDATE OF p` (first)
2. **Version** — `proposal_versions` row `FOR UPDATE OF v` (second)
3. Dependent immutable records (acceptance / selection / rescission / snapshot)
   only after the first two are held.

`withdraw_offer` adopted this order at v270 (C.2 part 2); before that it locked
only the version, which is exactly the incompatibility the v270 amendment closed.
Verified deadlock-free under genuine concurrency by RR, RP, RW, AR (v273_race).

## 7. Authority map (rescission classes, Addendum §A.4)

| Class | Required evidence (deployed gate) | Republish | Projection |
|-------|-----------------------------------|-----------|-----------|
| self_withdrawal | `capability` == acceptance's `capability_ref` | fixed **true** | rescinded_republishable |
| mutual_release | `principal_assent` **and** `operator_assent` | fixed **true** | rescinded_republishable |
| operator_correction | `supervisory_authority` | fixed **true** | rescinded_republishable |
| fraud_correction | `fraud_determination_ref` **+ explicit** republish | **stated** | either (per stated) |
| compelled_reversal | `instrument_ref` (attested) **+ explicit** republish | **stated** | either (per stated) |

Default-deny: unknown class, missing class evidence, wrong capability, one-sided
mutual release, undetermined permission, or a permission contradicting a
class-fixed outcome all refuse (v272 RS-5a..h; v273 BY-1/BY-4). The richer
per-class authority **model** (which roles may invoke each class) remains the
deferred policy seam I-29 explicitly permits; v273 enforces the structural
default-deny **shape**.

## 8. Projection derivation map (I-30)

Every projection is derived from an immutable fact, written in the same
transaction, and reconstructible by replay:

- **`accepted`** ← the `offer_accepted` ledger fact + the `offer_acceptances`
  row (relation is truth; the flag is a convenience/lock surface). No `accepted`
  projection can exist without the fact (PX-1); forging the flag grants no
  authority (BY-2).
- **`rescinded_republishable`** ← the binding `acceptance_rescissions` row with
  `republish_permission = true`, via `acceptance_rescinded.object_ref` → record →
  permission → projection (LR-1). Publish supersedes the prior from this true
  state (CL-2b).
- **`rescinded_terminal`** ← the binding rescission row with
  `republish_permission = false` (LR-3). Publish refuses
  `PUBLISH_BLOCKED_TERMINAL_RESCISSION` (CL-3b, TP). The class alone does **not**
  determine the outcome — `fraud_correction` and `compelled_reversal` may be
  either — which is exactly why the fact references the **record**, not the class.

The load-bearing negative control (BY-2): a status column manually forced to
`rescinded_republishable` with **no** rescission record does **not** release the
Offer — `publish_offer` reads the acceptance⋈rescission relation and still refuses
`PUBLISH_BLOCKED_BY_ACCEPTANCE`. Status text is never authority.

## 9. Deferred seams (recorded, not silently resolved)

1. **Attested acceptance** *(constitutional capability, §4.2 / plan A.5)* — the
   operator-attested evidence basis, its `claimed_moment` expiry comparison, the
   attestation-window `ACCEPTANCE_IMPOSSIBLE` refusal, and the `INVALID_CHANNEL`
   for a non-endpoint observed channel. Recorded as "a later slice" in canon
   §6.43; the acceptance record already reserves every slot
   (`recording_operator`, `authority_basis`, `claimed_moment`,
   `attestation_ref`). **This is the sole condition on the PL-4 freeze
   recommendation (§11).**
2. **Observed-capability DB-level enforcement** — `accept_offer` trusts the route
   resolved an active endpoint token; a future hardening could bind the ceremony
   to an active `offer_endpoints` row for defense-in-depth parity. Not an
   integrity hole (direct ceremony calls still require active tenant membership).
3. **Refusal-code vocabulary** — the deployed ceremonies use the
   `ACCEPT_*`/`RESCIND_*`/`CEREMONY_*` convention; the constitution names
   `OFFER_*`/`RESCISSION_*`/`ACCEPTANCE_*`. Behavior matches code-for-code and the
   route maps to stable non-disclosing codes; a naming reconciliation is a
   cosmetic follow-up, deliberately not churned here.
4. **Multi-principal / delegated identity population** — the five identity slots
   exist and are collapsed to the observed-self case (Addendum §A.3's sanctioned
   minimum); households, organizations, joint principals, and delegates are later
   *population* of existing slots, never a restructuring.
5. **Agreement cardinality** *(recon §5)* — whether Agreement consumes one
   `offer_accepted` predecessor or aggregates several is explicitly reserved to
   the Agreement slice and does not reopen PL-4.

---

## 10. Failure findings during the close-out

| # | Finding | Classification | Correction |
|---|---------|----------------|-----------|
| 1 | `accept_offer` never enforced frozen `validUntil` | production implementation defect | v273 closeout: half-open expiry check (XP-1..XP-4) |
| 2 | `accept_offer` never enforced frozen min/max cardinality | production implementation defect | v273 closeout: cardinality + legacy precedence (SC-1..SC-8) |
| 3 | `rec` plpgsql variable shadowed a table alias in the proof | proof defect | renamed alias to `rr`, dropped unused declaration |
| 4 | Attested acceptance unbuilt | deferred capability (recorded in §6.43) | recorded as the named freeze condition; not built |
| 5 | Refusal-code strings diverge from constitutional names | cosmetic (behavior matches) | recorded as a deferred reconciliation |

No constitutional contradiction, migration defect, race-harness defect, stale
test recipe, or environment defect altered a passing result. (The paper P-14
variant recipe was corrected during the v272 session to target
`PresentationRooms`, where the pick handler now lives; re-verified biting here.)

---

## 11. Freeze recommendation — **FREEZE THE IMPLEMENTED PL-4 SURFACE**

**Freeze the implemented PL-4 surface.** Acceptance (observed) and Rescission are
complete and frozen: every invariant I-20…I-30 is traced to enforceable SQL, a
functional proof, and — where concurrency is claimed — a genuine race proof, with
no reliance on mutable status text or application convention. The integrated
state machine (publish → accept → rescind → republish/terminal) is coherent under
genuine concurrency across all six load-bearing ceremony pairs. Nothing in the
implemented surface is provisional; it is done and it is frozen.

**Attested Acceptance remains an explicitly reserved constitutional capability,
scheduled as its own future slice.** This is a different statement than "PL-4 is
incomplete." The constitution recognized it (§4.2), the canon recorded it as a
later slice (§6.43), and the acceptance record already provisions its slots
(`recording_operator`, `authority_basis`, `claimed_moment`, `attestation_ref`).
It was *intentionally not built*, not *left undone* — and because it is additive
rather than corrective, building it later restructures nothing and reopens no
frozen law. When it ships (with its claimed-moment expiry, attestation window,
and authority gate proven to this same standard), it extends the frozen surface;
it does not amend it.

Seams §9.2–§9.5 are non-blocking follow-ups. No part of the frozen surface waits
on any of them.

## 12. Constitutional stability statement

The audit found **no constitutional contradictions** among any of the seven
layers that define and realize PL-4:

- the **Constitution** (I-20…I-30),
- the **Reconciliation Addendum** (the four settled data-contract decisions),
- the **Implementation Plan** (build sequence + proof matrix),
- the **Reconnaissance** (object boundary closure),
- the deployed **SQL** (v268–v273),
- the **proofs** (v268–v273, disposable, durable-state assertions), and
- the observed **race behavior** (v266/v271/v272/v273, genuine two-backend).

Every discrepancy discovered during the close-out fell into exactly one of two
categories, and neither implicates the constitutional design:

1. **Implementation omissions** — the two under-enforced clauses in `accept_offer`
   (expiry, cardinality), corrected in place at v273 with no schema change and no
   law change; and one proof defect, corrected in the proof.
2. **Documented deferred capabilities** — Attested Acceptance and the §9.2–§9.5
   seams, each recognized in the constitutional text and recorded before build,
   not discovered as gaps at build time.

**No constitutional law required amendment.** The Constitution, the Reconciliation
Addendum, the Implementation Plan, and the Reconnaissance stand as written; v273
brought the implementation into full conformance with them for the implemented
surface. This formally closes the PL-4 constitutional design phase: the law is
stable, the implemented surface conforms to it and is frozen, and the one
unbuilt capability is a reserved extension of that same stable law — not a
pending correction to it.
