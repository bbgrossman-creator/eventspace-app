# EventCore certification privilege model

## What changed and why

Certification previously ran `sudo bash proofs/<script>.sh` — an entire repository
script elevated to **root** — for a job whose only genuinely privileged needs are
`createdb`, `dropdb` and `psql`. That is the broadest possible grant for the
narrowest possible requirement, and it cannot run noninteractively without either
storing a password or granting `NOPASSWD` on a shell, both of which are refused.

**Now:** repository scripts run as the invoking user (`bbgro`). The only privileged
call in the entire certification path is

```
sudo -n -u postgres /usr/local/sbin/ec-pgadmin <verb> [args]
```

`-n` guarantees it can never prompt. The target user is `postgres`, **never root**.

## The wrapper

`/usr/local/sbin/ec-pgadmin` is installed **root:root 0755** from `ec/pg-admin`, so
the user permitted to run it cannot rewrite it. Closed verb vocabulary:

| verb | effect |
|---|---|
| `capability` | self-test; the startup gate |
| `version` | sha256 prefix, for drift detection |
| `exists <db>` | `1`/`0` |
| `clone <src> <dst>` | `createdb -T` |
| `drop <db>` | `dropdb --if-exists` |
| `query` / `queryq <db> <sql>` | `psql -c`, strict / tolerant |
| `sqlfile <db> <path>` | `psql -f`, path confined to the repository |
| `sqlstdin <db>` | `psql -f -`, SQL from stdin (race harnesses) |

Argument law: database names must match `^(ec|ec_[A-Za-z0-9_]{1,48})$`; `sqlfile`
paths are canonicalised with `realpath` and must resolve inside the repository;
every subprocess is invoked as an **argv array**, so no argument is ever re-entered
into a shell. The wrapper refuses to run as root even if the grant were widened.

## The grant

```
bbgro ALL=(postgres) NOPASSWD: /usr/local/sbin/ec-pgadmin
```

One program. One target user. No root. No shell. No password stored anywhere, and
nothing in the toolchain can read or request one.

## What this does NOT remove — read this part

`query`, `queryq`, `sqlfile` and `sqlstdin` execute SQL as a **PostgreSQL
superuser**. SQL is itself a powerful surface: `COPY ... FROM PROGRAM` and psql's
`\!` reach a shell **with the privileges of the `postgres` OS account**. Anyone
able to run certification can therefore ultimately exercise postgres-account OS
capabilities — read and write the cluster's data directory, and act as that user.

That capability is **inherent to running database proofs**, which must clone a
production database, bypass RLS, and execute arbitrary DDL and DML. This design
does not claim to remove it.

**What this design removes:** root authority, uncontrolled direct binaries, any
database outside the `ec` namespace, and any SQL file outside the repository. The
honest one-line summary is: *root shell became postgres-user SQL, confined to `ec*`
and to the repository.* Treat the `postgres` account as a trust boundary you have
narrowed, not one you have eliminated.

## Failure behaviour

If the noninteractive capability is unavailable, certification stops within seconds
— before any expensive gate — with `BEN ACTION REQUIRED` and the exact one-time
setup command. Exit code **78**. Gates translate 78 into an explicit failure rather
than a confusing proof error.

The Windows notification path may remain as a convenience. **Certification
correctness never depends on a popup being confirmed.**


## Provenance pin

The installer refuses to install unless `ec/pg-admin` hashes to the reviewed
value, and re-verifies the installed copy afterwards:

```
e33dc3e05bda325820ada4ec1b86b1d5f14aa2a114e0f9bec41f4891a8328b25
```

If the source differs, nothing is copied and no privilege is granted.

## Uninstalling — revoking the bridge

```sh
sudo rm -f /etc/sudoers.d/ec-pgadmin
sudo rm -f /usr/local/sbin/ec-pgadmin
```

That is the whole removal. It deletes the sudoers grant and the wrapper program
and **nothing else**: PostgreSQL is untouched — no cluster, database, role,
schema or row is altered — and EventCore is untouched, since no product code,
migration, proof or manifest depends on the bridge existing. Certification
simply reverts to stopping at the capability gate with `BEN ACTION REQUIRED`
until the one-time setup is run again.
