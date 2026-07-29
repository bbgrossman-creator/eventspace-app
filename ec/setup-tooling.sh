#!/usr/bin/env bash
# One-time Linux certification tooling. Run once per machine, never per release.
#
# Native binaries ONLY. Pure-JS dependencies (react, next, typescript) stay in
# the shared /mnt/c tree because platform is irrelevant to them. esbuild and
# playwright ship per-platform binaries, so they live here — which is what makes
# it safe never to run `npm install` from WSL against the shared checkout.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$HERE/host.env" ] || { echo "missing $HERE/host.env — copy host.env.example and edit"; exit 2; }
# shellcheck disable=SC1090
. "$HERE/host.env"

echo "== Linux certification tooling -> $EC_TOOLING =="
mkdir -p "$EC_TOOLING"
cd "$EC_TOOLING"

# esbuild is NOT pinned here. The browser runners are ESM and always resolve the
# esbuild JS HOST from the shared checkout — Node's ESM resolver ignores
# NODE_PATH, so no variable can redirect that. esbuild then refuses to run
# unless its native binary is the SAME version as that host. The binary is
# therefore matched to whatever the repository currently uses, discovered at run
# time, and installed into a version-scoped directory here. An esbuild upgrade
# in the repo is followed automatically; nothing is pinned by hand.
HOSTVER=$("$EC_NODE" -p "require('$EC_REPO/node_modules/esbuild/package.json').version" 2>/dev/null || true)
if [ -z "$HOSTVER" ]; then
  echo "  esbuild: NOT FOUND in $EC_REPO/node_modules — the browser runners import it directly."
  echo "           Certification browser gates will fail until it is present."
else
  echo "  esbuild host in repo: $HOSTVER (pure JS, shared — read only, never modified)"
  SHARED="$EC_REPO/node_modules/@esbuild/linux-x64/bin/esbuild"
  if [ -x "$SHARED" ] && [ "$("$SHARED" --version 2>/dev/null)" = "$HOSTVER" ]; then
    echo "  esbuild linux binary: already matching in the checkout — nothing to install"
  else
    DIR="$EC_TOOLING/esbuild-$HOSTVER"
    mkdir -p "$DIR"
    # A project root here is required: without it npm walks up and installs
    # into a parent tree instead of this directory.
    printf '{ "name": "eventcore-esbuild-%s", "private": true, "version": "1.0.0" }\n' "$HOSTVER" > "$DIR/package.json"
    ( cd "$DIR" && "$EC_NODE" "$EC_NPM_CLI" install --no-audit --no-fund --silent "@esbuild/linux-x64@$HOSTVER" )
    PINNED="$DIR/node_modules/@esbuild/linux-x64/bin/esbuild"
    [ -x "$PINNED" ] || { echo "FAIL: could not install @esbuild/linux-x64@$HOSTVER"; exit 1; }
    echo "  esbuild linux binary: $("$PINNED" --version) isolated at $DIR"
  fi
fi

# playwright-core is pure JS and already resolves from the shared checkout; only
# the browser download is platform-specific, and that lives outside /mnt/c.
[ -f package.json ] || cat > package.json <<'PKG'
{ "name": "eventcore-tooling", "private": true, "version": "1.0.0",
  "description": "Linux-only native binaries for EventCore certification. Never on /mnt/c." }
PKG

echo "== Playwright Chromium =="
if [ -d "$EC_PLAYWRIGHT_BROWSERS" ] && ls "$EC_PLAYWRIGHT_BROWSERS" | grep -q chromium; then
  echo "  present: $(ls "$EC_PLAYWRIGHT_BROWSERS" | grep chromium | head -1)"
else
  PLAYWRIGHT_BROWSERS_PATH="$EC_PLAYWRIGHT_BROWSERS" \
    "$EC_NODE" "$EC_REPO/node_modules/playwright-core/cli.js" install chromium
fi

echo "== postgres access =="
$EC_PSQL_ADMIN psql -d "$EC_DB" -tAc "select 'ok '||current_setting('server_version')" \
  || { echo "FAIL: cannot reach $EC_DB via: $EC_PSQL_ADMIN psql"; exit 1; }
echo
echo "Tooling ready. The shared $EC_REPO/node_modules was not modified."
