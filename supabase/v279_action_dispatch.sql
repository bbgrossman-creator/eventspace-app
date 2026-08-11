-- ═══════════════════════════════════════════════════════════════════════════
-- v279 — AUTHORITATIVE ACTION ROUTING · DISPATCHER + IDEMPOTENCY LEDGER  [MIGRATION]
-- One default-deny routing ceremony. It resolves actor/tenant server-side, resolves
-- a CLOSED registered action, validates target/authority/payload, enforces
-- idempotency, and calls EXACTLY ONE registered ceremony via a typed CASE (no
-- dynamic SQL, no client function names). It performs NO direct writes to domain
-- tables — the seven existing ceremonies remain the only authoritative writers.
--
-- LOCK ORDER (explicit): action_invocation unique-index (pending insert) → domain
-- ceremony lock (booking / event / requirement FOR UPDATE). Never the reverse; the
-- registry/projection take no locks, so no inversion and no new deadlock cycle.
--
-- action_invocation is ROUTING METADATA, not domain truth: it never drives coverage,
-- lifecycle, or readiness. Clients get SELECT only (their tenant); all writes are by
-- this SECURITY DEFINER dispatcher as table owner — clients cannot forge invocations.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.action_invocation (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  action_key      text not null,
  target_id       uuid not null,
  idempotency_key text not null,
  payload_hash    text not null,
  actor           text not null,
  outcome         text not null,                 -- 'success' (only successful executions persist)
  result          jsonb,
  evidence_ref    uuid,
  created_at      timestamptz not null default now(),
  constraint action_invocation_idem_unique unique (tenant_id, idempotency_key)
);
create index if not exists action_invocation_target_idx on public.action_invocation (tenant_id, target_id);

alter table public.action_invocation enable row level security;
do $$ begin
  begin create policy ainv_select on public.action_invocation for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  -- deliberately NO insert/update/delete policy: only the SECURITY DEFINER dispatcher writes
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then grant select on public.action_invocation to authenticated; end if;
  if exists (select 1 from pg_roles where rolname='app_user')    then grant select on public.action_invocation to authenticated;    end if;
end $$;

-- envelope helper
create or replace function public.action_envelope(
  p_ok boolean, p_action text, p_outcome text, p_reason text, p_message text,
  p_target_type text, p_target_id uuid, p_result jsonb, p_evidence uuid, p_idem text)
returns jsonb language sql immutable
as $$
  select jsonb_build_object(
    'ok', p_ok, 'action_key', p_action, 'outcome', p_outcome,
    'reason_code', p_reason, 'message', p_message,
    'target_type', p_target_type, 'target_id', p_target_id,
    'result', p_result, 'evidence_ref', p_evidence, 'idempotency_key', p_idem);
$$;

-- classify a domain refusal message into a stable reason code (no secret leakage)
create or replace function public.action_reason_of(p_msg text)
returns text language sql immutable
as $$
  select case
    when p_msg like '%NOT_AUTHORIZED%' then 'unauthorized'
    when p_msg like '%CEREMONY_NOT_FOUND%' then 'stale_target'
    when p_msg like '%ALREADY%' then 'already_completed'
    when p_msg like '%NOT_READY%' or p_msg like '%UNCOVERED%' or p_msg like '%PENDING%'
      or p_msg like '%PREDICATE%' or p_msg like '%NOT_IN_SERVICE%' or p_msg like '%CLOSED%'
      or p_msg like '%DUPLICATE%' or p_msg like '%INVALID%' then 'lawful_refusal'
    else 'lawful_refusal' end;
$$;

-- ── the dispatcher ─────────────────────────────────────────────────────────
create or replace function public.perform_event_action(
  p_action_key text, p_target_id uuid, p_payload jsonb default '{}'::jsonb, p_idempotency_key text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  reg record; ts record; v_actor text; v_hash text; v_res jsonb; v_evid uuid;
  v_missing text; inv record; v_event uuid; f text;
begin
  if v_tenant is null then
    return public.action_envelope(false,p_action_key,'unauthorized','no_tenant','no authenticated tenant',null,p_target_id,null,null,p_idempotency_key);
  end if;
  select * into reg from public.action_registry() where action_key=p_action_key;
  if not found then
    return public.action_envelope(false,p_action_key,'unknown','unknown_action','no such registered action',null,p_target_id,null,null,p_idempotency_key);
  end if;
  p_payload := coalesce(p_payload,'{}'::jsonb);

  -- reject forbidden privileged payload fields (no client-supplied authority)
  foreach f in array array['tenant_id','tenant','role','actor_role','actor','__proto__'] loop
    if p_payload ? f then
      return public.action_envelope(false,p_action_key,'invalid','forbidden_field','payload may not carry authority fields',reg.target_type,p_target_id,null,null,p_idempotency_key);
    end if;
  end loop;

  -- required-field validation
  select string_agg(k,', ') into v_missing from unnest(public.action_required_fields(p_action_key)) k
    where not (p_payload ? k) or coalesce(p_payload->>k,'')='';
  if v_missing is not null then
    return public.action_envelope(false,p_action_key,'invalid','missing_required','missing required: '||v_missing,reg.target_type,p_target_id,null,null,p_idempotency_key);
  end if;

  -- target ownership / staleness (cross-tenant resolves here as stale, no leak)
  select * into ts from public.action_target_status(reg.target_type, p_target_id);
  if not ts.found then
    return public.action_envelope(false,p_action_key,'stale','stale_target','target not found',reg.target_type,p_target_id,null,null,p_idempotency_key);
  end if;
  v_event := ts.event_ref;

  -- authority (advisory pre-check; the ceremony remains final)
  if not public.action_authorized(p_action_key) then
    return public.action_envelope(false,p_action_key,'unauthorized','unauthorized','actor not authorized',reg.target_type,p_target_id,null,null,p_idempotency_key);
  end if;

  v_actor := public.action_actor();
  v_hash := encode(extensions.digest(p_payload::text,'sha256'),'hex');

  -- idempotency pre-check (deterministic replay / mismatch)
  if p_idempotency_key is not null then
    select * into inv from public.action_invocation where tenant_id=v_tenant and idempotency_key=p_idempotency_key;
    if found then
      if inv.action_key<>p_action_key or inv.target_id<>p_target_id or inv.payload_hash<>v_hash then
        return public.action_envelope(false,p_action_key,'invalid','idempotency_mismatch','idempotency key reused with a different request',reg.target_type,p_target_id,null,null,p_idempotency_key);
      end if;
      return public.action_envelope(true,p_action_key,'duplicate','idempotent_replay','replayed prior result',reg.target_type,p_target_id,inv.result,inv.evidence_ref,p_idempotency_key);
    end if;
  end if;

  -- execute: pending-insert (serialize) → ceremony → persist success. Refusal rolls
  -- back the pending row (savepoint), so a failed attempt never burns the key.
  begin
    if p_idempotency_key is not null then
      begin
        insert into public.action_invocation(tenant_id,action_key,target_id,idempotency_key,payload_hash,actor,outcome)
          values (v_tenant,p_action_key,p_target_id,p_idempotency_key,v_hash,v_actor,'pending');
      exception when unique_violation then
        select * into inv from public.action_invocation where tenant_id=v_tenant and idempotency_key=p_idempotency_key;
        if inv.action_key<>p_action_key or inv.target_id<>p_target_id or inv.payload_hash<>v_hash then
          return public.action_envelope(false,p_action_key,'invalid','idempotency_mismatch','idempotency key reused with a different request',reg.target_type,p_target_id,null,null,p_idempotency_key);
        end if;
        return public.action_envelope(true,p_action_key,'duplicate','idempotent_replay','replayed prior result',reg.target_type,p_target_id,inv.result,inv.evidence_ref,p_idempotency_key);
      end;
    end if;

    -- typed dispatch to EXACTLY the one registered ceremony (no dynamic SQL)
    if    p_action_key='release_event' then
      v_res := public.release_event(p_target_id, v_actor, p_payload->>'signoff_ref', p_payload->>'clearance_ref', p_payload->>'waiver_ref');
      v_event := (v_res->>'event_id')::uuid;
    elsif p_action_key='start_service' then
      v_res := public.start_service(p_target_id, v_actor);
    elsif p_action_key='close_event' then
      v_res := public.close_event(p_target_id, v_actor, p_payload->>'closeout_override');
    elsif p_action_key='record_execution_evidence' then
      v_evid := public.record_execution_evidence(p_target_id, nullif(p_payload->>'obligation','')::uuid, p_payload->>'kind', v_actor,
                  coalesce(p_payload->'payload','{}'::jsonb), nullif(p_payload->>'prior','')::uuid);
      v_res := jsonb_build_object('evidence_id', v_evid);
    elsif p_action_key='assign_staff' then
      v_res := public.assign_staff(p_target_id, (p_payload->>'staff')::uuid, (p_payload->>'window_start')::timestamptz, (p_payload->>'window_end')::timestamptz, v_actor);
    elsif p_action_key='correct_staffing_assignment' then
      v_res := public.correct_staffing_assignment(p_target_id, (p_payload->>'new_staff')::uuid, (p_payload->>'window_start')::timestamptz, (p_payload->>'window_end')::timestamptz, v_actor, p_payload->>'reason');
    elsif p_action_key='release_staffing_assignment' then
      v_res := public.release_staffing_assignment(p_target_id, v_actor, p_payload->>'reason');
    end if;

    if p_idempotency_key is not null then
      update public.action_invocation set outcome='success', result=v_res, evidence_ref=v_evid
        where tenant_id=v_tenant and idempotency_key=p_idempotency_key;
    end if;

    return public.action_envelope(true,p_action_key,'success','ok','action executed',reg.target_type,p_target_id,v_res,v_evid,p_idempotency_key)
      || jsonb_build_object('workspace', case when v_event is not null then public.event_workspace(v_event) else null end,
                            'available_actions', case when v_event is not null then public.event_available_actions(v_event) else null end);

  exception when others then
    -- lawful ceremony refusal (or error): savepoint rolls back the pending row
    return public.action_envelope(false,p_action_key,'refused',public.action_reason_of(sqlerrm),sqlerrm,reg.target_type,p_target_id,null,null,p_idempotency_key);
  end;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant execute on function public.action_envelope(boolean,text,text,text,text,text,uuid,jsonb,uuid,text),
      public.action_reason_of(text), public.perform_event_action(text,uuid,jsonb,text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname='app_user') then
    grant execute on function public.action_envelope(boolean,text,text,text,text,text,uuid,jsonb,uuid,text),
      public.action_reason_of(text), public.perform_event_action(text,uuid,jsonb,text) to app_user;
  end if;
end $$;
