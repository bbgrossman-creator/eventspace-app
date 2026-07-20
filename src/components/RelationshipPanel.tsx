"use client";
// ═══════════════════════════════════════════════════════════════════════════
// RELATIONSHIP SURFACES (v264 · PL-2). Props-driven pieces (the harness
// drives them directly); the connected wiring lives in the pages.
//
//   FoundOrCreate — the door's choice: FOUND pre-selected ONLY when the
//     match is unambiguous, CREATE always adjacent; multiple candidates
//     always present as an explicit choice with nothing pre-selected.
//   RelationshipHeader — the ceremonial voice: the party's identity,
//     plainly, with data-rel-provenance="ceremonial".
//   SuggestionRow — the derived voice: a provenance-marked candidate
//     ("looks like the same household") offering ONE explicit Adopt.
//     Rendering fires nothing; only the human's click is a ceremony.
//   CorrectCitationDoor — the audited correction: arms, demands a reason,
//     refuses visually until one exists, fires once. Corrections stay
//     visible; falsehoods do not become permanent.
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { Relationship, RelationshipMatch, KIND_LABELS } from "@/lib/relationship";

export function FoundOrCreate({ matches, chosen, onChoose }: {
  matches: RelationshipMatch[];
  chosen: string | null;                      // relationship id, or null = CREATE
  onChoose: (relationshipId: string | null) => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div data-found-or-create className="rounded-lg bg-[#F6F9FE] ring-1 ring-[#DCEBFB] p-2.5 space-y-1.5">
      <p className="text-[11px] text-slate-500">
        This contact matches {matches.length === 1 ? "a customer already on file" : `${matches.length} customers on file`}:
      </p>
      {matches.map((m) => (
        <label key={m.relationship.id} data-found-option={m.relationship.id}
          className="flex items-center gap-2 text-[12px] text-slate-700 cursor-pointer">
          <input type="radio" className="accent-[#4A9EFF]"
            checked={chosen === m.relationship.id}
            onChange={() => onChoose(m.relationship.id)} />
          <b>{m.relationship.name}</b>
          <span className="text-slate-400">· {KIND_LABELS[m.relationship.kind]} · matched by {m.via.join(" + ")}</span>
        </label>
      ))}
      <label data-create-option className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
        <input type="radio" className="accent-[#4A9EFF]" checked={chosen === null}
          onChange={() => onChoose(null)} />
        This is a <b>new customer</b>
      </label>
    </div>
  );
}

export function RelationshipHeader({ rel }: { rel: Relationship }) {
  return (
    <div data-rel-header data-rel-provenance="ceremonial"
      className="rounded-lg bg-white ring-1 ring-[#E7EDF5] p-3">
      <div className="text-[14px] font-semibold">{rel.name}</div>
      <div className="text-[11px] text-slate-400">
        {KIND_LABELS[rel.kind]}
        {rel.standing_notes ? <> · <span data-rel-standing>{rel.standing_notes}</span></> : null}
      </div>
    </div>
  );
}

export function SuggestionRow({ label, detail, busy, onAdopt }: {
  label: string; detail: string; busy: boolean; onAdopt: () => void;
}) {
  return (
    <div data-rel-suggestion data-rel-provenance="derived"
      className="flex items-center gap-2 rounded-md bg-[#FAFBFD] ring-1 ring-[#EDF2F8] px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-slate-600 truncate">{label}</div>
        <div className="text-[10px] text-slate-400">looks like the same household · {detail}</div>
      </div>
      <button data-adopt-one disabled={busy} onClick={onAdopt}
        className="text-[11px] font-medium text-[#2F80ED] hover:underline shrink-0">
        Link to customer
      </button>
    </div>
  );
}

export function CorrectCitationDoor({ options, currentId, busy, onCorrect }: {
  options: Relationship[]; currentId: string; busy: boolean;
  onCorrect: (relationshipId: string, reason: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const others = options.filter((r) => r.id !== currentId);
  if (others.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {!asking && (
        <button data-correct-citation disabled={busy} onClick={() => setAsking(true)}
          className="text-[11px] text-slate-400 underline hover:text-slate-600">
          Wrong customer? Correct it…
        </button>
      )}
      {asking && (
        <>
          <select data-correct-target className="field !py-0.5 !text-[11px] !bg-white"
            value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— the right customer —</option>
            {others.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input data-correct-reason value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Why was the match mistaken? (required)"
            className="field !py-0.5 !text-[11px] !bg-white w-60" />
          <button data-correct-commit disabled={busy || !target || !reason.trim()}
            onClick={() => onCorrect(target, reason.trim())}
            className="text-[11px] font-medium text-rose-600 hover:underline">Correct</button>
          <button className="text-[11px] text-slate-400 underline"
            onClick={() => { setAsking(false); setTarget(""); setReason(""); }}>cancel</button>
        </>
      )}
    </span>
  );
}
