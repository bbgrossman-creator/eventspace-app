# EventCore — SQL Release Conventions
## Deployment compatibility rules for every migration, proof, race and generated SQL

**Standing.** Operational convention, not constitutional law. Established after
two deployment defects recurred across consecutive releases (v286, v287a).
Every SQL file emitted from this point must satisfy both rules below.

---

## Rule 1 · Always qualify pgcrypto as `extensions.digest(...)`

**Never write** `digest(...)` unqualified.
**Always write** `extensions.digest(...)`.

**Why.** Supabase installs pgcrypto into the `extensions` schema. Our
`SECURITY DEFINER` functions pin `search_path` to `public` — correct hardening
practice — so an unqualified `digest()` is invisible to them and the migration
fails with `function digest(...) does not exist`. The fault is invisible in a
SQL-editor session, whose `search_path` includes `extensions`, which is why it
reaches production repeatedly.

**Why the earlier fix was incomplete.** `v267a_pgcrypto_compat.sql` created a
`public.digest(bytea, text)` wrapper. It covered **only the `(bytea, text)`
signature.** Migrations that hash *text* — `digest(<text>, 'sha256')` — call
`(text, text)` and were never covered. That is precisely why the defect
resurfaced in v286 and v287a rather than being fixed once in v267a.

**The guarantee.** `supabase/v287_deploy_compat.sql` ensures the qualified name
resolves in **every** environment and covers **both** signatures:

- Supabase (pgcrypto in `extensions`) — detected, no-op.
- Dev/CI (pgcrypto in `public`) — creates delegating wrappers in `extensions`.

It is additive, idempotent, and semantics-preserving (the wrappers delegate;
no hashing behaviour changes). **Apply it first, before the v263… chain.**

---

## Rule 2 · Grant only to roles that exist

**Never write** `grant … to app_user, authenticated;`
**Write** `grant … to authenticated;`

Deployment environments do not necessarily contain an `app_user` role, and a
grant to a missing role aborts the migration.

**If a non-standard role must be granted**, use the role-existence guard —
already the established idiom in v277, v278, v280, v283 and v284:

```sql
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    execute 'grant execute on function public.my_fn(uuid) to app_user';
  end if;
end $$;
```

Guarded blocks are deployment-safe by construction and were deliberately
**retained** during the v287 compatibility sweep. Bare grants were corrected.

---

## Rule 3 · Discover roles in proofs; never hardcode them

Proofs that switch roles to exercise RLS must **discover** an available role
rather than assuming one. The established pattern (v265+):

```sql
select rolname into v_app_role from pg_roles
 where rolname = 'authenticated' and not rolsuper and not rolbypassrls limit 1;
if v_app_role is null then
  select rolname into v_app_role from pg_roles
   where rolname in ('anon','service_role','app_user','authenticator')
     and not rolsuper and not rolbypassrls
   order by case rolname when 'authenticated' then 0 when 'app_user' then 1 else 2 end
   limit 1;
end if;
```

Legacy pre-v260 proofs still contain `set local role app_user`. These are
test-only, are not part of any deployment, and are outside the active
regression scope — see the v287 audit report for the full list and the
recommended remediation order. Two active-scope files (`v263_proof.sql`,
`v264_proof.sql`) also use it; both were verified to produce their original
certification counts with **no** `app_user` role present.

---

## Rule 4 · Verify before release

A release is not deployable until the full chain applies to a database where:

1. **no `app_user` role exists**, and
2. **pgcrypto is reachable only as `extensions.digest`.**

Verification used for v287:

```bash
# simulate the deployment environment
dropdb --if-exists ec && createdb ec
psql -d ec -f db/base.sql && psql -d ec -f db/deps.sql
psql -d ec -f supabase/v287_deploy_compat.sql     # FIRST
drop role app_user;                                # prove independence
# then the full ordered chain, expecting zero errors
```

If the chain applies clean under those two conditions, both classes of defect
are structurally excluded.

---

## Quick grep gate (run before packaging any release)

```bash
# must return nothing (shims excepted)
grep -rnE "(^|[^.a-zA-Z0-9_])digest\s*\(" --include=*.sql supabase/ \
  | grep -vE "v267a_pgcrypto_compat|v287_deploy_compat" \
  | grep -vE "^[^:]+:[0-9]+:\s*--"

# must return nothing outside role-existence guards.
# NOTE the spacing-tolerant pattern: guards are written both as
#   rolname='app_user'   and   rolname = 'app_user'
# A pattern without \s* silently misreports guarded grants as unguarded.
grep -rn "to app_user" --include=*.sql supabase/ | grep -vE "rolname\s*=\s*'app_user'"
```
