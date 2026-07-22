"use client";
import { useEffect, useState } from "react";
import {
  getEligibleStaff, assignStaff, releaseStaffingAssignment,
  type EventStaffing, type StaffingRequirementView, type EligibleStaff,
} from "@/lib/execution/spine";

/** Staffing section (v278). Renders the derived staffing coverage for the event —
 *  per requirement: role, required/assigned, coverage, conflicts, and each assignee
 *  with their window — and, for authorized users only, a thin assign/remove control
 *  that routes directly to the SQL ceremonies (no client-side coverage logic).
 *  Successful actions refresh the whole workspace projection via onChanged. */
export default function StaffingSection({
  eventId, actor, staffing, canManage, onChanged,
}: {
  eventId: string; actor: string; staffing: EventStaffing | undefined; canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [roster, setRoster] = useState<EligibleStaff[]>([]);
  const [openReq, setOpenReq] = useState<string | null>(null);
  const [pick, setPick] = useState<{ staff: string; start: string; end: string }>({ staff: "", start: "", end: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (canManage) getEligibleStaff(eventId).then(setRoster).catch(() => {}); }, [eventId, canManage]);

  if (!staffing || staffing.total_requirements === 0) {
    return (
      <section className="rounded-lg border border-neutral-200 p-4" data-staffing data-staffing-empty>
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Staffing</div>
        <div className="mt-1 text-sm text-neutral-500">No staffing requirements for this event.</div>
      </section>
    );
  }

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr(null);
    try { await fn(); await onChanged(); setOpenReq(null); setPick({ staff: "", start: "", end: "" }); }
    catch (e) { setErr(e instanceof Error ? e.message.replace(/^Error:\s*/, "") : String(e)); }
    finally { setBusy(null); }
  };

  const tone = staffing.readiness === "covered" ? "text-emerald-700"
    : staffing.conflicts > 0 ? "text-rose-700" : "text-amber-700";

  return (
    <section className="rounded-lg border border-neutral-200 p-4" data-staffing data-staffing-readiness={staffing.readiness}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Staffing coverage</div>
        <div className={`text-xs ${tone}`} data-staffing-summary>
          {staffing.covered}/{staffing.total_requirements} covered
          {staffing.open_positions > 0 ? ` · ${staffing.open_positions} open` : ""}
          {staffing.conflicts > 0 ? ` · ${staffing.conflicts} conflict` : ""}
        </div>
      </div>

      {err && <div className="mb-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" data-staffing-error>{err}</div>}

      <ul className="space-y-2">
        {staffing.requirements.map((r: StaffingRequirementView) => (
          <li key={r.requirement_id} className="rounded border border-neutral-100 p-2" data-staff-req={r.role}>
            <div className="flex items-center justify-between text-sm">
              <span className="capitalize">
                {r.covered ? "✓ " : ""}{r.role}
                <span className="text-neutral-400"> · {r.assigned}/{r.required}{r.over ? ` (+${r.over})` : ""}</span>
                {r.conflicts > 0 && <span className="text-rose-700" data-staff-conflict> · {r.conflicts} conflict</span>}
              </span>
              {canManage && (
                <button onClick={() => setOpenReq(openReq === r.requirement_id ? null : r.requirement_id)}
                  data-assign-open className="rounded bg-neutral-900 px-2 py-1 text-xs text-white">Assign</button>
              )}
            </div>

            {r.assignees.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {r.assignees.map((a) => (
                  <li key={a.assignment_id} className="flex items-center justify-between text-xs text-neutral-600" data-staff-assignee>
                    <span>{a.conflict ? "⚠ " : ""}{a.staff_name ?? a.staff_ref.slice(0, 8)}
                      <span className="text-neutral-400"> · {new Date(a.window_start).toLocaleString()}–{new Date(a.window_end).toLocaleTimeString()}</span>
                    </span>
                    {canManage && (
                      <button disabled={busy === a.assignment_id} data-staff-remove
                        onClick={() => run(a.assignment_id, () => releaseStaffingAssignment(a.assignment_id, actor, "removed"))}
                        className="text-rose-600 disabled:opacity-50">remove</button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canManage && openReq === r.requirement_id && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2" data-assign-form>
                <select value={pick.staff} onChange={(e) => setPick({ ...pick, staff: e.target.value })}
                  data-assign-staff className="rounded border border-neutral-300 px-2 py-1 text-xs">
                  <option value="">Select staff…</option>
                  {roster.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input type="datetime-local" value={pick.start} onChange={(e) => setPick({ ...pick, start: e.target.value })}
                  data-assign-start className="rounded border border-neutral-300 px-2 py-1 text-xs" />
                <input type="datetime-local" value={pick.end} onChange={(e) => setPick({ ...pick, end: e.target.value })}
                  data-assign-end className="rounded border border-neutral-300 px-2 py-1 text-xs" />
                <button disabled={busy === r.requirement_id || !pick.staff || !pick.start || !pick.end} data-assign-submit
                  onClick={() => run(r.requirement_id, () => assignStaff({
                    requirement: r.requirement_id, staff: pick.staff,
                    windowStart: new Date(pick.start).toISOString(), windowEnd: new Date(pick.end).toISOString(), actor,
                  }))}
                  className="rounded bg-indigo-600 px-2 py-1 text-xs text-white disabled:opacity-50">Confirm</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
