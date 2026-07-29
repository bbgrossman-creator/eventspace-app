# db/captured — mechanical schema capture

**What this is.** A read-only capture of the live authoritative definitions in
`ec`, taken **2026-07-29 23:22:52Z** against PostgreSQL 18.4 (Ubuntu 18.4-1.pgdg24.04+1) at repository HEAD
`1f1e41d`. Until this capture, every function predating v292b existed *only* in
the running database.

**What this is NOT.**
- **Not a replayable chain.** Nothing here is proven to rebuild a working
  database. Dependency order, extensions, roles, RLS and data are unaddressed.
- **Not migrations.** History is not reconstructed; `db/CHAIN.txt` does not
  begin here.
- **Not certified.** No claim, no proof, no floor movement. The standing floor
  is unaffected.

**Contents.**
| File | What | How |
|---|---|---|
| `schema.sql` | full schema | `pg_dump --schema-only --no-owner --no-privileges` |
| `functions.sql` | 275 public routines, name-ordered | `pg_get_functiondef` per routine |
| `inventory.txt` | census: 275 routines (volatility/secdef/config), 78 tables (constraint counts) | catalog query, deterministic |

**Refreshing.** Re-run `bash db/capture-schema.sh` from the repo root. The
census is deterministic, so `git diff db/captured/inventory.txt` after a
refresh is an honest statement of what changed in the database since 2026-07-29 23:22:52Z.
