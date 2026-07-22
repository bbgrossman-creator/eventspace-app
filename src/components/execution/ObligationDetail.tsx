"use client";
import { useEffect, useState } from "react";
import {
  loadEvidence, loadObligations, getObligationState,
  type ObligationRow, type EvidenceRow, type ObligationState,
} from "@/lib/execution/spine";

/** Obligation detail: why it exists (origin/provenance), what it waits on
 *  (dependencies), and its full append-only evidence history (I-33/I-35).
 *  Corrections appear as additional facts — nothing is ever rewritten. */
export default function ObligationDetail({ eventId, obligationId }: { eventId: string; obligationId: string }) {
  const [obl, setObl] = useState<ObligationRow | null>(null);
  const [state, setState] = useState<ObligationState | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const all = await loadObligations(eventId);
      const mine = all.find((o) => o.id === obligationId) ?? null;
      const ev = await loadEvidence(eventId, obligationId);
      const st = await getObligationState(obligationId);
      if (live) { setObl(mine); setEvidence(ev); setState(st); }
    })();
    return () => { live = false; };
  }, [eventId, obligationId]);

  if (!obl) return <div className="p-4 text-sm text-neutral-500">Loading…</div>;

  return (
    <div className="space-y-4 p-1">
      <div>
        <div className="text-sm font-medium text-neutral-800">{obl.required_outcome}</div>
        <div className="mt-1 text-xs text-neutral-500">
          {obl.department} · {obl.kind}{obl.resource_role ? ` · ${obl.resource_role}` : ""}
          {state ? ` · ${state}` : ""}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Origin</div>
        <div className="text-xs text-neutral-600">
          Generated from the approved decision ({obl.origin_kind}); provenance ref {obl.origin_ref.slice(0, 8)}…
        </div>
      </div>

      {obl.dependencies.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Depends on</div>
          <ul className="text-xs text-neutral-600">
            {obl.dependencies.map((nk) => <li key={nk}>{nk.slice(0, 12)}…</li>)}
          </ul>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Evidence history</div>
        {evidence.length === 0 ? (
          <div className="text-xs text-neutral-400">No evidence recorded yet.</div>
        ) : (
          <ol className="space-y-1">
            {evidence.map((e) => (
              <li key={e.id} className="text-xs text-neutral-600">
                <span className="font-medium">{e.kind}</span>
                {" · "}{e.actor}{" · "}{new Date(e.moment).toLocaleString()}
                {e.prior_ref ? <span className="text-amber-600"> · correction</span> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
