// v243 — THE PROOF ENGINE: provenance-only attribution, honest divergence,
// honest math, and NO ranking anywhere.
import * as fs from "fs";
import { templateProof, classifyDivergence, proofLine, ProofRow } from "../proof";
import { portablePresentation, fingerprintPortable, makeProvenance, PortablePresentation } from "../portable";
import { ThemeDelta } from "../publication";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};

const tplPortable: PortablePresentation = portablePresentation({
  themeKey: "gallery",
  override: { colors: { accent: "#8B4513" }, treatments: { document: { cover: "banner" },
    sections: { "role-a": { heading: "eyebrow" } } } } as ThemeDelta,
  pins: null,
});
const template = { id: "tpl-1", portable: tplPortable };
const goodProv = makeProvenance("tpl-1", tplPortable, "midflight");
const asRow = (over: Partial<ProofRow>): ProofRow => ({
  status: "draft", provenance: goodProv, themeKey: "gallery",
  override: { colors: { accent: "#8B4513" }, treatments: { document: { cover: "banner" },
    sections: { "role-a": { heading: "eyebrow" } } } } as ThemeDelta,
  pins: null, ...over });

T("ATTRIBUTION IS PROVENANCE-ONLY: a version whose theme_key matches but carries no provenance is refused as evidence — reconstruction never happens", () => {
  const coincidence: ProofRow = asRow({ provenance: null, status: "approved", acceptedValue: 9000 });
  const other: ProofRow = asRow({ provenance: makeProvenance("tpl-OTHER", tplPortable, "creation") });
  const p = templateProof(template, [coincidence, other]);
  if (p.used !== 0) throw new Error(`coincidence counted: used=${p.used}`);
  if (classifyDivergence(template, coincidence) !== null) throw new Error("classification accepted a provenance-free row");
});

T("DIVERGENCE distinguishes honestly: unchanged (0 leaves) · light (1–4) · heavy (5+) · earlier-revision (fingerprint no longer the template's)", () => {
  if (classifyDivergence(template, asRow({})) !== "unchanged") throw new Error("identical portable not unchanged");
  const light = asRow({ override: { colors: { accent: "#000080" }, treatments: { document: { cover: "banner" },
    sections: { "role-a": { heading: "eyebrow" } } } } as ThemeDelta });
  if (classifyDivergence(template, light) !== "light") throw new Error("one changed leaf not light");
  const heavy = asRow({ themeKey: "minimal", override: { colors: { accent: "#111", primary: "#222", ink: "#333" },
    treatments: { document: { cover: "classic" }, sections: {} } } as ThemeDelta });
  const hc = classifyDivergence(template, heavy);
  if (hc !== "heavy") throw new Error(`many changed leaves classified ${hc}`);
  const stale = asRow({ provenance: { ...goodProv, fingerprint: "00000000" } });
  if (classifyDivergence(template, stale) !== "earlier-revision") throw new Error("stale fingerprint not honest");
});

T("THE METRICS are computed and honest: rate is NULL at sent=0, avg is NULL without values; modified-after counts every non-unchanged", () => {
  const rows: ProofRow[] = [
    asRow({ status: "approved", acceptedValue: 12000 }),                                  // unchanged, accepted w/ value
    asRow({ status: "sent", override: { colors: { accent: "#000080" }, treatments: { document: { cover: "banner" },
      sections: { "role-a": { heading: "eyebrow" } } } } as ThemeDelta }),                 // light, sent
    asRow({ status: "draft", provenance: { ...goodProv, fingerprint: "00000000" } }),      // earlier-revision, draft
  ];
  const p = templateProof(template, rows);
  if (p.used !== 3 || p.sent !== 2 || p.accepted !== 1) throw new Error(`counts ${p.used}/${p.sent}/${p.accepted}`);
  if (p.acceptanceRate !== 0.5) throw new Error(`rate ${p.acceptanceRate}`);
  if (p.avgAcceptedValue !== 12000) throw new Error(`avg ${p.avgAcceptedValue}`);
  if (p.modifiedAfter !== 2) throw new Error(`modifiedAfter ${p.modifiedAfter}`);
  const empty = templateProof(template, []);
  if (empty.acceptanceRate !== null || empty.avgAcceptedValue !== null)
    throw new Error("0/0 bravado — nulls required when nothing is known");
  const line = proofLine(p, (n) => `$${n}`);
  if (!line.includes("Used 3") || !line.includes("50%") || !line.includes("$12000") || !line.includes("Modified after 2"))
    throw new Error(`proof line dishonest: ${line}`);
});

T("NOTHING RANKS: no 'best' field in the proof shape, no 'best performing' anywhere in the engine or the Library kinds", () => {
  const p = templateProof(template, []);
  for (const k of Object.keys(p)) if (/best|rank|top/i.test(k)) throw new Error(`ranking field: ${k}`);
  for (const f of ["src/lib/proof.ts", "src/lib/libraryKinds.ts"]) {
    const src = fs.readFileSync(f, "utf8");
    if (/best[ -]performing/i.test(src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")))
      throw new Error(`'best performing' found in ${f}`);
  }
});

console.log(`\nv243.proof: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
