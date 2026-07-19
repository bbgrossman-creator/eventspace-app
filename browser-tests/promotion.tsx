// harness/promotion.tsx — the REAL PromotionReview over Goldberg-shaped
// evidence, persisting through the memory twin of the one path.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import PromotionReview from "@/components/studio/PromotionReview";
import { registerCorePromotionKinds, _resetPromotionKindsForTests, EvidenceLine, EvidenceAnnotation } from "@/lib/promotion";
import { memoryCurationAdapter, RevisionDoc } from "@/lib/curation";

_resetPromotionKindsForTests(); registerCorePromotionKinds();
const mem = memoryCurationAdapter(); mem.setLive("rev-18");
(window as unknown as { __mem: unknown }).__mem = mem;

const liveDoc: RevisionDoc = {
  dimensions: { presentation: { label: "Presentation", options: ["wood", "black_slate", "acrylic"] },
                service: { label: "Service", options: ["attended", "live_chef"] } },
  instanceDefaults: { schemeId: null, customized: [],
    scalars: { pieces_per_person: { value: 6, overridden: false, derivation: { formula: "house standard", suggested: 6 } } },
    choices: { presentation: "black_slate", service: "attended" }, display: {}, substitutions: {} },
  schemes: {}, defaultItems: [
    { name: "California Roll", unit_price: 4, quantity_basis: "per_person", position: 0 },
    { name: "Ginger", unit_price: 0.5, quantity_basis: "per_person", position: 1 }],
};
const L = (key: string, text: string, to: unknown, from: unknown, comp: string, ev: string,
           isEvidence: boolean, extra?: Partial<EvidenceLine>): EvidenceLine =>
  ({ key, text, to, from, componentId: comp, eventLabel: ev, isEvidence,
     baselineKind: "instantiation_stamp", baselineRevision: "rev-18", ...extra });
const lines: EvidenceLine[] = [
  L("choice:presentation", "presentation: black_slate → acrylic", "acrylic", "black_slate", "c-goldberg", "Goldberg Wedding · completed", true),
  L("item:Dragon Roll", "Dragon Roll added", { unit_price: 6, quantity_basis: "per_person" }, null, "c-goldberg", "Goldberg Wedding · completed", true),
  L("item:Ginger", "Ginger removed", null, { unit_price: 0.5 }, "c-goldberg", "Goldberg Wedding · completed", true),
  L("scalar:pieces_per_person", "pieces_per_person: you set 8 · suggested 6", 8, 6, "c-goldberg", "Goldberg Wedding · completed", true),
  L("choice:presentation", "presentation: black_slate → acrylic", "acrylic", "black_slate", "c-stein", "Stein Bar Mitzvah", false),
  // §0a: a legacy instance with no item baseline — adoption of current state
  L("item:Sweet Potato Roll", "Sweet Potato Roll — current selection (no item baseline)",
    { unit_price: 4.5, quantity_basis: "per_person" }, undefined, "c-legacy", "Klein Kiddush", false,
    { baselineKind: "reconstructed_from_instance", baselineRevision: null, noItemBaseline: true }),
  // a line whose promotion would be incoherent: value outside the dimension's options
  L("choice:presentation", "presentation: set to boat_display", "boat_display", "black_slate", "c-odd", "Odd Event", false),
  // v209: a layer line — the Goldberg kitchen layer vs its copied_from
  L("layer:kitchen", "kitchen layer revised on this event",
    { staffing: ["1 chef", "1 runner"], prepNotes: "runner keeps the boats moving" },
    { staffing: ["1 attendant"] }, "c-goldberg", "Goldberg Wedding · completed", true,
    { layer: { layerKey: "kitchen", data: { staffing: ["1 chef", "1 runner"], prepNotes: "runner keeps the boats moving" },
               expectedLive: "lrev-18", schemaVersion: 1 } }),
];
const annotations: EvidenceAnnotation[] = [
  { componentId: "c-goldberg", eventLabel: "Goldberg Wedding · completed", layerKey: "kitchen",
    text: "runner keeps the boats moving; chef never leaves the board." },
];
// P-6 stillness witnesses: deep-frozen snapshots of "the source event"
const goldberg = { config: { choices: { presentation: "acrylic" } }, baseline: "rev-18", items: ["Dragon Roll"], moves: 4 };
(window as unknown as { __goldberg: unknown }).__goldberg = JSON.parse(JSON.stringify(goldberg));
(window as unknown as { __goldbergLive: unknown }).__goldbergLive = goldberg;

function App() {
  const [authored, setAuthored] = useState<string | null>(null);
  return (
    <div style={{ width: 560, fontFamily: "system-ui", border: "1px solid #EEF2F7" }}>
      <PromotionReview definitionId="def-sushi" name="Sushi Station"
        liveRevisionId="rev-18" liveDoc={liveDoc} schemaVersion={1}
        eventCount={9} lines={lines} annotations={annotations}
        author={mem.adapter} sessionKey="season-review-feb-2027" onAuthored={(r) => setAuthored(r)} />
      {authored && <div data-authored={authored} />}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
