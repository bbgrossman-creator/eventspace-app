// ═══ REAL-BROWSER HARNESS ═══════════════════════════════════════════════════
// Mounts the REAL DesignStage (the exact file that ships) with fixture data
// mirroring Moshe's Bar Mitzvah. Persistence = an in-page store that applies
// onDrop the way the page does, and logs every write to window.__persisted.
// Every native drag event is logged to window.__log so the Playwright test can
// see the true event path, not infer it.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import DesignStage, { StageChapter } from "../src/components/studio/renderers/DesignStage";
import { NodePayload, DropTarget, splitCatKey } from "../src/lib/dragGrammar";

declare global {
  interface Window { __log: any[]; __persisted: any[]; __state: () => StageChapter[]; }
}
window.__log = []; window.__persisted = [];
const L = (t: string, d?: any) => window.__log.push({ t, ...(d ?? {}), ts: performance.now() | 0 });

// True event path instrumentation — capture phase, so nothing can hide from it.
for (const ev of ["pointerdown","mousedown","dragstart","drag","dragenter","dragover","drop","dragend","selectstart"]) {
  document.addEventListener(ev, (e: any) => {
    if (ev === "dragover" || ev === "drag") { // too chatty — only log first per 300ms
      const last = (window as any)["__last_" + ev] ?? 0;
      if (e.timeStamp - last < 300) return;
      (window as any)["__last_" + ev] = e.timeStamp;
    }
    L(ev, {
      target: (e.target?.tagName ?? "?") + (e.target?.getAttribute?.("data-grip") ? "[grip]" : ""),
      text: (e.target?.textContent ?? "").slice(0, 18),
      defaultPrevented: e.defaultPrevented,
    });
  }, true);
}

const item = (id: string, name: string, cat: string | null, price = 0) => ({
  id, name, unitPrice: price || null, basis: "flat", priceState: null,
  confirmed: true, visible: true, optional: false, categoryKey: cat, choiceGroupId: null,
});

const pad = Array.from({ length: 14 }, (_, i) => item(`it-pad${i}`, `Passed Hors d'oeuvre ${i + 1}`, "mains", 40));
const FIX: StageChapter[] = [
  { id: "ch-cocktail", name: "Cocktail Hour", subtotal: null, components: [] },
  { id: "ch-recep", name: "Reception", subtotal: 1200, components: [
    { id: "comp-carving", title: "Carving Station", isPackage: false, packagePrice: null, packageBasis: null,
      packageConfirmed: false, display: "items", note: null, subtotal: 1200, categories: [
        { key: "mains", label: "Mains", layout: "vertical", items: [ item("it-prime","Prime Rib","mains",900), item("it-turkey","Smoked Turkey","mains",300), ...pad ] },
      ]},
  ]},
  { id: "ch-dinner", name: "Dinner", subtotal: 2950, components: [
    { id: "comp-sushi", title: "Sushi Station", isPackage: false, packagePrice: null, packageBasis: null,
      packageConfirmed: false, display: "items", note: null, subtotal: 2950, categories: [
        { key: "sig", label: "Signature Rolls", layout: "dot", items: [
          item("it-sweet","Sweet Potato Roll","sig",300), item("it-spicy","Spicy Tuna Roll","sig",450), item("it-cali","California Roll","sig",250) ] },
        { key: "classic", label: "Classic Rolls", layout: "dot", items: [ item("it-avo","Avocado Roll","classic",200), item("it-cuke","Cucumber Roll","classic",150) ] },
        { key: "sauces", label: "Sauces", layout: "comma", items: [] },
      ]},
    { id: "comp-pasta", title: "Pasta Bar", isPackage: false, packagePrice: null, packageBasis: null,
      packageConfirmed: false, display: "items", note: null, subtotal: 800, categories: [
        { key: null, label: null, layout: "vertical", items: [ item("it-penne","Penne alla Vodka",null,800) ] },
      ]},
  ]},
  { id: "ch-late", name: "Late Night", subtotal: null, components: [] },
];

function Harness() {
  const [chapters, setChapters] = useState<StageChapter[]>(FIX);
  const [selected, setSelected] = useState<string | null>(null);
  const mayEdit = new URLSearchParams(location.search).get("readonly") !== "1";
  window.__state = () => chapters;

  // Persistence — the same reduction the page performs, applied to local state
  // and logged. A drop is proven "persisted" when it lands in __persisted AND
  // the re-rendered tree reflects it.
  const onDrop = (p: NodePayload, t: DropTarget) => {
    L("app:onDrop", { payload: p, target: t });
    setChapters((prev) => {
      const next: StageChapter[] = JSON.parse(JSON.stringify(prev));
      if (p.kind === "component") {
        let moved: any = null;
        for (const ch of next) {
          const ix = ch.components.findIndex((c) => c.id === p.id);
          if (ix >= 0) moved = ch.components.splice(ix, 1)[0];
        }
        if (!moved) return prev;
        const dest = next.find((ch) => ch.id === t.parentId);
        if (!dest) return prev;
        const at = t.beforeId ? dest.components.findIndex((c) => c.id === t.beforeId) : dest.components.length;
        dest.components.splice(at < 0 ? dest.components.length : at, 0, moved);
        window.__persisted.push({ kind: "component", id: p.id, chapter: t.parentId, beforeId: t.beforeId });
      } else {
        const { componentId, category } = splitCatKey(String(t.parentId));
        let moved: any = null;
        for (const ch of next) for (const c of ch.components) for (const cat of c.categories) {
          const ix = cat.items.findIndex((i) => i.id === p.id);
          if (ix >= 0) moved = cat.items.splice(ix, 1)[0];
        }
        if (!moved) return prev;
        for (const ch of next) for (const c of ch.components) {
          if (c.id !== componentId) continue;
          let cat = c.categories.find((k) => (k.key ?? null) === category);
          if (!cat) { cat = { key: category, label: category, layout: "vertical", items: [] }; c.categories.push(cat); }
          moved.categoryKey = category;
          const at = t.beforeId ? cat.items.findIndex((i) => i.id === t.beforeId) : cat.items.length;
          cat.items.splice(at < 0 ? cat.items.length : at, 0, moved);
          window.__persisted.push({ kind: "item", id: p.id, category_key: category, component: componentId, beforeId: t.beforeId });
        }
      }
      return next;
    });
  };

  return (
    <div style={{ width: 760, margin: "0 auto", fontFamily: "system-ui" }}>
      <div id="canvas" style={{ height: 640, overflowY: "auto", border: "1px solid #EEF2F7" }}>
      <DesignStage
        chapters={chapters} selectedId={selected} onSelect={setSelected}
        focusedId={null} xray={false} mayEdit={mayEdit}
        onPatchComponent={(id, patch) => L("app:patchComponent", { id, patch })}
        onPatchItem={(id, patch) => L("app:patchItem", { id, patch })}
        money={(n) => `$${n.toLocaleString()}`}
        onDrop={onDrop}
      />
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
