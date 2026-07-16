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
  // ─── THE ASSERTION THAT WOULD HAVE CAUGHT THE REAL BUG ───────────────────
  // The last version of this test passed while the product was unusable:
  // draggable="true" rendered on 142 rows, and NOT ONE could be picked up,
  // because an <input> filled each row and browsers refuse to start a drag
  // from inside one. jsdom happily dispatches dragstart on the div, so the
  // harness never noticed.
  //
  // jsdom cannot simulate "would a browser start this drag?" — so assert the
  // STRUCTURAL property that guarantees it instead: a drag source must not
  // contain a text input, and must not BE one.
  {
    const bad = draggables().filter((el) =>
      el.querySelector("input, select, textarea") !== null || el.tagName === "INPUT");
    ok("NO drag source contains an input (a row full of inputs cannot be dragged)",
       bad.length === 0,
       bad.length ? `${bad.length} unusable source(s): ${bad.map((b) => rowText(b).slice(0, 40)).join(" | ")}` : "");
    ok("every drag source is a dedicated handle", draggables().every((el) => (el.textContent ?? "").trim() === "⠿"));
  }
  ok("something renders", text().includes("Sushi Station"));
  ok("rows render draggable=\"true\" (the gate on EVERY drag)", draggables().length > 0,
     `found ${draggables().length}; draggable="false": ${$('[draggable="false"]').length}`);
  ok("the component's HANDLE is the drag source",
     draggables().some((el) => rowText(el.parentElement!).includes("Sushi Station")));
  ok("the item's HANDLE is the drag source (items previously had none)",
     draggables().some((el) => rowText(el.parentElement!).includes("California Roll")));

  console.log("\n═══ 2 · CATEGORY AFFORDANCES (must advertise nothing) ═══");
  const grips = Array.from($("span")).filter((el) => (el.textContent ?? "").trim() === "⠿");
  ok("every draggable row has a handle (2 components + 3 items)", grips.length === 5, `${grips.length} grips`);
  // A category LABEL row must contain no handle. (Checking ancestors is
  // meaningless — a container holds both the label and its items' grips.)
  ok("NO category label row has a handle — category dragging is not designed",
     !Array.from($("div")).some((el) => {
       const kids = Array.from(el.children);
       const isLabelRow = kids.some((k) => (k.textContent ?? "").trim() === "Signature Rolls");
       return isLabelRow && kids.some((k) => (k.textContent ?? "").trim() === "⠿");
     }));
  ok("the layout token ('dot') no longer sits beside category labels — it is",
     !(text().includes("Signature Rolls") && (document.body.textContent ?? "").includes("dot")));
  ok("no category is draggable",
     !draggables().some((el) => {
       const t = rowText(el.parentElement ?? el).trim();
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
    const off = probe.querySelectorAll("[draggable]").length;
    ok("mayEdit=false ⇒ NOTHING is draggable (the regression, reproduced)", off === 0, `${off} draggable`);
    ok("...and the Stage SAYS it is read-only", (probe.textContent ?? "").toLowerCase().includes("read-only"),
       "a silently read-only Stage is indistinguishable from a broken one");
    await act(async () => { r2.unmount(); });
    probe.remove();
  }

  console.log("\n═══ 3 · DRAG A COMPONENT ═══");
  // Start the drag where a real browser can: on the handle.
  const compRow = Array.from($('[draggable]')).find((el) => {
    const row = el.parentElement;
    return !!row && rowText(row).includes("Sushi Station");
  })!;
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
  const itemRow = Array.from($('[draggable]')).find((el) => {
    const row = el.parentElement;
    return !!row && rowText(row).includes("California Roll");
  })!;
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
