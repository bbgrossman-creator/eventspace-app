# Deployment manifests — the format

A deployment manifest answers ONE question: **what must already exist in a
database before a release's application code can run against it?**

It is not a migration, not a proof, and not a substitute for either. It is the
machine-readable statement of a release's *database prerequisites*, so that
`ec/verify-deployment.sh` can prove a target database is at the required
architectural level before anyone calls a release deployable.

## Why this exists

v294 shipped certified and green. Its application code reached production; its
migration never did. Every gate passed, because every gate ran against `ec` —
a local database — while production was three releases behind. The first
symptom was a user seeing `PGRST202: Could not find the function
public.projection_preparation_queue`.

Certification proved the release worked. Nothing proved the target database
could run it. That gap is what these manifests close.

## File

    ec/deploy-manifests/<release>.deploy

One file per release, from v292a forward. Declarative; no logic in manifests.

## Keys

| Key | Cardinality | Meaning |
|---|---|---|
| `release` | once | the release id, matching the filename |
| `migration` | once | the SQL file that creates these objects |
| `migration_source` | once | `repository` or `recovered:<path>` — where that file actually lives |
| `min_release` | once | the release that must be verified first; forms the chain |
| `function` | repeatable | `name(identity args)` — EXACT identity signature |
| `table` | repeatable | table name in `public` |
| `view` | repeatable | view name in `public` |
| `index` | repeatable | index name in `public` |
| `trigger` | repeatable | `table:trigger_name` |
| `policy` | repeatable | `table:policy_name` |
| `superseded` | repeatable | objects this release created that a LATER release dropped or renamed. **Documentation only — never verified.** |

Lines beginning with `#` and blank lines are ignored.

**An unknown key is a hard setup failure** (v299 · Fable M-1). The verifier exits
2, prints `MANIFEST ERROR — unrecognised key(s)`, and `--quiet` does not suppress
it. A misspelled key — `functoin` for `function` — silently drops a requirement,
and a manifest that requires nothing verifies green. That is a worse outcome
than no guard, so it is refused rather than noted.

## Production evidence

Local verification is half the gate. The archived production result lives at

    ec/deploy-manifests/evidence/<release>.production.grade

and is required before any release is declared deployable. See
`ec/deploy-manifests/evidence/README.md` for the ceremony.

## Function signatures are exact

`function` values carry the full identity signature as PostgreSQL renders it
via `pg_get_function_identity_arguments`:

    function  projection_preparation_queue(p_now timestamp with time zone)

Not the name alone. The v294 outage was a *missing* function, but the same
class of failure — a function present under a different signature — produces
the identical `PGRST202` symptom, and a name-only check would call it PRESENT.

Write `timestamp with time zone`, not `timestamptz`: that is what the catalog
returns, and the comparison is literal.

## `superseded` is not a requirement

A release may create an object that a later release legitimately drops or
renames. v292a creates `promise_current_profile`; v292a1 drops it and replaces
it with occurrence-anchored resolvers. v292a's manifest records that under
`superseded` so the history stays readable, and the verifier never demands it.

Requiring it would make every chain verification fail at head — the manifest
would be asserting the past instead of the present.

## The chain

`min_release` makes the manifests a linked list. Verifying v294 verifies
v292b, which verifies v292a1, which verifies v292a. The verifier walks it
transitively and checks the union, so a target database cannot pass a late
release while missing an early one — which is exactly what production did.

## Adding a release

1. Read the migration and enumerate what it creates. Do not guess from names.
2. Confirm each object and signature against a database known to be at that
   level (`ec`), so the manifest records observed reality rather than intent.
3. Set `min_release` to the immediately preceding release with a manifest.
4. Move anything a later release drops or renames into `superseded`.
5. Run `ec/verify-deployment.sh <release> --db ec` — it must PASS.
6. Run `proofs/deployment_guard_proof.sh` — the negative controls must still
   fail as designed.
