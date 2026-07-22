"use client";
import { useState } from "react";
import { releaseEvent } from "@/lib/execution/spine";

/** Operational Release (I-32): a default-deny, layered ceremony. The UI never
 *  gates on a status string — it collects the release evidence (sign-off, and a
 *  clearance ref or waiver) and lets the server ceremony re-check the layered
 *  predicate over immutable facts. A refusal names the missing layer, which we
 *  surface verbatim as the explained checklist. */
export default function ReleaseAction({
  bookingId, actor, onReleased,
}: {
  bookingId: string;
  actor: string;
  onReleased?: (eventId: string, generatedCount: number) => void;
}) {
  const [signoff, setSignoff] = useState("");
  const [clearance, setClearance] = useState("");
  const [waiver, setWaiver] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState<{ eventId: string; count: number } | null>(null);

  async function release() {
    setBusy(true); setRefusal(null);
    try {
      const r = await releaseEvent({
        booking: bookingId, actor, signoffRef: signoff || "",
        clearanceRef: clearance || null, waiverRef: waiver || null,
      });
      setDone({ eventId: r.eventId, count: r.generatedCount });
      onReleased?.(r.eventId, r.generatedCount);
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        Event released. {done.count} obligations generated across the operational departments.
      </div>
    );
  }

  const layer = refusal?.match(/RELEASE_PREDICATE_UNSATISFIED:\s*(\w+)/)?.[1] ?? null;

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <div className="text-sm font-medium text-neutral-800">Release for execution</div>
      <ul className="space-y-1 text-xs text-neutral-600">
        <li className={layer === "commitment" ? "text-rose-600" : ""}>
          • Customer commitment — an unrescinded acceptance (verified server-side)
        </li>
        <li className={layer === "clearance" ? "text-rose-600" : ""}>
          • Financial clearance — a deposit/credit ref, or an authorized waiver
        </li>
        <li className={layer === "sign_off" ? "text-rose-600" : ""}>
          • Operational sign-off — an operator release attestation
        </li>
      </ul>
      <div className="grid gap-2">
        <input className="rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Sign-off ref" value={signoff} onChange={(e) => setSignoff(e.target.value)} />
        <input className="rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="Clearance ref (deposit/credit)" value={clearance} onChange={(e) => setClearance(e.target.value)} />
        <input className="rounded border border-neutral-300 px-2 py-1 text-sm"
          placeholder="…or authorized waiver ref" value={waiver} onChange={(e) => setWaiver(e.target.value)} />
      </div>
      {refusal && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {refusal.replace(/^Error:\s*/, "")}
        </div>
      )}
      <button disabled={busy} onClick={release}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
        {busy ? "Releasing…" : "Release event"}
      </button>
    </div>
  );
}
