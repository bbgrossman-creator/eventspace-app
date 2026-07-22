"use client";
import { useCallback, useEffect, useState } from "react";
import {
  getEventStageDetail, startService, closeEvent, loadEvidence,
  type EventStageDetail, type EventStage, type EvidenceRow,
} from "@/lib/execution/spine";

/** Event lifecycle surface (v276). The stage and its explanation are DERIVED in
 *  SQL (event_stage_detail) — this component renders that authoritative result and
 *  never recomputes a stage in React. The user always sees why the event is in its
 *  stage, the facts that established it, the blockers, and the next authorized
 *  action. Lifecycle actions invoke the ceremonies; a refusal is shown verbatim. */
const STAGE_ORDER: EventStage[] = ["released", "in_prep", "ready", "in_service", "closed"];
const STAGE_STYLE: Record<EventStage, string> = {
  released: "bg-neutral-100 text-neutral-700 border-neutral-300",
  in_prep: "bg-sky-50 text-sky-700 border-sky-200",
  ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
  in_service: "bg-indigo-50 text-indigo-700 border-indigo-200",
  closed: "bg-neutral-800 text-white border-neutral-800",
};

export default function EventLifecycle({ eventId, actor }: { eventId: string; actor: string }) {
  const [detail, setDetail] = useState<EventStageDetail | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [override, setOverride] = useState("");

  const refresh = useCallback(async () => {
    setDetail(await getEventStageDetail(eventId));
    setEvidence((await loadEvidence(eventId)).filter((e) =>
      ["released", "service_start", "event_closed"].includes(e.kind)));
  }, [eventId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const doStart = useCallback(async () => {
    setBusy(true); setRefusal(null);
    try { await startService(eventId, actor); await refresh(); }
    catch (e) { setRefusal(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [eventId, actor, refresh]);

  const doClose = useCallback(async () => {
    setBusy(true); setRefusal(null);
    try { await closeEvent(eventId, actor, override || ""); await refresh(); }
    catch (e) { setRefusal(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [eventId, actor, override, refresh]);

  if (!detail) return <div className="p-4 text-sm text-neutral-500">Loading event lifecycle…</div>;

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 p-4" data-event-lifecycle data-lifecycle-stage={detail.stage}>
      {/* stage rail */}
      <div className="flex items-center gap-1.5 text-xs">
        {STAGE_ORDER.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`rounded border px-2 py-0.5 ${s === detail.stage ? STAGE_STYLE[s] : "border-neutral-200 text-neutral-400"}`}>
              {s}
            </span>
            {i < STAGE_ORDER.length - 1 && <span className="text-neutral-300">→</span>}
          </span>
        ))}
      </div>

      <div className="text-sm text-neutral-700">{detail.why}</div>

      {detail.blockers.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Blockers</div>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
            {detail.blockers.map((b, i) => <li key={i}>• {b}</li>)}
          </ul>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Established by</div>
        {evidence.length === 0 ? (
          <div className="text-xs text-neutral-400">No lifecycle facts yet.</div>
        ) : (
          <ul className="mt-1 space-y-0.5 text-xs text-neutral-600">
            {evidence.map((e) => (
              <li key={e.id}>
                <span className="font-medium">{e.kind}</span> · {e.actor} · {new Date(e.moment).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-neutral-100 pt-3">
        <div className="text-xs text-neutral-500">Next: {detail.next_action}</div>
        {refusal && (
          <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {refusal.replace(/^Error:\s*/, "")}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          {detail.stage === "ready" && (
            <button disabled={busy} onClick={doStart} data-start-service
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
              Start service
            </button>
          )}
          {detail.stage === "in_service" && (
            <>
              <input className="rounded border border-neutral-300 px-2 py-1 text-sm"
                placeholder="Closeout override ref" value={override} onChange={(e) => setOverride(e.target.value)} />
              <button disabled={busy || !override} onClick={doClose} data-close-event
                className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
                Close event
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
