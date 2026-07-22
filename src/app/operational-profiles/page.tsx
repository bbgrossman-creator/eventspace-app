"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listLibraryComponents, createLibraryComponent, type LibraryComponent } from "@/lib/operationalProfile";

/** v283 — Operational Profile Library (list + create). Minimal Inspector
 *  entry surface. Duplicate detection is advisory, never blocking. */
export default function OperationalProfilesPage() {
  const [rows, setRows] = useState<LibraryComponent[]>([]);
  const [name, setName] = useState(""); const [kind, setKind] = useState("station");
  const [dupes, setDupes] = useState<{ id: string; name: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => listLibraryComponents().then(setRows).catch((e) => setErr(String(e.message ?? e)));
  useEffect(() => { refresh(); }, []);

  const create = async () => {
    setErr(null); setDupes([]);
    try { const r = await createLibraryComponent(name, kind); setDupes(r.possibleDuplicates); setName(""); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="mx-auto max-w-3xl p-6" data-oplib-page>
      <h1 className="text-xl font-semibold text-slate-800">Operational Profiles</h1>
      <p className="mt-1 text-sm text-slate-500">Reusable components and the operational requirements they declare.</p>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Component name (e.g. Carving Station)"
          data-oplib-name className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} data-oplib-kind className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          {["station","passed","buffet","plated","display","bar","service","general"].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button onClick={create} disabled={!name.trim()} data-oplib-create
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">Add component</button>
      </div>
      {dupes.length > 0 && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-oplib-dupes>
          Created. Similar existing components: {dupes.map((d) => d.name).join(", ")} (advisory — identity is never name-based).
        </div>
      )}
      {err && <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" data-oplib-error>{err}</div>}
      <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200" data-oplib-list>
        {rows.filter((r) => r.active).map((r) => (
          <li key={r.id} className="flex items-center justify-between px-3 py-2" data-oplib-row={r.name}>
            <Link href={`/operational-profiles/${r.id}`} className="text-sm font-medium text-slate-800 hover:underline">{r.name}</Link>
            <span className="text-xs text-slate-400">{r.kind}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-4 text-sm text-slate-400">No library components yet.</li>}
      </ul>
    </div>
  );
}
