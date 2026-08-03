#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# EventCore — DEPLOYMENT GUARD PROOF · claims DG-1 … DG-7
#
# Proves the deployment certification guard does what it claims: that it PASSES
# a database at the required level, FAILS one that is not, is sensitive to
# function SIGNATURES and not merely names, walks the release chain
# transitively, and writes nothing.
#
# READ-ONLY. Every claim is exercised against `ec` with catalog SELECTs, or
# against fixture manifests that name objects which have never existed. No
# database is created, cloned, altered or dropped, and `ec` itself is never
# modified — a proof for a read-only guard has no business mutating anything.
#
# Run:  bash proofs/deployment_guard_proof.sh
# Exit: 0 all claims proved · 1 a claim failed · 2 setup error
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
VERIFY="$REPO/ec/verify-deployment.sh"
FIXTURES="$REPO/ec/deploy-manifests/fixtures"
DB="${EC_DB:-ec}"

[ -f "$VERIFY" ] || { echo "setup: missing $VERIFY"; exit 2; }
[ -d "$FIXTURES" ] || { echo "setup: missing $FIXTURES"; exit 2; }

# Scratch for generated evidence fixtures. Outside the repository, removed on
# exit: a proof for a read-only guard leaves nothing behind.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

passed=0; failed=0
T() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then passed=$((passed+1)); printf 'PASS %s\n' "$name"
  else failed=$((failed+1)); printf 'FAIL %s\n' "$name"; fi
}
# assert the command FAILS (negative control)
TN() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then failed=$((failed+1)); printf 'FAIL %s  (expected failure, got success)\n' "$name"
  else passed=$((passed+1)); printf 'PASS %s\n' "$name"; fi
}

echo "EventCore deployment guard proof — target database: $DB"
echo

# ── DG-1 · a database at the required level PASSES ─────────────────────────
T "DG-1 v294 certifies against a database that carries the whole chain" \
  bash "$VERIFY" v294 --db "$DB" --quiet

# ── DG-2 · the head release also passes, so the chain has no gap ───────────
T "DG-2 v297 certifies — every manifest from v292a to head resolves" \
  bash "$VERIFY" v297 --db "$DB" --quiet

# ── DG-3 · NEGATIVE CONTROL · an absent object FAILS ───────────────────────
# Without this, DG-1 proves only that the script can print PASS.
TN "DG-3 a manifest naming objects that never existed FAILS" \
  bash "$VERIFY" negative-absent-object --db "$DB" --quiet --manifest-dir "$FIXTURES"

# ── DG-4 · NEGATIVE CONTROL · wrong SIGNATURE FAILS ────────────────────────
# The name exists in ec; the signature does not. A name-only check would pass
# here, and would have called the v294 production outage healthy.
TN "DG-4 a present function under the WRONG signature FAILS" \
  bash "$VERIFY" negative-wrong-signature --db "$DB" --quiet --manifest-dir "$FIXTURES"

# ── DG-5 · the chain is walked transitively ────────────────────────────────
# Verifying v294 must check v292a1's objects, not only v294's own. If the walk
# were shallow, production's exact failure — v294 present, v292a1 absent —
# would certify green.
# Output is captured before matching: piping straight into `grep -q` makes grep
# exit at the first hit, the verifier take SIGPIPE, and `pipefail` report 141 —
# a proof-harness artifact that looks exactly like a guard defect.
dg5() {
  local out
  out="$(bash "$VERIFY" v294 --db "$DB" 2>/dev/null)"
  printf '%s' "$out" | grep -q 'table engagement_occurrence' || return 1
  printf '%s' "$out" | grep -q 'occurrence_is_active' || return 1
  return 0
}
T "DG-5 verifying v294 also verifies the v292a1 band it depends on" dg5

# ── DG-6 · a missing manifest is an ERROR, never a silent skip ─────────────
# The failure that produced the outage was an absent check, not a failing one.
TN "DG-6 an undeclared release is refused rather than skipped" \
  bash "$VERIFY" v999-does-not-exist --db "$DB" --quiet

# ── DG-7 · the emitted SQL contains no write verb ──────────────────────────
# Mechanical, not a promise: the generated statement is scanned for DDL/DML.
dg7() {
  local sql raw
  raw="$(bash "$VERIFY" v297 --emit-sql 2>/dev/null)"
  sql="$(printf '%s' "$raw" | grep -v '^--')"
  [ -n "$sql" ] || return 1
  printf '%s' "$sql" | grep -qiE '\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|notify|refresh)\b' && return 1
  printf '%s' "$sql" | grep -qi '^[[:space:]]*select' || return 1
  return 0
}
T "DG-7 the generated check is a single SELECT with no write verb" dg7

# ══ v299 CORRECTION CLAIMS · DG-8 … DG-14 ═════════════════════════════════

# ── DG-8 · M-1 · an unknown manifest key is a HARD failure ─────────────────
# `functoin` in the fixture would previously have been noted and ignored, so the
# manifest would verify green while requiring nothing.
TN "DG-8 a misspelled manifest key (functoin) FAILS rather than being ignored" \
  bash "$VERIFY" negative-unknown-key --db "$DB" --manifest-dir "$FIXTURES"

# ── DG-9 · M-1 · --quiet cannot suppress that refusal ──────────────────────
dg9() {
  local out rc
  out="$(bash "$VERIFY" negative-unknown-key --db "$DB" --quiet --manifest-dir "$FIXTURES" 2>&1)"; rc=$?
  [ "$rc" -eq 2 ] || return 1
  printf '%s' "$out" | grep -q 'MANIFEST ERROR' || return 1
  return 0
}
T "DG-9 --quiet does not hide the unknown-key refusal; exit is 2" dg9

# ── DG-10 · B-2 · v299 traverses v298 and the whole earlier chain ──────────
dg10() {
  local out
  out="$(bash "$VERIFY" v299 --db "$DB" 2>/dev/null)"
  printf '%s' "$out" | grep -qE 'chain   :.*v292a .*v297 v298 v299' || return 1
  printf '%s' "$out" | grep -q 'table engagement_occurrence' || return 1
  printf '%s' "$out" | grep -q 'DEPLOYMENT CERTIFICATION PASSED' || return 1
  return 0
}
T "DG-10 verifying v299 walks v298 and the full chain back to v292a" dg10

# ── DG-11 · M-3 · evidence without provenance is rejected ──────────────────
dg11() {
  local f="$TMP/no-provenance.grade"
  bash "$VERIFY" v299 --db "$DB" 2>/dev/null | grep '^PASS' | sed 's/^PASS  //' \
    | awk '{k=$1; $1=""; sub(/^ /,""); printf "%s|%s|PRESENT\n", k, $0}' > "$f"
  [ -s "$f" ] || return 1
  local out rc
  out="$(bash "$VERIFY" v299 --grade "$f" 2>&1)"; rc=$?
  [ "$rc" -ne 0 ] || return 1
  printf '%s' "$out" | grep -q 'EVIDENCE REJECTED' || return 1
  printf '%s' "$out" | grep -q 'no provenance rows' || return 1
  return 0
}
T "DG-11 evidence carrying no provenance rows is REJECTED" dg11

# ── DG-12 · M-3 · evidence for a different release is rejected ─────────────
# Real provenance, produced honestly for v297, offered as v299 evidence.
dg12() {
  local f="$TMP/wrong-release.grade"
  bash "$VERIFY" v297 --db "$DB" --emit-sql >/dev/null 2>&1 || return 1
  ( cd "$REPO" && . ec/lib/pg.sh && pg_q "$DB" "$(bash "$VERIFY" v297 --emit-sql | grep -v '^--')" ) > "$f" 2>/dev/null
  [ -s "$f" ] || return 1
  local out rc
  out="$(bash "$VERIFY" v299 --grade "$f" 2>&1)"; rc=$?
  [ "$rc" -ne 0 ] || return 1
  printf '%s' "$out" | grep -q "this result is for release 'v297', not 'v299'" || return 1
  return 0
}
T "DG-12 evidence produced for another release is REJECTED" dg12

# ── DG-13 · M-3 · local-database output cannot pose as production ──────────
# The strongest false-green path: grade ec's own output as if it were prod.
dg13() {
  local f="$TMP/local-as-prod.grade"
  ( cd "$REPO" && . ec/lib/pg.sh && pg_q "$DB" "$(bash "$VERIFY" v299 --emit-sql | grep -v '^--')" ) > "$f" 2>/dev/null
  [ -s "$f" ] || return 1
  local out rc
  out="$(bash "$VERIFY" v299 --grade "$f" 2>&1)"; rc=$?
  [ "$rc" -ne 0 ] || return 1
  printf '%s' "$out" | grep -q 'LOCAL certification database' || return 1
  return 0
}
T "DG-13 output from the local certification database is REJECTED as production evidence" dg13

# ── DG-14 · B-1 · absent production evidence blocks the deployable verdict ─
# Exercises the gate itself, not just the verifier.
#
# HERMETIC BY CONSTRUCTION. This claim once ran against $REPO directly and
# passed only because no evidence file existed yet. The moment real production
# evidence was archived it went red — a proof failing for an environmental
# reason, which is worse than no proof. It now builds an isolated repo-shaped
# tree with the manifests, verifier and lib symlinked and an EMPTY evidence
# directory, so the claim is about the gate's behaviour and not about whether
# someone has certified production lately.
dg14() {
  local iso="$TMP/absent-evidence"
  rm -rf "$iso"; mkdir -p "$iso/ec/deploy-manifests/evidence"
  ln -s "$REPO/ec/verify-deployment.sh" "$iso/ec/verify-deployment.sh"
  ln -s "$REPO/ec/lib" "$iso/ec/lib"
  local m
  for m in "$REPO"/ec/deploy-manifests/*.deploy; do ln -s "$m" "$iso/ec/deploy-manifests/"; done
  [ -e "$iso/ec/deploy-manifests/evidence/v299.production.grade" ] && return 1
  local out rc
  out="$(cd "$iso" && EC_REPO="$iso" EC_DB="$DB" bash -c '
      . '"$REPO"'/ec/lib/gates.sh
      gate_deployment_certification v299' 2>&1)"; rc=$?
  [ "$rc" -ne 0 ] || return 1
  printf '%s' "$out" | grep -q 'no production evidence' || return 1
  printf '%s' "$out" | grep -q 'GATE FAILED' || return 1
  # and the local half must have passed first — the failure is about evidence,
  # not about the database
  printf '%s' "$out" | grep -q "local target '$DB' PASSED" || return 1
  return 0
}
T "DG-14 the gate FAILS when archived production evidence is absent" dg14

# ── DG-16 · M-B · an override is visible in the gate record ────────────────
# Staleness is the ONLY overridable refusal. When it is waived, the reason must
# reach the certification record, not stop at the verifier's stdout.
dg16() {
  local iso="$TMP/stale-evidence"
  rm -rf "$iso"; mkdir -p "$iso/ec/deploy-manifests/evidence"
  ln -s "$REPO/ec/verify-deployment.sh" "$iso/ec/verify-deployment.sh"
  ln -s "$REPO/ec/lib" "$iso/ec/lib"
  local m
  for m in "$REPO"/ec/deploy-manifests/*.deploy; do ln -s "$m" "$iso/ec/deploy-manifests/"; done

  # a genuine local result, aged and relabelled as a non-local target: every
  # check passes except freshness, which is the one an override may waive
  ( cd "$REPO" && . ec/lib/pg.sh && pg_q "$DB" "$(bash "$VERIFY" v299 --emit-sql | grep -v '^--')" ) \
    | sed -e 's/^provenance|database|.*/provenance|database|postgres/' \
          -e 's/^provenance|executed_at|.*/provenance|executed_at|2026-01-05 08:00:00.000000-05/' \
    > "$iso/ec/deploy-manifests/evidence/v299.production.grade" 2>/dev/null
  [ -s "$iso/ec/deploy-manifests/evidence/v299.production.grade" ] || return 1

  local out rc
  out="$(cd "$iso" && EC_REPO="$iso" EC_DB="$DB" \
         EC_EVIDENCE_OVERRIDE_REASON="DG-16 proof fixture" bash -c '
      . '"$REPO"'/ec/lib/gates.sh
      gate_deployment_certification v299
      printf "EVIDENCE=%s\n" "$EC_DEPLOY_EVIDENCE"' 2>&1)"; rc=$?
  [ "$rc" -eq 0 ] || return 1
  printf '%s' "$out" | grep -q 'EVIDENCE OVERRIDE — .* accepted because: DG-16 proof fixture' || return 1
  printf '%s' "$out" | grep -q 'EVIDENCE=.*OVERRIDDEN' || return 1
  return 0
}
T "DG-16 a freshness override is printed and marks EC_DEPLOY_EVIDENCE OVERRIDDEN" dg16

# ── DG-17 · M-B · non-freshness refusals cannot be overridden ──────────────
# Setting the override must not rescue a digest mismatch, a wrong release, local
# output, malformed or incomplete evidence.
dg17() {
  local base="$TMP/dg17-base.grade"
  ( cd "$REPO" && . ec/lib/pg.sh && pg_q "$DB" "$(bash "$VERIFY" v299 --emit-sql | grep -v '^--')" ) > "$base" 2>/dev/null
  [ -s "$base" ] || return 1
  local f rc
  # local output — database=ec, untouched
  EC_EVIDENCE_OVERRIDE_REASON="should not rescue" bash "$VERIFY" v299 --grade "$base" >/dev/null 2>&1 && return 1
  # wrong manifest digest
  f="$TMP/dg17-digest.grade"
  sed -e 's/^provenance|database|.*/provenance|database|postgres/' \
      -e 's/^provenance|manifest_digest|.*/provenance|manifest_digest|deadbeefdeadbeefdeadbeefdeadbeef/' "$base" > "$f"
  EC_EVIDENCE_OVERRIDE_REASON="should not rescue" bash "$VERIFY" v299 --grade "$f" >/dev/null 2>&1 && return 1
  # incomplete paste
  f="$TMP/dg17-short.grade"
  { grep '^provenance' "$base" | sed 's/^provenance|database|.*/provenance|database|postgres/'
    grep -v '^provenance' "$base" | head -20; } > "$f"
  EC_EVIDENCE_OVERRIDE_REASON="should not rescue" bash "$VERIFY" v299 --grade "$f" >/dev/null 2>&1 && return 1
  # no provenance at all
  f="$TMP/dg17-bare.grade"; grep -v '^provenance' "$base" > "$f"
  EC_EVIDENCE_OVERRIDE_REASON="should not rescue" bash "$VERIFY" v299 --grade "$f" >/dev/null 2>&1 && return 1
  return 0
}
T "DG-17 an override cannot rescue digest, local, incomplete or malformed evidence" dg17

# ── DG-15 · B-1 · --local-only passes the gate but withholds the verdict ───
dg15() {
  local out rc
  out="$(cd "$REPO" && EC_REPO="$REPO" EC_DB="$DB" EC_DEPLOY_LOCAL_ONLY=1 bash -c '
      . ec/lib/gates.sh
      gate_deployment_certification v299
      printf "EVIDENCE=%s\n" "${EC_DEPLOY_EVIDENCE:-unset}"' 2>&1)"; rc=$?
  [ "$rc" -eq 0 ] || return 1
  printf '%s' "$out" | grep -q 'SKIPPED by --local-only' || return 1
  printf '%s' "$out" | grep -q 'EVIDENCE=LOCAL-ONLY' || return 1
  # and certify-release.sh must withhold CERTIFICATION GREEN in that mode
  grep -q 'LOCAL VERIFICATION ONLY — NOT DEPLOYABLE' "$REPO/certify-release.sh" || return 1
  return 0
}
T "DG-15 --local-only cannot produce the normal deployable green verdict" dg15

echo
echo "deployment_guard_proof: $passed passed, $failed failed"
[ "$failed" -eq 0 ] || exit 1
exit 0
