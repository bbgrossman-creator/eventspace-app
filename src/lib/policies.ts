import { supabase } from "./supabase";

export type ConflictMode = "indefinite" | "timed" | "first_refusal";
export type LapseAction = "flag" | "auto_release";

export interface Policies {
  conflict_mode: ConflictMode;
  hold_hours: number;
  refusal_deadline_hours: number;
  refusal_lapse_action: LapseAction;
  default_event_hours: number;
  overtime_increment_min: number;
  overtime_rate: number;
  turnaround_buffer_min: number;
  max_service_hours: number;
}

export const POLICY_DEFAULTS: Policies = {
  conflict_mode: "timed",
  hold_hours: 24,
  refusal_deadline_hours: 4,
  refusal_lapse_action: "flag",
  default_event_hours: 4,
  overtime_increment_min: 30,
  overtime_rate: 200,
  turnaround_buffer_min: 60,
  max_service_hours: 4,
};

const NUMERIC: (keyof Policies)[] = [
  "hold_hours", "refusal_deadline_hours", "default_event_hours",
  "overtime_increment_min", "overtime_rate",
  "turnaround_buffer_min", "max_service_hours",
];

/** Load all policy settings, falling back to defaults for any that are unset. */
export async function loadPolicies(): Promise<Policies> {
  const { data } = await supabase.from("app_settings").select("key,value");
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const out = { ...POLICY_DEFAULTS };
  for (const k of Object.keys(POLICY_DEFAULTS) as (keyof Policies)[]) {
    const raw = map.get(k);
    if (raw == null) continue;
    if (NUMERIC.includes(k)) (out[k] as number) = Number(raw);
    else (out[k] as string) = raw;
  }
  return out;
}

/** Upsert a single policy value. */
export async function savePolicy(key: keyof Policies, value: string | number): Promise<void> {
  const v = String(value);
  // Try update; if no row exists yet, insert.
  const { data } = await supabase.from("app_settings").select("key").eq("key", key).maybeSingle();
  if (data) await supabase.from("app_settings").update({ value: v }).eq("key", key);
  else await supabase.from("app_settings").insert({ key, value: v });
}
