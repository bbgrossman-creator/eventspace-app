#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# EventCore — release certification, one entry point.
#
#   ./certify-release.sh v295              full: one-shot, apply, prove, gates
#   ./certify-release.sh v294 --verify     re-certify an ALREADY-DEPLOYED release
#                                          (no clone one-shot, no migration apply)
#   ./certify-release.sh v295 --dry-run    print the plan, run nothing
#
# Orchestration only. It runs the proofs that already exist, in the order the
# frozen deployment sequence defines, and stops at the first failure. It never
# re-grades a claim, never edits a proof, and never substitutes an expected
# count for an observed one.
#
# Exit: 0 all required gates green · 1 a gate failed · 2 setup/usage error
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EC="$HERE/ec"

VERSION="${1:-}"; MODE="full"
for a in "${@:2}"; do
  case "$a" in
    --verify)  MODE="verify" ;;
    --dry-run) MODE="dry" ;;
    --browser-only) MODE="browser" ;;
    *) echo "unknown option: $a"; exit 2 ;;
  esac
done
[ -z "$VERSION" ] && { echo "usage: ./certify-release.sh <version> [--verify|--dry-run|--browser-only]"; exit 2; }

# ── profile ────────────────────────────────────────────────────────────────
[ -f "$EC/host.env" ] || { echo "missing $EC/host.env — copy ec/host.env.example and edit it"; exit 2; }
# shellcheck disable=SC1090
. "$EC/host.env"
: "${EC_REPO:?}" "${EC_HARNESS:?}" "${EC_DB:?}" "${EC_PSQL:?}" "${EC_PSQL_ADMIN:?}" "${EC_NODE:?}"

MANIFEST="$EC/manifests/${VERSION}.manifest"
[ -f "$MANIFEST" ] || { echo "no manifest: $MANIFEST"; exit 2; }

# ── the su shim goes FIRST on PATH, for this process tree only ────────────
# Historical runners invoke `su postgres -c`, which this host cannot satisfy.
# Normalizing execution here preserves 16 certified artifacts byte-for-byte.
export PATH="$EC/shim:$PATH"
chmod +x "$EC/shim/su" 2>/dev/null

# shellcheck disable=SC1090
. "$EC/lib/gates.sh"

# ── manifest reader (declarative; no logic in manifests) ──────────────────
mf() { awk -v k="$1" '$1==k { $1=""; sub(/^[ \t]+/,""); print; exit }' "$MANIFEST"; }
mf_expect() { printf '%s' "$1" | grep -oE "expect [0-9]+" | awk '{print $2}'; }
mf_path()   { printf '%s' "$1" | sed 's/ *expect [0-9]*//'; }

M_MIGRATION=$(mf migration)
M_ONESHOT=$(mf one_shot);        M_ONESHOT_P=$(mf_path "$M_ONESHOT")
M_PERMANENT=$(mf permanent)
M_PERM_REGRESS=$(mf permanent_regress)
M_RACE=$(mf race_regress)
M_STANDING=$(mf standing_verify)
M_BROWSER=$(mf browser);          M_BROWSER_P=$(mf_path "$M_BROWSER")
M_BROWSER_REG=$(mf browser_regress)
M_HARNESS_INSTALL=$(mf harness_install)
M_APP_MARKER=$(mf app_marker)
M_DEPLOYED_MARKER=$(mf deployed_marker)
M_APP_FILES=$(mf app_files)
M_GIT=$(mf git_files)

echo "═══════════════════════════════════════════════════════════════"
echo " EventCore certification — $VERSION   mode=$MODE"
echo " repo    : $EC_REPO"
echo " harness : $EC_HARNESS"
echo " database: $EC_DB    psql: $EC_PSQL_ADMIN psql"
echo "═══════════════════════════════════════════════════════════════"

if [ "$MODE" = "dry" ]; then
  echo; echo "PLAN (nothing will run):"
  [ "$MODE" != "verify" ] && { echo "  1. one-shot   : $M_ONESHOT_P"; echo "  2. migration  : $M_MIGRATION"; }
  echo "  3. permanent  : $(mf_path "$M_PERMANENT") $M_PERM_REGRESS"
  echo "  4. race       : $M_RACE"
  echo "  5. standing   : ${M_STANDING:-no}"
  echo "  6. browser    : $M_BROWSER_P  |  regress: $(mf_path "$M_BROWSER_REG")"
  echo "  7. app gates  : ${EC_APP_GATES:-tsc-wsl}"
  echo "  8. harness    : $M_HARNESS_INSTALL"
  exit 0
fi

START=$(date +%s)

# --browser-only re-runs just the browser gates after a TOOLING failure. It is a
# diagnostic mode: a real release still requires a full pass.
if [ "$MODE" = "browser" ]; then
  [ -n "$M_BROWSER_P" ] && gate_browser "$M_BROWSER_P" "$(mf_expect "$M_BROWSER")"
  BR_EXPECT=$(mf_expect "$M_BROWSER_REG")
  for b in $(mf_path "$M_BROWSER_REG"); do gate_browser "$b" "${BR_EXPECT:-?}"; done
  echo
  echo "═══════════════════════════════════════════════════════════════"
  echo " browser gates green — $GATE_N gates, $(( $(date +%s) - START ))s"
  echo " DIAGNOSTIC MODE: a release still requires the full --verify or full pass."
  echo "═══════════════════════════════════════════════════════════════"
  exit 0
fi

if [ "$MODE" = "full" ]; then
  [ -n "$M_ONESHOT_P" ] && gate_one_shot "$M_ONESHOT_P" "$M_MIGRATION" "$(mf_expect "$M_ONESHOT")"
  [ -n "$M_MIGRATION" ] && gate_migration "$M_MIGRATION"
  # ORDER IS LOAD-BEARING: the permanent proof executes THROUGH verify.sh, which
  # reads it from the harness. Installing after the permanent gate — as an
  # earlier revision did — guarantees "MISSING" on every first release. It
  # installs only once the migration has succeeded, so a failed release never
  # leaves its proof behind.
  # shellcheck disable=SC2086
  [ -n "$M_HARNESS_INSTALL" ] && gate_harness_install $M_HARNESS_INSTALL
else
  gate_begin "one-shot + migration"
  gate_ok "SKIPPED in --verify: $VERSION is already deployed. The one-shot clones"
  printf '          a pre-release database and would abort against a migrated one.\n'
  # shellcheck disable=SC2086
  gate_verify_deployed "$M_DEPLOYED_MARKER" $M_HARNESS_INSTALL
fi

# Integrity FIRST: refuse to start a run the package has not fully populated.
# shellcheck disable=SC2086
[ -n "$M_APP_MARKER" ] && gate_app_integrity "$M_APP_MARKER" $M_APP_FILES

PERM_ALL="$(mf_path "$M_PERMANENT") $M_PERM_REGRESS"
[ -n "$(printf '%s' "$PERM_ALL" | tr -d ' ')" ] && gate_permanent "$PERM_ALL"

# shellcheck disable=SC2086
[ -n "$M_RACE" ] && gate_race $M_RACE

[ "$M_STANDING" = "yes" ] && gate_standing

gate_app

[ -n "$M_BROWSER_P" ]   && gate_browser "$M_BROWSER_P" "$(mf_expect "$M_BROWSER")"
BR_EXPECT=$(mf_expect "$M_BROWSER_REG")
for b in $(mf_path "$M_BROWSER_REG"); do
  gate_browser "$b" "${BR_EXPECT:-?}"
done

ELAPSED=$(( $(date +%s) - START ))
echo
echo "═══════════════════════════════════════════════════════════════"
echo " $VERSION CERTIFICATION GREEN — $GATE_N gates, ${ELAPSED}s"
[ -n "${EC_FLOOR:-}" ] && echo " standing floor observed: $EC_FLOOR unique claims"
echo "═══════════════════════════════════════════════════════════════"
if [ "${EC_MANUAL_BUILD:-0}" = "1" ] || [ "$MODE" = "full" ]; then
  echo
  echo " REMAINING — Windows / VS Code PowerShell:"
  [ "${EC_MANUAL_BUILD:-0}" = "1" ] && echo "   npm run build"
  if [ -n "$M_GIT" ]; then
    [ "$MODE" = "verify" ] && echo "   (only if $VERSION is not yet committed)"
    echo "   git add $M_GIT"
    echo "   git diff --cached --check && git diff --cached --stat"
    echo "   git commit -m \"Deploy $VERSION\""
    echo "   git push origin main"
    echo
    echo " (explicit file list from the manifest — never 'git add .')"
  fi
fi
exit 0
