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

# ── capability gate · runs BEFORE any expensive gate ────────────────────────
. "$(dirname "$0")/ec/lib/pg.sh"
if ! pg_capability; then
  cat >&2 <<'MSG'

BEN ACTION REQUIRED — PostgreSQL certification privilege is unavailable.

Certification stops here rather than beginning work it cannot finish.
No password is stored and none will be requested.

  Run ONCE, in WSL:

    cd /mnt/c/Users/bbgro/Downloads/eventspace-deploy && sudo bash ec/install-pg-admin.sh

  Verify (must print CAPABILITY_OK and never prompt):

    sudo -n -u postgres /usr/local/sbin/ec-pgadmin capability

MSG
  exit 78
fi
echo "capability : PostgreSQL certification privilege present (noninteractive)"
# ---------------------------------------------------------------------------
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EC="$HERE/ec"

VERSION="${1:-}"; MODE="full"
for a in "${@:2}"; do
  case "$a" in
    --verify)  MODE="verify" ;;
    --dry-run) MODE="dry" ;;
    --browser-only) MODE="browser" ;;
    # v299 · Fable B-1. Runs deployment certification against the LOCAL database
    # only, without archived production evidence. Deliberately does NOT yield the
    # deployable verdict: the final banner says LOCAL VERIFICATION ONLY. Existing
    # invocations are unaffected — omitting it keeps the full, fail-closed path.
    --local-only) EC_DEPLOY_LOCAL_ONLY=1 ;;
    *) echo "unknown option: $a"; exit 2 ;;
  esac
done
export EC_DEPLOY_LOCAL_ONLY="${EC_DEPLOY_LOCAL_ONLY:-0}"
[ -z "$VERSION" ] && { echo "usage: ./certify-release.sh <version> [--verify|--dry-run|--browser-only] [--local-only]"; exit 2; }

# ── profile ────────────────────────────────────────────────────────────────
[ -f "$EC/host.env" ] || { echo "missing $EC/host.env — copy ec/host.env.example and edit it"; exit 2; }
# shellcheck disable=SC1090
. "$EC/host.env"
: "${EC_REPO:?}" "${EC_HARNESS:?}" "${EC_DB:?}" "${EC_NODE:?}"
: "${EC_PG_LIB:=$EC_REPO/ec/lib/pg.sh}"

MANIFEST="$EC/manifests/${VERSION}.manifest"
[ -f "$MANIFEST" ] || { echo "no manifest: $MANIFEST"; exit 2; }

# ── the su shim goes FIRST on PATH, for this process tree only ────────────
# PRIVILEGE MODEL: no gate runs as root. Repository scripts execute as the
# invoking user; the ONLY privileged path is ec/lib/pg.sh, which calls
#   sudo -n -u postgres /usr/local/sbin/ec-pgadmin <closed verb>
# and can never prompt. See ec/PRIVILEGE.md.
# Normalizing execution here preserves 16 certified artifacts byte-for-byte.
  # (legacy $EC/shim privileged path removed — PostgreSQL now via ec/lib/pg.sh)

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
# TWO fields, two meanings. `race` is THIS release's own new race proof;
# `race_regress` is historical races that must keep passing. An absent `race`
# means "this release introduces no new concurrency contract" — it must never
# mean "skip the regressions", and reading only race_regress (as an earlier
# revision did) silently dropped v295's RACE-RP1 from every run.
M_RACE_OWN=$(mf race)
M_RACE_REGRESS=$(mf race_regress)
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
echo " database: $EC_DB    pg access: ec/lib/pg.sh -> sudo -n -u postgres ec-pgadmin"
echo "═══════════════════════════════════════════════════════════════"

if [ "$MODE" = "dry" ]; then
  echo; echo "PLAN (nothing will run):"
  echo "  0. app integrity : ${M_APP_MARKER:-(not declared)}"
  [ "$MODE" != "verify" ] && { echo "  1. one-shot   : $M_ONESHOT_P"; echo "  2. migration  : $M_MIGRATION"; }
  echo "  3. permanent  : $(mf_path "$M_PERMANENT") $M_PERM_REGRESS"
  echo "  4a. release race   : ${M_RACE_OWN:-(none — this release adds no concurrency contract)}"
  echo "  4b. race regression: ${M_RACE_REGRESS:-(none)}"
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

# ── APPLICATION INTEGRITY, FIRST ──────────────────────────────────────────
# Before any expensive or MUTATING work. A half-extracted package must fail in
# seconds, not after a clone, a migration and twenty minutes of proofs. This
# gate only reads; it never mutates source.
# shellcheck disable=SC2086
[ -n "$M_APP_MARKER" ] && gate_app_integrity "$M_APP_MARKER" $M_APP_FILES

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
  # v302 · the skip is MIGRATION-specific, not mode-specific.
  #
  # A migrating release's one-shot clones a PRE-release database and aborts
  # against a migrated one, so skipping it under --verify is correct and is
  # preserved below, byte-for-byte in effect.
  #
  # A release that ships NO migration has no such dependency: v301's one-shot
  # clones ec and exercises transport logic, and would run perfectly well here.
  # Keying the skip on MODE alone silently discarded it — v301 returned exit 0
  # across 18 gates with all fifteen of its own claims unrun. Exit 0 with the
  # release's own proof unexecuted is a green line about the wrong thing, which
  # is the failure class this harness exists to prevent.
  if [ -n "$M_MIGRATION" ]; then
    gate_begin "one-shot + migration"
    gate_ok "SKIPPED in --verify: $VERSION is already deployed. The one-shot clones"
    printf '          a pre-release database and would abort against a migrated one.\n'
  else
    [ -n "$M_ONESHOT_P" ] && gate_one_shot "$M_ONESHOT_P" "" "$(mf_expect "$M_ONESHOT")"
  fi
  # shellcheck disable=SC2086
  gate_verify_deployed "$M_DEPLOYED_MARKER" $M_HARNESS_INSTALL
  # gate_verify_deployed RETURNS EARLY when no marker is declared, before its
  # harness-install loop — so a marker-less release carrying a permanent proof
  # would never have it installed under --verify, and the permanent gate would
  # then read it as MISSING from the harness. v302 is itself such a release.
  # shellcheck disable=SC2086
  [ -z "$M_DEPLOYED_MARKER" ] && [ -n "$M_HARNESS_INSTALL" ] && gate_harness_install $M_HARNESS_INSTALL
fi

PERM_ALL="$(mf_path "$M_PERMANENT") $M_PERM_REGRESS"
[ -n "$(printf '%s' "$PERM_ALL" | tr -d ' ')" ] && gate_permanent "$PERM_ALL"

# The release's OWN race first: if this release's concurrency contract is
# broken there is no point proving older ones still hold. gate_fail exits, so a
# release-race failure stops before any regression runs.
# Both modes run it: race proofs own disposable clones of ec, and in --verify the
# release is already deployed, so the clone carries it.
# shellcheck disable=SC2086
[ -n "$M_RACE_OWN" ]     && gate_race "release race"    $M_RACE_OWN
# shellcheck disable=SC2086
[ -n "$M_RACE_REGRESS" ] && gate_race "race regression" $M_RACE_REGRESS

[ "$M_STANDING" = "yes" ] && gate_standing

gate_app

[ -n "$M_BROWSER_P" ]   && gate_browser "$M_BROWSER_P" "$(mf_expect "$M_BROWSER")"
BR_EXPECT=$(mf_expect "$M_BROWSER_REG")
for b in $(mf_path "$M_BROWSER_REG"); do
  gate_browser "$b" "${BR_EXPECT:-?}"
done

# ── deployment certification · LAST GATE BEFORE THE VERDICT ───────────────
# v299, after the v294 production incident. Nothing may be declared CERTIFIED
# until BOTH the local database and archived production evidence are proven to
# be at the release's architectural level. Placed last so it guards the verdict
# itself rather than an early step.
gate_deployment_certification "$VERSION"

ELAPSED=$(( $(date +%s) - START ))
echo
echo "═══════════════════════════════════════════════════════════════"
if [ "${EC_DEPLOY_LOCAL_ONLY:-0}" = "1" ]; then
  # v299 · Fable B-1. --local-only must never yield the deployable verdict.
  echo " $VERSION LOCAL VERIFICATION ONLY — NOT DEPLOYABLE — $GATE_N gates, ${ELAPSED}s"
  echo " No production evidence was graded. This run does NOT certify the release."
  echo " For the deployable verdict, archive production evidence and re-run without"
  echo " --local-only:  ec/deploy-manifests/evidence/$VERSION.production.grade"
else
  echo " $VERSION CERTIFICATION GREEN — $GATE_N gates, ${ELAPSED}s"
  echo " deployment evidence: ${EC_DEPLOY_EVIDENCE:-unrecorded}"
  # v299 · Fable M-B. A pass that waived the freshness rule must say so on the
  # banner line, not only inside the gate's output. Reading GREEN and stopping
  # there is exactly how a waived rule becomes an unnoticed one.
  case "${EC_DEPLOY_EVIDENCE:-}" in
    *OVERRIDDEN*) echo " *** THIS PASS USED AN EVIDENCE OVERRIDE — the freshness rule was waived ***" ;;
  esac
fi
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
