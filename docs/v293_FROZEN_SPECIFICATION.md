# v293 — Work Becomes Actionable · FROZEN SPECIFICATION

Ruling adopted: **Option D.** Nothing below is implemented yet.

---

## 0 · Lawfulness verdict, with one flagged judgment

D is constitutionally lawful: facts are still recorded only by ceremony,
state is still derived only by `responsibility_state()`, ownership still moves
only through the certified CAS, the evidence vocabulary stays closed, R-6
append-only and R-13 are untouched, SQL remains authoritative, the UI stays
projection-plus-ceremony exactly as v292c established on the Promise side.

**The one judgment call, recorded openly:** `complete_responsibility` refuses a
duplicate completion (`COMPLETION_ALREADY_RECORDED`). The raw ceremony permits a
second completion fact; the wrapper does not. That *is* a restriction the
delegate lacks — I judge it a ceremony-level guard, not new semantics: derived
state is `discharged` either way, the ledger's meaning is unchanged, the
registry itself marks evidence recording `record_once`, and `CLOSE_ALREADY_CLOSED`
/ `PROMISE_UNCHANGED` are the identical house shape. If you disagree, strike
WC-6 and the guard; everything else stands.

A second explicit decision: **completion does not require ownership.** Enforcing
`owner = actor` in SQL would be new semantics the delegate does not have, and it
contradicts operational reality (a manager records for the person elbow-deep in
brisket). The UI renders the verb by ownership; SQL permits any active member.

---

## 1 · Frozen architectural decisions

| # | Decision |
|---|---|
| F-1 | Two work-side ceremonies, pattern-copied from the promise ceremonies. No gateway registration in v293 (named follow-on). |
| F-2 | Actor is **always** server-derived via `action_actor()`. No actor parameter exists on either function. |
| F-3 | Authorization guard is `is_active_member()`; refusal name **`WORK_NOT_AUTHORIZED`** (sibling of `PROMISE_NOT_AUTHORIZED`). |
| F-4 | Claim is **unowned-only**: `p_expected_prior => null`. A race or stale render surfaces as the certified `OWNERSHIP_CONFLICT`. Owner recorded = actor uid text (deployed convention). |
| F-5 | Completion is `kind='completion'`, payload passed through opaque; verb words live in the payload/UI as presentation, never as a kind. |
| F-6 | Neither wrapper introduces ownership, evidence, completion, or state semantics; both are delegation + guard + actor derivation only. |
| F-7 | v293 is a **SQL + application** release. |
| F-8 | UI verb rendering: **Claim** on `owner = null`; **complete-verb** on `owner ≠ null` and state ∈ {`active`, `standing`, `lapsed`} (late completion of a lapsed row lawfully derives `discharged` — completion evidence precedes the lapse test in the deployed derivation). Never on `discharged`, `superseded`, `void`. |
| F-9 | After any ceremony the surface **re-reads both lenses** through the existing `load()`. No optimistic state, no partial refresh. |
| F-10 | DS-15 is amended from "no non-projection rpc" to an **exact allowlist** of the two ceremonies, each invocation attributable to a user action. |

## 2 · Exact SQL obligations — `supabase/v293_work_ceremonies.sql`

Both functions: `LANGUAGE plpgsql`, **VOLATILE** (they write; declaring STABLE
would be false), `SECURITY DEFINER`, `SET search_path TO 'public'`. Preflight
per house pattern: required delegates present, not already applied.

```sql
create or replace function public.claim_responsibility(p_responsibility uuid)
returns jsonb ... as $$
declare v_actor text := public.action_actor(); v_id uuid;
begin
  if not public.is_active_member() then
    raise exception 'WORK_NOT_AUTHORIZED: responsibility';
  end if;
  v_id := public.transfer_responsibility_ownership(
            p_responsibility, v_actor, null, v_actor);
  return jsonb_build_object('ownership_id', v_id, 'owner', v_actor);
end $$;

create or replace function public.complete_responsibility(
  p_responsibility uuid, p_payload jsonb default '{}'::jsonb)
returns jsonb ... as $$
declare v_actor text := public.action_actor(); v_tenant uuid := public.current_tenant_id(); v_id uuid;
begin
  if not public.is_active_member() then
    raise exception 'WORK_NOT_AUTHORIZED: responsibility';
  end if;
  if exists (select 1 from public.execution_evidence e
              where e.obligation_ref = p_responsibility
                and e.tenant_id = v_tenant and e.kind = 'completion') then
    raise exception 'COMPLETION_ALREADY_RECORDED';
  end if;
  v_id := public.record_execution_evidence(
            null, p_responsibility, 'completion', v_actor,
            coalesce(p_payload,'{}'::jsonb), null);
  return jsonb_build_object('evidence_id', v_id);
end $$;
```

Refusal surface, exhaustively: `WORK_NOT_AUTHORIZED`, `OWNERSHIP_CONFLICT` (from
delegate), `RESP_NOT_FOUND` (from delegate, claim path), `CEREMONY_NOT_FOUND`
(from delegate, complete path — foreign/absent resolves as not-found, no
existence leak), `COMPLETION_ALREADY_RECORDED`, `RESP_ACTOR_REQUIRED`
(unreachable in practice — actor is derived — but inherited and harmless).

## 3 · Application implementation

**Patches** (exact-edit convention, frozen modules):
- `client.ts` `KNOWN_REFUSALS` += `WORK_NOT_AUTHORIZED`,
  `COMPLETION_ALREADY_RECORDED` (`OWNERSHIP_CONFLICT`, `RESP_NOT_FOUND`,
  `CEREMONY_NOT_FOUND` already present).
- `WorkLens.tsx` / new `WorkRow` affordances per F-8; verb word from
  `departmentVerbs(dept)[0]` — the pack's first verb — with the pack remaining
  presentation-only.
- `DaySheet.tsx`: pass `reload` down; ceremony → `await load()`.

**New:** `src/lib/work/ceremonies.ts` — `claimResponsibility(id)`,
`completeResponsibility(id, payload?)` via the rpc seam, refusals normalized,
**no actor argument anywhere in the client**; mandatory re-read owned by the
caller per F-9.

## 4 · Certification requirements

### SQL one-shot — `proofs/v293_proofs.sh` (clone pattern, runner owns migration timing)

| Claim | Proves |
|---|---|
| WC-1 | claim records actor **and** owner = session uid; no parameter carried an actor |
| WC-2 | claim on unowned ⇒ ledger row `action='assign'`, owner = uid |
| WC-3 | claim on owned ⇒ `OWNERSHIP_CONFLICT`; ledger unchanged |
| WC-4 | no active membership ⇒ `WORK_NOT_AUTHORIZED`; nothing written |
| WC-5 | complete ⇒ `kind='completion'` row; `responsibility_state()` derives `discharged` |
| WC-6 | second complete ⇒ `COMPLETION_ALREADY_RECORDED`; exactly one completion row |
| WC-7 | standing (`event_ref` null) **and** event-scoped rows both complete lawfully |
| WC-8 | foreign/absent responsibility ⇒ not-found refusal; no existence leak, nothing written |
| WC-9 | delegate immutability: md5(`pg_get_functiondef`) of both delegates identical pre/post migration |
| WC-10 | both wrappers VOLATILE + SECURITY DEFINER + pinned search_path |
| WC-11 | completing a lapsed row derives `discharged` (F-8 late-completion path) |
| RESIDUE | pg_proc census +2 exactly; row deltas attributable |

### Race — `proofs/v293_race.sh`

**RACE-WC1**: two genuine backends claim the same unowned responsibility through
a `pg_sleep` barrier ⇒ exactly one `assign`, one `OWNERSHIP_CONFLICT`, ledger
holds exactly one row.

### Permanent — `supabase/tests/v293_permanent_proof.sql`

Self-rolling-back, v286 style; blocking policy per the v292d1 ruling (FAIL and
UNPROVEN block). Standing claims: actor server-derivation, unowned-only CAS,
duplicate-completion refusal, discharged derivation.

### Browser — `accept-day-sheet.mjs` additions

| Claim | Proves |
|---|---|
| DS-15′ | non-projection rpcs ⊆ {`claim_responsibility`,`complete_responsibility`}; each invocation maps to one user action; fingerprint deltas exactly +1 `responsibility_owner` per claim, +1 `execution_evidence` per completion, obligations unchanged |
| DS-18 | Claim: tap ⇒ ceremony ⇒ re-read ⇒ owner shown = viewer; ownerless count decrements per the **projection's** counts |
| DS-19 | pre-re-read DOM shows no advanced state or owner (no optimism) |
| DS-20 | Complete: verb from the label pack ⇒ ceremony ⇒ re-read ⇒ state glyph `discharged` per SQL |
| DS-21 | forced `OWNERSHIP_CONFLICT` (bridge claims first) ⇒ refusal surfaced, no owner rendered, re-read shows the true owner |
| DS-22 | verb rendering obeys F-8 exactly (present/absent per state × ownership matrix) |

### Regression

Full SQL matrix (floor from execution, nothing inherited) · v286 + v287b ·
v292d `RACE-OD1` · v292d1 permanent proof · `verify.sh` residue none · tsc /
lint / build · full browser suite.

### Deployment sequence

baseline check → one-shot runner (clone) → apply `ec` → permanent proof →
RACE-WC1 → historical matrix + verify → app patches → tsc/build → browser suite
→ production → commit → install permanent proof in the standing harness.

## 5 · Registered follow-ons (named, not smuggled)

Gateway registration of both actions (Option C) · release/unclaim UI ·
transfer-to-another (needs a member directory) · idempotency keys for the
wrappers · F-2 `occurrenceBrief` guard · F-5 tenant-local time · C2 · C3 · nav
registration · engagement-level prep queue · payload forbidden-field screening
(deliberately not added: payload is data, not authority — revisit at gateway
registration).
