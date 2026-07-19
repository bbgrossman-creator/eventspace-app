// harness/landing.harness.tsx — two real surfaces under one roof:
//
//   ?mode=decision (default) — the REAL LandingDecision over a fixture
//     preview, with window.__commits recording every handler fire. The
//     constitutional claims are structural: an empty recorder after open IS
//     "commits nothing until chosen".
//   ?mode=drag — the REAL LibraryBrowser (docked, fixture kinds: a landable
//     blueprint-shaped kind and an instantiable component-shaped kind) above
//     a drop zone whose acceptance comes from canvasDragMimes() — the same
//     declared-legality path the page uses. Real mouse gestures land here
//     (v197 doctrine: no dispatchEvent), paying v215's L-6 debt.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import LandingDecision from "@/components/studio/LandingDecision";
import LibraryBrowser from "@/components/studio/LibraryBrowser";
import {
  registerLibraryKind, rankPrefix, canvasDragMimes, LibraryEntry,
} from "@/lib/libraryRegistry";

const mode = new URLSearchParams(window.location.search).get("mode") ?? "decision";
const commits: string[] = [];
(window as unknown as { __commits: string[] }).__commits = commits;

const preview = {
  components: [
    { id: "src-1", title: "Sushi Station", sectionName: "Cocktail Hour", itemCount: 6 },
    { id: "src-2", title: "Carving Board", sectionName: "Dinner", itemCount: 4 },
    { id: "src-3", title: "Viennese Table", sectionName: "Dessert", itemCount: 9 },
  ],
};

function DecisionHost() {
  const [open, setOpen] = useState(true);
  if (!open) return <p data-landing-closed>closed — nothing landed</p>;
  return (
    <LandingDecision
      name="Elegant Wedding"
      preview={preview}
      onAdd={() => { commits.push("add"); setOpen(false); }}
      onReplace={() => { commits.push("replace"); setOpen(false); }}
      onChoose={(ids) => { commits.push(`choose:${ids.slice().sort().join(",")}`); setOpen(false); }}
      onCancel={() => { commits.push("cancel"); setOpen(false); }}
    />
  );
}

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
    legalDestinations: ["canvas"], dragMime: "text/eventcore-blueprint",
    drag: (e) => ({ mime: "text/eventcore-blueprint",
      payload: JSON.stringify({ blueprintId: e.id, name: e.title }) }),
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
          const bp = e.dataTransfer.getData("text/eventcore-blueprint");
          if (bp) { e.preventDefault(); setGot((g) => g.concat([`drop-blueprint:${bp}`])); return; }
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
  mode === "drag" ? <DragHost /> : <div style={{ height: "100vh" }}><DecisionHost /></div>);
