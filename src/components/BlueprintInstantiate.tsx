"use client";
// ═══════════════════════════════════════════════════════════════════════════
// INSTANTIATE FROM BLUEPRINT (v253 · BP-3) — the act's one surface.
// Offered only for the PUBLISHED revision of an ACTIVE identity (the shelf's
// offeredRevisionId law). Takes the seed parameter (guest count — required,
// typed, never defaulted) and a booking, then performs THE ACT. Refusals
// arrive as a staged, named conflict list and are DISPLAYED — never
// repaired, never retried silently. Success shows the citation in the
// started-from voice and links to the design.
// INSTANTIATION SEVERS ANCESTRY WHILE PRESERVING MEMORY: after this dialog
// closes, no verb anywhere pulls the design toward the blueprint again —
// such a verb does not exist (unit-pinned).
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import {
  BookingOption, listBookingOptions, instantiateBlueprint, BlueprintConflictsError,
} from "@/lib/blueprintInstantiateSupabase";
import { InstantiationConflict, InstantiationResult } from "@/lib/blueprintInstantiate";

const NAVY = "#102F56";

export default function BlueprintInstantiate(props: { revisionId: string; revisionNumber: number; blueprintName: string }) {
  const [open, setOpen] = useState(false);
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [bookingId, setBookingId] = useState("");
  const [guests, setGuests] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<InstantiationConflict[] | null>(null);
  const [result, setResult] = useState<InstantiationResult | null>(null);
  const [plainError, setPlainError] = useState("");

  useEffect(() => {
    if (open) void listBookingOptions().then(setBookings).catch(() => setBookings([]));
  }, [open]);

  const act = async () => {
    setBusy(true); setConflicts(null); setPlainError("");
    try {
      const res = await instantiateBlueprint(props.revisionId, bookingId, Number(guests));
      setResult(res);
    } catch (e) {
      if (e instanceof BlueprintConflictsError) setConflicts(e.conflicts);
      else setPlainError((e as Error).message);
    } finally { setBusy(false); }
  };

  const guestsValid = /^\d+$/.test(guests) && Number(guests) > 0;

  return (
    <>
      <button data-instantiate onClick={() => setOpen(true)}
        className="text-[12px] px-3 py-1.5 rounded-md text-white" style={{ background: NAVY }}>
        Instantiate…
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5">
            {!result ? (
              <>
                <div className="text-[15px] font-semibold" style={{ color: NAVY }}>
                  Instantiate {props.blueprintName} r{props.revisionNumber}
                </div>
                <p className="mt-1.5 text-[13px] text-slate-600">
                  One act: this published revision becomes one independent Event Design under one
                  coherent shelf snapshot. All or nothing.
                </p>
                <div className="mt-3">
                  <div className="text-[12px] text-slate-500">Booking (the envelope)</div>
                  <select data-instantiate-booking value={bookingId} onChange={(e) => setBookingId(e.target.value)}
                    className="mt-1 w-full text-[13px] px-2 py-1.5 rounded ring-1 ring-[#E7EDF5] bg-white">
                    <option value="">— choose —</option>
                    {bookings.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                </div>
                <div className="mt-3">
                  <div className="text-[12px] text-slate-500">
                    Guest count <span className="text-slate-400">— required; a guessed guest count is a lie</span>
                  </div>
                  <input data-instantiate-guests value={guests} onChange={(e) => setGuests(e.target.value)}
                    placeholder="e.g., 200" inputMode="numeric"
                    className="mt-1 w-32 text-[13px] px-2 py-1.5 rounded ring-1 ring-[#E7EDF5]" />
                </div>
                {conflicts && (
                  <div data-staged-conflicts className="mt-3 rounded-md bg-amber-50 ring-1 ring-amber-200 p-3">
                    <div className="text-[12px] font-medium text-amber-800">
                      The act refused — {conflicts.length} named conflict{conflicts.length === 1 ? "" : "s"}, nothing was created:
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {conflicts.map((c, i) => (
                        <li key={i} className="text-[12px] text-amber-700">
                          · <span className="font-medium">{c.kind}</span>
                          {c.at ? ` @ ${c.at}` : ""}{c.key ? ` [${c.key}]` : ""}{c.role ? ` [role ${c.role}]` : ""}
                          {c.detail ? ` — ${c.detail}` : ""}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-1.5 text-[11px] text-amber-600">
                      Resolve in the draft (amendment is supersession) and instantiate again.
                    </div>
                  </div>
                )}
                {plainError && <div className="mt-3 text-[12px] text-rose-600">{plainError}</div>}
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => { setOpen(false); setConflicts(null); }}
                    className="text-[12px] px-3 py-1.5 rounded-md ring-1 ring-[#E7EDF5]">Cancel</button>
                  <button data-instantiate-act disabled={busy || !bookingId || !guestsValid} onClick={() => void act()}
                    className="text-[12px] px-3 py-1.5 rounded-md text-white disabled:opacity-40" style={{ background: NAVY }}>
                    Create the design
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-semibold" style={{ color: NAVY }}>Design created</div>
                <p data-citation className="mt-2 text-[13px] text-slate-700">{result.citation}</p>
                <p className="mt-1 text-[12px] text-slate-400">
                  Snapshot {new Date(result.snapshot_at).toLocaleString()} · fingerprint {result.fingerprint.slice(0, 12)}…
                  — the ancestry is severed; the memory is kept.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => { setOpen(false); setResult(null); }}
                    className="text-[12px] px-3 py-1.5 rounded-md ring-1 ring-[#E7EDF5]">Close</button>
                  <a href={`/bookings/${bookingId}`} data-open-design
                    className="text-[12px] px-3 py-1.5 rounded-md text-white" style={{ background: NAVY }}>
                    Open the booking
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
