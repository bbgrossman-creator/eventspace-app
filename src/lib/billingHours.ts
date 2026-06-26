import { Booking } from "./workflow";
import { Policies } from "./policies";

export interface BillableHours {
  hours: number;            // final billable hours
  source: "override" | "actual" | "default";
  incomplete: boolean;      // only one actual time entered
  overtimeHours: number;    // hours beyond the default (>= 0)
  overtimeUnits: number;    // number of overtime increments (rounded up)
  overtimeAmount: number;   // suggested overtime charge ($)
}

function timeToHours(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return null;
  return h + (isNaN(m) ? 0 : m) / 60;
}

/** Compute billable hours and suggested overtime, following the owner's rules:
 *  - hours_override wins if set
 *  - else if BOTH actual start & end are set → end − start
 *  - else → the policy default (flag incomplete if exactly one time is set)
 *  Overtime is everything beyond the default, billed per the policy increment.
 *  It is only ever SUGGESTED — the rep confirms before it becomes a charge. */
export function billableHours(b: Booking, p: Policies): BillableHours {
  const override = (b as { hours_override?: number | null }).hours_override;
  const start = timeToHours((b as { actual_start?: string | null }).actual_start);
  const end = timeToHours((b as { actual_end?: string | null }).actual_end);

  let hours = p.default_event_hours;
  let source: BillableHours["source"] = "default";
  let incomplete = false;

  if (override != null && !isNaN(Number(override))) {
    hours = Number(override);
    source = "override";
  } else if (start != null && end != null) {
    let diff = end - start;
    if (diff < 0) diff += 24; // event crossed midnight
    hours = Math.round(diff * 100) / 100;
    source = "actual";
  } else if (start != null || end != null) {
    incomplete = true; // only one time entered → keep default but flag it
  }

  const overtimeHours = Math.max(0, Math.round((hours - p.default_event_hours) * 100) / 100);
  const incrementHours = p.overtime_increment_min / 60;
  const overtimeUnits = overtimeHours > 0 && incrementHours > 0
    ? Math.ceil(overtimeHours / incrementHours) : 0;
  const overtimeAmount = overtimeUnits * p.overtime_rate;

  return { hours, source, incomplete, overtimeHours, overtimeUnits, overtimeAmount };
}
