// ═══════════════════════════════════════════════════════════════════════════
// DEFINITION VIEW (v207 · SPEC-004 Rev B Executive Curation)
//
// Sectioned panels from day one (READINESS F-5): SPEC-005/005a/006 add
// sections; nothing here gets reworked. The editor has NO "add field"
// affordance by construction — principle 9 as UI. Flow: edit → STAGE
// (side-by-side summary vs live) → note (required) → confirm →
// authorRevision(origin='executive_curation') through the one path.
// Every past revision renders in the History section; revisions without an
// act display as "pre-ledger (bootstrap)" — the ledger is authoritative
// from v207 forward, and synthetic provenance would be worse than the gap.
// ═══════════════════════════════════════════════════════════════════════════
"use client";
import { useMemo, useState } from "react";
import {
  RevisionDoc, AuthorAdapter, authorRevision, diffDocs, emptyDoc,
} from "@/lib/curation";
import { LedgerEntry } from "@/lib/curationSupabase";

const T = { ink: "#1F2A37", navy: "#102F56", gold: "#C9A34E", rule: "#EEF2F7" } as const;
const deep = <X,>(x: X): X => JSON.parse(JSON.stringify(x));

export interface DefinitionViewProps {
  definitionId: string;
  name: string;
  liveRevisionId: string | null;
  liveDoc: RevisionDoc | null;
  schemaVersion: number;
  ledger: LedgerEntry[];
  canCurate: boolean;                   // knowledge.curate, resolved by the page
  author: AuthorAdapter;
  onAuthored?: (revisionId: string) => void;
  /** v208: opens the Promotion review — divergence across every event. */
  onOpenPromotion?: () => void;
  onClose?: () => void;
}

export default function DefinitionView(p: DefinitionViewProps) {
  const live = p.liveDoc ?? emptyDoc();
  const [draft, setDraft] = useState<RevisionDoc>(() => deep(live));
  const [staging, setStaging] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const changes = useMemo(() => diffDocs(live, draft), [live, draft]);
  const dirty = changes.length > 0;
  const edit = (fn: (d: RevisionDoc) => void) =>
    setDraft((d) => { const n = deep(d); fn(n); return n; });

  async function confirm() {
    setBusy(true); setErr(null);
    const res = await authorRevision({
      definitionId: p.definitionId,
      expectedLiveRevision: p.liveRevisionId,
      data: draft, schemaVersion: p.schemaVersion,
      origin: "executive_curation", note,
    }, p.author);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setStaging(false); setNote("");
    p.onAuthored?.(res.revisionId);
  }

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border-t" style={{ borderColor: T.rule }} data-def-section={id}>
      <div className="px-3 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</div>
      <div className="px-3 pb-3 pt-1">{children}</div>
    </div>
  );

  return (
    <div data-definition-view className="text-[12px] bg-white" style={{ color: T.ink }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="font-semibold" style={{ color: T.navy }}>{p.name}</span>
        <span className="text-[10px] text-slate-400">definition</span>
        {p.liveRevisionId === null && <span className="text-[10px] text-slate-400" data-no-revision>no configuration yet</span>}
        {p.canCurate && p.onOpenPromotion && p.liveRevisionId !== null && (
          <button data-review-divergence className="text-[10px] underline" style={{ color: T.gold }}
            onClick={p.onOpenPromotion}>Review divergence across events…</button>
        )}
        {p.canCurate && dirty && !staging && (
          <button data-stage className="ml-auto rounded px-2 py-1 text-[11px] text-white" style={{ background: T.navy }}
            onClick={() => setStaging(true)}>Stage {changes.length} change{changes.length > 1 ? "s" : ""}…</button>
        )}
        {p.canCurate && dirty && (
          <button data-discard className={`text-[10px] underline text-slate-400 ${staging ? "ml-auto" : ""}`}
            onClick={() => { setDraft(deep(live)); setStaging(false); setErr(null); }}>discard</button>
        )}
        {p.onClose && <button className="text-[11px] text-slate-400" onClick={p.onClose}>✕</button>}
      </div>

      {/* ── staged-never-silent: the confirmation IS the review ── */}
      {staging && (
        <div className="mx-3 mb-2 rounded border-2 px-3 py-2" style={{ borderColor: T.gold }} data-curation-staging>
          <div className="font-semibold mb-1">This revision will change:</div>
          {changes.map((c, i) => <div key={i} className="py-0.5" data-staged-change>{c}</div>)}
          <div className="mt-2">
            <textarea data-curation-note value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Why — the act must state its reason (required)"
              className="w-full rounded border px-2 py-1 text-[11px]" style={{ borderColor: T.rule }} rows={2} />
          </div>
          {err && <div className="text-[11px] text-red-600 py-1" data-curation-error>{err}</div>}
          <div className="mt-1 flex gap-2 items-center">
            <button data-curation-confirm disabled={busy || note.trim() === ""}
              className="rounded px-2 py-1 text-[11px] text-white disabled:opacity-40" style={{ background: T.navy }}
              onClick={() => void confirm()}>Author revision</button>
            {note.trim() === "" && <span className="text-[10px] text-slate-400" data-note-required-hint>note required</span>}
            <button className="text-[11px] underline text-slate-500" onClick={() => setStaging(false)}>Keep editing</button>
          </div>
        </div>
      )}

      {/* ── Dimensions ── */}
      <Section id="dimensions" title="Dimensions">
        {Object.entries(draft.dimensions ?? {}).length === 0 && <div className="text-slate-400">none</div>}
        {Object.entries(draft.dimensions ?? {}).map(([k, d]) => (
          <div key={k} className="py-1" data-def-dimension={k}>
            <span className="font-semibold">{d.label}</span>
            <span className="text-slate-400 text-[10px]"> ({k})</span>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {d.options.map((o) => (
                <span key={o} className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: T.rule }} data-dim-option={`${k}:${o}`}>
                  {o.replace(/_/g, " ")}
                  {p.canCurate && (
                    <button data-remove-option={`${k}:${o}`} className="ml-1 text-slate-300 hover:text-slate-500"
                      onClick={() => edit((n) => { n.dimensions![k].options = n.dimensions![k].options.filter((x) => x !== o); })}>×</button>
                  )}
                </span>
              ))}
              {p.canCurate && (
                <button data-add-option={k} className="text-[10px] underline text-slate-400"
                  onClick={() => { const v = prompt(`New option for ${d.label}`); if (v?.trim())
                    edit((n) => { n.dimensions![k].options.push(v.trim().replace(/\s+/g, "_").toLowerCase()); }); }}>+ option</button>
              )}
            </div>
          </div>
        ))}
      </Section>

      {/* ── Defaults ── */}
      <Section id="defaults" title="Defaults">
        {Object.entries(draft.dimensions ?? {}).map(([k, d]) => (
          <div key={k} className="flex items-center gap-2 py-0.5" data-def-default={k}>
            <span className="w-28 text-slate-500">{d.label}</span>
            {d.options.map((o) => (
              <button key={o} data-default-choice={`${k}:${o}`} disabled={!p.canCurate}
                className="rounded border px-1.5 py-0.5 text-[10px]"
                style={{ borderColor: draft.instanceDefaults.choices[k] === o ? T.gold : T.rule,
                         fontWeight: draft.instanceDefaults.choices[k] === o ? 600 : 400 }}
                onClick={() => edit((n) => { n.instanceDefaults.choices[k] = o; })}>
                {o.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        ))}
        {Object.entries(draft.instanceDefaults.scalars).map(([k, s]) => (
          <div key={k} className="flex items-center gap-2 py-0.5" data-def-scalar={k}>
            <span className="w-28 text-slate-500">{k}</span>
            {p.canCurate ? (
              <input data-scalar-default={k} type="number" defaultValue={s.value} key={`${k}:${s.value}`}
                className="w-20 rounded border px-1.5 py-0.5 text-[11px]" style={{ borderColor: T.rule }}
                onBlur={(e) => { const v = Number(e.target.value);
                  if (isFinite(v) && v !== s.value) edit((n) => {
                    n.instanceDefaults.scalars[k].value = v;
                    if (n.instanceDefaults.scalars[k].derivation)
                      n.instanceDefaults.scalars[k].derivation!.suggested = v;
                  }); }} />
            ) : <span className="font-semibold">{s.value}</span>}
            {s.derivation && <span className="text-[10px] text-slate-400">{s.derivation.formula}</span>}
          </div>
        ))}
      </Section>

      {/* ── Schemes (read summary; deep scheme authoring arrives with its own slice) ── */}
      <Section id="schemes" title="Schemes">
        {Object.values(draft.schemes ?? {}).length === 0 && <div className="text-slate-400">none</div>}
        {Object.values(draft.schemes ?? {}).map((s) => (
          <div key={s.id} className="py-0.5" data-def-scheme={s.id}>
            <span className="font-semibold">{s.label}</span>
            <span className="text-[10px] text-slate-400"> — {Object.entries(s.sets.choices ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ")}</span>
          </div>
        ))}
      </Section>

      {/* ── Default items ── */}
      <Section id="items" title="Default items">
        {(draft.defaultItems ?? []).map((it) => (
          <div key={it.name} className="flex items-center gap-2 py-0.5" data-def-item={it.name}>
            <span className="flex-1">{it.name}</span>
            <span className="text-slate-400 text-[10px]">${it.unit_price ?? "—"} {it.quantity_basis ?? ""}</span>
            {p.canCurate && (
              <button data-remove-item={it.name} className="text-[10px] text-slate-300 hover:text-slate-500"
                onClick={() => edit((n) => { n.defaultItems = (n.defaultItems ?? []).filter((x) => x.name !== it.name); })}>×</button>
            )}
          </div>
        ))}
        {p.canCurate && (
          <button data-add-default-item className="text-[10px] underline text-slate-400"
            onClick={() => { const nm = prompt("Item name"); if (!nm?.trim()) return;
              const pr = Number(prompt("Unit price") ?? "0");
              edit((n) => { n.defaultItems = [...(n.defaultItems ?? []),
                { name: nm.trim(), unit_price: isFinite(pr) ? pr : 0, quantity_basis: "per_person",
                  position: (n.defaultItems ?? []).length }]; }); }}>+ default item</button>
        )}
      </Section>

      {/* ── History: the ledger, honest about its own beginning ── */}
      <Section id="history" title="History">
        {p.ledger.length === 0 && <div className="text-slate-400">no revisions yet</div>}
        {p.ledger.map((e) => (
          <div key={e.revisionId} className="py-1 border-b last:border-0" style={{ borderColor: T.rule }}
               data-ledger-entry={e.revisionId} data-ledger-origin={e.origin ?? "pre_ledger"}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] rounded px-1.5 py-0.5"
                style={{ background: e.origin === "promotion" ? "#FBF6EA" : "#F1F5F9",
                         color: e.origin ? T.ink : "#94A3B8" }}>
                {e.origin === "promotion" ? "promotion" :
                 e.origin === "executive_curation" ? "executive curation" : "pre-ledger (bootstrap)"}
              </span>
              {e.live && <span className="text-[9px] font-semibold" style={{ color: T.gold }}>LIVE</span>}
              <span className="text-[10px] text-slate-400 ml-auto">{new Date(e.createdAt).toLocaleDateString()}</span>
            </div>
            {e.note && <div className="text-[11px] pt-0.5">{e.note}</div>}
          </div>
        ))}
      </Section>
    </div>
  );
}
