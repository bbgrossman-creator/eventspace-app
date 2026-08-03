#!/usr/bin/env bash
cd "$(dirname "$0")/.." || exit 2
P=0; F=0
ck(){ if [ "$2" = "$3" ]; then P=$((P+1)); printf '  PASS  %-4s %s\n' "$1" "$4"; else F=$((F+1)); printf '  FAIL  %-4s %s — expected [%s] got [%s]\n' "$1" "$4" "$3" "$2"; fi; }

# 1 · no eval / shell re-entry with caller-controlled text
CODE=$(grep -vE '^\s*#' ec/pg-admin)
ck A1 "$(printf '%s' "$CODE" | grep -cE '\beval\b|`')" "0" "ec/pg-admin CODE: no eval, no backticks"
ck A1b "$(grep -cE 'bash -c|sh -c|system\(' ec/pg-admin)" "0" "ec/pg-admin: never spawns a shell"

# 2 · argv safety — every external call is a quoted argv array
ck A2 "$(grep -cE '"\$(PSQL|CREATEDB|DROPDB)" ' ec/pg-admin)" "8" "all 8 binary invocations use quoted argv arrays"
ck A2b "$(grep -cE '\$(PSQL|CREATEDB|DROPDB)[^"]' ec/pg-admin | tr -d ' ')" "0" "no unquoted binary expansion"

# 3 · validation cannot be bypassed
ck A3 "$(grep -c 'dbok "\$1"' ec/pg-admin)" "7" "every db-taking verb calls dbok on its first arg"
ck A3b "$(grep -c 'dbok "\$2"' ec/pg-admin)" "1" "clone validates its destination too"
ck A3c "$(grep -c 'realpath -e --' ec/pg-admin)" "1" "sqlfile canonicalises before the prefix test"
ck A3d "$(grep -c 'refusing to run as root' ec/pg-admin)" "1" "wrapper refuses root even if the grant widened"

# 4 · installer ownership and modes
ck A4 "$(grep -c 'install -o root -g root -m 0755' ec/install-pg-admin.sh)" "1" "wrapper installed root:root 0755"
ck A4b "$(grep -c 'chmod 0440 "\$SUDOERS"' ec/install-pg-admin.sh)" "1" "sudoers drop-in installed 0440"
ck A4c "$(grep -c 'visudo -c -f' ec/install-pg-admin.sh)" "1" "validated with visudo before taking effect"
ck A4d "$(grep -c 'rm -f "\$SUDOERS"' ec/install-pg-admin.sh)" "1" "reverts the grant if validation fails"

# 5 · the grant is exactly one line, one program, target postgres
ck A5 "$(grep -c 'ALL=(postgres) NOPASSWD: \$DST' ec/install-pg-admin.sh)" "1" "grant is (postgres), single program"
ck A5b "$(grep -cE 'ALL=\(root\)|NOPASSWD:.*(bash|sh|psql|ALL)$' ec/install-pg-admin.sh)" "0" "no root grant, no shell/binary grant"

# 9 · derive the blocking scope from the current release manifest
AUDIT_VERSION="${1:-}"
if [ -n "$AUDIT_VERSION" ]; then
  case "$AUDIT_VERSION" in v*) : ;; *) AUDIT_VERSION="v$AUDIT_VERSION";; esac
  MANIFEST="ec/manifests/$AUDIT_VERSION.manifest"
else
  MANIFEST=$(printf '%s\n' ec/manifests/v*.manifest | sort -V | tail -1)
fi
[ -f "$MANIFEST" ] || { echo "audit: no current release manifest: $MANIFEST" >&2; exit 2; }

ACTIVE_SRC=(certify-release.sh ec/lib/gates.sh)
ACTIVE_SH=(certify-release.sh ec/lib/gates.sh)
ACTIVE_JS=()
ACTIVE_PG=()
ACTIVE_DECLARED=$(awk '
  $1 ~ /^(one_shot|race|race_regress|browser|browser_regress)$/ {
    for (i=2; i<=NF; i++) { if ($i=="expect") break; print $i }
  }
' "$MANIFEST")
for f in $ACTIVE_DECLARED; do
  [ -f "$f" ] || { echo "audit: manifest-selected executable is absent: $f" >&2; exit 2; }
  ACTIVE_SRC+=("$f")
  case "$f" in
    *.sh) ACTIVE_SH+=("$f");;
    *.js|*.mjs|*.cjs) ACTIVE_JS+=("$f");;
  esac
  case "$f" in proofs/*.sh) ACTIVE_PG+=("$f");; esac
done
ONESHOT=$(awk '$1=="one_shot" {print $2; exit}' "$MANIFEST")
active_shell_exec() { python3 ec/lib/execonly.py "${ACTIVE_SH[@]}"; }
active_js_exec() { [ "${#ACTIVE_JS[@]}" -eq 0 ] || python3 ec/lib/jsexeconly.py "${ACTIVE_JS[@]}"; }
active_js_priv() { [ "${#ACTIVE_JS[@]}" -eq 0 ] || python3 ec/lib/jsexeconly.py --privilege "${ACTIVE_JS[@]}"; }
active_exec() { active_shell_exec; active_js_exec; }
ALL_SH=("${ACTIVE_SH[@]}" ec/install-pg-admin.sh ec/lib/pg.sh)
all_exec() { python3 ec/lib/execonly.py "${ALL_SH[@]}"; active_js_exec; }
active_forbidden_privilege() {
  active_shell_exec | grep -E 'sudo bash|sudo -E|su postgres|sudo -u postgres'
  active_js_priv | grep ':FORBIDDEN_PRIVILEGE:'
}
active_shell_c() {
  python3 ec/lib/execonly.py "${ALL_SH[@]}" | grep -E '\b(ba|da|k|z)?sh[[:space:]]+-c\b'
  active_js_priv | grep ':PRIVILEGED_SHELL_C:'
}
active_raw_db() {
  active_shell_exec | grep -E '\bpsql\b|\bcreatedb\b|\bdropdb\b'
  active_js_priv | grep ':RAW_DB:'
}

printf '  scope current manifest: %s\n' "$MANIFEST"
printf '  scope active executable: %s\n' "${ACTIVE_SRC[*]}"

FIRST=$(grep -nE 'pg_capability|gate_one_shot|gate_migration|gate_permanent' certify-release.sh | head -1 | cut -d: -f2)
ck A9 "$(echo "$FIRST" | grep -c pg_capability)" "1" "capability check is the FIRST gate-ish call in certify-release.sh"
ck A9b "$(grep -c 'exit 78' certify-release.sh)" "1" "stops with exit 78 when unavailable"
ck A9c "$(grep -c 'BEN ACTION REQUIRED' certify-release.sh)" "1" "prints the exact required message"

# 10 · migration completeness across the manifest-selected certification path
ck A10 "$(active_forbidden_privilege | wc -l)" "0" "no legacy privileged EXECUTION in the active release path"
ck A10b "$(grep -c 'pg_require' "$ONESHOT")" "1" "manifest-selected one-shot proof gates on capability"
ACTIVE_PG_GATED=0
for f in "${ACTIVE_PG[@]}"; do grep -q 'pg_require' "$f" && ACTIVE_PG_GATED=$((ACTIVE_PG_GATED+1)); done
ck A10c "$ACTIVE_PG_GATED" "${#ACTIVE_PG[@]}" "all manifest-selected proof/race scripts gate on capability"
ck A10d "$(grep -vE '^\s*#' ec/lib/pg.sh | grep -c 'EC_SUDO:-sudo -n -u postgres')" "1" "pg.sh default privileged invoker is sudo -n -u postgres"
ck A10e "$(python3 ec/lib/execonly.py ec/lib/pg.sh | grep -oE 'sudo [^ ]+' | grep -vc '^sudo -n$' || true)" "0" "every executed sudo in pg.sh carries -n (cannot prompt)"

# ── C-2 · executable-interpreter constructs in the active path ───────────────
ck A11 "$(active_forbidden_privilege | wc -l)" "0" \
   "no privileged execution in the manifest-selected certification path"
ck A11b "$(all_exec | grep -cE '\|[[:space:]]*(sudo[[:space:]]+)?(ba|da|k|z)?sh\b')" "0" \
   "nothing in the active path is piped into a shell interpreter"
ck A11c "$(all_exec | grep -cE '(^|[^a-zA-Z_])(source|\.)[[:space:]]+<\(')" "0" \
   "no process-substitution sourcing in the active path"
ck A11d "$(all_exec | grep -cE '(^|[^a-zA-Z_])eval[[:space:]]')" "0" \
   "no eval in the active path"
ck A11e "$(active_shell_c | wc -l)" "0" \
   "no shell -c invocation in the active path"

# ── C-5 · variable-indirected privileged execution in the active path ────────
ck A15 "$(active_raw_db | wc -l)" "0" \
   "no executable raw psql/createdb/dropdb in the manifest-selected path"
ck A15b "$(active_exec | grep -cE 'EC_PSQL|EC_PSQL_ADMIN')" "0" \
   "the EC_PSQL / EC_PSQL_ADMIN raw-psql variables are not used in the active path"
ck A15c "$(active_exec | grep -cE '(^|[[:space:]])PSQL=')" "0" \
   "no precise PSQL= assignment/override is passed into an active sub-harness"
ck A15d "$(active_exec | grep -cE '\bshim/su\b|/shim/')" "0" \
   "the legacy privileged shim is not invoked from the active path"

# Historical scripts remain visible without weakening or blocking the current
# release. Their bytes are frozen evidence and are not rewritten by this audit.
declare -A ACTIVE_SEEN=()
for f in "${ACTIVE_SRC[@]}"; do ACTIVE_SEEN["$f"]=1; done
LEGACY_SRC=()
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -n "${ACTIVE_SEEN[$f]:-}" ] && continue
  case "$f" in ec/audit-privilege.sh|ec/install-pg-admin.sh|ec/lib/pg.sh) continue;; esac
  LEGACY_SRC+=("$f")
done < <(git ls-files --cached --others --exclude-standard -- '*.sh')
echo "  legacy inventory (NON-BLOCKING; out of active release path):"
LEGACY_MATCHES=""
if [ "${#LEGACY_SRC[@]}" -gt 0 ]; then
  LEGACY_MATCHES=$(python3 ec/lib/execonly.py "${LEGACY_SRC[@]}" | \
    grep -E 'sudo bash|sudo -E|su postgres|sudo -u postgres|\bpsql\b|\bcreatedb\b|\bdropdb\b' || true)
fi
if [ -n "$LEGACY_MATCHES" ]; then
  printf '%s\n' "$LEGACY_MATCHES" | sed 's/^/    LEGACY /'
else
  echo "    none"
fi

# ── C-1 · exit-code propagation is structural, not incidental ────────────────
ck A12 "$(python3 ec/lib/execonly.py ec/lib/pg.sh | grep -cE '_pg[[:space:]]+(query|queryq)[^|]*\|[[:space:]]*_pg_notag')" "0" \
   "pg_q/pg_qq do not pipe psql through a filter (which would replace its rc)"
ck A12b "$(grep -c 'return \$rc' ec/lib/pg.sh)" "2" \
   "both query helpers return the captured psql status explicitly"

# ── C-3 · installer pins the reviewed wrapper bytes ──────────────────────────
ck A13 "$(grep -cE '^EXPECTED_SHA="[0-9a-f]{64}"' ec/install-pg-admin.sh)" "1" \
   "installer embeds a FULL 64-hex SHA-256"
ck A13b "$(grep -c 'ACTUAL_SHA=\$(sha256sum "\$SRC"' ec/install-pg-admin.sh)" "1" \
   "installer hashes the exact source it will install"
ck A13c "$(awk '/ACTUAL_SHA=/{h=NR} /install -o root/{i=NR} END{print (h>0 && i>h) ? 1 : 0}' ec/install-pg-admin.sh)" "1" \
   "hash verification occurs BEFORE the privileged install"
ck A13d "$(grep -c 'EXPECTED_SHA" != "\$ACTUAL_SHA' ec/install-pg-admin.sh)" "1" \
   "mismatch is compared and aborts"
ck A13e "$(EXP=$(grep -oE '^EXPECTED_SHA="[0-9a-f]{64}"' ec/install-pg-admin.sh | grep -oE '[0-9a-f]{64}'); grep -c "$EXP" ec/PRIVILEGE.md)" "1" \
   "PRIVILEGE.md records the same full hash"
ck A13f "$(EXP=$(grep -oE '^EXPECTED_SHA="[0-9a-f]{64}"' ec/install-pg-admin.sh | grep -oE '[0-9a-f]{64}'); ACT=$(sha256sum ec/pg-admin | cut -d" " -f1); [ "$EXP" = "$ACT" ] && echo 1 || echo 0)" "1" \
   "the pinned hash matches the shipped wrapper bytes"

# ── C-4 · revocation is documented ───────────────────────────────────────────
ck A14 "$(grep -c 'rm -f /etc/sudoers.d/ec-pgadmin' ec/PRIVILEGE.md)" "1" "uninstall: sudoers removal documented"
ck A14b "$(grep -c 'rm -f /usr/local/sbin/ec-pgadmin' ec/PRIVILEGE.md)" "1" "uninstall: wrapper removal documented"

echo; echo "  artifact audit: $P PASS / $F FAIL"; [ $F -eq 0 ] || exit 1
