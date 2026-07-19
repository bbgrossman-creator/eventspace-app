// harness/wiring.tsx — mounts the REAL Inspector (the live Studio's component)
// with the REAL ConfigureFacet in its slot, exactly as page.tsx mounts it.
// Proves: the facet renders for component selections ONLY, inside the real
// Inspector chrome, fed by real engine state.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Inspector, { InspectorSelection } from "@/components/studio/Inspector";
import ConfigureFacet from "@/components/studio/ConfigureFacet";
import { bootMoves } from "@/lib/moves/boot";
import { emptyState, memoryAdapter, ConfigState } from "@/lib/configure";

bootMoves();
const mem = memoryAdapter();

const selections: Record<string, InspectorSelection> = {
  component: { kind: "component", id: "c1", title: "Sushi Station", subtitle: "Cocktail Hour",
    price: { amount: 1800, basis: "flat", confirmed: true, state: "quoted" } },
  item: { kind: "item", id: "i1", title: "California Roll", subtitle: "Sushi Station",
    price: { amount: 4, basis: "per_person", confirmed: true, state: "quoted" } },
  design: { kind: "design", id: "d1", title: "The Design" },
};

function App() {
  const [selKind, setSelKind] = useState<keyof typeof selections>("component");
  const [cfg, setCfg] = useState<ConfigState>(() => {
    const st = emptyState("c1", { choices: { service: "attended" }, schemes: {}, scalars: {} });
    st.config.choices = { ...st.seed.choices };
    return st;
  });
  const sel = selections[selKind];
  return (
    <div style={{ display: "flex", gap: 12, padding: 12, fontFamily: "system-ui" }}>
      <div>
        {(Object.keys(selections) as (keyof typeof selections)[]).map((k) => (
          <button key={k} data-select={k} onClick={() => setSelKind(k)} style={{ display: "block", margin: 4 }}>{k}</button>
        ))}
      </div>
      <div style={{ width: 380, border: "1px solid #EEF2F7", height: 640 }}>
        <Inspector
          selection={sel} lens={null} canEdit={true} canSeeCost={true}
          money={(n) => `$${n}`}
          configureFacet={sel.kind === "component" ? (
            <ConfigureFacet state={cfg} onState={setCfg} persist={mem.adapter}
              itemCount={2} canEdit={true} />
          ) : null}
        />
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
