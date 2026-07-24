// ═══ ACCEPTANCE — real Chromium, real mouse. Zero dispatchEvent anywhere. ════
//
// BUNDLE SELECTION
//   (default)  → browser-tests/app.js, the SHIPPED bundle. This is the
//                acceptance path: every claim below is a positive assertion
//                about shipped code.
//   --variant  → /tmp/app_broken.js, a DELIBERATELY BROKEN bundle, used to
//                prove this suite detects the regression it exists to catch.
//
// Generating the broken bundle — node browser-tests/build-broken-bundle.mjs
//   The convicted cause (recorded in accept-items.mjs) is that the source
//   category's list UNMOUNTED when a destination opened, so Chromium had no
//   node left to deliver dragend to and the Studio froze in drag state. The
//   fix keeps the source mounted and hides it with CSS. The broken variant
//   reverts exactly that, in src/components/studio/renderers/DesignStage.tsx:
//     FIXED  : {(isOpen || isSource) && (<div style={!isOpen ? {display:"none"} : undefined} data-cat-list={key}>
//     BROKEN : {isOpen && (<div data-cat-list={key}>
//   Then: node browser-tests/accept-regression.mjs --variant
//   MEASURED, not assumed: this suite scores IDENTICALLY on the good and the
//   broken bundle. It does NOT detect the drag-cleanup regression — none of
//   its claims exercise a CANCELLED drag after a destination opened, which is
//   the failure mode. The detector is accept-items.mjs, which fails T3/T4
//   against this same bundle exactly as its own header records. Keep --variant
//   as the honest negative control it is, and do not read a green run here as
//   coverage of the drag-cleanup invariant.
import { chromium } from "playwright-core";
import http from "http"; import { readFileSync } from "fs";

// Serve the shipped bundle unless --variant explicitly asks for the broken one.
const VARIANT = process.argv.includes("--variant");
const APP_BUNDLE = VARIANT ? "/tmp/app_broken.js" : new URL("./app.js", import.meta.url);

const srv = http.createServer((q, r) => {
  const f = q.url.split("?")[0] === "/" ? "/index.html" : q.url.split("?")[0];
  try { r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html; charset=utf-8");
        r.end(readFileSync(f === "/app.js" ? APP_BUNDLE : new URL("." + f, import.meta.url))); }
  catch { r.statusCode = 404; r.end(); }
});
const PORT = 4400 + Math.floor(Math.random() * 100);
srv.listen(PORT);

const browser = await chromium.launch({ headless: true, timeout: 15000 });
const results = [];
const T = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const gripOf = (page, inputValue) => page.evaluate((v) => {
  const inp = [...document.querySelectorAll("input")].find((i) => i.value === v);
  if (!inp) return null;
  inp.closest("div").scrollIntoView({ block: "center" });   // Canvas is a scroller now
  const grip = [...inp.closest("div").querySelectorAll("[data-grip]")][0];
  if (!grip) return null;
  const r = grip.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height,
           opacity: getComputedStyle(grip).opacity };
}, inputValue);

async function fresh(qs = "") {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 },
    ...(process.env.RECORD ? { recordVideo: { dir: "/tmp/video", size: { width: 900, height: 1000 } } } : {}) });
  await page.goto(`http://localhost:${PORT}/` + qs, { timeout: 10000 });
  await page.locator('input[value="Sushi Station"]').waitFor({ timeout: 8000 });
  return page;
}
const move = async (page, x, y, n = 8) => { for (let i = 0; i < n; i++) { await page.mouse.move(x, y, { steps: 2 }); await page.waitForTimeout(20); } };
// A Chromium-canceled drag leaves Playwright's drag interception waiting forever.
// Every in-flight action races a deadline so a dead drag FAILS instead of hanging.
const tryMove = (page, x, y, steps = 4) => Promise.race([
  page.mouse.move(x, y, { steps }).then(() => "ok"),
  new Promise((r) => setTimeout(() => r("DRAG_DEAD"), 3500))]);
const tryUp = (page) => Promise.race([page.mouse.up().then(() => "ok"),
  new Promise((r) => setTimeout(() => r("DRAG_DEAD"), 3500))]);

// ─── 1 · 2 · 3 · 4 · 5 — COMPONENT DRAG, end to end ─────────────────────────
{
  const page = await fresh();
  // (1) hidden at rest, revealed on hover
  const rest = await gripOf(page, "Sushi Station");
  await page.mouse.move(rest.x + 120, rest.y);           // hover the row, not the grip
  await page.waitForTimeout(150);
  const hover = await gripOf(page, "Sushi Station");
  T("1. hover reveals Sushi Station's handle", rest.opacity === "0" && hover.opacity === "1",
    `rest=${rest.opacity} hover=${hover.opacity} hitbox=${Math.round(hover.w)}×${Math.round(hover.h)}px`);

  // (2) real press + move starts the session
  await page.mouse.move(hover.x, hover.y);
  await page.mouse.down();
  const m1 = await tryMove(page, hover.x + 10, hover.y + 20, 3);
  const m2 = m1 === "ok" ? await tryMove(page, hover.x + 20, hover.y + 60, 4) : m1;
  // Bounded poll, not a fixed sample: dragover fires repeatedly once the
  // pointer settles over a target, and a 120ms snapshot raced it (only
  // dragenter had fired). Waits for the awaited condition; the assertion
  // below is unchanged and still fails honestly if dragover never arrives.
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => window.__log.some((e) => e.t === "dragover"))) break;
    // dragover fires only while the pointer MOVES over a target, so a
    // stationary poll can never observe it. Nudge 1px in place.
    await tryMove(page, hover.x + 20 + (i % 2 ? 1 : -1), hover.y + 60, 2);
    await page.waitForTimeout(50);
  }
  const dead = m1 !== "ok" || m2 !== "ok";
  const flight = await page.evaluate(() => ({
    seq: [...new Set(window.__log.map((e) => e.t))],
    itemInputs: [...document.querySelectorAll("input")].filter((i) => ["Prime Rib", "California Roll", "Penne alla Vodka"].includes(i.value)).length,
    bands: [...document.querySelectorAll("[data-band]")].map((b) => b.getAttribute("data-band-label")),
    guidesVisible: [...document.querySelectorAll("[data-band] span[aria-hidden]")].every((l) => getComputedStyle(l).opacity !== "0" && l.getBoundingClientRect().height >= 2),
    emptyHintShown: [...document.querySelectorAll("[data-band]")].some((b) => (b.textContent || "").includes("Drop component into Late Night")),
  }));
  T("2. real mouse from handle starts the drag session",
    !dead && flight.seq.includes("dragstart") && flight.seq.includes("dragover") && !flight.seq.includes("dragend"),
    (dead ? "CHROMIUM CANCELED THE DRAG · " : "") + flight.seq.join("→"));
  T("3. Canvas collapses to chapter destinations", flight.itemInputs === 0,
    `item inputs mid-flight: ${flight.itemInputs}`);
  T("4. legal DropBands visible (beginning/between/end/empty)",
    flight.bands.some((b) => b.includes("start of")) && flight.bands.some((b) => b.includes("Drop component into Late Night"))
      && flight.guidesVisible && flight.emptyHintShown,
    flight.bands.slice(0, 5).join(" | ") + ` · guides=${flight.guidesVisible} · emptyHint=${flight.emptyHintShown}`);
  await page.screenshot({ path: "/tmp/regr-drag-1-component-in-flight.png" });

  // (5) drop into Reception, at the end — persisted chapter change
  const band = await page.evaluate(() => {
    const el = document.querySelector('[data-band-label="Drop at end of Reception"]');
    if (!el) return { x: 450, y: 500 };
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await tryMove(page, band.x, band.y, 8);
  await page.waitForTimeout(120);
  await tryUp(page);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    persisted: window.__persisted,
    reception: window.__state().find((c) => c.id === "ch-recep").components.map((c) => c.title),
    dinner: window.__state().find((c) => c.id === "ch-dinner").components.map((c) => c.title),
    liveCleared: !document.body.innerText.includes("Drop at end of Reception"),
  }));
  T("5. dropping Sushi Station persists its new chapter",
    after.persisted.some((w) => w.kind === "component" && w.id === "comp-sushi" && w.chapter === "ch-recep")
      && after.reception.includes("Sushi Station") && !after.dinner.includes("Sushi Station")
      && after.liveCleared,
    `Reception=[${after.reception}] Dinner=[${after.dinner}] cleanup=${after.liveCleared}`);
  await page.screenshot({ path: "/tmp/regr-drag-2-component-landed.png" });
  await page.close();
}

// ─── 6 · 7 · 8 · 9 — ITEM DRAG, end to end ──────────────────────────────────
{
  const page = await fresh();
  // (6) hovering ONE item reveals only that item's handle
  const sweet = await gripOf(page, "Sweet Potato Roll");
  await page.mouse.move(sweet.x + 140, sweet.y);
  await page.waitForTimeout(150);
  const shown = await page.evaluate(() => [...document.querySelectorAll('[data-grip="item"]')]
    .filter((g) => getComputedStyle(g).opacity === "1")
    .map((g) => [...g.closest("div").querySelectorAll("input")][0]?.value));
  T("6. hovering an item reveals only that item's handle", shown.length === 1 && shown[0] === "Sweet Potato Roll",
    `visible item handles: [${shown}]`);

  // (7) drag starts focus mode: other categories collapse to compact labels
  await page.mouse.move(sweet.x, sweet.y);
  await page.mouse.down();
  const im1 = await tryMove(page, sweet.x + 8, sweet.y + 16, 3);
  const im2 = im1 === "ok" ? await tryMove(page, sweet.x + 14, sweet.y + 40, 4) : im1;
  const itemDead = im1 !== "ok" || im2 !== "ok";
  await page.waitForTimeout(150);
  const focus = await page.evaluate(() => ({
    sourceOpen: !![...document.querySelectorAll("input")].find((i) => i.value === "Spicy Tuna Roll"),
    classicCollapsed: ![...document.querySelectorAll("input")].find((i) => i.value === "Avocado Roll"),
    classicLabel: [...document.querySelectorAll("span")].some((s) => s.textContent === "Classic Rolls"),
    hint: document.body.innerText.includes("hover to open"),
  }));
  T("7. item drag starts focus mode (source open, others compact)",
    !itemDead && focus.sourceOpen && focus.classicCollapsed && focus.classicLabel && focus.hint,
    (itemDead ? "CHROMIUM CANCELED THE DRAG · " : "") + JSON.stringify(focus));
  await page.screenshot({ path: "/tmp/regr-drag-3-item-in-flight.png" });

  // (8) dwell ~700ms over Classic Rolls opens it
  const label = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((s) => s.textContent === "Classic Rolls");
    if (!el) return { x: 450, y: 400 };
    el.closest("div").scrollIntoView({ block: "center" });
    const r = el.closest("div").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await tryMove(page, label.x, label.y, 6);                 // slide over…
  await page.waitForTimeout(1100);                          // …and REST > HOVER_EXPAND_MS
  const opened = await page.evaluate(() => ({
    avocadoVisible: !![...document.querySelectorAll("input")].find((i) => i.value === "Avocado Roll"),
    bands: document.querySelectorAll("[data-band]").length,
  }));
  T("8. dwelling over another category opens it", opened.avocadoVisible && opened.bands > 0,
    `Avocado visible=${opened.avocadoVisible}, bands=${opened.bands}`);
  await page.screenshot({ path: "/tmp/regr-drag-4-item-dwell-opened.png" });

  // (9) drop BETWEEN Avocado and Cucumber → persisted category_key + position
  const between = await page.evaluate(() => {
    // the between-items guide inside the OPENED destination (Classic Rolls)
    // Only LAID-OUT bands are droppable. Since v284 the source category stays
    // MOUNTED under display:none (that is the drag-cleanup fix), so its bands
    // still match the selector but have zero-size rects. The ancestor walk
    // below is unbounded and would match one of those via a top-level
    // ancestor, yielding {x:0,y:0}. Restrict to bands the operator could
    // actually drop on. Mechanics only — the assertion is unchanged.
    const bands = [...document.querySelectorAll('[data-band-label="Drop here"]')]
      .filter((b) => b.offsetParent !== null && b.getBoundingClientRect().width > 0);
    const el = bands.find((b) => {
      let n = b.parentElement;
      while (n) { if ((n.textContent || "").includes("Avocado Roll")) return true; n = n.parentElement; }
      return false;
    }) ?? bands[0];
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!between) { T("9. dropping between two destination items persists", false, "no between-items band found"); }
  else {
    await tryMove(page, between.x, between.y, 6);
    await page.waitForTimeout(120);
    // Re-aim once if the bands re-flowed while the pointer was travelling: a
    // coordinate captured before the move can go stale as focus mode settles.
    // Mechanics only — the drop target and the assertion are unchanged.
    const reaim = await page.evaluate(([x, y]) => {
      const at = document.elementFromPoint(x, y);
      if (at && at.closest('[data-band-label="Drop here"]')) return null;
      const bands = [...document.querySelectorAll('[data-band-label="Drop here"]')]
        .filter((b) => b.offsetParent !== null && b.getBoundingClientRect().width > 0);
      const el = bands.find((b) => { let n = b.parentElement;
        while (n) { if ((n.textContent || "").includes("Avocado Roll")) return true; n = n.parentElement; }
        return false; }) ?? bands[0];
      if (!el) return null;
      const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, [between.x, between.y]);
    if (reaim) { await tryMove(page, reaim.x, reaim.y, 4); await page.waitForTimeout(120); }
    // Arriving in a single motion can leave only dragenter, and Chromium
    // REFUSES a drop whose target never received a dragover. Jiggle in place
    // so the target registers one. Mechanics only — the drop point is the
    // same band and the assertion is unchanged.
    const aim = reaim || between;
    for (let i = 0; i < 6; i++) {
      await tryMove(page, aim.x + (i % 2 ? 1 : -1), aim.y, 2);
      await page.waitForTimeout(30);
    }
    await tryUp(page);
    // Bounded poll for the write to land instead of a flat 400ms.
    for (let i = 0; i < 40; i++) {
      if (await page.evaluate(() => (window.__persisted || []).some((w) => w.kind === "item" && w.id === "it-sweet"))) break;
      await page.waitForTimeout(50);
    }
    const done = await page.evaluate(() => {
      const comp = window.__state().flatMap((c) => c.components).find((c) => c.id === "comp-sushi");
      const classic = comp.categories.find((k) => k.key === "classic").items.map((i) => i.name);
      const sig = comp.categories.find((k) => k.key === "sig").items.map((i) => i.name);
      return { persisted: window.__persisted, classic, sig };
    });
    T("9. dropping between two destination items persists category+position",
      done.persisted.some((w) => w.kind === "item" && w.id === "it-sweet" && w.category_key === "classic")
        && done.classic.join(",") === "Avocado Roll,Sweet Potato Roll,Cucumber Roll"
        && !done.sig.includes("Sweet Potato Roll"),
      `classic=[${done.classic}] sig=[${done.sig}]`);
    await page.screenshot({ path: "/tmp/regr-drag-5-item-landed.png" });
  }
  await page.close();
}

// ─── 10 — text selection in an inline input must not start a drag ───────────
{
  const page = await fresh();
  const box = await page.evaluate(() => {
    const i = [...document.querySelectorAll("input")].find((x) => x.value === "Sushi Station");
    // The Canvas is a scroller: without recentring, the rect resolves to a
    // point outside the scroller's clip and the press lands on <html>, so the
    // input never focuses and no text can be selected. gripOf() already does
    // this; claim 10 did not. Mechanics only — the assertion is unchanged.
    i.closest("div").scrollIntoView({ block: "center" });
    const r = i.getBoundingClientRect(); return { x: r.x + 8, y: r.y + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const sel = await page.evaluate(() => ({
    dragstart: window.__log.some((e) => e.t === "dragstart"),
    selected: (() => { const i = [...document.querySelectorAll("input")].find((x) => x.value === "Sushi Station");
                       return i.selectionEnd - i.selectionStart; })(),
  }));
  T("10. selecting text in an inline input does not start a drag", !sel.dragstart && sel.selected > 0,
    `dragstart=${sel.dragstart}, chars selected=${sel.selected}`);
  await page.close();
}

// ─── 11 — category rows advertise nothing ────────────────────────────────────
{
  const page = await fresh();
  const cat = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((s) => s.textContent === "Signature Rolls");
    const row = el.closest("div");
    return { grips: row.querySelectorAll("[data-grip]").length,
             draggables: row.querySelectorAll('[draggable="true"]').length,
             glyph: row.textContent.includes("⠿") };
  });
  T("11. category rows contain no drag handle", cat.grips === 0 && cat.draggables === 0 && !cat.glyph,
    JSON.stringify(cat));
  await page.close();
}

// ─── 12 — locked / read-only: no handles anywhere ────────────────────────────
{
  const page = await fresh("?readonly=1");
  const ro = await page.evaluate(() => ({
    grips: document.querySelectorAll("[data-grip]").length,
    draggables: document.querySelectorAll('[draggable="true"]').length,
    banner: document.body.innerText.includes("Read-only"),
  }));
  T("12. read-only version renders zero handles", ro.grips === 0 && ro.draggables === 0 && ro.banner,
    JSON.stringify(ro));
  await page.close();
}

// ─── 13 — LONG-DISTANCE: anchor holds on collapse, edge auto-scroll reaches
//         an offscreen chapter, and the drop persists ─────────────────────────
{
  const page = await fresh();
  // Sushi Station at the top of the Canvas viewport; Cocktail Hour offscreen above.
  const pre = await page.evaluate(() => {
    const sc = document.getElementById("canvas");
    const row = document.querySelector('[data-node-id="comp-sushi"]');
    sc.scrollTop = 0;
    sc.scrollTop = row.getBoundingClientRect().top - sc.getBoundingClientRect().top - 70;
    const r = row.getBoundingClientRect(), c = sc.getBoundingClientRect();
    const cock = [...document.querySelectorAll("h3, span")].find((h) => (h.textContent || "").replace("\u25b6", "").trim() === "Cocktail Hour");
    // Guarded: a missing chapter heading must fail its claim honestly, not
    // crash the runner and silently drop claims 13a-13c.
    return { rowTop: r.top, canvasTop: c.top, cocktailFound: !!cock,
             cocktailOffscreen: cock ? cock.getBoundingClientRect().bottom < c.top : false,
             scrollTop: sc.scrollTop };
  });
  const g = await gripOf(page, "Sushi Station");
  // gripOf recentres the row — re-pin the intended starting frame:
  const start = await page.evaluate(() => {
    const sc = document.getElementById("canvas");
    const row = document.querySelector('[data-node-id="comp-sushi"]');
    sc.scrollTop += row.getBoundingClientRect().top - sc.getBoundingClientRect().top - 70;
    const grip = row.querySelector("[data-grip]").getBoundingClientRect();
    const r = row.getBoundingClientRect(), c = sc.getBoundingClientRect();
    const cock = [...document.querySelectorAll("h3, span")].find((h) => (h.textContent || "").replace("\u25b6", "").trim() === "Cocktail Hour");
    return { gx: grip.x + grip.width / 2, gy: grip.y + grip.height / 2,
             rowTop: r.top, canvasTop: c.top, canvasBottom: c.bottom,
             cocktailFound: !!cock,
             cocktailOffscreen: cock ? cock.getBoundingClientRect().bottom < c.top : false };
  });
  await page.mouse.move(start.gx + 120, start.gy); await page.waitForTimeout(80);
  await page.mouse.move(start.gx, start.gy);
  await page.mouse.down();
  const lm = await tryMove(page, start.gx + 8, start.gy + 14, 3);
  await tryMove(page, start.gx + 14, start.gy + 30, 3);
  await page.waitForTimeout(160);                       // collapse + anchor correction
  const anchored = await page.evaluate(() => {
    const row = document.querySelector('[data-node-id="comp-sushi"]');
    return { rowTop: row.getBoundingClientRect().top };
  });
  const drift = Math.abs(anchored.rowTop - start.rowTop);
  T("13a. source stays anchored through focus-mode collapse",
    lm === "ok" && start.cocktailOffscreen && drift < 40,
    `pre-collapse top=${Math.round(start.rowTop)} post=${Math.round(anchored.rowTop)} drift=${Math.round(drift)}px · CocktailHour found=${start.cocktailFound} offscreen=${start.cocktailOffscreen}`);

  // hold the pointer in the top edge zone until Cocktail Hour scrolls into view
  await tryMove(page, start.gx, start.canvasTop + 14, 6);
  let visible = false, waited = 0;
  while (!visible && waited < 4000) {
    await page.waitForTimeout(200); waited += 200;
    visible = await page.evaluate(() => {
      const sc = document.getElementById("canvas").getBoundingClientRect();
      const b = document.querySelector('[data-band-label="Drop component into Cocktail Hour"]');
      if (!b) return false;
      const r = b.getBoundingClientRect();
      return r.top >= sc.top && r.bottom <= sc.bottom;
    });
  }
  T("13b. holding the top edge auto-scrolls Cocktail Hour into view", visible, `after ${waited}ms`);

  // leave the edge zone and let the scroll settle before aiming — the zone
  // keeps scrolling while the pointer is in it, which is the feature.
  await tryMove(page, start.gx, start.canvasTop + 200, 4);
  await page.evaluate(async () => {
    const sc = document.getElementById("canvas");
    let last = -1;
    while (sc.scrollTop !== last) { last = sc.scrollTop; await new Promise((r) => setTimeout(r, 120)); }
  });

  const dest = await page.evaluate(() => {
    const b = document.querySelector('[data-band-label="Drop component into Cocktail Hour"]');
    if (!b) return null;
    const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!dest) { T("13c. dropping Sushi Station into Cocktail Hour persists", false, "destination band not found"); }
  else {
    await tryMove(page, dest.x, dest.y, 6);
    await page.waitForTimeout(150);
    await tryUp(page);
    await page.waitForTimeout(400);
    const done = await page.evaluate(() => ({
      persisted: window.__persisted,
      cocktail: window.__state().find((c) => c.id === "ch-cocktail").components.map((c) => c.title),
      dinner: window.__state().find((c) => c.id === "ch-dinner").components.map((c) => c.title),
    }));
    T("13c. dropping Sushi Station into Cocktail Hour persists",
      done.persisted.some((w) => w.kind === "component" && w.id === "comp-sushi" && w.chapter === "ch-cocktail")
        && done.cocktail.includes("Sushi Station") && !done.dinner.includes("Sushi Station"),
      `CocktailHour=[${done.cocktail}] Dinner=[${done.dinner}]`);
  }
  await page.screenshot({ path: "/tmp/regr-drag-6-longdistance-landed.png" });
  await page.close();
}

console.log(`\n═══ ${results.filter((r) => r.ok).length}/${results.length} PASSED ═══`);
await browser.close(); process.exit(results.every((r) => r.ok) ? 0 : 1);
