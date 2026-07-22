"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  getOperationalBasis, attachComponentProfile, refreshComponentProfile,
  overrideComponentRequirement, legacyPreview,
  type OperationalBasis, type BasisRequirement,
} from "@/lib/operationalBasis";

/** v284 — Proposal Component Inspector. Renders the SQL basis verbatim:
 *  pin + revision indicator, inherited requirements with override status and
 *  lineage, the four override ceremonies, and the legacy projection preview.
 *  In `frozen` mode (accepted/released engagements) the card renders the
 *  EMBEDDED basis passed to it and exposes no mutation affordances — the
 *  frozen boundary is visual as well as legal. */
export default function OperationalBasisCard({
  eventComponentId, frozen, frozenBasis,
}: { eventComponentId: string; frozen?: boolean; frozenBasis?: OperationalBasis }) {
  const [basis, setBasis] = useState<OperationalBasis | null>(frozenBasis ?? null);
  const [libs, setLibs] = useState<Array<{ id: string; name: string }>>([]);
  const [pick, setPick] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paramDraft, setParamDraft] = useState({ name: "service_points", value: "" });
  const [addDraft, setAddDraft] = useState({ family: "labor", kind: "role_headcount", label: "", basis: "fixed", rate: "1", unit: "people" });
  const [replaceFor, setReplaceFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (frozen) return;
    try { setBasis(await getOperationalBasis(eventComponentId)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [eventComponentId, frozen]);

  useEffect(() => {
    refresh();
    if (!frozen) supabase.from("library_component").select("id,name").eq("active", true)
      .then(({ data }) => setLibs((data as Array<{ id: string; name: string }>) ?? []));
  }, [refresh, frozen]);

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null); setBusy(true);
    try { await fn(); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message.replace(/^Error:\s*/, "") : String(e)); }
    finally { setBusy(false); }
  };

  if (!basis) return <div className="p-4 text-sm text-slate-400" data-basis-loading>Loading operational basis…</div>;

  // ── unpinned: attach ceremony ──
  if (!basis.pinned && !frozen) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4" data-basis-card data-basis-unpinned>
        <div className="text-sm font-semibold text-slate-200 mb-2">Operational profile</div>
        <div className="text-xs text-slate-400 mb-3">This component carries no reusable operational knowledge yet. Attaching pins the library&apos;s current revision — it will never move without an explicit refresh.</div>
        {err && <div className="text-xs text-rose-400 mb-2" data-basis-error>{err}</div>}
        <div className="flex gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} data-basis-attach-pick
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 flex-1">
            <option value="">Choose a library component…</option>
            {libs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button disabled={!pick || busy} onClick={() => run(() => attachComponentProfile(eventComponentId, pick))}
            data-basis-attach className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-xs text-white">
            Attach profile
          </button>
        </div>
      </div>
    );
  }

  const reqs = basis.requirements ?? [];
  const badge = (r: BasisRequirement) =>
    r.status === "suppressed" ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300" data-basis-status="suppressed">suppressed</span>
    : r.status === "replaced" ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300" data-basis-status="replaced">replaced</span>
    : r.status === "added" ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-300" data-basis-status="added">added</span>
    : <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300" data-basis-status="active">library</span>;
  const qty = (r: BasisRequirement) => {
    const res = r.status === "replaced" && r.replacement ? r.replacement.resolution : r.resolution;
    if (!res) return null;
    if (res.status === "resolved") return <span className="text-emerald-300" data-basis-qty>{res.quantity} {res.unit ?? r.unit ?? ""}</span>;
    if (res.status === "unresolved") return <span className="text-amber-300" data-basis-qty-unresolved>needs {res.missing}</span>;
    return <span className="text-slate-500" data-basis-qty-inactive>inactive</span>;
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3" data-basis-card data-basis-frozen={frozen ? "true" : undefined}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Operational basis</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-900/70 text-indigo-300 border border-indigo-700" data-basis-revision>
            revision {basis.revision_no}
          </span>
          {frozen
            ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300" data-basis-frozen-badge>frozen · embedded at publish</span>
            : <button disabled={busy} onClick={() => run(() => refreshComponentProfile(eventComponentId))}
                data-basis-refresh className="text-[10px] px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">
                Refresh to current
              </button>}
        </div>
      </div>
      {err && <div className="text-xs text-rose-400" data-basis-error>{err}</div>}

      <div className="space-y-1" data-basis-requirements>
        {reqs.map((r, i) => (
          <div key={r.requirement_id ?? `add-${i}`} className="flex items-center gap-2 text-xs border-b border-slate-800 py-1.5" data-basis-req data-basis-req-label={r.label}>
            {badge(r)}
            <span className={`flex-1 ${r.status === "suppressed" ? "line-through text-slate-500" : "text-slate-200"}`}>
              {r.label ?? r.kind}
              {r.status === "replaced" && r.replacement && (
                <span className="ml-1 text-amber-300" data-basis-replacement>→ {r.replacement.label}</span>)}
              {r.status === "suppressed" && r.reason && (
                <span className="ml-1 text-slate-500 not-italic" data-basis-suppress-reason>({r.reason})</span>)}
            </span>
            <span className="text-slate-500">{r.family}·{r.basis}</span>
            {qty(r)}
            {!frozen && r.status === "active" && r.requirement_id && (
              <span className="flex gap-1">
                <button data-basis-suppress-btn onClick={() => {
                  const reason = window.prompt("Suppression requires a reason:");
                  if (reason) run(() => overrideComponentRequirement(eventComponentId, "suppress", { target: r.requirement_id, reason }));
                }} className="text-[10px] px-1.5 rounded bg-rose-900/50 hover:bg-rose-800 text-rose-300">suppress</button>
                <button data-basis-replace-btn onClick={() => setReplaceFor(replaceFor === r.requirement_id ? null : r.requirement_id!)}
                  className="text-[10px] px-1.5 rounded bg-amber-900/50 hover:bg-amber-800 text-amber-300">replace</button>
              </span>
            )}
          </div>
        ))}
        {replaceFor && !frozen && (
          <div className="flex gap-2 items-center py-2" data-basis-replace-form>
            <input placeholder="replacement label" value={addDraft.label}
              onChange={(e) => setAddDraft({ ...addDraft, label: e.target.value })}
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 flex-1" data-basis-replace-label />
            <button disabled={!addDraft.label || busy} data-basis-replace-commit
              onClick={() => run(async () => {
                await overrideComponentRequirement(eventComponentId, "replace", {
                  target: replaceFor,
                  requirement: { family: "equipment", kind: "equipment_item", label: addDraft.label, basis: "fixed", rate: 1, unit: "count" },
                  reason: "replaced in inspector",
                }); setReplaceFor(null);
              })}
              className="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-xs text-white">Replace</button>
          </div>
        )}
      </div>

      {!frozen && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div data-basis-param-form>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Parameter override</div>
            <div className="flex gap-1">
              <select value={paramDraft.name} onChange={(e) => setParamDraft({ ...paramDraft, name: e.target.value })}
                data-basis-param-name className="bg-slate-800 border border-slate-600 rounded px-1 py-1 text-xs text-slate-200">
                {["service_points", "guest_count", "table_count", "duration_hours", "batch_count", "shift_count", "instance_count"].map((p) => <option key={p}>{p}</option>)}
              </select>
              <input value={paramDraft.value} onChange={(e) => setParamDraft({ ...paramDraft, value: e.target.value })}
                data-basis-param-value placeholder="value" className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 w-16" />
              <button disabled={!paramDraft.value || busy} data-basis-param-commit
                onClick={() => run(() => overrideComponentRequirement(eventComponentId, "parameter", { paramName: paramDraft.name, paramValue: paramDraft.value }))}
                className="px-2 rounded bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-xs text-white">Set</button>
            </div>
          </div>
          <div data-basis-add-form>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Add requirement</div>
            <div className="flex gap-1">
              <input value={addDraft.label} onChange={(e) => setAddDraft({ ...addDraft, label: e.target.value })}
                data-basis-add-label placeholder="label" className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 flex-1" />
              <button disabled={!addDraft.label || busy} data-basis-add-commit
                onClick={() => run(() => overrideComponentRequirement(eventComponentId, "add", {
                  requirement: { family: addDraft.family, kind: addDraft.kind, label: addDraft.label, basis: addDraft.basis, rate: Number(addDraft.rate), unit: addDraft.unit },
                }))}
                className="px-2 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-xs text-white">Add</button>
            </div>
          </div>
        </div>
      )}

      <div className="pt-1" data-basis-legacy>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
          {frozen ? "Embedded operational summary" : "Legacy projection (what publish will embed)"}
        </div>
        <div className="flex flex-wrap gap-1">
          {legacyPreview(basis).map((l, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300" data-basis-legacy-item>
              {String(l.category)}: {String(l.role ?? l.item)}{l.quantity !== undefined ? ` ×${l.quantity}` : ""}
            </span>
          ))}
        </div>
      </div>
      {(basis.unresolved?.length ?? 0) > 0 && (
        <div className="text-[10px] text-amber-400" data-basis-unresolved>
          Unresolved parameters: {basis.unresolved!.join(", ")} — resolution is optional by law; unresolved is information.
        </div>
      )}
    </div>
  );
}
