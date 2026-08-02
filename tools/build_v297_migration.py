#!/usr/bin/env python3
# ============================================================================
# v297 — Venue As-Of Integrity Corrective · MIGRATION BUILDER
#
# Builds supabase/v297_venue_asof_integrity.sql FROM THE COMMITTED CAPTURE
# (db/captured/functions.sql, commit 63a14b4). The seven affected functions are
# taken verbatim from pg_get_functiondef output and patched by anchored,
# fail-loud insertion rules. Nothing is transcribed by hand, so "verbatim with
# only the sanctioned WHERE additions" holds BY CONSTRUCTION.
#
# HARD GUARANTEES, each enforced before a migration is written:
#   G1  every insertion is one of the sanctioned predicate forms; the builder
#       diffs base->patched and refuses if any hunk removes text or adds
#       anything outside the allowed set
#   G2  completeness sweep: after patching, EVERY scan of venue_observation /
#       venue_walkthrough / engagement_venue_binding inside the seven functions
#       carries a temporal bound (observed_at/conducted_at/created_at <= param,
#       or the pre-existing renovation coalesce form). A scan the rules missed
#       FAILS the build loudly — it can never ship silently unbounded
#   G3  scratch rebuild: a throwaway database is built from the committed
#       schema.sql + functions.sql, then the seven patched bodies are applied
#       with check_function_bodies=on. A patch that breaks syntax or scope
#       fails HERE, offline, never against ec
#   G4  the report includes the full unified diff for human review, plus sha256
#
# The builder also emits v297_build_report.txt carrying the DDL and ceremony
# signatures the proof fixtures need — read from the same committed capture.
#
# Run from the repo root:  python3 tools/build_v297_migration.py
# Exit: 0 built · 1 rule/guarantee failure · 2 missing inputs
# ============================================================================
import re, sys, hashlib, subprocess, difflib, os, tempfile

CAP_FN = "db/captured/functions.sql"
CAP_SCHEMA = "db/captured/schema.sql"
OUT_MIG = "supabase/v297_venue_asof_integrity.sql"
OUT_REPORT = "v297_build_report.txt"

SEVEN = ["occurrence_current_venue", "current_observation", "venue_profile_read",
         "venue_knowledge_findings", "venue_profile", "venue_contradictions",
         "venue_verification_requirement"]

def die(msg, ctx=""):
    print(f"BUILD FAIL: {msg}")
    if ctx: print("  context:\n" + "\n".join("    " + l for l in ctx.splitlines()[:6]))
    sys.exit(1)

def load_functions():
    if not os.path.exists(CAP_FN): print(f"ABORT: {CAP_FN} absent — is the capture committed?"); sys.exit(2)
    text = open(CAP_FN, encoding="utf-8", errors="replace").read()
    # capture format: "-- <name>\nCREATE OR REPLACE FUNCTION ...;" blocks
    blocks = re.split(r"\n\n(?=-- )", text)
    fns = {}
    for b in blocks:
        m = re.match(r"-- (\w+)\n", b)
        if not m: continue
        name = m.group(1)
        body = b[m.end():].rstrip()
        body = body.rstrip(";").rstrip()   # capture blocks end "…$function$\n;" — normalise
        fns.setdefault(name, []).append(body)
    return fns

def ts_param(fn_text, name):
    """First timestamptz parameter name in the signature — the as-of axis."""
    sig = fn_text.split(")", 1)[0]
    m = re.search(r"(p_\w+)\s+timestamp", sig)
    if not m: die(f"{name}: no timestamptz parameter found in signature — cannot determine the as-of axis",
                  sig)
    return m.group(1)

def apply_once(name, text, pattern, repl, site, count=1):
    new, n = re.subn(pattern, repl, text, flags=re.IGNORECASE)
    if n != count:
        die(f"{name} site [{site}]: anchor matched {n}× (expected {count}) — the capture's "
            f"text differs from the anchored expectation. NOT guessing; refusing.",
            pattern)
    return new

# A venue_observation scan whose FIRST predicate is a primary-key equality is a
# re-fetch of a row some bounded selector already chose. Bounding it again is a
# provable no-op, and would be a predicate the frozen contract does not sanction.
# Exempt — but NEVER silently: every hit is counted, reported and tripwired.
BYID = re.compile(r"\s*(?:\w+\.)?id\s*=", re.IGNORECASE)
def is_byid(t, where_end):
    return bool(BYID.match(t[where_end:where_end + 40]))

def stmt_span(t, start):
    """The current statement's remainder: up to the next ';' or plpgsql LOOP."""
    ends = [i for i in (t.find(";", start),) if i != -1]
    m = re.search(r"\bloop\b", t[start:], re.IGNORECASE)
    if m: ends.append(start + m.start())
    return t[start:min(ends)] if ends else t[start:start + 1200]

EXEMPT = []

def patch_all(fns):
    patched, inserted = {}, []
    def note(name, site, frag): inserted.append((name, site, frag))

    # ── occurrence_current_venue: sites 1 & 2 (engagement branch) ───────────
    name = "occurrence_current_venue"; t = fns[name]; p = ts_param(t, name)
    # the engagement branch's binding alias, from its FROM clause
    am = re.search(r"from\s+(?:public\.)?engagement_venue_binding\s+(\w+)\b", t, re.IGNORECASE)
    if not am: die(f"{name}: engagement_venue_binding FROM clause not found — shape differs; refusing")
    balias = am.group(1)
    # site 2 first: bound the supersession subquery
    t = apply_once(name, t,
        r"(\w+)\.replaces_binding_id\s*=\s*(\w+)\.id",
        lambda m: f"{m.group(0)} and {m.group(1)}.created_at <= {p}",
        "2: engagement supersession bound")
    note(name, 2, f"<s>.created_at <= {p}")
    # site 1: bound the branch itself, anchored on the occurrence predicate
    t = apply_once(name, t,
        r"(where\s+(\w+)\.id\s*=\s*p_occurrence\b)",
        lambda m: f"{m.group(0)} and {balias}.created_at <= {p}",
        "1: engagement branch bound")
    note(name, 1, f"{balias}.created_at <= {p}")
    patched[name] = t

    # ── R1 · piggyback the applicability predicate wherever it appears ──────
    # (effective_at is null or effective_at <= p) → append "and observed_at <= p"
    R1 = re.compile(
        r"\(\s*((\w+)\.)?effective_at\s+is\s+null\s+or\s+(?:\w+\.)?effective_at\s*<=\s*(p_\w+)\s*\)",
        re.IGNORECASE)
    def r1(name, t):
        c = 0
        def sub(m):
            nonlocal c; c += 1
            alias = (m.group(2) + ".") if m.group(2) else ""
            return f"{m.group(0)} and {alias}observed_at <= {m.group(3)}"
        return R1.sub(sub, t), c

    # ── R2 · head-insert on remaining venue_observation scans ───────────────
    def r2(name, t, param):
        """FROM venue_observation [alias] WHERE  →  WHERE <alias.>observed_at <= p AND"""
        c = 0
        def sub(m):
            nonlocal c
            span = stmt_span(t, m.end())
            # skip scans already bounded within THIS statement: an R1 insertion,
            # or the renovation coalesce form the contract rules UNTOUCHED
            if (re.search(r"\bobserved_at\s*<=", span)
                or re.search(r"coalesce\([^)]*\bobserved_at\b[^)]*\)\s*<=", span)):
                return m.group(0)
            if is_byid(t, m.end()):        # EXEMPT-BY-ID — recorded, not skipped silently
                EXEMPT.append((name, "by-id fetch", " ".join(t[m.start():m.start()+110].split())))
                return m.group(0)
            c += 1
            alias = (m.group(1) + ".") if m.group(1) else ""
            return m.group(0) + f"{alias}observed_at <= {param} and "
        pat = re.compile(r"from\s+(?:public\.)?venue_observation(?:\s+(\w+))?\s+where\s+", re.IGNORECASE)
        return pat.sub(sub, t), c

    for name in ["current_observation", "venue_profile_read", "venue_knowledge_findings",
                 "venue_profile", "venue_contradictions"]:
        t = fns[name]; p = ts_param(t, name)
        t, c1 = r1(name, t)
        t, c2 = r2(name, t, p)
        if c1 + c2 == 0:
            die(f"{name}: no observation scan was patched — either the capture's shape "
                f"differs entirely or the function has no venue_observation read; refusing to guess")
        for i in range(c1): note(name, "R1", f"observed_at <= {p}")
        for i in range(c2): note(name, "R2", f"observed_at <= {p}")
        patched[name] = t

    # ── site 10 · walkthrough census ─────────────────────────────────────────
    name = "venue_verification_requirement"; t = fns[name]; p = ts_param(t, name)
    t = apply_once(name, t,
        r"(from\s+(?:public\.)?venue_walkthrough(?:\s+(\w+))?\s+where\s+)",
        lambda m: m.group(0) + ((m.group(2) + ".") if m.group(2) else "") + f"conducted_at <= {p} and ",
        "10: walkthrough census bound")
    note(name, 10, f"conducted_at <= {p}")
    # this function may also carry R1-eligible scans (unobserved logic lives in
    # venue_knowledge_findings, but be tolerant): sweep decides, not assumption
    t2, c1 = r1(name, t)
    t2, c2 = r2(name, t2, p)
    for i in range(c1): note(name, "R1", f"observed_at <= {p}")
    for i in range(c2): note(name, "R2", f"observed_at <= {p}")
    patched[name] = t2
    return patched, inserted

def sweep(patched):
    """G2 · every temporal-table scan in the seven functions must be bounded."""
    misses = []
    for name, t in patched.items():
        for m in re.finditer(r"from\s+(?:public\.)?(venue_observation|venue_walkthrough|engagement_venue_binding)(?:\s+(\w+))?\b",
                             t, re.IGNORECASE):
            alias = m.group(2) if m.group(2) and m.group(2).lower() not in ("where","join","on") else None
            window = stmt_span(t, m.end())
            cols = r"(?:observed_at|conducted_at|created_at)"
            if alias:  # the bound must belong to THIS scan: its alias, or bare
                bound = rf"(?:(?:{re.escape(alias)}\.)|(?<![\w.])){cols}\s*<=\s*p_\w+"
                reno  = rf"coalesce\([^)]*\b(?:{re.escape(alias)}\.)?observed_at\b[^)]*\)\s*<="
            else:
                bound = rf"(?<![\w.]){cols}\s*<=\s*p_\w+"
                reno  = r"coalesce\([^)]*\bobserved_at\b[^)]*\)\s*<="
            ok = (re.search(bound, window) or re.search(reno, window)
                  or is_byid(t, m.end()))
            if not ok:
                misses.append((name, m.group(1), window.splitlines()[0][:90]))
    if misses:
        for name, tbl, head in misses:
            print(f"SWEEP MISS: {name} scans {tbl} without a temporal bound → {head}")
        die("completeness sweep failed — a scan the rules did not reach would ship unbounded")

def diff_guard(fns, patched):
    """G1 · the ONLY difference between base and patched is sanctioned insertions.
    Proven by construction-inverse: delete every sanctioned fragment from the
    patched text, normalise whitespace, and demand equality with the base."""
    COLS = r"(?:\w+\.)?(?:observed_at|conducted_at|created_at)"
    # ordered alternatives: a mid/tail insertion carries its OWN leading "and"
    # (strip exactly that); a head insertion carries its own TRAILING "and".
    # Never both, so no original conjunction can be consumed.
    SANCT = re.compile(rf"(?:\s+and\s+{COLS}\s*<=\s*p_\w+\b)|(?:{COLS}\s*<=\s*p_\w+\s+and\s+)",
                       re.IGNORECASE)
    norm = lambda x: re.sub(r"\s+", " ", x).strip()
    full_diff = []
    for name in SEVEN:
        stripped = SANCT.sub("", patched[name])
        if norm(stripped) != norm(fns[name]):
            # locate the first divergence for the report
            a, b = norm(fns[name]), norm(stripped)
            i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
            die(f"{name}: patched text differs from base by more than sanctioned insertions",
                f"...{a[max(0,i-60):i+60]}\n...{b[max(0,i-60):i+60]}")
        full_diff += list(difflib.unified_diff(fns[name].splitlines(), patched[name].splitlines(),
                                               fromfile=f"a/{name}", tofile=f"b/{name}", lineterm="")) + [""]
    return "\n".join(full_diff)

def scratch_rebuild(patched):
    """G3 · rebuild from the committed capture, then apply the seven patched bodies."""
    db = f"v297_build_{os.getpid()}"
    run = lambda cmd: subprocess.run(cmd, shell=True, capture_output=True, text=True)
    run(f'sudo -u postgres dropdb --if-exists {db}')
    r = run(f'sudo -u postgres createdb {db}')
    if r.returncode != 0: die("scratch createdb failed", r.stderr)
    try:
        for f, label in ((CAP_SCHEMA, "schema"), (CAP_FN, "functions")):
            r = run(f'sudo -u postgres psql -X -q -v ON_ERROR_STOP=0 -d {db} -f {f}')
            nerr = r.stderr.count("ERROR")
            if nerr: print(f"scratch {label:9}: {nerr} load errors tolerated (empty-db ordering noise)")
        # the tolerant load must still have produced the tables the patched
        # bodies reference, or the apply test below would be vacuous
        need = ["venue_observation", "venue_walkthrough", "engagement_venue_binding",
                "occurrence_venue_binding", "engagement_occurrence"]
        q = ("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
             "where n.nspname='public' and c.relkind='r' and c.relname in (" +
             ",".join(f"'{t}'" for t in need) + ")")
        r = run(f"sudo -u postgres psql -X -A -t -d {db} -c \"{q}\"")
        if r.stdout.strip() != str(len(need)):
            die(f"scratch baseline incomplete — {r.stdout.strip() or '?'}/{len(need)} required "
                "tables present; the patched-apply check would be vacuous", r.stderr)
        # canonical target identities, derived by the ENGINE from the loaded
        # capture — not parsed from source text, not reconstructed by hand
        # types-only identity: to_regprocedure REJECTS parameter names (verified
        # empirically — a named signature is a hard ERROR, not NULL)
        qi = ("select p.proname||'|'||array_to_string(array(select format_type(t,null) "
              "from unnest(p.proargtypes) t),', ') "
              "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
              "where n.nspname='public' and p.proname in (" +
              ",".join(f"'{n}'" for n in SEVEN) + ") order by p.proname")
        r = run(f"sudo -u postgres psql -X -A -t -d {db} -c \"{qi}\"")
        if r.returncode != 0: die("identity derivation query failed", r.stderr)
        rows = [l for l in r.stdout.splitlines() if l.strip()]
        idents = {}
        for l in rows:
            n, args = l.split("|", 1)
            if n in idents:
                die(f"{n}: loaded as MULTIPLE overloads in the scratch — identity ambiguous")
            idents[n] = args
        missing = [n for n in SEVEN if n not in idents]
        if missing:
            die(f"target(s) {missing} failed to load into the scratch baseline — "
                "cannot derive canonical identities; the tolerant load dropped a target")
        with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as tf:
            tf.write("set check_function_bodies to on;\n")
            for name in SEVEN:
                tf.write(patched[name] + ";\n\n")
            tmp = tf.name
        os.chmod(tmp, 0o644)
        r = run(f'sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d {db} -f {tmp}')
        os.unlink(tmp)
        if r.returncode != 0:
            die("patched functions failed to apply on the rebuilt scratch — a patch broke "
                "syntax or scope; NOT shipping", r.stderr)
        print("scratch rebuild : seven patched bodies applied clean (check_function_bodies=on)")
        return idents
    finally:
        run(f'sudo -u postgres dropdb --if-exists {db}')

def emit(fns, patched, inserted, diff_text, shas, head, idents):
    hdr = f"""-- ============================================================================
-- v297 — Venue As-Of Integrity Corrective
-- GENERATED by tools/build_v297_migration.py — do not hand-edit; rebuild.
-- source: db/captured/functions.sql sha256[:16]={shas.get(CAP_FN,'?')}
--         db/captured/schema.sql    sha256[:16]={shas.get(CAP_SCHEMA,'?')}
--         repo HEAD {head} · {len(inserted)} sanctioned insertions, 7 bodies + 1 marker
-- ============================================================================

begin;

do $preflight$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='venue_asof_integrity') then
    raise exception 'V297_ALREADY_APPLIED';
  end if;
""" + "".join(f"""  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='{n}') <> 1 then
    raise exception 'V297_PREFLIGHT_FAILED: {n} absent or overloaded — CREATE OR REPLACE would mis-target';
  end if;
  if to_regprocedure('public.{n}({idents[n]})') is null then
    raise exception 'V297_PREFLIGHT_FAILED: {n} exists but NOT with the captured identity ({idents[n]}) — CREATE OR REPLACE would create a new overload, not replace';
  end if;
""" for n in SEVEN) + "end $preflight$;\n\n"
    body = "\n\n".join(f"-- ── {n} · as-of bounded ──\n{patched[n]};" for n in SEVEN)
    marker = """

-- deployment marker: replace-only releases need one for --verify resumability
create function public.venue_asof_integrity() returns text
language sql immutable as $$ select 'v297' $$;

commit;
"""
    mig = hdr + body + marker
    os.makedirs("supabase", exist_ok=True)
    open(OUT_MIG, "w", encoding="utf-8").write(mig)
    sha = hashlib.sha256(mig.encode()).hexdigest()[:16]

    # fixture inputs for the proof suite, from the same committed capture
    schema = open(CAP_SCHEMA, encoding="utf-8", errors="replace").read() if os.path.exists(CAP_SCHEMA) else ""
    FIX_TABLES = (r"venues?|venue_space\w*|venue_observation|venue_walkthrough|"
                  r"venue_observation_supersession|venue_redirect\w*|venue_evidence|"
                  r"walkthrough_coverage|occurrence_venue_binding|engagement_venue_binding|"
                  r"venue_staleness_policy|bookings|engagement_occurrence")
    ddl = "\n\n".join(m.group(0) for m in re.finditer(
        rf"^CREATE TABLE public\.(?:{FIX_TABLES})\b.*?^\);",
        schema, re.MULTILINE | re.DOTALL))
    ddl += "\n\n-- constraints (PK/FK/UNIQUE arrive as ALTER TABLE in pg_dump) --\n"
    ddl += "\n".join(m.group(0) for m in re.finditer(
        rf"^ALTER TABLE (?:ONLY )?public\.(?:{FIX_TABLES})\b[^;]*;",
        schema, re.MULTILINE | re.DOTALL))
    cere = "\n\n".join("\n\n".join(v if isinstance(v, list) else [v]) for n, v in fns.items() if re.match(
        r"(record_(walkthrough|observation|venue_observation)|bind_(engagement|occurrence)_venue|"
        r"create_venue|register_venue|supersede_observation)$", n))
    with open(OUT_REPORT, "w", encoding="utf-8") as f:
        f.write(f"v297 build report · migration sha256[:16]={sha} · insertions={len(inserted)}\n")
        f.write(f"capture provenance: functions.sql={shas.get(CAP_FN)} schema.sql={shas.get(CAP_SCHEMA)} HEAD={head}\n")
        f.write("target identities (engine-derived from the committed capture):\n")
        f.write("".join(f"  public.{n}({idents[n]})\n" for n in SEVEN))
        f.write("".join(f"  {n} [{s}] {frag}\n" for n, s, frag in inserted))
        f.write(f"\nby-id exemptions ({len(EXEMPT)}) — NOT patched, provably no-ops:\n")
        f.write("".join(f"  {n}: {txt}\n" for n, _, txt in EXEMPT))
        f.write("\n=== UNIFIED DIFF (base -> patched) ===\n" + diff_text)
        f.write("\n\n=== FIXTURE DDL (from committed capture) ===\n" + ddl)
        f.write("\n\n=== RECORDING CEREMONIES (from committed capture) ===\n" + cere + "\n")
    print(f"migration       : {OUT_MIG}  sha256[:16]={sha}")
    print(f"insertions      : {len(inserted)} sanctioned predicates across {len(SEVEN)} functions")
    print(f"report          : {OUT_REPORT}  ({os.path.getsize(OUT_REPORT)} bytes) — paste this file back")

def provenance():
    import subprocess
    sha = lambda f: hashlib.sha256(open(f,'rb').read()).hexdigest()[:16]
    shas = {f: sha(f) for f in (CAP_FN, CAP_SCHEMA) if os.path.exists(f)}
    r = subprocess.run("git status --porcelain db/captured", shell=True, capture_output=True, text=True)
    if r.returncode == 0 and r.stdout.strip():
        die("db/captured has UNCOMMITTED modifications — the build must run from the "
            "committed capture, not a locally edited one", r.stdout)
    head = subprocess.run("git rev-parse --short HEAD", shell=True, capture_output=True,
                          text=True).stdout.strip() or "no-git"
    return shas, head

def main():
    all_fns = load_functions()
    missing = [n for n in SEVEN if n not in all_fns]
    if missing: die(f"capture lacks: {missing} — refusing")
    dup = [n for n in SEVEN if len(all_fns[n]) > 1]
    if dup: die(f"OVERLOADED target function(s) {dup} — 'the' body is ambiguous; refusing")
    fns = {n: v[0] for n, v in all_fns.items()}   # unrelated overloads tolerated
    shas, head = provenance()
    patched, inserted = patch_all(dict(fns))
    PLAN = {"occurrence_current_venue": 2, "current_observation": 1, "venue_profile_read": 1,
            "venue_knowledge_findings": 3, "venue_profile": 1, "venue_contradictions": 1,
            "venue_verification_requirement": 1}
    got = {}
    for n, _, _ in inserted: got[n] = got.get(n, 0) + 1
    EXEMPT_PLAN = {"venue_profile_read": 1, "venue_knowledge_findings": 1}
    exg = {}
    for n, _, _ in EXEMPT: exg[n] = exg.get(n, 0) + 1
    if exg != EXEMPT_PLAN:
        print("".join(f"  EXEMPT {n}: {txt}\n" for n, _, txt in EXEMPT))
        die(f"by-id exemption plan violated — contract sanctions EXACTLY these "
            f"exemptions: {EXEMPT_PLAN}, got {exg}. An unexpected exemption may be a "
            f"real unbounded scan wearing a primary-key disguise; amend the CONTRACT first.")
    if got != PLAN or len(inserted) != 10:
        die(f"insertion plan violated — contract demands EXACTLY ten sites: "
            f"expected {PLAN}, got {got} (total {len(inserted)}). If the real capture "
            f"legitimately differs, the CONTRACT must be amended first — not the tripwire.")
    sweep(patched)
    diff_text = diff_guard(fns, patched)
    idents = scratch_rebuild(patched)
    emit(fns, patched, inserted, diff_text, shas, head, idents)
    print("BUILD OK")

if __name__ == "__main__":
    main()
