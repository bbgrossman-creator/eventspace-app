"use client";
import { useCallback, useEffect, useState } from "react";
import { getCurrentBinding, bindVenue, suggestVenues, listBindableVenues, type CurrentBinding } from "@/lib/binding";
import type { Venue } from "@/lib/venues";

/** v281 — Venue Registry binding for an off-premise engagement.
 *  Renders SQL answers only: unbound (free-text address + explicit link flow
 *  with advisory suggestions), bound (snapshot provenance), redirected
 *  (original vs resolved shown distinctly). Corrections demand a reason.
 *  Nothing here ever auto-binds. */
export default function VenueBindingCard({ bookingId, offpremAddress }: { bookingId: string; offpremAddress?: string | null }) {
  const [binding, setBinding] = useState<CurrentBinding | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [linking, setLinking] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; address: string | null }[]>([]);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setBinding(await getCurrentBinding(bookingId)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoaded(true); }
  }, [bookingId]);
  useEffect(() => { refresh(); }, [refresh]);

  const openLink = async () => {
    setLinking(true); setErr(null); setSelected("");
    try {
      const [vs, sug] = await Promise.all([
        listBindableVenues(),
        offpremAddress ? suggestVenues(offpremAddress) : Promise.resolve([]),
      ]);
      setVenues(vs); setSuggestions(sug);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const doBind = async () => {
    setErr(null);
    try {
      await bindVenue(bookingId, selected, binding ? reason : undefined);
      setLinking(false); setReason(""); await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message.replace(/^Error:\s*/, "") : String(e)); }
  };

  if (!loaded) return null;

  return (
    <div className="card px-5 py-4 mb-5 text-sm" data-binding-card>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Venue Registry</div>
        {binding && !linking && (
          <button data-binding-correct className="text-xs text-slate-500 hover:text-slate-700" onClick={openLink}>
            Correct venue binding
          </button>
        )}
      </div>

      {!binding && !linking && (
        <div className="mt-2 flex items-center justify-between" data-binding-unbound>
          <span className="text-slate-500">📍 {offpremAddress ?? "Off-premise"} <span className="text-xs text-slate-400">· not linked to a venue record</span></span>
          <button data-binding-open className="rounded bg-slate-900 px-2.5 py-1 text-xs text-white" onClick={openLink}>
            Link to Venue Registry
          </button>
        </div>
      )}

      {binding && (
        <div className="mt-2" data-binding-bound>
          <div className="text-slate-800">
            🏛️ <a href={`/venues/${binding.resolved_venue_id}`} data-binding-venue-link className="font-medium hover:underline">{binding.resolved_name ?? binding.bound_name_snapshot}</a>
            {binding.resolved_address && <span className="text-slate-400"> · {binding.resolved_address}</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400" data-binding-provenance>
            bound by {binding.bound_by} · {new Date(binding.bound_at).toLocaleDateString()}
            {binding.reason ? ` · “${binding.reason}”` : ""}{binding.history_count > 1 ? ` · ${binding.history_count} binding facts` : ""}
          </div>
          {binding.redirected && (
            <div className="mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600" data-binding-redirected>
              Originally linked to <span className="font-medium">{binding.bound_name_snapshot}</span> — that record was merged; current venue record is <span className="font-medium">{binding.resolved_name}</span>. The original binding fact is unchanged.
            </div>
          )}
        </div>
      )}

      {linking && (
        <div className="mt-2 space-y-2" data-binding-form>
          {suggestions.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800" data-binding-suggestions>
              Possible matches for this address: {suggestions.map((s) => (
                <button key={s.id} className="mr-2 underline" data-binding-suggestion={s.name} onClick={() => setSelected(s.id)}>{s.name}</button>
              ))}
              <span className="text-amber-600">(advisory — nothing is linked until you bind)</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select value={selected} onChange={(e) => setSelected(e.target.value)} data-binding-select
              className="rounded border border-slate-300 px-2 py-1 text-xs">
              <option value="">Select a venue…</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}{v.address ? ` — ${v.address}` : ""}</option>)}
            </select>
            {binding && (
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for correction (required)"
                data-binding-reason className="rounded border border-slate-300 px-2 py-1 text-xs" />
            )}
            <button disabled={!selected || (!!binding && !reason.trim())} data-binding-bind
              className="rounded bg-indigo-600 px-2.5 py-1 text-xs text-white disabled:opacity-50" onClick={doBind}>
              {binding ? "Correct binding" : "Bind venue"}
            </button>
            <button className="text-xs text-slate-400" onClick={() => setLinking(false)}>Cancel</button>
            <a href="/venues" className="text-xs text-slate-500 underline" data-binding-create-new>Create a new venue…</a>
          </div>
        </div>
      )}

      {err && <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700" data-binding-error>{err}</div>}
    </div>
  );
}
