# ============================================================================
# ec/lib/pg.sh — the ONLY way EventCore scripts reach PostgreSQL.
# Source this; never call psql/createdb/dropdb or sudo directly again.
#
#   pg_capability            -> 0 usable, 1 unavailable (prints nothing on success)
#   pg_require               -> capability gate; prints BEN ACTION REQUIRED and exits 78
#   pg_q   <db> <sql>        -> strict query; returns psql's exit status
#   pg_qq  <db> <sql>        -> tolerant query; output captured, rc=65 on SQL error
#   pg_file <db> <path>      -> run a repo SQL file
#   pg_stdin <db> < file     -> run SQL from stdin (ephemeral race harness SQL)
#   pg_exists <db>           -> "1"/"0"
#   pg_clone <src> <dst>     -> clone
#   pg_drop <db>             -> drop (never fails the caller)
#
# NOTHING here runs as root. The single privileged call is
#   sudo -n -u postgres /usr/local/sbin/ec-pgadmin ...
# and -n guarantees it can never prompt.
# ============================================================================
EC_PGADMIN="${EC_PGADMIN:-/usr/local/sbin/ec-pgadmin}"
EC_SUDO="${EC_SUDO:-sudo -n -u postgres}"

# psql -A -t still prints command tags; every helper strips them
_pg_notag() { grep -vE '^(INSERT|UPDATE|DELETE|SELECT|COPY) [0-9]+' | grep -v '^$'; }
_pg() { $EC_SUDO "$EC_PGADMIN" "$@"; }

pg_capability() { _pg capability >/dev/null 2>&1; }

pg_require() {
  if pg_capability; then return 0; fi
  cat >&2 <<'MSG'

BEN ACTION REQUIRED — PostgreSQL certification privilege is unavailable.

Certification cannot run noninteractively until the one-time setup below is
performed. Nothing else is required afterwards, and no password is stored.

  Run ONCE, in WSL, as a user who can sudo interactively:

    cd /mnt/c/Users/bbgro/Downloads/eventspace-deploy && sudo bash ec/install-pg-admin.sh

  Then re-run certification. To verify by hand:

    sudo -n -u postgres /usr/local/sbin/ec-pgadmin capability

MSG
  exit 78
}

# EXIT-CODE CONTRACT (C-1). Output filtering must never replace psql's status,
# so output is captured first and the rc is returned explicitly. A pipeline would
# yield grep's status instead — which both MASKED failures (invalid SQL -> 0) and
# INVERTED success (zero rows -> 1).
pg_q() {
  local out rc
  out=$(_pg query "$1" "$2" 2>&1); rc=$?
  printf '%s\n' "$out" | _pg_notag
  return $rc
}

# Tolerant variant. psql runs with ON_ERROR_STOP=0 so that every statement is
# attempted and all diagnostics are captured; psql then exits 0 even when a
# statement failed. A SQL error is therefore detected from the captured text and
# surfaced as rc=65, while the output itself is unchanged — callers that read
# text (e.g. matching a named refusal) are unaffected.
pg_qq() {
  local out rc
  out=$(_pg queryq "$1" "$2" 2>&1); rc=$?
  printf '%s\n' "$out" | _pg_notag
  if [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -qE '(^|[[:space:]])ERROR:'; then
    return 65
  fi
  return $rc
}
pg_file()   { _pg sqlfile "$1" "$2"; }
pg_stdin()  { _pg sqlstdin "$1"; }            # SQL on stdin — for race harnesses
pg_exists() { _pg exists  "$1" 2>/dev/null | head -1; }
pg_clone()  { _pg clone   "$1" "$2"; }
pg_drop()   { _pg drop    "$1" >/dev/null 2>&1 || true; }
