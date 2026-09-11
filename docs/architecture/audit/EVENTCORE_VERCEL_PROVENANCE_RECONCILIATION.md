# EventCore Vercel Provenance Reconciliation

## Purpose

EventCore's hosting topology was never written down. Three Vercel projects build the
same GitHub repository, two of them have served production, and the surface the owner
actually uses is not the one the repository's own `DEPLOY.md` names. During the v311
application-deployment preflight this ambiguity became blocking: it was not possible to
say which project was authoritative, and therefore not possible to say whether v311's
application half was pending or already live.

This document reconstructs that history from primary evidence and banks it. It is a
custody record. It changes no product behaviour, alters no release artifact, and — see
**Actions explicitly not taken** — mutates nothing in Vercel, Git, Supabase or the
application.

## Reconstruction date

2026-09-10. Repository at `c56967e6c387e9bea8cbf6367e9886980c5ed086`, branch
`eventcore-erp`.

## Evidence sources

- **Vercel REST API, read-only**, via authenticated MCP: `list_teams`, `list_projects`,
  `get_project`, `get_project_deployment_protection`, `list_deployments` (paginated),
  `get_deployment`. Roughly 120 deployments were enumerated across the two EventCore-side
  projects.
- **Git history** of this repository, including branch topology and per-commit file scope.
- **Repository governance documents**: `DEPLOY.md`, `README.md`,
  `docs/FORWARD_PROCESS_SOP.md`, `docs/DEPLOYMENT_CERTIFICATION.md`,
  `ec/manifests/v311.manifest`, `ec/deploy-manifests/v311.deploy`,
  `ec/deploy-manifests/evidence/v310.1.production.preimage.md`.

No Supabase connection was opened. No Vercel write of any kind was issued.

## Confidence vocabulary

| Term | Meaning |
|---|---|
| **VERIFIED** | Read directly from primary evidence — an API response field or a Git object. |
| **STRONGLY INFERRED** | Not directly readable, but entailed by verified facts with no competing explanation that fits them. |
| **UNVERIFIED** | Not establishable from the evidence available under this task's read-only constraints. Recorded as open, not as fact. |

A conclusion marked STRONGLY INFERRED is **not** a historical fact and must not be cited
as one.

## Project inventory

Vercel account `bbgrossman-creator`, `accountId` `team_RdTPUWTiiPM4tf5Y4qGaSVAv`.
`list_teams` returns an empty array — this is a personal scope, not a team. **VERIFIED.**

All three projects are linked to the same GitHub repository
`github.com/bbgrossman-creator/eventspace-app`, `githubRepoId` `1271730429`. **VERIFIED.**

| Project | Project ID | Created (UTC) | Framework | Node | Current production source |
|---|---|---|---|---|---|
| **eventcore** | `prj_fi0ijYRimGMmDwJjGGzNmS3oCP6O` | 2026-06-17 01:34:37 | nextjs | 24.x | `eventcore-erp` @ `e9cd8869f2e7…` |
| **eventspace-app** | `prj_TLQCWjvY7WZKygjxdvMSZYhuh0A5` | 2026-06-17 01:26:02 | nextjs | 24.x | `main` @ `ae1df41b6fdf…` |
| **booking-crm** | `prj_ePxfFuCJ6z8Xsfsl805dclmts8Lg` | 2026-08-18 20:36:38 | nextjs | 24.x | not investigated — separate product |

## Project creation timeline

**VERIFIED.** The two EventCore-side projects were created **8 minutes 35 seconds apart**
and their first deployments built **the same commit**:

| | eventspace-app | eventcore (then `eventspace-app-tw14`) |
|---|---|---|
| Project created | 2026-06-17 01:26:02 UTC | 2026-06-17 01:34:37 UTC |
| First deployment | `dpl_5dJ7uJNucJcieDHuZ5ajNJcuWaLd` | `dpl_37Cynpm7LkVcaTVvKLv3sW1abAYZ` |
| First deployment at | 2026-06-17 01:31:13 UTC | 2026-06-17 01:34:39 UTC |
| Branch | `main` | `main` |
| Commit | `7ae369e3b1cf17177abef39b51aeec8470007f57` | *same* |
| Commit message | "Temporarily disable cron" (committed 2026-06-17 01:30:58 UTC) | *same* |
| Target | production | production |

**Neither project was cloned or duplicated from the other.** Both are independent GitHub
imports of the same repository. **STRONGLY INFERRED**, on evidence that admits no
competing reading: the second project's original name was `eventspace-app-tw14`, and
`-tw14` is the random disambiguation suffix Vercel appends when the desired project name
is already taken. The desired name was taken 8½ minutes earlier by the first project. A
clone or fork would not produce that suffix, and the projects carry different project IDs
with independent deployment series from their first minute.

### The rename

**VERIFIED that it happened.** Vercel stores the project name on each deployment record,
so the change is directly observable in the deployment series:

| Evidence | Deployment | Time (UTC) | Recorded project name |
|---|---|---|---|
| Still `eventspace-app-tw14` | `dpl_5jKTKD5XXE4teAxDbZAkQZK4dPoV` (v98) | 2026-07-03 23:02:32 | `eventspace-app-tw14` |
| Already `eventcore` | `dpl_D4PgXnAtUShGUUB4VKRzqPY3qHNf` (v257) | 2026-07-20 13:05:34 | `eventcore` |

**The rename occurred between 2026-07-03 23:02:32 UTC and 2026-07-20 13:05:34 UTC.**
The exact moment, and who performed it, are **UNVERIFIED** — the Vercel API exposes no
project audit log through the tools available here.

`eventspace-app` was never renamed. **VERIFIED.**

## Original-purpose finding

**The repository contains no record of why two EventCore-side projects exist.** A full
search of tracked documentation for a second-deployment rationale — demo versus
production, staging, beta, customer-safe promotion, separate deployment surfaces — returns
nothing. `DEPLOY.md` describes exactly one project and one import. **VERIFIED absence.**

**Best-supported finding: the two projects are the result of the repository being imported
into Vercel twice within nine minutes on 2026-06-17, and the second import — not the
first — became the one that was actually developed and used.** Confidence: **STRONGLY
INFERRED.** It rests on the `-tw14` collision suffix, the 8½-minute gap, the identical
first commit, and the fact that the second project accumulated the entire release series
from v20 onward.

What the evidence **does not** support is a designed two-environment architecture. Two
findings weigh against it:

1. **Both projects auto-deployed every `main` push to production, in parallel, for
   months.** A demo/production split would not have both surfaces tracking the same branch
   into production. **VERIFIED** from the parallel production series in both projects.
2. **Demo/production separation in EventCore was implemented at the tenant layer, not the
   deployment layer.** `ec/deploy-manifests/evidence/v310.1.production.preimage.md` records
   `EventCore Demo` (`35d9fb3f-984d-49c7-b96d-d8ee2d2caea9`) and `Burger Bar`
   (`72301f45-f07d-4e42-a4d0-fe149ae9ec17`) as **tenants inside one production database**.
   **VERIFIED.**

The prior architectural discussion contemplating separate deployment surfaces is recorded
here as context, but no artifact in this repository implements or references it. Whether
that discussion motivated the second import is **UNVERIFIED**.

## Domain / alias history

| Alias | Owned now by | Status |
|---|---|---|
| `eventspacems.vercel.app` | **eventcore** | The owner's live EventCore URL. **VERIFIED** present on the current production deployment's alias set. |
| `eventspace-app-tw14.vercel.app` | **eventcore** | Retained from the project's original name. **VERIFIED.** |
| `eventcore-bbgrossman-creators-projects.vercel.app` | **eventcore** | Project production alias. **VERIFIED.** |
| `eventcore-git-eventcore-erp-…vercel.app` | **eventcore** | Branch alias for `eventcore-erp`. **VERIFIED.** |
| `eventspace-app.vercel.app` | **eventspace-app** | The URL `DEPLOY.md` names. **VERIFIED.** |
| `eventspace-app-git-main-…vercel.app` | **eventspace-app** | Branch alias for `main`. **VERIFIED.** |

**Alias history is not retrievable through the available tooling.** The Vercel API surface
exposed here returns only current alias assignment; there is no alias-transfer log. The
following are therefore **UNVERIFIED**:

- when `eventspacems.vercel.app` was first attached, and to which project;
- whether any alias ever moved between the two projects;
- whether `eventspacems` was *intended* as the stable production hostname, as opposed to
  becoming it by use.

The owner's report that `eventspacems.vercel.app` was already the working EventCore URL by
2026-08-11 is recorded as owner testimony, not as verified API evidence.

## Branch evolution

**VERIFIED throughout.**

- `main` carried every EventCore release from the beginning through **v310**.
- `main` tip is `ae1df41b6fdf5788c3cf1324a41e4b94ed21c81e`, committed **2026-08-13
  04:07:15 UTC** — the Forward Process SOP commit. `main` has not advanced since.
- `origin/main` is an **ancestor** of `eventcore-erp`; the branches never diverged. The
  merge base is `ae1df41` itself, so `main` can fast-forward to the current head.
- The first commit that exists only on `eventcore-erp` is
  `a69ff54b731d85bae882d9232c63e53a9c9469a8`, **2026-08-20 15:48:27 UTC**, "v310.1 —
  tenant-scoped defaults derive from the acting session".
- `origin/eventcore-v310-frozen` is `b440fac76ca084b8deb5a3f832f1d6faa0cacba0`
  (2026-08-13 03:50:22 UTC), an ancestor of the `main` tip — a frozen v310 snapshot.

**Why development left `main` is UNVERIFIED.** No commit message, document or manifest in
this repository states a reason, and no artifact records the branch change as a decision.
What is verified is the shape of what happened: `main` did not become stale through
divergence or conflict — it simply stopped receiving commits at the v310 governance
boundary, and all subsequent work continued linearly on a differently-named branch.

**`eventcore-erp` is the de facto canonical EventCore implementation branch.** **VERIFIED**
by content — it carries v310.1 and v311 in full, including the certified production
evidence and the terminal freeze record. **It was never formally recorded as canonical.**
The Forward Process SOP, which governs how releases reach production, names no branch at
all.

## Production deployment chronology — project `eventcore`

Material transitions. Times UTC. "auto" = created by a push to the Production Branch;
"promote" = a pre-existing preview deployment manually promoted.

| # | Time | Branch | Commit | Mode | Release | App source changed? |
|---|---|---|---|---|---|---|
| 1 | 2026-06-17 01:34:39 | `main` | `7ae369e3b1cf` | auto | pre-EventCore | first deployment |
| … | 2026-06-17 → 2026-08-13 | `main` | (continuous series) | auto | v20 → v310 | yes, per release |
| 2 | 2026-08-11 20:26:27 | `main` | `7451db601fab` | auto | v306-era | yes |
| 3 | 2026-08-13 03:50:26 | `main` | `b440fac76ca0` | auto | v310 evidence | no |
| 4 | **2026-08-13 04:07:19** | `main` | **`ae1df41b6fdf`** | auto | Forward Process SOP | no |
| — | *(no production deployment for 10 days)* | | | | | |
| 5 | 2026-08-20 15:55:33 | `eventcore-erp` | `a69ff54b731d` | **preview** | v310.1 | no |
| 6 | 2026-08-20 16:42:31 | `eventcore-erp` | `041f4f742447` | preview | v310.1 evidence prep | no |
| 7 | 2026-08-20 21:29:06 | `eventcore-erp` | `cac18eb66149` | preview | v310.1 evidence | no |
| 8 | 2026-08-20 22:07:28 | `eventcore-erp` | `6b4275195f4a` | preview | transport doc | no |
| 9 | 2026-08-21 02:03:42 | `eventcore-erp` | `e9cd8869f2e7` | preview | **v311** | **yes — first build carrying v311 app files** |
| 10 | **2026-08-23 05:00:59** | `eventcore-erp` | **`e9cd8869f2e7`** | **promote** | **v311** | **yes — this is the live production deployment** |
| 11 | 2026-09-04 10:31:26 | `eventcore-erp` | `55e3549228e3` | preview | v311 harness repair | no |
| 12 | 2026-09-04 10:46:38 | `eventcore-erp` | `13f6ca930110` | preview | v311 proof hardening | no |

Row 4 is the **last production deployment sourced automatically from `main`**:
`dpl_4rEn8nF4dqPxTwFWFa7PpEUs7cNs`. **VERIFIED.**

Row 10 is `dpl_3MSHUpGDYxaprzXWez3RRco4HG58`. `get_deployment` returns
`"action": "promote"`, `"source": "redeploy"`, and
`"originalDeploymentId": "dpl_7HC9XYhSMvDZBWU2nk85yQQik1TS"` — the row-9 preview.
**VERIFIED.**

**Rows 11 and 12 are the decisive evidence on the Production Branch setting.** Pushes to
`eventcore-erp` on 2026-09-04 produced deployments with `target: null` — previews. Had
`eventcore-erp` been the configured Production Branch, those pushes would have deployed to
production. They did not.

**The configured Production Branch of both EventCore-side projects is `main`.**
Confidence: **STRONGLY INFERRED.** The `productionBranch` setting field is not exposed by
any read-only tool available here; the conclusion rests on observed behaviour — every
automatic production deployment in either project came from `main`, and `eventcore-erp`
pushes produce previews. Corroborating: the `eventcore` project's `updatedAt` is
2026-08-23 05:01:40 UTC, immediately following the promotion, with no later configuration
change.

**The exact first — and only — `eventcore-erp` commit ever promoted to production is
`e9cd8869f2e7ef6c499dcbaf70f7a510585304e2`.** **VERIFIED.**

Governance and certification-only commits **do** trigger preview builds on both projects,
because both auto-build every push to the repository. **VERIFIED** (rows 6, 7, 8, 11, 12).

## v311 application promotion history

**VERIFIED at every step.**

1. **First appearance in Git.** Commit `02224470798a67d0d8fe05a329368ed09d592103`,
   2026-08-21 01:34:05 UTC, "Certify v311 — booked Event becomes a quantified Kitchen
   Requirement", introduced all three v311 application files:
   - `src/lib/kitchen/quantities.ts` (new, 166 lines)
   - `src/components/execution/KitchenQuantities.tsx` (new, 236 lines)
   - `src/components/execution/EventWorkspace.tsx` (modified, +6: one import, one mount)

   This is the **only** commit in `origin/main..HEAD` that touches `src/`.

2. **First build carrying them.** `0222447` and `e9cd886` were pushed together
   (`repoPushedAt` 2026-08-21 02:03:38 UTC), so the first Vercel build containing the v311
   application files is the `e9cd886` preview `dpl_7HC9XYhSMvDZBWU2nk85yQQik1TS`, built
   2026-08-21 02:03:42 UTC.

3. **Promotion to production.** 2026-08-23 05:00:59 UTC, as
   `dpl_3MSHUpGDYxaprzXWez3RRco4HG58`. Two days after the preview was built. Manual, by
   promotion of that preview — not by a push, and not by the governed ceremony.

4. **Application delta between the live commit and current HEAD: NONE.**
   ```
   git diff --name-only e9cd886..HEAD -- src/ public/ next.config.js \
                                          package.json package-lock.json vercel.json
   → (empty)
   ```
   The four commits after `e9cd886` — `55e3549`, `13f6ca9`, `d89e595`, `c56967e` — touch
   only `certify-release.sh`, `ec/lib/gates.sh`, the v311 manifests and evidence,
   `proofs/v311_manifest_reader_proof.sh`, `supabase/tests/v311_permanent_proof.sql` and
   `docs/FORWARD_PROCESS_SOP.md`.

5. **Equivalence of live application scope to certified v311 source: VERIFIED.** The three
   v311 application files are present at `e9cd886` and are byte-identical to their state at
   `c56967e`. Nothing in the certified v311 application source is missing from the live
   deployment.

   One boundary on that claim: the live **bytes** were built by Vercel on Linux from
   `e9cd886`, and this reconciliation compared **source**, not build output. The
   independently confirmed native Windows production build of the same source at `c56967e`
   completed with exit 0, 33/33 static pages.

## Current authoritative production surface

| | |
|---|---|
| Project | **eventcore** (`prj_fi0ijYRimGMmDwJjGGzNmS3oCP6O`) |
| URL | **https://eventspacems.vercel.app** |
| Live deployment | `dpl_3MSHUpGDYxaprzXWez3RRco4HG58` |
| Live source commit | `e9cd8869f2e7ef6c499dcbaf70f7a510585304e2` |
| Live source branch | `eventcore-erp` |
| Reached production by | manual promotion, 2026-08-23 05:00:59 UTC |
| Contains v311 application code | **YES** |

The owner identifies `https://eventspacems.vercel.app/bookings` as the working EventCore
URL. That alias resolves to this project and this deployment. **VERIFIED.**

## Obsolete / legacy surfaces and status

**`eventspace-app`** (`prj_TLQCWjvY7WZKygjxdvMSZYhuh0A5`) — production is
`main` @ `ae1df41b6fdf`, i.e. **the pre-v311 application**, unchanged since 2026-08-13
04:07 UTC. It still auto-builds every push to the repository, so it holds current preview
deployments of `eventcore-erp` while its *production* surface remains four weeks stale.

Classification: **a historical duplicate that is still live.** It is not a staging surface
— nothing designates it as one, and it tracked `main` into production exactly as
`eventcore` did. It is not the active production surface — the owner does not use its URL.
It is **not obsolete in the sense of being switched off**: `eventspace-app.vercel.app`
serves a working, older EventCore against the same production database.

**This project is left exactly as it is.** No deletion, no pause, no alias change, no
setting change is performed or recommended by this reconciliation. Any disposition is an
owner decision.

## Booking CRM separation boundary

Confirmed only to the extent needed to establish separation. No further investigation was
performed.

| Fact | Status |
|---|---|
| Vercel project `booking-crm`, `prj_ePxfFuCJ6z8Xsfsl805dclmts8Lg` | **VERIFIED** |
| Created 2026-08-18 20:36:38 UTC | **VERIFIED** |
| Aliases `booking-crm-ten.vercel.app`, `booking-crm-…`, `booking-crm-git-booking-crm-…` | **VERIFIED** |
| Git branch `booking-crm`; `origin/booking-crm` currently at `ae1df41` | **VERIFIED** |
| Separate Supabase project `jhuicwcsyiwrnxmllydg` | recorded from owner ruling; **UNVERIFIED** here — no Supabase contact was made |
| Independent release namespace | governed by the Shared Cross-Product Ledger |

`booking-crm` is linked to the **same GitHub repository** as the EventCore projects and
therefore also receives preview builds from EventCore branches. Its **production** surface
tracks its own branch. **Booking CRM must not inherit EventCore ERP changes
automatically**, and the reconciled topology does not cause it to: nothing in the
EventCore deployment path targets the `booking-crm` branch or project.

## Governance deviations

| # | Deviation | Evidence | Classification |
|---|---|---|---|
| 1 | **v311's application half reached production by manual promotion of a preview, not by the governed push ceremony.** | `dpl_3MSHUpGDYxaprzXWez3RRco4HG58`, `action: promote`, 2026-08-23 05:00:59 UTC | **HISTORICAL ONLY** — the act is complete, the deployed source is certified, and no ongoing hazard follows from it. It is recorded because it is the reason the deployment state was mis-described. |
| 2 | **v311 application deployment preceded v311 certification.** Promotion 2026-08-23; certification and production evidence 2026-09-04 (`d89e595`). | commit and deployment timestamps | **DOCUMENTATION GAP** — `docs/DEPLOYMENT_CERTIFICATION.md §3` holds that certification passing is not authorisation; here deployment preceded certification entirely. Whether the v311 **database** was applied before 2026-08-23, which is what SOP Rule 2's DB-first ordering requires, is **UNVERIFIED** — the production evidence capture is dated 2026-09-04 and the migration date is not recorded anywhere in this repository. |
| 3 | **SOP Rule 2's seven-item artifact is incomplete for v311.** Items 1, 2 and the database half of item 5 are stated in the manifests; the intermediate-state invariant (3), its proof (4), the application-side rollback (5), the inter-step checkpoint (6) and propagation confirmation (7) are not. | `ec/manifests/v311.manifest:118`, `ec/deploy-manifests/v311.deploy:72-81` | **DOCUMENTATION GAP** |
| 4 | **`ec/manifests/v311.manifest:118` labels the release "MIXED RELEASE (Forward Process SOP Rule 1, Class B)".** Class B is APPLICATION-ONLY in the SOP table; MIXED is Class C. | manifest line vs `docs/FORWARD_PROCESS_SOP.md` Rule 1 table | **DOCUMENTATION GAP** — prose and executed ordering are correct; only the letter is wrong. The manifest is a frozen release artifact and is **not** amended by this reconciliation. |
| 5 | **`main` is stale and undeclared.** Frozen at `ae1df41` since 2026-08-13 while the canonical branch moved to `eventcore-erp`, with no artifact recording either fact. | branch topology | **CURRENT RISK** — `main` is the Production Branch of both projects, so any future push to `main` would auto-deploy to production, and any Vercel rollback that lands on a `main`-sourced deployment lands on the pre-v311 application. |
| 6 | **Three Vercel projects auto-build one repository.** | project inventory | **CURRENT RISK** — every EventCore push produces builds in three projects, one of which is a separate product, and two of which can serve EventCore production URLs. |
| 7 | **Production alias/project ambiguity.** `DEPLOY.md` names `eventspace-app.vercel.app`; the live surface is `eventspacems.vercel.app` on a different project. | `DEPLOY.md` vs verified alias ownership | **DOCUMENTATION GAP** — this document is the record; `DEPLOY.md` itself is left unamended. |
| 8 | **Undocumented project rename and repurposing.** `eventspace-app-tw14` → `eventcore`, between 2026-07-03 and 2026-07-20, unrecorded anywhere. | deployment name series | **DOCUMENTATION GAP** — closed by this document. |
| 9 | **The GitHub repository is public.** `githubRepoVisibility: "public"` on every deployment record inspected, including the current production deployment. `DEPLOY.md` Step 1 instructs that it be kept **Private**. | Vercel deployment metadata | **REQUIRES REMEDIATION** — an owner decision, outside this task. Recorded here because it is a live divergence from the repository's own written instruction, not a historical one. No secret is known to be committed: `.gitignore` excludes `.env*`, and `.env.local` is untracked. |

Nothing in this table is repaired by this document.

## Accepted historical facts vs unresolved unknowns

**Accepted as established (VERIFIED):**

- Two EventCore-side Vercel projects were created 8m35s apart on 2026-06-17 and first
  deployed the same commit `7ae369e3b1cf`.
- The project now named `eventcore` was originally named `eventspace-app-tw14`.
- It was renamed between 2026-07-03 23:02:32 UTC and 2026-07-20 13:05:34 UTC.
- `eventcore` carried the whole release series from v20 to v310 automatically from `main`.
- `main` froze at `ae1df41` on 2026-08-13 04:07:15 UTC; `eventcore-erp` continues linearly
  from it.
- v311's application files entered Git at `0222447` and reached production by manual
  promotion of the `e9cd886` preview on 2026-08-23 05:00:59 UTC.
- The live production application source is identical to certified v311 application source;
  no application delta is pending.

**Unresolved (UNVERIFIED) — recorded as open questions, not filled in by inference:**

1. The exact moment and actor of the `eventspace-app-tw14` → `eventcore` rename.
2. Full alias history: when `eventspacems.vercel.app` was attached, and whether any alias
   ever moved between projects.
3. Whether the second 2026-06-17 import was deliberate or an accidental double import.
4. Whether the contemplated demo/testing-surface architecture motivated it.
5. Why development moved from `main` to `eventcore-erp`, and whether it was decided or
   drifted into.
6. The date the v311 **database** migration was applied to production — and therefore
   whether SOP Rule 2's DB-first ordering was in fact honoured on 2026-08-23.
7. Environment-variable **name sets** for either project: no read-only tool available here
   exposes them. No value was read, and none should be.
8. Root directory, install/build command overrides: not exposed.
9. Whether `eventspacems.vercel.app` was *intended* as the stable production hostname.

## Backend identity

**Repository evidence:** `ec/deploy-manifests/evidence/v310.1.production.preimage.md:21`
names EventCore production as Supabase project ref `omvbxbjbtjwjkebasgng`. **VERIFIED** as
a repository fact.

**Local configuration:** the untracked `.env.local` in this working tree has a
`NEXT_PUBLIC_SUPABASE_URL` whose host matches `omvbxbjbtjwjkebasgng`. **VERIFIED** by
match test only — no value is reproduced here, and none should be.

**Vercel-side binding: UNVERIFIED.** Whether the `eventcore` project's deployed environment
points at `omvbxbjbtjwjkebasgng` cannot be established from the metadata available under
this task's constraints, and was not established by querying the database. The local
`.env.local` governs local development, not the deployed surface. That the live application
serves the owner's real bookings against the certified v311 database is **STRONGLY
INFERRED** from consistent operation, not verified.

## Present canonical deployment model

As reconciled, and stated so a future release does not have to re-derive it:

| | |
|---|---|
| Canonical development branch | `eventcore-erp` |
| Canonical production project | `eventcore` (`prj_fi0ijYRimGMmDwJjGGzNmS3oCP6O`) |
| Canonical production URL | `https://eventspacems.vercel.app` |
| Configured Production Branch | `main` — **STRONGLY INFERRED**, and **not** the branch development happens on |
| Application transport | git push → Vercel auto-build (`docs/FORWARD_PROCESS_SOP.md:97`) |
| Database transport | operator-applied migration (`docs/DEPLOYMENT_CERTIFICATION.md §3`) |
| Legacy EventCore surface | `eventspace-app` — live, stale at `ae1df41`, left untouched |
| Separate product | `booking-crm` — independently governed |

**The structural tension this reconciliation exposes, stated plainly:** the canonical
development branch and the configured Production Branch are different branches, and the
live production deployment was produced by neither mechanism — it was hand-promoted from a
preview. Until that is resolved by an owner decision, "deploy the application" has no
single unambiguous meaning in this topology.

## Actions explicitly not taken

No project was deleted, renamed, paused, unpaused or otherwise altered. No deployment was
created, promoted, redeployed or rolled back. No alias or domain was added, removed or
moved. No Production Branch, environment variable, protection setting or build
configuration was changed. No Git push was performed. No Supabase connection was opened and
no migration was run. No application file was modified. No frozen release manifest or
evidence file was amended, including the Class B/C label at `ec/manifests/v311.manifest:118`
and the stale `DEPLOY.md` URL. No Booking CRM artifact was touched. v312 was not begun.

This document adds one file and changes nothing else.

## Future deployment rule

Until an owner ruling supersedes it:

1. **`eventspacems.vercel.app`, on project `eventcore`, is the production surface.** Any
   statement about "what is live" resolves against that project's production deployment and
   no other.
2. **Verify before asserting.** The live production commit is read from
   `get_deployment`, never inferred from a branch tip. This reconciliation exists because
   that inference was made once and was wrong.
3. **Manual promotion is a production action** and requires the same explicit authorisation
   as a push. It is not a preview convenience.
4. **The Production Branch and the canonical development branch must be reconciled** before
   the next application release, or the deployment mechanism must be stated explicitly in
   that release's own artifact. A release must not be planned as "push to deploy" while the
   branch that deploys is not the branch that holds the release.
5. **`eventspace-app` is not a deployment target.** Nothing is promoted there, and its
   staleness is not a defect to be fixed by deploying to it.
6. **Booking CRM is never a target of an EventCore deployment act.**

---

## Superseded — 10 September 2026, 23:05 UTC

**The reconstruction above is a point-in-time record and is preserved unaltered.** Its
accuracy as of its reconstruction date is itself evidence and is not rewritten. This
section records what changed afterwards, on the same day.

### § Current authoritative production surface is superseded

The table under that heading described production **before** EventCore's first
governed Rule 5 deployment. Four of its rows no longer describe the live surface:

| Field | As reconstructed | **Current** |
|---|---|---|
| Live deployment | `dpl_3MSHUpGDYxaprzXWez3RRco4HG58` | **`dpl_Dgkt8RhoyFEGjtn39ZMGuWhrxxaT`** |
| Live source commit | `e9cd8869f2e7…` | **`a95370b0d4ff8acd413fd60b25fbcc69a65a3669`** |
| Live source branch | `eventcore-erp` | **`eventcore-production`** |
| Reached production by | manual promotion, 2026-08-23 | **governed Rule 5 push, 2026-09-10 23:04:12 UTC** |

Unchanged: the project is still `eventcore` (`prj_fi0ijYRimGMmDwJjGGzNmS3oCP6O`) and
the authoritative URL is still `https://eventspacems.vercel.app`, which resolves to
the new deployment by hostname resolution. The application source is byte-identical
across the change — `e9cd886..a95370b` carries no application delta — so what
production serves did not change; only which deployment serves it, and by what
mechanism.

`dpl_3MSHUpGDYxaprzXWez3RRco4HG58` remains in the deployment chronology as the
hand-promoted deployment this record was written to explain. It is no longer live.

### What changed between, in order

| UTC | Event |
|---|---|
| 2026-09-10 ~20:30 | `eventcore-production` created locally at `e9cd886`, the then-live commit, so the new branch represented production exactly |
| 2026-09-10 20:49 | `origin/eventcore-production` pushed — no Vercel build produced; the commit was already built |
| 2026-09-10 20:55 | `origin/eventcore-erp` pushed to `a95370b` — three preview builds, no production movement |
| 2026-09-10 21:12:14 | **Owner changed the Vercel Production Branch** from `main` to `eventcore-production`, by hand. Production did not move; the branch already held the live commit |
| 2026-09-10 23:04:12 | `eventcore-production` fast-forwarded to `a95370b` and pushed — **the first governed Rule 5 deployment** |
| 2026-09-10 23:05:11 | `dpl_Dgkt8RhoyFEGjtn39ZMGuWhrxxaT` READY, `target: production`, from ref `eventcore-production`, serving `eventspacems.vercel.app` |

### Governance deviations — status changes

Two entries in the table above have moved:

- **#1, manual promotion of a preview** — remains HISTORICAL ONLY, and is now
  discharged by SOP **Rule 5 · Deployment Topology** (banked at `a95370b`), whose
  *Origin* section records it by name. Manual promotion is now emergency-only.
- **#5, stale `main` as Production Branch** — no longer a CURRENT RISK for
  `eventcore`: its Production Branch is `eventcore-production`. `main` remains
  `eventspace-app`'s Production Branch, so a push to `main` would now reach the
  legacy surface only, never `eventspacems.vercel.app`. `main` stays frozen, so this
  is latent rather than active. Entries #6 (three projects building one repository)
  and #9 (public repository) are **unchanged and still open**.

### Unresolved question #6 — bounded, then closed as an accepted gap

*"The date the v311 database migration was applied to production"* is now bounded
rather than open-ended: **after 2026-08-20 20:51:38 UTC** (the v310.1 production
grade records 111 objects with no v311 object present) **and at or before 2026-09-04
21:09:41 UTC** (the v311 production grade records 151 present, 0 missing). The exact
date is **UNKNOWN and likely permanently unrecoverable**, because migrations applied
as flat files through the SQL Editor leave no row in
`supabase_migrations.schema_migrations`, PostgreSQL stores no object-creation
timestamps, and v311's new relations were deliberately left empty in production.

Full reasoning, including the inference that is explicitly **not** promoted to fact,
is in `docs/v311_CLOSURE_REPORT.md` § 11. Questions 1–5 and 7–9 remain open exactly
as written.

### Where v311's identity now lives

`docs/v311_CLOSURE_REPORT.md` is the authoritative closure record for v311 — its
Rule 2 seven-item discharge, its deployment identity, its live-check status and its
migration-date finding. This record remains the authoritative history of *how the
topology came to be*; it is not the place to look for what is currently deployed.

**Nothing in Vercel, Git, Supabase or the application was altered by this addendum.**
No project was deleted, renamed, redeployed or otherwise changed.
