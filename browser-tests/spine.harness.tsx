// harness/spine.harness.tsx — PL-1's observable law, real components:
//   the REAL SpineBadge / EngagementHistory / DeclineDoor over fixtures,
//   with window.__ceremonies recording every door fire. Modes:
//   ?mode=legacy      — an untouched legacy engagement: derived Committed
//                       classification, ceremonial state absent, honest
//                       empty history, NO decline door (the guardrail)
//   ?mode=ceremonial  — a ceremonially governed engagement at Proposing:
//                       plain badge, real entries, the decline door armed
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SpineBadge, EngagementHistory, DeclineDoor } from "@/components/EngagementSpine";
import { deriveLifecycle } from "@/lib/spine";
import { LedgerEntry } from "@/lib/spineSupabase";

const mode = new URLSearchParams(window.location.search).get("mode") ?? "ceremonial";
const ceremonies: string[] = [];
(window as unknown as { __ceremonies: string[] }).__ceremonies = ceremonies;

const legacyPos = deriveLifecycle(null, { hasWonProposal: true, hasAnyProposal: true });
const ceremonialPos = deriveLifecycle("proposing", { hasWonProposal: false, hasAnyProposal: true });

const entries: LedgerEntry[] = [
  { id: "e1", ceremony: "opened", actor: "sales", moment: "2026-07-01T10:00:00Z",
    from_state: null, to_state: "inquiry", object_ref: null, reason: null },
  { id: "e2", ceremony: "proposing", actor: "sales", moment: "2026-07-02T11:00:00Z",
    from_state: "inquiry", to_state: "proposing", object_ref: null, reason: null },
];

function Host() {
  const pos = mode === "legacy" ? legacyPos : ceremonialPos;
  const shown = mode === "legacy" ? [] : entries;
  const [note, setNote] = useState("");
  return (
    <div style={{ padding: 24 }} className="space-y-3">
      <div className="flex items-center gap-3">
        <SpineBadge pos={pos} />
        <DeclineDoor pos={pos} busy={false}
          onDecline={(reason) => ceremonies.push(`decline:${reason}`)} />
      </div>
      {/* a NON-ceremony control: proves ordinary interaction leaves the badge inert */}
      <input data-ordinary-edit value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="an ordinary field — not a door" className="field !py-1 !text-xs w-64" />
      <EngagementHistory entries={shown} />
    </div>
  );
}

const style = document.createElement("link");
style.rel = "stylesheet"; style.href = "/app.css";
document.head.appendChild(style);
createRoot(document.getElementById("root")!).render(<Host />);
