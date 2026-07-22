"use client";
import { useCallback, useEffect, useState } from "react";
import { assembleEventDailyOps, type DailyOpsEventView, type DailyOpsItem } from "@/lib/execution/dailyOps";
import { recordEvidence, type ObligationState } from "@/lib/execution/spine";

/** DailyOps · Event scope (I-38). A pure projection over one released event:
 *  obligations grouped by department, each with origin, blocker, owner, state,
 *  and next action. Completing an action invokes recordEvidence (a domain write
 *  path) and re-derives — DailyOps stores no status of its own. Decision-debt is
 *  shown explicitly, never as a blank. */
const STATE_STYLE: Record<ObligationState, string> = {
  blocked: "bg-amber-50 text-amber-700 border-amber-200",
  ready: "bg-sky-50 text-sky-700 border-sky-200",
  active: "bg-indigo-50 text-indigo-700 border-indigo-200",
  complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
  exception: "bg-rose-50 text-rose-700 border-rose-200",
  invalidated: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

export default function DailyOpsEvent({ eventId, actor }: { eventId: string; actor: string }) {
  const [view, setView] = useState<DailyOpsEventView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setView(await assembleEventDailyOps(eventId));
  }, [eventId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const act = useCallback(async (item: DailyOpsItem, kind: "assignment" | "completion") => {
    setBusy(item.id);
    try {
      await recordEvidence({ event: eventId, obligation: item.id, kind, actor });
      await refresh();
    } finally { setBusy(null); }
  }, [eventId, actor, refresh]);

  if (!view) return <div className="p-4 text-sm text-neutral-500">Loading operational obligations…</div>;
  if (view.total === 0) return <div className="p-4 text-sm text-neutral-500">No operational obligations for this event.</div>;

  return (
    <div className="space-y-4" data-daily-ops>
      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(view.counts) as ObligationState[])
          .filter((s) => view.counts[s] > 0)
          .map((s) => (
            <span key={s} className={`rounded border px-2 py-0.5 ${STATE_STYLE[s]}`}>
              {view.counts[s]} {s}
            </span>
          ))}
      </div>
      {view.byDepartment.map((group) => (
        <section key={group.department} data-dept={group.department} className="rounded-lg border border-neutral-200">
          <header className="border-b border-neutral-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {group.department}
          </header>
          <ul className="divide-y divide-neutral-100">
            {group.items.map((item) => (
              <li key={item.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`text-sm ${item.decisionDebt ? "text-amber-700" : "text-neutral-800"}`}>
                      {item.decisionDebt ? "⚑ " : ""}{item.outcome}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">{item.origin}</div>
                    {item.blockedBy.length > 0 && (
                      <div className="mt-0.5 text-xs text-amber-700">
                        waiting on: {item.blockedBy.join("; ")}
                      </div>
                    )}
                    {item.owner && <div className="mt-0.5 text-xs text-neutral-500">owner: {item.owner}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.state && (
                      <span className={`rounded border px-2 py-0.5 text-xs ${STATE_STYLE[item.state]}`}>
                        {item.state}
                      </span>
                    )}
                    {item.state === "ready" && !item.decisionDebt && (
                      <button disabled={busy === item.id} onClick={() => act(item, "assignment")}
                        className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50">
                        Assign
                      </button>
                    )}
                    {item.state === "active" && (
                      <button disabled={busy === item.id} onClick={() => act(item, "completion")}
                        className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-50">
                        Complete
                      </button>
                    )}
                  </div>
                </div>
                {!item.decisionDebt && item.state !== "complete" && (
                  <div className="mt-1 text-xs text-neutral-400">next: {item.nextAction}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
