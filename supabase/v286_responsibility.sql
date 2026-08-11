-- ════════════════════════════════════════════════════════════════════════════
-- v286 — Responsibility Record + Ownership Ledger + Deterministic Derivation
-- Implements Responsibility OS Constitution v285 Rev B (frozen).
--
-- CONSTITUTIONAL RULING HONOURED: the existing `obligation` relation is WIDENED
-- IN PLACE and is constitutionally recognized as the Responsibility Record.
-- No parallel `responsibility` table is created (R-5 / RESP_DUPLICATE_FORBIDDEN
-- applied to schema). `responsibility` is the canonical vocabulary at every
-- function boundary; the physical relation name is retained for compatibility.
--
-- Backward compatibility: every added column is nullable or defaulted, so all
-- historical obligation rows and all v275-era inserts remain valid.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · WIDEN THE RESPONSIBILITY RECORD ─────────────────────────────────────

-- Provenance generalization (T1 selection/release/manual_authorized, T2
-- knowledge, T3 attestation).
alter table public.obligation drop constraint if exists obligation_origin_kind_check;
alter table public.obligation add constraint obligation_origin_kind_check
  check (origin_kind in ('selection','release','manual_authorized','knowledge','attestation'));

-- Revision pinning (R-11 sealed basis: knowledge-derived responsibilities pin
-- the revision they derive from and never follow later library edits).
alter table public.obligation add column if not exists origin_revision uuid;

-- Scope. 'event' = event-anchored; 'standing' = knowledge/attestation-anchored
-- with no event. Defaulted so existing rows remain valid.
alter table public.obligation add column if not exists scope text not null default 'event';
alter table public.obligation drop constraint if exists obligation_scope_check;
alter table public.obligation add constraint obligation_scope_check
  check (scope in ('event','standing'));

-- Standing responsibilities require a nullable event anchor (constitution §8.1).
alter table public.obligation alter column event_ref drop not null;

-- No ambiguous states: scope and anchor are coherent by construction.
alter table public.obligation drop constraint if exists obligation_scope_anchor_check;
alter table public.obligation add constraint obligation_scope_anchor_check
  check (
    (scope = 'event'    and event_ref is not null)
    or
    (scope = 'standing' and event_ref is null and origin_kind in ('knowledge','attestation'))
  );

-- Replacement chain (L-3, R-8): a replacement cites what it replaced.
alter table public.obligation add column if not exists supersedes_ref uuid
  references public.obligation(id);

-- Additional truth anchors beyond origin_ref (R-1). origin_ref remains the
-- primary anchor and is NOT NULL, so R-1 is structurally guaranteed.
alter table public.obligation add column if not exists anchors jsonb not null default '[]'::jsonb;

comment on table public.obligation is
  'THE RESPONSIBILITY RECORD (Responsibility OS Constitution v285 Rev B). '
  'Physically named `obligation` for compatibility per constitutional ruling; '
  'canonical vocabulary is `responsibility` at every function boundary. '
  'Deliberately carries NO lifecycle status column (R-3): state is projected '
  'by responsibility_state() from evidence + truth + clock.';

-- Consequence of standing scope: a standing responsibility carries no event, so
-- the evidence ledger must be able to anchor a fact to the RESPONSIBILITY alone.
-- Without this a standing responsibility could never be discharged and its
-- lifecycle would be unreachable. Widening only: every existing row carries an
-- event_ref and remains valid.
alter table public.execution_evidence alter column event_ref drop not null;
alter table public.execution_evidence drop constraint if exists execution_evidence_anchor_check;
alter table public.execution_evidence add constraint execution_evidence_anchor_check
  check (event_ref is not null or obligation_ref is not null);

-- ── 2 · GUARDS: ANCHORS (R-1) AND APPEND-ONLY (R-4, R-8) ────────────────────

create or replace function public.responsibility_anchor_guard()
returns trigger language plpgsql as $$
begin
  -- R-1: every responsibility cites at least one truth anchor.
  if new.origin_ref is null then
    raise exception 'RESP_NO_TRUTH_ANCHOR: a responsibility must cite truth (origin_ref)';
  end if;
  -- R-11: knowledge truth reaches a responsibility only through a pinned
  -- revision, so later library edits cannot rewrite it.
  if new.origin_kind = 'knowledge' and new.origin_revision is null then
    raise exception 'RESP_NO_TRUTH_ANCHOR: knowledge-origin responsibility must pin origin_revision';
  end if;
  -- A standing responsibility carries no event; its anchor must be explicit.
  if new.scope = 'standing' and new.origin_kind not in ('knowledge','attestation') then
    raise exception 'RESP_NO_TRUTH_ANCHOR: standing scope requires knowledge or attestation truth';
  end if;
  return new;
end $$;

drop trigger if exists responsibility_anchor on public.obligation;
create trigger responsibility_anchor
  before insert on public.obligation
  for each row execute function public.responsibility_anchor_guard();

-- R-8: derived records are never edited in place. Regeneration is
-- insert-or-do-nothing; change is expressed by supersession, never by UPDATE.
create or replace function public.responsibility_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'RESP_EDIT_REFUSED: the Responsibility Record is append-only (R-8); express change by supersession';
end $$;

drop trigger if exists responsibility_no_edit on public.obligation;
create trigger responsibility_no_edit
  before update or delete on public.obligation
  for each row execute function public.responsibility_append_only();

-- ── 3 · OWNERSHIP LEDGER (O-1, R-6) ─────────────────────────────────────────
-- Dedicated and authoritative per constitutional ruling. execution_evidence may
-- ECHO an assignment for narrative completeness but is never authoritative for
-- who is currently accountable.

create table if not exists public.responsibility_owner (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  responsibility_ref uuid not null references public.obligation(id),
  action             text not null check (action in ('assign','transfer','release')),
  owner              text,                       -- null only for 'release'
  prior_owner        text,                       -- who was current before this act
  prior_ref          uuid references public.responsibility_owner(id),  -- R-4 citation
  actor              text not null,              -- who performed the ceremony
  seq                bigint generated always as identity,
  moment             timestamptz not null default clock_timestamp(),
  created_at         timestamptz not null default now(),
  constraint responsibility_owner_presence_check check (
    (action = 'release' and owner is null) or
    (action in ('assign','transfer') and owner is not null)
  )
);
create index if not exists responsibility_owner_resp_idx
  on public.responsibility_owner (tenant_id, responsibility_ref, seq desc);

comment on table public.responsibility_owner is
  'Dedicated append-only ownership ledger (v285 Rev B ruling). AUTHORITATIVE for '
  'current accountability. At most one current owner (O-1); unassigned Derived is '
  'lawful (O-3); history is total and append-only (R-6).';

create or replace function public.responsibility_owner_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'RESP_OWNER_LEDGER_APPEND_ONLY: ownership history is append-only (R-6)';
end $$;

drop trigger if exists responsibility_owner_no_edit on public.responsibility_owner;
create trigger responsibility_owner_no_edit
  before update or delete on public.responsibility_owner
  for each row execute function public.responsibility_owner_append_only();

alter table public.responsibility_owner enable row level security;
drop policy if exists ro_select on public.responsibility_owner;
create policy ro_select on public.responsibility_owner
  for select using (tenant_id = public.current_tenant_id());
drop policy if exists ro_insert on public.responsibility_owner;
create policy ro_insert on public.responsibility_owner
  for insert with check (tenant_id = public.current_tenant_id());
-- No update policy and no delete policy: R-6 append-only, enforced twice.

-- ── 4 · OWNERSHIP PROJECTION + CEREMONY ─────────────────────────────────────

-- Current owner = the most recent ledger act; 'release' clears accountability.
create or replace function public.responsibility_current_owner(p_responsibility uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case when ro.action = 'release' then null else ro.owner end
    from public.responsibility_owner ro
   where ro.responsibility_ref = p_responsibility
     and ro.tenant_id = public.current_tenant_id()
   order by ro.seq desc
   limit 1;
$$;

-- Transfer is a ceremony (O-4). Serialized on the responsibility row, so two
-- concurrent transfers cannot both succeed: the loser's expected prior owner no
-- longer matches and it is refused lawfully.
create or replace function public.transfer_responsibility_ownership(
  p_responsibility  uuid,
  p_new_owner       text,
  p_expected_prior  text,
  p_actor           text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_current text;
  v_prior   uuid;
  v_action  text;
  v_id      uuid;
begin
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'RESP_ACTOR_REQUIRED: ownership ceremonies require a human actor';
  end if;

  -- Single-writer serialization for this responsibility's ownership.
  perform 1 from public.obligation o
    where o.id = p_responsibility and o.tenant_id = v_tenant
    for update;
  if not found then
    raise exception 'RESP_NOT_FOUND: no such responsibility in this tenant';
  end if;

  select case when ro.action='release' then null else ro.owner end, ro.id
    into v_current, v_prior
    from public.responsibility_owner ro
   where ro.responsibility_ref = p_responsibility and ro.tenant_id = v_tenant
   order by ro.seq desc limit 1;

  -- O-1: the caller must state the ownership it believes it is replacing.
  if v_current is distinct from p_expected_prior then
    raise exception 'OWNERSHIP_CONFLICT: current owner is %, expected %',
      coalesce(v_current,'(unassigned)'), coalesce(p_expected_prior,'(unassigned)');
  end if;

  v_action := case when p_new_owner is null then 'release'
                   when v_current is null   then 'assign'
                   else 'transfer' end;

  insert into public.responsibility_owner
    (tenant_id, responsibility_ref, action, owner, prior_owner, prior_ref, actor)
  values (v_tenant, p_responsibility, v_action, p_new_owner, v_current, v_prior, p_actor)
  returning id into v_id;

  return v_id;
end $$;

-- ── 5 · LIFECYCLE PROJECTION (R-3 · §4 vocabulary, projected never stored) ──
-- Clock is a parameter, never truth.

create or replace function public.responsibility_state(
  p_responsibility uuid,
  p_now            timestamptz default now()
) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_o       public.obligation%rowtype;
  v_owner   text;
  v_end     timestamptz;
  v_start   timestamptz;
  v_dep     text;
  v_blocked boolean := false;
begin
  select * into v_o from public.obligation o
   where o.id = p_responsibility and o.tenant_id = v_tenant;
  if not found then return null; end if;

  -- Superseded: a replacement cites this record.
  if exists (select 1 from public.obligation r where r.supersedes_ref = p_responsibility) then
    return 'superseded';
  end if;
  if exists (select 1 from public.execution_evidence e
              where e.obligation_ref = p_responsibility and e.kind = 'superseded') then
    return 'superseded';
  end if;

  -- Void: anchoring truth was corrected away.
  if exists (select 1 from public.execution_evidence e
              where e.obligation_ref = p_responsibility
                and e.kind in ('invalidated','cancelled')) then
    return 'void';
  end if;

  -- Discharged derives ONLY from evidence (L-2, R-7).
  if exists (select 1 from public.execution_evidence e
              where e.obligation_ref = p_responsibility and e.kind = 'completion') then
    return 'discharged';
  end if;

  v_start := nullif(v_o.timing->>'window_start','')::timestamptz;
  v_end   := coalesce(nullif(v_o.timing->>'window_end','')::timestamptz,
                      nullif(v_o.timing->>'due','')::timestamptz);

  -- Lapsed: window closed without satisfying evidence.
  if v_end is not null and p_now > v_end then
    return 'lapsed';
  end if;

  v_owner := public.responsibility_current_owner(p_responsibility);
  if v_owner is null then
    return 'derived';                      -- lawful, and visible debt (O-3)
  end if;

  for v_dep in select jsonb_array_elements_text(coalesce(v_o.dependencies,'[]'::jsonb)) loop
    if v_o.event_ref is not null
       and not public.obligation_nk_complete(v_o.event_ref, v_dep) then
      v_blocked := true;
    end if;
  end loop;

  if v_blocked then return 'standing'; end if;
  if v_start is not null and p_now < v_start then return 'standing'; end if;
  return 'active';
end $$;

-- ── 6 · DETERMINISTIC DERIVATION (R-2) — THE ONLY WRITER ────────────────────

-- Natural key. Identity AND content, so a content change yields a NEW identity
-- (superseded), never an in-place edit (R-8).
create or replace function public.responsibility_natural_key(
  p_scope text, p_event uuid, p_origin_kind text, p_origin_ref uuid,
  p_origin_revision uuid, p_kind text, p_resource_role text,
  p_required_outcome text, p_timing jsonb
) returns text
language sql immutable as $$
  select encode(extensions.digest(
    p_scope || '|' || coalesce(p_event::text,'') || '|' || p_origin_kind || '|' ||
    p_origin_ref::text || '|' || coalesce(p_origin_revision::text,'') || '|' ||
    p_kind || '|' || coalesce(p_resource_role,'') || '|' ||
    p_required_outcome || '|' || coalesce(p_timing::text,''), 'sha256'), 'hex');
$$;

-- Truth resolvers. Each is pure and reads only truth.

-- T1 · Event truth: a released event owes its execution.
create or replace function public.derive_from_event_truth(p_event uuid)
returns table (scope text, event_ref uuid, origin_kind text, origin_ref uuid,
               origin_revision uuid, kind text, department text,
               required_outcome text, resource_role text, timing jsonb)
language sql stable security definer set search_path = public as $$
  select 'event', e.event_ref, 'release', e.id, null::uuid,
         'event_execute', 'venue',
         'Execute the released event', null::text, null::jsonb
    from public.execution_evidence e
   where e.event_ref = p_event
     and e.kind = 'released'
     and e.tenant_id = public.current_tenant_id();
$$;

-- T2 · Knowledge truth: the pinned operational basis owes its requirements.
-- Revision-pinned (R-11): a sealed event keeps its embedded basis.
create or replace function public.derive_from_knowledge_truth(p_event uuid)
returns table (scope text, event_ref uuid, origin_kind text, origin_ref uuid,
               origin_revision uuid, kind text, department text,
               required_outcome text, resource_role text, timing jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  r        record;
  req      jsonb;
begin
  for r in
    select ec.id as ec_id, ec.profile_revision_id, ec.title
      from public.event_components ec
      join public.event ev on ev.engagement_ref = ec.booking_id
     where ev.id = p_event and ec.tenant_id = v_tenant
       and ec.profile_revision_id is not null
  loop
    for req in
      select jsonb_array_elements(
        public.render_legacy_requirements(public.component_operational_basis(r.ec_id)))
    loop
      scope := 'event'; event_ref := p_event;
      origin_kind := 'knowledge'; origin_ref := r.ec_id;
      origin_revision := r.profile_revision_id;
      kind := req->>'kind';
      department := case req->>'kind'
                      when 'staff'     then 'staffing'
                      when 'equipment' then 'equipment'
                      when 'rental'    then 'equipment'
                      when 'supply'    then 'culinary'
                      else 'logistics' end;
      resource_role := coalesce(req->>'role', req->>'item');
      required_outcome := 'Provide ' || coalesce(req->>'quantity','') || ' ' ||
                          coalesce(req->>'role', req->>'item','requirement') ||
                          ' for ' || coalesce(r.title,'component');
      timing := null;
      return next;
    end loop;
  end loop;
end $$;

-- T3 · Attestation truth: an authorized human declaration owes what it declares.
create or replace function public.derive_from_attestation_truth(p_event uuid)
returns table (scope text, event_ref uuid, origin_kind text, origin_ref uuid,
               origin_revision uuid, kind text, department text,
               required_outcome text, resource_role text, timing jsonb)
language sql stable security definer set search_path = public as $$
  select 'event', e.event_ref, 'attestation', e.id, null::uuid,
         coalesce(e.payload->'responsibility'->>'kind','attested'),
         e.payload->'responsibility'->>'department',
         e.payload->'responsibility'->>'outcome',
         e.payload->'responsibility'->>'resource_role',
         e.payload->'responsibility'->'timing'
    from public.execution_evidence e
   where e.event_ref = p_event
     and e.kind = 'sign_off'
     and e.tenant_id = public.current_tenant_id()
     and e.payload ? 'responsibility'
     and e.payload->'responsibility' ? 'department'
     and e.payload->'responsibility' ? 'outcome';
$$;

-- THE ONLY WRITER. Pure in effect: identical truth ⇒ identical set.
-- Idempotent by natural key (insert-or-do-nothing — never an in-place edit).
-- Responsibilities no longer implied are superseded/voided by appended
-- evidence, never by mutation.
create or replace function public.derive_responsibilities(
  p_event uuid,
  p_now   timestamptz default now()
) returns table (created int, unchanged int, superseded int)
language plpgsql security definer set search_path = public as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_created int := 0;
  v_same    int := 0;
  v_super   int := 0;
  r         record;
  v_nk      text;
  v_exists  uuid;
  v_desired text[] := array[]::text[];
begin
  if p_event is null then
    raise exception 'RESP_NO_TRUTH_ANCHOR: derivation requires a truth scope';
  end if;

  -- Single-writer discipline: one derivation per event at a time.
  perform pg_advisory_xact_lock(hashtext(v_tenant::text || ':' || p_event::text));

  for r in
    select * from public.derive_from_event_truth(p_event)
    union all
    select * from public.derive_from_knowledge_truth(p_event)
    union all
    select * from public.derive_from_attestation_truth(p_event)
  loop
    -- R-1 enforced before writing: refuse anchorless derivation by name.
    if r.origin_ref is null or r.department is null or r.required_outcome is null then
      raise exception 'RESP_NO_TRUTH_ANCHOR: derived row lacks anchor or outcome';
    end if;

    v_nk := public.responsibility_natural_key(
              r.scope, r.event_ref, r.origin_kind, r.origin_ref, r.origin_revision,
              r.kind, r.resource_role, r.required_outcome, r.timing);
    v_desired := array_append(v_desired, v_nk);

    select o.id into v_exists from public.obligation o
      where o.tenant_id = v_tenant and o.natural_key = v_nk;

    if v_exists is null then
      insert into public.obligation
        (tenant_id, event_ref, scope, origin_ref, origin_kind, origin_revision,
         kind, department, required_outcome, resource_role, timing, natural_key, anchors)
      values
        (v_tenant, r.event_ref, r.scope, r.origin_ref, r.origin_kind, r.origin_revision,
         r.kind, r.department, r.required_outcome, r.resource_role, r.timing, v_nk,
         jsonb_build_array(jsonb_build_object(
           'truth', r.origin_kind, 'ref', r.origin_ref, 'revision', r.origin_revision)))
      on conflict (tenant_id, natural_key) do nothing;
      if found then v_created := v_created + 1; else v_same := v_same + 1; end if;
    else
      v_same := v_same + 1;
    end if;
  end loop;

  -- L-3: previously derived, no longer implied ⇒ superseded by appended fact.
  for r in
    select o.id from public.obligation o
     where o.tenant_id = v_tenant
       and o.event_ref = p_event
       and o.origin_kind in ('release','knowledge','attestation')
       and not (o.natural_key = any(v_desired))
       and not exists (select 1 from public.execution_evidence e
                        where e.obligation_ref = o.id and e.kind = 'superseded')
  loop
    insert into public.execution_evidence
      (tenant_id, event_ref, obligation_ref, kind, actor, payload)
    values (v_tenant, p_event, r.id, 'superseded', 'derive_responsibilities',
            jsonb_build_object('reason','no longer implied by truth'));
    v_super := v_super + 1;
  end loop;

  created := v_created; unchanged := v_same; superseded := v_super;
  return next;
end $$;

-- ── 7 · PROJECTION PRIMITIVES (R-9, X-1 — read-only, no authority) ──────────

create or replace function public.department_workspace(
  p_department text,
  p_now        timestamptz default now()
) returns table (responsibility uuid, event_ref uuid, kind text,
                 required_outcome text, resource_role text,
                 owner text, state text)
language sql stable security definer set search_path = public as $$
  select o.id, o.event_ref, o.kind, o.required_outcome, o.resource_role,
         public.responsibility_current_owner(o.id),
         public.responsibility_state(o.id, p_now)
    from public.obligation o
   where o.tenant_id = public.current_tenant_id()
     and o.department = p_department
   order by o.created_at, o.natural_key;
$$;

create or replace function public.day_sheet(
  p_day  date,
  p_now  timestamptz default now()
) returns table (responsibility uuid, department text, required_outcome text,
                 owner text, state text)
language sql stable security definer set search_path = public as $$
  select o.id, o.department, o.required_outcome,
         public.responsibility_current_owner(o.id),
         public.responsibility_state(o.id, p_now)
    from public.obligation o
   where o.tenant_id = public.current_tenant_id()
     and (
       (o.timing ? 'due'        and (o.timing->>'due')::timestamptz::date  = p_day) or
       (o.timing ? 'window_end' and (o.timing->>'window_end')::timestamptz::date = p_day)
     )
   order by o.department, o.natural_key;
$$;

-- ── 8 · GRANTS ──────────────────────────────────────────────────────────────
grant select, insert on public.responsibility_owner to authenticated;
grant execute on function public.responsibility_current_owner(uuid) to authenticated;
grant execute on function public.responsibility_state(uuid, timestamptz) to authenticated;
grant execute on function public.transfer_responsibility_ownership(uuid, text, text, text) to authenticated;
grant execute on function public.derive_responsibilities(uuid, timestamptz) to authenticated;
grant execute on function public.department_workspace(text, timestamptz) to authenticated;
grant execute on function public.day_sheet(date, timestamptz) to authenticated;
