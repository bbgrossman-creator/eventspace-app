-- ═══════════════════════════════════════════════════════════════════════════
-- v267a — PGCRYPTO COMPATIBILITY SHIM (one-time, additive, idempotent).
--
-- WHY: publish_offer() (and the seal/bump triggers) are SECURITY DEFINER with
-- search_path pinned to `public` — correct hardening practice. Their archive-
-- integrity check calls digest() unqualified. On Supabase, the pgcrypto
-- extension is installed into the `extensions` schema, so digest() is not
-- visible from inside those functions even though it works in your SQL-editor
-- session (whose search_path includes `extensions`). Result:
--     ERROR: function digest(bytea, unknown) does not exist
-- raised from publish_offer line ~68 (the R2 ARCHIVE_CORRUPT check).
--
-- WHAT THIS DOES: discovers the schema where pgcrypto's digest(bytea, text)
-- actually lives and, if it is not `public`, creates a thin delegating wrapper
--     public.digest(bytea, text) → <that schema>.digest(bytea, text)
-- so unqualified digest() resolves under search_path = public. Nothing else:
-- no migration is altered, publish_offer() is untouched, no constraint changes.
-- Safe to run repeatedly; a no-op where pgcrypto already lives in public.
--
-- RUN ONCE on the deployed database, BEFORE the verification proofs.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare v_schema text;
begin
  select n.nspname into v_schema
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'digest'
      and p.pronargs = 2
      and p.proargtypes[0] = 'bytea'::regtype
      and p.proargtypes[1] = 'text'::regtype
    order by (n.nspname = 'public') desc
    limit 1;
  if v_schema is null then
    raise exception 'pgcrypto digest(bytea, text) not found in any schema — run: create extension pgcrypto;';
  end if;
  if v_schema = 'public' then
    raise notice 'pgcrypto digest already resolves in public — no shim needed';
  else
    execute format(
      'create or replace function public.digest(bytea, text) returns bytea
         language sql immutable strict
         as $f$ select %I.digest($1, $2) $f$', v_schema);
    raise notice 'shim installed: public.digest(bytea, text) → %.digest', v_schema;
  end if;
end $$;
