# Phase 0 revised against real host evidence

## Three findings that change the design

### R1 · Do NOT edit the 61 `su postgres` sites — shim instead

Those 16 files are **certified artifacts**. `v293_proofs.sh` is the script that
produced "18 PASS" on the host; editing it means the certified thing and the
shipped thing differ, and every historical package would need reissuing.

`verify.sh` already proves the cleaner idiom is available: it exposes
`PSQL="${PSQL:-psql}"`. The same principle generalises — normalize *execution*,
not the artifacts. One shim on PATH translates the historical
`su postgres -c "…"` idiom into `sudo -u postgres bash -c "…"`, and passes
anything else through to real `su`. It works for shell runners and for the
`.mjs` browser runners alike, because `execFileSync("su", …)` searches PATH.

**61 edits across 16 certified files → 1 shim file.** Provenance preserved.

### R2 · The harness already has orchestration I did not know about

`db/` contains `bootstrap.sh`, `certify.sh`, `clean.sh`, `race.sh`, `verify.sh`
(and `.ps1` twins). The new runner **must not duplicate these**. I have
`verify.sh` in full and will call it; I have never seen `certify.sh` or
`race.sh`, so the runner does not invoke them and says so rather than guessing.

Crucially, `verify.sh` supports `PROOFS="…"`, so permanent proofs can be run
**through the harness itself** — inheriting its rollback and residue-delta
checking instead of reimplementing either.

### R3 · The three permanent proofs are installed but NOT in the standing set

```
STANDING="v286_proof v287a_proof v287b_proof v288a_proof v289_proof v292a1_proof v292b_proof"
```

`supabase/tests/` contains `v292d1_permanent_proof.sql`, `v293_permanent_proof.sql`
and `v294_permanent_proof.sql` — none are in `STANDING`, so **`verify.sh` has
never run them.** The certified floor covers seven proofs; the three standing
proofs shipped since v292d1 are inert unless invoked by hand.

That is a real gap. The orchestrator runs them explicitly via
`PROOFS=… verify.sh`, which closes it without editing `verify.sh`. Whether they
should join `STANDING` permanently is a semantics change and therefore **your
ruling**, flagged not taken.

## Two further observations, recorded

- **CHAIN.txt ends at v292b.** It does not list v292d, v292d1, v293 or v294
  migrations, so the chain cannot rebuild the deployed `ec`. This is the
  already-registered deployment-completeness debt, now confirmed. Out of scope
  here; the manifest records each release's migration so the chain can be
  reconstructed later.
- **The repo root carries 12+ loose evidence files** (`bodies.txt`,
  `c1_delegate_bodies.txt`, `ec_phase0.txt`, `git.txt`, `*.csv`, …) and
  `.gitignore` covers none of them. That is exactly why `git add .` is
  dangerous. The manifest's explicit file list plus a small `.gitignore`
  addition removes the hazard.

## Unchanged from Phase 0
Host profile · single entry point · per-release manifest · Linux-only native
deps · fail-fast · no certification semantics touched.
