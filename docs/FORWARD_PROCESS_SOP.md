# EventCore Forward Process SOP

**Adopted 13 August 2026, at the post-v310 governance boundary.**

This document banks four standing rules that govern how releases reach production
and how the certification floor is maintained. It is process governance: it
changes no product behaviour, removes no capability, and touches no
admissibility, availability or lifecycle doctrine.

It exists because two things were learned the expensive way — one from the v309
deployment, one from an audit of the certification harness — and neither was
written down anywhere a future release would be forced to read it.

Amendment Five (the Legacy Preservation Law) remains controlling over everything
here. Nothing in this SOP authorises removing a user-visible capability.

---

## Rule 1 · Permanent Release Classification

**Every release is classified before production as exactly one of:**

| Class | Meaning |
|---|---|
| **A · DATABASE-ONLY** | changes the database contract; changes no application file |
| **B · APPLICATION-ONLY** | changes application files; changes no database contract |
| **C · MIXED** | changes both |

The classification is determined from the release's own committed artifact set,
not from intent. A release that declares `app_marker`/`app_files`, or lists any
application path in `git_files`, is not database-only regardless of how it was
described.

The classification belongs in the release report and in the manifest commentary
before production authorisation is sought.

### Ceremony per class

**DATABASE-ONLY.** Verify that the *currently deployed* application remains
compatible with the database both **before** and **after** the migration. Then the
migration may proceed with no application deployment.

**APPLICATION-ONLY.** Verify that the *new* application remains compatible with
the *currently deployed* database. Then the application may deploy with no
migration.

**MIXED.** See Rule 2. No production action may be taken until its ordering is
proven.

---

## Rule 2 · Mixed Release Compatibility

**No mixed release proceeds to production until the intermediate production state
for the selected deployment ordering is explicitly proven compatible.**

A mixed release has an intermediate state — the moment after one half has
deployed and before the other has. That state is a real production configuration
that real users can meet. It must be a valid one.

Exactly one of these must be proven before production:

**DB-first** — prove *old application + new database = compatible*.
Then: deploy database → verify → deploy application → verify.

**APP-first** — prove *new application + old database = compatible*.
Then: deploy application → verify → deploy database → verify.

If neither statement can be proven, Rule 3 applies.

### Required certification artifact

Before production authorisation, the release report or manifest must state all
seven of the following. **If any is unresolved, production authorisation is
blocked.**

1. Release classification (A / B / C).
2. Chosen deployment order.
3. The compatibility invariant for the intermediate state, stated as a claim.
4. The proof or test establishing that invariant.
5. Rollback behaviour after each production step.
6. The production checkpoint to run between steps.
7. Whether application deployment propagation must be confirmed before the next
   step proceeds.

### The distinction this rule exists to enforce

**Release certification and deployment-order compatibility are different
properties.** A release can be green in every gate, in its final assembled state,
and still be unsafe to deploy — because the gates test the destination and say
nothing about the road. Mixed-release intermediate compatibility is therefore a
first-class certification requirement, not a deployment detail.

### Origin — the v309 finding

v309 was the first release since v294 to change both application code and the
database contract. Application code deploys automatically from git on push; the
database changes only when an operator applies the migration. Pushing the
implementation commit therefore put new application code live against the older
database contract. `EventLifecycle.tsx` rendered `detail.next_actions`, a key
v309's `event_stage_detail` *added*, so that surface threw at render until the
migration landed.

No data was at risk and the gap closed when the migration committed, but the
window was bounded only by how long the operator took. A release that removed or
renamed a key, rather than adding one, would have failed harder — and a longer
window would have exposed it to users. The finding was banked at the v309
boundary; this rule discharges it.

v310 was subsequently classified DATABASE-ONLY, and because the vocabulary it
touched was preserved exactly, no application deployment was required and the
hazard did not arise. That is the rule working as intended.

---

## Rule 3 · Expand / Migrate / Contract

**If neither DB-first nor APP-first can be proven compatible, the release must
not be deployed as a single atomic release.**

It is redesigned so that every intermediate production state is valid. Acceptable
mechanisms include an expand → migrate → contract sequence, a compatibility shim,
a feature gate, an additive-only schema transition, or splitting into separate
releases.

**There must never knowingly be an intermediate production state in which the
deployed application and the database disagree about their contract.**

The canonical shape, when a field or key must change:

- **Expand** — add the new form alongside the old. Database-only; the application
  ignores it. Both old and new applications work.
- **Migrate** — ship the application that reads the new form while the old form
  still exists. Application-only; both database states work.
- **Contract** — remove the old form, once nothing reads it. Database-only, and
  subject to Amendment Five: removing an externally observable form is a RETIRE
  and requires explicit owner approval.

Dual-readable payloads across the window make the application forward- and
backward-compatible, so no push ordering can break it.

---

## Rule 4 · STANDING Floor

**The STANDING floor represents the intended frozen permanent-proof baseline, and
must be reconciled whenever a newly frozen permanent suite is intended to become
part of that baseline.**

The floor is not a historical number. It is a claim about what may never regress.
A suite that is executed at every certification but absent from the floor is
protected by convention rather than by the floor, which is precisely the drift
this rule prevents.

Reconciliation is performed as harness maintenance, and requires:

1. **Measure, do not infer.** Run the proposed floor and read the observed unique
   claim count. Claim identifiers are deduplicated across suites, so the correct
   floor is not necessarily the sum of the parts.
2. **Prove no frozen artifact is disturbed.** `manifest_digest` covers the
   repository deploy manifests; `verifier_digest` covers
   `ec/verify-deployment.sh`. Neither digests the harness `db/verify.sh`, where
   STANDING lives — so a floor change invalidates no production evidence. Confirm
   this still holds before changing the floor, rather than assuming it.
4. **Confirm nothing asserts the number.** `standing_verify` is a boolean and
   `gate_standing` reports the observed floor without asserting it. If any
   manifest, gate or proof ever begins asserting a floor number, changing the
   floor becomes a release-boundary matter rather than maintenance.
5. **Record the composition in the repository.** The harness is an external,
   non-git package, so the authoritative record of what the floor contains lives
   here, in this document.

### Reconciliation of 13 August 2026

**Before.** Seven suites, 177 claims — the pre-v292b set:
`v286_proof`, `v287a_proof`, `v287b_proof`, `v288a_proof`, `v289_proof`,
`v292a1_proof`, `v292b_proof` (24 + 21 + 26 + 34 + 25 + 27 + 20 = 177).

**The drift.** Sixteen frozen permanent suites — `v292d1` through `v310` — were
executed at every certification as declared `permanent_regress` entries but
appeared nowhere in the floor. The two sets were **disjoint**: the floor did not
omit *some* permanent suites, it contained *none* of them.

**After.** Twenty-three suites, **383 unique claims**, measured empirically:
exactly 177 + 206, with **zero claim-id collisions** across all twenty-three
suites. The floor now contains the seven pre-v292b proofs plus
`v292d1`, `v293`, `v294`, `v295`, `v297`, `v300`, `v302`, `v303`, `v304`, `v305`,
`v306`, `v307a`, `v307b`, `v308`, `v309`, `v310` permanent proofs.

**Custody.** No frozen evidence, manifest digest, verifier digest or release
artifact was invalidated. Verified before the change, not after.

**Operational consequence, recorded rather than discovered later.** The floor now
spans the whole chain, so it must run against a database at the current
architectural level. Certification does this by construction — the standing gate
runs against `EC_DB`, which the migration gate has already brought up to level. A
database deliberately rebuilt to an *older* release would fail this floor and
should be verified with an explicit `PROOFS=` list for that era instead.

### Reconciliation of 20 August 2026 — v310.1

The 13 August reconciliation above stands unaltered as historical evidence. This
section records the next one; it does not rewrite the previous.

**Before.** Twenty-three suites, 383 unique claims.

**Change.** One suite added: `v310_1_permanent_proof`, the frozen permanent suite
of the v310.1 Tenant Integrity Terminal Normalization release.

**After.** Twenty-four suites, **389 unique claims**, measured empirically rather
than inferred: exactly 383 + 6, with **zero claim-id collisions**. The floor now
contains the twenty-three suites listed above plus `v310_1_permanent_proof`.

**Custody, verified before the change rather than assumed.** `manifest_digest` is
computed from the repository deploy manifests and `verifier_digest` from
`ec/verify-deployment.sh` (`ec/verify-deployment.sh:166-167`). Neither digests the
harness `db/verify.sh`, where `STANDING` lives, so this floor change invalidates no
frozen production evidence. Nothing asserts the number: `standing_verify` is a
boolean, and `certify-release.sh:241` reports the observed floor without comparing
it to anything.

**Why this release needed one.** v310.1 is a small integrity patch, but its
permanent proof is the only standing guard against the defect class it repairs —
a tenant-scoped column default that names a tenant. Leaving that suite outside the
floor would have protected it by convention rather than by the floor, which is the
precise drift Rule 4 exists to prevent.
