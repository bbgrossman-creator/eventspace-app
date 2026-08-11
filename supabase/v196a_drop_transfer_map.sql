-- ═══════════════════════════════════════════════════════════════════════════
-- v196a — RETIRE public.tenant_transfer_map
--
-- This table was scaffolding: it mapped old→new ids during the Burger Bar →
-- EventCore Demo tenant transfer so the migration could be re-run and audited.
-- Its retirement was deliberately gated on Part B — the transfer's correctness
-- had to be proven from REAL authenticated sessions before its safety net was
-- removed, not merely assumed from the SQL editor's owner view.
--
-- PART B IS GREEN (verified): Burger Bar isolation, Demo isolation, anonymous
-- access, and the fresh-version derived-tenancy regression all passed against
-- rows that demonstrably exist. The scaffolding has done its job.
--
-- Zero code references it (grepped: src/ and supabase/ are both clean).
--
-- Recoverable if ever needed: the map was derived from source data, and the
-- transfer is complete and verified — there is nothing here that isn't already
-- expressed by the tenant_id columns it helped populate.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare n int;
begin
  if to_regclass('public.tenant_transfer_map') is null then
    raise notice 'v196a: tenant_transfer_map already gone — nothing to do';
    return;
  end if;
  execute 'select count(*) from public.tenant_transfer_map' into n;
  raise notice 'v196a: dropping tenant_transfer_map (% row(s) of transfer scaffolding)', n;
end $$;

drop table if exists public.tenant_transfer_map;

do $$
begin
  if to_regclass('public.tenant_transfer_map') is null then
    raise notice 'v196a: ✓ dropped. Part B green; transfer closed out.';
  else
    raise exception 'v196a: table still present after drop';
  end if;
end $$;
