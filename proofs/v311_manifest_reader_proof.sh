#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# EventCore — MANIFEST READER PROOF · claims MR-1 … MR-12
#
# Proves the certification manifest reader and the two gates that consume
# repeatable keys behave correctly for BOTH shapes a release may take: the
# historical single-migration manifest and v311's four-migration manifest.
#
# WHY THIS EXISTS. certify-release.sh's mf() ends its awk with `exit`, so it
# answers with the FIRST matching line. Every scalar key depends on that. v311
# is the first release to declare four `migration` and four `deployed_marker`
# lines, and the scalar reader silently truncated both to the first — one
# migration of four was applied while the gate reported success. mf_all() now
# serves the repeatable keys; this proof holds both accessors to their contract.
#
# READ-ONLY. No database is created, cloned, altered, dropped or even contacted:
# the gate claims run against stubbed pg_file/pg_q so that "applied exactly
# once" and "stops at the first failure" are observable as facts rather than
# inferred. Fixture manifests live in a scratch directory outside the
# repository and are removed on exit.
#
# Run:  bash proofs/v311_manifest_reader_proof.sh
# Exit: 0 all claims proved · 1 a claim failed · 2 setup error
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
CERT="$REPO/certify-release.sh"
GATES="$REPO/ec/lib/gates.sh"

[ -f "$CERT" ]  || { echo "setup: missing $CERT"; exit 2; }
[ -f "$GATES" ] || { echo "setup: missing $GATES"; exit 2; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

passed=0; failed=0
EQ() {  # EQ <name> <expected> <actual>
  if [ "$2" = "$3" ]; then passed=$((passed+1)); printf 'PASS %s\n' "$1"
  else failed=$((failed+1)); printf 'FAIL %s\n       expected [%s]\n       actual   [%s]\n' "$1" "$2" "$3"; fi
}

# The accessors are proved as SHIPPED: their definitions are lifted out of
# certify-release.sh rather than restated here, so this proof cannot drift from
# the code it certifies.
eval "$(grep -E '^mf(_all)?\(\) \{' "$CERT")"
command -v mf     >/dev/null || { echo "setup: mf() not extracted"; exit 2; }
command -v mf_all >/dev/null || { echo "setup: mf_all() not extracted"; exit 2; }

# ── fixtures ───────────────────────────────────────────────────────────────
cat > "$TMP/one.manifest" <<'EOF'
version            v999
migration          supabase/v999_only.sql
permanent          v999_permanent_proof                         expect 3
deployed_marker    v999_only
standing_verify    yes
EOF

cat > "$TMP/four.manifest" <<'EOF'
version            v998
migration          supabase/v998_a.sql
migration          supabase/v998_b.sql
migration          supabase/v998_c.sql
migration          supabase/v998_d.sql
permanent          v998_permanent_proof                         expect 9
deployed_marker    v998_a
deployed_marker    v998_b
deployed_marker    v998_c
deployed_marker    v998_d
standing_verify    yes
EOF

cat > "$TMP/none.manifest" <<'EOF'
version            v997
permanent          v997_permanent_proof                         expect 1
EOF

# ── MR-1 · a historical single-migration manifest is unchanged ─────────────
MANIFEST="$TMP/one.manifest"
EQ "MR-1  one migration reads identically through mf and mf_all" \
   "supabase/v999_only.sql|supabase/v999_only.sql" \
   "$(mf migration)|$(mf_all migration)"

# ── MR-2 · four migrations, ALL of them, in DECLARATION ORDER ──────────────
MANIFEST="$TMP/four.manifest"
EQ "MR-2  four migrations return all four in declaration order" \
   "supabase/v998_a.sql supabase/v998_b.sql supabase/v998_c.sql supabase/v998_d.sql" \
   "$(mf_all migration | tr '\n' ' ' | sed 's/ $//')"

# ── MR-3 · NEGATIVE CONTROL · the scalar reader still truncates ────────────
# Without this, MR-2 proves only that some reader can print four lines.
EQ "MR-3  the scalar reader still answers with the first line only" \
   "supabase/v998_a.sql" "$(mf migration)"

# ── MR-4 · four deployed markers, all of them ──────────────────────────────
EQ "MR-4  four deployed markers return all four in order" \
   "v998_a v998_b v998_c v998_d" \
   "$(mf_all deployed_marker | tr '\n' ' ' | sed 's/ $//')"

# ── MR-5 · scalar keys stay scalar — no newline-joining ────────────────────
EQ "MR-5  a scalar key is not newline-joined by mf" \
   "1" "$(mf permanent | wc -l | tr -d ' ')"
EQ "MR-5b scalar value survives whole, single-spaced as mf has always rebuilt it" \
   "v998_permanent_proof expect 9" "$(mf permanent)"

# ── MR-6 · absent optional keys retain historical behaviour ────────────────
MANIFEST="$TMP/none.manifest"
EQ "MR-6  an absent key is empty through mf" "" "$(mf migration)"
EQ "MR-6b an absent key is empty through mf_all" "" "$(mf_all migration)"
EQ "MR-6c an absent marker is empty through mf_all" "" "$(mf_all deployed_marker)"

# ── gate claims · stubbed PostgreSQL, nothing is contacted ─────────────────
# gate_fail exits 1, so each gate claim runs in its own subshell and the exit
# status IS the observation.
gate_probe() {  # gate_probe <marker-present-list> <failing-migration|""> <migrations> <markers>
  (
    set +u
    EC_DB=stub; EC_REPO="$TMP"; EC_HARNESS="$TMP"
    PRESENT="$1"; FAILAT="$2"
    # shellcheck disable=SC1090
    . "$GATES"
    pg_q()   { local m="${2##*proname=\'}"; m="${m%%\'*}"; case " $PRESENT " in *" $m "*) echo 1;; *) echo 0;; esac; }
    pg_file(){ echo "APPLIED $2" >> "$TMP/applied.log"
                 [ -n "$FAILAT" ] && case "$2" in *"$FAILAT") return 1;; esac
                 return 0; }
    gate_migration "$3" v998 "$4"
  ) >/dev/null 2>&1
}

# ── MR-7 · all four migrations applied, each exactly once, in order ────────
: > "$TMP/applied.log"
gate_probe "" "" "$(printf 'supabase/v998_a.sql\nsupabase/v998_b.sql\nsupabase/v998_c.sql\nsupabase/v998_d.sql')" ""
rc7=$?
EQ "MR-7  gate_migration applies every declared migration (rc 0)" "0" "$rc7"
EQ "MR-7b each migration applied exactly once, in declaration order" \
   "v998_a.sql v998_b.sql v998_c.sql v998_d.sql" \
   "$(sed 's#.*/##' "$TMP/applied.log" | tr '\n' ' ' | sed 's/ $//')"

# ── MR-8 · NEGATIVE CONTROL · migration 3 fails, sequence stops ────────────
: > "$TMP/applied.log"
gate_probe "" "v998_c.sql" "$(printf 'supabase/v998_a.sql\nsupabase/v998_b.sql\nsupabase/v998_c.sql\nsupabase/v998_d.sql')" ""
rc8=$?
EQ "MR-8  a failing migration fails the gate rather than reporting green" "1" "$rc8"
EQ "MR-8b the sequence stops at the failure — migration 4 is never applied" \
   "v998_a.sql v998_b.sql v998_c.sql" \
   "$(sed 's#.*/##' "$TMP/applied.log" | tr '\n' ' ' | sed 's/ $//')"

# ── MR-9 · a partial marker set is refused, not treated as already-applied ─
: > "$TMP/applied.log"
gate_probe "v998_a v998_b" "" "$(printf 'supabase/v998_a.sql')" "$(printf 'v998_a\nv998_b\nv998_c\nv998_d')"
rc9=$?
EQ "MR-9  2 of 4 markers present is refused as a partial installation" "1" "$rc9"
EQ "MR-9b nothing was applied around the partial install" "" \
   "$(tr -d '\n' < "$TMP/applied.log")"

# ── MR-10 · a historical single migration still applies through the gate ───
: > "$TMP/applied.log"
gate_probe "" "" "supabase/v999_only.sql" ""
rc10=$?
EQ "MR-10 single-migration release still applies (rc 0)" "0" "$rc10"
EQ "MR-10b exactly one apply, unchanged from historical behaviour" \
   "v999_only.sql" "$(sed 's#.*/##' "$TMP/applied.log" | tr -d '\n')"

# ── gate_verify_deployed · every declared marker is checked ────────────────
verify_probe() {  # verify_probe <present-list> <markers>
  (
    set +u
    EC_DB=stub; EC_REPO="$TMP"; EC_HARNESS="$TMP"
    PRESENT="$1"
    # shellcheck disable=SC1090
    . "$GATES"
    pg_q() { local m="${2##*proname=\'}"; m="${m%%\'*}"; case " $PRESENT " in *" $m "*) echo 1;; *) echo 0;; esac; }
    gate_verify_deployed "$2"
  ) >/dev/null 2>&1
}

# ── MR-11 · one marker present, one declared — historical behaviour ────────
verify_probe "v999_only" "v999_only"; EQ "MR-11 single declared marker present verifies" "0" "$?"
verify_probe ""          "v999_only"; EQ "MR-11b single declared marker absent fails"     "1" "$?"

# ── MR-12 · four declared markers · each absence is caught ─────────────────
verify_probe "v998_a v998_b v998_c v998_d" "$(printf 'v998_a\nv998_b\nv998_c\nv998_d')"
EQ "MR-12 all four declared markers present verifies" "0" "$?"
for miss in v998_b v998_c v998_d; do
  present="$(printf 'v998_a v998_b v998_c v998_d' | sed "s/$miss//")"
  verify_probe "$present" "$(printf 'v998_a\nv998_b\nv998_c\nv998_d')"
  EQ "MR-12b absence of $miss fails verification (never graded from the first marker)" "1" "$?"
done

echo
echo "v311 MANIFEST READER: $passed PASS / $failed FAIL"
[ "$failed" -eq 0 ] || exit 1
exit 0
