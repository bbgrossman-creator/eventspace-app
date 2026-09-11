# v311 · Closure Report

**Booked Event → Operational Requirements (Kitchen proving slice)**

**Closed 10 September 2026.** This is the release report SOP Rule 2 requires
(`docs/FORWARD_PROCESS_SOP.md:73` — *"the release report or manifest must state all
seven of the following"*). v311's manifests were frozen before five of those items
were written down; this report states them, together with the release's production
deployment identity, so that no future architect needs session history to establish
what v311 is or where it runs.

It changes no product behaviour, amends no frozen artifact, and performs no
deployment. Everything it records had already happened before it was written.

---

## 1 · Release classification — Rule 2 item 1

**Class C · MIXED.** The release changes both the database contract and application
files, which under `docs/FORWARD_PROCESS_SOP.md:23-27` is Class C.

Determined from the committed artifact set, not from intent, as Rule 1 requires:
four migrations (`supabase/v311_kitchen_requirements.sql`,
`v311_authority_grant.sql`, `v311_kitchen_quantity_decisions.sql`,
`v311_kitchen_enactment.sql`) and three application paths in `git_files`
(`src/lib/kitchen/quantities.ts`, `src/components/execution/KitchenQuantities.tsx`,
`src/components/execution/EventWorkspace.tsx`).

### Erratum — historical, additive, not corrected in place

`ec/manifests/v311.manifest:118` reads:

> `# MIXED RELEASE (Forward Process SOP Rule 1, Class B). Database objects AND`

**Class B is APPLICATION-ONLY in the Rule 1 table; MIXED is Class C.** The sentence
declares MIXED and cites the letter for a different class. The prose, the chosen
ordering and the executed ceremony are all correct — only the letter is wrong.

**The manifest is deliberately left unamended.** Not because an edit would break
anything: `manifest_digest` is computed only over `ec/deploy-manifests/*.deploy`
(`ec/verify-deployment.sh:163-166`), `ec/manifests/*.manifest` is read declaratively
by key (`certify-release.sh:84`) so comment lines match nothing, and no digest or
tripwire covers it anywhere. An edit would be inert to every gate. It is left alone
because it is a frozen release artifact, and editing it would leave the repository
holding a manifest whose text differs from the one under which v311 was certified
and deployed — trading a visible typo for an invisible provenance divergence, which
is the worse defect. **The correct class is C. This entry is the correction.**

---

## 2 · Deployment order — Rule 2 item 2

**DATABASE FIRST.** Stated at `ec/manifests/v311.manifest:119-123` and
`ec/deploy-manifests/v311.deploy:72-77`. The four migrations are themselves ordered:
requirements → authority → decisions → enactment.

The reason APP-first was rejected is recorded in both manifests: the Kitchen panel
calls `kitchen_event_panel`, which does not exist until the migration lands, so an
application-first deployment would have shipped a surface that errors on load.

---

## 3 · Intermediate-state invariant — Rule 2 item 3

Rule 2 requires the DB-first invariant *"stated as a claim"*
(`docs/FORWARD_PROCESS_SOP.md:63,78`). The manifests argued only why APP-first was
wrong; the invariant itself was never written down. It is stated here:

> **CLAIM.** The application deployed to EventCore production before v311's
> application half — `origin/main` at `ae1df41b6fdf5788c3cf1324a41e4b94ed21c81e` —
> is compatible with the v311 production database.

---

## 4 · Proof of the invariant — Rule 2 item 4

Established by enumeration rather than assertion.

**The application under test is the right one, not a proxy.** `ae1df41` was project
`eventcore`'s production deployment from 2026-08-13 04:07:19 UTC until the 2026-08-23
promotion — exactly the application that occupied the intermediate state.

1. That application invokes **46 distinct RPCs** (enumerated from `origin/main:src/`).
2. v311 **replaced five** existing functions: `generate_obligations`,
   `embed_operational_basis`, `obligation_nk_complete`, `commit_attendance`,
   `correct_attendance`. Of these the deployed application calls exactly **two**:
   - `generate_obligations` — `src/lib/execution/spine.ts:92`
   - `commit_attendance` — `src/lib/promise/ceremonies.ts:109`
3. Both retain their exact prior signature and return type:
   - `generate_obligations(p_event uuid) returns integer` — identical in
     `supabase/v311_kitchen_enactment.sql:444` and the v275 baseline
     `supabase/v275_ceremonies.sql:19`. The application sends `{p_event}` and reads a
     number.
   - `commit_attendance(p_occurrence uuid, p_head_count integer, p_basis text,
     p_effective_moment timestamptz, p_reason text) returns jsonb` —
     `supabase/v311_kitchen_enactment.sql:361`, matching the application's five named
     arguments exactly, and **confirmed live in production** at
     `ec/deploy-manifests/evidence/v311.production.grade:35`.
4. `embed_operational_basis`, `obligation_nk_complete` and `correct_attendance` have
   **no call site** in that application.
5. v311's single removal, `can_manage_kitchen_quantity()`, has **no call site** in
   that application either.
6. Everything else v311 adds is new relations and new functions the older
   application never names.

**No incompatibility exists between the previously deployed application and the v311
database.** The invariant in §3 holds.

---

## 5 · Rollback behaviour per step — Rule 2 item 5

**Database step.** Stated at `ec/deploy-manifests/v311.deploy:78-84`: the three new
relations are droppable, nothing outside v311 references them, and the replaced
functions are restorable from their frozen sources — `embed_operational_basis` from
v284, `generate_obligations` from v275, `commit_attendance` / `correct_attendance`
from v292a1. `can_manage_kitchen_quantity` is restorable but reinstates the role-list
authority defect and must not be restored without the Architect.

**Application step.** Not stated in any v311 artifact; supplied here, and now
generically governed by SOP Rule 5 § Rollback.

**Qualification — v311 has no clause-(a) rollback target.** Rule 5 permits manual
promotion *"as a rollback to a deployment that was itself a governed production
deployment."* `dpl_Dgkt8RhoyFEGjtn39ZMGuWhrxxaT` is **the first** governed production
deployment in EventCore's history. Its predecessor,
`dpl_3MSHUpGDYxaprzXWez3RRco4HG58`, reached production by manual promotion and is
therefore not a clause-(a) target. **Rolling v311's application back would require
Rule 5 clause (b) — explicit written emergency authorisation naming the deployment
id.**

The practical impact is nil: the two deployments carry byte-identical application
source (§9), so a rollback would change nothing a user could observe. The governance
position is stated rather than glossed. From the next release onward,
`dpl_Dgkt8RhoyFEGjtn39ZMGuWhrxxaT` is a valid clause-(a) target and this condition
does not recur.

---

## 6 · Production checkpoint — Rule 2 item 6

**The artifact exists.** `ec/deploy-manifests/evidence/v311.production.grade` —
**151 objects present, 0 missing**, `executed_at 2026-09-04 21:09:41.490867+00`,
`manifest_digest 7166071f1e13efd043c08ff38f738342`,
`verifier_digest 4cc32fafa58e9264d6549ec3b2750a37`, committed at `d89e595`.

**Ordering deviation, recorded as it happened.** Rule 2 calls for a checkpoint *between*
the two production steps. This check ran on **2026-09-04**, twelve days **after** the
application reached production on 2026-08-23. It is a valid post-hoc verification of
the database, and it is **not** contemporaneous compliance with Rule 2's ordering.
It is recorded here as a deviation and is not rewritten as anything else.

---

## 7 · Propagation confirmation — Rule 2 item 7

**Not applicable; resolves trivially.** The application deployment was the terminal
step of this release. No step followed it, so no propagation gate governs a
subsequent action. Rule 5 ceremony steps 7–8 now cover propagation and verification
generically for future releases.

---

## 8 · Production deployment identity

The authoritative record of where v311 runs.

| | |
|---|---|
| Vercel project | **`eventcore`** — `prj_fi0ijYRimGMmDwJjGGzNmS3oCP6O` |
| Production branch | **`eventcore-production`** |
| Production deployment | **`dpl_Dgkt8RhoyFEGjtn39ZMGuWhrxxaT`** |
| Production / certified commit | **`a95370b0d4ff8acd413fd60b25fbcc69a65a3669`** |
| Authoritative URL | **https://eventspacems.vercel.app** |
| Pushed | 2026-09-10 23:04:12 UTC |
| Build READY | 2026-09-10 23:05:11 UTC (51 s) |
| `target` / `source` | `production` / `git` — not a promotion |
| Aliases resolved to it | `eventspacems.vercel.app`, `eventspace-app-tw14.vercel.app` (by hostname resolution, not field inspection) |

**First governed Rule 5 production deployment: SUCCESSFUL.** It is also the
behavioural proof that the Production Branch handover took: a push to
`eventcore-production` produced a deployment with `target: production` from ref
`eventcore-production`.

**Rule 5 at-rest invariant: CLOSED.**

```
local  eventcore-production  = a95370b0d4ff8acd413fd60b25fbcc69a65a3669
origin/eventcore-production  = a95370b0d4ff8acd413fd60b25fbcc69a65a3669
Vercel production commit     = a95370b0d4ff8acd413fd60b25fbcc69a65a3669
```

The topology this deployment runs under is defined by SOP Rule 5; the history that
produced it is reconstructed in
`docs/architecture/audit/EVENTCORE_VERCEL_PROVENANCE_RECONCILIATION.md`.

---

## 9 · Application delta

**`e9cd886..a95370b` contains ZERO application delta.**

```
git diff --name-only e9cd886..a95370b -- src/ public/ next.config.js \
                                         package.json package-lock.json vercel.json
→ (empty)
```

The six commits in that range touch only `certify-release.sh`, `ec/lib/gates.sh`,
the v311 manifests and evidence, `proofs/v311_manifest_reader_proof.sh`,
`supabase/tests/v311_permanent_proof.sql` and documentation.

The application serving production is therefore byte-equivalent to the one that
preceded it. This deployment changed **which deployment serves**, not **what it
serves** — which is precisely why it was the right release to inaugurate the
governed ceremony on.

---

## 10 · Live application verification

Performed read-only against `https://eventspacems.vercel.app` after the deployment
reached READY. No application data was created, edited or deleted.

| Check | Result |
|---|---|
| `/bookings` loads | **PASS** — HTTP/2 200, `<title>EventCore</title>`, `x-vercel-cache: PRERENDER` |
| Served by the new deployment | **PASS** — every asset URL carries `?dpl=dpl_Dgkt8RhoyFEGjtn39ZMGuWhrxxaT`; no other deployment id appears |
| No runtime/production error | **PASS** — zero matches for `PROJECTION ERROR`, `data-kitchen-error`, `Could not find the function`, `Internal Server Error`, `schema cache` |
| Operations/workspace route reachable | **PASS (shell only)** — `/bookings/[id]` returns 200, zero error markers. Fetched with an all-zero UUID so no real Event was read |
| Kitchen · Quantities panel renders | **UNVERIFIED — not failed** |
| No `data-kitchen-error` on that panel | **UNVERIFIED — not failed** |
| Adjust / approve controls absent | **UNVERIFIED — not failed** |

**Why three items are UNVERIFIED.** The panel mounts inside a lazily-loaded chunk
that the route's initial HTML does not reference — all 14 initially-referenced chunks
(769 KB) were searched and contained no Kitchen marker, which is **absence of the
chunk from the initial set, not absence of the code.** Rendering the panel requires
an authenticated Supabase session and a real released Event. Verification stopped
rather than authenticate, bypass a control, or touch production data.

These three are **open observations, not failures.** The supporting facts: the same
application source was live and in daily use before this deployment (§9), and the
database half is certified present at 151/0 (§6), so the `kitchen_event_panel`
function the panel calls demonstrably exists in production.

---

## 11 · Migration date — bounded window, exact date unknown

| Evidence | Fact |
|---|---|
| `ec/deploy-manifests/evidence/v310.1.production.preimage.md:22` | *"v310.1 marker at capture time — absent — production is at v310"* (2026-08-20) |
| `v310.1.production.grade` | `executed_at 2026-08-20 20:51:38.801798+00`, 111 objects, chain ends `… v310 v310.1` — **no v311 object graded** |
| `0222447` | v311 migration bytes first committed 2026-08-21 01:34:05 UTC |
| `v311.production.grade` | `executed_at 2026-09-04 21:09:41.490867+00`, **151 present / 0 missing** |

**KNOWN FACT.** The v311 migration was applied to production **after 2026-08-20
20:51:38 UTC and at or before 2026-09-04 21:09:41 UTC.** The practical lower bound
tightens to 2026-08-21 01:34 UTC, when the migration bytes first existed.

**BOUNDED INFERENCE — not promoted to fact.** Had the migration landed after the
2026-08-23 application promotion, every released Event's workspace would have
rendered the rose `data-kitchen-error` box — `KitchenQuantities.tsx:203-204` surfaces
a failed `kitchen_event_panel` call verbatim — throughout the gap. No such failure
was reported and the surface is in daily use. This *suggests* the migration preceded
2026-08-23 05:00:59 UTC, and therefore that DB-first ordering was honoured in fact.
**It is inference from an absence of complaint. It is not evidence and is not
recorded as fact.**

**EXACT DATE: UNKNOWN — likely permanently unrecoverable.** EventCore migrations are
applied as flat files through the SQL Editor or an authorised management channel,
never `db push`, so they leave no row in `supabase_migrations.schema_migrations`.
PostgreSQL records no object-creation timestamps, and v311's three new relations were
deliberately left empty in production — *"NO PRODUCTION GRANT IS CREATED BY THIS
RELEASE"* — so no row timestamp exists to date them. This is closed as an **accepted
historical gap**, not an open question.

---

## 12 · Certification summary

| | |
|---|---|
| Command | `./certify-release.sh v311` |
| Result | **GREEN**, 25 gates, exit 0, governed DEPLOYABLE verdict |
| v311 permanent proof | **PASS=85 · FAIL=0 · ERROR=0** |
| Browser suites | 195 passed / 0 failed |
| STANDING floor | 24 suites / 389 claims → **25 suites / 474 claims**, +85, **0 collisions**, zero proof residue |
| Production evidence | 151 present / 0 missing, committed `d89e595` |
| Windows production build | exit 0, 33/33 static pages, Next.js 14.2.35 |
| Terminal freeze | recorded in `docs/FORWARD_PROCESS_SOP.md` § *Reconciliation of 4 September 2026 — v311*, committed `c56967e` |

---

## 13 · Closure determination

| Dimension | Status |
|---|---|
| APPLICATION COMPLETE | **YES** |
| DATABASE COMPLETE | **YES** |
| DEPLOYMENT COMPLETE | **YES** |
| CERTIFICATION COMPLETE | **YES** |
| GOVERNANCE COMPLETE | **YES** — on the banking of this report |
| **FULLY CLOSED** | **YES** |

Three facts are carried forward as recorded-and-accepted rather than resolved: the
Class B erratum (§1), the Rule 2 item 6 ordering deviation (§6), and the unknown
migration date (§11). None blocks closure; each is banked so it is never rediscovered
as a surprise.

---

## 14 · Cross-references

- SOP Rules 1, 2, 4 and 5 — `docs/FORWARD_PROCESS_SOP.md`
- Release manifest — `ec/manifests/v311.manifest` *(frozen; Class B erratum per §1)*
- Deploy manifest — `ec/deploy-manifests/v311.deploy` *(frozen)*
- Production evidence — `ec/deploy-manifests/evidence/v311.production.grade` *(frozen)*
- Deployment topology history — `docs/architecture/audit/EVENTCORE_VERCEL_PROVENANCE_RECONCILIATION.md`
- Deployment guard doctrine — `docs/DEPLOYMENT_CERTIFICATION.md`
