"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getLibraryProfile, listRevisions, authorProfileRevision,
  FAMILIES, KINDS, UNITS, BASES,
  type LibraryProfile, type ProfileRevisionRow, type RequirementDecl, type ResolvedRequirement,
} from "@/lib/operationalProfile";

/** v283 — Library Inspector (minimal). Renders SQL answers only: current (or
 *  selected) revision, requirements grouped by family with scaling + units +
 *  per-context resolution, and full revision history. Authoring publishes a
 *  COMPLETE revision — there is no row-level editing, by law. */
export default function OperationalProfileDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<LibraryProfile | null>(null);
  const [revisions, setRevisions] = useState<ProfileRevisionRow[]>([]);
  const [viewRev, setViewRev] = useState<string | "">("");
  const [ctx, setCtx] = useState({ guest_count: "", service_points: "" });
  const [draft, setDraft] = useState<RequirementDecl[]>([]);
  const [row, setRow] = useState<RequirementDecl>({ family: "space", kind: "frontage", basis: "per_service_point", rate: 8, unit: "ft" });
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const context = () => {
    const c: Record<string, unknown> = {};
    if (ctx.guest_count) c.guest_count = Number(ctx.guest_count);
    if (ctx.service_points) c.service_points = Number(ctx.service_points);
    return Object.keys(c).length ? c : undefined;
  };
  const refresh = useCallback(async () => {
    try {
      const [p, revs] = await Promise.all([
        getLibraryProfile(id, context(), viewRev || undefined),
        listRevisions(id),
      ]);
      setProfile(p); setRevisions(revs);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, viewRev, ctx.guest_count, ctx.service_points]);
  useEffect(() => { refresh(); }, [refresh]);

  const publish = async () => {
    setErr(null);
    try { await authorProfileRevision(id, draft, reason || undefined); setDraft([]); setReason(""); setViewRev(""); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message.replace(/^Error:\s*/, "") : String(e)); }
  };

  if (!profile) return <div className="p-6 text-sm text-slate-400" data-oplib-loading>Loading profile…</div>;
  const grouped = FAMILIES.map((f) => ({ family: f, reqs: profile.requirements.filter((r) => r.family === f) })).filter((g) => g.reqs.length > 0);

  const fmtScaling = (r: ResolvedRequirement) =>
    `${r.rate} ${r.unit} ${r.basis.replace(/_/g, " ")}${r.basis === "per_guest_band" ? ` (band ${r.band_size})` : ""}` +
    `${r.min_qty != null ? ` · min ${r.min_qty}` : ""}${r.max_qty != null ? ` · max ${r.max_qty}` : ""}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6" data-oplib-detail>
      <header>
        <h1 className="text-xl font-semibold text-slate-800" data-oplib-title>{profile.name}</h1>
        <p className="text-sm text-slate-500">{profile.kind} · {profile.revision ? `revision ${profile.revision.revision_no} — ${profile.revision.authored_by}` : "no profile authored yet"}</p>
      </header>
      {err && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" data-oplib-error>{err}</div>}

      {/* context + revision selector */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3 text-xs" data-oplib-context>
        <span className="text-slate-400">Resolve for:</span>
        <input value={ctx.guest_count} onChange={(e) => setCtx({ ...ctx, guest_count: e.target.value })} placeholder="guests"
          data-ctx-guests className="w-20 rounded border border-slate-300 px-2 py-1" />
        <input value={ctx.service_points} onChange={(e) => setCtx({ ...ctx, service_points: e.target.value })} placeholder="stations"
          data-ctx-points className="w-20 rounded border border-slate-300 px-2 py-1" />
        <span className="ml-auto text-slate-400">View revision:</span>
        <select value={viewRev} onChange={(e) => setViewRev(e.target.value)} data-oplib-rev-select className="rounded border border-slate-300 px-2 py-1">
          <option value="">current</option>
          {revisions.map((r) => <option key={r.id} value={r.id}>rev {r.revision_no}</option>)}
        </select>
      </div>

      {/* grouped requirements */}
      <section className="rounded-lg border border-slate-200 p-4" data-oplib-requirements>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Requirements — grouped by family</div>
        {grouped.map((g) => (
          <div key={g.family} className="mb-3" data-family-group={g.family}>
            <div className="text-[11px] font-semibold uppercase text-slate-500">{g.family}</div>
            <ul className="mt-1 space-y-1">
              {g.reqs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm" data-req={r.label} data-req-status={r.resolution.status}>
                  <span className="font-medium text-slate-800">{r.label}</span>
                  {r.capability && <span className="rounded bg-indigo-50 px-1 text-[10px] text-indigo-600">capability</span>}
                  <span className="text-xs text-slate-500" data-req-scaling>{fmtScaling(r)}</span>
                  <span className="text-[10px] text-slate-400">{r.aggregation} · {r.temporal}{r.provision_source !== "company" ? ` · ${r.provision_source}` : ""}</span>
                  {r.resolution.status === "resolved" && <span className="rounded bg-emerald-50 px-1.5 text-xs text-emerald-700" data-req-qty>= {r.resolution.quantity} {r.unit}</span>}
                  {r.resolution.status === "unresolved" && <span className="rounded bg-amber-50 px-1.5 text-[11px] text-amber-700" data-req-missing>needs {r.resolution.missing}</span>}
                  {r.resolution.status === "inactive" && <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-500" data-req-inactive>only when {r.resolution.condition}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {grouped.length === 0 && <div className="text-sm text-slate-400" data-oplib-empty>No requirements in this revision.</div>}
      </section>

      {/* revision history */}
      <section className="rounded-lg border border-slate-200 p-4" data-oplib-history>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Revision history (append-only)</div>
        <ul className="space-y-0.5 text-sm text-slate-600" data-oplib-history-list>
          {revisions.map((r) => (
            <li key={r.id} data-history-rev={r.revision_no}>rev {r.revision_no} · {r.authored_by} · {new Date(r.created_at).toLocaleDateString()}{r.reason ? ` · “${r.reason}”` : ""}</li>
          ))}
          {revisions.length === 0 && <li className="text-slate-400">No revisions.</li>}
        </ul>
      </section>

      {/* author a new complete revision */}
      <section className="rounded-lg border border-slate-200 p-4" data-oplib-author>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Author new revision (complete set)</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={row.family} onChange={(e) => { const f = e.target.value; setRow({ ...row, family: f, kind: KINDS[f][0], unit: UNITS[f][0] }); }} data-au-family className="rounded border border-slate-300 px-2 py-1">
            {FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={row.kind} onChange={(e) => setRow({ ...row, kind: e.target.value })} data-au-kind className="rounded border border-slate-300 px-2 py-1">
            {KINDS[row.family].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={row.label ?? ""} onChange={(e) => setRow({ ...row, label: e.target.value })} placeholder="label" data-au-label className="rounded border border-slate-300 px-2 py-1" />
          <select value={row.basis} onChange={(e) => setRow({ ...row, basis: e.target.value })} data-au-basis className="rounded border border-slate-300 px-2 py-1">
            {BASES.map((b) => <option key={b} value={b}>{b.replace(/_/g, " ")}</option>)}
          </select>
          <input value={String(row.rate)} onChange={(e) => setRow({ ...row, rate: Number(e.target.value) || 0 })} placeholder="rate" data-au-rate className="w-16 rounded border border-slate-300 px-2 py-1" />
          {row.basis === "per_guest_band" && (
            <input value={String(row.band_size ?? "")} onChange={(e) => setRow({ ...row, band_size: Number(e.target.value) || undefined })} placeholder="band" data-au-band className="w-16 rounded border border-slate-300 px-2 py-1" />
          )}
          <select value={row.unit} onChange={(e) => setRow({ ...row, unit: e.target.value })} data-au-unit className="rounded border border-slate-300 px-2 py-1">
            {UNITS[row.family].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button data-au-add disabled={!row.rate} className="rounded bg-slate-700 px-2 py-1 text-white disabled:opacity-50"
            onClick={() => setDraft([...draft, { ...row, label: row.label || row.kind }])}>+ add to set</button>
        </div>
        <ul className="mt-2 space-y-0.5 text-xs text-slate-600" data-au-draft>
          {draft.map((d, i) => (
            <li key={i} data-au-draft-row={d.label}>{d.family}/{d.kind} · {d.label} · {d.rate} {d.unit} {d.basis.replace(/_/g, " ")}
              <button className="ml-2 text-rose-500" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
          {draft.length === 0 && <li className="text-slate-400">Empty set — add requirements, then publish as one revision.</li>}
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (recommended for corrections)"
            data-au-reason className="rounded border border-slate-300 px-2 py-1 text-xs" />
          <button data-au-publish disabled={draft.length === 0} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white disabled:opacity-50"
            onClick={publish}>Publish revision {revisions.length + 1}</button>
        </div>
      </section>
    </div>
  );
}
