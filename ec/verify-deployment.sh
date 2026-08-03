#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# EventCore — DEPLOYMENT CERTIFICATION  (v299)
#
# Proves a TARGET DATABASE is at the architectural level a release requires,
# before that release is called deployable.
#
#   ./ec/verify-deployment.sh v299 --db ec        verify the local certification db
#   ./ec/verify-deployment.sh v299 --url          verify $EC_TARGET_DB_URL
#   ./ec/verify-deployment.sh v299 --emit-sql     print the check, run it yourself
#   ./ec/verify-deployment.sh v299 --grade f.txt  grade output pasted back
#
# READ-ONLY BY CONSTRUCTION. It issues exactly one SELECT against catalog views.
# It creates nothing, alters nothing, drops nothing, and never reloads a schema
# cache. `--emit-sql` exists because the production database is reachable only
# through the Supabase SQL Editor: the check must be runnable where the operator
# is, not only where the harness is.
#
# WHY THIS EXISTS
#   v294 was certified green against `ec` and deployed to production without its
#   migration. Every gate passed; none of them looked at the database that
#   serves users. The first symptom was PGRST202 in front of an operator.
#
# PROVENANCE (v299 · Fable M-3)
#   The emitted SQL carries provenance rows identifying the database, the moment
#   of execution, the requested release, and digests of the verifier and of the
#   manifest chain. `--grade` REQUIRES those rows and rejects a result that
#   belongs to a different release, a different manifest set, a different
#   verifier, a local certification database, or a stale execution. A filename
#   proves nothing and is never trusted.
#
# Exit: 0 every required object present · 1 something missing or evidence
#       rejected · 2 usage/setup error (including an unknown manifest key)
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
MANIFEST_DIR="${EC_DEPLOY_MANIFESTS:-$HERE/deploy-manifests}"
SELF="${BASH_SOURCE[0]}"

# Freshness rule (v299 · Fable M-3). Documented, overridable only with a reason.
EVIDENCE_MAX_AGE_DAYS="${EC_EVIDENCE_MAX_AGE_DAYS:-14}"

usage() {
  cat <<'HELPTEXT'
EventCore deployment certification

    ec/verify-deployment.sh <release> [target]

TARGETS
    --db <name>      a local database reachable through ec/lib/pg.sh (default: ec)
    --url            connect using $EC_TARGET_DB_URL via psql; the variable is
                     read, never printed, never stored
    --emit-sql       print the read-only check and exit; paste it into the
                     Supabase SQL Editor for a database this host cannot reach
    --grade <file>   grade output pasted back from --emit-sql. Provenance rows
                     are REQUIRED; a result without them is rejected.

OPTIONS
    --manifest-dir <dir>   override ec/deploy-manifests
    --quiet                print only the verdict line. Setup failures (an
                           unknown manifest key, a rejected evidence file) are
                           ALWAYS printed — --quiet never hides a refusal.
    -h, --help             this text

PROVENANCE AND FRESHNESS (--grade)
    The evidence must carry: release, manifest_digest, verifier_digest,
    object_count, executed_at, database. Grading fails when
      · the release does not match the release being verified
      · the manifest or verifier digest does not match the current files
      · the object count or row count is short (a truncated paste)
      · the database name looks like a local certification database (ec, ec_*)
      · executed_at is older than EC_EVIDENCE_MAX_AGE_DAYS (default 14)
    A stale result may be accepted only with an explicit human override:
      EC_EVIDENCE_OVERRIDE_REASON="..."   — the reason is printed in the report.

EXIT
    0  passed
    1  failed — objects missing, or evidence rejected
    2  usage or setup error, including an unknown manifest key
HELPTEXT
}

die() { printf 'verify-deployment: %s\n' "$1" >&2; exit "${2:-2}"; }

# ── arguments ──────────────────────────────────────────────────────────────
RELEASE=""; MODE="db"; DB="ec"; GRADE_FILE=""; QUIET=0
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)      usage; exit 0 ;;
    --db)           MODE="db";  DB="${2:-}"; [ -n "$DB" ] || die "--db needs a name"; shift 2 ;;
    --url)          MODE="url"; shift ;;
    --emit-sql)     MODE="emit"; shift ;;
    --grade)        MODE="grade"; GRADE_FILE="${2:-}"; [ -n "$GRADE_FILE" ] || die "--grade needs a file"; shift 2 ;;
    --manifest-dir) MANIFEST_DIR="${2:-}"; shift 2 ;;
    --quiet)        QUIET=1; shift ;;
    -*)             die "unknown option: $1" ;;
    *)              [ -z "$RELEASE" ] || die "unexpected argument: $1"; RELEASE="$1"; shift ;;
  esac
done
[ -n "$RELEASE" ] || { usage >&2; die "no release given"; }
[ -d "$MANIFEST_DIR" ] || die "no manifest directory: $MANIFEST_DIR"

say()  { [ "$QUIET" -eq 1 ] || printf '%s\n' "$*"; }
# always printed, even under --quiet: a refusal must never be silent
loud() { printf '%s\n' "$*"; }

# ── manifest reading ───────────────────────────────────────────────────────
mf_all() { awk -v k="$2" '$1==k { $1=""; sub(/^[ \t]+/,""); sub(/[ \t]+$/,""); if (length($0)) print }' "$1"; }
mf_one() { mf_all "$1" "$2" | head -1; }

CHAIN=""
resolve_chain() {
  local rel="$1" seen="" f prev
  while [ -n "$rel" ]; do
    case " $seen " in *" $rel "*) die "manifest cycle detected at $rel" ;; esac
    seen="$seen $rel"
    f="$MANIFEST_DIR/$rel.deploy"
    [ -f "$f" ] || die "no deployment manifest for '$rel' (looked for $f). Every release from v292a forward must declare one — see ec/deploy-manifests/README.md"
    CHAIN="$rel $CHAIN"
    prev="$(mf_one "$f" min_release)"
    rel="$prev"
  done
}
resolve_chain "$RELEASE"

# ── collect requirements; an unknown key is a HARD FAILURE (Fable M-1) ─────
# A typo like `functoin` silently drops a requirement, which is precisely the
# class of quiet weakening this guard exists to prevent. It is a setup error,
# it is reported through loud(), and --quiet cannot suppress it.
REQ=""
KNOWN_KEYS="release migration migration_source min_release function table view index trigger policy superseded"
BAD_KEYS=""
for rel in $CHAIN; do
  f="$MANIFEST_DIR/$rel.deploy"
  while IFS= read -r key; do
    case " $KNOWN_KEYS " in *" $key "*) ;; *) BAD_KEYS="$BAD_KEYS
  $rel.deploy: $key" ;; esac
  done < <(awk '!/^[[:space:]]*#/ && NF { print $1 }' "$f" | sort -u)
done
if [ -n "$BAD_KEYS" ]; then
  loud ""
  loud "MANIFEST ERROR — unrecognised key(s):$BAD_KEYS"
  loud ""
  loud "An unknown key is never ignored: a misspelled key silently drops a"
  loud "requirement, and a guard that drops requirements quietly is worse than no"
  loud "guard. Valid keys: $KNOWN_KEYS"
  exit 2
fi
for rel in $CHAIN; do
  f="$MANIFEST_DIR/$rel.deploy"
  for kind in function table view index trigger policy; do
    while IFS= read -r name; do
      [ -n "$name" ] && REQ="$REQ$kind	$name	$rel"$'\n'
    done < <(mf_all "$f" "$kind")
  done
done
REQ_COUNT="$(printf '%s' "$REQ" | grep -c . || true)"

# ── digests · bind evidence to the exact manifests and verifier ────────────
digest_of() { sha256sum "$@" 2>/dev/null | awk '{print $1}' | sha256sum | cut -c1-32; }
MANIFEST_FILES=""
for rel in $CHAIN; do MANIFEST_FILES="$MANIFEST_FILES $MANIFEST_DIR/$rel.deploy"; done
# shellcheck disable=SC2086
MANIFEST_DIGEST="$(cat $MANIFEST_FILES | sha256sum | cut -c1-32)"
VERIFIER_DIGEST="$(sha256sum "$SELF" | cut -c1-32)"

# ── build the single read-only query ───────────────────────────────────────
sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }

build_sql() {
  local values="" first=1 kind name rel
  while IFS=$'\t' read -r kind name rel; do
    [ -z "$kind" ] && continue
    [ "$first" -eq 1 ] && first=0 || values="$values,"
    values="$values('$(sql_escape "$kind")','$(sql_escape "$name")')"
  done <<< "$REQ"

  cat <<SQL
select 'provenance|release|$(sql_escape "$RELEASE")'
union all select 'provenance|manifest_digest|$MANIFEST_DIGEST'
union all select 'provenance|verifier_digest|$VERIFIER_DIGEST'
union all select 'provenance|object_count|$REQ_COUNT'
union all select 'provenance|chain|$(sql_escape "$CHAIN")'
union all select 'provenance|executed_at|' || now()::text
union all select 'provenance|database|' || current_database()
union all select 'provenance|db_user|' || current_user
union all select 'provenance|server_addr|' || coalesce(host(inet_server_addr()), 'unix-socket')
union all select 'provenance|server_version|' || current_setting('server_version')
union all select 'provenance|postmaster_start|' || pg_postmaster_start_time()::text
union all
select k.kind || '|' || k.name || '|' ||
  case k.kind
    when 'function' then
      case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.prokind = 'f'
                           and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = k.name)
           then 'PRESENT' else 'MISSING' end
    when 'table' then
      case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = k.name
                           and table_type = 'BASE TABLE')
           then 'PRESENT' else 'MISSING' end
    when 'view' then
      case when exists (select 1 from information_schema.views
                         where table_schema = 'public' and table_name = k.name)
           then 'PRESENT' else 'MISSING' end
    when 'index' then
      case when exists (select 1 from pg_indexes
                         where schemaname = 'public' and indexname = k.name)
           then 'PRESENT' else 'MISSING' end
    when 'trigger' then
      case when exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                          join pg_namespace n on n.oid = c.relnamespace
                         where n.nspname = 'public' and not t.tgisinternal
                           and c.relname || ':' || t.tgname = k.name)
           then 'PRESENT' else 'MISSING' end
    when 'policy' then
      case when exists (select 1 from pg_policies
                         where schemaname = 'public' and tablename || ':' || policyname = k.name)
           then 'PRESENT' else 'MISSING' end
    else 'UNKNOWN-KIND'
  end
from (values $values) as k(kind, name)
order by 1;
SQL
}

[ "$REQ_COUNT" -gt 0 ] || die "the chain [$CHAIN] declares no objects to verify — a manifest is empty or malformed"
SQL="$(build_sql)"

if [ "$MODE" = "emit" ]; then
  printf -- '-- EventCore deployment certification · release %s\n' "$RELEASE"
  printf -- '-- chain: %s\n' "$CHAIN"
  printf -- '-- %s object(s) + 11 provenance rows. READ-ONLY: one SELECT over catalog views.\n' "$REQ_COUNT"
  printf -- '-- manifest_digest %s   verifier_digest %s\n' "$MANIFEST_DIGEST" "$VERIFIER_DIGEST"
  printf -- '-- Save the COMPLETE result — provenance rows included — and grade it:\n'
  printf -- '--   ec/verify-deployment.sh %s --grade <file>\n\n' "$RELEASE"
  printf '%s\n' "$SQL"
  exit 0
fi

# ── run it ─────────────────────────────────────────────────────────────────
OUT=""; RC=0; TARGET=""
case "$MODE" in
  db)
    # shellcheck disable=SC1090
    . "$HERE/lib/pg.sh"
    pg_capability || die "PostgreSQL certification privilege unavailable — see ec/PRIVILEGE.md"
    OUT="$(pg_q "$DB" "$SQL")"; RC=$?
    [ "$RC" -eq 0 ] || die "catalog query failed against '$DB' (rc=$RC): $OUT"
    TARGET="local database '$DB'"
    ;;
  url)
    [ -n "${EC_TARGET_DB_URL:-}" ] || die "EC_TARGET_DB_URL is not set. Export it for this command only; it is never stored or printed."
    command -v psql >/dev/null 2>&1 || die "psql not found on PATH"
    OUT="$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$EC_TARGET_DB_URL" -c "$SQL" 2>&1)"; RC=$?
    [ "$RC" -eq 0 ] || die "catalog query failed against the URL target (rc=$RC): $OUT"
    TARGET="\$EC_TARGET_DB_URL (value not printed)"
    ;;
  grade)
    [ -f "$GRADE_FILE" ] || die "no such file: $GRADE_FILE"
    OUT="$(sed 's/\r$//' "$GRADE_FILE" \
          | sed -e 's/^"//' -e 's/"$//' -e 's/","/|/g' -e 's/\t/|/g' \
          | grep -E '^(provenance\||[a-z]+\|.*\|(PRESENT|MISSING|UNKNOWN-KIND))')"
    [ -n "$OUT" ] || die "no gradeable rows in $GRADE_FILE — expected provenance rows and kind|name|status rows" 1
    TARGET="pasted evidence: $GRADE_FILE"
    ;;
esac

# ── provenance · required for --grade, reported for every mode (M-3) ───────
prov() { printf '%s\n' "$OUT" | awk -F'|' -v k="$2" '$1=="provenance" && $2==k { sub(/^provenance\|[^|]*\|/,""); print; exit }'; }
P_RELEASE="$(prov "$OUT" release)"
P_MANIFEST="$(prov "$OUT" manifest_digest)"
P_VERIFIER="$(prov "$OUT" verifier_digest)"
P_COUNT="$(prov "$OUT" object_count)"
P_EXECUTED="$(prov "$OUT" executed_at)"
P_DATABASE="$(prov "$OUT" database)"
P_USER="$(prov "$OUT" db_user)"
P_ADDR="$(prov "$OUT" server_addr)"
P_SERVERV="$(prov "$OUT" server_version)"

if [ "$MODE" = "grade" ]; then
  reject() { loud ""; loud "EVIDENCE REJECTED — $1"; loud ""; loud "DEPLOYMENT CERTIFICATION FAILED"; exit 1; }

  [ -n "$P_RELEASE" ]  || reject "no provenance rows. This result did not come from --emit-sql, or the provenance rows were not copied. A filename is not evidence."
  [ -n "$P_MANIFEST" ] || reject "provenance is incomplete: manifest_digest missing"
  [ -n "$P_VERIFIER" ] || reject "provenance is incomplete: verifier_digest missing"
  [ -n "$P_COUNT" ]    || reject "provenance is incomplete: object_count missing"
  [ -n "$P_EXECUTED" ] || reject "provenance is incomplete: executed_at missing"
  [ -n "$P_DATABASE" ] || reject "provenance is incomplete: database missing"

  [ "$P_RELEASE" = "$RELEASE" ] || \
    reject "this result is for release '$P_RELEASE', not '$RELEASE'"
  [ "$P_MANIFEST" = "$MANIFEST_DIGEST" ] || \
    reject "manifest digest mismatch — the manifests changed since this result was produced (evidence $P_MANIFEST, current $MANIFEST_DIGEST). Re-run --emit-sql against the target."
  [ "$P_VERIFIER" = "$VERIFIER_DIGEST" ] || \
    reject "verifier digest mismatch — ec/verify-deployment.sh changed since this result was produced (evidence $P_VERIFIER, current $VERIFIER_DIGEST). Re-run --emit-sql against the target."
  [ "$P_COUNT" = "$REQ_COUNT" ] || \
    reject "object count mismatch — evidence declares $P_COUNT objects, the chain requires $REQ_COUNT"

  GRADED_ROWS="$(printf '%s\n' "$OUT" | grep -cE '\|(PRESENT|MISSING|UNKNOWN-KIND)$' || true)"
  [ "$GRADED_ROWS" = "$REQ_COUNT" ] || \
    reject "incomplete paste — $GRADED_ROWS object rows present, $REQ_COUNT expected. Copy the COMPLETE result set."

  case "$P_DATABASE" in
    ec|ec_*) reject "the evidence was produced against '$P_DATABASE', a LOCAL certification database. Local output can never stand in for production evidence." ;;
  esac

  # Freshness. Documented rule: EC_EVIDENCE_MAX_AGE_DAYS (default 14). An older
  # result may be accepted only with a human-supplied reason, which is printed.
  EV_EPOCH="$(date -d "$P_EXECUTED" +%s 2>/dev/null || true)"
  [ -n "$EV_EPOCH" ] || reject "executed_at is not a parsable timestamp: '$P_EXECUTED'"
  AGE_DAYS=$(( ( $(date +%s) - EV_EPOCH ) / 86400 ))
  [ "$AGE_DAYS" -ge 0 ] || reject "executed_at is in the future: '$P_EXECUTED'"
  if [ "$AGE_DAYS" -gt "$EVIDENCE_MAX_AGE_DAYS" ]; then
    [ -n "${EC_EVIDENCE_OVERRIDE_REASON:-}" ] || \
      reject "evidence is ${AGE_DAYS} days old; the freshness rule allows ${EVIDENCE_MAX_AGE_DAYS}. Re-run --emit-sql, or set EC_EVIDENCE_OVERRIDE_REASON=\"...\" to accept it deliberately."
    loud "EVIDENCE OVERRIDE — ${AGE_DAYS} days old, accepted because: ${EC_EVIDENCE_OVERRIDE_REASON}"
  fi
fi

# ── report ─────────────────────────────────────────────────────────────────
say ""
say "EventCore deployment certification"
say "  release : $RELEASE"
say "  chain   : $CHAIN"
say "  target  : $TARGET"
say "  required: $REQ_COUNT object(s)"
if [ -n "$P_DATABASE" ]; then
  say "  evidence: database=$P_DATABASE user=${P_USER:-?} addr=${P_ADDR:-?} pg=${P_SERVERV:-?}"
  say "            executed_at=${P_EXECUTED:-?}"
  say "            manifest_digest=$MANIFEST_DIGEST verifier_digest=$VERIFIER_DIGEST"
fi
say ""

PASS=0; FAIL=0; MISSING_LIST=""
while IFS=$'\t' read -r kind name rel; do
  [ -z "$kind" ] && continue
  status="$(printf '%s\n' "$OUT" | awk -F'|' -v k="$kind" -v n="$name" '$1==k && $2==n { print $3; exit }')"
  case "$status" in
    PRESENT) PASS=$((PASS+1)); say "PASS  $kind $name" ;;
    MISSING) FAIL=$((FAIL+1)); say "FAIL  $kind $name   [required by $rel]"
             MISSING_LIST="$MISSING_LIST$rel	$kind	$name"$'\n' ;;
    "")      FAIL=$((FAIL+1)); say "FAIL  $kind $name   [NOT REPORTED by the target — incomplete result set]"
             MISSING_LIST="$MISSING_LIST$rel	$kind	$name (not reported)"$'\n' ;;
    *)       FAIL=$((FAIL+1)); say "FAIL  $kind $name   [unexpected status: $status]" ;;
  esac
done <<< "$REQ"

say ""
say "  present: $PASS    missing: $FAIL"
say ""
if [ "$FAIL" -eq 0 ]; then
  printf 'DEPLOYMENT CERTIFICATION PASSED\n'
  exit 0
fi

printf 'DEPLOYMENT CERTIFICATION FAILED\n'
if [ "$QUIET" -eq 0 ]; then
  printf '\nThe target database is BELOW the level %s requires. Missing, oldest release first:\n\n' "$RELEASE"
  printf '%s' "$MISSING_LIST" | sort | awk -F'\t' '{ printf "  %-8s %-9s %s\n", $1, $2, $3 }'
  printf '\nThe release is NOT deployable against this target. Apply the migrations for\n'
  printf 'the releases named above, in chain order, then re-run this check.\n'
fi
exit 1
