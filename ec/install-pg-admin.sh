#!/usr/bin/env bash
# ============================================================================
# ONE-TIME setup. Run as root:  sudo bash ec/install-pg-admin.sh
#
# Installs the fixed wrapper root-owned and grants exactly one noninteractive
# permission: bbgro may execute THAT ONE PROGRAM as the postgres user.
# No root grant. No shell grant. No password stored anywhere.
# ============================================================================
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "run as root: sudo bash ec/install-pg-admin.sh"; exit 1; }
SRC="$(cd "$(dirname "$0")" && pwd)/pg-admin"
DST=/usr/local/sbin/ec-pgadmin
USER_NAME="${EC_USER:-bbgro}"

# ── PROVENANCE PIN ──────────────────────────────────────────────────────────
# The bytes installed as root must be the exact bytes that were reviewed. This
# is the full SHA-256 of the audited ec/pg-admin; nothing is copied until the
# source on disk matches it.
EXPECTED_SHA="e33dc3e05bda325820ada4ec1b86b1d5f14aa2a114e0f9bec41f4891a8328b25"

[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }
ACTUAL_SHA=$(sha256sum "$SRC" | cut -d' ' -f1)
echo "wrapper provenance:"
echo "  expected : $EXPECTED_SHA"
echo "  actual   : $ACTUAL_SHA"
if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
  echo
  echo "ABORT: ec/pg-admin does not match the reviewed bytes."
  echo "       Nothing has been installed and no privilege has been granted."
  echo "       Re-review the wrapper, or restore the audited copy, before retrying."
  exit 1
fi
echo "  verified : source matches the reviewed wrapper"

install -o root -g root -m 0755 "$SRC" "$DST"
echo "installed $DST (root:root 0755)"

# the destination must be byte-identical to what was verified
DST_SHA=$(sha256sum "$DST" | cut -d' ' -f1)
if [ "$DST_SHA" != "$EXPECTED_SHA" ]; then
  rm -f "$DST"; echo "ABORT: installed copy differs from source — removed, nothing granted"; exit 1
fi
echo "  destination verified byte-identical"

SUDOERS=/etc/sudoers.d/ec-pgadmin
cat > "$SUDOERS" <<SUDO
# EventCore certification: exactly one program, as postgres, never as root.
$USER_NAME ALL=(postgres) NOPASSWD: $DST
SUDO
chmod 0440 "$SUDOERS"
if visudo -c -f "$SUDOERS" >/dev/null; then
  echo "installed $SUDOERS and validated with visudo"
else
  rm -f "$SUDOERS"; echo "SUDOERS VALIDATION FAILED — reverted, nothing granted"; exit 1
fi

echo
echo "verify (as $USER_NAME, no password should be requested):"
echo "  sudo -n -u postgres $DST capability"
