-- ═══════════════════════════════════════════════════════════════════════════
-- v264 — PL-2 · RELATIONSHIP (the second Proposal Lifecycle slice)
--
-- The second authoritative identity, stored at last: the enduring party.
-- IDENTITY ONLY (Interpretive Note 1: identity, not capability):
--   · NO lifecycle column exists — not nullable, not dormant: ABSENT.
--     §13 rules any Relationship state machine a constitutional
--     contradiction, so there is no column to misuse.
--   · NO role column — roles are per-engagement facts (future sockets).
--   · NO delete policy — a Relationship never expires (§13). Select,
--     insert, update only.
-- Engagements CITE the relationship through ONE nullable reference on
-- bookings; NULL = honestly unattached (the PL-1 posture). Nothing sets
-- or changes the reference but a ceremony.
--
-- FOUR CEREMONIES:
--   THE COMPOUND DOOR (open_inquiry_with_relationship): ONE user action,
--     ONE transaction, TWO ceremonies, TWO ledger entries — PL-1's
--     open_inquiry fires unchanged (its own `opened` entry), and the
--     Establish/Find ceremony writes relationship_established or
--     relationship_found. Failure anywhere rolls back the whole door:
--     no orphaned Relationship, no relationship-less spine row from this
--     door, no partial residue. PL-1's one-ceremony-one-entry invariant
--     is preserved verbatim (the v263 functions are NOT touched).
--   ADOPT (adopt_engagement): one existing engagement, one explicit act,
--     one entry. ALREADY_ATTACHED refuses — adoption never re-writes.
--     Reads and writes NO spine state: identity and lifecycle are
--     orthogonal.
--   CORRECT CITATION (correct_citation): append-only means corrections
--     stay VISIBLE, not that falsehoods become permanent. Moves ONE
--     engagement's citation from the mistaken party to the right one:
--     previous ref + replacement ref + MANDATORY reason, and the original
--     adoption entry stands untouched. NOT merge — combines nothing.
--   AMEND (amend_relationship): owned-fact edits; contact-identity
--     changes append relationship_identity_amended WITHOUT the values —
--     no PII accumulates in the undeletable ledger.
--
-- HONEST GRANDFATHERING: this migration creates ZERO relationships, sets
-- ZERO references, seeds ZERO entries. Matching remains a suggestion;
-- only ceremonies write.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.relationships (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  name           text not null,
  kind           text not null default 'person'
                   check (kind in ('person','household','organization')),
  phones         text[] not null default '{}',   -- normalized contact identity
  emails         text[] not null default '{}',
  standing_notes text,
  established_by text,
  created_at     timestamptz not null default now()
);
create index if not exists ix_relationships_tenant on public.relationships (tenant_id);

alter table public.relationships enable row level security;
do $$ begin
  begin
    create policy rel_select on public.relationships
      for select using (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
  begin
    create policy rel_insert on public.relationships
      for insert with check (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
  begin
    create policy rel_update on public.relationships
      for update using (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
  -- Deliberately NO delete policy: a Relationship never expires.
end $$;

-- The citation: one nullable reference. NULL = honestly unattached.
do $$ begin
  alter table public.bookings add column if not exists relationship_id uuid
    references public.relationships(id);
exception when duplicate_column then null; end $$;
create index if not exists ix_bookings_relationship on public.bookings (relationship_id);

-- The ledger gains references, not mechanics (append-only policies untouched):
do $$ begin
  alter table public.engagement_ledger add column if not exists relationship_ref uuid;
exception when duplicate_column then null; end $$;
do $$ begin
  alter table public.engagement_ledger add column if not exists prev_relationship_ref uuid;
exception when duplicate_column then null; end $$;

-- ═══ THE COMPOUND DOOR: two ceremonies, one transaction ═══
create or replace function public.open_inquiry_with_relationship(
  p_booking uuid, p_actor text,
  p_relationship uuid,          -- FOUND: the chosen existing party (null = CREATE)
  p_name text, p_kind text, p_phone text, p_email text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_rel    uuid;
  v_kind   text;
  v_found  boolean := false;
begin
  if p_relationship is not null then
    -- FOUND: confirm the party exists in-tenant.
    select r.id into v_rel from public.relationships r
      where r.id = p_relationship and r.tenant_id = v_tenant;
    if not found then raise exception 'CEREMONY_RELATIONSHIP_NOT_FOUND'; end if;
    v_found := true;
  else
    -- CREATED: contact identity is the door requirement.
    if p_name is null or btrim(p_name) = '' then
      raise exception 'CEREMONY_IDENTITY_REQUIRED';
    end if;
    if (p_phone is null or btrim(p_phone) = '') and (p_email is null or btrim(p_email) = '') then
      raise exception 'CEREMONY_IDENTITY_REQUIRED';
    end if;
    v_kind := coalesce(nullif(btrim(p_kind), ''), 'person');
    insert into public.relationships (tenant_id, name, kind, phones, emails, established_by)
      values (v_tenant, btrim(p_name), v_kind,
        case when p_phone is null or btrim(p_phone) = '' then '{}'::text[] else array[btrim(p_phone)] end,
        case when p_email is null or btrim(p_email) = '' then '{}'::text[] else array[lower(btrim(p_email))] end,
        p_actor)
      returning id into v_rel;
  end if;

  -- CEREMONY ONE: PL-1's Open Inquiry, byte-identical, its own single entry.
  -- Any refusal it raises rolls back everything above: no partial residue.
  perform public.open_inquiry(p_booking, p_actor);

  -- The citation.
  update public.bookings set relationship_id = v_rel where id = p_booking;

  -- CEREMONY TWO: Establish/Find — its own single entry.
  insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, relationship_ref)
    values (v_tenant, p_booking,
      case when v_found then 'relationship_found' else 'relationship_established' end,
      p_actor, v_rel);
  return jsonb_build_object('outcome', case when v_found then 'found' else 'established' end,
                            'relationship_id', v_rel);
end $$;

-- ═══ CEREMONY: adopt_engagement — explicit, singular, never re-writes ═══
create or replace function public.adopt_engagement(
  p_booking uuid, p_relationship uuid, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_ref    uuid;
begin
  select b.relationship_id into v_ref from public.bookings b
    where b.id = p_booking and b.tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_ref is not null then raise exception 'CEREMONY_ALREADY_ATTACHED'; end if;
  perform 1 from public.relationships r
    where r.id = p_relationship and r.tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_RELATIONSHIP_NOT_FOUND'; end if;

  update public.bookings set relationship_id = p_relationship where id = p_booking;
  insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, relationship_ref)
    values (v_tenant, p_booking, 'engagement_adopted', p_actor, p_relationship);
  return jsonb_build_object('outcome', 'adopted');
end $$;

-- ═══ CEREMONY: correct_citation — corrections stay visible ═══
create or replace function public.correct_citation(
  p_booking uuid, p_relationship uuid, p_actor text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_prev   uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'CEREMONY_REASON_REQUIRED';
  end if;
  select b.relationship_id into v_prev from public.bookings b
    where b.id = p_booking and b.tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_prev is null then raise exception 'CEREMONY_NOTHING_TO_CORRECT'; end if;
  if v_prev = p_relationship then raise exception 'CEREMONY_CORRECTION_CHANGES_NOTHING'; end if;
  perform 1 from public.relationships r
    where r.id = p_relationship and r.tenant_id = v_tenant;
  if not found then raise exception 'CEREMONY_RELATIONSHIP_NOT_FOUND'; end if;

  update public.bookings set relationship_id = p_relationship where id = p_booking;
  -- The earlier adoption/establishment entry is NOT deleted, NOT amended:
  -- the history honestly reads "attached to A; corrected to B because…".
  insert into public.engagement_ledger
      (tenant_id, booking_id, ceremony, actor, relationship_ref, prev_relationship_ref, reason)
    values (v_tenant, p_booking, 'citation_corrected', p_actor,
            p_relationship, v_prev, btrim(p_reason));
  return jsonb_build_object('outcome', 'corrected');
end $$;

-- ═══ CEREMONY: amend_relationship — owned facts; identity changes ledgered WITHOUT values ═══
create or replace function public.amend_relationship(
  p_relationship uuid, p_actor text,
  p_name text, p_kind text, p_phones text[], p_emails text[], p_notes text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_phones  text[];
  v_emails  text[];
  v_changed boolean;
begin
  select r.phones, r.emails into v_phones, v_emails from public.relationships r
    where r.id = p_relationship and r.tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'CEREMONY_IDENTITY_REQUIRED'; end if;

  v_changed := (v_phones is distinct from p_phones) or (v_emails is distinct from p_emails);
  update public.relationships set
    name = btrim(p_name),
    kind = coalesce(nullif(btrim(p_kind), ''), kind),
    phones = coalesce(p_phones, phones),
    emails = coalesce(p_emails, emails),
    standing_notes = p_notes
    where id = p_relationship;

  if v_changed then
    -- THAT identity was amended — never WHAT it became. No PII in the ledger.
    insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, relationship_ref)
      select v_tenant, b.id, 'relationship_identity_amended', p_actor, p_relationship
        from public.bookings b
        where b.relationship_id = p_relationship and b.tenant_id = v_tenant
        limit 1;
    -- (an unattached party's amendment has no engagement to file under; the
    --  fact update itself is the record until its first citation exists)
  end if;
  return jsonb_build_object('outcome', 'amended', 'identity_changed', v_changed);
end $$;
