/** v292c · CEREMONY CLIENT — the write path for promise-side capture.
 *
 *  WHY THIS IS NOT IN src/lib/projection/
 *  That module is read-only by contract ("Components never call `.rpc()`"), and
 *  its three primitives — fetchProjection, fetchRows, fetchObject — are all
 *  reads. Ceremonies write. Putting them in the projection client would make a
 *  read-pure module capable of mutation, so they live here instead. The
 *  separation is the point: a component importing `projection/*` cannot write,
 *  and a component importing `promise/ceremonies` is visibly doing so.
 *
 *  CONSTITUTIONAL CONTRACT OF THIS FILE
 *   · Every function is a thin invocation of an already-certified ceremony.
 *     No validation, no defaulting of business meaning, no ordering rules, no
 *     decision about when a reason is required. SQL owns all of it.
 *   · Refusals are surfaced verbatim as codes. This module never translates a
 *     refusal into a friendlier claim, because the refusal IS the business rule
 *     speaking and softening it would be reimplementing the rule badly.
 *   · No optimistic state. A caller re-reads projection_occurrence_brief after
 *     any ceremony; this module returns only what SQL returned.
 */
import { supabase } from "@/lib/supabase";

/** Refusal codes the promise ceremonies raise. Listed so a code can be
 *  recognised and rendered as itself; NOT to be mapped to invented messages. */
export const CEREMONY_REFUSALS = [
  "PROMISE_NOT_AUTHORIZED",
  "PROMISE_REASON_REQUIRED",
  "PROMISE_UNCHANGED",
  "PROMISE_EMPTY",
  "PROMISE_ALREADY_SUPERSEDED",
  "PROMISE_EDIT_REFUSED",
  "ATTENDANCE_INVALID_BASIS",
  "ATTENDANCE_INVALID_COUNT",
  "MILESTONE_DUAL_CAPTURE",
  "MILESTONE_DATE_REQUIRED",
  "MILESTONE_MOMENT_REQUIRED",
  "SUPERVISION_ORG_REQUIRED",
  "BINDING_UNCHANGED",
  "BINDING_REASON_REQUIRED",
  "VENUE_NOT_AUTHORIZED",
  "VENUE_REDIRECTED",
  "OCCURRENCE_RELEASED",
  "OCCURRENCE_CANCELLED",
  "RELEASE_PREDICATE_UNSATISFIED",
  "RELEASE_ALREADY_RELEASED",
  "CEREMONY_NOT_FOUND",
] as const;

export class CeremonyRefusal extends Error {
  readonly code: string;
  readonly raw: string;
  constructor(code: string, message: string, raw: string) {
    super(message);
    this.name = "CeremonyRefusal";
    this.code = code;
    this.raw = raw;
  }
}

export function normalizeCeremonyRefusal(raw: string): CeremonyRefusal {
  const text = (raw ?? "").replace(/^Error:\s*/, "");
  const code = CEREMONY_REFUSALS.find((c) => text.includes(c));
  if (code) {
    const after = text.split(code)[1] ?? "";
    return new CeremonyRefusal(code, after.replace(/^[:\s]+/, "").trim() || text, text);
  }
  return new CeremonyRefusal("CEREMONY_ERROR", text, text);
}

async function invoke<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw normalizeCeremonyRefusal(error.message);
  return data as T;
}

export type AttendanceBasis = "estimated" | "contracted" | "guaranteed" | "final";

/** The closed milestone vocabulary. Keys are constitutional law; the words a
 *  surface shows beside them are configuration. operating_date is excluded —
 *  it is a DATE and has its own affordance. */
export const MILESTONE_KEYS = [
  "production_start", "warehouse_departure", "load_in_start", "load_in_end",
  "staff_call", "vendor_arrival", "ceremony", "cocktail_start",
  "service_start", "service_end", "dessert", "breakdown_start",
  "breakdown_end", "venue_clear", "custom",
] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number] | "operating_date";

// ── ceremonies · parameters pass through untouched ──────────────────────────

export const setOccurrenceProfile = (
  occurrence: string, displayName?: string, occasionKind?: string, reason?: string,
) => invoke<{ profile_id: string; replaced: boolean }>("set_occurrence_profile", {
  p_occurrence: occurrence, p_display_name: displayName ?? null,
  p_occasion_kind: occasionKind ?? null, p_reason: reason ?? null,
});

export const setEngagementProfile = (
  booking: string, displayName?: string, clientDisplayName?: string, reason?: string,
) => invoke<{ profile_id: string; replaced: boolean }>("set_engagement_profile", {
  p_booking: booking, p_display_name: displayName ?? null,
  p_client_display_name: clientDisplayName ?? null, p_reason: reason ?? null,
});

export const commitAttendance = (
  occurrence: string, headCount: number, basis: AttendanceBasis,
  effectiveMoment?: string, reason?: string,
) => invoke<{ attendance_id: string; basis: string; effective_moment: string }>(
  "commit_attendance", {
    p_occurrence: occurrence, p_head_count: headCount, p_basis: basis,
    p_effective_moment: effectiveMoment ?? null, p_reason: reason ?? null,
  });

export const setScheduleMilestone = (
  occurrence: string, key: MilestoneKey,
  opts: { atDate?: string; atMoment?: string; windowEnd?: string; label?: string; reason?: string },
) => invoke<{ milestone_id: string; key: string; replaced: boolean }>(
  "set_schedule_milestone", {
    p_occurrence: occurrence, p_milestone_key: key,
    p_at_date: opts.atDate ?? null, p_at_moment: opts.atMoment ?? null,
    p_window_end: opts.windowEnd ?? null, p_label: opts.label ?? null,
    p_reason: opts.reason ?? null,
  });

export const clearScheduleMilestone = (
  occurrence: string, key: MilestoneKey, label: string | undefined, reason: string,
) => invoke<{ milestone_id: string; cleared: boolean }>("clear_schedule_milestone", {
  p_occurrence: occurrence, p_milestone_key: key,
  p_label: label ?? null, p_reason: reason,
});

export const bindOccurrenceVenue = (occurrence: string, venue: string, reason?: string) =>
  invoke<{ binding_id: string; replaced: boolean }>("bind_occurrence_venue", {
    p_occurrence: occurrence, p_venue: venue, p_reason: reason ?? null,
  });

export const bindOccurrenceSupervision = (
  occurrence: string, authorityOrg: string,
  opts: { windowStart?: string; windowEnd?: string; certificateRef?: string;
          contact?: string; reason?: string },
) => invoke<{ supervision_id: string; replaced: boolean }>("bind_occurrence_supervision", {
  p_occurrence: occurrence, p_authority_org: authorityOrg,
  p_window_start: opts.windowStart ?? null, p_window_end: opts.windowEnd ?? null,
  p_certificate_ref: opts.certificateRef ?? null, p_contact: opts.contact ?? null,
  p_reason: opts.reason ?? null,
});

/** v295 · Cross the release boundary — the moment a promise becomes work.
 *
 *  The certified predicate in release_occurrence is layered and default-deny:
 *  commitment (an unrescinded acceptance), clearance (a clearance OR waiver
 *  ref), and an operator sign-off. Each limb refuses by name and those refusals
 *  reach the surface verbatim, per this module's standing contract.
 *
 *  COMPLETENESS IS NOT IN THAT PREDICATE. An incomplete occurrence may lawfully
 *  be released (v292a), so this client must never pre-check one — doing so would
 *  reimplement a rule SQL deliberately does not have.
 *
 *  The actor is NOT a parameter. release_promise derives it server-side via
 *  action_actor(); the raw release_occurrence takes one, which is precisely why
 *  the wrapper exists.
 *
 *  The refs are operator-supplied today. Phase B (Agreement Origin) will make
 *  them flow from the Agreement; the typed path stays lawful forever. */
export const releasePromise = (
  occurrence: string,
  refs: { signoffRef?: string; clearanceRef?: string; waiverRef?: string },
) => invoke<{ event_id: string; occurrence_id: string; generated_count: number }>(
  "release_promise", {
    p_occurrence: occurrence,
    p_signoff_ref: refs.signoffRef ?? null,
    p_clearance_ref: refs.clearanceRef ?? null,
    p_waiver_ref: refs.waiverRef ?? null,
  });

/** REFERENCE DATA, not operational truth. The venue catalogue is a list of
 *  places the tenant owns records for — it carries no derived state, no
 *  responsibility, no promise. Binding one is a ceremony; naming the options is
 *  a catalogue read, RLS-scoped like any other. This is the ONLY table this
 *  slice reads, and it is asserted as the only permitted one in acceptance. */
export async function listVenues(): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase
    .from("venue").select("id, name").order("name");
  if (error) throw normalizeCeremonyRefusal(error.message);
  return (data ?? []) as Array<{ id: string; name: string }>;
}
