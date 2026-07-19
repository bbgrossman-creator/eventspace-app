// harness/configure.tsx — mounts the REAL ConfigureFacet and a mini Canvas
// item list. Both producers speak through the REAL move engine (planBatch →
// compileBatch → adapter). The adapter is in-memory but enforces what the RPC
// enforces (origin CHECK) and keeps the append-only payload log the tests
// assert against. Tests 16–20, 22–24 run here with a real mouse.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import ConfigureFacet from "@/components/studio/ConfigureFacet";
import { registerConsequenceRule } from "@/lib/moves/registry";
import { emptyState, memoryAdapter, submitBatch, ConfigState } from "@/lib/configure";
import { MoveProposal } from "@/lib/moves/types";

// REAL boot path: layers register, kitchen's OWN declared rules bind — the
// harness no longer hand-wires kitchen; it tests the production wiring.
import { bootMoves } from "@/lib/moves/boot";
bootMoves();
registerConsequenceRule("warehouse", (v) => v.choice("service") === "live_chef"
  ? [{ layerKey: "warehouse", logicalKey: "warehouse.live_chef.chef_station_kit", name: "Chef station kit", category: "rental" }] : []);

// ── INSTANTIATION (harness twin of instantiate_component): seed → complete state
function instantiate(): { state: ConfigState; items: { id: string; name: string }[] } {
  const state = emptyState("comp-1", {
    schemes: {
      black_slate: { id: "black_slate", label: "Black Slate", sets: { choices: { linen: "dark", vessels: "ceramic" } } },
      acrylic: { id: "acrylic", label: "Acrylic & Mirror", sets: { choices: { linen: "white", vessels: "glass" } } },
    },
    dimensions: {
      service: { label: "Service", options: ["attended", "live_chef", "self_serve"] },
      presentation: { label: "Presentation", options: ["wood", "black_slate", "acrylic"] },
    },
    scalars: { pieces: { value: 240, overridden: false, derivation: { formula: "180 guests × 8 ÷ 6", suggested: 240 } } },
    choices: { service: "attended" },
  });
  state.config.scalars = JSON.parse(JSON.stringify(state.seed.scalars));
  state.config.choices = { ...state.seed.choices };
  return { state, items: [
    { id: "it-1", name: "California Roll" }, { id: "it-2", name: "Spicy Tuna" },
  ]};
}

const mem = memoryAdapter();
(window as unknown as { __persisted: unknown[] }).__persisted = mem.persisted;

function App() {
  const mode = new URLSearchParams(window.location.search).get("mode") ?? "instantiated";
  const boot = instantiate();
  if (mode === "instantiated" || mode === "backref") {
    // backref mode: the SAME instantiated state, but the baseline moment sits
    // in the past so the fixture acts below are honestly "newer than baseline".
    const at = mode === "backref" ? "2026-07-01T00:00:00.000Z" : new Date().toISOString();
    boot.state.baseline = { config: JSON.parse(JSON.stringify(boot.state.config)),
      provenance: "instantiation_stamp", at };
    boot.state.configUpdatedAt = at;
  } else if (mode === "legacy") {
    // live legacy: def config exists → options loaded, init OFFERED, no baseline yet
    boot.state.configUpdatedAt = null;
    boot.state.baseline = { config: null, provenance: "none", at: null };
    boot.state.offerInitialize = true;
    boot.state.config.scalars = {}; boot.state.config.choices = {};
  } else if (mode === "evidence") {
    boot.state.configUpdatedAt = null;
    boot.state.baseline = { config: null, provenance: "baseline_unknown", at: null };
    boot.state.evidence = true;
    boot.state.offerInitialize = false;
    boot.state.config.scalars = {}; boot.state.config.choices = {};
  }
  const [state, setState] = useState<ConfigState>(boot.state);
  const [items, setItems] = useState(boot.items);
  const [poison, setPoison] = useState(false);
  (window as unknown as { __state: ConfigState }).__state = state;

  // ── the CANVAS producer: same grammar, canvas origin ──
  async function canvasAdd(name: string) {
    const proposal: MoveProposal = { kind: "select", instanceId: state.componentId,
      payload: { name, unitPrice: 6 },
      origin: poison ? ("poisoned" as MoveProposal["origin"]) : "canvas" };
    const res = await submitBatch(state, [proposal], mem.adapter);
    if (res.ok) { setState(res.next); setItems((xs) => [...xs, { id: `it-${xs.length + 1}`, name }]); }
    else document.getElementById("canvas-error")!.textContent = res.error;
  }
  async function canvasRemove(id: string, name: string) {
    const res = await submitBatch(state,
      [{ kind: "deselect", instanceId: state.componentId, payload: { itemId: id, name }, origin: "canvas" }],
      mem.adapter);
    if (res.ok) { setState(res.next); setItems((xs) => xs.filter((x) => x.id !== id)); }
  }

  return (
    <div style={{ display: "flex", gap: 16, padding: 16, fontFamily: "system-ui" }}>
      <div style={{ width: 320 }} data-mini-canvas>
        <h3 style={{ fontSize: 12, textTransform: "uppercase", color: "#94A3B8" }}>Canvas (items)</h3>
        {items.map((it) => (
          <div key={it.id} data-canvas-item={it.name} style={{ display: "flex", gap: 8, padding: "2px 0", fontSize: 13 }}>
            {it.name}
            <button data-canvas-remove={it.name} onClick={() => void canvasRemove(it.id, it.name)}>×</button>
          </div>
        ))}
        <button data-canvas-add-dragon onClick={() => void canvasAdd("Dragon Roll")}>+ Dragon Roll</button>
        <label style={{ display: "block", fontSize: 11, marginTop: 8 }}>
          <input type="checkbox" data-poison-toggle checked={poison} onChange={(e) => setPoison(e.target.checked)} />
          poison next batch (atomicity test)
        </label>
        <div id="canvas-error" data-canvas-error style={{ color: "#DC2626", fontSize: 11 }} />
      </div>
      <div style={{ width: 380, border: "1px solid #EEF2F7" }}>
        <ConfigureFacet state={state} onState={setState} persist={mem.adapter}
          itemCount={items.length} canEdit={true} onOpenCanvas={() => {}}
          backRefs={mode === "backref" ? [
            // v210 fixture: one act newer than the baseline citing service +
            // an item; one OLDER than the baseline citing service (must never
            // render); one newer citing only a never-diverged key (ditto).
            { actId: "act-goldberg", note: "Season review: the Goldberg pattern is our standard now.",
              createdAt: "2026-07-10T00:00:00.000Z", keys: ["choice:service", "item:Dragon Roll"] },
            { actId: "act-old", note: "pre-baseline act — already inside the comparison point",
              createdAt: "2026-06-15T00:00:00.000Z", keys: ["choice:service"] },
            { actId: "act-unrelated", note: "cites nothing this component diverges on",
              createdAt: "2026-07-12T00:00:00.000Z", keys: ["choice:presentation"] },
          ] : undefined} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
