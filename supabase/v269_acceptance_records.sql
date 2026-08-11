-- ═══════════════════════════════════════════════════════════════════════════
-- v269 — PL-4 Phase A.1 / A.2 · ACCEPTANCE EVIDENCE RECORDS (additive).
--
-- Data model ONLY. No ceremonies, no validation, no rescission, no publication
-- changes — those are later migrations. This slice creates the two immutable
-- tables the acceptance ceremony (v271) will write into, with every
-- constitutional field reserved now so the schema needs no later redesign.
-- Certain reserved fields (principal / acting_person / recording_operator /
-- authority_basis, claimed_moment, capability/attestation metadata) are first
-- POPULATED by v271; they exist here so the shape is settled.
--
-- Immutability: both tables are insert + select ONLY (no update, no delete
-- policy) — the append-only discipline PL-3 first applied to offer_snapshots.
-- Structural uniqueness: UNIQUE(snapshot) on the acceptance (I-20, at most one
-- acceptance per Offer) and UNIQUE(acceptance_id) on the selection set (exactly
-- one child per acceptance). Frozen selection identities reference the snapshot
-- model BY VALUE — deliberately no FK to the live choice_groups table (I-21/I-26).
--
-- Additive, forward-compatible, rerunnable. No PL-3/earlier-PL-4 object touched.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A.1 · Acceptance record (immutable) ─────────────────────────────────────
create table if not exists public.offer_acceptances (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  -- the accepted object: the Offer's Snapshot, and the exact fingerprint bound
  snapshot_id           uuid not null unique          -- UNIQUE(snapshot): I-20, at most one acceptance per Offer
                          references public.offer_snapshots(id),
  fingerprint           text not null,                -- the fingerprint accepted (I-21); bound at accept time
  booking_id            uuid not null                 -- ledger locality + tenant-stamp symmetry
                          references public.bookings(id),
  -- reserved constitutional identity model (§A.3): distinct slots from the
  -- outset; v271 populates them, the first build may collapse principal =
  -- acting_person with authority_basis 'self'. Nullable now so the data model
  -- can exist ahead of the ceremony that fills them.
  principal             jsonb,                        -- committing principal (individual/household/org/joint)
  acting_person         jsonb,                        -- natural person who performed the act
  recording_operator    uuid,                         -- operator who entered an attested acceptance (null = observed)
  authority_basis       text,                         -- self | delegated | operator_attested
  -- evidence basis (§4.2): observed (endpoint capability) vs attested
  evidence_basis        text,                         -- observed | attested
  channel               text,                         -- endpoint (observed) | in_person/etc (attested)
  -- the three moments (Addendum A.1): recorded always; claimed for attested
  recorded_moment       timestamptz not null default now(),
  claimed_moment        timestamptz,                  -- attested only; drives expiry for attested
  -- capability (observed) or attestation (attested) metadata, by value
  capability_ref        jsonb,                        -- endpoint/token reference for observed
  attestation_ref       jsonb,                        -- external id + asserted context for attested
  created_at            timestamptz not null default now()
);
create index if not exists ix_acceptance_tenant   on public.offer_acceptances (tenant_id);
create index if not exists ix_acceptance_booking  on public.offer_acceptances (booking_id);

-- ── A.2 · Selection set (immutable, 1:1 child of the acceptance) ─────────────
create table if not exists public.acceptance_selection_sets (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  acceptance_id         uuid not null unique          -- UNIQUE(acceptance_id): exactly one child per acceptance
                          references public.offer_acceptances(id),
  -- the canonical, normalized selections, each naming a FROZEN group identity
  -- and its chosen FROZEN option identities — captured by value from the
  -- snapshot model, NOT an FK to the live choice_groups table (I-21/I-26).
  -- An explicit empty-set marker is carried when the Offer had no choices
  -- (empty-is-information). Shape (settled at v271, stored here by value):
  --   { "empty": bool, "groups": [ { "groupId": text, "optionIds": [text,...] } ] }
  selections            jsonb not null,
  created_at            timestamptz not null default now()
);
create index if not exists ix_selection_tenant on public.acceptance_selection_sets (tenant_id);

-- ── RLS: insert + select ONLY on both (immutability by absence of update/delete)
alter table public.offer_acceptances       enable row level security;
alter table public.acceptance_selection_sets enable row level security;
do $$ begin
  begin create policy acc_select on public.offer_acceptances
    for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy acc_insert on public.offer_acceptances
    for insert with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy sel_select on public.acceptance_selection_sets
    for select using (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
  begin create policy sel_insert on public.acceptance_selection_sets
    for insert with check (tenant_id = public.current_tenant_id()); exception when duplicate_object then null; end;
end $$;

comment on table public.offer_acceptances is
  'v269/PL-4 A.1: immutable acceptance evidence. Insert+select only. '
  'UNIQUE(snapshot_id) = at most one acceptance per Offer (I-20). Reserved '
  'identity fields (principal/acting_person/recording_operator/authority_basis, '
  'claimed_moment, capability/attestation refs) are first populated by v271.';
comment on table public.acceptance_selection_sets is
  'v269/PL-4 A.2: immutable 1:1 selection-set child. Insert+select only. '
  'UNIQUE(acceptance_id) = exactly one child per acceptance. Frozen group/option '
  'identities reference the snapshot model by value, never live choice_groups.';
