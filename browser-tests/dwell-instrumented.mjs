// ═══ DWELL AUTOPSY — the five steps, observed directly ═══════════════════════
// 1 dragenter on destination · 2 timer start · 3 survive vs dragleave-cancel ·
// 4 setOpen executes (timer FIRES) · 5 destination rows in DOM.
import { chromium } from "playwright-core";
import http from "http"; import { readFileSync } from "fs";
const PORT = 4200 + Math.floor(Math.random() * 200);
http.createServer((q,r)=>{const f=q.url.split("?")[0]==="/"?"/index.html":q.url.split("?")[0];
  try{r.setHeader("content-type",f.endsWith(".js")?"text/javascript":f.endsWith(".css")?"text/css":"text/html; charset=utf-8");
      r.end(readFileSync(new URL("."+f,import.meta.url)))}catch{r.statusCode=404;r.end()}}).listen(PORT);
const browser = await chromium.launch({ headless: true, timeout: 15000 });

async function scenario(name, wander) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  // Watch the 700ms timer itself — installed BEFORE the app loads.
  await page.addInitScript(() => {
    window.__timers = [];
    const t0 = () => Math.round(performance.now());
    const S = window.setTimeout, C = window.clearTimeout;
    const watched = new Set();
    window.setTimeout = function (fn, d, ...a) {
      if (d >= 600) {
        const id = S.call(window, function (...x) { window.__timers.push({ e: "FIRED", id, at: t0() }); return fn(...x); }, d, ...a);
        watched.add(id); window.__timers.push({ e: "START", id, delay: d, at: t0() });
        return id;
      }
      return S.call(window, fn, d, ...a);
    };
    window.clearTimeout = function (id) {
      if (watched.has(id)) window.__timers.push({ e: "CLEARED", id, at: t0() });
      return C.call(window, id);
    };
    window.__el = [];
    const catOf = (n) => {
      let el = n instanceof Element ? n : null;
      while (el) {
        const t = el.textContent || "";
        for (const c of ["Signature Rolls", "Classic Rolls", "Sauces", "Mains"])
          if (t.startsWith(c)) return c;
        el = el.parentElement;
      }
      return "?";
    };
    for (const ev of ["dragenter", "dragleave"]) document.addEventListener(ev, (e) => {
      window.__el.push({ ev, cat: catOf(e.target), tgt: e.target.tagName,
        rel: e.relatedTarget ? catOf(e.relatedTarget) : "null", at: Math.round(performance.now()) });
    }, true);
  });
  await page.goto(`http://localhost:${PORT}/`, { timeout: 10000 });
  await page.locator('input[value="Sushi Station"]').waitFor({ timeout: 8000 });
  const g = await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((i) => i.value === "Sweet Potato Roll");
    const r = inp.closest("div").querySelector("[data-grip]").getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(g.x + 140, g.y); await page.waitForTimeout(60);
  await page.mouse.move(g.x, g.y); await page.mouse.down();
  await page.mouse.move(g.x + 8, g.y + 18, { steps: 3 });
  await page.mouse.move(g.x + 14, g.y + 44, { steps: 4 });
  await page.waitForTimeout(150);
  const label = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((s) => s.textContent === "Classic Rolls");
    const r = el.closest("div").getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.x, w: r.width };
  });
  await page.mouse.move(label.x, label.y, { steps: 6 });
  if (wander) {
    // Ben's hypothesis: keep the pointer MOVING inside the row, crossing the
    // label span's boundary repeatedly, for 1.2s.
    const lx = label.left + 20;                       // just inside the label text
    for (let i = 0; i < 24; i++) {
      await page.mouse.move(i % 2 ? lx : label.x, label.y, { steps: 2 });
      await page.waitForTimeout(45);
    }
  } else {
    await page.waitForTimeout(1100);                  // slide over and REST
  }
  const out = await page.evaluate(() => ({
    enterLeave: window.__el,
    timers: window.__timers,
    destRowsInDom: [...document.querySelectorAll("input")].some((i) => i.value === "Avocado Roll"),
    sourceCollapsed: ![...document.querySelectorAll("input")].some((i) => i.value === "Spicy Tuna Roll"),
  }));
  console.log(`\n━━ SCENARIO: ${name} ━━`);
  console.log("1. enter/leave stream (all categories):");
  for (const e of out.enterLeave.slice(0, 20)) console.log(`     ${e.at}ms ${e.ev} cat=${e.cat} tgt=${e.tgt} rel=${e.rel}`);
  console.log("2-4. 700ms timer lifecycle:", out.timers.map((t) => `${t.at}ms ${t.e}#${t.id}${t.delay ? "(" + t.delay + "ms)" : ""}`).join("  ") || "NO TIMER EVER STARTED");
  console.log("5. destination item rows in DOM:", out.destRowsInDom, "| source collapsed (setOpen side-effect):", out.sourceCollapsed);
  await page.mouse.up().catch(() => {});
  await page.close();
}
await scenario("REST (slide over, hold still)", false);
await scenario("WANDER (pointer keeps crossing the label boundary)", true);
await browser.close(); process.exit(0);
