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
  menu_call_overdue_hours: number;
  setup_hours: number;
  service_hours: number;
  bussing_hours: number;
  changeover_overlap_hours: number;
  /** Comma-separated weekday indices to show on the calendar (0=Sun..6=Sat). */
  calendar_days: string;
  /** 1 = caterer takes off-premise jobs (address instead of room). */
  offprem_enabled: number;
  /** 1 = enforce (warn) daily production-capacity points. */
  capacity_enabled: number;
  /** Guest count above which a job is "big". */
  big_job_guests: number;
  /** Points a small job consumes. */
  points_small: number;
  /** Points a big job consumes. */
  points_big: number;
  /** Total production points available per calendar day. */
  daily_capacity_points: number;
}

export const POLICY_DEFAULTS: Policies = {
  conflict_mode: "timed",
  hold_hours: 24,
  refusal_deadline_hours: 4,
  refusal_lapse_action: "flag",
  default_event_hours: 2.5,
  overtime_increment_min: 30,
  overtime_rate: 200,
  turnaround_buffer_min: 60,
  max_service_hours: 2.5,
  menu_call_overdue_hours: 1,
  setup_hours: 1,
  service_hours: 2.5,
  bussing_hours: 1,
  changeover_overlap_hours: 0.5,
  calendar_days: "0,1,2,3,4,5,6",
  offprem_enabled: 0,
  capacity_enabled: 0,
  big_job_guests: 150,
  points_small: 1,
  points_big: 2,
  daily_capacity_points: 4,
};

/** Load all policy settings, falling back to defaults for any that are unset. */
export async function loadPolicies(): Promise<Policies> {
  const { data } = await supabase.from("app_settings").select("key,value");
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const out = { ...POLICY_DEFAULTS };
  for (const k of Object.keys(POLICY_DEFAULTS) as (keyof Policies)[]) {
    const raw = map.get(k);
    if (raw == null) continue;
    if (typeof POLICY_DEFAULTS[k] === "number") (out[k] as number) = Number(raw);
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

/** The minimum gap between two consecutive events' service blocks, in minutes.
 *  = setup + bussing − overlap (the bussing of the earlier event can overlap the
 *  setup of the later one). E.g. 1 + 1 − 0.5 = 1.5 hrs = 90 min. */
export function changeoverMinutes(p: Policies): number {
  return Math.max(0, (p.setup_hours + p.bussing_hours - p.changeover_overlap_hours) * 60);
}

/** The full operational footprint of a standard event, in hours (setup+service+bussing). */
export function footprintHours(p: Policies): number {
  return p.setup_hours + p.service_hours + p.bussing_hours;
}
