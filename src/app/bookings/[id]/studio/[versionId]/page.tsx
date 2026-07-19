"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL STUDIO (v179) — the knowledge-driven proposal builder.
//
//   LEFT    Source Event Library — past successful events, similar-first;
//           expand → drag or click components into the proposal.
//   CENTER  The canvas — the proposal itself: sections (components) with
//           priced items, optional upgrades, reorder, add, remove.
//   RIGHT   Persistent intelligence — Live Quote (Base / With Selected /
//           Potential Upside), guests, adjustments, warnings, and Price
//           Memory + SRP for whichever item has focus.
//
// Tabs: Build · Compare · Notes · Files. Approved versions are read-only.
// Deliberately absent: undo arrows (would be fake), Share Link and PDF
// (v180's customer layer), margin (no cost data exists — revenue only).
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from "react";

// The move grammar boots once per app load (idempotent).
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
// (grammar boot lives below imports; see bootMoves())
import { Booking, fmtDate } from "@/lib/workflow";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";
import { resolveTaxForTenant, TaxResolution } from "@/lib/tax";
import StudioLine from "@/components/studio/StudioLine";
import SecondSheet from "@/components/studio/SecondSheet";
import { Meter, Drawer, GhostOutline } from "@/components/studio/StageFurniture";
import LibraryBrowser from "@/components/studio/LibraryBrowser";
import ConfigureFacet from "@/components/studio/ConfigureFacet";
import { bootMoves } from "@/lib/moves/boot";
import { bootLibraryKinds } from "@/lib/libraryKinds";
import { canvasDragMimes } from "@/lib/libraryRegistry";
import LandingDecision from "@/components/studio/LandingDecision";
import VersionGenesis from "@/components/studio/VersionGenesis";
import SectionPicker from "@/components/studio/SectionPicker";
import PresentationControls, { PubRoom } from "@/components/studio/PresentationControls";
import PresentationRoomRegion from "@/components/studio/PresentationRoomRegion";
import PhotographyRoom from "@/components/studio/PhotographyRoom";
import InspectorRegion from "@/components/studio/InspectorRegion";
import { PhotoRecord, PhotoPins, pinPhoto, unpinPhoto } from "@/lib/photos";
import { listPhotos } from "@/lib/photoData";
import PresentationRooms from "@/components/studio/PresentationRooms";
import TreatmentToolbar from "@/components/studio/TreatmentToolbar";
import { ThemeDelta, ResolvedTheme, resolveTheme, resolveThemeKey, mergeDelta } from "@/lib/publication";
import { getPublicationSettings, listPublicationThemes, PublicationTheme } from "@/lib/publicationData";
import { RegionTexts } from "@/lib/publication";
import { ResolvedFact, projectIdentity } from "@/lib/identity";
import { getCompanyIdentity } from "@/lib/identityData";
import { submitBatch, emptyState, ConfigState } from "@/lib/configure";
import { loadConfigState, supabasePersistAdapter, instantiateComponent } from "@/lib/configureSupabase";
import DefinitionView from "@/components/studio/DefinitionView";
import PromotionReview from "@/components/studio/PromotionReview";
import { loadDefinitionEvidence, DefinitionEvidence } from "@/lib/promotionSupabase";
import { loadDefinition, supabaseAuthorAdapter, LedgerEntry, loadPromotionBackRefs } from "@/lib/curationSupabase";
import { PromotionActRef } from "@/lib/backReference";
import { RevisionDoc } from "@/lib/curation";
import { currentCan } from "@/lib/featureCapabilities";
import ProposalRenderer from "@/components/ProposalRenderer";
import { buildPresentationModel, PresentationModel, outlineFromModel } from "@/lib/presentation";
import DesignOutline from "@/components/studio/renderers/DesignOutline";
import DesignStage from "@/components/studio/renderers/DesignStage";
import Inspector, { InspectorSelection } from "@/components/studio/Inspector";
import { buildDesignStage, outlineFromDesignChapters, RawComp, RawItem } from "@/lib/designStageModel";
import { sourceForIdentity } from "@/lib/library";
import { NodePayload, DropTarget, operationFor, reorder, isNoOp, splitCatKey } from "@/lib/dragGrammar";
import { visibleLenses, resolveLens, LensKey , lensEdits , lensSelects } from "@/lib/lenses";
import ProductionSheet from "@/components/studio/renderers/ProductionSheet";
import { loadProductionModel } from "@/lib/productionLensSupabase";
import { ProductionModel } from "@/lib/productionLens";
import { deriveObligations, ObligationModule, ModuleObligations } from "@/lib/obligations";
import { loadSession, Session } from "@/lib/permissions";
import { PRICING } from "@/lib/pricing";
import { Proposal, ProposalVersion, VERSION_FLOW, createVersion, createBlankVersion, archiveVersion, deleteVersionPermanently } from "@/lib/proposals";
import {
  GuestCategory, Adjustment, PricedItem, MemoryPoint, PackageLine, isActive,
  loadGuestCategories, loadPriceMemory, computeVersionTotals, promoteToCatalog,
  ChoiceGroupDef,
} from "@/lib/pricingEngine";
import { copyIntoVersion, loadSourceComponents, diffVersions, VersionDiff } from "@/lib/studio";
import { SectionType, loadSectionTypes, createSectionType } from "@/lib/sections";
import { promoteToBlueprint, getBlueprint, previewBlueprint, applyBlueprint, replaceWithBlueprint, applyBlueprintSubset, listBlueprints, Blueprint, BlueprintPreview } from "@/lib/blueprints";
import { landingRoute } from "@/lib/landing";
import { formatVersionDiff } from "@/lib/sheetChoice";

/** v218 — the sheet's physics: a layered lift instead of a generic div
 *  shadow. One constant, both papers. */
const PAPER_SHADOW = "0 1px 2px rgba(16,47,86,.10), 0 14px 44px -14px rgba(16,47,86,.28)";
import SourceEventPane from "@/components/SourceEventPane";
import FilesPanel from "@/components/FilesPanel";

interface CompRow {
  id: string; title: string; domain: string; position: number; notes: string | null;
  section_type_id: string | null;
  group_label: string | null; group_position: number; group_description: string | null;
  pricing_mode: string; package_price: number | null; package_basis: string;
  package_taxable: boolean; package_price_confirmed: boolean; package_cost: number | null;
  customer_description: string | null;
  proposal_display: string | null;
  item_categories: unknown;
  item_layout: string | null;
  uncategorized_position: string | null;
  package_audience: string[] | null;
  definition_id: string | null;   // v208: identity travels to the Promote entry
}
interface CanvasGroup { sectionTypeId: string | null; name: string; comps: CompRow[]; }
const money = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** v214 — which lenses this page can render LIVE in the right region. The
 *  page owns pipeline level 5, so this table is renderer inventory, not lens
 *  policy: a key appears when its renderer is mounted below (Customer →
 *  ProposalRenderer over liveStage; Production → ProductionSheet over
 *  loadProductionModel) and the registry still decides whether the lens is
 *  offered at all (visibleLenses ∩ this). A plain record, not a Set — the
 *  production build targets es5 (the v210 lesson, kept). */
const LIVE_RENDERED_LENSES: Record<string, true> = { customer: true, production: true };
const DOMAINS = ["food", "decor", "flowers", "lighting", "music", "layout", "kids", "staffing", "logistics", "custom"];

/** A component-local presentation category. Not an entity — just instructions
 *  for how this one component wants to show its items. */
interface CatDef { key: string; label: string; position: number; layout?: string | null; show_heading?: boolean; }
/** Read the item_categories jsonb defensively; malformed entries are skipped. */
function readCats(raw: unknown): CatDef[] {
  if (!Array.isArray(raw)) return [];
  const out: CatDef[] = [];
  raw.forEach((e, idx) => {
    if (!e || typeof e !== "object") return;
    const o = e as Record<string, unknown>;
    if (typeof o.key !== "string" || !o.key || out.some((x) => x.key === o.key)) return;
    out.push({
      key: o.key,
      label: typeof o.label === "string" ? o.label : o.key,
      position: typeof o.position === "number" ? o.position : idx * 10,
      layout: typeof o.layout === "string" ? o.layout : null,
      show_heading: typeof o.show_heading === "boolean" ? o.show_heading : true,
    });
  });
  return out.sort((a, b) => a.position - b.position);
}
const LAYOUT_OPTS: { v: string; label: string }[] = [
  { v: "vertical", label: "Vertical list" },
  { v: "comma", label: "Comma, inline" },
  { v: "dot", label: "Dot · inline" },
];

bootMoves();
bootLibraryKinds();   // v215: the host registers the Library kinds; the browser only consumes

export default function StudioPage() {
  const params = useParams<{ id: string; versionId: string }>();
  const bookingId = params.id;
  const versionId = params.versionId;

  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [b, setB] = useState<Booking | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [version, setVersion] = useState<ProposalVersion | null>(null);
  const [versions, setVersions] = useState<ProposalVersion[]>([]);
  const [tab, setTab] = useState<"build" | "notes" | "files">("build");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  // Canvas data
  const [comps, setComps] = useState<CompRow[]>([]);
  const [sectionTypes, setSectionTypes] = useState<SectionType[]>([]);
  const [vSections, setVSections] = useState<{ section_type_id: string; position: number }[]>([]);
  const [sectionPicker, setSectionPicker] = useState(false);
  const [items, setItems] = useState<PricedItem[]>([]);
  const [cats, setCats] = useState<GuestCategory[]>([]);
  const [guests, setGuests] = useState<Record<string, number>>({});
  const [adjs, setAdjs] = useState<Adjustment[]>([]);
  // v194 P0.1: choice groups were never loaded here — that omission, not the
  // arithmetic, is why every option was charged.
  const [choiceGroups, setChoiceGroups] = useState<ChoiceGroupDef[]>([]);
  // F0: tax is resolved per tenant, not assumed. `isFallback` means this
  // tenant has no configured rate and is silently inheriting New Jersey's —
  // which is exactly the bug F0 exists to make visible.
  const [tax, setTax] = useState<TaxResolution>({ rate: PRICING.TAX_RATE, source: "legacy_constant", isFallback: true });
  // v196 slice 2 — the shell. `session` is read for PERMS ONLY (condition 1);
  // this page must never branch on session.role, or Phase B stops being an
  // independent track.
  const [session, setSession] = useState<Session | null>(null);
  const [lens, setLens] = useState<LensKey | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);   // the Shade (⌘K)
  // v217 (STUDIO_COMPOSITION): all three are RENDER STATE — the Law's
  // summons die with the page, never persisted.
  const [ask, setAsk] = useState("");                       // the Summon row's query
  const [ghostOpen, setGhostOpen] = useState(false);        // the outline ghost
  const [split, setSplit] = useState(false);                // the Second Sheet
  // v196 THE STAGE. The customer projection, rendered INLINE — not a route in
  // another tab. This is the convergence the design doc committed to: the
  // preview was the X-ray-off end of a spectrum and the build view the X-ray-on
  // end; they meet here. The author stops working blind and checking.
  const [stage, setStage] = useState<PresentationModel | null>(null);
  const [stageBusy, setStageBusy] = useState(false);
  // Selection and focus are SHELL state: the rail, the Stage and Details must
  // agree, and three components cannot each own that (renderer contract).
  const [dropChapter, setDropChapter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [xray, setXray] = useState(true);   // authors default to seeing the truth
  const [srps, setSrps] = useState<Record<string, { srp: number | null; srp_set_at: string | null }>>({});

  // Focus / intelligence rail
  const [focusItem, setFocusItem] = useState<string | null>(null);
  const [memory, setMemory] = useState<Record<string, { points: MemoryPoint[]; range: { low: number; high: number; count: number } | null }>>({});
  const [dropHot, setDropHot] = useState(false);

  // Compare
  // v218 — the Second Sheet's VERSION AXIS (STUDIO_COMPOSITION §8): another
  // version through the customer lens — what we offered then, as an artifact.
  // The Compare tab folds in here and dies; diff INK on the papers stays
  // reserved. Both are render state.
  const [sheetVersionModel, setSheetVersionModel] = useState<PresentationModel | null>(null);
  const [sheetDiff, setSheetDiff] = useState<VersionDiff | null>(null);

  const locked = version?.status === "approved";

  const loadAll = useCallback(async () => {
    const [{ data: bk }, { data: v }] = await Promise.all([
      supabase.from("bookings").select("*").eq("id", bookingId).maybeSingle(),
      supabase.from("proposal_versions").select("*").eq("id", versionId).maybeSingle(),
    ]);
    if (!bk || !v) { setErr("Proposal version not found."); return; }
    setB(bk as Booking);
    const ver = v as ProposalVersion;
    setVersion(ver);
    const [{ data: p }, { data: vs }] = await Promise.all([
      supabase.from("proposals").select("*").eq("id", ver.proposal_id).maybeSingle(),
      supabase.from("proposal_versions").select("*").eq("proposal_id", ver.proposal_id).order("version"),
    ]);
    setProposal(p as Proposal);
    setVersions((vs ?? []) as ProposalVersion[]);
  }, [bookingId, versionId]);

  const loadCanvas = useCallback(async () => {
    const [categories, { data: g }, { data: a }, { data: c }, types, { data: vsec }, { data: cg }] = await Promise.all([
      loadGuestCategories(),
      supabase.from("version_guests").select("category_id,count").eq("version_id", versionId),
      supabase.from("version_adjustments").select("*").eq("version_id", versionId).order("position"),
      supabase.from("event_components").select("id,title,domain,position,notes,section_type_id,group_label,group_position,group_description,pricing_mode,package_price,package_basis,package_taxable,package_price_confirmed,package_cost,customer_description,proposal_display,item_categories,item_layout,uncategorized_position,package_audience,definition_id").eq("proposal_version_id", versionId).order("position"),
      loadSectionTypes().catch(() => [] as SectionType[]),
      supabase.from("version_sections").select("section_type_id,position").eq("version_id", versionId).order("position"),
      // v194 P0.1
      supabase.from("choice_groups").select("id,label,choose_count").eq("version_id", versionId),
    ]);
    setSectionTypes(types);
    setVSections((vsec ?? []) as { section_type_id: string; position: number }[]);
    setCats(categories);
    const gm: Record<string, number> = {};
    for (const row of (g ?? []) as { category_id: string; count: number }[]) gm[row.category_id] = row.count;
    setGuests(gm);
    setAdjs((a ?? []) as Adjustment[]);
    setChoiceGroups(((cg ?? []) as { id: string; label: string; choose_count: number }[])
      .map((x) => ({ id: x.id, choose_count: x.choose_count, label: x.label })));
    setTax(await resolveTaxForTenant());
    setSession(await loadSession());
    const compRows = (c ?? []) as CompRow[];
    setComps(compRows);
    if (compRows.length) {
      const { data: it, error } = await supabase.from("component_items")
        .select("id,component_id,name,quantity,quantity_basis,unit_price,applies_to_category_id,catalog_item_id,price_confirmed,pricing_reason,taxable,item_role,selected,presentation_note,show_on_proposal,category_key,choice_group_id,is_default_choice,position,price_state")
        .in("component_id", compRows.map((x) => x.id)).order("position");
      if (error) { setErr(`${error.message} — run v178/v179 SQL.`); return; }
      const rows = (it ?? []) as PricedItem[];
      setItems(rows);
      const catIds = Array.from(new Set(rows.map((r) => r.catalog_item_id).filter((x): x is string => !!x)));
      if (catIds.length) {
        const { data: ci } = await supabase.from("catalog_items").select("id,srp,srp_set_at").in("id", catIds);
        const m: Record<string, { srp: number | null; srp_set_at: string | null }> = {};
        for (const row of (ci ?? []) as { id: string; srp: number | null; srp_set_at: string | null }[]) m[row.id] = row;
        setSrps(m);
      }
    } else setItems([]);
  }, [versionId]);

  useEffect(() => { loadCapabilities().then((x) => setCaps(x.caps)); }, []);

  // The lens bar is DATA: this page renders whatever visibleLenses() returns
  // and knows the name of no lens. Adding one is a row in lib/lenses.ts.
  const lenses = useMemo(
    () => (caps ? visibleLenses({ caps }, session) : []),
    [caps, session],
  );
  // v214 — the Live Lens switcher's offer: the registry's visible lenses ∩
  // this page's renderer table. The page owns pipeline level 5 (Renderer), so
  // "a live renderer exists here" is legitimately its knowledge; WHETHER a
  // lens may be offered at all stays the registry's (capability × permission,
  // inherited from visibleLenses for free — no second gate here). Design is
  // absent from the table because the Canvas IS the Design; a lens joins the
  // offer by gaining a renderer, never by an edit to a hardcoded list of
  // keys in a component.
  // v225 PUBLICATION — the Version Override as RENDER STATE until "Save
  // look" commits it (§6). Draft inherits live; the stamp is
  // setVersionStatus's business (§3).
  const [pubThemeKey, setPubThemeKey] = useState<string | null>(null);
  const [pubOverride, setPubOverride] = useState<ThemeDelta | null>(null);
  const [pubDirty, setPubDirty] = useState(false);
  const [pubBusy, setPubBusy] = useState(false);
  // v226 THE CANVAS — one thing open, always: a ROOM or a selected
  // presentation identity, never both (§6.1/§6.3); both die on lens change.
  const [pubBrand, setPubBrand] = useState<ThemeDelta | null>(null);
  const [pubWords, setPubWords] = useState<RegionTexts>({ footer: null, signature: null, terms: null });
  const [pubCompany, setPubCompany] = useState<ResolvedFact[]>([]);
  const [pubTenantThemes, setPubTenantThemes] = useState<PublicationTheme[]>([]);
  useEffect(() => {
    getPublicationSettings().then((st) => { setPubBrand(st.brand); setPubWords(st.regionTexts); }).catch(() => {});
    getCompanyIdentity().then((co) => setPubCompany(projectIdentity(co.identity, co.policy))).catch(() => {});
    listPublicationThemes().then(setPubTenantThemes).catch(() => {});
  }, []);
  const [pubRoom, setPubRoom] = useState<PubRoom | null>(null);
  const [pubSection, setPubSection] = useState<string | null>(null);
  // v233 — the version's pinned imagery: render state, Save look commits.
  const [pubPins, setPubPins] = useState<PhotoPins | null>(null);
  const [pubLibrary, setPubLibrary] = useState<PhotoRecord[]>([]);
  const [pubFocusSlot, setPubFocusSlot] = useState<string | null>(null);
  useEffect(() => { listPhotos().then(setPubLibrary).catch(() => {}); }, []);
  useEffect(() => { setPubPins((version?.photo_pins as PhotoPins | null) ?? null); }, [version?.id]);
  useEffect(() => { setPubRoom(null); setPubSection(null); setPubFocusSlot(null); }, [lens]);
  const patchPub = (d: ThemeDelta) => { setPubOverride((prev) => mergeDelta(prev, d)); setPubDirty(true); };
  useEffect(() => {
    setPubThemeKey((version?.theme_key as string | null) ?? null);
    setPubOverride((version?.theme_override as ThemeDelta | null) ?? null);
    setPubDirty(false);
  }, [version?.id, version?.theme_key, version?.theme_override]);
  const resolvedPub: ResolvedTheme = useMemo(
    () => resolveTheme(pubBrand, resolveThemeKey(pubThemeKey, pubTenantThemes), pubOverride).theme,
    [pubBrand, pubTenantThemes, pubThemeKey, pubOverride]);
  async function savePublication() {
    if (!version) return;
    setPubBusy(true);
    const { error } = await supabase.from("proposal_versions")
      .update({ theme_key: pubThemeKey, theme_override: pubOverride, photo_pins: pubPins }).eq("id", version.id);
    setPubBusy(false);
    if (error) { setErr(error.message); return; }
    setPubDirty(false);
    setToast("🎨 Look saved to this version");
  }

  // v224 — chrome consults DECLARATIONS, never lens names (PUBLICATION §5).
  const activeLensDef = useMemo(() => lenses.filter((l) => l.key === lens)[0] ?? null, [lenses, lens]);

  const liveOptions = useMemo(
    () => lenses
      .filter((l) => LIVE_RENDERED_LENSES[l.key] === true)
      .map((l) => ({ key: l.key as string, label: l.label, blurb: l.blurb }))
      // v218 the VERSION AXIS: every other version, as the customer artifact
      // it was — "v2 beside v3". Same dial, second axis, one surface.
      .concat(versions.filter((v) => v.id !== versionId)
        .map((v) => ({ key: "v:" + v.id, label: "v" + v.version,
          blurb: "Version " + v.version + " \u2014 as the client would receive it" }))),
    [lenses, versions, versionId],
  );
  useEffect(() => {
    if (!caps || lens) return;
    // Rung 1 (explicit) + rung 5 (preference) are the two that work before
    // Phase B. An obligation deep-link — "your 3 production items on this
    // event" — arrives as ?lens=production and wins; both are permission-
    // checked inside resolveLens, because a lens is a REQUEST, not a grant.
    const url = new URLSearchParams(window.location.search).get("lens") as LensKey | null;
    let pref: LensKey | null = null;
    try { pref = localStorage.getItem("ec:lens") as LensKey | null; } catch { pref = null; }
    setLens(resolveLens({ caps }, session, { explicit: url, preference: pref }));
  }, [caps, session, lens]);

  // The Stage is a PROJECTION: rebuilt from canonical data, never patched in
  // place. Cheap because it is derived — and it is the reason the number on
  // the Stage can never drift from the number in the totals panel.
  useEffect(() => {
    if (!versionId || (lens !== "customer" && lens !== "design")) { setStage(null); return; }
    let dead = false;
    setStageBusy(true);
    // Design = the maker's lens: every truth, so X-ray content is on.
    // Customer = the artifact: X-ray only if the author asked to see chrome.
    buildPresentationModel(versionId, { xray: lens === "design" ? true : xray })
      .then((m) => { if (!dead) setStage(m); })
      .finally(() => { if (!dead) setStageBusy(false); });
    return () => { dead = true; };
  }, [versionId, lens, xray, items, comps, guests, adjs]);

  // F focuses the selection; Esc releases. Ignored while typing — an inline
  // field is content, and content owns its own Escape (abandon the edit).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key === "Escape" && focusedId) { e.preventDefault(); setFocusedId(null); }
      if ((e.key === "f" || e.key === "F") && selectedId && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); setFocusedId(focusedId === selectedId ? null : selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId, selectedId]);

  // Remember the door they chose. A preference, never a permission.
  useEffect(() => {
    if (!lens) return;
    try { localStorage.setItem("ec:lens", lens); } catch { /* private mode */ }
  }, [lens]);
  useEffect(() => { loadAll(); loadCanvas(); }, [loadAll, loadCanvas]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); } }, [toast]);

  const guestCounts = cats.map((c) => ({ category_id: c.id, count: guests[c.id] ?? 0 }));
  // Package-mode components contribute ONE line; their leftover items are
  // hidden and never counted ("no fake precision").
  const itemizedIds = new Set(comps.filter((c) => c.pricing_mode !== "package").map((c) => c.id));
  const activeItems = items.filter((i) => itemizedIds.has(i.component_id));
  const packageLines: PackageLine[] = comps.filter((c) => c.pricing_mode === "package")
    .map((c) => ({ id: c.id, title: c.title, package_price: c.package_price, package_basis: c.package_basis,
      package_taxable: c.package_taxable, package_price_confirmed: c.package_price_confirmed,
      package_audience: c.package_audience }));   // v194 P0.4
  // v194 P0.1: choiceGroups is the argument whose ABSENCE made the engine
  // structurally blind to choice groups and charge every option.
  const totals = useMemo(() => computeVersionTotals(activeItems, guestCounts, adjs, packageLines, choiceGroups, tax.rate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, comps, guests, adjs, cats, choiceGroups, tax]);
  // Every lens's badge comes from ONE derivation. The oversight strip (v197)
  // will call the same function and count — which is why a rail and a summary
  // cannot disagree. One derivation, many renderings.
  const obligations = useMemo(() => {
    const ctx = {
      totals,
      versionStatus: version?.status ?? null,
      hasIntro: !!((version as { customer_intro?: string | null } | null)?.customer_intro ?? "").trim(),
      componentCount: comps.length,
    };
    const mods: ObligationModule[] = ["events", "production", "operations", "photography", "finance"];
    const out: Record<string, ModuleObligations> = {};
    for (const m of mods) out[m] = deriveObligations(m, ctx);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, version, comps]);

  const designChapters = useMemo(() => {
    const secs = vSections
      .map((vs) => sectionTypes.find((t) => t.id === vs.section_type_id))
      .filter((x): x is SectionType => !!x)
      .map((t) => ({ id: t.id, name: t.name }));
    return buildDesignStage(
      comps as unknown as RawComp[],
      items as unknown as RawItem[],
      secs,
      (compId) => {
        const mine = activeItems.filter((i) => i.component_id === compId);
        if (!mine.length) return null;
        return computeVersionTotals(mine, guestCounts, [], [], choiceGroups, tax.rate).itemsSubtotal;
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comps, items, vSections, sectionTypes, activeItems, guestCounts, choiceGroups, tax]);

  /** Where ↵ puts things. Predictable beats clever: the selected chapter, or
   *  the chapter of the selected component, or the last chapter. Never a guess
   *  the user cannot reconstruct — drag is there for aiming precisely. */
  /** Where ↵ puts things — and where it REFUSES to guess.
   *
   *  The earlier fallback was "otherwise the last chapter." That is an
   *  invisible placement mistake: the component lands somewhere the user did
   *  not choose and did not see, and they discover it later or never. A
   *  question is cheaper than a wrong answer nobody noticed.
   *
   *    explicit target → selected chapter → selected component's chapter → ASK
   */
  const targetChapter = useMemo<string | null>(() => {
    if (!designChapters.length) return null;
    if (designChapters.length === 1) return designChapters[0].id;   // no ambiguity to resolve
    if (selectedId) {
      const asChapter = designChapters.find((ch) => ch.id === selectedId);
      if (asChapter) return asChapter.id;
      const owner = designChapters.find((ch) => ch.components.some((c) => c.id === selectedId));
      if (owner) return owner.id;
    }
    return null;   // ← ASK. Never "the last one".
  }, [designChapters, selectedId]);

  /** The question, asked only when there is genuinely one to ask. */
  const [askChapterFor, setAskChapterFor] = useState<{ identityId: string; name: string } | null>(null);

  /** The selection, projected for the Inspector. Under the renderer contract
   *  the panel queries nothing — it is handed what it renders. */
  // v207: the Definition view (Executive Curation surface).
  const [defView, setDefView] = useState<{
    definitionId: string; name: string; liveRevisionId: string | null;
    liveDoc: RevisionDoc | null; schemaVersion: number; ledger: LedgerEntry[];
  } | null>(null);
  async function openDefinition(definitionId: string, name: string) {
    const d = await loadDefinition(definitionId);
    setDefView({ definitionId, name: d.name === "(definition)" ? name : d.name,
      liveRevisionId: d.liveRevisionId, liveDoc: d.liveDoc, schemaVersion: d.schemaVersion, ledger: d.ledger });
  }

  // v209: one review session per Studio visit — an annotation grouping the
  // afternoon's promotions in provenance; never a transaction.
  const [reviewSessionKey] = useState(() =>
    `review-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`);

  // v216: the LANDING DECISION — a whole design meeting this Canvas. The
  // routing rule is landingRoute (blueprints.ts): empty Canvas ⇒ direct (no
  // ceremony without a decision); populated ⇒ the decision, and nothing
  // commits until chosen.
  const [landing, setLanding] = useState<{ bp: Blueprint; preview: BlueprintPreview } | null>(null);
  // v220 — VERSION GENESIS: "＋ New Version" is a decision, not a default.
  // No version exists before a route is chosen.
  const [genesis, setGenesis] = useState<{ blueprints: { id: string; name: string }[]; counts: Record<string, number> } | null>(null);
  const [genesisBusy, setGenesisBusy] = useState(false);
  async function commitGenesis(run: () => Promise<{ ok: boolean; detail?: string; id?: string }>) {
    setGenesisBusy(true);
    const r = await run();
    setGenesisBusy(false);
    if (!r.ok || !r.id) { setErr(r.detail ?? "Could not create the version."); return; }
    setGenesis(null);
    window.location.href = `/bookings/${b!.id}/studio/${r.id}`;
  }
  const [landingBusy, setLandingBusy] = useState(false);
  async function openLanding(blueprintId: string, name: string) {
    // This function is defined above the page's !booking early-return, so
    // narrow here: no booking, no landing. (Caught by Ben's strict
    // production build — the test config is strict:false and cannot see
    // nullability; the standing request for the production tsconfig stands.)
    if (!b) return;
    if (locked || !session?.perms.includes("bookings.edit")) return;
    setBusy(true);
    const bp = await getBlueprint(blueprintId);
    if (!bp) { setBusy(false); setErr(`"${name}" is in the Library but its blueprint row is gone.`); return; }
    const preview = await previewBlueprint(bp);
    setBusy(false);
    if (!preview.components.length) { setErr(`"${bp.name}" has no content — its source may have been deleted. Retire it.`); return; }
    if (landingRoute(comps.length) === "direct") {
      // An empty Canvas: there is nothing to protect — instantiate directly.
      setLandingBusy(true);
      const r = await applyBlueprint(b, versionId, bp);
      setLandingBusy(false);
      if (!r.ok) { setErr(r.detail ?? "Landing failed."); return; }
      setToast(`📐 "${bp.name}" landed — ${r.copied} component${r.copied === 1 ? "" : "s"}, prices carried`);
      loadCanvas();
      return;
    }
    setLanding({ bp, preview });   // the drop is the request, not the commit
  }
  async function commitLanding(run: () => Promise<{ ok: boolean; detail?: string; copied: number }>, verb: string) {
    if (!landing) return;
    setLandingBusy(true);
    const r = await run();
    setLandingBusy(false);
    if (!r.ok) { setErr(r.detail ?? "Landing failed."); return; }
    setLanding(null);
    setToast(`📐 ${verb} — ${r.copied} component${r.copied === 1 ? "" : "s"}, prices carried`);
    loadCanvas();
  }

  // v208: the Promotion review overlay.
  const [promoView, setPromoView] = useState<{
    definitionId: string; name: string; liveRevisionId: string | null;
    liveDoc: RevisionDoc; schemaVersion: number; evidence: DefinitionEvidence;
  } | null>(null);
  async function openPromotion(definitionId: string, name: string) {
    const [d, ev] = await Promise.all([loadDefinition(definitionId), loadDefinitionEvidence(definitionId)]);
    if (!d.liveDoc) { setToast("This definition has no configuration yet — curate it first."); return; }
    setPromoView({ definitionId, name: d.name === "(definition)" ? name : d.name,
      liveRevisionId: d.liveRevisionId, liveDoc: d.liveDoc, schemaVersion: d.schemaVersion, evidence: ev });
  }

  // SPEC-002: the selected component's configuration state (facet fuel).
  const [cfgState, setCfgState] = useState<ConfigState | null>(null);
  // v213 (Studio shell): the Live Lens's model — the CUSTOMER projection kept
  // fresh beside the Canvas while the maker builds. A second derivation of
  // the same graph (xray off: the artifact, not the maker's chrome); nothing
  // synchronizes it because there is nothing to synchronize.
  const [liveStage, setLiveStage] = useState<Awaited<ReturnType<typeof buildPresentationModel>> | null>(null);
  // v214→v217: the Second Sheet's CHOICE, mirrored from SecondSheet (one event
  // source — the region notifies on mount and on change, so this cannot
  // drift). Render state here exactly as it is there: never persisted.
  const [liveLensKey, setLiveLensKey] = useState<string>("customer");
  useEffect(() => {
    // v217: the customer projection serves the SECOND SHEET (summoned), not
    // a resident panel.
    if (!versionId || !split || liveLensKey !== "customer") { setLiveStage(null); return; }
    let dead = false;
    buildPresentationModel(versionId, { xray: false })
      .then((m) => { if (!dead) setLiveStage(m); })
      .catch(() => { if (!dead) setLiveStage(null); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, split, liveLensKey, items, comps, guests, adjs]);

  // v212 (SPEC-003): the Production sheet's model — projected fresh whenever
  // the lens opens or the version's data changes; a disposable projection,
  // never persisted (SPEC-003 §8).
  const [prodModel, setProdModel] = useState<ProductionModel | null>(null);
  // v210: the definition's promotion acts, for the back-reference (read-only).
  const [backRefs, setBackRefs] = useState<PromotionActRef[]>([]);
  useEffect(() => {
    let live = true;
    const compSel = selectedId && comps.some((c) => c.id === selectedId) ? selectedId : null;
    if (!compSel) { setCfgState(null); setBackRefs([]); return; }
    loadConfigState(compSel).then((st) => { if (live) setCfgState(st); });
    const defId = comps.find((c) => c.id === compSel)?.definition_id ?? null;
    if (defId) loadPromotionBackRefs(defId)
      .then((r) => { if (live) setBackRefs(r); })
      .catch(() => { if (live) setBackRefs([]); });   // informational — absence changes nothing
    else setBackRefs([]);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, comps.length]);

  useEffect(() => {
    let live = true;
    // v214: the same disposable projection now serves two mounts — the
    // Production LENS (the Stage) and the Production LIVE PROJECTION (the
    // right region while designing). One state, because it is one truth;
    // nothing synchronizes the two mounts because there is nothing to
    // synchronize.
    const wanted = lens === "production" || (split && liveLensKey === "production");
    if (!wanted) { setProdModel(null); return; }
    loadProductionModel(bookingId, versionId, locked)
      .then((m) => { if (live) setProdModel(m); })
      .catch(() => { if (live) setProdModel(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, split, liveLensKey, versionId, comps.length, items.length, cfgState]);

  const inspected = useMemo<InspectorSelection | null>(() => {
    if (!selectedId) return null;
    const it = items.find((i) => i.id === selectedId);
    if (it) {
      const owner = comps.find((c) => c.id === it.component_id);
      return {
        kind: "item", id: it.id, name: it.name, title: it.name,
        subtitle: owner ? owner.title : null,
        price: {
          amount: it.unit_price, basis: it.quantity_basis,
          confirmed: it.price_confirmed !== false,
          state: (it as { price_state?: string | null }).price_state ?? "quoted",
        },
        // The evidence, projected from the EXISTING per-item cache — the old
        // panel already loaded exactly this. Reusing it means one loader, one
        // cache, one truth about what an item has sold for.
        memory: memory[it.id]
          ? {
              sales: memory[it.id].points.slice(0, 3).map((pt) => ({
                amount: pt.unit_price,
                when: pt.date ? fmtDate(pt.date) : (pt.customer ?? ""),
              })),
              srp: null,
            }
          : undefined,
        visible: it.show_on_proposal !== false,
        internalReason: it.show_on_proposal === false
          ? (((it as { price_state?: string | null }).price_state ?? "quoted") === "internal"
              ? "Operational only" : "Hidden from proposal")
          : null,
        counts: { requirements: 0, media: 0 },
      } as InspectorSelection;
    }
    const c = comps.find((x) => x.id === selectedId);
    if (c) {
      return {
        kind: "component", id: c.id, title: c.title,
        subtitle: c.pricing_mode === "package" ? "Package" : "Itemized",
        price: c.pricing_mode === "package"
          ? { amount: c.package_price, basis: c.package_basis, confirmed: c.package_price_confirmed !== false, state: "quoted" }
          : null,
        memory: undefined,
        counts: { requirements: 0, media: 0 },
      } as InspectorSelection;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, items, comps, memory]);

  const hasOptions = items.some((i) => i.item_role === "optional");
  const totalGuests = guestCounts.reduce((x, g) => x + g.count, 0);
  // "$0.00" would be a lie of precision: per-person items aren't zero, they're
  // uncalculable until a guest count exists. Say so instead of showing $0.
  const needsGuests = totalGuests === 0 && (
    activeItems.some((i) => i.quantity_basis === "per_person" && i.unit_price != null && isActive(i)) ||
    packageLines.some((pk) => pk.package_basis === "per_person" && pk.package_price != null));

  // ── Mutations ──
  /** INSTANTIATE — the Library's verb, made real. Resolves the identity to its
   *  freshest instance and copies it through copyIntoVersion: the SAME path
   *  blueprints and source events use, so the copy semantics (what travels,
   *  what arrives amber) live in exactly one place. `chapterId` is the aim:
   *  a drag names it precisely; ↵ uses the selection's chapter. */
  async function instantiate(identityId: string, name: string, chapterId?: string | null) {
    if (!b || locked) return;
    setBusy(true);
    // SPEC-002 §1.4 — the fallback condition, exactly: a definition WITH a
    // live seed configuration instantiates through instantiate_component()
    // (one transaction: row, seed items, layer copies, config, stamps, zero
    // moves). A definition WITHOUT one (v192-era implicit) copies from a
    // source instance as it always has. The moment curation gives a
    // definition a seed, the RPC path takes over — the fallback is a
    // property of the data, never a second doctrine.
    const seeded = await supabase.from("component_definition_config").select("id")
      .eq("definition_id", identityId).is("superseded_by", null).is("archived_at", null)
      .maybeSingle();
    if (seeded.data?.id) {
      const r = await instantiateComponent(identityId, b.id, versionId);
      setBusy(false);
      if (!r.ok) { setErr(r.error); return; }
      if (chapterId && chapterId !== "__none__") {
        await patchComp(r.componentId, { section_type_id: chapterId });
      }
      setToast(`✓ "${name}" added from its definition — seeded and ready`);
      loadCanvas();
      return;
    }
    const src = await sourceForIdentity(identityId);
    if (!src) {
      setBusy(false);
      setErr(`"${name}" is in the Library but has no instance to copy — it may have been deleted.`);
      return;
    }
    const r = await copyIntoVersion(b, versionId, [src.componentId], `Library · ${name}`);
    setBusy(false);
    if (!r.ok) { setErr(r.detail ?? "Instantiate failed."); return; }
    // Aim it, if we were told where. Copy lands it; this places it.
    if (chapterId && chapterId !== "__none__" && r.newIds?.length) {
      await Promise.all(r.newIds.map((id) => patchComp(id, { section_type_id: chapterId })));
    }
    setToast(`✓ "${name}" added — prices carried, awaiting confirmation`);
    loadCanvas();
  }

  /** REARRANGE and MOVE — the only two verbs that write here. Dragging changes
   *  position and parentage. NOTHING else: no field is touched, no row is
   *  created, no price is confirmed. That is the first law of the grammar and
   *  it is enforced by this function being the only place a drop lands. */
  async function applyDrop(src: NodePayload, t: DropTarget) {
    if (locked || !session?.perms.includes("bookings.edit")) return;
    const op = operationFor(src, t);
    if (op === "invalid") return;

    if (src.kind === "component") {
      const target = designChapters.find((ch) => ch.id === t.parentId);
      if (!target) return;
      const sameChapter = src.parentId === t.parentId;
      const siblings = target.components.map((c) => c.id);
      // Moving in: the id isn't a sibling yet, so seed it before reordering.
      const base = sameChapter ? siblings : [...siblings];
      if (sameChapter && isNoOp(base, src.id, t.beforeId)) return;   // silence, not a write
      const { ids } = reorder(sameChapter ? base : [...base, src.id], src.id, t.beforeId);

      setBusy(true);
      await Promise.all(ids.map((id, idx) =>
        patchComp(id, id === src.id && !sameChapter
          ? { position: idx, section_type_id: t.parentId }   // MOVE: reparent + place
          : { position: idx })));                            // REARRANGE: place only
      setBusy(false);
      setSelectedId(src.id);   // selection follows the object; the Stage scrolls to it
      setToast(sameChapter ? "↕ Reordered" : `⇢ Moved to ${target.name}`);
      loadCanvas();
      return;
    }

    // ── Items ──
    // An item is ordered inside its CATEGORY. Within one ⇒ rearrange. Across
    // categories of the SAME component ⇒ move (it changes category_key).
    // Across components ⇒ operationFor already returned invalid above.
    const to = splitCatKey(t.parentId ?? "");
    const owner = designChapters.flatMap((ch) => ch.components).find((c) => c.id === to.componentId);
    if (!owner) return;
    const sameCat = t.parentId === src.parentId;
    const destCat = owner.categories.find((cat) => (cat.key ?? "_") === (to.category ?? "_"));
    const siblings = (destCat?.items ?? []).map((i) => i.id);

    if (sameCat && isNoOp(siblings, src.id, t.beforeId)) return;   // silence, not a write
    const { ids } = reorder(sameCat ? siblings : [...siblings, src.id], src.id, t.beforeId);

    setBusy(true);
    await Promise.all(ids.map((id, idx) =>
      patchItem(id, id === src.id && !sameCat
        ? { position: idx, category_key: to.category }   // MOVE: recategorise + place
        : { position: idx })));                          // REARRANGE: place only
    setBusy(false);
    setSelectedId(src.id);
    setToast(sameCat ? "↕ Reordered" : `⇢ Moved to ${destCat?.label ?? "uncategorised"}`);
    loadCanvas();
  }

  async function addFromSource(componentIds: string[], sourceLabel: string) {
    if (!b || locked) return;
    setBusy(true);
    const r = await copyIntoVersion(b, versionId, componentIds, sourceLabel);
    setBusy(false);
    if (!r.ok) { setErr(r.detail ?? "Copy failed."); return; }
    setToast(`✓ Added ${r.copied} from ${sourceLabel} — prices carried, awaiting confirmation`);
    loadCanvas();
  }
  async function seedFromEvent(ev: Booking) {
    if (!b || locked) return;
    const src = await loadSourceComponents(ev.id);
    if (!src.length) return;
    if (!confirm(`Start from ${ev.contact_name}? Adds all ${src.length} of its components to this proposal.`)) return;
    addFromSource(src.map((c) => c.id), `${ev.contact_name}${ev.event_type ? ` ${ev.event_type}` : ""}`);
  }
  // ── Component-local presentation categories (jsonb) ───────────────────────
  // Presentation metadata only: no pricing, no lifecycle, no table. The label
  // lives in exactly one place so items sharing a category cannot drift apart.
  async function addCategory(c: CompRow) {
    const label = prompt("Category heading (e.g. Signature Rolls)");
    if (!label?.trim()) return;
    const cats = readCats(c.item_categories);
    // Component-local key: unique within this component, never referenced outside it.
    const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "cat";
    let key = base; let n = 2;
    while (cats.some((x) => x.key === key)) key = `${base}_${n++}`;
    const next = [...cats, {
      key, label: label.trim(),
      position: (cats.length ? Math.max(...cats.map((x) => x.position)) : 0) + 10,
      show_heading: true,
    }];
    await patchComp(c.id, { item_categories: next });
  }
  async function patchCategory(c: CompRow, key: string, patch: Record<string, unknown>) {
    const next = readCats(c.item_categories).map((x) => (x.key === key ? { ...x, ...patch } : x));
    await patchComp(c.id, { item_categories: next });
  }
  async function moveCategory(c: CompRow, key: string, dir: -1 | 1) {
    const cats = readCats(c.item_categories);
    const i = cats.findIndex((x) => x.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cats.length) return;
    [cats[i], cats[j]] = [cats[j], cats[i]];
    await patchComp(c.id, { item_categories: cats.map((x, idx) => ({ ...x, position: (idx + 1) * 10 })) });
  }
  async function deleteCategory(c: CompRow, key: string) {
    const orphans = items.filter((i) => i.component_id === c.id && i.category_key === key);
    if (!confirm(`Remove this heading?${orphans.length ? ` ${orphans.length} item(s) become ungrouped.` : ""}`)) return;
    await patchComp(c.id, { item_categories: readCats(c.item_categories).filter((x) => x.key !== key) });
    // Clear the pointer rather than leaving keys aimed at nothing.
    await Promise.all(orphans.map((i) => patchItem(i.id, { category_key: null })));
  }

  async function patchComp(id: string, patch: Partial<CompRow>) {
    await supabase.from("event_components").update(patch).eq("id", id);
    setComps((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  async function deleteComp(c: CompRow) {
    if (!confirm(`Remove "${c.title}" and its items from this proposal?`)) return;
    await supabase.from("event_components").delete().eq("id", c.id);
    loadCanvas();
  }
  async function moveComp(c: CompRow, dir: -1 | 1) {
    const siblings = comps.filter((x) => x.section_type_id === c.section_type_id);
    const idx = siblings.findIndex((x) => x.id === c.id);
    const other = siblings[idx + dir];
    if (!other) return;
    await Promise.all([
      supabase.from("event_components").update({ position: other.position }).eq("id", c.id),
      supabase.from("event_components").update({ position: c.position }).eq("id", other.id),
    ]);
    loadCanvas();
  }
  async function reorderTo(dragId: string, targetId: string) {
    if (dragId === targetId) return;
    const ordered = comps.filter((c) => c.id !== dragId);
    const ti = ordered.findIndex((c) => c.id === targetId);
    const dragged = comps.find((c) => c.id === dragId)!;
    ordered.splice(ti, 0, dragged);
    await Promise.all(ordered.map((c, i) => supabase.from("event_components").update({ position: i }).eq("id", c.id)));
    loadCanvas();
  }
  async function addItem(compId: string, categoryKey: string | null = null) {
    const name = prompt("Item name");
    if (!name?.trim()) return;
    // REROUTED (SPEC-002 §1.3): selection identity flows through the grammar.
    // One RPC transaction lands the item AND its canvas-origin move.
    const res = await submitBatch(emptyState(compId), [{
      kind: "select", instanceId: compId,
      payload: { name: name.trim(), categoryKey: categoryKey ?? undefined,
                 quantityBasis: "per_person", priceConfirmed: true, taxable: true,
                 position: items.filter((i) => i.component_id === compId).length },
      origin: "canvas",
    }], supabasePersistAdapter);
    if (!res.ok) setErr(res.error); else loadCanvas();
  }
  async function patchItem(id: string, patch: Partial<PricedItem>) {
    // REROUTED for selection-semantic edits (SPEC-002 §1.3): a rename is a
    // configuration fact ("renamed A → B") and flows through the grammar.
    // Pricing, position, and display flags belong to their own systems and
    // stay on the direct path — the configuration log is a log of
    // configuration, not change-data-capture.
    if (Object.keys(patch).length === 1 && typeof patch.name === "string") {
      const prev = items.find((i) => i.id === id);
      const compId = prev?.component_id;
      if (compId && prev && patch.name.trim() && patch.name !== prev.name) {
        const res = await submitBatch(emptyState(compId), [{
          kind: "update_item", instanceId: compId,
          payload: { itemId: id, name: patch.name.trim(), prevName: prev.name },
          origin: "canvas",
        }], supabasePersistAdapter);
        if (!res.ok) { setErr(res.error); return; }
        setItems((p) => p.map((i) => (i.id === id ? { ...i, name: patch.name! } : i)));
        return;
      }
    }
    const { error } = await supabase.from("component_items").update(patch).eq("id", id);
    if (error) { setErr(error.message); return; }
    setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  async function deleteItem(id: string) {
    // REROUTED (SPEC-002 §1.3): removal is a deselect, recorded with the item.
    const it = items.find((i) => i.id === id);
    if (!it) return;
    const res = await submitBatch(emptyState(it.component_id), [{
      kind: "deselect", instanceId: it.component_id,
      payload: { itemId: id, name: it.name }, origin: "canvas",
    }], supabasePersistAdapter);
    if (!res.ok) { setErr(res.error); return; }
    setItems((p) => p.filter((i) => i.id !== id));
  }
  async function saveGuests(catId: string, count: number) {
    setGuests((p) => ({ ...p, [catId]: count }));
    await supabase.from("version_guests").upsert({ version_id: versionId, category_id: catId, count });
  }
  async function focusOn(i: PricedItem) {
    setFocusItem(focusItem === i.id ? null : i.id);
    if (!memory[i.id]) {
      const m = await loadPriceMemory({ name: i.name, catalog_item_id: i.catalog_item_id, component_id: i.component_id });
      setMemory((p) => ({ ...p, [i.id]: m }));
    }
  }
  async function totalsFor(vid: string): Promise<number> {
    {
      const { data: c } = await supabase.from("event_components").select("id").eq("proposal_version_id", vid);
      const ids = ((c ?? []) as { id: string }[]).map((x) => x.id);
      if (!ids.length) return 0;
      const [{ data: it }, { data: g }, { data: a }] = await Promise.all([
        supabase.from("component_items").select("id,component_id,name,quantity,quantity_basis,unit_price,applies_to_category_id,catalog_item_id,price_confirmed,pricing_reason,taxable,item_role,selected,presentation_note,show_on_proposal,category_key,choice_group_id,is_default_choice,position,price_state").in("component_id", ids),
        supabase.from("version_guests").select("category_id,count").eq("version_id", vid),
        supabase.from("version_adjustments").select("*").eq("version_id", vid),
      ]);
      return computeVersionTotals((it ?? []) as PricedItem[], (g ?? []) as { category_id: string; count: number }[], (a ?? []) as Adjustment[]).total;
    }
  }
  // The version-axis loader: a "v:<id>" sheet key summons that version's
  // customer artifact and its quiet diff line.
  useEffect(() => {
    const isV = split && liveLensKey.slice(0, 2) === "v:";
    if (!isV) { setSheetVersionModel(null); setSheetDiff(null); return; }
    const vid = liveLensKey.slice(2);
    let dead = false;
    setSheetVersionModel(null); setSheetDiff(null);
    buildPresentationModel(vid).then((m) => { if (!dead) setSheetVersionModel(m); });
    diffVersions(vid, versionId, totalsFor).then((d) => { if (!dead) setSheetDiff(d); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split, liveLensKey, versionId, items, comps, guests, adjs]);

  // ── The Proposal Language: canvas groups = version's sections (ordered),
  //    then any extra sections components reference, then Unsectioned. ──
  const nameOf: Record<string, string> = {};
  for (const t of sectionTypes) nameOf[t.id] = t.name;
  const groups: CanvasGroup[] = [];
  const seen = new Set<string>();
  for (const vs of vSections) {
    if (!nameOf[vs.section_type_id]) continue;
    seen.add(vs.section_type_id);
    groups.push({ sectionTypeId: vs.section_type_id, name: nameOf[vs.section_type_id],
      comps: comps.filter((c) => c.section_type_id === vs.section_type_id) });
  }
  for (const c of comps) {
    if (c.section_type_id && !seen.has(c.section_type_id) && nameOf[c.section_type_id]) {
      seen.add(c.section_type_id);
      groups.push({ sectionTypeId: c.section_type_id, name: nameOf[c.section_type_id],
        comps: comps.filter((x) => x.section_type_id === c.section_type_id) });
    }
  }
  const unsectioned = comps.filter((c) => !c.section_type_id || !nameOf[c.section_type_id]);
  if (unsectioned.length) groups.push({ sectionTypeId: null, name: "More", comps: unsectioned });

  async function addSectionType(sid: string) {
    await supabase.from("version_sections").upsert({ version_id: versionId, section_type_id: sid, position: vSections.length });
    setSectionPicker(false); loadCanvas();
  }
  async function removeSection(g: CanvasGroup) {
    if (!g.sectionTypeId) return;
    if (g.comps.length && !confirm(`Remove "${g.name}" and its ${g.comps.length} component(s) from this proposal?`)) return;
    for (const c of g.comps) await supabase.from("event_components").delete().eq("id", c.id);
    await supabase.from("version_sections").delete().eq("version_id", versionId).eq("section_type_id", g.sectionTypeId);
    loadCanvas();
  }
  async function moveSection(g: CanvasGroup, dir: -1 | 1) {
    if (!g.sectionTypeId) return;
    const ordered = vSections.filter((v) => nameOf[v.section_type_id]);
    const idx = ordered.findIndex((v) => v.section_type_id === g.sectionTypeId);
    const other = ordered[idx + dir];
    if (!other) return;
    await Promise.all([
      supabase.from("version_sections").update({ position: other.position }).eq("version_id", versionId).eq("section_type_id", g.sectionTypeId),
      supabase.from("version_sections").update({ position: ordered[idx].position }).eq("version_id", versionId).eq("section_type_id", other.section_type_id),
    ]);
    loadCanvas();
  }
  async function addComponentIn(sectionTypeId: string | null) {
    const title = prompt("Component title — e.g. Sushi Station, Uplighting");
    if (!title?.trim() || !b) return;
    const { error } = await supabase.from("event_components").insert({
      booking_id: b.id, proposal_version_id: versionId, domain: "food",
      title: title.trim(), position: comps.length, section_type_id: sectionTypeId,
    });
    if (error) setErr(error.message); else loadCanvas();
  }
  async function setCompSection(compId: string, sectionTypeId: string | null) {
    await supabase.from("event_components").update({ section_type_id: sectionTypeId }).eq("id", compId);
    loadCanvas();
  }
  // ── Component groups (bands) ── matching is trimmed + case-insensitive.
  const normLabel = (l: string | null | undefined) => (l ?? "").trim().toLowerCase();
  async function assignGroup(compId: string, rawLabel: string) {
    const label = rawLabel.trim();
    // Inherit the band's existing position (min among members) so the newcomer
    // lands in the right band, not at position 0.
    const members = comps.filter((c) => normLabel(c.group_label) === label.toLowerCase() && label);
    const pos = members.length ? Math.min(...members.map((m) => m.group_position)) : comps.length;
    await supabase.from("event_components").update({ group_label: label || null, group_position: pos }).eq("id", compId);
    loadCanvas();
  }
  async function renameBand(oldLabel: string, section: string | null, newLabel: string) {
    // Rename every member sharing (section + normalized label).
    const targets = comps.filter((c) => (c.section_type_id ?? "") === (section ?? "") && normLabel(c.group_label) === oldLabel.toLowerCase());
    for (const c of targets) await supabase.from("event_components").update({ group_label: newLabel.trim() || null }).eq("id", c.id);
    loadCanvas();
  }
  async function setBandDescription(members: CompRow[], desc: string) {
    // First-non-empty is the band's value; edits SYNC all members.
    for (const c of members) await supabase.from("event_components").update({ group_description: desc || null }).eq("id", c.id);
    loadCanvas();
  }

  if (caps && !caps.proposals) {
    return <main className="max-w-lg mx-auto px-6 py-20 text-center">
      <div className="text-4xl mb-3">🎨</div>
      {/* v196 vocabulary sweep: the name has been lying since the One-Stage
          Doctrine. The Proposal is ONE lens's emission, not the workspace. */}
      <h1 className="font-display font-bold text-xl mb-2">Event Studio</h1>
      <p className="text-sm text-slate-500">Part of the proposal-driven toolset — enable it under Configuration → Business Model.</p>
    </main>;
  }
  if (!b || !version || !proposal) {
    return <main className="px-6 py-10"><p className="text-sm text-slate-400">{err || "Opening Studio…"}</p></main>;
  }

  const flow = VERSION_FLOW.find((f) => f.value === version.status);

  return (
    <main className="h-[calc(100vh-0px)] flex flex-col bg-[#F6F8FB]">
      {/* ── v196 shell: Library (global, learned tense) then the lens bar
           (event-scoped). The existing header below is untouched — it already
           carries title/version/contact/date, and a second event strip would
           be one truth rendered twice. ── */}
      {/* ── v217 THE LINE (STUDIO_COMPOSITION §2) — the one bar. The v213
           docked strip died here: knowledge is summoned (the row while you
           type, the Shade on ⌘K), never resident. ── */}
      <StudioLine
        session={session}
        backHref={`/bookings/${b.id}`}
        title={proposal.title}
        contactLine={[b.contact_name, b.event_type, b.event_date ? fmtDate(b.event_date) : null, `#${b.invoice_num}`].filter(Boolean).join(" · ")}
        versions={versions.map((v) => ({ id: v.id, label: `v${v.version}` }))}
        versionId={version.id}
        onVersion={(id) => { window.location.href = `/bookings/${b.id}/studio/${id}`; }}
        flow={flow ? { label: flow.label, color: flow.color, value: flow.value } : null}
        onVersionAction={!locked && session?.perms.includes("bookings.edit") ? (action) => {
          // v237 — the disposal ruling wired to EXISTING machinery: version-
          // scoped only; the proposal and its other versions are untouchable
          // from here; lifecycle gates live in the menu AND in the verbs.
          if (action === "duplicate") { void commitGenesis(() => createVersion(b, proposal, version)); }
          else if (action === "reset-presentation") {
            if (!confirm("Reset this version's presentation? The look falls back to Brand + Theme; content is untouched.")) return;
            setPubThemeKey(null); setPubOverride(null); setPubPins(null); setPubDirty(false);
            void supabase.from("proposal_versions")
              .update({ theme_key: null, theme_override: null, photo_pins: null }).eq("id", version.id)
              .then(() => setToast("🎨 Presentation reset — wearing the company look"));
          }
          else if (action === "archive") {
            const reason = prompt("Archive this draft? It stays in the thread, decorated in place. Reason (optional):");
            if (reason === null) return;
            void archiveVersion(b, version, reason).then((r) => {
              if (!r.ok) setErr(r.detail ?? "Archive failed"); else setToast("🗄 Draft archived");
            });
          }
          else if (action === "delete") {
            if (!confirm("Delete this draft permanently? This cannot be undone. Other versions and the proposal are untouched.")) return;
            void deleteVersionPermanently(b, version, proposal).then((r) => {
              if (!r.ok) { setErr(r.detail ?? "Delete refused"); return; }
              const other = versions.filter((x) => x.id !== version.id)[0];
              window.location.href = other ? `/bookings/${b.id}/studio/${other.id}` : `/bookings/${b.id}`;
            });
          }
        } : undefined}
        locked={locked}
        ask={ask}
        onAsk={setAsk}
        onOpenShade={() => { setAsk(""); setLibraryOpen(true); }}
        lenses={lenses}
        active={lens}
        onSelect={(k) => { setTab("build"); setLens(k); }}
        obligations={obligations}
        xray={xray}
        onXray={setXray}
        lensControls={lensEdits(activeLensDef, "presentation") ? (
          <PresentationControls
            openRoom={pubRoom}
            dirty={pubDirty}
            busy={pubBusy}
            canEdit={!locked && !!session?.perms.includes("bookings.edit")}
            onOpenRoom={(r) => { setPubSection(null); setPubRoom(r); }}
            onClose={() => setPubRoom(null)}
            onSave={() => void savePublication()}
            onDiscard={() => {
              setPubThemeKey((version?.theme_key as string | null) ?? null);
              setPubOverride((version?.theme_override as ThemeDelta | null) ?? null);
              setPubPins((version?.photo_pins as PhotoPins | null) ?? null);
              setPubDirty(false);
            }}
          />
        ) : null}
        split={split}
        onSplit={setSplit}
        desk={[
          { key: "blueprint", label: "📐 Save as Blueprint", disabled: busy || comps.length === 0,
            onPick: async () => {
              const name = prompt('Blueprint name — e.g. "Elegant Wedding", "Backyard BBQ"',
                b.event_type ? `${b.event_type} — ${proposal.title}` : proposal.title);
              if (!name?.trim()) return;
              const r = await promoteToBlueprint(b, version, proposal.title, name, b.event_type ?? null);
              if (!r.ok) setErr(r.detail ?? ""); else setToast(`📐 "${name.trim()}" saved as a blueprint`);
            } },
          ...(!locked && versions.length > 0 ? [{ key: "newversion", label: "＋ New Version", disabled: busy,
            onPick: async () => {
              const [bps, compRows] = await Promise.all([
                listBlueprints(),
                supabase.from("event_components").select("proposal_version_id").eq("booking_id", b.id),
              ]);
              const counts: Record<string, number> = {};
              for (const r of (compRows.data ?? []) as { proposal_version_id: string | null }[]) {
                if (r.proposal_version_id) counts[r.proposal_version_id] = (counts[r.proposal_version_id] ?? 0) + 1;
              }
              setGenesis({ blueprints: bps.map((x) => ({ id: x.id, name: x.name })), counts });
            } }] : []),
          { key: "notes", label: "🗒 Notes", onPick: () => setTab("notes") },
          { key: "files", label: "📎 Files", onPick: () => setTab("files") },
        ]}
      />
      {/* ── the Summon row: the registry's rails inline beneath the Line while
           you type, the Paper visible beneath — UI_GRAMMAR §12's Ctrl+K
           citizen, honored literally. The full Shade is ⌘K. ── */}
      {ask.trim().length > 0 && !libraryOpen && (
        <div data-summon-row className="shrink-0 max-h-[34vh] overflow-y-auto shadow-sm border-b border-[#E7EDF5]">
          <LibraryBrowser
            docked
            chromeless
            externalQuery={ask}
            open={true}
            onClose={() => setAsk("")}
            onViewDefinition={(definitionId, name) => void openDefinition(definitionId, name)}
            onLandDesign={(id, name) => { setAsk(""); void openLanding(id, name); }}
            onInstantiate={(identityId, name) => {
              setAsk("");
              if (targetChapter) { instantiate(identityId, name, targetChapter); return; }
              setAskChapterFor({ identityId, name });   // ask; never guess
            }}
          />
        </div>
      )}
      {libraryOpen && (
        <LibraryBrowser
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onViewDefinition={(definitionId, name) => void openDefinition(definitionId, name)}
          onLandDesign={(id, name) => { setLibraryOpen(false); void openLanding(id, name); }}
          onInstantiate={(identityId, name) => {
            setLibraryOpen(false);
            if (targetChapter) { instantiate(identityId, name, targetChapter); return; }
            setAskChapterFor({ identityId, name });
          }}
        />
      )}

      {sectionPicker && (
        <SectionPicker
          types={sectionTypes}
          present={vSections}
          busy={busy}
          onPick={(sid) => void addSectionType(sid)}
          onCreate={(name) => void (async () => {
            const maxPos = sectionTypes.reduce((m, t) => Math.max(m, t.position), 0);
            const created = await createSectionType(name, maxPos);
            if (!created) { setErr("Could not create that section type."); return; }
            setSectionTypes((prev) => prev.concat([created]));
            await addSectionType(created.id);
          })()}
          onCancel={() => setSectionPicker(false)}
        />
      )}


      {lens === "customer" && pubSection && stage && (
        <TreatmentToolbar
          selection={pubSection === "__document__"
            ? { kind: "document" }
            : pubSection.indexOf("items:") === 0
            ? { kind: "item", id: pubSection.slice(6),
                name: (() => { const cid = pubSection.slice(6);
                  for (const sec of stage.sections) for (const b of sec.bands)
                    for (const c of b.components) if (c.id === cid) return c.title + " · items";
                  return "Items"; })() }
            : pubSection.indexOf("comp:") === 0
            ? { kind: "component", id: pubSection.slice(5),
                name: (() => { const cid = pubSection.slice(5);
                  for (const sec of stage.sections) for (const b of sec.bands)
                    for (const c of b.components) if (c.id === cid) return c.title;
                  return "Component"; })() }
            : { kind: "section", id: pubSection,
                name: (stage.sections.filter((x) => x.id === pubSection)[0]?.name) ?? "Section" }}
          resolved={resolvedPub}
          onPatch={patchPub}
          onChoosePhoto={() => {
            setPubFocusSlot(pubSection); setPubSection(null); setPubRoom("photography");
          }}
          onClose={() => setPubSection(null)}
        />
      )}

      {genesis && (
        <VersionGenesis
          reviseTarget={{
            label: `Revise v${version.version} — the version you're viewing`,
            blurb: `Copies everything on v${version.version} into a new draft.`,
          }}
          otherVersions={versions.filter((v) => v.id !== version.id).slice().reverse().map((v) => ({
            id: v.id, label: `v${v.version}`,
            statusLabel: VERSION_FLOW.find((f) => f.value === v.status)?.label ?? v.status,
            date: new Date(v.created_at).toLocaleDateString(),
            count: genesis.counts[v.id] ?? 0,
          }))}
          blueprints={genesis.blueprints}
          busy={genesisBusy}
          onRevise={() => void commitGenesis(() => createVersion(b, proposal, version))}
          onCopyVersion={(vid) => {
            const src = versions.filter((v) => v.id === vid)[0];
            if (src) void commitGenesis(() => createVersion(b, proposal, src));
          }}
          onBlank={() => void commitGenesis(() => createBlankVersion(b, proposal))}
          onBlueprint={(bpId) => void commitGenesis(async () => {
            const made = await createBlankVersion(b, proposal);
            if (!made.ok || !made.id) return made;
            const bp = await getBlueprint(bpId);
            if (!bp) return { ok: false, detail: "That blueprint's row is gone." };
            const applied = await applyBlueprint(b, made.id, bp);
            return applied.ok ? { ok: true, id: made.id } : { ok: false, detail: applied.detail };
          })}
          onCancel={() => setGenesis(null)}
        />
      )}

      {landing && (
        <LandingDecision
          name={landing.bp.name}
          preview={landing.preview}
          busy={landingBusy}
          onAdd={() => void commitLanding(() => applyBlueprint(b, versionId, landing.bp), `"${landing.bp.name}" added to current`)}
          onReplace={() => void commitLanding(() => replaceWithBlueprint(b, versionId, landing.bp), `Draft replaced with "${landing.bp.name}"`)}
          onChoose={(ids) => void commitLanding(() => applyBlueprintSubset(b, versionId, landing.bp, ids), `${ids.length} chosen from "${landing.bp.name}"`)}
          onCancel={() => setLanding(null)}
        />
      )}

      {promoView && (
        <div className="fixed inset-0 z-50 bg-black/20 flex items-start justify-center pt-8"
             onClick={() => setPromoView(null)}>
          <div className="w-[600px] max-h-[85vh] overflow-y-auto rounded-lg shadow-xl"
               onClick={(e) => e.stopPropagation()}>
            <PromotionReview
              definitionId={promoView.definitionId} name={promoView.name}
              liveRevisionId={promoView.liveRevisionId} liveDoc={promoView.liveDoc}
              schemaVersion={promoView.schemaVersion}
              eventCount={promoView.evidence.eventCount}
              lines={promoView.evidence.lines} annotations={promoView.evidence.annotations}
              author={supabaseAuthorAdapter}
              sessionKey={reviewSessionKey}
              onAuthored={() => { setPromoView(null); setToast("✓ Promoted — the definition carries it forward; no event moved."); }}
              onClose={() => setPromoView(null)} />
          </div>
        </div>
      )}
      {defView && (
        <div className="fixed inset-0 z-50 bg-black/20 flex items-start justify-center pt-10"
             onClick={() => setDefView(null)}>
          <div className="w-[520px] max-h-[80vh] overflow-y-auto rounded-lg shadow-xl"
               onClick={(e) => e.stopPropagation()}>
            <DefinitionView
              definitionId={defView.definitionId} name={defView.name}
              liveRevisionId={defView.liveRevisionId} liveDoc={defView.liveDoc}
              schemaVersion={defView.schemaVersion} ledger={defView.ledger}
              canCurate={!locked && currentCan()("knowledge.curate")}
              author={supabaseAuthorAdapter}
              onAuthored={() => void openDefinition(defView.definitionId, defView.name)}
              onOpenPromotion={() => { const dv = defView; setDefView(null); void openPromotion(dv.definitionId, dv.name); }}
              onClose={() => setDefView(null)} />
          </div>
        </div>
      )}

      {askChapterFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
             onClick={() => setAskChapterFor(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] font-semibold mb-1">Where should “{askChapterFor.name}” go?</p>
            <p className="text-[11px] text-slate-400 mb-3">Select a chapter first, or drag it to aim precisely.</p>
            <div className="space-y-1">
              {designChapters.map((ch) => (
                <button key={ch.id}
                  onClick={() => { instantiate(askChapterFor.identityId, askChapterFor.name, ch.id); setAskChapterFor(null); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-[13px] hover:bg-[#F4F9FF]">
                  {ch.name}
                </button>
              ))}
            </div>
            <button onClick={() => setAskChapterFor(null)}
              className="mt-3 text-[11px] text-slate-400 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}

      {/* ── v217: the old two-row header died into the Line. When a Desk
           surface (notes/files) is open, one slim bar offers the way
           back to the Paper. ── */}
      {tab !== "build" && (
        <div className="shrink-0 bg-white border-b border-[#E7EDF5] px-4 py-1.5 flex items-center gap-2">
          <button data-back-to-paper onClick={() => setTab("build")}
            className="text-[12px] font-semibold text-slate-500 hover:text-[#102F56]">‹ Back to the paper</button>
          <span className="text-[11px] text-slate-400 capitalize">{tab}</span>
        </div>
      )}
      {toast && <div className="shrink-0 bg-[#F0FDF4] border-b border-[#BBF7D0] text-[#166534] text-xs font-semibold px-5 py-1.5">{toast}</div>}
      {err && <div className="shrink-0 bg-red-50 border-b border-red-200 text-red-700 text-xs px-5 py-1.5">⚠️ {err} <button className="underline" onClick={() => setErr("")}>dismiss</button></div>}

      {/* ── Body ── */}
      {/* ══ v217 THE STAGE (STUDIO_COMPOSITION §1/§3) — one artifact,
           centered, dominant. Every lens turns the WHOLE Paper; the Second
           Sheet is two whole papers by request; the Inspector is a drawer
           that lives as long as the selection; the Outline is margin ghosts.
           The grid of three columns died here. ══ */}
      {tab === "build" && (
        <div className="flex-1 min-h-0 overflow-y-auto relative" style={{ background: "#E9EDF3" }} data-stage>
          {/* margin ghosts — Design's lens-owned outline, subordinated (§4) */}
          {lens === "design" && (
            <GhostOutline
              open={ghostOpen}
              onOpen={setGhostOpen}
              onTravel={(chId) => {
                setGhostOpen(false); setFocusedId(chId);
                const el = document.querySelector(`[data-chapter='${chId}']`);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              ticks={outlineFromDesignChapters(designChapters, true).map((n) => ({
                id: n.id, label: n.label, debt: n.debt ?? 0 }))}
              panel={
                <DesignOutline
                  nodes={outlineFromDesignChapters(designChapters, true)}
                  selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setGhostOpen(false); }}
                  focusedId={focusedId} onFocus={setFocusedId} xray={true}
                />
              }
            />
          )}

          {/* v230 — THE ROOM RESHAPES THE WORKSPACE (§6.1): Room | Paper.
               The paper contracts and stays fully visible; never obscured. */}
          {(() => { const inspectorWing = tab === "build" && !!inspected && lensEdits(activeLensDef, "content"); return (
          <div data-stage-body
            className={(pubRoom && lens === "customer") || inspectorWing ? "grid gap-6 px-6" : split ? "grid grid-cols-2 gap-6 px-6" : "px-6"}
            style={pubRoom && lens === "customer"
              ? { gridTemplateColumns: split ? "minmax(260px,320px) 1fr 1fr" : "minmax(280px,360px) 1fr" }
              : inspectorWing
              ? { gridTemplateColumns: split ? "1fr 1fr minmax(280px,360px)" : "1fr minmax(300px,380px)" }
              : undefined}>
            {pubRoom && lens === "customer" && (
              <PresentationRoomRegion openRoom={pubRoom}
                onOpenRoom={(r) => { setPubSection(null); setPubRoom(r); }}
                onClose={() => setPubRoom(null)}>
                {pubRoom === "photography" ? (
                  <PhotographyRoom
                    slots={[{ id: "__document__", name: (stage?.title ?? "Document") }]
                      .concat((stage?.sections ?? []).map((x) => ({ id: x.id, name: x.name })))
                      .concat((stage?.sections ?? []).flatMap((sec) => sec.bands.flatMap(
                        (b) => b.components.map((c) => ({ id: "comp:" + c.id, name: c.title })))))}
                    library={pubLibrary}
                    pins={pubPins}
                    focusSlot={pubFocusSlot}
                    onPin={(slot, ph) => { setPubPins((prev) => pinPhoto(prev, slot, ph)); setPubDirty(true); }}
                    onUnpin={(slot) => { setPubPins((prev) => unpinPhoto(prev, slot)); setPubDirty(true); }}
                  />
                ) : (
                <PresentationRooms
                  room={pubRoom}
                  tenantThemes={pubTenantThemes.map((t) => ({ id: t.id, name: t.name }))}
                  themeKey={pubThemeKey}
                  override={pubOverride}
                  resolved={resolvedPub}
                  onThemeKey={(k) => { setPubThemeKey(k); setPubDirty(true); }}
                  onPatch={patchPub}
                />
                )}
              </PresentationRoomRegion>
            )}
            {/* ── THE PAPER — first (and usually only) sheet ── */}
            <main data-paper className={`bg-white rounded-[4px] ring-1 ring-black/5 my-10 min-h-[70vh] ${split ? "" : "max-w-[840px] mx-auto"}`}
              style={dropHot ? { outline: "2px dashed #C9A34E", outlineOffset: -4, boxShadow: PAPER_SHADOW } : { boxShadow: PAPER_SHADOW }}
              onDragOver={(e) => {
                if (lens !== "design") return;
                const accepted = canvasDragMimes().concat(["text/eventcore-component"]);
                for (const m of accepted) {
                  if (e.dataTransfer.types.includes(m)) { e.preventDefault(); setDropHot(true); return; }
                }
              }}
              onDragLeave={() => setDropHot(false)}
              onDrop={(e) => {
                if (lens !== "design") return;
                setDropHot(false);
                const bpRaw = e.dataTransfer.getData("text/eventcore-blueprint");
                if (bpRaw) {
                  e.preventDefault();
                  try { const d = JSON.parse(bpRaw); void openLanding(d.blueprintId, d.name); } catch {}
                  return;
                }
                const ident = e.dataTransfer.getData("text/eventcore-identity");
                if (ident) {
                  e.preventDefault();
                  try { const d = JSON.parse(ident); instantiate(d.identityId, d.name, dropChapter); } catch {}
                  return;
                }
                const raw = e.dataTransfer.getData("text/eventcore-component");
                if (!raw) return;
                e.preventDefault();
                try { const d = JSON.parse(raw); addFromSource([d.id], d.label); } catch {}
              }}
            >
              {/* the Design edition: the same document, x-ray ink — grammar verbatim */}
              {lens === "design" && (
                <div className="px-6 py-8 sm:px-10">
                <DesignStage
                  chapters={designChapters}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  focusedId={focusedId}
                  xray={true}
                  mayEdit={!locked && !!session?.perms.includes("bookings.edit")}
                  onPatchComponent={(id, patch) => patchComp(id, patch as Partial<CompRow>)}
                  onPatchItem={(id, patch) => patchItem(id, patch as Partial<PricedItem>)}
                  onAddComponent={(chapterId) => addComponentIn(chapterId === "__none__" ? null : chapterId)}
                  onAddChapter={() => setSectionPicker(true)}
                  onComponentAction={(compId) => {
                    const c = comps.filter((x) => x.id === compId)[0];
                    if (c) void deleteComp(c).then(() => { if (selectedId === compId) setSelectedId(null); });
                  }}
                  onItemAction={(itemId) => {
                    void deleteItem(itemId).then(() => { if (selectedId === itemId) setSelectedId(null); });
                  }}
                  onChapterAction={(chId, action) => {
                    const g = { sectionTypeId: chId,
                      name: (sectionTypes.filter((t) => t.id === chId)[0]?.name) ?? "this moment",
                      comps: comps.filter((c) => c.section_type_id === chId) };
                    if (action === "remove") void removeSection(g);
                    else void moveSection(g, action === "up" ? -1 : 1);
                  }}
                  onAddItem={(compId, categoryKey) => void addItem(compId, categoryKey)}
                  money={money}
                  onDrop={applyDrop}
                />
                </div>
              )}
              {lens === "customer" && (
                stage
                  ? <ProposalRenderer model={stage} xray={xray} draftRibbon theme={resolvedPub} regions={pubWords} company={pubCompany} photos={pubPins}
                      onSectionSelect={!locked && session?.perms.includes("bookings.edit") && lensSelects(activeLensDef, "section")
                        ? (sid) => { setPubRoom(null); setPubSection(sid === pubSection ? null : sid); }
                        : undefined}
                      onDocumentSelect={!locked && session?.perms.includes("bookings.edit") && lensSelects(activeLensDef, "document")
                        ? () => { setPubRoom(null); setPubSection(pubSection === "__document__" ? null : "__document__"); }
                        : undefined}
                      onComponentSelect={!locked && session?.perms.includes("bookings.edit") && lensSelects(activeLensDef, "component")
                        ? (cid) => { setPubRoom(null); setPubSection(pubSection === "comp:" + cid ? null : "comp:" + cid); }
                        : undefined}
                      onItemsSelect={!locked && session?.perms.includes("bookings.edit") && lensSelects(activeLensDef, "item")
                        ? (cid) => { setPubRoom(null); setPubSection(pubSection === "items:" + cid ? null : "items:" + cid); }
                        : undefined}
                      selectedItemsId={pubSection?.indexOf("items:") === 0 ? pubSection.slice(6) : null}
                      selectedComponentId={pubSection?.indexOf("comp:") === 0 ? pubSection.slice(5) : null}
                      selectedSectionId={pubSection}
                      documentSelected={pubSection === "__document__"} />
                  : <p className="text-center text-[12px] text-slate-400 py-16">Nothing to show on this lens yet.</p>
              )}
              {lens === "production" && (
                prodModel
                  ? <ProductionSheet model={prodModel} />
                  : <p className="text-center text-[12px] text-slate-400 py-16">Loading production…</p>
              )}
              {lens !== "design" && lens !== "customer" && lens !== "production" && (
                <p className="text-center text-[12px] text-slate-400 py-16">This lens has no renderer yet.</p>
              )}
            </main>

            {/* ── THE SECOND SHEET — a whole paper, summoned (§8/§9) ── */}
            {split && (
              <div className="my-8 min-h-[60vh] bg-white rounded-[4px] ring-1 ring-black/5 overflow-hidden flex flex-col"
                style={{ boxShadow: PAPER_SHADOW }} data-paper-second>
                {liveLensKey.slice(0, 2) === "v:" && (
                  <div data-sheet-diff className="shrink-0 px-4 py-1 text-[10.5px] tabular-nums text-slate-500 bg-[#FAFBFD] border-b border-[#EEF2F7]">
                    {sheetDiff ? `vs v${version.version}: ${formatVersionDiff(sheetDiff, money)}` : "comparing\u2026"}
                  </div>
                )}
                <div className="flex-1 min-h-0">
                <SecondSheet
                  options={liveOptions}
                  onSheetLens={setLiveLensKey}
                  projections={{
                    customer: liveStage ? <ProposalRenderer model={liveStage} xray={false} draftRibbon theme={resolvedPub} /> : null,
                    production: prodModel ? <ProductionSheet model={prodModel} /> : null,
                    [liveLensKey]: liveLensKey.slice(0, 2) === "v:"
                      ? (sheetVersionModel ? <ProposalRenderer model={sheetVersionModel} xray={false} /> : null)
                      : (liveLensKey === "customer"
                          ? (liveStage ? <ProposalRenderer model={liveStage} xray={false} draftRibbon /> : null)
                          : (liveLensKey === "production" ? (prodModel ? <ProductionSheet model={prodModel} /> : null) : null)),
                  }}
                  emptyReasons={{
                    customer: "Nothing composed yet — the proposal appears here as you build.",
                    production: "No production facts yet — quantities appear as the design takes shape.",
                    [liveLensKey]: liveLensKey.slice(0, 2) === "v:"
                      ? "Summoning that version\u2026"
                      : (liveLensKey === "customer"
                          ? "Nothing composed yet — the proposal appears here as you build."
                          : "No production facts yet — quantities appear as the design takes shape."),
                  }}
                />
                </div>
              </div>
            )}
            {/* ── THE INSPECTOR WING (v237) — the hinge is the paper. ── */}
            {inspectorWing && inspected && (
              <InspectorRegion
                subjectLabel={(inspected as { title?: string }).title ?? "Selection"}
                onClose={() => setSelectedId(null)}>
          <Inspector
            selection={inspected}
            facetOrder={activeLensDef?.inspects}
            canEdit={!locked && !!session?.perms.includes("bookings.edit") && lensEdits(activeLensDef, "content")}
            canSeeCost={!!session?.perms.includes("bookings.edit")}
            money={money}
            onConfirmPrice={lensEdits(activeLensDef, "pricing")
              ? (id, amount) => patchItem(id, { unit_price: amount, price_confirmed: true })
              : undefined}
            configureFacet={cfgState && inspected?.kind === "component" ? (
              <ConfigureFacet
                state={cfgState}
                onState={setCfgState}
                persist={supabasePersistAdapter}
                itemCount={items.filter((i) => i.component_id === inspected.id).length}
                canEdit={!locked && !!session?.perms.includes("bookings.edit")}
                onPromote={currentCan()("knowledge.curate") ? () => {
                  const c = comps.find((x) => x.id === inspected.id);
                  if (c?.definition_id) void openPromotion(c.definition_id, c.title);
                } : undefined}
                backRefs={backRefs}
                onOpenCanvas={() => { /* the canvas is beside us */ }}
              />
            ) : null}
            onRemove={!locked && session?.perms.includes("bookings.edit") && lensEdits(activeLensDef, "content") ? () => {
              if (inspected.kind === "component") {
                const c = comps.filter((x) => x.id === inspected.id)[0];
                if (c) { void deleteComp(c).then(() => setSelectedId(null)); }
              } else if (inspected.kind === "item") {
                void deleteItem(inspected.id).then(() => setSelectedId(null));
              }
            } : undefined}
            removeLabel={inspected.kind === "component" ? "Remove this component from the design…" : "Remove this item…"}
            onLoadMemory={(id) => {
              const it = items.find((x) => x.id === id);
              if (!it) return;
              loadPriceMemory({ name: it.name, catalog_item_id: it.catalog_item_id ?? null, component_id: it.component_id })
                .then((m) => setMemory((prev) => ({ ...prev, [id]: m })));
            }}
            designPanel={null}
          />
              </InspectorRegion>
            )}
          </div>
          ); })()}

          {/* ── THE METER — floating facts; never lies, stores nothing (§10) ── */}
          <Meter
            perPerson={totalGuests > 0 ? money(totals.total / totalGuests) : null}
            totalLabel={b.contact_name || proposal.title}
            total={money(totals.total)}
            debt={totals.unconfirmed + totals.unpriced}
            onDebt={() => {
              const bad = items.filter((i) => i.price_confirmed === false || i.unit_price == null)[0];
              if (bad) setSelectedId(bad.id);
            }}
          />
        </div>
      )}



      {tab === "notes" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Internal notes — v{version.version}</div>
              <textarea className="field w-full !bg-white" rows={8} disabled={!!locked}
                defaultValue={version.notes ?? ""}
                placeholder="Working notes for this version — never shown to the customer."
                onBlur={async (e) => {
                  await supabase.from("proposal_versions").update({ notes: e.target.value || null }).eq("id", version.id);
                  setToast("✓ Notes saved");
                }} />
            </div>

            <div className="border-t border-slate-100 pt-5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Customer presentation</div>
              <label className="flex items-center gap-2 text-[12px] text-slate-600 mb-3">
                Price visibility
                <select className="field !py-1 !text-xs" disabled={!!locked}
                  defaultValue={(version as { price_visibility?: string }).price_visibility ?? "full"}
                  onChange={async (e) => {
                    await supabase.from("proposal_versions").update({ price_visibility: e.target.value }).eq("id", version.id);
                    setToast("✓ Preview updated — reopen to see");
                  }}>
                  <option value="full">Full — every line priced</option>
                  <option value="sections">Sections — subtotals only</option>
                  <option value="hidden">Hidden — no prices</option>
                </select>
              </label>
              <textarea className="field w-full !bg-white mb-2" rows={3} disabled={!!locked}
                defaultValue={(version as { customer_intro?: string | null }).customer_intro ?? ""}
                placeholder="Opening note to the customer (appears at the top of the proposal — cover-letter voice)."
                onBlur={async (e) => { await supabase.from("proposal_versions").update({ customer_intro: e.target.value || null }).eq("id", version.id); setToast("✓ Saved"); }} />
              <textarea className="field w-full !bg-white" rows={3} disabled={!!locked}
                defaultValue={(version as { customer_closing?: string | null }).customer_closing ?? ""}
                placeholder="Closing note (appears at the bottom — thank-you, next steps)."
                onBlur={async (e) => { await supabase.from("proposal_versions").update({ customer_closing: e.target.value || null }).eq("id", version.id); setToast("✓ Saved"); }} />
              <a href={`/bookings/${b.id}/studio/${version.id}/preview`} target="_blank" rel="noopener noreferrer"
                className="inline-block mt-3 text-[12px] font-semibold text-accent-ink hover:underline">👁 Open customer preview →</a>
            </div>
          </div>
        </div>
      )}

      {tab === "files" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <FilesPanel b={b} />
          </div>
        </div>
      )}
    </main>
  );
}
