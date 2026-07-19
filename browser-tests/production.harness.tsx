// harness/production.tsx — mounts the REAL ProductionSheet over the REAL
// composeProductionModel with fixture inputs, through the REAL kitchen
// registration (bootMoves registers it): the pipeline under test is the
// shipped pipeline, not a twin. Modes:
//   ?mode=full      — configured component, requirements incl. one suppressed,
//                     kitchen instance layer, annotation
//   ?mode=empty     — component with no config, no layer, no requirements
//   ?mode=evidence  — same as full, evidence event (honesty band)
// The page exposes window.__writes — a counter the app has NO code path to
// increment, asserted zero by K-4 (read-only, structurally).
import React from "react";
import { createRoot } from "react-dom/client";
import ProductionSheet from "@/components/studio/renderers/ProductionSheet";
import { composeProductionModel, ProductionInputs } from "@/lib/productionLens";
import { bootMoves } from "@/lib/moves/boot";
bootMoves();

(window as unknown as { __writes: number }).__writes = 0;

const mode = new URLSearchParams(window.location.search).get("mode") ?? "full";

const fullComponent: ProductionInputs["components"][number] = {
  id: "comp-1", title: "Sushi Station",
  config: {
    schemeId: null, customized: [],
    scalars: { pieces: { value: 300, overridden: true,
      derivation: { formula: "180 guests × 8 ÷ 6", suggested: 240 } } },
    choices: { service: "live_chef" }, display: {}, substitutions: {},
  },
  baselineProvenance: "instantiation_stamp",
  requirements: [
    { layerKey: "kitchen", logicalKey: "kitchen.live_chef.handwash_station",
      name: "Handwash station", category: "equipment", notes: null, derived: true, suppressedAt: null },
    { layerKey: "kitchen", logicalKey: "kitchen.live_chef.prep_table",
      name: "Prep table", category: "equipment", notes: null, derived: true,
      suppressedAt: "2026-07-17T00:00:00Z" },
    { layerKey: "warehouse", logicalKey: "warehouse.live_chef.chef_station_kit",
      name: "Chef station kit", category: "rental", notes: null, derived: true, suppressedAt: null },
  ],
  layer: { schemaVersion: 1, data: {
    requirements: ["sushi chef"], equipment: ["cold table"],
    staffing: [{ role: "Sushi chef", count: 2 }], prepNotes: "Rice at dawn." } },
  annotation: "Uncle is a sushi chef — expect commentary.",
};

const inputs: ProductionInputs = {
  booking: { title: "Goldberg Wedding", eventDate: "2026-08-22", estGuests: 180 },
  locked: false,
  evidence: mode === "evidence",
  components: mode === "empty"
    ? [{ id: "comp-1", title: "Sushi Station", config: null, baselineProvenance: "none",
        requirements: [], layer: null, annotation: null }]
    : [fullComponent],
};

const model = composeProductionModel(inputs);
(window as unknown as { __model: unknown }).__model = model;

createRoot(document.getElementById("root")!).render(
  <div className="bg-white min-h-screen"><ProductionSheet model={model} /></div>);
