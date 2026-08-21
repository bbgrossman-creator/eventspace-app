-- ============================================================================
-- v311 · AUTHORITY GRANT — the canonical O-010 substrate
-- File: supabase/v311_authority_grant.sql                  min_release v310.1
--
-- Master v111 Canonical Map v4.2 ratifies O-010 Authority Grant as a canonical
-- relation:
--
--   Actor × Act Class × Subject/Scope × Legal Entity where applicable ×
--   interval × delegation source
--   "Roles bundle grants; break-glass is temporary delegation"
--   REJECTS: "role=admin / owner field as universal authority"
--
-- No implementation existed under any name. This is that implementation, kept
-- to the smallest shape that can answer one question honestly:
--
--   is this actor authorized to perform this act on this subject, as of now?
--
-- ── WHY THIS EXISTS RATHER THAN A ROLE LIST ─────────────────────────────────
-- v311 first gated Kitchen quantity on a role list, in the shape the existing
-- can_* ceremonies use. Inspection showed why that is unsafe here:
-- tenant_users.role carries no CHECK constraint, so the vocabulary is open
-- text, and in EventCore production every user is 'admin'. Any role-list
-- capability is therefore tenant-wide in effect — default-deny in form and
-- universal in practice, which is precisely what O-010 rejects by name.
--
-- Authority is now explicit. A tenant may later bundle these grants behind
-- whatever job title it uses — chef, kitchen manager, operations manager — and
-- that stays tenant configuration rather than product architecture. No role,
-- including admin and owner, is authority by itself.
--
-- ── APPEND-ONLY, EFFECTIVE-DATED ────────────────────────────────────────────
-- Grants and revocations are both records; neither is ever edited. A revocation
-- is a new row citing the grant it ends. Current permission derives from the
-- records in force at the moment asked, exactly as attendance, milestones and
-- venue bindings already resolve current truth over append-only history.
--
-- This matters beyond tidiness: an approval performed last week must remain
-- attributable to the authority that existed then. Revoking a grant today must
-- not retroactively invalidate what was lawfully done. History stays true; only
-- the answer to "may they do it now?" changes.
--
-- ── BOUNDARY ────────────────────────────────────────────────────────────────
-- Not an IAM product. No role editor, no policy language, no inheritance tree.
-- Two act classes are declared for v311 and the relation is shaped so subject
-- scope and legal entity can narrow later without migration. No grant is
-- created here — fixtures and proofs establish their own, and no production
-- grant is created by this release.
-- ============================================================================

begin;

-- ── 1 · the canonical relation ──────────────────────────────────────────────
create table if not exists public.authority_grant (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  -- 'grant' confers authority; 'revocation' ends a specific prior grant. Both
  -- are records. Neither is ever updated.
  record_kind       text not null check (record_kind in ('grant','revocation')),
  actor             uuid not null,
  -- Stable machine identifier, e.g. 'kitchen.quantity.approve'. UI language
  -- stays human; this never appears on screen.
  act_class         text not null,
  -- Scope kind plus an optional narrower subject. v311 uses 'tenant', but the
  -- shape already admits 'event' or 'requirement' without migration.
  subject_scope     text not null default 'tenant',
  subject_ref       uuid,
  legal_entity_ref  uuid,
  effective_from    timestamptz not null default now(),
  effective_until   timestamptz,
  -- O-010's delegation source. A break-glass grant cites the grant it derives
  -- from, so temporary delegation is traceable to its origin.
  delegation_source uuid references public.authority_grant(id),
  -- For a revocation, the grant being ended.
  revokes_ref       uuid references public.authority_grant(id),
  granted_by        text not null,
  reason            text,
  recorded_at       timestamptz not null default now(),
  seq               bigserial not null,
  constraint ag_interval_sane check (effective_until is null or effective_until > effective_from),
  constraint ag_revocation_cites_grant check (
    (record_kind = 'grant' and revokes_ref is null) or
    (record_kind = 'revocation' and revokes_ref is not null))
);

create index if not exists idx_ag_lookup on public.authority_grant(tenant_id, actor, act_class);
create index if not exists idx_ag_revokes on public.authority_grant(revokes_ref);

alter table public.authority_grant enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='authority_grant' and policyname='ag_tenant_select') then
    create policy ag_tenant_select on public.authority_grant
      for select using (tenant_id = public.current_tenant_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='authority_grant' and policyname='ag_tenant_insert') then
    create policy ag_tenant_insert on public.authority_grant
      for insert with check (tenant_id = public.current_tenant_id());
  end if;
end $$;

create or replace function public.authority_grant_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'AUTHORITY_GRANT_EDIT_REFUSED: authority records are append-only; revoke by recording a revocation';
end $$;

drop trigger if exists ag_no_edit on public.authority_grant;
create trigger ag_no_edit
  before update or delete on public.authority_grant
  for each row execute function public.authority_grant_append_only();

-- ── 2 · the evaluator ───────────────────────────────────────────────────────
-- Default deny by construction: this returns true only when a matching grant
-- record is in force. Tenant isolation is structural — the grant must belong to
-- the caller's tenant, so a grant in another tenant cannot authorize anything
-- here and its existence is not disclosed either way.
--
-- A grant is in force at p_as_of when its interval covers that instant and no
-- revocation of it was recorded at or before it. Revocation is prospective:
-- acts already performed remain attributable to the authority that existed then.
create or replace function public.has_authority(
  p_actor uuid, p_act_class text, p_subject uuid default null,
  p_as_of timestamptz default now())
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.authority_grant g
     where g.tenant_id = public.current_tenant_id()
       and g.record_kind = 'grant'
       and g.actor = p_actor
       and g.act_class = p_act_class
       and g.effective_from <= p_as_of
       and (g.effective_until is null or g.effective_until > p_as_of)
       -- Tenant scope authorizes any subject; a narrower grant must match the
       -- subject asked about.
       and (g.subject_scope = 'tenant'
            or (p_subject is not null and g.subject_ref = p_subject))
       and not exists (
         select 1 from public.authority_grant r
          where r.tenant_id = g.tenant_id
            and r.record_kind = 'revocation'
            and r.revokes_ref = g.id
            and r.recorded_at <= p_as_of));
$$;

-- The acting user, resolved the same way every existing ceremony resolves it.
create or replace function public.current_actor()
returns uuid language sql stable set search_path = public
as $$
  select nullif(coalesce(
           nullif(current_setting('app.user_id', true), ''),
           nullif(current_setting('request.jwt.claim.sub', true), '')), '')::uuid;
$$;

-- ── 3 · Kitchen act classes ─────────────────────────────────────────────────
-- Deliberately two, not one. Adjustment authority does not imply approval
-- authority: proposing a different number and committing the business to it are
-- different acts. A tenant may grant both to the same person, but that is its
-- configuration rather than our assumption.
create or replace function public.can_adjust_kitchen_quantity(
  p_requirement uuid default null, p_as_of timestamptz default now())
returns boolean language sql stable security definer set search_path = public
as $$
  select public.current_actor() is not null
     and public.has_authority(public.current_actor(), 'kitchen.quantity.adjust', p_requirement, p_as_of);
$$;

create or replace function public.can_approve_kitchen_quantity(
  p_requirement uuid default null, p_as_of timestamptz default now())
returns boolean language sql stable security definer set search_path = public
as $$
  select public.current_actor() is not null
     and public.has_authority(public.current_actor(), 'kitchen.quantity.approve', p_requirement, p_as_of);
$$;

-- ── 4 · the unsafe role-list evaluator is retired ───────────────────────────
-- It granted Kitchen quantity authority to admin/owner/manager/ops, which in a
-- tenant where every user is admin is universal authority under another name.
drop function if exists public.can_manage_kitchen_quantity();

-- ── the deployed marker ─────────────────────────────────────────────────────
create function public.v311_authority_grant() returns text
language sql immutable as $$ select 'v311 · O-010 Authority Grant — explicit, effective-dated, append-only; no role is authority by itself'::text $$;

commit;
