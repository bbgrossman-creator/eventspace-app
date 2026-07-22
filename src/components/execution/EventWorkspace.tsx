"use client";
import { useCallback, useEffect, useState } from "react";
import {
  getEventWorkspace, startService, closeEvent, recordEvidence,
  type EventWorkspace, type ObligationState, type EventStage, type WsCard,
} from "@/lib/execution/spine";
import StaffingSection from "@/components/execution/StaffingSection";

/** Event Operations Workspace (v277). A single first-class operational surface:
 *  header, lifecycle rail, readiness by category, the workboard, blockers,
 *  next actions, and recent activity — ALL rendered from one authoritative SQL
 *  projection (event_workspace). Nothing (stage, readiness, state, blockers) is
 *  computed here; the UI renders truth and invokes ceremonies. Every action
 *  refreshes the projection and never optimistically contradicts the database. */

const STAGE_ORDER: EventStage[] = ["released", "in_prep", "ready", "in_service", "closed"];
const STATE_STYLE: Record<ObligationState, string> = {
  blocked: "bg-amber-50 text-amber-700 border-amber-200",
  ready: "bg-sky-50 text-sky-700 border-sky-200",
  active: "bg-indigo-50 text-indigo-700 border-indigo-200",
  complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
  exception: "bg-rose-50 text-rose-700 border-rose-200",
  invalidated: "bg-neutral-100 text-neutral-400 border-neutral-200",
};
const CAT_STYLE: Record<string, string> = {
  complete: "text-emerald-700", in_progress: "text-sky-700",
  exception: "text-rose-700", pending: "text-neutral-500",
};

export default function EventWorkspace({ eventId, actor = "ops" }: { eventId: string; actor?: string }) {
  const [ws, setWs] = useState<EventWorkspace | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [override, setOverride] = useState("");

  const refresh = useCallback(async () => { setWs(await getEventWorkspace(eventId)); }, [eventId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setRefusal(null);
    try { await fn(); await refresh(); }
    catch (e) { setRefusal(e instanceof Error ? e.message.replace(/^Error:\s*/, "") : String(e)); }
    finally { setBusy(null); }
  }, [refresh]);

  const cardAction = (c: WsCard) =>
    run(c.id, () => recordEvidence({
      event: eventId, obligation: c.id,
      kind: c.state === "ready" ? "assignment" : "completion", actor,
    }));

  if (!ws) return <div className="p-4 text-sm text-neutral-500" data-ws-loading>Loading workspace…</div>;

  const h = ws.header;
  const pct = h.readiness.total > 0 ? Math.round((h.readiness.resolved / h.readiness.total) * 100) : 0;
  const byDept = groupByDept(ws.workboard);

  return (
    <div className="space-y-5" data-event-workspace>
      {/* 1 · Operational header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4" data-ws-header>
        <div>
          <div className="text-sm font-semibold text-neutral-800">Event Operations</div>
          <div className="text-xs text-neutral-500">
            event {h.event_id.slice(0, 8)}… · engagement {h.engagement_ref.slice(0, 8)}… · released by {h.released_by}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded border border-neutral-300 bg-white px-2 py-1" data-ws-stage>{h.stage}</span>
          <span data-ws-readiness-pct>{h.readiness.resolved}/{h.readiness.total} ready ({pct}%)</span>
          <span className={h.blocker_count ? "text-amber-700" : "text-neutral-400"} data-ws-blocker-count>{h.blocker_count} blocked</span>
          <span className={h.exception_count ? "text-rose-700" : "text-neutral-400"} data-ws-exc-count>{h.exception_count} exceptions</span>
          {h.last_activity && <span className="text-neutral-400">last {new Date(h.last_activity).toLocaleString()}</span>}
        </div>
      </header>

      {refusal && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" data-ws-error>{refusal}</div>
      )}

      {/* 2 · Lifecycle rail (preserves the v276 rail + actions) */}
      <section className="rounded-lg border border-neutral-200 p-4" data-event-lifecycle data-lifecycle-stage={h.stage}>
        <div className="mb-2 flex items-center gap-1.5 text-xs">
          {STAGE_ORDER.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`rounded border px-2 py-0.5 ${s === h.stage ? "border-neutral-800 bg-neutral-800 text-white" : "border-neutral-200 text-neutral-400"}`}>{s}</span>
              {i < STAGE_ORDER.length - 1 && <span className="text-neutral-300">→</span>}
            </span>
          ))}
        </div>
        <div className="text-sm text-neutral-700">{ws.lifecycle.why}</div>
        <div className="mt-1 text-xs text-neutral-500">Next: {ws.lifecycle.next_action}</div>
        <div className="mt-3 flex items-center gap-2">
          {ws.next_actions.map((a) => a.available ? (
            a.action === "start_service" ? (
              <button key={a.action} disabled={busy === a.action} onClick={() => run(a.action, () => startService(eventId, actor))}
                data-start-service className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">{a.label}</button>
            ) : (
              <span key={a.action} className="flex items-center gap-2">
                <input className="rounded border border-neutral-300 px-2 py-1 text-sm" placeholder="Closeout override ref"
                  value={override} onChange={(e) => setOverride(e.target.value)} />
                <button disabled={busy === a.action || !override} onClick={() => run(a.action, () => closeEvent(eventId, actor, override))}
                  data-close-event className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">{a.label}</button>
              </span>
            )
          ) : (
            <span key={a.action} className="text-xs text-neutral-400" title={a.reason ?? ""} data-action-unavailable={a.action}>
              {a.label} — {a.reason}
            </span>
          ))}
        </div>
      </section>

      {/* 3 · Readiness overview */}
      <section className="rounded-lg border border-neutral-200 p-4" data-ws-readiness>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Readiness by department</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {ws.readiness_by_category.map((c) => (
            <div key={c.department} data-ws-cat={c.department} className="rounded border border-neutral-100 p-2">
              <div className="flex items-center justify-between text-sm">
                <span className="capitalize">{c.department}</span>
                <span className={CAT_STYLE[c.state]}>{c.resolved}/{c.total}{c.exceptions ? ` · ${c.exceptions}⚠` : ""}</span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-neutral-100">
                <div className="h-1.5 rounded bg-neutral-700" style={{ width: `${c.total ? (c.resolved / c.total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3b · Staffing coverage (v278) */}
      <StaffingSection eventId={eventId} actor={actor} staffing={ws.staffing}
        canManage={!!h.can_manage_staffing} onChanged={refresh} />

      {/* 4 · Operational workboard */}
      <section className="space-y-3" data-daily-ops>
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Workboard</div>
        {byDept.map(([dept, cards]) => (
          <div key={dept} data-dept={dept} className="rounded-lg border border-neutral-200">
            <header className="border-b border-neutral-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">{dept}</header>
            <ul className="divide-y divide-neutral-100">
              {cards.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className={`text-sm ${c.decision_debt ? "text-amber-700" : "text-neutral-800"}`}>
                      {c.decision_debt ? "⚑ " : ""}{c.exception ? "⚠ " : ""}{c.title}
                    </div>
                    {c.latest_evidence && (
                      <div className="mt-0.5 text-xs text-neutral-400">last: {c.latest_evidence.kind} · {c.latest_evidence.actor}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded border px-2 py-0.5 text-xs ${STATE_STYLE[c.state]}`}>{c.state}</span>
                    {c.actions.includes("assign") && (
                      <button disabled={busy === c.id} onClick={() => cardAction(c)} data-card-assign
                        className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50">Assign</button>
                    )}
                    {c.actions.includes("complete") && (
                      <button disabled={busy === c.id} onClick={() => cardAction(c)} data-card-complete
                        className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-50">Complete</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* 5 · Blockers & exceptions */}
      <section className="rounded-lg border border-neutral-200 p-4" data-ws-blockers>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">What's blocking progress</div>
        {ws.blockers.length === 0 ? (
          <div className="text-sm text-emerald-700">Nothing is blocking this event.</div>
        ) : (
          <ul className="space-y-1.5">
            {ws.blockers.map((b, i) => (
              <li key={i} className="text-sm" data-ws-blocker>
                <span className="text-neutral-800">{b.what}</span>
                <span className="text-neutral-500"> — {b.why}. </span>
                <span className="text-neutral-600">Next: {b.next_action}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 7 · Recent activity */}
      <section className="rounded-lg border border-neutral-200 p-4" data-ws-activity>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Recent operational activity</div>
        {ws.recent_activity.length === 0 ? (
          <div className="text-xs text-neutral-400">No activity yet.</div>
        ) : (
          <ol className="space-y-1">
            {ws.recent_activity.map((a, i) => (
              <li key={i} className="text-xs text-neutral-600" data-ws-activity-item>
                <span className="font-medium">{a.kind}</span> · {a.actor} · {new Date(a.moment).toLocaleString()}
                {a.correction_of ? <span className="text-amber-600"> · correction</span> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function groupByDept(cards: WsCard[]): [string, WsCard[]][] {
  const order = ["culinary", "equipment", "staffing", "venue", "logistics"];
  const map = new Map<string, WsCard[]>();
  for (const c of cards) { (map.get(c.department) ?? map.set(c.department, []).get(c.department)!).push(c); }
  return order.filter((d) => map.has(d)).map((d) => [d, map.get(d)!]);
}
