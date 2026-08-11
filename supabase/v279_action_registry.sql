-- ═══════════════════════════════════════════════════════════════════════════
-- v279 — AUTHORITATIVE ACTION ROUTING · REGISTRY  [MIGRATION]
-- The registry is a CLOSED, server-controlled SQL function — NOT a mutable table.
-- This is the least dangerous mechanism: action keys, their target types, ceremony
-- destinations, and metadata are code, not data, so no caller can register a new
-- action, override a destination, or forge authority by writing a row. The router
-- is orchestration; the seven existing ceremonies remain the only authoritative
-- writers. No dynamic SQL, no client-supplied function names.
--
-- Constitutional traceability: preserves I-15…I-47. Adds NO domain law. The
-- ceremony destinations below are the exact, already-certified writers.
-- ═══════════════════════════════════════════════════════════════════════════

-- the closed registry: one row per supported action, with a single fixed destination
create or replace function public.action_registry()
returns table(
  action_key text, label text, domain text, target_type text,
  idempotency_mode text, workspace_visible boolean, group_key text, sort_order int)
language sql immutable security definer set search_path = public
as $$
  values
    ('release_event',               'Release Event',      'event',    'booking',              'transition', true,  'lifecycle', 10),
    ('start_service',               'Start Service',      'event',    'event',                'transition', true,  'lifecycle', 20),
    ('close_event',                 'Close Event',        'event',    'event',                'transition', true,  'lifecycle', 30),
    ('record_execution_evidence',   'Record Evidence',    'evidence', 'event',                'record_once',false, 'evidence',  40),
    ('assign_staff',                'Assign Staff',       'staffing', 'staffing_requirement', 'guarded',    true,  'staffing',  50),
    ('correct_staffing_assignment', 'Correct Assignment', 'staffing', 'staffing_assignment',  'append',     true,  'staffing',  60),
    ('release_staffing_assignment', 'Release Assignment', 'staffing', 'staffing_assignment',  'append',     true,  'staffing',  70)
$$;

-- required payload fields per action (server-controlled; used by projection + dispatcher)
create or replace function public.action_required_fields(p_action_key text)
returns text[] language sql immutable
as $$
  select case p_action_key
    when 'record_execution_evidence'   then array['kind']
    when 'assign_staff'                then array['staff','window_start','window_end']
    when 'correct_staffing_assignment' then array['new_staff','window_start','window_end','reason']
    else array[]::text[]
  end;
$$;

-- server-side actor identity (attribution) — never client-supplied
create or replace function public.action_actor()
returns text language sql stable security definer set search_path = public
as $$
  select coalesce(
    nullif(current_setting('app.user_id', true), ''),
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    'unknown');
$$;

-- default-deny active-membership gate for lifecycle/evidence actions (staffing reuses
-- can_manage_staffing). Authority is derived server-side, tenant-scoped.
create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
     where tu.tenant_id = public.current_tenant_id() and tu.active
       and tu.user_id = coalesce(
             nullif(current_setting('app.user_id', true), ''),
             nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid);
$$;

-- authority evaluator per action (advisory for the projection; the ceremony is final)
create or replace function public.action_authorized(p_action_key text)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when p_action_key in ('assign_staff','correct_staffing_assignment','release_staffing_assignment')
      then public.can_manage_staffing()
    when p_action_key in ('release_event','start_service','close_event','record_execution_evidence')
      then public.is_active_member()
    else false          -- unknown → default-deny
  end;
$$;

do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant execute on function public.action_registry(), public.action_required_fields(text),
      public.action_actor(), public.is_active_member(), public.action_authorized(text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname='app_user') then
    grant execute on function public.action_registry(), public.action_required_fields(text),
      public.action_actor(), public.is_active_member(), public.action_authorized(text) to app_user;
  end if;
end $$;
