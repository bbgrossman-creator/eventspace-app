"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PROMOTE TO BLUEPRINT (v255 · BP-5) — the ceremony's surface. Staged, in
// the open: choose SCOPE (partial promotion is first-class), read what will
// be STRIPPED BY NAME (guests, prices, bound dress, defless components),
// read validation refusals, then create a DRAFT — never a publication. The
// draft opens on the Blueprint Shelf, where §3's intent ceremony remains
// the only door to organizational knowledge.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import { normalizeDesignToContent, PromotionScope } from "@/lib/blueprintPromote";
import { MaterializedDesign } from "@/lib/blueprintDivergence";
import { loadCurrentMaterialized } from "@/lib/blueprintDivergenceSupabase";
import {
  loadSectionRoleNames, loadPromotionTargets, promoteDesignToDraft, PromotionTarget,
} from "@/lib/blueprintPromoteSupabase";

const NAVY = "#102F56";

export default function PromoteToBlueprint({ versionId, designName }: { versionId: string; designName: string }) {
  const [open, setOpen] = useState(false);
  const [design, setDesign] = useState<MaterializedDesign | null>(null);
  const [roleNames, setRoleNames] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState<PromotionTarget[]>([]);
  const [sections, setSections] = useState<Record<string, boolean>>({});
  const [components, setComponents] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [taxonomy, setTaxonomy] = useState("");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string>("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [d, rn, t] = await Promise.all([
        loadCurrentMaterialized(versionId), loadSectionRoleNames(), loadPromotionTargets(),
      ]);
      setDesign(d); setRoleNames(rn); setTargets(t);
      const s: Record<string, boolean> = {}; d.sections.forEach((x) => { s[x.section_type_id] = true; }); setSections(s);
      const c: Record<string, boolean> = {}; d.components.forEach((x) => { c[x.id] = true; }); setComponents(c);
    })();
  }, [open, versionId]);

  const plan = useMemo(() => {
    if (!design) return null;
    const scope: PromotionScope = {
      sections: Object.keys(sections).filter((k) => sections[k]),
      components: Object.keys(components).filter((k) => components[k]),
    };
    return normalizeDesignToContent(design, roleNames, scope, name.trim() || designName);
  }, [design, roleNames, sections, components, name, designName]);

  const act = async () => {
    if (!plan) return;
    setBusy(true); setErr("");
    try {
      const res = await promoteDesignToDraft({
        versionId,
        content: plan.content,
        identityId: mode === "existing" ? targetId : null,
        name: mode === "new" ? name.trim() : null,
        taxonomy: mode === "new" ? taxonomy.trim() || null : null,
      });
      setOutcome(`Draft r${res.revision_number} created on the shelf — publication remains its own ceremony.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  const targetOk = mode === "new" ? name.trim() !== "" : targetId !== "";

  return (
    <>
      <button data-promote onClick={() => setOpen(true)}
        className="text-[11px] px-2 py-0.5 rounded ring-1 ring-[#E7EDF5] text-slate-500 hover:text-slate-700 bg-white">
        Promote to Blueprint…
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-5 max-h-[85vh] overflow-auto">
            {outcome ? (
              <>
                <div className="text-[15px] font-semibold" style={{ color: NAVY }}>Promoted — as a draft</div>
                <p data-promotion-outcome className="mt-2 text-[13px] text-slate-600">{outcome}</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => { setOpen(false); setOutcome(""); }} className="text-[12px] px-3 py-1.5 rounded-md ring-1 ring-[#E7EDF5]">Close</button>
                  <a href="/blueprint-shelf" className="text-[12px] px-3 py-1.5 rounded-md text-white" style={{ background: NAVY }}>Open the Shelf</a>
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-semibold" style={{ color: NAVY }}>Promote to Blueprint</div>
                <p className="mt-1 text-[13px] text-slate-600">
                  One ceremony, one blueprint, a DRAFT only. Choose what travels; read what stays behind.
                </p>

                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[12px] font-medium text-slate-600">Scope — sections</div>
                    {design?.sections.map((s) => (
                      <label key={s.section_type_id} className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-600">
                        <input type="checkbox" data-scope-section checked={sections[s.section_type_id] ?? false}
                          onChange={(e) => setSections((p) => ({ ...p, [s.section_type_id]: e.target.checked }))} />
                        {roleNames[s.section_type_id] ?? s.section_type_id}
                      </label>
                    ))}
                    <div className="mt-2 text-[12px] font-medium text-slate-600">Scope — components</div>
                    {design?.components.map((c) => (
                      <label key={c.id} className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-600">
                        <input type="checkbox" data-scope-component checked={components[c.id] ?? false}
                          onChange={(e) => setComponents((p) => ({ ...p, [c.id]: e.target.checked }))} />
                        {c.title ?? c.id}
                      </label>
                    ))}
                  </div>
                  <div>
                    <div className="text-[12px] font-medium text-slate-600">Target</div>
                    <label className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-600">
                      <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> New identity
                    </label>
                    {mode === "new" && (
                      <div className="ml-5 mt-1 space-y-1.5">
                        <input data-promote-name value={name} onChange={(e) => setName(e.target.value)} placeholder="Blueprint name"
                          className="w-full text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5]" />
                        <input value={taxonomy} onChange={(e) => setTaxonomy(e.target.value)} placeholder="Taxonomy (optional)"
                          className="w-full text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5]" />
                      </div>
                    )}
                    <label className="mt-1.5 flex items-center gap-1.5 text-[12px] text-slate-600">
                      <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} /> Existing identity (next draft)
                    </label>
                    {mode === "existing" && (
                      <select data-promote-target value={targetId} onChange={(e) => setTargetId(e.target.value)}
                        className="ml-5 mt-1 w-full text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5] bg-white">
                        <option value="">— choose —</option>
                        {targets.map((t) => (
                          <option key={t.id} value={t.id} disabled={t.hasDraft}>
                            {t.name}{t.hasDraft ? " (carries a draft)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {plan && (
                  <div data-staged-review className="mt-4 rounded-md bg-[#F9FBFE] ring-1 ring-[#EDF2F8] p-3">
                    <div className="text-[12px] font-medium text-slate-600">
                      Staged review — {plan.content.structure[0].sections.length} section(s),{" "}
                      {plan.content.structure[0].sections.reduce((n, s) => n + s.entries.length, 0)} entr(ies) travel
                    </div>
                    {plan.stripped.length > 0 && (
                      <ul data-stripped className="mt-1.5 space-y-0.5">
                        {plan.stripped.map((s, i) => (
                          <li key={i} className="text-[12px] text-slate-500">
                            · <span className="font-medium">{s.reason}</span> — {s.at}{s.detail ? `: ${s.detail}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!plan.validation.ok && (
                      <div data-promotion-refusals className="mt-2 rounded bg-rose-50 ring-1 ring-rose-200 p-2">
                        {plan.validation.refusals.map((r, i) => (
                          <div key={i} className="text-[12px] text-rose-600">· {r}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {err && <div className="mt-2 text-[12px] text-rose-600">{err}</div>}

                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="text-[12px] px-3 py-1.5 rounded-md ring-1 ring-[#E7EDF5]">Cancel</button>
                  <button data-promote-act disabled={busy || !plan || !plan.validation.ok || !targetOk}
                    onClick={() => void act()}
                    className="text-[12px] px-3 py-1.5 rounded-md text-white disabled:opacity-40" style={{ background: NAVY }}>
                    Create the draft
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
