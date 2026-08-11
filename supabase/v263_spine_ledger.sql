-- ═══════════════════════════════════════════════════════════════════════════
-- v263 — PL-1 · SPINE & LEDGER (the first Proposal Lifecycle slice)
--
-- Two laws made real, and nothing else:
--   THE SPINE   bookings.spine_state — the engagement's CEREMONIAL lifecycle
--               position. NULLABLE, and NULL is meaningful: an untouched
--               legacy engagement has NO ceremonial spine state (its honest
--               effective position is a read-time, legacy-derived
--               classification computed in the app — never stored, never
--               fabricated). The full constitutional vocabulary is admitted
--               by CHECK so later slices never re-open the column, but PL-1
--               ceremonies write ONLY inquiry/proposing/declined. Dormant
--               states are values with no door: no function here reaches
--               committed, in_execution, delivered, settled, or cancelled.
--   THE LEDGER  engagement_ledger — append-only at the storage layer
--               (insert + select policies ONLY; no update, no delete —
--               the blueprint_compositions discipline: policy, not
--               politeness). One entry per ceremony: engagement, ceremony,
--               actor, moment (all four required), transition, reason.
--               No commercial content, by construction. The ledger is
--               MEMORY, not state: nothing computes state from it.
--
-- THE GUARDRAIL (operator's implementation note, enforced as law): PL-1
-- ceremonies are unavailable to legacy rows whose derived classification is
-- ahead of the ceremony's permitted source. No bridge transitions exist:
--   open_inquiry     requires a VIRGIN engagement (no spine, no proposals);
--   open_proposing   transitions only from ceremonial inquiry; on a legacy
--                    row it returns 'legacy_untouched' — no state write, no
--                    ledger write — so the product keeps working while the
--                    row stays honestly derived;
--   decline          requires ceremonial inquiry|proposing; legacy refused.
-- Honest grandfathering: this migration BACKFILLS NOTHING — no spine_state
-- update, no ledger seed. The ledger begins empty and fills only with real
-- ceremonies.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The spine column: nullable, full vocabulary, no default ──
do $$ begin
  alter table public.bookings add column if not exists spine_state text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.bookings add constraint bookings_spine_state_chk
    check (spine_state is null or spine_state in
      ('inquiry','proposing','committed','in_execution',
       'delivered','settled','declined','cancelled'));
exception when duplicate_object then null; end $$;

-- ── The ledger: append-only engagement history ──
create table if not exists public.engagement_ledger (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  ceremony    text not null,                 -- opened | proposing | declined | offer_withdrawn (PL-1 kinds)
  actor       text not null,                 -- who performed the ceremony
  moment      timestamptz not null default now(),
  from_state  text,                          -- spine ceremonies: the state left
  to_state    text,                          -- spine ceremonies: the state entered
  object_ref  uuid,                          -- offer ceremonies: the version concerned
  reason      text                           -- where the ceremony requires one
);
create index if not exists ix_engagement_ledger_booking
  on public.engagement_ledger (booking_id, moment);
create index if not exists ix_engagement_ledger_tenant
  on public.engagement_ledger (tenant_id);

alter table public.engagement_ledger enable row level security;
do $$ begin
  begin
    create policy el_select on public.engagement_ledger
      for select using (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
  begin
    create policy el_insert on public.engagement_ledger
      for insert with check (tenant_id = public.current_tenant_id());
  exception when duplicate_object then null; end;
  -- Deliberately NO update policy and NO delete policy: append-only is a
  -- property of the object, not a convention the application chooses.
end $$;

-- ═══ CEREMONY: open_inquiry — births the spine (virgin engagements only) ═══
create or replace function public.open_inquiry(
  p_booking uuid, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_state  text;
  v_props  int;
begin
  select b.spine_state into v_state from public.bookings b
    where b.id = p_booking and b.tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_state is not null then raise exception 'CEREMONY_ALREADY_ON_SPINE'; end if;
  -- THE GUARDRAIL: a legacy engagement with proposals is derived-ahead of
  -- Inquiry; no bridge exists. Only a virgin engagement opens here.
  select count(*) into v_props from public.proposals p where p.booking_id = p_booking;
  if v_props > 0 then raise exception 'CEREMONY_LEGACY_AHEAD'; end if;

  update public.bookings set spine_state = 'inquiry' where id = p_booking;
  insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, from_state, to_state)
    values (v_tenant, p_booking, 'opened', p_actor, null, 'inquiry');
  return jsonb_build_object('outcome', 'transitioned', 'to', 'inquiry');
end $$;

-- ═══ CEREMONY: open_proposing — the negotiation begins ═══
-- Attached at the create-proposal choke point. Three honest outcomes:
--   transitioned      ceremonial inquiry → proposing (+ one ledger entry)
--   already           ceremonial proposing — silently satisfied, NO entry
--   legacy_untouched  no ceremonial state — the legacy row stays derived;
--                     NO state write, NO ledger write, the create proceeds.
create or replace function public.open_proposing(
  p_booking uuid, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_state  text;
begin
  select b.spine_state into v_state from public.bookings b
    where b.id = p_booking and b.tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_state is null then
    return jsonb_build_object('outcome', 'legacy_untouched');
  end if;
  if v_state = 'proposing' then
    return jsonb_build_object('outcome', 'already');
  end if;
  if v_state <> 'inquiry' then raise exception 'CEREMONY_BAD_SOURCE_STATE'; end if;

  update public.bookings set spine_state = 'proposing' where id = p_booking;
  insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, from_state, to_state)
    values (v_tenant, p_booking, 'proposing', p_actor, 'inquiry', 'proposing');
  return jsonb_build_object('outcome', 'transitioned', 'to', 'proposing');
end $$;

-- ═══ CEREMONY: decline_engagement — the pre-commitment terminal ═══
create or replace function public.decline_engagement(
  p_booking uuid, p_actor text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_state  text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'CEREMONY_REASON_REQUIRED';
  end if;
  select b.spine_state into v_state from public.bookings b
    where b.id = p_booking and b.tenant_id = v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  -- Legacy rows (NULL) have no ceremonial state to decline from; and past
  -- Proposing is Cancellation's territory (PL-10), which does not exist.
  if v_state is null or v_state not in ('inquiry','proposing') then
    raise exception 'CEREMONY_BAD_SOURCE_STATE';
  end if;

  update public.bookings set spine_state = 'declined' where id = p_booking;
  insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, from_state, to_state, reason)
    values (v_tenant, p_booking, 'declined', p_actor, v_state, 'declined', btrim(p_reason));
  return jsonb_build_object('outcome', 'transitioned', 'to', 'declined');
end $$;

-- ═══ CEREMONY: withdraw_offer — the explicit offer terminal ═══
-- Version-scoped; needs no spine state (available on legacy threads too).
-- Superseded, by contrast, has NO WRITER in this slice: nothing here or in
-- the app sets it — replacement of the active offer is a fact no PL-1
-- ceremony can honestly prove (that law arrives with PL-3/PL-4).
create or replace function public.withdraw_offer(
  p_version uuid, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_status  text;
  v_booking uuid;
begin
  select v.status, p.booking_id into v_status, v_booking
    from public.proposal_versions v
    join public.proposals p on p.id = v.proposal_id
    join public.bookings b on b.id = p.booking_id and b.tenant_id = v_tenant
    where v.id = p_version for update of v;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_status in ('approved','withdrawn','superseded') then
    raise exception 'CEREMONY_OFFER_TERMINAL';
  end if;

  update public.proposal_versions set status = 'withdrawn' where id = p_version;
  insert into public.engagement_ledger (tenant_id, booking_id, ceremony, actor, object_ref)
    values (v_tenant, v_booking, 'offer_withdrawn', p_actor, p_version);
  return jsonb_build_object('outcome', 'withdrawn');
end $$;
