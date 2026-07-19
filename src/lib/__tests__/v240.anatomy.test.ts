// v240 — PAGE ANATOMY: declaration integrity. No new physics — the
// claims are about the NAMES: every togglable region claimed by exactly
// one zone; page-master furniture exists only as reservations; the
// sidebar is named and empty.
import { PAGE_ANATOMY, REGION_OPTIONS } from "../publication";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};

T("every togglable region is claimed by EXACTLY one zone — the anatomy is total and unambiguous", () => {
  const claims = new Map<string, number>();
  for (const z of PAGE_ANATOMY) for (const r of z.regions) claims.set(r, (claims.get(r) ?? 0) + 1);
  for (const g of REGION_OPTIONS) {
    const n = claims.get(g.key) ?? 0;
    if (n !== 1) throw new Error(`${g.key} claimed by ${n} zones`);
  }
  for (const [r, n] of claims) if (!REGION_OPTIONS.some((g) => g.key === r))
    throw new Error(`zone claims '${r}' which is not a region (${n}x)`);
});

T("the five zones are the constitution's five: header · body · footer · decorations · sidebar, in reading order", () => {
  const keys = PAGE_ANATOMY.map((z) => z.key).join(",");
  if (keys !== "header,body,footer,decorations,sidebar") throw new Error(`anatomy reads ${keys}`);
  if (PAGE_ANATOMY.find((z) => z.key === "footer")!.regions.join(",") !== "contact,signature,terms,footer")
    throw new Error("the footer zone's tail order is not the paper's actual order");
});

T("PAGE-MASTER furniture exists only as reservations: named strings, never buildable regions; page numbers are among them", () => {
  const reserved = PAGE_ANATOMY.flatMap((z) => z.pageMaster ?? []);
  if (!reserved.some((f) => /page numbers/i.test(f))) throw new Error("page numbers are not named as reserved");
  for (const f of reserved) {
    if (REGION_OPTIONS.some((g) => g.label.toLowerCase() === f.toLowerCase()))
      throw new Error(`'${f}' is reserved AND buildable — the distinction collapsed`);
  }
  // and nothing togglable pretends to repeat: no region key implies pagination
  if (REGION_OPTIONS.some((g) => /page/i.test(g.key))) throw new Error("a togglable region smells like pagination");
});

T("the sidebar is RESERVED: named, empty, and inert — nothing built now can contradict it", () => {
  const sb = PAGE_ANATOMY.find((z) => z.key === "sidebar");
  if (!sb) throw new Error("the sidebar is unnamed — the reservation is illegible");
  if (sb.kind !== "reserved" || sb.regions.length !== 0 || (sb.pageMaster ?? []).length !== 0)
    throw new Error("the sidebar reserved something buildable");
});

console.log(`\nv240.anatomy: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
