"use client";
// ═══════════════════════════════════════════════════════════════════════════
// SPINE SURFACES (v263 · PL-1). Three props-driven components (the harness
// drives them directly) + one connected wrapper for the booking page.
//
//   SpineBadge — value AND provenance, always both: a ceremonial state
//     renders plainly; a legacy-derived classification renders with its
//     provenance on its face and "ceremonial spine state: absent" legible.
//     The display never collapses the two concepts.
//   EngagementHistory — the ledger, rendered append-only: entries carry no
//     edit or delete affordance of any kind, by construction.
//   DeclineDoor — the one spine ceremony door PL-1 gives the page: offered
//     ONLY when the CEREMONIAL state is inquiry|proposing (never for
//     legacy-derived rows — no bridge transitions), requires a reason.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { EffectivePosition, SPINE_LABELS } from "@/lib/spine";
import { loadEffectivePosition, loadLedger, declineEngagement, LedgerEntry } from "@/lib/spineSupabase";

export function SpineBadge({ pos }: { pos: EffectivePosition }) {
  const ceremonial = pos.provenance === "ceremonial";
  return (
    <span data-spine-badge data-spine-provenance={pos.provenance}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] ring-1 ${
        ceremonial ? "bg-[#EEF6FF] ring-[#BFDBFE] text-[#1D4ED8]" : "bg-[#F8FAFC] ring-[#E2E8F0] text-slate-500"}`}
      title={ceremonial
        ? `Lifecycle: ${SPINE_LABELS[pos.position]} — reached by ceremony`
        : `Effective lifecycle position: ${SPINE_LABELS[pos.position]} · provenance: legacy-derived · ceremonial spine state: absent`}>
      <span>{SPINE_LABELS[pos.position]}</span>
      {!ceremonial && <span data-spine-derived-chip className="rounded bg-slate-200/70 px-1 text-[9px] uppercase tracking-wide">legacy-derived</span>}
    </span>
  );
}

export function EngagementHistory({ entries }: { entries: LedgerEntry[] }) {
  return (
    <div data-engagement-history className="rounded-lg ring-1 ring-[#E7EDF5] bg-white p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
        Engagement history
      </div>
      {entries.length === 0 && (
        <p data-history-empty className="text-[11px] text-slate-400">
          No ceremonies yet — this engagement's history begins with its first one. Honestly empty is honestly empty.
        </p>
      )}
      {entries.map((e) => (
        <div key={e.id} data-ledger-entry className="text-[11.5px] text-slate-600 py-0.5 border-b border-[#F4F7FB] last:border-0">
          <span className="text-slate-400">{new Date(e.moment).toLocaleString()}</span>
          {" · "}<b>{e.ceremony}</b>{" · "}{e.actor}
          {e.from_state || e.to_state ? <span className="text-slate-400"> · {e.from_state ?? "—"} → {e.to_state ?? "—"}</span> : null}
          {e.reason ? <span className="text-slate-400"> · "{e.reason}"</span> : null}
        </div>
      ))}
    </div>
  );
}

export function DeclineDoor({ pos, busy, onDecline }: {
  pos: EffectivePosition; busy: boolean; onDecline: (reason: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const available = pos.provenance === "ceremonial" && (pos.position === "inquiry" || pos.position === "proposing");
  if (!available) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {!asking && (
        <button data-ceremony-decline disabled={busy} onClick={() => setAsking(true)}
          className="text-[11px] text-slate-400 underline hover:text-slate-600">
          Decline engagement…
        </button>
      )}
      {asking && (
        <>
          <input data-decline-reason autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)" className="field !py-0.5 !text-[11px] !bg-white w-52" />
          <button data-decline-commit disabled={busy || !reason.trim()}
            onClick={() => onDecline(reason.trim())}
            className="text-[11px] font-medium text-rose-600 hover:underline">Decline</button>
          <button className="text-[11px] text-slate-400 underline" onClick={() => { setAsking(false); setReason(""); }}>cancel</button>
        </>
      )}
    </span>
  );
}

/** Connected wrapper for the booking page: loads position + history, wires
 *  the decline ceremony, reloads after it — nothing else moves the badge. */
export default function EngagementSpine({ bookingId, actor }: { bookingId: string; actor: string }) {
  const [pos, setPos] = useState<EffectivePosition | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const reload = () => {
    void loadEffectivePosition(bookingId).then(setPos).catch(() => {});
    void loadLedger(bookingId).then(setEntries).catch(() => {});
  };
  useEffect(reload, [bookingId]);
  if (!pos) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <SpineBadge pos={pos} />
        <DeclineDoor pos={pos} busy={busy} onDecline={(reason) => {
          setBusy(true); setErr("");
          void declineEngagement(bookingId, actor, reason)
            .then((r) => { if (!r.ok) setErr(r.detail ?? "The ceremony was refused."); reload(); })
            .finally(() => setBusy(false));
        }} />
      </div>
      {err && <p className="text-[11px] text-rose-600">{err}</p>}
      <EngagementHistory entries={entries} />
    </div>
  );
}
