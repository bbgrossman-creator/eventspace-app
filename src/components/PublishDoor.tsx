"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PUBLISH DOOR (v265 · PL-3 Phase A). The offer's publication surface —
// props-driven so the harness drives it directly. It exposes the law, nothing
// more: Prepare (stage the artifact), then Publish (the atomic door), with the
// two Phase-A evidence bases (observed via a durable endpoint; attested
// in-person) and the door's named refusals surfaced honestly. A SEALED version
// shows no edit affordance — only "start a new version."
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from "react";

export interface DoorState {
  sealed: boolean;                 // is this version already published?
  prepared: boolean;               // does a staged package exist?
  archiveReady: boolean;           // does the staged package carry an archive?
  complete: boolean;               // completeness core + profile
  reviewSatisfied: boolean;        // current-policy review
}

export function PublishDoor({ state, busy, lastRefusal, onPrepare, onPublish }: {
  state: DoorState; busy: boolean; lastRefusal: string | null;
  onPrepare: () => void;
  onPublish: (evidence: "observed" | "attested", occurredAt?: string, note?: string) => void;
}) {
  const [attesting, setAttesting] = useState(false);
  const [note, setNote] = useState("");

  if (state.sealed) {
    return (
      <div data-publish-sealed className="rounded-lg bg-[#F0FDF4] ring-1 ring-[#BBF7D0] p-3">
        <div className="text-[12px] font-semibold text-[#166534]">Published — this offer is sealed.</div>
        <p data-sealed-note className="text-[11px] text-slate-500 mt-0.5">
          Its content is frozen and permanent. Any change starts a new version.
        </p>
        {/* deliberately NO edit affordance here */}
      </div>
    );
  }

  return (
    <div data-publish-door className="rounded-lg bg-white ring-1 ring-[#E7EDF5] p-3 space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Publish this offer</div>

      {!state.prepared && (
        <button data-prepare disabled={busy} onClick={onPrepare}
          className="text-[12px] font-medium text-[#2F80ED] hover:underline">
          Prepare the artifact…
        </button>
      )}

      {state.prepared && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[11px]">
            <span data-prep-archive className={state.archiveReady ? "text-emerald-600" : "text-rose-500"}>
              {state.archiveReady ? "✓ archive ready" : "✗ archive missing"}
            </span>
            <span data-prep-complete className={state.complete ? "text-emerald-600" : "text-rose-500"}>
              {state.complete ? "✓ complete" : "✗ incomplete"}
            </span>
            <span data-prep-review className={state.reviewSatisfied ? "text-emerald-600" : "text-amber-600"}>
              {state.reviewSatisfied ? "✓ review clear" : "⧗ review required"}
            </span>
          </div>

          {!attesting && (
            <div className="flex items-center gap-2">
              <button data-publish-observed disabled={busy} onClick={() => onPublish("observed")}
                className="text-[12px] font-medium text-white bg-[#2F80ED] rounded px-2.5 py-1 hover:bg-[#2568C4] disabled:opacity-50">
                Publish (customer link)
              </button>
              <button data-publish-attest disabled={busy} onClick={() => setAttesting(true)}
                className="text-[11px] text-slate-400 underline hover:text-slate-600">
                or record an in-person presentation…
              </button>
            </div>
          )}

          {attesting && (
            <div className="flex items-center gap-2 flex-wrap">
              <input data-attest-note value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Where/how was it shown?" className="field !py-0.5 !text-[11px] !bg-white w-56" />
              <button data-attest-commit disabled={busy || !note.trim()}
                onClick={() => onPublish("attested", new Date().toISOString(), note.trim())}
                className="text-[12px] font-medium text-emerald-700 hover:underline">
                Record presentation
              </button>
              <button className="text-[11px] text-slate-400 underline" onClick={() => setAttesting(false)}>cancel</button>
            </div>
          )}
        </div>
      )}

      {lastRefusal && (
        <p data-publish-refusal className="text-[11px] text-rose-600 bg-rose-50 rounded px-2 py-1">
          {lastRefusal}
        </p>
      )}
    </div>
  );
}
