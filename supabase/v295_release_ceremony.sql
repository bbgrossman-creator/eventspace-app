-- ============================================================================
-- v295 — Promise Release
-- File:  supabase/v295_release_ceremony.sql   Apply: after v294_preparation_queue.sql
--
-- ONE thin wrapper over the certified release_occurrence, following the v293
-- Option D precedent exactly: guard with is_active_member(), derive the actor
-- with action_actor(), delegate unchanged, add no semantics.
--
-- WHY IT EXISTS. release_occurrence takes p_actor as a parameter. The house
-- discipline — enforced in every promise ceremony and by perform_event_action's
-- forbidden-field refusal — is that the client never supplies an actor.
-- Exposing the raw ceremony to a browser would send one from the client.
--
-- AUTHORIZATION. Host extraction established that NO release-specific can_*
-- predicate exists; the eight that do govern other ceremonies. is_active_member()
-- is used, corroborated independently: action_authorized() authorizes the
-- registry's release_event with exactly that predicate.
--
-- NO NARROWING. Deliberately unlike v293's duplicate-completion guard, this
-- wrapper restricts nothing the delegate permits. All three evidence refs keep
-- NULL defaults so every limb of the certified predicate — commitment,
-- clearance, sign_off — stays reachable THROUGH the wrapper and provable.
--
-- COMPLETENESS DOES NOT GATE RELEASE (v292a). No completeness check appears here
-- and none may be added. RP-11 and RQ-3 exist to fail loudly if that changes.
--
-- VOLATILE: it writes. Declaring it STABLE would be false.
-- ============================================================================

do $preflight$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='release_occurrence')
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='is_active_member')
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='action_actor') then
    raise exception 'V295_PREFLIGHT_FAILED: a required certified function is absent';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='release_promise') then
    raise exception 'V295_ALREADY_APPLIED';
  end if;
end $preflight$;

create or replace function public.release_promise(
  p_occurrence    uuid,
  p_signoff_ref   text default null,
  p_clearance_ref text default null,
  p_waiver_ref    text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor text := public.action_actor();
begin
  if not public.is_active_member() then
    raise exception 'PROMISE_NOT_AUTHORIZED: release';
  end if;

  -- Delegation only. CEREMONY_NOT_FOUND, OCCURRENCE_CANCELLED,
  -- RELEASE_PREDICATE_UNSATISFIED (commitment | clearance | sign_off) and
  -- RELEASE_ALREADY_RELEASED all surface from the certified ceremony unaltered,
  -- as do the once-per-occurrence materialisation (I-31') and the
  -- generate_obligations derivation that follows it.
  return public.release_occurrence(
           p_occurrence, v_actor, p_signoff_ref, p_clearance_ref, p_waiver_ref);
end $function$;
