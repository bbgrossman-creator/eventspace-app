import { chromium } from "playwright-core";
import http from "http"; import { readFileSync } from "fs";
http.createServer((q,r)=>{try{r.setHeader("content-type","text/html; charset=utf-8");r.end(readFileSync(new URL("./control.html",import.meta.url)))}catch{r.statusCode=404;r.end()}}).listen(4177);
const browser = await chromium.launch({ headless: true, timeout: 20000 });
const page = await browser.newPage();
await page.goto("http://localhost:4177/", { timeout: 15000 });
const g = await page.locator("#g").boundingBox();
const z = await page.locator("#zone").boundingBox();
await page.mouse.move(g.x+8, g.y+8);
await page.mouse.down();
for (let i=1;i<=15;i++){ await page.mouse.move(g.x+8, g.y+8+i*((z.y+30-(g.y+8))/15), {steps:2}); await page.waitForTimeout(16); }
await page.mouse.up();
await page.waitForTimeout(150);
console.log("CONTROL LOG:", JSON.stringify(await page.evaluate(()=>window.__log)));
await browser.close(); process.exit(0);
