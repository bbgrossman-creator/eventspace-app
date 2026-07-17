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
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
// (grammar boot lives below imports; see bootMoves())
import { Booking, fmtDate } from "@/lib/workflow";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";
import { resolveTaxForTenant, TaxResolution } from "@/lib/tax";
import StudioShell from "@/components/studio/StudioShell";
import LibraryBrowser from "@/components/studio/LibraryBrowser";
import ConfigureFacet from "@/components/studio/ConfigureFacet";
import { bootMoves } from "@/lib/moves/boot";
import { submitBatch, emptyState, ConfigState } from "@/lib/configure";
import { loadConfigState, supabasePersistAdapter, instantiateComponent } from "@/lib/configureSupabase";
import DefinitionView from "@/components/studio/DefinitionView";
import PromotionReview from "@/components/studio/PromotionReview";
import { loadDefinitionEvidence, DefinitionEvidence } from "@/lib/promotionSupabase";
import { loadDefinition, supabaseAuthorAdapter, LedgerEntry } from "@/lib/curationSupabase";
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
import { visibleLenses, resolveLens, LensKey } from "@/lib/lenses";
import { deriveObligations, ObligationModule, ModuleObligations } from "@/lib/obligations";
import { loadSession, Session } from "@/lib/permissions";
import { PRICING } from "@/lib/pricing";
import { Proposal, ProposalVersion, VERSION_FLOW, createVersion } from "@/lib/proposals";
import {
  GuestCategory, Adjustment, PricedItem, MemoryPoint, PackageLine, isActive,
  loadGuestCategories, loadPriceMemory, computeVersionTotals, promoteToCatalog,
  ChoiceGroupDef,
} from "@/lib/pricingEngine";
import { copyIntoVersion, loadSourceComponents, diffVersions, VersionDiff } from "@/lib/studio";
import { SectionType, loadSectionTypes } from "@/lib/sections";
import { promoteToBlueprint } from "@/lib/blueprints";
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

export default function StudioPage() {
  const params = useParams<{ id: string; versionId: string }>();
  const bookingId = params.id;
  const versionId = params.versionId;

  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [b, setB] = useState<Booking | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [version, setVersion] = useState<ProposalVersion | null>(null);
  const [versions, setVersions] = useState<ProposalVersion[]>([]);
  const [tab, setTab] = useState<"build" | "compare" | "notes" | "files">("build");
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
  const [libraryOpen, setLibraryOpen] = useState(false);
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
  const [compareWith, setCompareWith] = useState<string>("");
  const [diff, setDiff] = useState<VersionDiff | null>(null);

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
  useEffect(() => {
    let live = true;
    const compSel = selectedId && comps.some((c) => c.id === selectedId) ? selectedId : null;
    if (!compSel) { setCfgState(null); return; }
    loadConfigState(compSel).then((st) => { if (live) setCfgState(st); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, comps.length]);

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
  async function runCompare(otherId: string) {
    setCompareWith(otherId);
    if (!otherId) { setDiff(null); return; }
    setBusy(true);
    const totalsFor = async (vid: string) => {
      const { data: c } = await supabase.from("event_components").select("id").eq("proposal_version_id", vid);
      const ids = ((c ?? []) as { id: string }[]).map((x) => x.id);
      if (!ids.length) return 0;
      const [{ data: it }, { data: g }, { data: a }] = await Promise.all([
        supabase.from("component_items").select("id,component_id,name,quantity,quantity_basis,unit_price,applies_to_category_id,catalog_item_id,price_confirmed,pricing_reason,taxable,item_role,selected,presentation_note,show_on_proposal,category_key,choice_group_id,is_default_choice,position,price_state").in("component_id", ids),
        supabase.from("version_guests").select("category_id,count").eq("version_id", vid),
        supabase.from("version_adjustments").select("*").eq("version_id", vid),
      ]);
      return computeVersionTotals((it ?? []) as PricedItem[], (g ?? []) as { category_id: string; count: number }[], (a ?? []) as Adjustment[]).total;
    };
    setDiff(await diffVersions(otherId, versionId, totalsFor));
    setBusy(false);
  }

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
      <div className="shrink-0">
        <StudioShell
          session={session}
          lenses={lenses}
          active={lens}
          onSelect={setLens}
          xray={xray}
          onXray={setXray}
          debtCount={totals.unconfirmed + totals.unpriced}
          obligations={obligations}
          onOpenLibrary={() => setLibraryOpen(true)}
        />
      </div>

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
      <LibraryBrowser
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onViewDefinition={(definitionId, name) => void openDefinition(definitionId, name)}
        onInstantiate={(identityId, name) => {
          if (targetChapter) { instantiate(identityId, name, targetChapter); return; }
          setAskChapterFor({ identityId, name });   // ask; never guess
        }}
      />

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

      {/* ── Header ── */}
      <div className="shrink-0 bg-white border-b border-[#E7EDF5] px-5 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href={`/bookings/${b.id}`} className="text-slate-400 hover:text-slate-600 text-sm">←</Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display font-bold text-[17px] leading-tight truncate">{proposal.title}</h1>
              <select className="field !py-0.5 !px-1.5 !text-xs" value={version.id}
                onChange={(e) => { window.location.href = `/bookings/${b.id}/studio/${e.target.value}`; }}>
                {versions.map((v) => <option key={v.id} value={v.id}>v{v.version}</option>)}
              </select>
              <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ backgroundColor: flow?.color }}>{flow?.label}</span>
              {locked && <span className="text-[10px] font-semibold text-[#166534]">🔒 read-only</span>}
            </div>
            <div className="text-[11px] text-slate-400">
              {b.contact_name}{b.event_type ? ` · ${b.event_type}` : ""}{b.event_date ? ` · ${fmtDate(b.event_date)}` : ""} · #{b.invoice_num}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-lg ring-1 ring-[#E7EDF5] bg-[#F6F8FB] p-0.5">
            {(["build", "compare", "notes", "files"] as const).map((t) => (
              <button key={t}
                className={`px-3 py-1 rounded-md text-[12px] font-bold capitalize transition-colors ${tab === t ? "bg-white text-[#102F56] shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          {comps.length > 0 && (
            <button className="text-xs font-semibold text-slate-500 hover:text-[#102F56] ring-1 ring-[#E7EDF5] rounded-lg px-2.5 py-1.5 transition-colors" disabled={busy}
              title="Promote this version to a reusable blueprint"
              onClick={async () => {
                const name = prompt('Blueprint name — e.g. "Elegant Wedding", "Backyard BBQ"',
                  b.event_type ? `${b.event_type} — ${proposal.title}` : proposal.title);
                if (!name?.trim()) return;
                const r = await promoteToBlueprint(b, version, proposal.title, name, b.event_type ?? null);
                if (!r.ok) setErr(r.detail ?? ""); else setToast(`📐 "${name.trim()}" saved as a blueprint`);
              }}>📐 Save as Blueprint</button>
          )}
          {comps.length > 0 && (
            <a href={`/bookings/${b.id}/studio/${version.id}/preview`} target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold text-slate-500 hover:text-[#102F56] ring-1 ring-[#E7EDF5] rounded-lg px-2.5 py-1.5 transition-colors"
              title="See the customer-facing view">👁 Preview</a>
          )}
          {!locked && versions.length > 0 && (
            <button className="btn-primary !py-1.5 !px-3 text-xs" disabled={busy}
              onClick={async () => {
                const latest = versions[versions.length - 1];
                setBusy(true);
                const r = await createVersion(b, proposal, latest);
                setBusy(false);
                if (r.ok && r.id) window.location.href = `/bookings/${b.id}/studio/${r.id}`;
              }}>＋ New Version</button>
          )}
        </div>
      </div>

      {toast && <div className="shrink-0 bg-[#F0FDF4] border-b border-[#BBF7D0] text-[#166534] text-xs font-semibold px-5 py-1.5">{toast}</div>}
      {err && <div className="shrink-0 bg-red-50 border-b border-red-200 text-red-700 text-xs px-5 py-1.5">⚠️ {err} <button className="underline" onClick={() => setErr("")}>dismiss</button></div>}

      {/* ── Body ── */}
      {tab === "build" && (
        <div className="flex-1 min-h-0 grid grid-cols-[280px_1fr_300px] gap-0">
          {/* LEFT — the Outline. A lens-owned projection (banked correction:
               a Layout lens's outline is rooms ▸ zones ▸ stations). It
               NAVIGATES; it never drives. Its own scroll. */}
          <div className="border-r border-[#E7EDF5] bg-white min-h-0 overflow-y-auto">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 sticky top-0 bg-white border-b border-[#EEF2F7]">
              Outline
            </div>
            {/* Each lens's outline projects from THAT LENS'S model — never
                from another's. Design's rail carries real database ids so a
                click addresses the same object the Stage rendered; Customer's
                carries its own. Building one from the other was the bug: two
                projections of one truth that disagreed about identity. */}
            {lens === "design" && designChapters.length > 0 && (
              <DesignOutline
                nodes={outlineFromDesignChapters(designChapters, true)}
                selectedId={selectedId} onSelect={setSelectedId}
                focusedId={focusedId} onFocus={setFocusedId} xray={true}
              />
            )}
            {lens === "customer" && stage && (
              <DesignOutline
                nodes={outlineFromModel(stage)}
                selectedId={selectedId} onSelect={setSelectedId}
                focusedId={focusedId} onFocus={setFocusedId} xray={xray}
              />
            )}
            {((lens === "design" && !designChapters.length) || (lens === "customer" && !stage)) && (
              <p className="px-3 py-6 text-[12px] text-center text-slate-400">Nothing composed yet.</p>
            )}
          </div>

          {/* CENTER — THE STAGE. One Stage; the active lens decides the
               rendering (§III.4: a lens may change the rendering, never the
               scope — both render the WHOLE Design). Its own vertical scroll,
               which is the bug this rebuild exists to fix: the renderer used
               to sit ABOVE 700 lines of component forms, so the page scrolled
               and the Stage never did. */}
          <div className="min-h-0 overflow-y-auto bg-white"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("text/eventcore-identity")
                || e.dataTransfer.types.includes("text/eventcore-component")) { e.preventDefault(); setDropHot(true); }
            }}
            onDragLeave={() => setDropHot(false)}
            onDrop={(e) => {
              setDropHot(false);
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
            style={dropHot ? { outline: "2px dashed #C9A34E", outlineOffset: -4 } : undefined}
          >
            {lens === "design" && (
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
                onAddItem={(compId, categoryKey) => void addItem(compId, categoryKey)}
                money={money}
                onDrop={applyDrop}
              />
            )}
            {lens === "customer" && (
              <div className="bg-[#EEF2F7] p-4 min-h-full">
                {stage
                  ? <div className="shadow-lg rounded-lg overflow-hidden"><ProposalRenderer model={stage} xray={xray} draftRibbon /></div>
                  : <p className="text-center text-[12px] text-slate-400 py-8">Nothing to show on this lens yet.</p>}
              </div>
            )}
            {lens !== "design" && lens !== "customer" && (
              <p className="text-center text-[12px] text-slate-400 py-16">
                This lens has no renderer yet.
              </p>
            )}
          </div>

          {/* RIGHT — THE INSPECTOR. Replaces the Live Quote panel for the
               lenses that have a Stage: that panel showed THE VERSION'S MONEY
               where THE SELECTION'S TRUTH belongs, which left the field rule
               enforced from one side only. The old panel survives for lenses
               with no Stage yet. */}
          {(lens === "design" || lens === "customer") ? (
            <div className="border-l border-[#E7EDF5] bg-white min-h-0">
              <Inspector
                selection={inspected}
                lens={lens}
                canEdit={!locked && !!session?.perms.includes("bookings.edit")}
                // Cost is role-gated and never reaches the Stage — a
                // salesperson screen-shares the Stage. Perms, never role.
                canSeeCost={!!session?.perms.includes("bookings.edit")}
                money={money}
                onConfirmPrice={(id, amount) => patchItem(id, { unit_price: amount, price_confirmed: true })}
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
                    onOpenCanvas={() => { /* the canvas is beside us */ }}
                  />
                ) : null}
                onLoadMemory={(id) => {
                  const it = items.find((x) => x.id === id);
                  if (!it) return;
                  loadPriceMemory({ name: it.name, catalog_item_id: it.catalog_item_id ?? null, component_id: it.component_id })
                    .then((m) => setMemory((prev) => ({ ...prev, [id]: m })));
                }}
                designPanel={
                  <div className="px-3 py-3">
                    <p className="text-[11px] text-slate-400 mb-2">
                      Guests, adjustments and totals are the Design&apos;s context.
                    </p>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span className="text-slate-500">Total</span>
                      <span className="font-semibold tabular-nums" style={{ color: "#102F56" }}>{money(totals.total)}</span>
                    </div>
                    {(totals.unconfirmed > 0 || totals.unpriced > 0) && (
                      <p className="text-[11px] text-amber-600 mt-2">
                        ⚠ {totals.unconfirmed + totals.unpriced} unresolved — click ⚠ in the lens bar
                      </p>
                    )}
                  </div>
                }
              />
            </div>
          ) : null}

          {/* Legacy panel — only for lenses without a Stage. */}
          {(lens !== "design" && lens !== "customer") && (
          <>
          {/* RIGHT — persistent intelligence */}
          <div className="border-l border-[#E7EDF5] bg-white min-h-0 overflow-y-auto p-4 space-y-4">
            {/* Live Quote */}
            <div className="rounded-xl ring-1 ring-[#E7EDF5] p-3.5" style={{ background: "linear-gradient(180deg,#FFFFFF, #F8FBFF)" }}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Live Quote</div>
              {hasOptions ? (
                <div className="space-y-1 text-[13px]">
                  <div className="flex justify-between"><span className="text-slate-500">Base</span><b>{money(totals.baseSubtotal)}</b></div>
                  <div className="flex justify-between"><span className="text-slate-500">With selected options</span><b>{money(totals.itemsSubtotal)}</b></div>
                  {totals.upside > 0 && (
                    <div className="flex justify-between text-[#15803D]"><span>Potential upside</span><b>+{money(totals.upside)}</b></div>
                  )}
                </div>
              ) : (
                <div className="flex justify-between text-[13px]"><span className="text-slate-500">Items</span><b>{money(totals.itemsSubtotal)}</b></div>
              )}
              <div className="border-t border-[#EDF2F9] mt-2 pt-2 space-y-1 text-[12px]">
                {adjs.map((a) => (
                  <div key={a.id} className="flex justify-between text-slate-500">
                    <span>{a.label}{a.kind === "percent" ? ` (${a.value}%)` : ""}</span>
                    <span>{money(a.kind === "percent" ? (totals.itemsSubtotal * a.value) / 100 : a.value)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-slate-500"><span>Tax</span><span>{money(totals.tax)}</span></div>
                <div className="flex justify-between font-display font-bold text-[16px] text-[#102F56] pt-1">
                  <span>Total</span><span>{money(totals.total)}</span>
                </div>
              </div>
              {needsGuests && (
                <p className="mt-2 text-[11px] font-semibold text-amber-700">👥 Guest count is 0 — per-person items aren&apos;t counted yet. Enter counts below.</p>
              )}
              {(totals.unconfirmed > 0 || totals.unpriced > 0) && (
                <div className="mt-2 space-y-0.5">
                  {totals.unconfirmed > 0 && <p className="text-[11px] font-semibold text-amber-700">⚠ {totals.unconfirmed} carried price{totals.unconfirmed === 1 ? "" : "s"} unconfirmed</p>}
                  {totals.unpriced > 0 && <p className="text-[11px] text-slate-400">{totals.unpriced} item{totals.unpriced === 1 ? "" : "s"} unpriced</p>}
                </div>
              )}
            </div>

            {/* Guests */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Guests</div>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => (
                  <label key={c.id} className="flex items-center gap-1 text-[12px]">
                    {c.name}
                    <input type="number" min={0} disabled={!!locked} className="field !py-0.5 !px-1.5 !text-xs w-16"
                      value={guests[c.id] ?? 0}
                      onChange={(e) => saveGuests(c.id, Math.max(0, parseInt(e.target.value || "0", 10)))} />
                  </label>
                ))}
              </div>
            </div>

            {/* Adjustments */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Adjustments</span>
                {!locked && (
                  <button className="text-[11px] text-[#2F80ED] hover:underline"
                    onClick={async () => {
                      const { data } = await supabase.from("version_adjustments")
                        .insert({ version_id: versionId, label: "Service Charge", kind: "percent", value: 18, position: adjs.length })
                        .select("*").single();
                      if (data) setAdjs((p) => [...p, data as Adjustment]);
                    }}>＋ add</button>
                )}
              </div>
              {adjs.length === 0 && <p className="text-[11px] text-slate-400">Delivery, setup, gratuity, admin fee — all live here.</p>}
              <div className="space-y-1">
                {adjs.map((a) => (
                  <div key={a.id} className="flex items-center gap-1 text-[11px]">
                    <input className="field !py-0.5 !px-1 !text-[11px] flex-1 min-w-0" disabled={!!locked} defaultValue={a.label}
                      onBlur={async (e) => { await supabase.from("version_adjustments").update({ label: e.target.value }).eq("id", a.id); setAdjs((p) => p.map((x) => x.id === a.id ? { ...x, label: e.target.value } : x)); }} />
                    <select className="field !py-0.5 !px-0.5 !text-[10px]" disabled={!!locked} value={a.kind}
                      onChange={async (e) => { const kind = e.target.value as "percent" | "flat"; await supabase.from("version_adjustments").update({ kind }).eq("id", a.id); setAdjs((p) => p.map((x) => x.id === a.id ? { ...x, kind } : x)); }}>
                      <option value="percent">%</option><option value="flat">$</option>
                    </select>
                    <input type="number" step="0.01" className="field !py-0.5 !px-1 !text-[11px] w-16" disabled={!!locked} value={a.value}
                      onChange={async (e) => { const value = parseFloat(e.target.value || "0"); await supabase.from("version_adjustments").update({ value }).eq("id", a.id); setAdjs((p) => p.map((x) => x.id === a.id ? { ...x, value } : x)); }} />
                    {!locked && <button className="text-slate-300 hover:text-red-500" onClick={async () => { await supabase.from("version_adjustments").delete().eq("id", a.id); setAdjs((p) => p.filter((x) => x.id !== a.id)); }}>✕</button>}
                  </div>
                ))}
              </div>
            </div>

            {/* Everything about the focused item: presentation first, then pricing.
                Presentation used to hide inside a panel called "Price Memory", so
                nobody found it — that framing is gone (v191). */}
            {focusItem && (() => {
              const i = items.find((x) => x.id === focusItem);
              if (!i) return null;
              const srp = i.catalog_item_id ? srps[i.catalog_item_id] : null;
              const mem = memory[i.id];
              const owner = comps.find((x) => x.id === i.component_id);
              const ownerCats = owner ? readCats(owner.item_categories) : [];
              return (
                <div className="rounded-xl ring-1 ring-[#E7EDF5] p-3.5 bg-[#FDFDFF]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Item Details</div>
                  <div className="text-[13px] font-semibold mb-2">{i.name}</div>

                  {/* ── Presentation ── */}
                  <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#2F80ED] mb-1">Presentation</div>
                  <div className="space-y-1.5 mb-3">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <input type="checkbox" className="accent-[#2F80ED]" disabled={!!locked}
                        checked={i.show_on_proposal !== false}
                        onChange={(e) => patchItem(i.id, { show_on_proposal: e.target.checked })} />
                      Show on proposal
                      {i.show_on_proposal === false && <span className="text-slate-400">— internal only</span>}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 w-14 shrink-0">Heading</span>
                      <select className="field !py-0.5 !px-1.5 !text-[11px] w-full" disabled={!!locked || !ownerCats.length}
                        title={ownerCats.length ? "Group this item under a presentation heading" : "Add a heading to this component first"}
                        value={i.category_key ?? ""}
                        onChange={(e) => patchItem(i.id, { category_key: e.target.value || null })}>
                        <option value="">{ownerCats.length ? "(ungrouped)" : "(no headings yet)"}</option>
                        {ownerCats.map((cat) => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
                      </select>
                    </div>
                    <input className="field !py-0.5 !px-1.5 !text-[11px] w-full" disabled={!!locked}
                      placeholder="Presentation note — printed as written, e.g. “Served with au jus”, “Carved to order”"
                      value={i.presentation_note ?? ""}
                      onChange={(e) => patchItem(i.id, { presentation_note: e.target.value || null })} />
                  </div>

                  {/* ── Pricing ── */}
                  <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 mb-1">Pricing memory</div>
                  <div className="space-y-1 text-[11px] text-slate-600">
                    {srp?.srp != null && (
                      <p>Suggested <b>{money(srp.srp)}</b>{srp.srp_set_at ? <span className="text-slate-400"> · set {new Date(srp.srp_set_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span> : null}
                        {!locked && <button className="ml-1.5 text-[#2F80ED] underline" onClick={() => patchItem(i.id, { unit_price: srp.srp, price_confirmed: true })}>use</button>}
                      </p>
                    )}
                    {!mem && <p className="text-slate-400">Loading…</p>}
                    {mem && mem.points.length === 0 && <p className="text-slate-400">No sold history yet — this decision becomes the memory.</p>}
                    {mem?.points.map((pt, idx) => (
                      <p key={idx}>
                        {pt.match === "lineage" ? "↺" : pt.match === "catalog" ? "📖" : "≈"} <b>{money(pt.unit_price)}</b>{pt.quantity_basis === "per_person" ? "/pp" : ""} — {pt.customer}
                        {pt.date ? ` · ${new Date(pt.date).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : ""}{pt.guests ? ` · ${pt.guests} g` : ""}
                        {pt.match === "name" && <span className="text-slate-400"> (same name)</span>}
                        {!locked && <button className="ml-1 text-[#2F80ED] underline" onClick={() => patchItem(i.id, { unit_price: pt.unit_price, price_confirmed: true })}>use</button>}
                      </p>
                    ))}
                    {mem?.range && <p className="text-slate-400">Range (12mo): {money(mem.range.low)}–{money(mem.range.high)} · {mem.range.count} sales</p>}
                    {!locked && (
                      <div className="pt-1 space-y-1">
                        <input className="field !py-0.5 !px-1.5 !text-[11px] w-full" placeholder="pricing reason (optional)"
                          value={i.pricing_reason ?? ""}
                          onChange={(e) => patchItem(i.id, { pricing_reason: e.target.value || null })} />
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1 text-[10px] text-slate-500">
                            <input type="checkbox" className="accent-[#4A9EFF]" checked={!!i.taxable}
                              onChange={(e) => patchItem(i.id, { taxable: e.target.checked })} /> taxable
                          </label>
                          {i.unit_price != null && (
                            <button className="text-[10px] text-[#2F80ED] underline ml-auto"
                              onClick={async () => {
                                const c = comps.find((x) => x.id === i.component_id);
                                const r = await promoteToCatalog(i, c?.domain ?? "food");
                                if (!r.ok) setErr(r.detail ?? ""); else { setToast("✓ Saved as standard price"); loadCanvas(); }
                              }}>save as standard price</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {!focusItem && <p className="text-[11px] text-slate-300">Click any item (or its ⋯) for its details — proposal visibility, heading, presentation note, and pricing history.</p>}
          </div>
          </>
          )}
        </div>
      )}

      {tab === "compare" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-semibold">Compare v{version.version} against</span>
              <select className="field !py-1 !text-xs" value={compareWith} onChange={(e) => runCompare(e.target.value)}>
                <option value="">— pick a version —</option>
                {versions.filter((v) => v.id !== version.id).map((v) => (
                  <option key={v.id} value={v.id}>v{v.version} ({VERSION_FLOW.find((f) => f.value === v.status)?.label})</option>
                ))}
              </select>
              {busy && <span className="text-xs text-slate-400">computing…</span>}
            </div>
            {diff && (
              <div className="space-y-3">
                <div className="card p-4 flex items-center gap-6">
                  <div><div className="text-[10px] font-bold uppercase text-slate-400">Older</div><div className="font-display font-bold">{money(diff.totalA)}</div></div>
                  <div className="text-2xl text-slate-300">→</div>
                  <div><div className="text-[10px] font-bold uppercase text-slate-400">This version</div><div className="font-display font-bold">{money(diff.totalB)}</div></div>
                  <div className={`ml-auto font-display font-bold text-lg ${diff.totalB - diff.totalA >= 0 ? "text-[#15803D]" : "text-red-600"}`}>
                    {diff.totalB - diff.totalA >= 0 ? "+" : ""}{money(diff.totalB - diff.totalA)}
                  </div>
                </div>
                {diff.added.length > 0 && (
                  <div className="card p-4">
                    <div className="text-[10px] font-bold uppercase text-[#15803D] mb-1">Added</div>
                    {diff.added.map((x, i) => <p key={i} className="text-[13px]">+ {x.title}</p>)}
                  </div>
                )}
                {diff.removed.length > 0 && (
                  <div className="card p-4">
                    <div className="text-[10px] font-bold uppercase text-red-600 mb-1">Removed</div>
                    {diff.removed.map((x, i) => <p key={i} className="text-[13px]">− {x.title}</p>)}
                  </div>
                )}
                {diff.changed.length > 0 && (
                  <div className="card p-4">
                    <div className="text-[10px] font-bold uppercase text-[#2F80ED] mb-1">Changed</div>
                    {diff.changed.map((x, i) => <p key={i} className="text-[13px]"><b>{x.title}</b>: <span className="text-slate-500">{x.detail}</span></p>)}
                  </div>
                )}
                {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 && (
                  <p className="text-sm text-slate-400">No structural differences — totals may still differ via guests or adjustments.</p>
                )}
              </div>
            )}
          </div>
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
