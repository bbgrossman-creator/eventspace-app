# Production evidence

    ec/deploy-manifests/evidence/<release>.production.grade

One archived file per release, holding the **complete, unedited** result of the
deployment check run against **production**. `gate_deployment_certification`
requires it and re-grades it. Without it, certification fails closed and the
release is not deployable.

## Why a file, and why archived here

Production is not reachable from the certification host: there is no database
credential in the environment, and `ec-pgadmin` is namespace-locked to local
`ec*` databases. A guard that could only inspect `ec` would repeat the mistake
that caused the v294 outage — a green line about the wrong database.

So the operator runs the check where the database actually is, and archives the
answer where the gate can grade it. The path is deterministic so no gate has to
be told where to look.

## The ceremony

```sh
# 1 · emit the check (read-only; one SELECT over catalog views)
ec/verify-deployment.sh v299 --emit-sql

# 2 · run it in the Supabase SQL Editor against PRODUCTION

# 3 · save the COMPLETE result — provenance rows included — to
#     ec/deploy-manifests/evidence/v299.production.grade

# 4 · grade it
ec/verify-deployment.sh v299 --grade ec/deploy-manifests/evidence/v299.production.grade
```

Step 3 means all of it. The eleven `provenance|…` rows are not decoration; the
grader refuses a file without them.

## What the grader checks

| Check | Refusal |
|---|---|
| provenance rows present | `no provenance rows` — the result did not come from `--emit-sql`, or the rows were not copied |
| `release` matches | `this result is for release 'vX', not 'vY'` |
| `manifest_digest` matches the current chain | the manifests changed since the result was produced |
| `verifier_digest` matches the current verifier | `ec/verify-deployment.sh` changed since the result was produced |
| `object_count` and row count match | `incomplete paste` — a truncated copy cannot pass |
| `database` is not `ec` / `ec_*` | local output cannot stand in for production evidence |
| `executed_at` within the freshness window | stale evidence |

## Freshness

Evidence must be no older than **`EC_EVIDENCE_MAX_AGE_DAYS`, default 14 days**.

Two mechanisms, deliberately different in kind:

- **Digest binding is structural.** Change a manifest or the verifier and every
  prior result is invalidated immediately, regardless of age — the evidence no
  longer describes the check being run.
- **The age limit is temporal.** A database can drift without any repository
  file changing, so a result eventually stops being a statement about now.

An older result may be accepted only with an explicit human override, and the
reason is printed in the gate output rather than buried:

```sh
EC_EVIDENCE_OVERRIDE_REASON="prod frozen for the holiday embargo; verified 2026-08-02" \
  ec/verify-deployment.sh v299 --grade ec/deploy-manifests/evidence/v299.production.grade
```

There is no silent override and no default-on bypass.

## What this directory does NOT hold

Not a database dump, not credentials, not a connection string. Each file is the
text output of one read-only catalog query: object names, PRESENT/MISSING, and
provenance identifying which database answered and when.
