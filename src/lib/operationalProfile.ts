import { supabase } from "@/lib/supabase";

/** v283 component operational profile — thin client. All vocabulary,
 *  validation, revision atomicity, and quantity resolution live in SQL.
 *  (Named operationalProfile.ts: src/lib/library.ts is the v215 Library
 *  instantiation resolver and is untouched.) */

export interface LibraryComponent {
  id: string; name: string; kind: string; notes: string | null; active: boolean; created_at: string;
}
export interface RequirementDecl {
  family: string; kind: string; label?: string; capability?: boolean; provision_source?: string;
  basis: string; rate: number; band_size?: number; min_qty?: number; max_qty?: number;
  rounding?: string; unit: string; aggregation?: string; temporal?: string;
  condition_param?: string; condition_value?: string;
}
export interface ResolvedRequirement {
  id: string; family: string; kind: string; label: string; capability: boolean; provision_source: string;
  basis: string; rate: number; band_size: number | null; min_qty: number | null; max_qty: number | null;
  rounding: string; unit: string; aggregation: string; temporal: string;
  condition_param: string | null; condition_value: string | null;
  resolution: { status: "resolved" | "unresolved" | "inactive"; quantity?: number; missing?: string; condition?: string };
}
export interface LibraryProfile {
  component_id: string; name: string; kind: string;
  revision: { id: string; revision_no: number; authored_by: string; created_at: string; reason: string | null } | null;
  requirements: ResolvedRequirement[];
}
export interface ProfileRevisionRow {
  id: string; revision_no: number; reason: string | null; authored_by: string; created_at: string;
}

export async function listLibraryComponents(): Promise<LibraryComponent[]> {
  const { data, error } = await supabase.from("library_component").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data as LibraryComponent[]) ?? [];
}
export async function createLibraryComponent(name: string, kind: string): Promise<{ componentId: string; possibleDuplicates: { id: string; name: string }[] }> {
  const { data, error } = await supabase.rpc("create_library_component", { p_name: name, p_kind: kind, p_notes: null });
  if (error) throw new Error(error.message);
  return { componentId: data.component_id, possibleDuplicates: data.possible_duplicates ?? [] };
}
export async function listRevisions(componentId: string): Promise<ProfileRevisionRow[]> {
  const { data, error } = await supabase.from("component_profile_revision").select("id,revision_no,reason,authored_by,created_at").eq("library_component_id", componentId).order("revision_no", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ProfileRevisionRow[]) ?? [];
}
export async function getLibraryProfile(componentId: string, context?: Record<string, unknown>, revision?: string): Promise<LibraryProfile | null> {
  const { data, error } = await supabase.rpc("library_profile", { p_component: componentId, p_context: context ?? null, p_revision: revision ?? null });
  if (error) throw new Error(error.message);
  return (data as LibraryProfile | null) ?? null;
}
export async function authorProfileRevision(componentId: string, requirements: RequirementDecl[], reason?: string): Promise<{ revisionNo: number }> {
  const { data, error } = await supabase.rpc("author_profile_revision", { p_component: componentId, p_requirements: requirements, p_reason: reason ?? null });
  if (error) throw new Error(error.message);
  return { revisionNo: data.revision_no };
}

export const FAMILIES = ["space","utility","equipment","labor","time","production","access","environment","consumable"] as const;
export const KINDS: Record<string, string[]> = {
  space: ["footprint","frontage","clearance","staging","storage","circulation","queue_area"],
  utility: ["circuit","amperage","voltage","water","drainage","gas","ventilation","data"],
  equipment: ["equipment_item","smallwares","serviceware","transport_container","safety_equipment"],
  labor: ["role_headcount","skill","setup_labor","service_labor","breakdown_labor","supervisor"],
  time: ["lead_time","setup_duration","service_duration","replenishment_interval","breakdown_duration","reset_time"],
  production: ["kitchen_access","commissary","refrigeration","freezer","hot_holding","finishing","plating","dishwashing","sanitation"],
  access: ["loading_access","freight_elevator","stairs","travel_path","vehicle_access","delivery_window","security_checkin","dock_reservation"],
  environment: ["indoor_outdoor","weather_protection","fire_restriction","open_flame","noise","floor_loading","food_safety","allergen_separation"],
  consumable: ["fuel","ice","disposables","linens","serving_pieces","replacement_stock","replenishment_qty"],
};
export const UNITS: Record<string, string[]> = {
  space: ["ft","sqft","in"], utility: ["amps","volts","circuits","gpm","cfm","mbps"], equipment: ["count"],
  labor: ["people","hours"], time: ["minutes","hours","days"], production: ["cuft","pans","count","sqft","covers_per_hour"],
  access: ["count","ft","lbs","minutes"], environment: ["count","db","lbs_per_sqft"], consumable: ["count","lbs","gal","bags"],
};
export const BASES = ["fixed","per_instance","per_service_point","per_guest","per_guest_band","per_table","per_hour","per_shift","per_batch"] as const;
