// v225 — the theme's pure claims: the ladder resolves per-leaf with
// provenance; sparse rungs pass through; the system default guarantees
// completeness; the stamp rule fires only on transitions INTO sent; deltas
// merge sparsely; the registries are well-formed.
import {
  resolveTheme, SYSTEM_DEFAULT_THEME, BUILT_IN_THEMES, builtInTheme,
  FONT_PAIRINGS, fontPairing, PALETTES, PAPERS, shouldStampPresentation, mergeDelta,
} from "../publication";
let passed = 0, failed = 0;
const T = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
};
T("nothing configured resolves to the complete system default — the historical dress", () => {
  const { theme, provenance } = resolveTheme(null, null, null);
  if (theme.colors.primary !== "#102F56" || theme.fonts.pairing !== "playfair-inter") throw new Error(JSON.stringify(theme.colors));
  if (theme.fonts.headingStack.indexOf("Playfair") < 0) throw new Error("stack unresolved");
  if (provenance.colors.primary !== "system") throw new Error("provenance wrong");
});
T("the ladder: per-LEAF most-specific-wins, provenance answers for every value", () => {
  const brand = { colors: { primary: "#111111", accent: "#B08D2F" } };
  const named = { fonts: { pairing: "montserrat-inter" }, colors: { accent: "#2563EB" } };
  const override = { paper: { tint: "#FDFBF7" } };
  const { theme, provenance } = resolveTheme(brand, named, override);
  if (theme.colors.primary !== "#111111") throw new Error("brand primary lost");
  if (theme.colors.accent !== "#2563EB") throw new Error("named accent didn't beat brand");
  if (theme.paper.tint !== "#FDFBF7") throw new Error("override paper lost");
  if (theme.paper.texture !== "none") throw new Error("system texture lost");
  if (theme.colors.ink !== SYSTEM_DEFAULT_THEME.colors.ink) throw new Error("system ink lost");
  if (theme.fonts.pairing !== "montserrat-inter") throw new Error("named pairing lost");
  const pr = provenance;
  if (pr.colors.primary !== "brand" || pr.colors.accent !== "theme" || pr.paper.tint !== "override"
    || pr.paper.texture !== "system" || pr.colors.ink !== "system" || pr.fonts.pairing !== "theme")
    throw new Error(JSON.stringify(pr));
});
T("v225b — the stamp is caused by the SEND ACT: sent → explicit Send → sent takes a FRESH snapshot", () => {
  if (!shouldStampPresentation("sent", "sent", true)) throw new Error("THE ADOPTED RULE: every explicit send stamps — even when the status value doesn't change");
  if (!shouldStampPresentation("draft", "sent", true)) throw new Error("first send must stamp");
  if (!shouldStampPresentation("revision_requested", "sent", true)) throw new Error("send after revision must stamp");
  if (shouldStampPresentation("sent", "approved", true)) throw new Error("approval is not a send — it locks the last stamp");
});
T("the passive safety net: status writes stamp only on transitions INTO sent", () => {
  if (!shouldStampPresentation("draft", "sent")) throw new Error("programmatic draft→sent must stamp");
  if (shouldStampPresentation("sent", "sent")) throw new Error("a passive non-transition must NOT stamp — only the ceremony re-stamps");
  if (shouldStampPresentation("draft", "internal_review")) throw new Error("editing/review never stamps");
  if (shouldStampPresentation("sent", "approved")) throw new Error("approval never re-stamps");
});
T("registries well-formed; a bad pairing key falls back, never crashes", () => {
  const keys: Record<string, true> = {};
  for (const f of FONT_PAIRINGS) { if (keys[f.key]) throw new Error("dup pairing " + f.key); keys[f.key] = true; }
  for (const t of BUILT_IN_THEMES) if (t.key !== "classic" && Object.keys(t.delta).length === 0) throw new Error(t.key + " is an empty theme");
  if (builtInTheme("classic") === null) throw new Error("classic missing");
  if (fontPairing("nope") !== null) throw new Error("phantom pairing");
  const { theme } = resolveTheme(null, { fonts: { pairing: "nope" } }, null);
  if (theme.fonts.pairing !== SYSTEM_DEFAULT_THEME.fonts.pairing) throw new Error("bad key didn't fall back");
  if (PALETTES.length < 3 || PAPERS.length < 3) throw new Error("curation too thin");
});
T("mergeDelta is sparse: patches touch their leaves and nothing else", () => {
  const merged = mergeDelta({ colors: { primary: "#111" } }, { paper: { tint: "#FFF" }, fonts: { pairing: "work-sans" } });
  if (merged.colors?.primary !== "#111" || merged.paper?.tint !== "#FFF" || merged.fonts?.pairing !== "work-sans")
    throw new Error(JSON.stringify(merged));
  if (merged.margins !== undefined) throw new Error("margins invented");
});
console.log(`\nv225.publication: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
