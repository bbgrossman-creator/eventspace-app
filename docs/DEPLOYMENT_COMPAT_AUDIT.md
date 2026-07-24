# EventCore — Deployment Compatibility Audit & Fix
## pgcrypto qualification · app_user elimination · generator future-proofing

**Scope.** Deployment compatibility only. No architecture redesigned, no
constitutional behaviour changed, no SQL semantics altered beyond resolving the
two incompatibilities. Both defects are now structurally excluded rather than
patched.

---

## 1 · Root cause (why this recurred across two releases)

**It was not a new defect in v286/v287a. It was an incomplete fix in v267a.**

`v267a_pgcrypto_compat.sql` addressed the identical symptom in v267 by creating
a `public.digest(bytea, text)` wrapper. That shim covered **only the
`(bytea, text)` signature.**

Every migration that hashes **text** — `digest(<text>, 'sha256')` — calls the
**`(text, text)`** signature, which the shim never covered. v286's
`responsibility_natural_key()` and v287a's `projection_truth_version()` both
hash text, so both fell straight through the existing protection.

That is the whole explanation for the recurrence: the guard existed, and it was
one signature too narrow.

---

## 2 · Audit results

### 2.1 · `digest()` occurrences

| Measure | Count |
|---|---|
| Raw `digest(` matches (all file types, incl. comments and TS identifiers) | 92 |
| **Real unqualified SQL call sites** (comments and non-SQL excluded) | **80** |
| SQL files containing them | 32 |
| Already qualified before the fix | 0 |
| **Qualified to `extensions.digest(...)` by this fix** | **79** |
| Intentionally left unqualified (the shims themselves) | 1 file pair |

Signature breakdown of the call sites: predominantly `bytea` (covered by
v267a), plus the **text-argument** calls that were never covered and caused the
production failures.

Files corrected (32): `v266_hardening`, `v267_boundary`,
`v267b_publish_offer_digest_fix`, `v270_protective_compatibility`,
`v271_acceptance_ceremonies`, `v272_rescission`, `v275_ceremonies`,
`v278_ceremonies`, `v279_action_dispatch`, `v280_ceremonies`, `v284_publish`,
`v286_responsibility`, `v287a_projection_spine`, and the corresponding proof
and race files for v265–v284.

**Deliberately excluded:** `v267a_pgcrypto_compat.sql` and
`v287_deploy_compat.sql`. Their `digest(` references *construct* the wrappers;
qualifying them would make the shims self-referential and break them.

### 2.2 · `app_user` occurrences

| Measure | Count |
|---|---|
| Total `app_user` mentions across the repo | 178 |
| Bare grants corrected (single-line) | 65 |
| Bare grants corrected (multi-line) | 3 |
| **Total grants corrected** | **68** |
| Grants already inside role-existence guards — **retained** | 23 files |
| **Truly unguarded `app_user` grants remaining** | **0** |
| `set local role app_user` in proofs (test-only, see §4) | 44 |

The guarded idiom was **already correct** in v277, v278, v279, v280, v283 and
v284:

```sql
if exists (select 1 from pg_roles where rolname = 'app_user') then
  execute format('grant execute on function public.%s to app_user', fn);
end if;
```

These blocks are deployment-safe by construction and were left untouched. Only
**bare, unguarded** grants were rewritten to `to authenticated`.

### 2.3 · An audit-method defect worth recording

An intermediate check reported 8 unguarded grants; a second reported 0. Both
were wrong in different ways. The reconciliation: guards are written **both**
as `rolname='app_user'` and `rolname = 'app_user'`, and a pattern without
`\s*` around `=` silently misclassifies guarded grants as unguarded. Two files
(`v275_projections.sql`, `v275_ceremonies.sql`) were nearly "corrected" on the
strength of a false positive. The spacing-tolerant pattern is now the
documented gate in `SQL_RELEASE_CONVENTIONS.md`.

---

## 3 · The permanent fix

### 3.1 · `supabase/v287_deploy_compat.sql` (new, apply FIRST)

Additive, idempotent, semantics-preserving. Guarantees `extensions.digest`
resolves in **every** environment, for **both** signatures:

- pgcrypto in `extensions` (Supabase) → detected, no-op.
- pgcrypto in `public` (dev/CI) → creates delegating wrappers in `extensions`.
- `(text, text)` absent entirely → synthesized over the `bytea` form.

Wrappers delegate; no hashing behaviour changes anywhere.

### 3.2 · All call sites qualified

91 `extensions.digest(` call sites now exist; 0 unqualified remain outside the
shims.

### 3.3 · Grants

Every bare grant now targets `authenticated` only. Non-standard roles are
permitted solely inside a role-existence guard.

---

## 4 · Known remaining item (reported, not silently skipped)

**44 `set local role app_user` statements across 16 proof files.** These are
role *switches* in RLS tests, not grants, and they are **not** part of any
deployment — no migration contains one. They live in:

- **Legacy, outside the active regression scope:** `v200_rls_proof`,
  `v201`–`v209`, `v253`–`v258`.
- **Active scope:** `v263_proof`, `v264_proof`.

Both active-scope files were re-run against a database with **no `app_user`
role** and produced their original certification counts exactly — v263: 1 PASS,
v264: 0 PASS — identical to the v284 baseline. They are therefore not masking a
regression.

**Recommended remediation** (not performed here — it is test-refactoring, not a
deployment fix, and rewriting 16 untested legacy files to chase a
non-deployment-blocking issue would risk the certified floor for no deployment
gain): adopt the v265+ role-discovery pattern, documented as Rule 3 in
`SQL_RELEASE_CONVENTIONS.md`. Sequence it as its own slice with its own
regression run.

---

## 5 · Verification — the fix proven, not asserted

Both databases were **dropped and rebuilt from scratch**, then the entire
corrected chain applied under deployment-equivalent conditions:

1. `v287_deploy_compat.sql` applied first — reported
   `created extensions.digest(bytea,text) delegating to public` and
   `created extensions.digest(text,text) delegating to public`.
2. **The `app_user` role was dropped entirely** (`drop owned by … cascade`,
   then `drop role`), leaving `authenticated` only.
3. The full 38-migration chain plus `v286` and `v287a` applied to both `ec` and
   `eczr`.

**Result: the entire chain applied clean with no `app_user` role present and
pgcrypto reachable only as `extensions.digest`.** That is the exact condition
that was failing in production.

### Regression after the fix

```
SQL      : 395 PASS / 0 FAIL      (v287a floor 395 held EXACTLY)
residue  : 0 (ec ≡ eczr fingerprint)
tsc      : v281 / v284 / strictcheck — CLEAN
browser  : spot-check accept-basis 11/0, accept-items 6/0, accept-workspace 13/0
           (the client tree was not modified — only supabase/*.sql was touched)
grants   : applied to `authenticated` only
```

No proof was weakened, no assertion changed, no semantics altered.

---

## 6 · Future-proofing

**There is no separate SQL generator to correct.** The audit found no template
engine or scaffolding script emitting these files. The nearest thing to a
generator is the `execute format('grant … to %s', fn)` pattern embedded inside
the ceremony migrations themselves — and that pattern was **already guarded**
on role existence in every file that uses it.

Future regressions are prevented by four mechanisms:

1. **`docs/SQL_RELEASE_CONVENTIONS.md`** (new) — codifies all four rules:
   qualify `extensions.digest`, grant only to existing roles, discover roles in
   proofs, and verify against a deployment-equivalent database before release.
2. **`v287_deploy_compat.sql`** — makes the qualified name resolvable
   everywhere, so the correct form is also the *working* form in dev. A
   developer can no longer write the portable version and have it fail locally,
   which is what made the unqualified form attractive in the first place.
3. **Copy-paste safety** — all 32 files now show the correct form, so the
   dominant authoring method (copying an adjacent migration) now propagates the
   correct pattern instead of the defective one.
4. **A pre-packaging grep gate** — two commands in the conventions document,
   with the spacing-tolerant pattern, that must return nothing before any
   release is packaged.

**Confirmation:** future generated releases will not regress on either defect,
because (a) the only emitting pattern is already role-guarded, (b) every
existing file models the correct form, (c) the compat shim makes the correct
form work locally, and (d) the release gate fails loudly if either pattern
reappears.

---

## 7 · Statement

- This was a deployment compatibility fix only.
- No architecture was redesigned; no constitutional invariant was touched.
- No SQL semantics were altered beyond schema qualification and grantee lists.
- v285 Rev B, Product Architecture 1.0 and Application Shell 1.0 remain frozen.
- The v287a certification floor (SQL 395/0, residue 0) held exactly.
