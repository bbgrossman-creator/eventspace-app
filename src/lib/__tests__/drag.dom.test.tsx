// ═══════════════════════════════════════════════════════════════════════════
// DRAG SESSION — BROWSER-LEVEL TESTS
//
// Written because I diagnosed a dead drag pipeline by counting handlers in
// grep output, which proved nothing and wasted two rounds. Handler counts do
// not tell you whether `draggable` rendered as "true", whether the payload
// survives the DataTransfer, or whether the session state actually flips.
// Only the DOM does.
//
// These render the real component into a real DOM and assert the five things
// that must be true for a drag to work at all:
//
//   1. the row renders draggable="true"
//   2. dragstart puts a payload on the DataTransfer
//   3. focus mode ACTIVATES (item lists collapse — the Canvas simplifies)
//   4. a legal DropBand APPEARS
//   5. drop fires onDrop with the right payload and target
//
// Run:  npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/drag.dom.test.tsx
// ═══════════════════════════════════════════════════════════════════════════
import { JSDOM } from "jsdom";

// ── DOM first: React needs it at import time ──
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost", pretendToBeVisual: true,
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.MouseEvent = dom.window.MouseEvent;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0);
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;

/** jsdom has no DataTransfer. Without one, dragstart cannot carry a payload —
 *  so a test that skipped this would pass while the real thing was broken. */
class FakeDataTransfer {
  private store: Record<string, string> = {};
  dropEffect = "none";
  effectAllowed = "none";
  get types() { return Object.keys(this.store); }
  setData(k: string, v: string) { this.store[k] = v; }
  getData(k: string) { return this.store[k] ?? ""; }
  setDragImage() { /* browser-only */ }
}

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail?: string) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

async function main() {
  const React = (await import("react")).default;
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const DesignStage = (await import("../../components/studio/renderers/DesignStage")).default;
  type SC = import("../../components/studio/renderers/DesignStage").StageChapter;

  const chapters: SC[] = [
    {
      id: "sec-cocktail", name: "Cocktail Hour", subtotal: 4800,
      components: [
        {
          id: "comp-sushi", title: "Sushi Station", isPackage: true,
          packagePrice: 2950, packageBasis: "flat", packageConfirmed: true,
          display: "items", note: null, subtotal: null,
          categories: [{
            key: "signature", label: "Signature Rolls", layout: "dot",
            items: [
              { id: "it-cal", name: "California Roll", unitPrice: null, basis: null, priceState: "quoted", confirmed: true, visible: true, optional: false, categoryKey: "signature", choiceGroupId: null },
              { id: "it-spicy", name: "Spicy Tuna Roll", unitPrice: null, basis: null, priceState: "quoted", confirmed: true, visible: true, optional: false, categoryKey: "signature", choiceGroupId: null },
            ],
          }, {
            key: "classic", label: "Classic Rolls", layout: "dot",
            items: [
              { id: "it-alaska", name: "Alaska Roll", unitPrice: null, basis: null, priceState: "quoted", confirmed: true, visible: true, optional: false, categoryKey: "classic", choiceGroupId: null },
            ],
          }],
        },
        {
          id: "comp-carving", title: "Carving Station", isPackage: true,
          packagePrice: 1850, packageBasis: "flat", packageConfirmed: true,
          display: "items", note: null, subtotal: null, categories: [],
        },
      ],
    },
    { id: "sec-late", name: "Late Night", subtotal: null, components: [] },
  ];

  const drops: { payload: unknown; target: unknown }[] = [];
  const root = createRoot(document.getElementById("root")!);

  await act(async () => {
    root.render(React.createElement(DesignStage, {
      chapters, selectedId: null, onSelect: () => {}, focusedId: null,
      xray: true, mayEdit: true,
      onPatchComponent: () => {}, onPatchItem: () => {},
      money: (n: number) => `$${n}`,
      onDrop: (payload, target) => { drops.push({ payload, target }); },
    }));
  });

  const $ = (sel: string) => document.querySelectorAll(sel);
  /** Titles and prices render as <input>. An input's VALUE is not textContent
   *  — reading only textContent is how a passing test can miss an empty page,
   *  and how my first attempt at this test lied to me. */
  const text = () => {
    const t = document.body.textContent ?? "";
    const vals = Array.from($("input")).map((el) => (el as HTMLInputElement).value).join(" ");
    return `${t} ${vals}`;
  };
  const draggables = () => Array.from($('[draggable="true"]'));
  const rowText = (el: Element) =>
    `${el.textContent ?? ""} ${Array.from(el.querySelectorAll("input")).map((i) => (i as HTMLInputElement).value).join(" ")}`;

  console.log("\n─── rendered HTML (first 600 chars) ───");
  console.log(document.getElementById("root")?.innerHTML.slice(0, 600) || "(EMPTY ROOT)");
  console.log("\n═══ 1 · RENDERED DOM ATTRIBUTES ═══");
  ok("something renders", text().includes("Sushi Station"));
  ok("rows render draggable=\"true\" (the gate on EVERY drag)", draggables().length > 0,
     `found ${draggables().length}; draggable="false": ${$('[draggable="false"]').length}`);
  ok("the component row is draggable", draggables().some((el) => rowText(el).includes("Sushi Station")));
  ok("item rows are draggable", draggables().some((el) => rowText(el).includes("California Roll")));

  console.log("\n═══ 2 · CATEGORY AFFORDANCES (must advertise nothing) ═══");
  const grips = Array.from($("span")).filter((el) => (el.textContent ?? "").includes("⠿"));
  ok("grips exist only on components, never categories", grips.length === 2,
     `${grips.length} grips for 2 components`);
  ok("no category row is draggable",
     !draggables().some((el) => {
       const t = rowText(el).trim();
       return t.startsWith("Signature Rolls") || t.startsWith("Classic Rolls");
     }));

  console.log("\n═══ 2b · THE GATE (this is what was actually broken) ═══");
  {
    // mayEdit=false renders draggable="false" on EVERYTHING. The old forms
    // gated on !locked only, so they stayed usable when the session had no
    // perms; the new Stage added a perms gate and went silently read-only.
    // One boolean, four "broken" features, and nothing on screen said why.
    const probe = document.createElement("div");
    document.body.appendChild(probe);
    const r2 = createRoot(probe);
    await act(async () => {
      r2.render(React.createElement(DesignStage, {
        chapters, selectedId: null, onSelect: () => {}, focusedId: null,
        xray: true, mayEdit: false,
        onPatchComponent: () => {}, onPatchItem: () => {},
        money: (n: number) => `$${n}`, onDrop: () => {},
      }));
    });
    const off = probe.querySelectorAll('[draggable="true"]').length;
    ok("mayEdit=false ⇒ NOTHING is draggable (the regression, reproduced)", off === 0, `${off} draggable`);
    ok("...and the Stage SAYS it is read-only", (probe.textContent ?? "").toLowerCase().includes("read-only"),
       "a silently read-only Stage is indistinguishable from a broken one");
    await act(async () => { r2.unmount(); });
    probe.remove();
  }

  console.log("\n═══ 3 · DRAG A COMPONENT ═══");
  const compRow = draggables().find((el) => rowText(el).includes("Sushi Station"))!;
  const dt = new FakeDataTransfer();

  await act(async () => {
    const ev = new dom.window.Event("dragstart", { bubbles: true }) as Event & { dataTransfer?: unknown };
    ev.dataTransfer = dt;
    compRow.dispatchEvent(ev);
  });

  ok("dragstart put a payload on the DataTransfer", dt.getData("text/eventcore-node").length > 0,
     `types: [${dt.types.join(", ")}]`);
  const payload = dt.getData("text/eventcore-node") ? JSON.parse(dt.getData("text/eventcore-node")) : null;
  ok("the payload names the component", payload?.id === "comp-sushi");
  ok("...and its parent chapter", payload?.parentId === "sec-cocktail");
  ok("...and its kind", payload?.kind === "component");

  // FOCUS MODE: with a component in flight the Canvas simplifies to chapters —
  // item lists must vanish. This is the assertion that would have caught the
  // dead pipeline: `live` never populated, so nothing ever collapsed.
  ok("FOCUS MODE ACTIVE — item lists collapsed", !text().includes("California Roll"),
     "item rows still visible ⇒ the drag session never started");
  ok("...but structure remains", text().includes("Sushi Station") && text().includes("Late Night"));

  // A legal destination must be visible and reachable.
  ok("a legal DropBand APPEARED", text().includes("Drop component into Late Night")
     || text().includes("Drop at end of Late Night"),
     `body: ${text().slice(0, 300)}`);
  ok("...including into the EMPTY chapter (was unreachable)", text().includes("Drop component into Late Night"));

  console.log("\n═══ 4 · COMPLETE THE DROP ═══");
  const bands = Array.from($("div")).filter((el) =>
    (el.textContent ?? "") === "Drop component into Late Night");
  ok("the band is a real element", bands.length > 0);
  if (bands.length) {
    await act(async () => {
      const over = new dom.window.Event("dragover", { bubbles: true }) as Event & { dataTransfer?: unknown };
      over.dataTransfer = dt;
      bands[0].dispatchEvent(over);
      const drop = new dom.window.Event("drop", { bubbles: true }) as Event & { dataTransfer?: unknown };
      drop.dataTransfer = dt;
      bands[0].dispatchEvent(drop);
    });
  }
  ok("DROP COMPLETED — onDrop fired", drops.length === 1, `${drops.length} drops`);
  ok("...with the dragged component", (drops[0]?.payload as { id?: string })?.id === "comp-sushi");
  ok("...aimed at the destination chapter", (drops[0]?.target as { parentId?: string })?.parentId === "sec-late");
  ok("...appending (beforeId null)", (drops[0]?.target as { beforeId?: string | null })?.beforeId === null);

  // The session must END — a drag may never permanently rearrange the workspace.
  ok("the session ended; the Canvas restored itself", text().includes("California Roll"),
     "item lists still collapsed after drop ⇒ the session leaked");

  console.log("\n═══ 5 · DRAG AN ITEM ═══");
  drops.length = 0;
  const itemRow = draggables().find((el) => rowText(el).includes("California Roll"))!;
  const dt2 = new FakeDataTransfer();
  await act(async () => {
    const ev = new dom.window.Event("dragstart", { bubbles: true }) as Event & { dataTransfer?: unknown };
    ev.dataTransfer = dt2;
    itemRow.dispatchEvent(ev);
  });

  const p2 = dt2.getData("text/eventcore-node") ? JSON.parse(dt2.getData("text/eventcore-node")) : null;
  ok("dragstart carried the item", p2?.id === "it-cal");
  ok("its parent is the CATEGORY, not the component", p2?.parentId === "comp-sushi::signature");
  ok("...and its owner is the component", p2?.ownerId === "comp-sushi");

  ok("FOCUS MODE ACTIVE — the source category stays open", text().includes("California Roll"));
  ok("...and its siblings are reachable", text().includes("Drop at beginning") || text().includes("Drop at end"));

  // EXACT match: .includes() also matches every ANCESTOR div, and the
  // outermost one has no drop handler. The component test passed only because
  // it happened to use an exact comparison.
  const itemBands = Array.from($("div")).filter((el) => (el.textContent ?? "").trim() === "Drop at end");
  ok("a legal item DropBand APPEARED", itemBands.length > 0);
  if (itemBands.length) {
    await act(async () => {
      const drop = new dom.window.Event("drop", { bubbles: true }) as Event & { dataTransfer?: unknown };
      drop.dataTransfer = dt2;
      itemBands[0].dispatchEvent(drop);
    });
  }
  ok("DROP COMPLETED — onDrop fired for the item", drops.length >= 1, `${drops.length} drops`);
  ok("...with the dragged item", (drops[0]?.payload as { id?: string })?.id === "it-cal");

  console.log(`\n═══ ${pass} passed, ${fail} failed ═══\n`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
