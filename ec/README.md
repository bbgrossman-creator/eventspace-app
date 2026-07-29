# EventCore release tooling

## Install once

```sh
cd /mnt/c/Users/bbgro/Downloads/eventspace-deploy
cp ec/host.env.example ec/host.env      # edit if any path differs
chmod +x certify-release.sh ec/setup-tooling.sh ec/shim/su
./ec/setup-tooling.sh                   # Linux native deps + Chromium + psql check
```

`ec/setup-tooling.sh` installs **only native binaries** (esbuild, playwright-core)
into `~/eventcore-tooling`. The shared `/mnt/c` `node_modules` is never touched,
so a certification run cannot break the Windows build. Pure-JS dependencies stay
where they are — platform is irrelevant to them.

## Every release

```sh
./certify-release.sh v295               # full
./certify-release.sh v294 --verify      # re-certify an already-deployed release
./certify-release.sh v295 --dry-run     # print the plan, run nothing
```

Then paste the `git add …` line it prints into VS Code PowerShell.

## Why there is a `su` shim

Sixteen certified proof runners invoke `su postgres -c "…"` at 61 call sites.
That form needs an interactive password here and fails. Editing them would mean
the script that produced a certified PASS count is no longer the script on disk.
So `ec/shim/su` translates that exact idiom to `sudo -u postgres bash -c "…"`,
is placed first on PATH for the run only, and passes everything else through to
`/bin/su`. It works for shell runners and for `execFileSync("su", …)` in the
browser suites alike.

New releases should use `$EC_PSQL_ADMIN` directly and not rely on the shim.

## Why esbuild is resolved, not pinned

Node's ESM resolver **ignores `NODE_PATH`**. A `.mjs` runner doing
`import esbuild from "esbuild"` always resolves the JS **host** from the shared
checkout, and no environment variable can redirect it. esbuild then refuses to
run unless its native **binary** is the same version as that host.

So the binary is matched to the host rather than the host isolated from the
binary. The host version is discovered at run time; nothing is pinned. Order:
the checkout's own `@esbuild/linux-x64` if it already matches (free), else a
cached copy under `~/eventcore-tooling/esbuild-<version>/`, else install exactly
that version there. An esbuild upgrade in the repo is followed automatically.

The shared `node_modules` is only ever **read**. Each isolated install writes a
`package.json` first — without one, npm walks up the tree and installs into a
parent instead, which testing caught.

## Manifests

`ec/manifests/<version>.manifest` declares what a release is. No logic. The
runner reads it; `expect` values are tripwires and the runner always prints the
**observed** number beside them. It never substitutes one for the other.

## What this does NOT do

- It does not re-grade, weaken, or edit any proof.
- It does not call `db/certify.sh`, `db/race.sh` or `db/clean.sh` — those exist
  in the harness but their contracts have not been inspected. Supply them and
  they can be wired in.
- It does not add a lint gate: this repository has only `dev`, `build`, `start`.
- It does not run `next build` in WSL by default (platform-specific SWC binary);
  set `EC_APP_GATES=all-wsl` if you want it there.
