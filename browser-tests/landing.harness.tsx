// harness/landing.harness.tsx — the drag engine's surface:
//   (v262: the decision mode retired WITH the v216 doctrine — its
//    commitment disciplines live on in the constitutional heirs'
//    unit pins: CopyIntoDraft problems-block, StartFromBlueprint
//    conflicts→nothing-created.)
//   ?mode=drag (default) — the REAL LibraryBrowser (docked, fixture kinds: a landable
//     card-payload kind and an instantiable component-shaped kind) above
//     a drop zone whose acceptance comes from canvasDragMimes() — the same
//     declared-legality path the page uses. Real mouse gestures land here
//     (v197 doctrine: no dispatchEvent), paying v215's L-6 debt.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import LibraryBrowser from "@/components/studio/LibraryBrowser";
import {
  registerLibraryKind, rankPrefix, canvasDragMimes, LibraryEntry,
} from "@/lib/libraryRegistry";

const mode = new URLSearchParams(window.location.search).get("mode") ?? "drag";
const commits: string[] = [];
(window as unknown as { __commits: string[] }).__commits = commits;

const env = (kind: string, id: string, title: string): LibraryEntry => ({
  id, kind, title, subtitle: null, cover: null, tenant: "tenant", tags: [],
  facets: {}, text: null, layer_badges: [], provenance: null, pointer: { href: null },
});
// Module scope, once — registering inside a component body would re-register
// on every render, and the duplicate-throws discipline would (correctly)
// refuse it.
if (mode === "drag") {
  registerLibraryKind({
    kind: "fx-menu", label: "Menus", icon: "▤",
    search: async ({ q }) => [
      { entry: env("fx-menu", "m1", "Elegant Wedding"), weight: rankPrefix("Elegant Wedding", q) },
    ].filter((r) => r.entry.title.toLowerCase().includes(q)),
    pick: (e) => ({ type: "land", id: e.id, name: e.title }),
    legalDestinations: ["canvas"], dragMime: "text/eventcore-cardpayload",
    drag: (e) => ({ mime: "text/eventcore-cardpayload",
      payload: JSON.stringify({ cardId: e.id, name: e.title }) }),
  });
  registerLibraryKind({
    kind: "fx-station", label: "Stations", icon: "◆",
    search: async ({ q }) => [
      { entry: env("fx-station", "s1", "Elegant Sushi Station"), weight: rankPrefix("Elegant Sushi Station", q) },
    ].filter((r) => r.entry.title.toLowerCase().includes(q)),
    pick: (e) => ({ type: "instantiate", instantiateId: e.id, name: e.title }),
    legalDestinations: ["canvas"], dragMime: "text/eventcore-identity",
    drag: (e) => ({ mime: "text/eventcore-identity",
      payload: JSON.stringify({ identityId: e.id, name: e.title }) }),
  });
}

function DragHost() {
  const [hot, setHot] = useState(false);
  const [got, setGot] = useState<string[]>([]);
  return (
    <div style={{ height: "100vh" }} className="flex flex-col bg-[#F6F8FB]">
      <div className="shrink-0 max-h-[42vh] overflow-y-auto" data-knowledge-region>
        <LibraryBrowser docked open={true} onClose={() => {}}
          onLandDesign={(id, name) => setGot((g) => g.concat([`land-click:${id}:${name}`]))}
          onInstantiate={(id, name) => setGot((g) => g.concat([`inst-click:${id}:${name}`]))} />
      </div>
      <div data-fixture-canvas
        className="flex-1 m-4 rounded-lg bg-white border-2 border-dashed flex items-center justify-center"
        style={hot ? { borderColor: "#C9A34E" } : { borderColor: "#E7EDF5" }}
        onDragOver={(e) => {
          // the page's declared-legality path, verbatim in shape
          const accepted = canvasDragMimes().concat(["text/eventcore-component"]);
          for (const m of accepted) {
            if (e.dataTransfer.types.includes(m)) { e.preventDefault(); setHot(true); return; }
          }
        }}
        onDragLeave={() => setHot(false)}
        onDrop={(e) => {
          setHot(false);
          const bp = e.dataTransfer.getData("text/eventcore-cardpayload");
          if (bp) { e.preventDefault(); setGot((g) => g.concat([`drop-card:${bp}`])); return; }
          const id = e.dataTransfer.getData("text/eventcore-identity");
          if (id) { e.preventDefault(); setGot((g) => g.concat([`drop-identity:${id}`])); }
        }}>
        <div>
          <p className="text-[12px] text-slate-400 text-center">the Canvas</p>
          {got.map((g, i) => <p key={i} data-received className="text-[11px] text-slate-600">{g}</p>)}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  mode === "drag" ? <DragHost /> : <p data-mode-retired>the decision mode retired with the v216 doctrine (v262)</p>);
