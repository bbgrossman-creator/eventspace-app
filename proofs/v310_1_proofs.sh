#!/usr/bin/env bash
# ============================================================================
# v310.1 · TENANT INTEGRITY TERMINAL NORMALIZATION — one-shot structural proofs
#
# The STRUCTURAL half. The behavioural half — a default-driven insert adopts the
# acting tenant, and the repair predicate converges a mis-tenanted version while
# sparing a correct sibling — is supabase/tests/v310_1_permanent_proof.sql.
# v306…v310 run as regressions, because v310.1 moves no authority, no ceremony
# and no projection.
#
# Every assertion here is PREDECESSOR-AGNOSTIC. The certification database
# reaches v310.1 with three of the four tenant_id columns ABSENT (the guarded
# historical blocks never fired for want of a burger-bar tenant), while
# production reaches it with the columns PRESENT carrying the literal-default
# defect. Both must converge, so the invariants are stated as before/after
# comparisons rather than as fixed numbers wherever the predecessor can differ.
#
#   UT-1  the v310.1 marker is installed; v306…v310 markers intact
#   UT-2  all four tenant_id defaults call current_tenant_id()
#   UT-3  RECURRENCE GUARD · no tenant_id column in public defaults to a
#         hardcoded uuid literal
#   UT-4  all four surfaces carry tenant_id with the canonical tenants(id) FK
#   UT-5  zero proposal_versions contradict their parent, and no row was
#         created or destroyed by the repair
#   UT-6  BOUNDED · no table/index/trigger/policy/grant/type DDL; exactly four
#         add-column and four set-default statements
#   UT-7  tenant isolation preserved · RLS posture and policy count unchanged
#         across the migration
# ============================================================================
set -uo pipefail
cd /mnt/c/Users/bbgro/Downloads/eventspace-deploy
. ec/lib/pg.sh

P=0; F=0
ok()  { P=$((P+1)); printf '  PASS  %-6s %s\n' "$1" "$2"; }
bad() { F=$((F+1)); printf '  FAIL  %-6s %s\n' "$1" "$2"; }
chk() { [ "$2" = "$3" ] && ok "$1" "$4" || bad "$1" "$4 — expected [$3] got [$2]"; }

FOUR="'proposal_versions','photo_library','publication_themes','blueprints'"

C=ec_v310_1p_$$
pg_drop "$C" >/dev/null 2>&1
pg_clone "${EC_PROOF_SRC:-ec}" "$C" >/dev/null 2>&1 || { echo "ABORT: clone failed"; exit 1; }
trap 'pg_drop "$C" >/dev/null 2>&1' EXIT

# ── predecessor fingerprint, captured BEFORE the migration ──────────────────
PV_BEFORE=$(pg_q "$C" "select count(*)::text from public.proposal_versions")
RLS_BEFORE=$(pg_q "$C" "select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ($FOUR) and c.relrowsecurity")
POL_BEFORE=$(pg_q "$C" "select count(*)::text from pg_policies where schemaname='public' and tablename in ($FOUR)")
COL_BEFORE=$(pg_q "$C" "select count(*)::text from information_schema.columns where table_schema='public' and column_name='tenant_id' and table_name in ($FOUR)")

HAS=$(pg_q "$C" "select count(*)::text from pg_proc where proname='v310_1_tenant_integrity' and pronamespace='public'::regnamespace")
if [ "$HAS" = "0" ]; then
  pg_file "$C" supabase/v310_1_tenant_integrity.sql >/dev/null 2>&1 || { echo "ABORT: migration failed"; exit 1; }
  echo "  mode: applied      (predecessor carried $COL_BEFORE of 4 tenant_id columns)"
else
  echo "  mode: preinstalled (pre-state not observable; terminal state asserted)"
fi

# ── UT-1 ────────────────────────────────────────────────────────────────────
MK=$(pg_q "$C" "select (select count(*) from pg_proc where proname='v310_1_tenant_integrity')::text||'/'||(select count(*) from pg_proc where proname='v310_stage_compatibility')::text||'/'||(select count(*) from pg_proc where proname='v309_preview_consolidation')::text||'/'||(select count(*) from pg_proc where proname='v308_availability')::text||'/'||(select count(*) from pg_proc where proname='v307b_class_u')::text||'/'||(select count(*) from pg_proc where proname='v307a_wiring')::text||'/'||(select count(*) from pg_proc where proname='v306_admissibility')::text")
chk UT-1 "$MK" "1/1/1/1/1/1/1" "v310.1 marker installed; v306 through v310 markers intact"

# ── UT-2 ────────────────────────────────────────────────────────────────────
DYN=$(pg_q "$C" "select count(*)::text from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=d.adnum where n.nspname='public' and a.attname='tenant_id' and c.relname in ($FOUR) and pg_get_expr(d.adbin,d.adrelid) like '%current_tenant_id()%'")
chk UT-2 "$DYN" "4" "all four tenant_id defaults resolve through current_tenant_id()"

# ── UT-3 ────────────────────────────────────────────────────────────────────
LIT=$(pg_q "$C" "select count(*)::text from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=d.adnum where n.nspname='public' and a.attname='tenant_id' and pg_get_expr(d.adbin,d.adrelid) ~ '^''[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}''::uuid\$'")
chk UT-3 "$LIT" "0" "no tenant_id column in public defaults to a hardcoded uuid literal"

# ── UT-4 ────────────────────────────────────────────────────────────────────
FK=$(pg_q "$C" "select count(distinct tc.table_name)::text from information_schema.table_constraints tc join information_schema.key_column_usage k on k.constraint_name=tc.constraint_name join information_schema.constraint_column_usage r on r.constraint_name=tc.constraint_name where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name in ($FOUR) and k.column_name='tenant_id' and r.table_name='tenants'")
UUIDC=$(pg_q "$C" "select count(*)::text from information_schema.columns where table_schema='public' and column_name='tenant_id' and data_type='uuid' and table_name in ($FOUR)")
chk UT-4 "$UUIDC/$FK" "4/4" "all four surfaces carry uuid tenant_id with the canonical tenants(id) foreign key"

# ── UT-5 ────────────────────────────────────────────────────────────────────
MIS=$(pg_q "$C" "select count(*)::text from public.proposal_versions pv join public.proposals pr on pr.id=pv.proposal_id where pv.tenant_id is distinct from pr.tenant_id")
PV_AFTER=$(pg_q "$C" "select count(*)::text from public.proposal_versions")
chk UT-5 "$MIS/$PV_AFTER" "0/$PV_BEFORE" "zero rows contradict their parent; the repair created and destroyed nothing"

# ── UT-6 ────────────────────────────────────────────────────────────────────
DDL=$(grep -ciE '^[[:space:]]*(create|drop)[[:space:]]+(table|index|trigger|policy|type)|^[[:space:]]*(drop|alter)[[:space:]]+function|^[[:space:]]*(grant|revoke)[[:space:]]' supabase/v310_1_tenant_integrity.sql)
ADD=$(grep -ciE '^[[:space:]]*alter[[:space:]]+table[[:space:]]+public\.[a-z_]+[[:space:]]+add[[:space:]]+column[[:space:]]+if[[:space:]]+not[[:space:]]+exists[[:space:]]+tenant_id' supabase/v310_1_tenant_integrity.sql)
SETDEF=$(grep -ciE '^[[:space:]]*alter[[:space:]]+table[[:space:]]+public\.[a-z_]+[[:space:]]+alter[[:space:]]+column[[:space:]]+tenant_id[[:space:]]+set[[:space:]]+default' supabase/v310_1_tenant_integrity.sql)
chk UT-6 "$DDL/$ADD/$SETDEF" "0/4/4" "bounded — no prohibited DDL; exactly four add-column and four set-default"

# ── UT-7 ────────────────────────────────────────────────────────────────────
RLS_AFTER=$(pg_q "$C" "select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ($FOUR) and c.relrowsecurity")
POL_AFTER=$(pg_q "$C" "select count(*)::text from pg_policies where schemaname='public' and tablename in ($FOUR)")
chk UT-7 "$RLS_AFTER/$POL_AFTER" "$RLS_BEFORE/$POL_BEFORE" "tenant isolation preserved — RLS posture and policy count unchanged across the migration"

echo
echo "  $P PASS / $F FAIL"
[ "$F" -eq 0 ] || exit 1
