// harness/definition.tsx — the REAL DefinitionView against the memory twin of
// the one writing path. ?cap=off removes knowledge.curate (C-5).
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import DefinitionView from "@/components/studio/DefinitionView";
import { memoryCurationAdapter, RevisionDoc } from "@/lib/curation";
import { LedgerEntry } from "@/lib/curationSupabase";

const q = new URLSearchParams(window.location.search);
const canCurate = q.get("cap") !== "off";
const mem = memoryCurationAdapter();
mem.setLive("rev-live-18");
if (q.get("race") === "1") mem.armRace();
(window as unknown as { __mem: unknown }).__mem = mem;

const liveDoc: RevisionDoc = {
  dimensions: {
    service: { label: "Service", options: ["drop_off", "attended", "live_chef"] },
    presentation: { label: "Presentation", options: ["wood", "black_slate", "acrylic"] },
  },
  instanceDefaults: { schemeId: null, customized: [],
    scalars: { pieces_per_person: { value: 8, overridden: false, derivation: { formula: "house standard", suggested: 8 } } },
    choices: { service: "attended", presentation: "black_slate" }, display: {}, substitutions: {} },
  schemes: { cocktail: { id: "cocktail", label: "Cocktail Hour", sets: { choices: { presentation: "acrylic" } } } },
  defaultItems: [
    { name: "California Roll", unit_price: 4, quantity_basis: "per_person", position: 0 },
    { name: "Ginger", unit_price: 0.5, quantity_basis: "per_person", position: 1 },
  ],
};
const ledger: LedgerEntry[] = [
  { actId: null, origin: null, note: null, actor: null, createdAt: "2026-05-01T00:00:00Z", revisionId: "rev-live-18", live: true },
];

function App() {
  const [rev, setRev] = useState("rev-live-18");
  const [authored, setAuthored] = useState(0);
  return (
    <div style={{ width: 460, fontFamily: "system-ui", border: "1px solid #EEF2F7" }}>
      <DefinitionView definitionId="def-sushi" name="Sushi Station"
        liveRevisionId={rev} liveDoc={liveDoc} schemaVersion={1} ledger={ledger}
        canCurate={canCurate} author={mem.adapter}
        onAuthored={(r) => { setRev(r); setAuthored((n) => n + 1); }} />
      <div data-authored-count style={{ display: "none" }}>{authored}</div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
