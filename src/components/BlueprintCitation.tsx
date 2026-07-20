"use client";
// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT CITATION (v254 · BP-4) — the design's origin, in the
// started-from voice, with divergence as DISCLOSURE. Renders nothing when
// the design has no citation (honest silence). One line under the Studio's
// bar; details summoned on click, never resident (v217's spirit).
//
// DISPLAY, NEVER JUDGMENT: no blocking, no good/bad, no undo urging,
// no fidelity ranking, no pricing effect. "Unchanged" renders as itself —
// empty divergence is information. The earlier-revision note speaks about
// the SHELF, never about the design, and never collapses into the tier.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import {
  compareToBaseline, citationLine, citationStatus,
  DivergenceReport, CitationStatus,
} from "@/lib/blueprintDivergence";
import {
  loadCitation, loadShelfStatus, loadCurrentMaterialized, CitationRecord, ShelfStatus,
} from "@/lib/blueprintDivergenceSupabase";

const NAVY = "#102F56";

const TIER_LABEL: Record<string, string> = {
  unchanged: "as instantiated",
  light: "lightly diverged",
  heavy: "heavily diverged",
};

export default function BlueprintCitation({ versionId }: { versionId: string }) {
  const [citation, setCitation] = useState<CitationRecord | null>(null);
  const [shelf, setShelf] = useState<ShelfStatus | null>(null);
  const [report, setReport] = useState<DivergenceReport | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const c = await loadCitation(versionId);
      if (!alive || !c) return;
      setCitation(c);
      const [s, current] = await Promise.all([
        loadShelfStatus(c.blueprint_id, c.revision_id),
        loadCurrentMaterialized(versionId),
      ]);
      if (!alive) return;
      setShelf(s);
      setReport(compareToBaseline(current, c.frozen_baseline));
    })();
    return () => { alive = false; };
  }, [versionId]);

  if (!citation) return null;
  const status: CitationStatus | null = shelf
    ? citationStatus({ citedRevisionId: citation.revision_id, publishedRevisionId: shelf.publishedRevisionId, identityStatus: shelf.identityStatus })
    : null;

  return (
    <div data-blueprint-citation className="px-4 py-1 bg-[#F9FBFE] border-b border-[#EDF2F8] text-[12px] text-slate-500 flex items-center gap-2">
      <button data-citation-toggle onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 hover:text-slate-700">
        <span>📘</span>
        <span data-citation-line className="font-medium text-slate-600">
          {citationLine(shelf?.blueprintName ?? "Blueprint", citation.revision_number)}
        </span>
        {report && report.integrity === "ok" && (
          <span data-divergence-tier className={
            report.tier === "unchanged" ? "text-slate-400" : report.tier === "light" ? "text-sky-600" : "text-indigo-600"}>
            · {TIER_LABEL[report.tier]}
          </span>
        )}
        {report && report.integrity === "malformed" && (
          <span data-integrity-state className="text-amber-600">· baseline integrity: {report.problems.join(", ")}</span>
        )}
        {status && status.shelfNote === "earlier-revision" && (
          <span data-earlier-revision className="text-slate-400">· from an earlier revision</span>
        )}
      </button>
      {open && (
        <div data-citation-detail className="absolute mt-8 z-40 bg-white rounded-md shadow-lg ring-1 ring-[#E7EDF5] p-3 max-w-md">
          <div className="text-[12px] text-slate-600 font-medium">
            {citationLine(shelf?.blueprintName ?? "Blueprint", citation.revision_number)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Instantiated {new Date(citation.snapshot_at).toLocaleString()} · fingerprint {citation.fingerprint.slice(0, 12)}…
          </div>
          {Object.keys(citation.parameters ?? {}).length > 0 && (
            <div data-citation-answers className="mt-0.5 text-[11px] text-slate-400">
              Answers given: {Object.entries(citation.parameters ?? {}).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
            </div>
          )}
          {/* v261 — origin without control: a pointer to the shelf, and
              deliberately nothing else. No verb here updates this design
              from the Blueprint; the design owns itself. */}
          <a data-view-source href="/blueprint-shelf" className="mt-1 inline-block text-[11px] underline text-slate-400 hover:text-slate-600">
            View source revision on the Blueprint Shelf
          </a>
          {status && (
            <div className="mt-1 text-[11px] text-slate-400">
              Shelf today: {status.shelfNote === "current" ? "this is still the offered revision" : "a later revision is offered"}
              {status.identityRetired ? " · the identity is retired" : ""} — the citation stands either way.
            </div>
          )}
          {report && report.integrity === "ok" && (
            <div className="mt-2">
              {report.findings.length === 0 ? (
                <div data-empty-divergence className="text-[12px] text-slate-500">
                  No divergence — the design is exactly what arrived. That is information, not praise.
                </div>
              ) : (
                <ul data-findings className="space-y-0.5 max-h-48 overflow-auto">
                  {report.findings.map((f, i) => (
                    <li key={i} className="text-[12px] text-slate-600">· <span className="font-medium">{f.kind}</span> — {f.at}</li>
                  ))}
                </ul>
              )}
              <div className="mt-1.5 text-[11px] text-slate-400">
                Authored prose: carried in the frozen baseline; no editable surface yet, so it is reported as unavailable, not compared.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
