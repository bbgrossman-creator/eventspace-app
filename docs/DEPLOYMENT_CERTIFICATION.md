# Deployment certification

**Verification only.** Nothing here changes SQL architecture, projections,
envelopes, release sequencing, the occurrence model, the work lens or the
promise lens. It adds one question to certification and answers it with catalog
reads.

---

## 1 · The failure this exists to prevent

v294 shipped. Every gate was green: one-shot proof 16/16, permanent proof 8/8,
races, standing floor, TypeScript, browser acceptance 9/9. The application
deployed to Vercel successfully.

An operator opened the Preparation Queue and saw:

```
PROJECTION ERROR
Could not find the function public.projection_preparation_queue
without parameters in the schema cache.
```

Not a code defect. `supabase/v294_preparation_queue.sql` had been applied to
`ec` — the local certification database — and never to production. Production
was three releases behind: `engagement_occurrence` absent, so
`occurrence_is_active` absent, so `projection_occurrence_brief` absent, so
`projection_preparation_queue` could not exist.

**Every gate asked "does the release work?" None asked "can the database we are
shipping against run it?"** `deployed_marker` came closest and still targeted
`$EC_DB`, printing *"release is live"* about a database no user ever touches.

v296 made it reachable: it registered the rail entry that turned a URL-only
surface into one an operator could click. A release that ships no SQL can still
be the release that exposes an undeployed band to users.

## 2 · What was added

| Artifact | Role |
|---|---|
| `ec/deploy-manifests/*.deploy` | machine-readable database prerequisites, one file per release from v292a |
| `ec/deploy-manifests/README.md` | the manifest format |
| `ec/verify-deployment.sh` | the read-only verifier |
| `ec/deploy-manifests/fixtures/*.deploy` | negative controls — manifests that MUST fail |
| `proofs/deployment_guard_proof.sh` | claims DG-1…DG-7 |
| `gate_deployment_certification` in `ec/lib/gates.sh` | the certification gate |
| one call in `certify-release.sh` | runs it last, guarding the verdict |

## 3 · Running it

```sh
ec/verify-deployment.sh v297 --db ec          # the local certification database
ec/verify-deployment.sh v297 --url            # $EC_TARGET_DB_URL, if you have one
ec/verify-deployment.sh v297 --emit-sql       # print the check; run it yourself
ec/verify-deployment.sh v297 --grade out.csv  # grade output pasted back
```

`--emit-sql` is not a convenience. **Production is reachable only through the
Supabase SQL Editor from this host** — there is no database credential in the
environment, and `ec-pgadmin` is namespace-locked to local `ec*` databases. A
guard that could only inspect `ec` would repeat the original mistake in a new
file. Emit the SQL, run it where the database actually is, save the result,
grade it. Same manifests, same verdict, no credential handling.

## 4 · Example output

Passing, against `ec` at head:

```
EventCore deployment certification
  release : v294
  chain   : v292a v292a1 v292b v292d v292d1 v293 v294
  target  : local database 'ec'
  required: 69 object(s)

PASS  table engagement_occurrence
PASS  function occurrence_is_active(p_occurrence uuid, p_now timestamp with time zone)
PASS  function projection_occurrence_brief(p_occurrence uuid, p_now timestamp with time zone)
PASS  function projection_preparation_queue(p_now timestamp with time zone)
PASS  trigger engagement_occurrence:engagement_occurrence_append_only
PASS  policy occurrence_status:occurrence_status_select

  present: 69    missing: 0

DEPLOYMENT CERTIFICATION PASSED
```

Failing — what production would have printed on the day v294 shipped:

```
PASS  table engagement_profile
PASS  table attendance_commitment
FAIL  table engagement_occurrence   [required by v292a1]
FAIL  function occurrence_is_active(p_occurrence uuid, p_now timestamp with time zone)   [required by v292a1]
FAIL  function projection_occurrence_brief(p_occurrence uuid, p_now timestamp with time zone)   [required by v292b]
FAIL  function projection_preparation_queue(p_now timestamp with time zone)   [required by v294]

  present: 12    missing: 57

DEPLOYMENT CERTIFICATION FAILED

The target database is BELOW the level v294 requires. Missing, oldest release first:

  v292a1   table     engagement_occurrence
  v292a1   function  occurrence_is_active(p_occurrence uuid, p_now timestamp with time zone)
  v292b    function  projection_occurrence_brief(p_occurrence uuid, p_now timestamp with time zone)
  v294     function  projection_preparation_queue(p_now timestamp with time zone)

The release is NOT deployable against this target. Apply the migrations for
the releases named above, in chain order, then re-run this check.
```

The failure names the **oldest** missing release first, because that is the one
to fix first. Reading the v294 outage backwards from `projection_preparation_queue`
cost several rounds of investigation; this output would have started at
`engagement_occurrence`.

## 5 · Three design decisions worth defending

**Signatures, not names.** A manifest pins
`projection_preparation_queue(p_now timestamp with time zone)`, not the bare
name. PostgREST reports a wrong-signature function and an absent function
identically — `PGRST202` — so a name-only check would call a signature drift
healthy. DG-4 proves the guard is sensitive to this.

**A missing manifest fails.** Unlike `migration`, `one_shot` and `race`, which
the runner skips on an empty manifest value, an undeclared release is an error.
The defect that caused the outage was an *absent* check; a guard that goes quiet
when unconfigured reproduces it. DG-6 proves this.

**The chain is walked transitively.** Verifying v294 verifies v292a1. Production
failed with v294's code present and v292a1's objects absent — the exact state a
shallow check would certify green. DG-5 proves the walk is deep.

## 5b · Production evidence is mandatory (v299 · Fable B-1)

The first revision certified `ec` and printed a NOTE reminding the reader that
production was a different database. Fable ruled that a note is not evidence,
and it was right: a passing local gate plus a reminder is still a green verdict
about the wrong database.

**The gate now has two halves and both must pass.**

1. **Local** — `ec/verify-deployment.sh <release> --db $EC_DB`.
2. **Production** — the archived result at
   `ec/deploy-manifests/evidence/<release>.production.grade` is required and
   re-graded with the same manifests. Missing, empty, malformed, incomplete,
   stale, wrong-release or locally-produced evidence all fail the gate.

On success `certify-release.sh` prints what it actually certified:

    v299 CERTIFICATION GREEN — N gates, Ns
    deployment evidence: database=postgres executed_at=2026-08-02 19:43:12+00

The ceremony is in `ec/deploy-manifests/evidence/README.md`.

### Local-only mode

`./certify-release.sh <version> --local-only` runs everything including the local
half, and **withholds the deployable verdict**:

    v299 LOCAL VERIFICATION ONLY — NOT DEPLOYABLE — N gates, Ns
    No production evidence was graded. This run does NOT certify the release.

It exists so a release can be exercised before production evidence is available.
It cannot be mistaken for certification, because it never prints the green line.

### Provenance binds evidence to its target (Fable M-3)

The emitted SQL carries eleven `provenance|…` rows: release, manifest digest,
verifier digest, object count, chain, execution timestamp, database, user,
server address, server version, postmaster start. `--grade` requires them.

This closes the gap a filename leaves open. `v299.production.grade` is a name
anyone can type over any file; provenance is produced by the database that
answered. Grading `ec`'s own output as production evidence is refused outright —
DG-13, the most direct false-green path that existed.

### Freshness

Digest binding is structural: change a manifest or the verifier and every prior
result is invalid immediately. The age limit — `EC_EVIDENCE_MAX_AGE_DAYS`,
default 14 — is temporal, because a database can drift while no file changes. An
older result requires `EC_EVIDENCE_OVERRIDE_REASON`, printed in the report rather
than silently honoured.

## 5c · Unknown manifest keys are a hard failure (Fable M-1)

A key the verifier does not recognise exits 2 with `MANIFEST ERROR`, and
`--quiet` does not suppress it. `functoin` instead of `function` drops a
requirement, and a manifest requiring nothing verifies green — a certified-
looking pass with no coverage behind it. DG-8 and DG-9 prove the refusal and
that it survives `--quiet`.

## 6 · What this does NOT claim

- It does not prove the objects *behave* correctly. That is what the permanent
  proofs do. This proves they **exist, in the right schema, with the right
  signature**.
- It does not apply migrations, reload schema caches, or write anything. DG-7
  scans the generated SQL for write verbs mechanically rather than asserting
  read-only as a promise.
- Running it against `ec` says nothing about production. That is why the local
  half alone can no longer produce a deployable verdict — see §5b. A green line
  about the wrong database is how this incident happened.
- Grading proves what the target database held **at `executed_at`**, not what it
  holds now. The freshness rule bounds that gap; it does not remove it.

## 7 · Adding a release

1. Add `ec/deploy-manifests/<release>.deploy` — see the README for the format.
2. Set `min_release` to the previous release.
3. Enumerate objects from the migration; confirm each against a database known
   to be at that level. Do not transcribe intent.
4. `ec/verify-deployment.sh <release> --db ec` must pass.
5. `bash proofs/deployment_guard_proof.sh` must stay 15/15.

Certification will refuse the release until step 1 exists.

## 8 · Debt ledger

Registered limits of this guard. Each is a known boundary, not a defect to be
discovered later.

### A-8 · The manifest floor assumes the existing production database

The chain roots at v292a. Everything beneath it — the v288a baseline and the
whole pre-v292a schema — is assumed present because the one production database
this project has always had it.

**That assumption holds only for the current target.** A new target, a
disaster-recovery rebuild, a second Supabase project, a Partini environment, or
**a production database restored from backup** makes it false, and the guard
would certify a database missing its entire foundation. Any of those events
raises a **MATERIAL** requirement:

- a `v288a-baseline.deploy` chain root enumerating the pre-v292a objects, with
  `min_release` on `v292a.deploy` pointing at it; and
- fresh production evidence from the new target — evidence from the old one
  proves nothing about it.

A restore deserves naming explicitly because it is the case that looks least
like a new target: same project, same connection string, same name. But a
restore reinstates whatever the backup held, which may predate the chain root,
and evidence produced before the restore describes a database that no longer
exists. Treat it as a new target.

Do not treat a passing guard as clearance for a database it has never seen.

### A-11 · Provenance protects against mistakes, not against fabrication

Archived provenance defends against the ways an honest operator gets it wrong:
the wrong release, stale output, output from a local database, an incomplete
paste, or manifests and verifier bytes that changed after the result was
produced. Every one of those is refused, and each refusal is proved by a
negative control.

**It does not cryptographically prove the result came from production.** The
evidence is text a human copies from a browser into a file. A determined
operator can hand-write a file that satisfies every check. The guard raises the
cost of an accident to near-certain detection; it does not defend against
deliberate fabrication by the person running the ceremony. Nothing in this
design should be described as tamper-proof.

### A-12 · Production is PostgreSQL 17.6; local certification is 18.4

Recorded from real provenance: production reports `server_version 17.6`, while
`ec` runs 18.4.

Object-identity verification is unaffected — `pg_proc`,
`pg_get_function_identity_arguments`, `pg_indexes`, `pg_policies` and
`information_schema` behave identically for the queries this guard issues, and
the v299 evidence returned 77/77 against 17.6.

**The behavioural proofs are the exposure.** The permanent proofs, race proofs
and the 177-claim standing floor all execute against 18.4 and are then treated
as statements about a 17.6 system. Planner behaviour, lock semantics and
function-body edge cases can differ across a major version. No claim in this
package covers that gap, and closing it means aligning the local major version
or running the behavioural proofs against a 17.6 target.
