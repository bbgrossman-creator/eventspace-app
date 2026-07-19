// harness/shell.harness.tsx — mounts the REAL LiveLensPanel (v213). The
// panel's claims are structural: it owns chrome only and contributes zero
// interactive controls. Modes: ?mode=content | ?mode=empty
import React from "react";
import { createRoot } from "react-dom/client";
import LiveLensPanel from "@/components/studio/LiveLensPanel";

const mode = new URLSearchParams(window.location.search).get("mode") ?? "content";
// v214: ?mode=switcher hands the panel a fixture switcher through the new
// slot — the structural claim becomes: the CONTENT region stays control-free
// even when the header hosts controls.
createRoot(document.getElementById("root")!).render(
  <div style={{ height: "100vh" }}>
    <LiveLensPanel lensLabel="Customer"
      emptyReason="Nothing composed yet — the proposal appears here as you build."
      switcher={mode === "switcher"
        ? <span data-fixture-switcher><button data-fixture-switch>Production</button></span>
        : undefined}>
      {mode === "empty"
        ? null
        : <div data-fixture-proposal>The Goldberg Wedding · Cocktail Hour · Dinner</div>}
    </LiveLensPanel>
  </div>);
