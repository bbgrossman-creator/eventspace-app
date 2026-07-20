"use client";
// ═══════════════════════════════════════════════════════════════════════════
// START FROM BLUEPRINT (v261) — proposal creation's constitutional path.
// The flow: pick an EXACT published revision → answer its declared
// questions → read a DETERMINISTIC review of what will be included
// (verdicts from v260's simulate, which is BP-7's own evaluation law) →
// run BP-3's existing instantiation act → open the result in Proposal
// Studio. The created Design is independent immediately: citation, not
// control — the vocabulary here contains no live-dependency verb, and the
// only write is the one existing act.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import { listPublishedBlueprints, PublishedBlueprintSource } from "@/lib/blueprintStartSupabase";
import { instantiateBlueprint, BlueprintConflictsError } from "@/lib/blueprintInstantiateSupabase";
import { InstantiationConflict } from "@/lib/blueprintInstantiate";
import { simulate } from "@/lib/blueprintStudio";
import { ParameterAnswers } from "@/lib/blueprintConditions";

const NAVY = "#102F56";

export default function StartFromBlueprint(props: {
  bookingId: string;
  hasExistingProposals: boolean;
  latestProposalTitle: string | null;
  onCreated: (versionId: string) => void;
}) {
  const [sources, setSources] = useState<PublishedBlueprintSource[]>([]);
  const [revisionId, setRevisionId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<InstantiationConflict[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { void listPublishedBlueprints().then(setSources).catch(() => setSources([])); }, []);

  const source = sources.find((s) => s.revisionId === revisionId) ?? null;

  const typed = useMemo((): ParameterAnswers => {
    if (!source) return {};
    const out: ParameterAnswers = {};
    for (const p of source.content.parameters) {
      const raw = answers[p.key];
      if (raw === undefined || raw === "") continue;
      out[p.key] = p.type === "count" ? Number(raw) : p.type === "flag" ? raw === true : String(raw);
    }
    return out;
  }, [source, answers]);

  // THE DETERMINISTIC REVIEW — the law's verdicts, saved nowhere.
  const review = useMemo(() => (source ? simulate(source.content, typed) : null), [source, typed]);

  const guestParam = source?.content.parameters.find((p) => p.key === "guest_count") ?? null;
  const otherParams = source ? source.content.parameters.filter((p) => p.key !== "guest_count") : [];
  const guests = Number(answers["guest_count"] ?? 0);

  const act = async () => {
    if (!source) return;
    setBusy(true); setErr(""); setConflicts(null);
    try {
      const restAnswers: Record<string, number | string | boolean> = {};
      for (const k of Object.keys(typed)) {
        if (k !== "guest_count") restAnswers[k] = typed[k] as number | string | boolean;
      }
      const res = await instantiateBlueprint(source.revisionId, props.bookingId, guests, undefined, restAnswers);
      props.onCreated(res.version_id);
    } catch (e) {
      if (e instanceof BlueprintConflictsError) setConflicts(e.conflicts);
      else setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div data-start-from-blueprint className="space-y-2">
      <p className="text-[10.5px] text-slate-400">
        Start this event's design from organizational knowledge: an <b>exact published revision</b>. The
        result is a normal, fully independent design — it cites its origin and is never controlled by it.
      </p>
      <select data-sfb-source className="field !py-1 !text-xs !bg-white w-full" value={revisionId}
        onChange={(e) => { setRevisionId(e.target.value); setAnswers({}); setConflicts(null); }}>
        <option value="">— choose a published Blueprint —</option>
        {sources.map((s) => (
          <option key={s.revisionId} value={s.revisionId}>
            📘 {s.identityName} · r{s.revisionNumber}{s.taxonomy ? ` · ${s.taxonomy}` : ""}
          </option>
        ))}
      </select>
      {sources.length === 0 && (
        <p className="text-[11px] text-slate-400">No published Blueprints yet — publish one on the Blueprint Shelf first.</p>
      )}

      {source && (
        <>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">The Blueprint's questions</div>
          <label className="block text-[11px] text-slate-600">
            {guestParam?.label || "Guest count"} <span className="text-slate-400">(required)</span>
            <input type="number" data-sfb-guests value={String(answers["guest_count"] ?? "")}
              onChange={(e) => setAnswers((a) => ({ ...a, guest_count: e.target.value }))}
              className="field !py-1 !text-xs !bg-white w-32 ml-2" placeholder="e.g. 200" />
          </label>
          {otherParams.map((p) => (
            <label key={p.key} className="block text-[11px] text-slate-600">
              {p.label || p.key}{p.required ? "" : " (optional)"}
              {p.type === "count" && (
                <input type="number" data-sfb-count={p.key} value={String(answers[p.key] ?? "")}
                  onChange={(e) => setAnswers((a) => ({ ...a, [p.key]: e.target.value }))}
                  className="field !py-1 !text-xs !bg-white w-32 ml-2" />
              )}
              {p.type === "choice" && (
                <select data-sfb-choice={p.key} value={String(answers[p.key] ?? "")}
                  onChange={(e) => setAnswers((a) => ({ ...a, [p.key]: e.target.value }))}
                  className="field !py-1 !text-xs !bg-white ml-2">
                  <option value="">— answer —</option>
                  {(p.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {p.type === "flag" && (
                <input type="checkbox" data-sfb-flag={p.key} checked={answers[p.key] === true}
                  onChange={(e) => setAnswers((a) => ({ ...a, [p.key]: e.target.checked }))}
                  className="ml-2 align-middle accent-[#4A9EFF]" />
              )}
            </label>
          ))}

          {review && "missing" in review && (
            <div data-sfb-blocked className="text-[11px] text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded px-2 py-1">
              Answer these first: {review.missing.map((p) => p.label || p.key).join(", ")}.
            </div>
          )}
          {review && "sections" in review && (
            <div data-sfb-review className="rounded bg-[#F9FBFE] ring-1 ring-[#EDF2F8] p-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                What these answers will create — decided by the same rules instantiation uses
              </div>
              {review.sections.map((se) => (
                <div key={se.key} className="mt-1">
                  <div className={`text-[12px] ${se.included ? "text-slate-600" : "text-slate-300 line-through"}`}>
                    {se.included ? "✓" : "✗"} {se.title}
                  </div>
                  {se.entries.map((en) => (
                    <div key={en.key} className={`ml-4 text-[11px] ${en.included ? "text-slate-500" : "text-slate-300 line-through"}`}>
                      {en.included ? "✓" : "✗"} {en.title}
                    </div>
                  ))}
                </div>
              ))}
              <div data-sfb-landing className="mt-1.5 text-[10px] text-slate-400">
                {props.hasExistingProposals && props.latestProposalTitle
                  ? `The act adds this design as a new version on "${props.latestProposalTitle}" (the booking's latest proposal).`
                  : "The act creates a new proposal named after the Blueprint."}
                {" "}It opens in Proposal Studio, citing the exact revision.
              </div>
            </div>
          )}

          {conflicts && (
            <div data-sfb-conflicts className="rounded bg-amber-50 ring-1 ring-amber-200 p-2">
              <div className="text-[11px] font-medium text-amber-800">The organization's current state stages these conflicts — nothing was created:</div>
              {conflicts.map((c, i) => (
                <div key={i} className="text-[11px] text-amber-700">· {c.kind}{c.at ? ` — ${c.at}` : ""}{c.detail ? `: ${c.detail}` : ""}</div>
              ))}
            </div>
          )}
          {err && <div className="text-[11px] text-rose-600">{err}</div>}

          <button data-sfb-act disabled={busy || !review || !("sections" in review) || !(guests > 0)}
            onClick={() => void act()}
            className="btn-primary !py-1 !px-2.5 text-xs" style={{ background: NAVY }}>
            Create &amp; open in Studio
          </button>
        </>
      )}
    </div>
  );
}
