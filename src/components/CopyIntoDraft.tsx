"use client";
// ═══════════════════════════════════════════════════════════════════════════
// COPY INTO DRAFT (v258 · BP-8) — composition's surface. The language is
// COPY throughout: "copy into draft", "bring selected", "reuse authored
// structure" — the live-dependency verbs are deliberately absent. The
// review shows exactly what will be copied, what dependencies ride along,
// what is omitted, and how collisions resolve BEFORE the act. The result
// is ordinary destination content; the source keeps living its own life.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import { BlueprintContent } from "@/lib/blueprintContent";
import {
  composeIntoDraft as composePure, CompositionSelection, CompositionPlan,
} from "@/lib/blueprintCompose";
import {
  listCompositionSources, loadAvailableDefinitionIds, composeIntoDraft, CompositionSource,
} from "@/lib/blueprintComposeSupabase";

const NAVY = "#102F56";

export default function CopyIntoDraft(props: {
  destIdentityId: string;
  destRevisionId: string;
  destContent: BlueprintContent;
  onCopied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<CompositionSource[]>([]);
  const [availableDefs, setAvailableDefs] = useState<Set<string>>(new Set());
  const [sourceId, setSourceId] = useState("");
  const [pickChapters, setPickChapters] = useState<Record<string, boolean>>({});
  const [pickParams, setPickParams] = useState<Record<string, boolean>>({});
  const [copyPresentation, setCopyPresentation] = useState(false);
  const [onRole, setOnRole] = useState<CompositionPlan["onRoleCollision"]>("append");
  const [onPres, setOnPres] = useState<CompositionPlan["onPresentation"]>("keep-destination");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [s, d] = await Promise.all([
        listCompositionSources(props.destIdentityId), loadAvailableDefinitionIds(),
      ]);
      setSources(s); setAvailableDefs(d);
    })();
  }, [open, props.destIdentityId]);

  const source = sources.find((s) => s.revisionId === sourceId) ?? null;

  const result = useMemo(() => {
    if (!source) return null;
    const selection: CompositionSelection = {
      chapters: Object.keys(pickChapters).filter((k) => pickChapters[k]),
      sections: [], entries: [],
      parameters: Object.keys(pickParams).filter((k) => pickParams[k]),
      presentation: copyPresentation, constraints: false,
    };
    const plan: CompositionPlan = {
      onRoleCollision: onRole, onPresentation: onPres, parameterRemap: {},
    };
    return composePure(source.content, props.destContent, selection, plan, (id) => availableDefs.has(id));
  }, [source, pickChapters, pickParams, copyPresentation, onRole, onPres, props.destContent, availableDefs]);

  const act = async () => {
    if (!result || !source) return;
    setBusy(true); setErr("");
    try {
      await composeIntoDraft({
        sourceRevisionId: source.revisionId,
        destRevisionId: props.destRevisionId,
        content: result.content,
        selected: { chapters: Object.keys(pickChapters).filter((k) => pickChapters[k]),
          parameters: result.copied.parameters, presentation: copyPresentation },
        collisions: { role: onRole, presentation: onPres },
        omissions: result.omissions,
      });
      setDone(`Copied ${result.copied.chapters} chapter(s), ${result.copied.entries} entr(ies)${result.copied.parameters.length ? `, ${result.copied.parameters.length} parameter(s)` : ""} into this draft. The source keeps its own life.`);
      props.onCopied();
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  const blocked = !result || result.problems.length > 0;

  return (
    <>
      <button data-copy-into-draft onClick={() => setOpen(true)}
        className="text-[11px] px-2 py-0.5 rounded ring-1 ring-[#E7EDF5] text-slate-500 hover:text-slate-700 bg-white">
        Copy from another Blueprint…
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-5 max-h-[85vh] overflow-auto">
            {done ? (
              <>
                <div className="text-[15px] font-semibold" style={{ color: NAVY }}>Copied into the draft</div>
                <p data-compose-done className="mt-2 text-[13px] text-slate-600">{done}</p>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => { setOpen(false); setDone(""); }} className="text-[12px] px-3 py-1.5 rounded-md text-white" style={{ background: NAVY }}>Close</button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-semibold" style={{ color: NAVY }}>Copy from another Blueprint</div>
                <p className="mt-1 text-[13px] text-slate-600">
                  Bring selected authored structure from an exact published revision into this draft. What copies becomes yours; the source keeps living its own life.
                </p>

                <div className="mt-3">
                  <div className="text-[12px] font-medium text-slate-600">Source — an exact published revision</div>
                  <select data-compose-source value={sourceId} onChange={(e) => { setSourceId(e.target.value); setPickChapters({}); setPickParams({}); }}
                    className="mt-1 w-full text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5] bg-white">
                    <option value="">— choose —</option>
                    {sources.map((s) => (
                      <option key={s.revisionId} value={s.revisionId}>{s.identityName} · r{s.revisionNumber}</option>
                    ))}
                  </select>
                </div>

                {source && (
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[12px] font-medium text-slate-600">Bring chapters</div>
                      {source.content.structure.map((ch) => (
                        <label key={ch.key} className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-600">
                          <input type="checkbox" data-pick-chapter checked={pickChapters[ch.key] ?? false}
                            onChange={(e) => setPickChapters((p) => ({ ...p, [ch.key]: e.target.checked }))} />
                          {ch.title || "(untitled chapter)"}
                        </label>
                      ))}
                      {source.content.parameters.length > 0 && (
                        <>
                          <div className="mt-2 text-[12px] font-medium text-slate-600">Bring parameters</div>
                          {source.content.parameters.map((p) => (
                            <label key={p.key} className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-600">
                              <input type="checkbox" data-pick-param checked={pickParams[p.key] ?? false}
                                onChange={(e) => setPickParams((x) => ({ ...x, [p.key]: e.target.checked }))} />
                              {p.label || p.key} <span className="text-slate-400">({p.type})</span>
                            </label>
                          ))}
                        </>
                      )}
                      {source.content.presentation && (
                        <label className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-600">
                          <input type="checkbox" data-copy-presentation checked={copyPresentation}
                            onChange={(e) => setCopyPresentation(e.target.checked)} />
                          Copy portable presentation
                        </label>
                      )}
                    </div>
                    <div>
                      <div className="text-[12px] font-medium text-slate-600">On a section-role collision</div>
                      <select data-on-role value={onRole} onChange={(e) => setOnRole(e.target.value as CompositionPlan["onRoleCollision"])}
                        className="mt-1 w-full text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5] bg-white">
                        <option value="append">Append after destination</option>
                        <option value="insert-at">Insert at front</option>
                        <option value="refuse">Refuse (let me decide)</option>
                      </select>
                      {props.destContent.presentation && copyPresentation && (
                        <>
                          <div className="mt-2 text-[12px] font-medium text-slate-600">Destination already has presentation</div>
                          <select data-on-presentation value={onPres} onChange={(e) => setOnPres(e.target.value as CompositionPlan["onPresentation"])}
                            className="mt-1 w-full text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5] bg-white">
                            <option value="keep-destination">Keep destination</option>
                            <option value="replace-with-source">Replace with source portable</option>
                          </select>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {result && (
                  <div data-compose-review className="mt-4 rounded-md bg-[#F9FBFE] ring-1 ring-[#EDF2F8] p-3">
                    <div className="text-[12px] font-medium text-slate-600">
                      Will copy — {result.copied.chapters} chapter(s), {result.copied.sections} section(s),{" "}
                      {result.copied.entries} entr(ies){result.copied.parameters.length ? `, ${result.copied.parameters.length} parameter(s)` : ""}
                    </div>
                    {result.omissions.map((o, i) => (
                      <div key={i} className="mt-1 text-[12px] text-slate-500">· omitted — {o}</div>
                    ))}
                    {result.problems.length > 0 && (
                      <div data-compose-problems className="mt-2 rounded bg-rose-50 ring-1 ring-rose-200 p-2">
                        {result.problems.map((p, i) => (
                          <div key={i} className="text-[12px] text-rose-600">· {p.conflict} — {p.at}{p.detail ? `: ${p.detail}` : ""}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {err && <div className="mt-2 text-[12px] text-rose-600">{err}</div>}

                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="text-[12px] px-3 py-1.5 rounded-md ring-1 ring-[#E7EDF5]">Cancel</button>
                  <button data-compose-act disabled={busy || blocked} onClick={() => void act()}
                    className="text-[12px] px-3 py-1.5 rounded-md text-white disabled:opacity-40" style={{ background: NAVY }}>
                    Copy into draft
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
