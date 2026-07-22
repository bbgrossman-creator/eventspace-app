# EventCore — v279 Authoritative Action Routing · IMPLEMENTATION REPORT

A general constitutional routing layer for authoritative actions, built from the
certified v278 baseline in the order constitution → SQL registry → projection →
dispatcher → integration → proof → race → application → mounted UI → browser
acceptance → regression. The router is orchestration; the seven existing ceremonies
remain the only authoritative writers. No frozen law was reopened; the sole
integration point (event_workspace) is extended additively.

## Constitutional boundary

The router MAY: identify a registered action by a stable key, derive availability,
evaluate authority, validate the request envelope, invoke a specifically registered
ceremony, normalize the response, record immutable invocation metadata, and return
refreshed workspace-derived state. The router does NOT: write domain tables, update
lifecycle/staffing state, reproduce ceremony validation, create a second permission
system, persist available-action state, accept client function names or dynamic SQL,
trust client-supplied tenant/role, or convert refusals into false success.

## Files changed / added

Migrations (production, deploy in this order after the v278 stack):
1. `supabase/v279_action_registry.sql` — closed registry function + required-fields,
   actor, is_active_member, action_authorized helpers.
2. `supabase/v279_action_projection.sql` — action_target_status, action_evaluate,
   available_actions, event_available_actions (derived; distinct reason codes).
3. `supabase/v279_action_dispatch.sql` — `action_invocation` ledger (+RLS select-only
   for clients), action_envelope, action_reason_of, and the `perform_event_action`
   dispatcher (default-deny, typed CASE to the registered ceremonies).
4. `supabase/v279_integration.sql` — event_workspace gains an additive `actions` key.

Verification (never deployed to production):
- `supabase/tests/v279_proof.sql` [PROOF]
- `supabase/tests/v279_race.sql` [RACE — DISPOSABLE DB ONLY, COMMITS FIXTURES]
- `supabase/tests/v279_race_cleanup.sql` [CLEANUP]

Application / UI:
- `src/lib/execution/spine.ts` — AvailableAction / EventActions / ActionEnvelope types;
  getAvailableActions, performEventAction; EventWorkspace gains `actions`.
- `src/components/execution/ActionPanel.tsx` (new) — thin routed-action surface driven
  by the projection metadata; mounted in `EventWorkspace.tsx`.
Browser:
- `browser-tests/accept-actions.mjs` (new); `event-ops.harness.tsx` (action fixtures);
  `mock-supabase.ts` (perform_event_action / available_actions handlers).
Docs: `docs/PUBLICATION.md` §6.50, `docs/v279_IMPLEMENTATION_REPORT.md`.

## Schema objects added / replaced

Added: table `public.action_invocation` (RLS: select-only for clients; unique
(tenant_id, idempotency_key); target index). Functions: action_registry,
action_required_fields, action_actor, is_active_member, action_authorized,
action_target_status, action_evaluate, available_actions, event_available_actions,
action_envelope, action_reason_of, perform_event_action.
Replaced (additive): `event_workspace` (adds `actions` key; all prior fields intact).
No PL / v275 / v276 / v277 / v278 domain object was changed.

## Deployment order

v278 stack → v279_action_registry → v279_action_projection → v279_action_dispatch →
v279_integration → grants (`grant select on action_invocation`, `grant execute on all
functions`) → application + UI. Idempotent where conventions require (create-or-replace
functions; `create table if not exists`; guarded policy creation).

## Rollback / corrective-patch strategy

The router is additive and side-effect-free on domain truth. To roll back: drop
`perform_event_action`, the projection/registry functions, and `action_invocation`,
and restore `event_workspace` to its v278 body (re-run `v278_integration.sql`). Direct
ceremony callers and the v278 staffing UI continue to work throughout, so rollback is
safe at any point. Corrective patches follow the same additive discipline (create-or-
replace the specific function; never mutate domain tables).

## Privilege / RLS changes

`action_invocation`: RLS enabled; SELECT policy `tenant_id = current_tenant_id()`; NO
insert/update/delete policy — only the SECURITY DEFINER dispatcher writes (as owner),
so clients cannot forge invocations. SELECT granted to app_user/authenticated; EXECUTE
granted on the new functions. No new direct grants on domain tables.

## Proof / race / browser instructions

```
psql -d ec     -f supabase/tests/v279_proof.sql            # 22 PASS / 0 FAIL, self-rolling-back
# race — disposable DB only:
psql -d ecrace -f supabase/tests/v279_race.sql             # installs race279_* helpers
for S in SK DP TA ACL; do
  psql -d ecrace -c "select race279_setup('$S')"; psql -d ecrace -c "select race279_arm('$S')"
  psql -d ecrace -c "select race279_a('$S')" & psql -d ecrace -c "select race279_b('$S')" & wait
  psql -d ecrace -c "select race279_verdict('$S')"
done
psql -d ecrace -f supabase/tests/v279_race_cleanup.sql     # 0 race279 objects remain
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node browser-tests/accept-actions.mjs   # 11 passed
```

## Totals

- Proof: v279 22/22. Regression PL v271 (15) v272 (37) v273 (35) + v275 (26) v276 (18)
  v277 (12) v278 (22) v279 (22) = 187 PASS / 0 FAIL.
- Race: v279 4 pairs PASS in both launch orders; v278 5 pairs still pass; cleanup leaves
  zero residue. (v277 has no race by design.)
- Browser: actions 11, staffing 10, workspace 13, event-ops 5 = 39 PASS.
- TypeScript: clean under strict.

## Compatibility

Additive. Direct callers of the seven ceremonies (the v278 spine.ts functions and the
StaffingSection surface) are UNCHANGED and still work; v279 removed no working surface.
The event_workspace change adds a field only — v277/v278 workspace consumers and proofs
are unaffected (both re-run green).

## Proof claim inventory

REG-1..3 (closed registry, unknown refused, no dynamic SQL); DISP-1..7 (routes to real
ceremony; NO direct domain writes; missing/forbidden/stale refuse; ceremony refusal
propagates; result normalized without losing domain detail); PRJ-1..4 (lifecycle only at
lawful stages; staffing against lawful requirement; not persisted; projection changes
after action); IDEM-1..4 (replay; mismatch; no-burn; no cross-action reuse); AUTH-1..3
(default-deny; cross-tenant no leak; tenant-scoped idempotency).

## Race claim inventory

SK (same key+payload → one execution, one replay, no duplicate evidence); DP (same key +
different payload → one exec, one mismatch); TA (two different actions on one event →
both execute serialized); ACL (assign racing close through the router → one lawful
result, event closed, no deadlock). Both launch orders.

## Browser acceptance inventory

A-1..A-11: panel renders lifecycle actions from the projection; available enabled /
blocked disabled with blocker; non-workspace-visible action hidden; click dispatches with
the correct stable action_key; success refreshes the workspace; in-service shows Close;
completed action hidden; unauthorized sees no buttons; staffing-uncovered shows the
staffing blocker; lawful refusal rendered honestly; the client contains no duplicated
stage-transition law.

## Frozen constitutional traceability

No PL-1…PL-4 object, and no v275/v276/v277/v278 domain object, was modified. The router
adds no domain law: it routes to the exact certified ceremonies. Invariants I-15…I-47
preserved. `event_workspace` is the only prior object touched, and only additively (new
`actions` key). action_invocation is routing metadata, proven not to be competing domain
truth (it drives no coverage/lifecycle/readiness; clients cannot write it).

## Safe to freeze

Yes. Migrations apply clean; proof 22/22 zero-residue; race 4/4 both orders with clean
cleanup; application + mounted UI browser-verified (11); full regression 187/187 and all
prior races green; TypeScript clean; direct-ceremony compatibility preserved; no frozen
law changed. v279 exposes the routing seam later milestones (v280+) will use without
implementing any of them.
