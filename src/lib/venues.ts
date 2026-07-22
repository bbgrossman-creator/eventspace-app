import { supabase } from "@/lib/supabase";

/** v280 venue knowledge foundation — thin client. All writes route to the SQL
 *  ceremonies; the current profile, contradictions, and three-valued answers are
 *  SQL derivations rendered as-is. No precedence or coverage law lives here. */

export type SourceClass = "measurement" | "direct_observation" | "venue_document" | "venue_rep_statement" | "prior_knowledge";
export type ProfileStatus = "observed" | "observed_absent" | "unobserved";

export interface Venue {
  id: string; name: string; venue_type: string; address: string | null;
  geo_lat: number | null; geo_lng: number | null; contacts: unknown[];
  management: string | null; notes: string | null; redirect_to: string | null; created_at: string;
}
export interface VenueSpace {
  id: string; venue_id: string; parent_space_id: string | null; kind: string;
  name: string; contended: boolean; sort_order: number;
}
export interface Walkthrough {
  id: string; venue_id: string; engagement_ref: string | null; purpose: string;
  conducted_at: string; participants: unknown[]; rep_involvement: "none" | "supplied" | "approved"; notes: string | null;
}
export interface ProfileEntry {
  status: ProfileStatus; attribute: string; scope_space: string | null;
  value?: Record<string, unknown>; value_kind?: string; narrative?: string | null;
  source_class?: SourceClass; observed_at?: string; observer?: string;
  observation_id?: string; evidence_refs?: string[];
  contradiction?: { disputing_observation: string; source_class: SourceClass; observed_at: string; value: Record<string, unknown>; observer: string } | null;
}

export async function listVenues(): Promise<Venue[]> {
  const { data, error } = await supabase.from("venue").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data as Venue[]) ?? [];
}
export async function getVenue(id: string): Promise<Venue | null> {
  const { data, error } = await supabase.from("venue").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Venue | null) ?? null;
}
export async function listSpaces(venueId: string): Promise<VenueSpace[]> {
  const { data, error } = await supabase.from("venue_space").select("*").eq("venue_id", venueId).order("sort_order");
  if (error) throw new Error(error.message);
  return (data as VenueSpace[]) ?? [];
}
export async function listWalkthroughs(venueId: string): Promise<Walkthrough[]> {
  const { data, error } = await supabase.from("venue_walkthrough").select("*").eq("venue_id", venueId).order("conducted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Walkthrough[]) ?? [];
}

export async function createVenue(args: { name: string; venueType: string; address?: string }): Promise<{ venueId: string; possibleDuplicates: { id: string; name: string; address: string | null }[] }> {
  const { data, error } = await supabase.rpc("create_venue", { p_name: args.name, p_venue_type: args.venueType, p_address: args.address ?? null });
  if (error) throw new Error(error.message);
  return { venueId: data.venue_id, possibleDuplicates: data.possible_duplicates ?? [] };
}
export async function addVenueSpace(args: { venue: string; kind: string; name: string; parent?: string; contended?: boolean }): Promise<string> {
  const { data, error } = await supabase.rpc("add_venue_space", { p_venue: args.venue, p_kind: args.kind, p_name: args.name, p_parent: args.parent ?? null, p_contended: args.contended ?? false, p_sort: 0 });
  if (error) throw new Error(error.message);
  return data.space_id as string;
}
export async function recordWalkthrough(args: { venue: string; purpose: string; conductedAt: string; repInvolvement?: string; notes?: string }): Promise<string> {
  const { data, error } = await supabase.rpc("record_walkthrough", { p_venue: args.venue, p_purpose: args.purpose, p_conducted_at: args.conductedAt, p_engagement: null, p_participants: [], p_rep_involvement: args.repInvolvement ?? "none", p_notes: args.notes ?? null });
  if (error) throw new Error(error.message);
  return data.walkthrough_id as string;
}
export async function declareCoverage(args: { walkthrough: string; status: "visited" | "partial" | "inaccessible"; space?: string; note?: string }): Promise<void> {
  const { error } = await supabase.rpc("declare_walkthrough_coverage", { p_walkthrough: args.walkthrough, p_status: args.status, p_space: args.space ?? null, p_note: args.note ?? null });
  if (error) throw new Error(error.message);
}
export async function recordEvidence(args: { venue: string; kind: string; label: string; walkthrough?: string; hash?: string }): Promise<{ evidenceId: string; contentHash: string }> {
  const { data, error } = await supabase.rpc("record_evidence", { p_venue: args.venue, p_kind: args.kind, p_label: args.label, p_walkthrough: args.walkthrough ?? null, p_bytes: null, p_hash: args.hash ?? null, p_meta: {}, p_replaces: null });
  if (error) throw new Error(error.message);
  return { evidenceId: data.evidence_id, contentHash: data.content_hash };
}
export async function recordObservation(args: {
  venue: string; attribute: string; valueKind: string; value: Record<string, unknown>;
  sourceClass: SourceClass; observedAt: string; walkthrough?: string; scopeSpace?: string;
  narrative?: string; evidence?: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc("record_observation", {
    p_venue: args.venue, p_attribute: args.attribute, p_value_kind: args.valueKind, p_value: args.value,
    p_source_class: args.sourceClass, p_observed_at: args.observedAt,
    p_walkthrough: args.walkthrough ?? null, p_scope_space: args.scopeSpace ?? null, p_scope_space2: null,
    p_narrative: args.narrative ?? null, p_method: null, p_confidence: null,
    p_effective: null, p_expires: null, p_condition: null, p_evidence: args.evidence ?? [],
  });
  if (error) throw new Error(error.message);
  return data.observation_id as string;
}
export async function supersedeObservation(observation: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("supersede_observation", { p_observation: observation, p_reason: reason });
  if (error) throw new Error(error.message);
}
export async function getVenueProfile(venueId: string): Promise<ProfileEntry[]> {
  const { data, error } = await supabase.rpc("venue_profile", { p_venue: venueId, p_context: new Date().toISOString(), p_conditions: null });
  if (error) throw new Error(error.message);
  return (data as ProfileEntry[]) ?? [];
}
