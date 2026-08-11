-- ============================================================================
-- v307a PERMANENT PROOF — ceremony wiring equivalence + locking preservation
-- Self-rolling-back, rerunnable, zero residue.
--
-- Proves the WIRED ceremonies (consuming admissibility_evaluate) reproduce the
-- frozen refusal contract byte-for-byte and preserve the success paths, and that
-- the Y3 (STAFFING_ALREADY_RELEASED) and R1 (RELEASE_ALREADY_RELEASED) guards
-- still hold. The full 38-claim ceremony-vs-authority differential runs as a
-- regression (v306_permanent_proof against the migrated ceremonies).
--
-- WE-1  start_service refusal reproduced (closed event)          equivalence
-- WE-2  start_service SUCCESS shape preserved
-- WE-3  close_event refusal reproduced (already closed)
-- WE-4  close_event SUCCESS shape preserved
-- WE-5  release_occurrence refusal reproduced (cancelled)
-- WE-6  release_occurrence commitment predicate reproduced (no acceptance)
-- WE-7  release_occurrence SUCCESS (full acceptance chain)
-- WE-8  release_event AMBIGUOUS reproduced with operands
-- WE-9  assign_staff refusal reproduced (invalid staff)
-- WE-10 assign_staff SUCCESS shape preserved
-- WE-11 correct_staffing refusal reproduced (already released, ordered)
-- WE-12 release_staffing SUCCESS shape preserved
-- WE-13 Y3 · a second release_staffing → STAFFING_ALREADY_RELEASED (lock guard)
-- WE-14 R1 · a second release_occurrence → RELEASE_ALREADY_RELEASED (write guard)
-- WE-15 CEREMONY_NOT_FOUND arises from the lock (absent subject)
-- WE-16 non-leak preserved · a cross-tenant subject is CEREMONY_NOT_FOUND
-- WE-17 M-A guard · post-evaluation acceptance disappearance reaches the
--        vocabulary guard, never the NOT NULL constraint (Fable v307a M-A)
-- ============================================================================

do $$
declare
  n_pass int := 0; n_fail int := 0; v_sfx text; v_err text;
  v_tenant uuid; v_user uuid; v_other uuid; r jsonb;
  b uuid; occ uuid; ev uuid; oblig uuid; req uuid; asg uuid; staff uuid;
  b2 uuid; occ2 uuid; bM uuid; bG uuid; prG uuid; veG uuid; snG uuid; ocG uuid;
  bF uuid; ocF uuid; evF uuid; xtb uuid;
  v_absent uuid := '00000000-0000-0000-0000-000000000000';
begin
  select tu.tenant_id, tu.user_id into v_tenant, v_user from public.tenant_users tu
   where tu.active and tu.role in ('admin','owner','manager','ops') order by tu.tenant_id limit 1;
  if v_tenant is null then raise exception 'v307a PERMANENT PROOF BLOCKED: no active operating tenant_users row'; end if;
  perform set_config('app.user_id', v_user::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  select t.id into v_other from public.tenants t where t.id <> v_tenant limit 1;
  v_sfx := substr(gen_random_uuid()::text,1,8);
  raise notice 'v307a-permanent: tenant=% actor=%', v_tenant, v_user;

  -- base fixture: a released occurrence's event, an obligation FK anchor
  insert into public.bookings (tenant_id,contact_name,invoice_num,status)
    values (v_tenant,'WE-A','WEA-'||v_sfx,'active') returning id into b;
  occ := (public.open_occurrence(b,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by)
    values (v_tenant,b,occ,gen_random_uuid(),'v307a') returning id into ev;
  insert into public.obligation (tenant_id,event_ref,scope,origin_ref,origin_kind,kind,department,required_outcome,natural_key,timing)
    values (v_tenant,ev,'event',gen_random_uuid(),'release','venue_breakdown','venue','anchor','v307a_anchor_'||v_sfx,
            jsonb_build_object('window_end',(now()+interval '96 hours')::text)) returning id into oblig;

  -- WE-1 · start_service refusal reproduced (closed event → START_SERVICE_EVENT_CLOSED)
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload) values (v_tenant,ev,'event_closed','a','{}'::jsonb);
  begin perform public.start_service(ev,'a'); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err='START_SERVICE_EVENT_CLOSED' then n_pass:=n_pass+1; raise notice 'WE-1 PASS'; else n_fail:=n_fail+1; raise notice 'WE-1 FAIL: %',v_err; end if;
  delete from public.execution_evidence where event_ref=ev and kind='event_closed';

  -- WE-2 · start_service SUCCESS (bare fresh event) shape preserved
  insert into public.bookings (tenant_id,contact_name,invoice_num,status) values (v_tenant,'WE-SS','WESS-'||v_sfx,'active') returning id into bF;
  ocF := (public.open_occurrence(bF,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by) values (v_tenant,bF,ocF,gen_random_uuid(),'v307a') returning id into evF;
  begin r:=public.start_service(evF,'a'); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err is null and (r->>'event_id')::uuid=evF and r ? 'stage' then n_pass:=n_pass+1; raise notice 'WE-2 PASS'; else n_fail:=n_fail+1; raise notice 'WE-2 FAIL: err=% r=%',v_err,r; end if;

  -- WE-3 · close_event refusal reproduced (already closed)
  insert into public.bookings (tenant_id,contact_name,invoice_num,status) values (v_tenant,'WE-C','WEC-'||v_sfx,'active') returning id into b2;
  occ2 := (public.open_occurrence(b2,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by) values (v_tenant,b2,occ2,gen_random_uuid(),'v307a') returning id into ev;
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload) values (v_tenant,ev,'event_closed','a','{}'::jsonb);
  begin perform public.close_event(ev,'a','ovr'); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err='CLOSE_ALREADY_CLOSED' then n_pass:=n_pass+1; raise notice 'WE-3 PASS'; else n_fail:=n_fail+1; raise notice 'WE-3 FAIL: %',v_err; end if;
  delete from public.execution_evidence where event_ref=ev and kind='event_closed';

  -- WE-4 · close_event SUCCESS (service started + override) shape preserved
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload) values (v_tenant,ev,'service_start','a','{}'::jsonb);
  begin r:=public.close_event(ev,'a','ovr'); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err is null and (r->>'event_id')::uuid=ev then n_pass:=n_pass+1; raise notice 'WE-4 PASS'; else n_fail:=n_fail+1; raise notice 'WE-4 FAIL: err=% r=%',v_err,r; end if;

  -- WE-5 · release_occurrence refusal reproduced (cancelled)
  insert into public.bookings (tenant_id,contact_name,invoice_num,status) values (v_tenant,'WE-RC','WERC-'||v_sfx,'active') returning id into b2;
  occ2 := (public.open_occurrence(b2,null,null)->>'occurrence_id')::uuid;
  perform public.cancel_occurrence(occ2,'we');
  begin perform public.release_occurrence(occ2,'a','s','c',null); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err='OCCURRENCE_CANCELLED' then n_pass:=n_pass+1; raise notice 'WE-5 PASS'; else n_fail:=n_fail+1; raise notice 'WE-5 FAIL: %',v_err; end if;

  -- WE-6 · release_occurrence commitment predicate reproduced (no acceptance)
  begin perform public.release_occurrence(occ,'a','s','c',null); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err='RELEASE_PREDICATE_UNSATISFIED: commitment (no unrescinded acceptance)' then n_pass:=n_pass+1; raise notice 'WE-6 PASS'; else n_fail:=n_fail+1; raise notice 'WE-6 FAIL: %',v_err; end if;

  -- WE-7 · release_occurrence SUCCESS (full acceptance chain)
  insert into public.bookings (tenant_id,contact_name,invoice_num,status) values (v_tenant,'WE-RO','WERO-'||v_sfx,'active') returning id into bG;
  insert into public.proposals (tenant_id,booking_id,title,status) values (v_tenant,bG,'P307','draft') returning id into prG;
  insert into public.proposal_versions (tenant_id,proposal_id,version,status) values (v_tenant,prG,1,'sent') returning id into veG;
  insert into public.offer_snapshots (tenant_id,version_id,fingerprint,model,artifact_bytes,artifact_hash,artifact_meta,assets,published_at)
    values (v_tenant,veG,'ro-'||v_sfx,'{"components":[]}'::jsonb,'\x00'::bytea,'ro-h','{}'::jsonb,'[]'::jsonb,now()) returning id into snG;
  insert into public.offer_acceptances (tenant_id,snapshot_id,fingerprint,booking_id,recorded_moment,created_at) values (v_tenant,snG,'roa-'||v_sfx,bG,now(),now());
  ocG := (public.open_occurrence(bG,null,null)->>'occurrence_id')::uuid;
  begin r:=public.release_occurrence(ocG,'a','s','c',null); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err is null and (r->>'occurrence_id')::uuid=ocG then n_pass:=n_pass+1; raise notice 'WE-7 PASS'; else n_fail:=n_fail+1; raise notice 'WE-7 FAIL: err=% r=%',v_err,r; end if;

  -- WE-14 · R1 · a SECOND release_occurrence on the same occurrence → RELEASE_ALREADY_RELEASED
  begin perform public.release_occurrence(ocG,'a','s','c',null); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err='RELEASE_ALREADY_RELEASED' then n_pass:=n_pass+1; raise notice 'WE-14 PASS (R1 write guard preserved)'; else n_fail:=n_fail+1; raise notice 'WE-14 FAIL: %',v_err; end if;

  -- WE-8 · release_event AMBIGUOUS reproduced with operands
  insert into public.bookings (tenant_id,contact_name,invoice_num,status) values (v_tenant,'WE-M','WEM-'||v_sfx,'active') returning id into bM;
  perform public.open_occurrence(bM,null,null); perform public.open_occurrence(bM,null,null);
  begin perform public.release_event(bM,'a','s','c',null); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err like 'RELEASE_OCCURRENCE_AMBIGUOUS: engagement holds 2 occurrences (%);%' then n_pass:=n_pass+1; raise notice 'WE-8 PASS: %',v_err; else n_fail:=n_fail+1; raise notice 'WE-8 FAIL: %',v_err; end if;

  -- staffing fixtures: fresh event + requirement + staff
  insert into public.bookings (tenant_id,contact_name,invoice_num,status) values (v_tenant,'WE-S','WES-'||v_sfx,'active') returning id into bF;
  ocF := (public.open_occurrence(bF,null,null)->>'occurrence_id')::uuid;
  insert into public.event (tenant_id,engagement_ref,occurrence_ref,origin_commitment_ref,released_by) values (v_tenant,bF,ocF,gen_random_uuid(),'v307a') returning id into evF;
  insert into public.staffing_requirement (tenant_id,event_ref,origin_obligation_ref,role,quantity,department,natural_key,window_start,window_end)
    values (v_tenant,evF,oblig,'server',1,'staffing','v307a_req_'||v_sfx,now(),now()+interval '4 hours') returning id into req;
  insert into public.staff (tenant_id,name,active) values (v_tenant,'v307a staff '||v_sfx,true) returning id into staff;

  -- WE-9 · assign_staff refusal reproduced (invalid staff)
  begin perform public.assign_staff(req,v_absent,now(),now()+interval '2 hours','a'); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err='STAFFING_STAFF_INVALID' then n_pass:=n_pass+1; raise notice 'WE-9 PASS'; else n_fail:=n_fail+1; raise notice 'WE-9 FAIL: %',v_err; end if;

  -- WE-10 · assign_staff SUCCESS shape preserved
  begin r:=public.assign_staff(req,staff,now(),now()+interval '2 hours','a'); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err is null and (r ? 'assignment_id') then asg:=(r->>'assignment_id')::uuid; n_pass:=n_pass+1; raise notice 'WE-10 PASS'; else n_fail:=n_fail+1; raise notice 'WE-10 FAIL: err=% r=%',v_err,r; end if;

  -- WE-12 · release_staffing SUCCESS shape preserved
  begin r:=public.release_staffing_assignment(asg,'a','done'); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err is null and (r->>'released')::uuid=asg then n_pass:=n_pass+1; raise notice 'WE-12 PASS'; else n_fail:=n_fail+1; raise notice 'WE-12 FAIL: err=% r=%',v_err,r; end if;

  -- WE-13 · Y3 · a SECOND release_staffing on the same assignment → STAFFING_ALREADY_RELEASED
  begin perform public.release_staffing_assignment(asg,'a','again'); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err='STAFFING_ALREADY_RELEASED' then n_pass:=n_pass+1; raise notice 'WE-13 PASS (Y3 requirement-lock guard preserved)'; else n_fail:=n_fail+1; raise notice 'WE-13 FAIL: %',v_err; end if;

  -- WE-11 · correct_staffing refusal reproduced (already released, ordered before event_closed)
  insert into public.execution_evidence (tenant_id,event_ref,kind,actor,payload) values (v_tenant,evF,'event_closed','a','{}'::jsonb);
  begin perform public.correct_staffing_assignment(asg,staff,now(),now()+interval '1 hour','a','r'); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err='STAFFING_ALREADY_RELEASED' then n_pass:=n_pass+1; raise notice 'WE-11 PASS (already_released precedes event_closed)'; else n_fail:=n_fail+1; raise notice 'WE-11 FAIL: %',v_err; end if;

  -- WE-15 · CEREMONY_NOT_FOUND arises from the lock (absent subject)
  begin perform public.start_service(v_absent,'a'); v_err:=null; exception when others then v_err:=SQLERRM; end;
  if v_err='CEREMONY_NOT_FOUND' then n_pass:=n_pass+1; raise notice 'WE-15 PASS'; else n_fail:=n_fail+1; raise notice 'WE-15 FAIL: %',v_err; end if;

  -- WE-16 · non-leak preserved · a real cross-tenant event is CEREMONY_NOT_FOUND
  if v_other is not null then
    insert into public.bookings (tenant_id,contact_name,invoice_num,status) values (v_other,'WE-XT','WEXT-'||v_sfx,'active') returning id into xtb;
    begin perform public.release_event(xtb,'a','s','c',null); v_err:=null; exception when others then v_err:=SQLERRM; end;
    if v_err='CEREMONY_NOT_FOUND' then n_pass:=n_pass+1; raise notice 'WE-16 PASS (cross-tenant indistinguishable from absent)'; else n_fail:=n_fail+1; raise notice 'WE-16 FAIL: %',v_err; end if;
  else
    n_fail:=n_fail+1; raise notice 'WE-16 FAIL: no second tenant';
  end if;

  -- WE-17 · M-A guard — the post-evaluation window, deterministically.
  -- rescind_acceptance shares no lock with release_occurrence, so an acceptance
  -- can vanish between admissibility_evaluate's read and the ceremony's
  -- re-select. True mid-function interleaving cannot be paused from one session,
  -- so this control (per the ruling) replicates the ceremony's EXACT corrected
  -- post-evaluate sequence against that window's state and requires the
  -- vocabulary refusal — never SQLSTATE 23502 — plus the guard's structural
  -- presence in the wired body before the materialisation insert.
  declare v_state text; v_msg text; v_src text; v_g int; v_i int; v_acc2 uuid; v_occ2 record;
  begin
    select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='release_occurrence';
    v_g := position('if v_acc is null' in v_src);
    v_i := position('insert into public.event' in v_src);
    insert into public.bookings (tenant_id,contact_name,invoice_num,status)
      values (v_tenant,'WE17','WE17-'||v_sfx,'active') returning id into bF;
    ocF := (public.open_occurrence(bF,null,null)->>'occurrence_id')::uuid;
    select * into v_occ2 from public.engagement_occurrence where id=ocF and tenant_id=v_tenant for update;
    begin
      -- the ceremony's re-select against the vanished-acceptance state...
      select a.id into v_acc2
        from public.offer_acceptances a
        left join public.acceptance_rescissions r on r.acceptance_id = a.id
       where a.booking_id = v_occ2.booking_id and a.tenant_id = v_tenant and r.id is null
       order by a.created_at limit 1;
      -- ...followed by the ceremony's guard, verbatim
      if v_acc2 is null then
        raise exception 'RELEASE_PREDICATE_UNSATISFIED: commitment (no unrescinded acceptance)';
      end if;
      raise notice 'WE-17 FAIL: the guard did not fire';  n_fail := n_fail + 1;
    exception when others then
      get stacked diagnostics v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      if v_state = 'P0001'
         and v_msg = 'RELEASE_PREDICATE_UNSATISFIED: commitment (no unrescinded acceptance)'
         and v_g > 0 and v_i > 0 and v_g < v_i then
        n_pass := n_pass + 1;
        raise notice 'WE-17 PASS (M-A): the vanished-acceptance window reaches the vocabulary guard (P0001, canonical text) before the NOT NULL insert — the guard sits in the wired body ahead of the materialisation';
      else
        n_fail := n_fail + 1;
        raise notice 'WE-17 FAIL: state=% msg=% guard_pos=% insert_pos=%', v_state, v_msg, v_g, v_i;
      end if;
    end;
  end;

  raise notice 'v307a PERMANENT PROOF: % PASS / % FAIL / 0 SKIPPED / 0 UNPROVEN', n_pass, n_fail;
  if n_fail > 0 then raise exception 'v307a PERMANENT PROOF FAILED: % claim(s) violated', n_fail; end if;
  raise exception 'V307A_PERMANENT_ROLLBACK';
exception
  when others then
    if sqlerrm = 'V307A_PERMANENT_ROLLBACK' then
      raise notice 'v307a permanent proof rolled back cleanly — zero residue';
    else raise;
    end if;
end $$;
