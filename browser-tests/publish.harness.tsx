// harness/publish.harness.tsx — PL-3 Phase A's observable law, real component:
//   ?mode=ready     — prepared, archive+complete+review clear: observed & attest offered
//   ?mode=noarchive — prepared but archive missing: the door shows it, publish is honest
//   ?mode=sealed    — already published: sealed card, NO edit affordance
//   ?mode=prepare   — unprepared: only the Prepare affordance
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PublishDoor, DoorState } from "@/components/PublishDoor";

const mode = new URLSearchParams(window.location.search).get("mode") ?? "ready";
const acts: string[] = [];
(window as unknown as { __acts: string[] }).__acts = acts;

const states: Record<string, DoorState> = {
  ready:     { sealed: false, prepared: true,  archiveReady: true,  complete: true,  reviewSatisfied: true },
  noarchive: { sealed: false, prepared: true,  archiveReady: false, complete: true,  reviewSatisfied: true },
  sealed:    { sealed: true,  prepared: true,  archiveReady: true,  complete: true,  reviewSatisfied: true },
  prepare:   { sealed: false, prepared: false, archiveReady: false, complete: false, reviewSatisfied: false },
};

function Host() {
  const [refusal, setRefusal] = useState<string | null>(null);
  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <PublishDoor state={states[mode]} busy={false} lastRefusal={refusal}
        onPrepare={() => acts.push("prepare")}
        onPublish={(ev, occ, note) => {
          acts.push(`publish:${ev}${note ? ":" + note : ""}`);
          // the harness simulates the door's honest refusal when archive is absent
          if (!states[mode].archiveReady) setRefusal("The offer's artifact isn't ready — publishing is blocked until it is.");
        }} />
    </div>
  );
}

const style = document.createElement("link");
style.rel = "stylesheet"; style.href = "/app.css";
document.head.appendChild(style);
createRoot(document.getElementById("root")!).render(<Host />);
