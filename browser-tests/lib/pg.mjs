// ============================================================================
// v301 — THE PostgreSQL TRANSPORT for browser acceptance suites.
//
// ONE implementation, consumed by every suite that needs a database. Before
// this there were four: `su postgres -c psql -f <tmpfile>` (three suites),
// `sudo -u postgres sh -c` (one), and two divergent ec-pgadmin copies. The first
// two require root and could never run under the certification harness — that
// is what failed v300's gate 14, and it is why `certify-release.sh v294` cannot
// pass today with accept-day-sheet in its browser_regress list.
//
// ── WHY ec-pgadmin AND NOTHING ELSE ────────────────────────────────────────
// The v298a privilege model grants exactly one non-interactive escalation:
//   sudo -n -u postgres /usr/local/sbin/ec-pgadmin <closed verb> ...
// Verified: `sudo -n -u postgres true` → "a password is required"; only the
// wrapper answers. So the transport uses three of its closed verbs — `clone`,
// `drop`, `sqlstdin` — and asks for no wider grant. SQL travels on STDIN, which
// also retires the old habit of writing fixture SQL to a world-readable
// /tmp/*.sql (chmod 644) where any local user could read it.
//
// ── THE ON_ERROR_STOP TRAP (the reason this file is careful) ───────────────
// `ec-pgadmin sqlstdin` runs psql with ON_ERROR_STOP=0, so psql EXITS 0 even
// when a statement raises. A transport that trusted the exit code would turn
// every ceremony REFUSAL into a silently passing test — the opposite of what
// these suites exist to prove. The ON_ERROR_STOP=1 contract is therefore
// restored explicitly: any ERROR: on stderr throws.
//
// The thrown Error ALWAYS carries `.stderr`. That is load-bearing, not tidy:
// the suites' /rpc handlers read `e.stderr` to render a refusal verbatim, and
// claims like PR-7 (PROMISE_REASON_REQUIRED) and PR-8 (PROMISE_UNCHANGED)
// pass only because the refusal text survives the round trip.
//
// ── CLEANUP IS REGISTERED, NOT APPENDED ────────────────────────────────────
// Every prior suite dropped its fixture database on the LAST line, so any throw
// before that leaked a database. makeFixtureDb registers the drop on `exit` and
// SIGINT, so the clone is reclaimed however the suite ends.
// ============================================================================
import { spawnSync } from "child_process";

/** Overridable so proofs can point at a stub wrapper. The negative controls in
 *  proofs/v301_proofs.sh depend on this: without it there is no way to prove
 *  the transport reports a broken wrapper as a transport failure. */
export const PGADMIN = process.env.EC_PGADMIN ?? "/usr/local/sbin/ec-pgadmin";

const MAX_BUFFER = 64 * 1024 * 1024;
const argv = (...a) => ["-n", "-u", "postgres", PGADMIN, ...a];

/** psql prints `psql:<file>:<line>: ERROR: ...`; a bare `ERROR:` can also begin
 *  the line. Both forms must be caught, and neither must catch a NOTICE. */
const ERROR_RE = /(?:^|:\s)ERROR:/m;

const fail = (message, stderr) => {
  const e = new Error(message);
  e.stderr = stderr ?? "";
  return e;
};

/** A closed verb: capability · version · exists · clone · drop · query ·
 *  queryq · sqlfile · sqlstdin. Anything else the wrapper refuses by name. */
export function pg(verb, ...args) {
  const r = spawnSync("sudo", argv(verb, ...args), {
    encoding: "utf8", maxBuffer: MAX_BUFFER,
  });
  if (r.error) throw r.error;                       // ENOENT etc — the real cause
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || `exit ${r.status}`).trim();
    throw fail(`ec-pgadmin ${verb}: ${detail}`, r.stderr);
  }
  return (r.stdout || "").trim();
}

/** Run SQL against `db`. Returns trimmed stdout. THROWS on any PostgreSQL
 *  ERROR, restoring ON_ERROR_STOP=1 semantics over a channel that does not
 *  provide them, with `.stderr` preserved for the caller. */
export function psql(sql, db) {
  if (!db) throw new Error("psql: no database — call makeFixtureDb() first");
  const r = spawnSync("sudo", argv("sqlstdin", db), {
    input: sql, encoding: "utf8", maxBuffer: MAX_BUFFER,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw fail((r.stderr || r.stdout || `sqlstdin exited ${r.status}`).trim(), r.stderr);
  }
  const stderr = r.stderr || "";
  if (ERROR_RE.test(stderr)) throw fail(stderr.trim(), stderr);   // ← the contract
  return (r.stdout || "").trim();
}

/** Build a disposable fixture database as a clone of `from`, and guarantee it
 *  is reclaimed. Returns a `psql` already bound to it, so call sites read
 *  exactly as they did before: psql(`select ...`).
 *
 *  `capability` runs first so a privilege failure is reported as a privilege
 *  failure rather than surfacing later as an inexplicable SQL error. */
export function makeFixtureDb(db, { from = "ec" } = {}) {
  pg("capability");
  pg("drop", db);
  pg("clone", from, db);

  let dropped = false;
  const drop = () => {
    if (dropped) return;
    dropped = true;
    try { pg("drop", db); } catch { /* teardown must never mask a test failure */ }
  };
  process.on("exit", drop);
  process.on("SIGINT", () => { drop(); process.exit(130); });

  return { db, drop, pg, psql: (sql, target = db) => psql(sql, target) };
}
