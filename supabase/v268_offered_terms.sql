-- ═══════════════════════════════════════════════════════════════════════════
-- v268 — PL-4 · FROZEN OFFERED TERMS (additive; PL-3 untouched).
--
-- The first PL-4 slice. It makes the publication resolver's frozen model carry
-- the offered terms the acceptance ceremony (v271) will bind to:
--   · valid_until — the offered validity deadline (this migration)
--   · stable frozen choice group + option identities        (resolver, v268 TS)
--   · explicit minimum/maximum selection bounds             (resolver, v268 TS)
-- The choice identities and bounds are produced entirely in the resolver
-- (src/lib/presentation.ts) and frozen by value into offer_snapshots.model at
-- publication — no schema change is needed for them, because the model is a
-- jsonb value already sealed and fingerprint-covered by PL-3.
--
-- This migration adds ONLY the one field that needs a column: the offered
-- deadline source. It is:
--   · ADDITIVE — a nullable column with no default beyond null;
--   · VERSION-SCOPED — an operator-set field on the offer's own row;
--   · FORWARD-COMPATIBLE — absent/unset ⇒ null ⇒ open-ended (the offer never
--     expires by time), so every existing draft and every already-published
--     Offer is unaffected;
--   · FROZEN AT PUBLICATION — the resolver reads it and freezes it into the
--     snapshot model, so it becomes fingerprint-covered; the customer accepts
--     this exact deadline. Changing it post-publication is impossible (the
--     snapshot is immutable); a different deadline is a different Offer.
--
-- No PL-3 object, ceremony, constraint, or invariant is touched. publish_offer,
-- the seal guards, the revision witness, and the publication ordering are
-- unchanged. This column is read by the resolver only; it is not itself sealed
-- (the FROZEN copy inside offer_snapshots.model is what binds — the live column
-- may be edited on a draft like any other version-scoped field, and once the
-- version seals, the version-row seal guard already freezes the row).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.proposal_versions
  add column if not exists valid_until timestamptz;

comment on column public.proposal_versions.valid_until is
  'v268/PL-4: offered validity deadline. Null = open-ended. Frozen into '
  'offer_snapshots.model at publication (fingerprint-covered); the first '
  'instant of invalidity under the half-open interval [published_at, valid_until). '
  'Read by the presentation resolver; a different deadline requires a new Offer.';

-- v268 also relies on the version-row seal guard already covering the
-- customer-visible fields (v267). valid_until is offered-terms metadata that
-- feeds the frozen model; on a DRAFT it is freely editable, and on a SEALED
-- version the existing guard_sealed_version trigger governs the row. To make
-- the seal explicitly span the offered deadline (so a sealed version's
-- valid_until cannot drift from what was frozen), extend the version-row seal
-- guard to include it — a narrow, additive widening of an existing PL-3 guard
-- consistent with the v267 boundary-completion pattern (customer_intro /
-- customer_closing / price_visibility were added there the same way).
create or replace function public.guard_sealed_version()
returns trigger language plpgsql as $$
begin
  if old.sealed_at is not null then
    if new.status is distinct from old.status
       or new.snapshot_id is distinct from old.snapshot_id
       or new.sealed_at is distinct from old.sealed_at
       or new.sent_at is distinct from old.sent_at then
      null;   -- permitted post-seal lifecycle/metadata writes
    end if;
    if new.theme_key is distinct from old.theme_key
       or new.theme_override is distinct from old.theme_override
       or new.photo_pins is distinct from old.photo_pins
       or new.customer_intro is distinct from old.customer_intro
       or new.customer_closing is distinct from old.customer_closing
       or new.price_visibility is distinct from old.price_visibility
       or new.valid_until is distinct from old.valid_until   -- v268: offered deadline frozen at seal
       or new.version is distinct from old.version
       or new.proposal_id is distinct from old.proposal_id then
      raise exception 'SEALED_VERSION_IMMUTABLE';
    end if;
  end if;
  return new;
end $$;

-- The revision witness likewise spans valid_until so an edit between Prepare
-- and Publish stales the package (B3 discipline, extended to the new field).
create or replace function public.bump_on_version_content()
returns trigger language plpgsql as $$
begin
  if new.theme_key is distinct from old.theme_key
     or new.theme_override is distinct from old.theme_override
     or new.photo_pins is distinct from old.photo_pins
     or new.customer_intro is distinct from old.customer_intro
     or new.customer_closing is distinct from old.customer_closing
     or new.price_visibility is distinct from old.price_visibility
     or new.valid_until is distinct from old.valid_until then   -- v268
    if new.content_revision = old.content_revision then
      new.content_revision := old.content_revision + 1;
    end if;
  end if;
  return new;
end $$;
-- (triggers trg_guard_sealed_version and trg_bump_version_content already bind
--  these function names from v265/v266/v267 — replacing the bodies suffices.)
