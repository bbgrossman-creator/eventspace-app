# EventCore Forward Process SOP

**Adopted 13 August 2026, at the post-v310 governance boundary.**

This document banks five standing rules that govern how releases reach production
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

### Reconciliation of 4 September 2026 — v311

The 13 August and 20 August reconciliations above stand unaltered as historical
evidence. This section records the next one; it does not rewrite either.

**Before.** Twenty-four suites, 389 unique claims.

**Change.** One suite added: `v311_permanent_proof`, the frozen permanent suite of
the v311 Booked Event → Operational Requirements release, installed into the
harness by the certification run's install gate and appended to `STANDING` exactly
once.

**After.** Twenty-five suites, **474 unique claims**, measured empirically rather
than inferred: exactly 389 + 85, with **zero claim-id collisions** and zero proof
residue — row counts identical before and after. The floor now contains the
twenty-four suites listed above plus `v311_permanent_proof`. The measurement was
taken under `./certify-release.sh v311` — twenty-five gates, exit 0, the governed
deployable verdict rather than the `--local-only` banner that refuses it — in which
v311's own suite reported PASS=85 FAIL=0 ERROR=0 across seven rolled-back suites,
and the archived production evidence graded present 151, missing 0, committed as
`ec/deploy-manifests/evidence/v311.production.grade` in d89e595.

**Custody, verified before the change rather than assumed.** `manifest_digest` is
computed from the repository deploy manifests and `verifier_digest` from
`ec/verify-deployment.sh` (`ec/verify-deployment.sh:166-167`). Neither digests the
harness `db/verify.sh`, where `STANDING` lives, so this floor change invalidates no
frozen production evidence, including the v311 evidence committed above. The
harness is not a git repository, so its frozen state is recorded here rather than
by a harness commit; the installed proof was verified byte-identical to the
repository's `supabase/tests/v311_permanent_proof.sql` by SHA-256.

**Why this release needed one.** v311 carries eighty-five claims and is the first
release to bridge a committed Event into an operative Kitchen Requirement. Its
permanent proof is the only standing guard over properties that have no deploy key
at all — approval atomicity, regeneration no longer voiding an approved revision, a
future-effective guest count becoming current by derivation at its own instant, and
an adopted commitment revision reconciling every receiving domain while preserving
the identity and evidence of Requirements nobody touched. Leaving that suite outside
the floor would have protected the release's core behaviour by convention rather
than by the floor, which is the precise drift Rule 4 exists to prevent.

---

## Rule 5 · Deployment Topology

**Adopted 10 September 2026, at the v311 closure boundary.**

**EventCore production is served by exactly one Vercel project, from exactly one
git branch, and that branch must at rest point to the commit production is actually
serving.**

### Branch roles

| Branch | Role | A push produces |
|---|---|---|
| `eventcore-erp` | canonical EventCore development and custody branch | preview deployments only |
| `eventcore-production` | the Vercel Production Branch of project `eventcore` | the EventCore production deployment |
| `main` | frozen historical lineage, and the fork point Booking CRM inherits | nothing; it is not advanced |
| `booking-crm` | a separate governed product | outside this rule entirely |

### The production surface

| | |
|---|---|
| Vercel project | `eventcore` — `prj_fi0ijYRimGMmDwJjGGzNmS3oCP6O` |
| URL | `https://eventspacems.vercel.app` |
| Production Branch | `eventcore-production` |

**`eventspace-app` (`prj_TLQCWjvY7WZKygjxdvMSZYhuh0A5`) is not a deployment
target.** Nothing is pushed, promoted or deployed to it, and the staleness of what
it serves is not a defect to be repaired by deploying to it. Its disposition is a
separate retirement decision, and until that decision is taken it is preserved
unaltered.

Booking CRM is a separate governed product with its own branch, Vercel project,
Supabase project and release namespace. **No EventCore deployment act ever targets
it.** `main` is frozen partly to keep it that way: `main` is the last common
ancestor of both products, so advancing `main` would place EventCore changes on the
path a Booking CRM merge would naturally follow.

### The invariant

**At rest, `eventcore-production` points to the commit EventCore production is
serving.**

That is the whole rule in one line; everything below is the procedure that keeps it
true. When the branch and the live deployment disagree, the repository has lost the
ability to answer *what is live* — and answering that question from a branch tip
while the two had silently diverged is the specific error this rule exists to
prevent.

### The governed release ceremony

Custody and deployment are separate acts with separate triggers. **A push to
`eventcore-erp` is never a deployment.**

1. Develop on `eventcore-erp`.
2. Push `eventcore-erp` for custody. Previews only. This may happen at any time,
   including for work nowhere near releasable.
3. Certify the release.
4. Where the release changes the database contract and Rule 2's chosen ordering is
   DB-first, apply the migration and verify production against the release's deploy
   manifest **before** step 5. A DATABASE-ONLY release under Rule 1 completes here:
   it has no application deployment and `eventcore-production` does not move.
5. Fast-forward `eventcore-production` to the certified SHA.
6. Push `eventcore-production`. **This is the deployment act.**
7. Verify the live application.
8. Record the resulting deployment identity in the release's closure.

Step 5 is a fast-forward. **`eventcore-production` is never force-pushed, rebased or
rewritten.** It is a ledger of what reached production, and a ledger that can be
edited is not one.

The failure mode of this ordering is deliberately the safe one: omitting step 6
leaves certified work undeployed, which is visible and harmless. The arrangement it
replaces — where the development branch was itself the deployment trigger — fails
the other way, deploying uncertified work the moment it is pushed for safekeeping.
That is the Rule 2 hazard arriving through a different door.

### Rollback

Rollback is Vercel Instant Rollback to a deployment that was itself a governed
production deployment, or a fast-forward of `eventcore-production` to a prior
certified SHA where the history permits it. Neither reverses a migration: Rule 2's
per-step rollback statement governs the database, and a rollback of the application
alone returns production to an intermediate state that Rule 2 requires to have been
proven compatible.

### Manual promotion

**Manual promotion of a Vercel deployment to production is emergency-only.** It is
permitted only:

- **(a)** as a rollback to a deployment that was itself a governed production
  deployment, or
- **(b)** under explicit written emergency authorisation naming the deployment id.

Promoting a preview that was never a governed production deployment is not permitted
under (a) and requires (b).

**Any manual promotion must be reconciled into git custody the same day**, by moving
`eventcore-production` to the promoted commit and pushing it, so the invariant is
restored. An unreconciled promotion is the defect this rule was written to close, not
an accepted state.

### Origin — the v311 promotion

v311's application half reached production on 23 August 2026 by manual promotion of
the preview built from `eventcore-erp` at `e9cd8869f2e7` — deployment
`dpl_3MSHUpGDYxaprzXWez3RRco4HG58`, recorded by Vercel as `action: promote`. It was
not a push, it was not the governed ceremony, and it preceded v311's certification by
twelve days.

No harm followed. The promoted source is the certified v311 application source:
`e9cd886..c56967e` contains no application delta, so what production serves is what
v311 certified. The damage was to knowledge. For eighteen days the repository could
not say what production was running, because the only branch anyone would consult had
never been the branch that deployed, and a full provenance reconstruction was required
to recover a fact a release branch would have recorded for free.

That reconstruction — project creation history, the `eventspace-app-tw14` →
`eventcore` rename, the alias inventory, the production deployment chronology and nine
recorded governance deviations, each marked VERIFIED, STRONGLY INFERRED or UNVERIFIED
— is banked at
`docs/architecture/audit/EVENTCORE_VERCEL_PROVENANCE_RECONCILIATION.md` (commit
`456aed4`). This rule discharges that finding; that record holds its evidence.
