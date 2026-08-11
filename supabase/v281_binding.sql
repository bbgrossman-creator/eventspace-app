-- ═══════════════════════════════════════════════════════════════════════════
-- v281 — ENGAGEMENT VENUE BINDING · RELATIONS  [MIGRATION]
--
-- BOUNDED ARCHITECTURE RULING (settled per the v281 directive, from inspection):
--  1. DOMAIN: the binding is a SCHEDULING fact — place is Scheduling's half of
--     time-and-place (frozen venue architecture §4).
--  2. ATTACHMENT: to the BOOKING row — the repository's stable Engagement
--     identity (uuid, FK-able in fixture and production; every spine ceremony
--     already keys on it).
--  3. CURRENT BINDING: derived, never stored — the latest binding fact by a
--     monotonic insertion sequence (seq desc): unambiguous even for facts
--     recorded in one transaction or the same instant. Append-only history.
--  4. CORRECTION: a new binding fact carrying reason + replaces lineage
--     (auto-linked to the fact it supersedes). Nothing rewritten.
--  5. UNBIND: not implemented — correction to the right venue suffices; a
--     null-venue unbind adds semantics with no operational need. DEFERRED.
--  6. LEGACY COEXISTENCE: offprem_address/street/city untouched; binding is
--     additive; unbound bookings behave exactly as today.
--  7. SNAPSHOT: the fact stores venue name/address AS DISPLAY PROVENANCE ONLY
--     (what the binder saw) — never a second authoritative venue truth.
--  8. REDIRECTS: reads resolve through v280 resolve_venue(); the original
--     fact remains historically bound to its venue. Binding TO an
--     already-redirected venue is refused (VENUE_REDIRECTED) — bind canonical.
--  9. RACE POSTURE (chosen explicitly): the ceremony locks the booking row
--     FOR UPDATE → concurrent binds/corrections serialize; BOTH append; the
--     derivation is deterministic (latest wins). Proven in v281 races.
-- 10. NO NEW CONTENTION LAW: binding creates no room claim and no off-prem
--     resource law; findConflicts is untouched.
--
-- Invariants: I-B1 tenant isolation (RLS + ceremony); I-B2 booking and venue
-- must share the binding's tenant (trigger backstop); I-B3 append-only (no
-- update/delete path); I-B4 valid replaces lineage (same booking, same tenant);
-- I-B5 deterministic current derivation; I-B6 no dependency from room law onto
-- binding (REG proof); I-B7 no modification of off-premise fields.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.engagement_venue_binding (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null,
  booking_id           uuid not null references public.bookings(id),
  venue_id             uuid not null references public.venue(id),
  replaces_binding_id  uuid references public.engagement_venue_binding(id),
  reason               text,
  venue_name_snapshot  text not null,   -- display provenance only, never truth
  venue_address_snapshot text,
  bound_by             text not null,
  seq                  bigint generated always as identity,  -- deterministic order (I-B5)
  created_at           timestamptz not null default clock_timestamp()
);
create index if not exists evb_booking_idx on public.engagement_venue_binding (tenant_id, booking_id, seq desc);

-- I-B2/I-B4 backstop (ceremonies are the front door; this cannot be bypassed)
create or replace function public.evb_integrity_guard() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.bookings b where b.id=new.booking_id and b.tenant_id=new.tenant_id)
    then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if not exists (select 1 from public.venue v where v.id=new.venue_id and v.tenant_id=new.tenant_id)
    then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if new.replaces_binding_id is not null and not exists
     (select 1 from public.engagement_venue_binding p
       where p.id=new.replaces_binding_id and p.tenant_id=new.tenant_id and p.booking_id=new.booking_id)
    then raise exception 'BINDING_INVALID_LINEAGE'; end if;
  return new;
end $$;
drop trigger if exists evb_integrity on public.engagement_venue_binding;
create trigger evb_integrity before insert on public.engagement_venue_binding
  for each row execute function public.evb_integrity_guard();

alter table public.engagement_venue_binding enable row level security;
do $$ begin
  begin create policy evb_sel on public.engagement_venue_binding for select
    using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy evb_ins on public.engagement_venue_binding for insert
    with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  -- deliberately NO update/delete policies (I-B3)
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant select, insert on public.engagement_venue_binding to authenticated; end if;
  if exists (select 1 from pg_roles where rolname='app_user') then
    grant select, insert on public.engagement_venue_binding to authenticated; end if;
end $$;

-- ─────────────────────────── CEREMONIES ─────────────────────────────────────
-- bind_engagement_venue: initial bind AND correction are one ceremony — a
-- correction is simply a bind that replaces the current fact, with a reason.
create or replace function public.bind_engagement_venue(
  p_booking uuid, p_venue uuid, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); v_ven record; v_cur record; v_id uuid;
begin
  if not public.can_manage_venues() then raise exception 'VENUE_NOT_AUTHORIZED'; end if;
  -- serialize on the engagement (race posture #9)
  perform 1 from public.bookings where id=p_booking and tenant_id=v_tenant for update;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  select * into v_ven from public.venue where id=p_venue and tenant_id=v_tenant;
  if not found then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if v_ven.redirect_to is not null then raise exception 'VENUE_REDIRECTED'; end if;
  select * into v_cur from public.engagement_venue_binding
    where booking_id=p_booking and tenant_id=v_tenant
    order by seq desc limit 1;
  if found and v_cur.venue_id = p_venue then raise exception 'BINDING_UNCHANGED'; end if;
  if found and coalesce(trim(p_reason),'') = '' then
    raise exception 'BINDING_REASON_REQUIRED';   -- corrections must be attributed
  end if;
  insert into public.engagement_venue_binding
      (tenant_id, booking_id, venue_id, replaces_binding_id, reason,
       venue_name_snapshot, venue_address_snapshot, bound_by)
    values (v_tenant, p_booking, p_venue, v_cur.id, nullif(trim(p_reason),''),
            v_ven.name, v_ven.address, public.action_actor())
    returning id into v_id;
  return jsonb_build_object('binding_id', v_id, 'venue_id', p_venue,
                            'replaced', v_cur.id is not null);
end $$;

-- current binding, redirect-aware: originally-bound vs currently-resolved
create or replace function public.current_venue_binding(p_booking uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_tenant uuid := public.current_tenant_id(); c record; v_res uuid; v_res_name text; v_res_addr text; n int;
begin
  perform 1 from public.bookings where id=p_booking and tenant_id=v_tenant;
  if not found then return null; end if;                       -- non-disclosure
  select * into c from public.engagement_venue_binding
    where booking_id=p_booking and tenant_id=v_tenant
    order by seq desc limit 1;
  if not found then return null; end if;                       -- lawfully unbound
  v_res := public.resolve_venue(c.venue_id);
  select name, address into v_res_name, v_res_addr from public.venue where id=v_res and tenant_id=v_tenant;
  select count(*) into n from public.engagement_venue_binding where booking_id=p_booking and tenant_id=v_tenant;
  return jsonb_build_object(
    'binding_id', c.id,
    'bound_venue_id', c.venue_id,
    'bound_name_snapshot', c.venue_name_snapshot,
    'bound_address_snapshot', c.venue_address_snapshot,
    'resolved_venue_id', v_res,
    'resolved_name', v_res_name,
    'resolved_address', v_res_addr,
    'redirected', (v_res is distinct from c.venue_id),
    'bound_by', c.bound_by, 'bound_at', c.created_at, 'reason', c.reason,
    'history_count', n);
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant execute on function public.bind_engagement_venue(uuid,uuid,text), public.current_venue_binding(uuid) to authenticated; end if;
  if exists (select 1 from pg_roles where rolname='app_user') then
    grant execute on function public.bind_engagement_venue(uuid,uuid,text), public.current_venue_binding(uuid) to authenticated; end if;
end $$;
