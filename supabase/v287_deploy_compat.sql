-- ════════════════════════════════════════════════════════════════════════════
-- v287_DEPLOY_COMPAT — pgcrypto resolution shim (additive, idempotent)
--
-- APPLY FIRST, before the v263… chain. Safe to run repeatedly.
--
-- WHY THIS EXISTS
--   Supabase installs pgcrypto into the `extensions` schema. Our SECURITY
--   DEFINER functions pin `search_path` to `public` (correct hardening), so an
--   unqualified digest() is invisible to them and fails with
--       ERROR: function digest(...) does not exist
--   v267a addressed this by creating a public.digest(bytea,text) wrapper. That
--   shim covered ONLY the (bytea,text) signature. Migrations that hash TEXT —
--   digest(<text>, 'sha256') — call (text,text) and were never covered, which
--   is why the fault resurfaced in v286 and v287a.
--
-- THE PERMANENT FIX
--   Every SQL call site is now written as extensions.digest(...). This shim
--   guarantees that name resolves in EVERY environment:
--     • Supabase (pgcrypto in `extensions`) — already true, this is a no-op.
--     • Dev/CI (pgcrypto in `public`) — creates delegating wrappers in
--       `extensions` so the qualified name resolves identically.
--   Both signatures are covered: (bytea,text) and (text,text).
--
-- SEMANTICS ARE UNCHANGED. The wrappers delegate; no hashing behaviour differs.
-- ════════════════════════════════════════════════════════════════════════════

create schema if not exists extensions;

do $$
declare
  v_src   text;
  v_have  boolean;
begin
  -- ── (bytea, text) ────────────────────────────────────────────────────────
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname = 'digest' and n.nspname = 'extensions'
       and p.pronargs = 2
       and p.proargtypes[0] = 'bytea'::regtype
       and p.proargtypes[1] = 'text'::regtype) into v_have;

  if v_have then
    raise notice 'extensions.digest(bytea,text) already present — no shim needed';
  else
    select n.nspname into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname = 'digest' and p.pronargs = 2
       and p.proargtypes[0] = 'bytea'::regtype
       and p.proargtypes[1] = 'text'::regtype
     order by (n.nspname = 'public') desc
     limit 1;
    if v_src is null then
      raise exception 'pgcrypto digest(bytea,text) not found in any schema — run: create extension pgcrypto;';
    end if;
    execute format(
      'create or replace function extensions.digest(bytea, text) returns bytea '
      'language sql immutable strict parallel safe as $f$ select %I.digest($1, $2) $f$', v_src);
    raise notice 'created extensions.digest(bytea,text) delegating to %', v_src;
  end if;

  -- ── (text, text) — the signature v267a never covered ─────────────────────
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname = 'digest' and n.nspname = 'extensions'
       and p.pronargs = 2
       and p.proargtypes[0] = 'text'::regtype
       and p.proargtypes[1] = 'text'::regtype) into v_have;

  if v_have then
    raise notice 'extensions.digest(text,text) already present — no shim needed';
  else
    select n.nspname into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname = 'digest' and p.pronargs = 2
       and p.proargtypes[0] = 'text'::regtype
       and p.proargtypes[1] = 'text'::regtype
     order by (n.nspname = 'public') desc
     limit 1;
    if v_src is null then
      -- pgcrypto exposes (text,text); if absent, synthesize it from (bytea,text)
      execute
        'create or replace function extensions.digest(text, text) returns bytea '
        'language sql immutable strict parallel safe as $f$ select extensions.digest($1::bytea, $2) $f$';
      raise notice 'synthesized extensions.digest(text,text) over the bytea form';
    else
      execute format(
        'create or replace function extensions.digest(text, text) returns bytea '
        'language sql immutable strict parallel safe as $f$ select %I.digest($1, $2) $f$', v_src);
      raise notice 'created extensions.digest(text,text) delegating to %', v_src;
    end if;
  end if;
end $$;

-- Readability for interactive sessions; SECURITY DEFINER functions do not rely
-- on this (they use the fully qualified extensions.digest name).
grant usage on schema extensions to public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function extensions.digest(bytea, text) to authenticated';
    execute 'grant execute on function extensions.digest(text, text) to authenticated';
  end if;
end $$;
