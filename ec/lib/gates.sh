#!/usr/bin/env bash
# EventCore certification gates. Orchestration only — no gate re-grades anything.
# Every gate: announce, run, check, and on failure print the exact command plus
# the relevant output, then stop. Observed numbers are always printed; a
# manifest's `expect` is a tripwire, never a substitute for what actually ran.

GATE_N=0
gate_begin() { GATE_N=$((GATE_N+1)); CURRENT_GATE="$1"; printf '\n[%02d] %s\n' "$GATE_N" "$1"; }
gate_cmd()   { printf '     $ %s\n' "$1"; }
gate_ok()    { printf '     OK   %s\n' "${1:-}"; }
gate_fail()  {
  printf '\n============================================================\n'
  printf 'GATE FAILED: %s\n' "$CURRENT_GATE"
  printf 'command    : %s\n' "${1:-}"
  printf 'detail     : %s\n' "${2:-}"
  printf '============================================================\n'
  [ -n "${3:-}" ] && { printf '%s\n' "$3" | tail -25 | sed 's/^/     | /'; }
  exit 1
}

# ── one-shot release proof (clone; runner owns migration timing) ───────────
gate_one_shot() {  # $1 script, $2 migration, $3 expected PASS
  gate_begin "release one-shot proof"
  # PRIVILEGE: proof scripts run as the invoking user; only PostgreSQL
  # operations are privileged (ec/lib/pg.sh -> sudo -n -u postgres ec-pgadmin).
  local c="bash $1 $2"; gate_cmd "$c"
  local out rc
  out=$(cd "$EC_REPO" && bash "$1" "$2" 2>&1); rc=$?
  [ "$rc" -eq 78 ] && gate_fail "$c" "PostgreSQL certification privilege unavailable" "$out"
  local line; line=$(printf '%s' "$out" | grep -E "PASS / .*FAIL" | tail -1)
  [ "$rc" -ne 0 ] && gate_fail "$c" "exit $rc — ${line:-no summary line}" "$out"
  gate_ok "${line:-completed}  (expected $3 PASS)"
}

# ── migration apply to the live database ──────────────────────────────────
gate_migration() {  # $1 migration path
  gate_begin "apply migration to $EC_DB"
  local c="pg_file $EC_DB $1"; gate_cmd "$c"
  local out rc
  out=$(pg_file "$EC_DB" "$EC_REPO/$1" 2>&1); rc=$?
  [ "$rc" -ne 0 ] && gate_fail "$c" "exit $rc" "$out"
  gate_ok "$(printf '%s' "$out" | tr '\n' ' ')"
}

# ── permanent proofs THROUGH the harness, inheriting its residue check ─────
# verify.sh supports PROOFS=; using it means rollback and residue-delta
# verification are the harness's own, not a reimplementation.
gate_permanent() {  # $1 = space-separated proof names (no .sql)
  gate_begin "permanent proofs (via harness verify.sh)"
  local c="PROOFS=\"$1\" EC_PG_LIB=\"$EC_PG_LIB\" bash $EC_HARNESS/db/verify.sh $EC_DB"; gate_cmd "$c"
  local out rc
  out=$(cd "$EC_HARNESS" && PROOFS="$1" EC_PG_LIB="$EC_PG_LIB" bash db/verify.sh "$EC_DB" 2>&1); rc=$?
  [ "$rc" -ne 0 ] && gate_fail "$c" "verify.sh exit $rc" "$out"
  printf '%s\n' "$out" | grep -E "^  (v[0-9]|claims|proof residue)" | sed 's/^/     /'
  printf '%s' "$out" | grep -q "CERTIFICATION PASSED" \
    || gate_fail "$c" "verify.sh did not report CERTIFICATION PASSED" "$out"
  gate_ok
}

# ── standing floor ─────────────────────────────────────────────────────────
gate_standing() {
  gate_begin "standing certification floor (harness verify.sh)"
  local c="EC_PG_LIB=\"$EC_PG_LIB\" bash $EC_HARNESS/db/verify.sh $EC_DB"; gate_cmd "$c"
  local out rc
  out=$(cd "$EC_HARNESS" && EC_PG_LIB="$EC_PG_LIB" bash db/verify.sh "$EC_DB" 2>&1); rc=$?
  [ "$rc" -ne 0 ] && gate_fail "$c" "verify.sh exit $rc" "$out"
  printf '%s\n' "$out" | grep -E "claims|proof residue|CERTIFICATION" | sed 's/^/     /'
  EC_FLOOR=$(printf '%s' "$out" | grep -oE "claims *: *[0-9]+" | grep -oE "[0-9]+" | tail -1)
  gate_ok "observed floor: ${EC_FLOOR:-unknown} unique claims"
}

# ── race regressions ───────────────────────────────────────────────────────
# $1 = kind label ("release race" | "race regression"), $@ = scripts.
# The two kinds are reported distinctly because they mean different things: a
# release race proves THIS release's concurrency contract; a regression proves an
# earlier one still holds. Collapsing them into one list is how v295's RACE-RP1
# went unexecuted while the run still reported green.
gate_race() {
  local kind="$1"; shift
  for r in "$@"; do
    [ -z "$r" ] && continue
    gate_begin "$kind: $(basename "$r")"
    # PRIVILEGE: as above — no root, no elevated shell.
    local c="bash $r"; gate_cmd "$c"
    local out rc
    out=$(cd "$EC_REPO" && bash "$r" 2>&1); rc=$?
    [ "$rc" -eq 78 ] && gate_fail "$c" "PostgreSQL certification privilege unavailable" "$out"
    local line; line=$(printf '%s' "$out" | grep -E "RACE-[A-Z0-9]+ (PASS|FAIL|INDETERMINATE)" | tail -1)
    [ "$rc" -eq 4 ] && gate_fail "$c" "INDETERMINATE — backends did not interleave. Rerun; raise BARRIER if it recurs." "$out"
    [ "$rc" -ne 0 ] && gate_fail "$c" "$kind failed: exit $rc — ${line:-no result line}" "$out"
    gate_ok "$line"
  done
}


# ── esbuild resolution ─────────────────────────────────────────────────────
# Node's ESM resolver IGNORES NODE_PATH. A .mjs runner doing
# `import esbuild from "esbuild"` therefore always resolves the JS host from the
# shared checkout, and no environment variable can redirect it. That is fine:
# the host is pure JavaScript and platform-agnostic. What must not come from the
# shared tree is the NATIVE binary, and esbuild refuses to run if host and binary
# versions differ.
#
# So the binary is matched TO the host rather than the host isolated from the
# binary. The host's version is discovered, never assumed, which is also why no
# esbuild version is pinned anywhere in this tooling: an upgrade in the repo is
# followed automatically.
#
# The shared node_modules is only ever READ here. Any install goes into a
# version-scoped directory under EC_TOOLING.
# Sets EC_ESBUILD_BIN / EC_ESBUILD_HOSTVER / EC_ESBUILD_SOURCE and returns 0|1.
# It deliberately does NOT print the path: callers must not use $( ) here, or the
# subshell would discard every variable it sets.
ec_resolve_esbuild() {
  local shared pinned dir
  EC_ESBUILD_BIN=""; EC_ESBUILD_SOURCE=""; EC_ESBUILD_FAULT=""
  EC_ESBUILD_HOSTVER=$("$EC_NODE" -p \
    "require('$EC_REPO/node_modules/esbuild/package.json').version" 2>/dev/null)
  if [ -z "$EC_ESBUILD_HOSTVER" ]; then
    EC_ESBUILD_FAULT="HOST_ABSENT"; return 1
  fi

  # 1 · the checkout's own Linux binary, if npm already placed a matching one
  shared="$EC_REPO/node_modules/@esbuild/linux-x64/bin/esbuild"
  if [ -x "$shared" ] && [ "$("$shared" --version 2>/dev/null)" = "$EC_ESBUILD_HOSTVER" ]; then
    EC_ESBUILD_BIN="$shared"; EC_ESBUILD_SOURCE="shared checkout (already matching)"; return 0
  fi

  # 2 · a version-scoped isolated copy from a previous run
  dir="$EC_TOOLING/esbuild-$EC_ESBUILD_HOSTVER"
  pinned="$dir/node_modules/@esbuild/linux-x64/bin/esbuild"
  if [ -x "$pinned" ] && [ "$("$pinned" --version 2>/dev/null)" = "$EC_ESBUILD_HOSTVER" ]; then
    EC_ESBUILD_BIN="$pinned"; EC_ESBUILD_SOURCE="isolated tooling (cached)"; return 0
  fi

  # 3 · install exactly the host's version, isolated. Never touches /mnt/c.
  #
  # The package.json below is REQUIRED, not decoration. Without one, npm walks
  # UP the directory tree looking for a project root and installs into whatever
  # it finds first — verified in testing, where the binary landed in a parent
  # node_modules instead of here. Writing a root pins the install to this
  # directory and is what makes the isolation guarantee real.
  mkdir -p "$dir"
  cat > "$dir/package.json" <<PKGEOF
{ "name": "eventcore-esbuild-$EC_ESBUILD_HOSTVER", "private": true, "version": "1.0.0" }
PKGEOF
  EC_ESBUILD_NPMLOG=$( cd "$dir" && "$EC_NODE" "$EC_NPM_CLI" install --no-audit --no-fund \
      "@esbuild/linux-x64@$EC_ESBUILD_HOSTVER" 2>&1 )
  if [ -x "$pinned" ] && [ "$("$pinned" --version 2>/dev/null)" = "$EC_ESBUILD_HOSTVER" ]; then
    EC_ESBUILD_BIN="$pinned"
    EC_ESBUILD_SOURCE="isolated tooling (installed $EC_ESBUILD_HOSTVER)"; return 0
  fi
  EC_ESBUILD_FAULT="INSTALL_FAILED"; return 1
}

# ── browser acceptance ─────────────────────────────────────────────────────
gate_browser() {  # $1 script, $2 expected passed
  gate_begin "browser acceptance: $(basename "$1")"

  if [ -z "${EC_ESBUILD_BIN:-}" ]; then
    if ! ec_resolve_esbuild; then
      case "$EC_ESBUILD_FAULT" in
        HOST_ABSENT)
          gate_fail "node -p require('esbuild/package.json').version" \
            "no esbuild JS host in $EC_REPO/node_modules — the browser runners import it directly" ;;
        *)
          gate_fail "npm install @esbuild/linux-x64@$EC_ESBUILD_HOSTVER (isolated)" \
            "could not obtain a Linux esbuild binary matching host $EC_ESBUILD_HOSTVER" \
            "${EC_ESBUILD_NPMLOG:-}" ;;
      esac
    fi
    printf '     esbuild host %s (shared, ESM-resolved) · binary: %s\n' \
      "$EC_ESBUILD_HOSTVER" "$EC_ESBUILD_SOURCE"
  fi

  local c="node $1"; gate_cmd "$c"
  local out rc
  # NODE_PATH is deliberately NOT set: ESM ignores it, and setting it implied an
  # isolation this mechanism does not and cannot provide.
  out=$(cd "$EC_REPO" && env \
        "PATH=$PATH" \
        "ESBUILD_BINARY_PATH=$EC_ESBUILD_BIN" \
        "PLAYWRIGHT_BROWSERS_PATH=$EC_PLAYWRIGHT_BROWSERS" \
        "$EC_NODE" "$1" 2>&1); rc=$?
  local line; line=$(printf '%s' "$out" | grep -E "[0-9]+ passed, [0-9]+ failed" | tail -1)
  case "$out" in
    *"does not match binary version"*)
      gate_fail "$c" "esbuild host/binary version mismatch — resolution defect, not a v294 regression" "$out" ;;
  esac
  [ "$rc" -ne 0 ] && gate_fail "$c" "exit $rc — ${line:-no summary}" "$out"
  gate_ok "${line:-completed}  (expected $2 passed)"
}

# ── pre-certification integrity ───────────────────────────────────────────
# The release package must be COMPLETE before certification starts. This gate
# verifies that the application files the manifest names already carry the
# release's marker, and refuses to start otherwise. It never mutates source:
# certification that edits application code halfway through a run is not
# certification.
gate_app_integrity() {  # $1 = marker, $@ = files (relative to EC_REPO)
  local marker="$1"; shift
  [ -z "$marker" ] && return 0
  gate_begin "pre-certification integrity: application files carry $marker"
  local missing=""
  for f in "$@"; do
    [ -z "$f" ] && continue
    [ -f "$EC_REPO/$f" ] || { missing="$missing $f(absent)"; continue; }
    grep -q -- "$marker" "$EC_REPO/$f" || missing="$missing $f"
  done
  if [ -n "$missing" ]; then
    gate_fail "grep -l '$marker' <app files>" \
      "the release package is not fully applied — these files do not carry the marker:$missing. Re-extract the release ZIP before certifying; do not hand-edit."
  fi
  gate_ok "$# file(s) verified"
}

# ── application gates ──────────────────────────────────────────────────────
# `npm run lint` deliberately absent: this repository has only dev/build/start.
gate_app() {
  case "${EC_APP_GATES:-tsc-wsl}" in
    skip) gate_begin "application gates"; gate_ok "skipped by profile"; return 0 ;;
  esac
  gate_begin "TypeScript deploy check"
  local c="npx tsc --noEmit -p tsconfig.deploycheck.json"; gate_cmd "$c"
  local out rc
  out=$(cd "$EC_REPO" && "$EC_NODE" node_modules/typescript/bin/tsc --noEmit -p tsconfig.deploycheck.json 2>&1); rc=$?
  [ "$rc" -ne 0 ] && gate_fail "$c" "exit $rc" "$out"
  gate_ok "clean"

  if [ "${EC_APP_GATES}" = "all-wsl" ]; then
    gate_begin "production build (WSL)"
    local cb="$EC_NODE $EC_NPM_CLI run build"; gate_cmd "$cb"
    out=$(cd "$EC_REPO" && "$EC_NODE" "$EC_NPM_CLI" run build 2>&1); rc=$?
    [ "$rc" -ne 0 ] && gate_fail "$cb" "exit $rc" "$out"
    gate_ok "build clean"
  else
    gate_begin "production build"
    gate_ok "DEFERRED to Windows — next build pulls a platform-specific SWC binary"
    EC_MANUAL_BUILD=1
  fi
}

# ── install a permanent proof into the standing harness ───────────────────
# Runs AFTER a successful migration and BEFORE the permanent-proof gate: the
# proof cannot execute through verify.sh until it exists in the harness, and it
# must not be installed for a release whose migration failed.
gate_harness_install() {  # $@ = files relative to the release
  for f in "$@"; do
    [ -z "$f" ] && continue
    gate_begin "install into standing harness: $(basename "$f")"
    local src="$EC_REPO/$f" dest="$EC_HARNESS/supabase/tests/$(basename "$f")"
    [ -f "$src" ] || gate_fail "cp $src $dest" "the release does not contain $f — re-extract the release ZIP"
    [ -d "$EC_HARNESS/supabase/tests" ] || gate_fail "cp $src $dest" "harness path absent: $EC_HARNESS/supabase/tests"
    cp "$src" "$dest" || gate_fail "cp $src $dest" "copy failed"
    [ -f "$dest" ] || gate_fail "cp $src $dest" "copy reported success but the file is absent"
    gate_ok "$dest"
    printf '     NOTE  verify.sh STANDING does not list this proof, so the standing\n'
    printf '           floor will not include it until you rule on adding it.\n'
  done
}

# --verify completes an already-deployed release. The permanent proof can only be
# installed once the migration is CONFIRMED live, so the deployed marker is
# checked against the database first. Verifying a release that is not deployed
# fails precisely rather than installing a proof for absent SQL.
gate_verify_deployed() {  # $1 marker function name, $2.. = harness files
  local marker="$1"; shift
  [ -z "$marker" ] && { gate_begin "deployed check"; gate_ok "no marker declared — skipped"; return 0; }
  gate_begin "confirm the release is deployed to $EC_DB"
    local c="pg_q $EC_DB <catalog count for $marker>"
    gate_cmd "$c"
    local n rc
    n=$(pg_q "$EC_DB" \
          "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='$marker'"); rc=$?
    [ "$rc" -ne 0 ] && gate_fail "$c" "catalog query failed (rc=$rc): $n"
    n=$(printf '%s' "$n" | tail -1)
  [ "$n" = "0" ] && gate_fail "$c" "$marker is absent from $EC_DB — this release is NOT deployed, so --verify cannot certify it. Run a full pass on a database that predates the release."
  case "$n" in ''|*[!0-9]*) gate_fail "$c" "could not read the catalog: [$n]";; esac
  gate_ok "$marker present — release is live"

  for f in "$@"; do
    [ -z "$f" ] && continue
    local dest="$EC_HARNESS/supabase/tests/$(basename "$f")"
    if [ -f "$dest" ]; then
      gate_begin "standing harness already carries $(basename "$f")"; gate_ok
    else
      gate_begin "standing harness is MISSING $(basename "$f") — completing the install"
      printf '     The release is deployed but its permanent proof was never installed,\n'
      printf '     so the deployment was incomplete. Installing it now from the checkout.\n'
      [ -f "$EC_REPO/$f" ] || gate_fail "cp $EC_REPO/$f $dest" "the checkout does not contain $f — re-extract the release ZIP"
      cp "$EC_REPO/$f" "$dest" || gate_fail "cp $EC_REPO/$f $dest" "copy failed"
      [ -f "$dest" ] || gate_fail "cp $EC_REPO/$f $dest" "copy reported success but the file is absent"
      gate_ok "$dest"
    fi
  done
}

# ── deployment certification (v299 · post-v294-incident) ───────────────────
# Proves the TARGET DATABASE carries every object this release's chain requires.
#
# Every other gate in this file asks "does the release work?" This one asks the
# question that was never asked: "can the database we are shipping against run
# it?" v294 answered the first question green and the second not at all — its
# migration never reached production, and the first symptom was PGRST202 in
# front of an operator.
#
# TWO HALVES, BOTH MANDATORY (v299 · Fable B-1):
#   a. the local certification database is verified directly;
#   b. archived PRODUCTION evidence is required and graded.
# The first release of this gate certified only (a) and printed a NOTE about
# (b). A note is not evidence. Production is not reachable from this host, so
# the operator runs --emit-sql there and archives the result under
# ec/deploy-manifests/evidence/<release>.production.grade; this gate re-grades
# that file with the same manifests and refuses on missing, malformed,
# incomplete, stale, wrong-release or wrong-target evidence.
#
# EC_DEPLOY_LOCAL_ONLY=1 skips (b) — and the caller MUST then withhold the
# normal deployable verdict. certify-release.sh does exactly that.
#
# A missing manifest FAILS. It is not skipped by absence like `migration` or
# `one_shot`: the defect this gate exists to catch was an absent check, so
# silence here would reproduce it exactly.
gate_deployment_certification() {  # $1 release id  $2 optional target db
  local rel="$1" db="${2:-$EC_DB}"
  local mf="$EC_REPO/ec/deploy-manifests/$rel.deploy"
  local ev="$EC_REPO/ec/deploy-manifests/evidence/$rel.production.grade"

  # ── (a) local ────────────────────────────────────────────────────────────
  gate_begin "deployment certification (local) — is $db at $rel's architectural level?"
  local c="ec/verify-deployment.sh $rel --db $db"
  gate_cmd "$c"
  [ -f "$mf" ] || gate_fail "$c" \
    "no deployment manifest: ec/deploy-manifests/$rel.deploy. Every release from v292a forward must declare its database prerequisites — see ec/deploy-manifests/README.md. This gate refuses to pass a release whose prerequisites are undeclared."
  local out rc
  out=$(cd "$EC_REPO" && bash ec/verify-deployment.sh "$rel" --db "$db" 2>&1); rc=$?
  [ "$rc" -eq 2 ] && gate_fail "$c" "verifier setup error" "$out"
  [ "$rc" -ne 0 ] && gate_fail "$c" \
    "$db is BELOW the level $rel requires — the release is NOT deployable against it" "$out"
  local line; line=$(printf '%s' "$out" | grep -E '^  present:' | tail -1)
  gate_ok "local target '$db' PASSED —${line:- objects verified}"

  # ── (b) production evidence ──────────────────────────────────────────────
  if [ "${EC_DEPLOY_LOCAL_ONLY:-0}" = "1" ]; then
    gate_begin "deployment certification (production evidence) — SKIPPED by --local-only"
    gate_ok "the caller must NOT declare this release deployable"
    EC_DEPLOY_EVIDENCE="LOCAL-ONLY — no production evidence graded"
    return 0
  fi

  gate_begin "deployment certification (production) — grading archived evidence"
  local ce="ec/verify-deployment.sh $rel --grade ec/deploy-manifests/evidence/$rel.production.grade"
  gate_cmd "$ce"
  [ -f "$ev" ] || gate_fail "$ce" \
    "no production evidence for $rel at ec/deploy-manifests/evidence/$rel.production.grade.

     A release is not deployable on local verification alone — that is exactly
     how v294 shipped. Produce the evidence and archive it:

       ec/verify-deployment.sh $rel --emit-sql        (run this in the Supabase SQL Editor)
       save the COMPLETE result, provenance rows included, to the path above

     To run local verification WITHOUT the deployable verdict, re-run with
     --local-only."
  [ -s "$ev" ] || gate_fail "$ce" "the production evidence file is empty: $ev"

  local eout erc
  eout=$(cd "$EC_REPO" && bash ec/verify-deployment.sh "$rel" \
           --grade "ec/deploy-manifests/evidence/$rel.production.grade" 2>&1); erc=$?
  [ "$erc" -eq 2 ] && gate_fail "$ce" "verifier setup error while grading evidence" "$eout"
  [ "$erc" -ne 0 ] && gate_fail "$ce" \
    "production evidence REJECTED or the production database is below $rel's level" "$eout"

  local edb eat
  edb=$(printf '%s' "$eout" | grep -oE 'database=[^ ]+' | head -1 | cut -d= -f2)
  eat=$(printf '%s' "$eout" | grep -oE 'executed_at=.*' | head -1 | cut -d= -f2-)
  local eline; eline=$(printf '%s' "$eout" | grep -E '^  present:' | tail -1)
  gate_ok "production evidence PASSED —${eline:- objects verified}"
  EC_DEPLOY_EVIDENCE="database=${edb:-?} executed_at=${eat:-?}"

  # v299 · Fable M-B. An override is a human decision to accept evidence the
  # freshness rule would refuse. It must survive into the certification record,
  # not stop at the verifier's stdout — otherwise the ceremony's final banner
  # reads identically whether the rule was honoured or waived.
  #
  # Only staleness is overridable. A digest mismatch, wrong release, local
  # database, malformed or incomplete evidence exits before this point, so no
  # override text can ever accompany them.
  local ovr; ovr=$(printf '%s\n' "$eout" | grep '^EVIDENCE OVERRIDE' | head -1)
  if [ -n "$ovr" ]; then
    printf '     %s\n' "$ovr"
    EC_DEPLOY_EVIDENCE="$EC_DEPLOY_EVIDENCE  [OVERRIDDEN: ${ovr#EVIDENCE OVERRIDE — }]"
  fi

  printf '     certified local  : %s\n' "$db"
  printf '     certified evidence: %s\n' "$EC_DEPLOY_EVIDENCE"
  printf '     evidence file    : ec/deploy-manifests/evidence/%s.production.grade\n' "$rel"
}
