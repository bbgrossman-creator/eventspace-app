// ═══════════════════════════════════════════════════════════════════════════
// PROMOTION REVIEW (v208 · SPEC-004 Rev B §5) — the divergence chip grown up.
// Rules kept here: nothing pre-checked · frequency informs, never votes ·
// evidence events readable and visibly non-writable · where-it-lands shown
// per selected line · coherence findings BLOCK staging by name · the staged
// panel is the complete would-be revision vs live · confirm requires the
// note and lands ONE act through the SAME author path curation uses (INV-1),
// origin=promotion, citations per line · and afterwards nothing about any
// source event has moved — stillness is the acceptance test.
// ═══════════════════════════════════════════════════════════════════════════
"use client";
import { useMemo, useState } from "react";
import {
  EvidenceLine, EvidenceAnnotation, aggregateEvidence, composeRevision,
  checkCoherence, citationsFor, promotionKindFor,
} from "@/lib/promotion";
import { RevisionDoc, AuthorAdapter, authorRevision, diffDocs } from "@/lib/curation";
import { BASELINE_LABEL } from "@/lib/configure";

const T = { ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E", rule: "#EEF2F7" } as const;

export interface PromotionReviewProps {
  definitionId: string;
  name: string;
  liveRevisionId: string | null;
  liveDoc: RevisionDoc;
  eventCount: number;
  lines: EvidenceLine[];
  annotations: EvidenceAnnotation[];
  schemaVersion: number;
  author: AuthorAdapter;
  onAuthored?: (revisionId: string) => void;
  onClose?: () => void;
}

export default function PromotionReview(p: PromotionReviewProps) {
  const [sel, setSel] = useState<Set<number>>(new Set());   // nothing pre-checked
  const [staging, setStaging] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const freq = useMemo(() => aggregateEvidence(p.lines, p.eventCount), [p.lines, p.eventCount]);
  const selected = useMemo(() => Array.from(sel).map((i) => p.lines[i]), [sel, p.lines]);

  const composed = useMemo(() => {
    if (selected.length === 0) return null;
    try { return { doc: composeRevision(p.liveDoc, selected), error: null as string | null }; }
    catch (e) { return { doc: null, error: (e as Error).message }; }
  }, [selected, p.liveDoc]);
  const findings = useMemo(() => composed?.doc ? checkCoherence(composed.doc) : [], [composed]);
  const changes = useMemo(() => composed?.doc ? diffDocs(p.liveDoc, composed.doc) : [], [composed, p.liveDoc]);

  async function confirm() {
    if (!composed?.doc) return;
    setBusy(true); setErr(null);
    const res = await authorRevision({
      definitionId: p.definitionId, expectedLiveRevision: p.liveRevisionId,
      data: composed.doc, schemaVersion: p.schemaVersion,
      origin: "promotion", note, citations: citationsFor(selected),
    }, p.author);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    p.onAuthored?.(res.revisionId);
  }

  return (
    <div data-promotion-review className="text-[12px] bg-white" style={{ color: T.ink }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="font-semibold" style={{ color: T.navy }}>Promote — {p.name}</span>
        <span className="text-[10px] text-slate-400">{p.eventCount} event{p.eventCount === 1 ? "" : "s"} of evidence</span>
        {p.onClose && <button className="ml-auto text-[11px] text-slate-400" onClick={p.onClose}>✕</button>}
      </div>
      <div className="px-3 pb-1 text-[10px] text-slate-400">
        Nothing is pre-selected. Frequency informs; you decide. Evidence events are read-only sources.
      </div>

      {/* ── the evidence, line by line ── */}
      <div className="border-t" style={{ borderColor: T.rule }}>
        {p.lines.length === 0 && <div className="px-3 py-3 text-slate-400">No divergence anywhere — the definition already says what the events say.</div>}
        {p.lines.map((l, i) => {
          const f = freq.get(`${l.key}=${JSON.stringify(l.to ?? null)}`);
          const on = sel.has(i);
          const kind = promotionKindFor(l.key);
          return (
            <div key={i} className="flex items-start gap-2 px-3 py-1.5 border-b" style={{ borderColor: T.rule }}
                 data-evidence-line={`${l.componentId}:${l.key}`}>
              <input type="checkbox" checked={on} data-select-line={i}
                onChange={() => setSel((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <div>{l.text}</div>
                <div className="text-[10px] text-slate-400">
                  {l.eventLabel}
                  {l.isEvidence && <span data-evidence-badge className="ml-1 rounded px-1 py-px" style={{ background: "#F1F5F9" }}>evidence · read-only</span>}
                  <span className="ml-1" data-line-baseline={l.noItemBaseline ? "no_item_baseline" : l.baselineKind}>
                    {l.noItemBaseline ? "current selection (no item baseline)" : (BASELINE_LABEL[l.baselineKind] ?? "")}
                  </span>
                </div>
                {on && kind && (
                  <div className="text-[10px]" style={{ color: T.gold }} data-where-lands={l.key}>
                    → {kind.whereItLands(l)}
                  </div>
                )}
              </div>
              {f && f.count > 1 && (
                <span className="text-[10px] text-slate-400 shrink-0" data-frequency={l.key}>
                  {f.count} of {f.ofEvents}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── annotations: context in a different material ── */}
      {p.annotations.length > 0 && (
        <div className="px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pb-1">What the events said</div>
          {p.annotations.map((a, i) => (
            <div key={i} className="border-l-4 pl-2 py-1 my-1" style={{ borderColor: "#E7DFC9", background: "#FDFBF5" }}
                 data-annotation-card>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{a.eventLabel} · {a.layerKey}</div>
              <div className="text-[11px]">{a.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── coherence: findings block, by name ── */}
      {findings.length > 0 && (
        <div className="mx-3 my-2 rounded border px-3 py-2" style={{ borderColor: "#FECACA", background: "#FEF2F2" }}
             data-coherence-findings>
          <div className="font-semibold text-[11px]">This combination is incoherent:</div>
          {findings.map((f, i) => <div key={i} className="text-[11px] py-0.5" data-coherence-finding>{f}</div>)}
        </div>
      )}
      {composed?.error && <div className="mx-3 my-1 text-[11px] text-red-600" data-compose-error>{composed.error}</div>}

      {/* ── staging + signed confirm ── */}
      <div className="px-3 py-2 border-t" style={{ borderColor: T.rule }}>
        {!staging ? (
          <button data-open-staging disabled={sel.size === 0 || findings.length > 0 || !!composed?.error}
            className="rounded px-2 py-1 text-[11px] text-white disabled:opacity-40" style={{ background: T.navy }}
            onClick={() => setStaging(true)}>
            Stage revision from {sel.size} line{sel.size === 1 ? "" : "s"}…
          </button>
        ) : (
          <div className="rounded border-2 px-3 py-2" style={{ borderColor: T.gold }} data-promotion-staging>
            <div className="font-semibold mb-1">The new revision will change:</div>
            {changes.map((c, i) => <div key={i} className="py-0.5" data-staged-change>{c}</div>)}
            <textarea data-promotion-note value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Why this is the standard now — signed with the act (required)"
              className="w-full mt-2 rounded border px-2 py-1 text-[11px]" style={{ borderColor: T.rule }} rows={2} />
            {err && <div className="text-[11px] text-red-600 py-1" data-promotion-error>{err}</div>}
            <div className="mt-1 flex gap-2">
              <button data-promotion-confirm disabled={busy || note.trim() === ""}
                className="rounded px-2 py-1 text-[11px] text-white disabled:opacity-40" style={{ background: T.navy }}
                onClick={() => void confirm()}>Promote</button>
              <button className="text-[11px] underline text-slate-500" onClick={() => setStaging(false)}>Back to review</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
