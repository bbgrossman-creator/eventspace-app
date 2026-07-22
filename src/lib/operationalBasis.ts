"use client";
import { supabase } from "@/lib/supabase";

/** v284 — Proposal Operational Integration client. Thin RPC wrappers; the DB
 *  holds all authority (pin coherence, override validation, embedding). */

export type Resolution =
  | { status: "resolved"; quantity: number; unit?: string }
  | { status: "unresolved"; missing: string }
  | { status: "inactive"; condition?: string };

export interface BasisRequirement {
  requirement_id?: string;
  family: string; kind: string; label?: string;
  capability?: string | null; provision_source?: string | null;
  basis: string; rate: number; band_size?: number | null;
  min_qty?: number | null; max_qty?: number | null; rounding?: string | null; unit?: string | null;
  status: "active" | "suppressed" | "replaced" | "added";
  reason?: string; actor?: string; override_id?: string;
  replacement?: BasisRequirement & { resolution?: Resolution };
  resolution?: Resolution;
}

export interface OperationalBasis {
  pinned: boolean;
  library_component_id?: string;
  profile_revision_id?: string;
  revision_no?: number;
  context?: Record<string, unknown>;
  requirements?: BasisRequirement[];
  overrides?: Array<{ id: string; kind: string; target?: string; param?: string; value?: string; reason?: string; actor: string; at: string }>;
  unresolved?: string[];
}

export async function getOperationalBasis(eventComponentId: string, context?: Record<string, unknown>): Promise<OperationalBasis | null> {
  const { data, error } = await supabase.rpc("component_operational_basis", {
    p_event_component: eventComponentId, p_context: context ?? {},
  });
  if (error) throw new Error(error.message);
  return (data as OperationalBasis) ?? null;
}

export async function attachComponentProfile(eventComponentId: string, libraryComponentId: string, revisionId?: string) {
  const { data, error } = await supabase.rpc("attach_component_profile", {
    p_event_component: eventComponentId, p_library_component: libraryComponentId,
    ...(revisionId ? { p_revision: revisionId } : {}),
  });
  if (error) throw new Error(error.message);
  return data as { profile_revision_id: string; revision_no: number };
}

export async function refreshComponentProfile(eventComponentId: string, revisionId?: string) {
  const { data, error } = await supabase.rpc("refresh_component_profile", {
    p_event_component: eventComponentId, ...(revisionId ? { p_revision: revisionId } : {}),
  });
  if (error) throw new Error(error.message);
  return data as { profile_revision_id: string; revision_no: number; orphaned_overrides: number };
}

export type OverrideKind = "parameter" | "suppress" | "add" | "replace";
export async function overrideComponentRequirement(
  eventComponentId: string, kind: OverrideKind,
  opts: { target?: string; paramName?: string; paramValue?: string; requirement?: Record<string, unknown>; reason?: string } = {}
) {
  const { data, error } = await supabase.rpc("override_component_requirement", {
    p_event_component: eventComponentId, p_kind: kind,
    p_target: opts.target ?? null, p_param_name: opts.paramName ?? null,
    p_param_value: opts.paramValue ?? null, p_requirement: opts.requirement ?? null,
    p_reason: opts.reason ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { override_id: string; kind: OverrideKind };
}

/** Legacy projection preview (client mirror of render_legacy_requirements). */
export function legacyPreview(basis: OperationalBasis): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const r0 of basis.requirements ?? []) {
    if (!["active", "added", "replaced"].includes(r0.status)) continue;
    const r = r0.status === "replaced" && r0.replacement ? r0.replacement : r0;
    if (r.resolution?.status === "inactive") continue;
    if (r.family === "labor") out.push({ category: "staff", role: r.label, quantity: r.resolution?.status === "resolved" ? r.resolution.quantity : r.rate });
    else if (r.family === "equipment" && r.provision_source === "rented") out.push({ category: "rental", item: r.label });
    else if (r.family === "equipment") out.push({ category: "equipment", item: r.label });
    else if (r.family === "consumable") out.push({ category: "supply", item: r.label });
  }
  return out;
}
