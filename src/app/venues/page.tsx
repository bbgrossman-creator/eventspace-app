"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listVenues, createVenue, type Venue } from "@/lib/venues";

/** v280 venue registry — list + create. Deliberately small: the purpose is to
 *  prove the law is reachable. Duplicate detection is advisory (rendered, never
 *  blocking), exactly as the ceremony behaves. */
export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [name, setName] = useState(""); const [vtype, setVtype] = useState("fixed_facility");
  const [address, setAddress] = useState("");
  const [dupes, setDupes] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  const refresh = () => listVenues().then(setVenues).catch((e) => setErr(String(e.message ?? e)));
  useEffect(() => { refresh(); }, []);

  const create = async () => {
    setBusy(true); setErr(null); setDupes([]);
    try {
      const r = await createVenue({ name, venueType: vtype, address: address || undefined });
      setDupes(r.possibleDuplicates); setName(""); setAddress(""); await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-3xl p-6" data-venues-page>
      <h1 className="text-xl font-semibold text-slate-800">Venues</h1>
      <p className="mt-1 text-sm text-slate-500">Tenant-local operational knowledge about places you serve.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3" data-venue-create>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Venue name"
          data-venue-name className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
        <select value={vtype} onChange={(e) => setVtype(e.target.value)} data-venue-type
          className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          <option value="fixed_facility">Fixed facility</option>
          <option value="private_home">Private home</option>
          <option value="outdoor_property">Outdoor property</option>
          <option value="temporary_structure">Temporary structure</option>
        </select>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address"
          data-venue-address className="min-w-[220px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
        <button onClick={create} disabled={busy || !name.trim()} data-venue-submit
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">Add venue</button>
      </div>

      {dupes.length > 0 && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-venue-dupes>
          Created. Heads up — this looks similar to: {dupes.map((d) => d.name).join(", ")}. If it&apos;s the same place, you can merge later.
        </div>
      )}
      {err && <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" data-venue-error>{err}</div>}

      <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200" data-venue-list>
        {venues.filter((v) => !v.redirect_to).map((v) => (
          <li key={v.id} className="flex items-center justify-between px-3 py-2" data-venue-row={v.name}>
            <Link href={`/venues/${v.id}`} className="text-sm font-medium text-slate-800 hover:underline">{v.name}</Link>
            <span className="text-xs text-slate-400">{v.venue_type.replace("_", " ")}{v.address ? ` · ${v.address}` : ""}</span>
          </li>
        ))}
        {venues.length === 0 && <li className="px-3 py-4 text-sm text-slate-400">No venues yet.</li>}
      </ul>
    </div>
  );
}
