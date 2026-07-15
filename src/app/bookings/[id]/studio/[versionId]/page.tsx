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
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate } from "@/lib/workflow";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";
import { resolveTaxForTenant, TaxResolution } from "@/lib/tax";
import StudioShell from "@/components/studio/StudioShell";
import { visibleLenses, defaultLens, LensKey } from "@/lib/lenses";
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
      supabase.from("event_components").select("id,title,domain,position,notes,section_type_id,group_label,group_position,group_description,pricing_mode,package_price,package_basis,package_taxable,package_price_confirmed,package_cost,customer_description,proposal_display,item_categories,item_layout,uncategorized_position,package_audience").eq("proposal_version_id", versionId).order("position"),
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
    setLens(defaultLens({ caps }, session));   // never assumes "customer"
  }, [caps, session, lens]);
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
  const hasOptions = items.some((i) => i.item_role === "optional");
  const totalGuests = guestCounts.reduce((x, g) => x + g.count, 0);
  // "$0.00" would be a lie of precision: per-person items aren't zero, they're
  // uncalculable until a guest count exists. Say so instead of showing $0.
  const needsGuests = totalGuests === 0 && (
    activeItems.some((i) => i.quantity_basis === "per_person" && i.unit_price != null && isActive(i)) ||
    packageLines.some((pk) => pk.package_basis === "per_person" && pk.package_price != null));

  // ── Mutations ──
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
  async function addItem(compId: string) {
    const name = prompt("Item name");
    if (!name?.trim()) return;
    const { error } = await supabase.from("component_items").insert({
      component_id: compId, name: name.trim(), quantity_basis: "per_person",
      price_confirmed: true, taxable: true,
      position: items.filter((i) => i.component_id === compId).length,
    });
    if (error) setErr(error.message); else loadCanvas();
  }
  async function patchItem(id: string, patch: Partial<PricedItem>) {
    const { error } = await supabase.from("component_items").update(patch).eq("id", id);
    if (error) { setErr(error.message); return; }
    setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  async function deleteItem(id: string) {
    await supabase.from("component_items").delete().eq("id", id);
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
      <h1 className="font-display font-bold text-xl mb-2">Proposal Studio</h1>
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
          onOpenLibrary={() => setToast("Library — Ctrl+K opens the browser in the next slice")}
        />
      </div>

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
          {/* LEFT */}
          <div className="border-r border-[#E7EDF5] bg-white p-3 min-h-0">
            <SourceEventPane b={b} currentProposalId={proposal.id} onAdd={addFromSource} onSeed={seedFromEvent} busy={busy || !!locked} />
          </div>

          {/* CENTER — the canvas */}
          <div className="min-h-0 overflow-y-auto p-5"
            onDragOver={(e) => { if (e.dataTransfer.types.includes("text/eventcore-component")) { e.preventDefault(); setDropHot(true); } }}
            onDragLeave={() => setDropHot(false)}
            onDrop={(e) => {
              setDropHot(false);
              const raw = e.dataTransfer.getData("text/eventcore-component");
              if (!raw) return;
              e.preventDefault();
              try { const d = JSON.parse(raw); addFromSource([d.id], d.label); } catch {}
            }}>
            <div className="max-w-3xl mx-auto space-y-3">
              {needsGuests && (
                <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 text-amber-800 text-[12px] px-3 py-2">
                  👥 This proposal has per-person pricing — enter the guest count on the right to calculate totals.
                </div>
              )}
              {comps.length === 0 && (
                <div className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${dropHot ? "border-[#4A9EFF] bg-[#F4F9FF]" : "border-[#D8E2EF] bg-white"}`}>
                  <div className="text-3xl mb-2">🎨</div>
                  <p className="text-sm font-semibold text-slate-600">The proposal starts here.</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Open a similar event on the left and drag its components in — or use
                    <b> ⤓ Start from this event</b> to seed the whole thing, then sculpt.
                  </p>
                  {!locked && <button className="btn-primary !py-1.5 !px-3 text-xs mt-4" onClick={() => setSectionPicker(true)}>＋ Add a section</button>}
                </div>
              )}
              {groups.map((g) => (
                <div key={g.sectionTypeId ?? "none"} className="rounded-2xl ring-1 ring-[#DCE6F2] bg-[#FBFCFE] p-2.5">
                  <div className="flex items-center gap-2 px-1 pb-1.5">
                    <span className="font-display font-bold text-[13px] tracking-wide text-[#102F56] uppercase">{g.name}</span>
                    <span className="text-[10px] text-slate-400">{g.comps.length || "empty"}</span>
                    {!locked && g.sectionTypeId && (
                      <span className="ml-auto flex items-center gap-1 text-slate-300">
                        <button className="hover:text-slate-500" title="Section up" onClick={() => moveSection(g, -1)}>↑</button>
                        <button className="hover:text-slate-500" title="Section down" onClick={() => moveSection(g, 1)}>↓</button>
                        <button className="hover:text-red-500" title="Remove section" onClick={() => removeSection(g)}>✕</button>
                      </span>
                    )}
                  </div>
                  {g.comps.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[#D8E2EF] py-2.5 text-center text-[11px] text-slate-300"
                      onDragOver={(e) => { if (e.dataTransfer.types.includes("text/eventcore-reorder")) e.preventDefault(); }}
                      onDrop={(e) => {
                        const dragId = e.dataTransfer.getData("text/eventcore-reorder");
                        if (dragId) { e.preventDefault(); e.stopPropagation(); setCompSection(dragId, g.sectionTypeId); }
                      }}>
                      nothing here yet — drop a component or ＋ below
                    </div>
                  )}
                  <div className="space-y-2">
              {(() => {
                const norm = (l: string | null) => (l ?? "").trim().toLowerCase();
                const bandKeys: string[] = [];
                const bandMeta: Record<string, { label: string; desc: string; minPos: number; comps: CompRow[] }> = {};
                for (const c of g.comps) {
                  const k = norm(c.group_label);
                  if (!k) { const bk = `__bare__${c.id}`; bandKeys.push(bk); bandMeta[bk] = { label: "", desc: "", minPos: c.position + 100000, comps: [c] }; continue; }
                  if (!bandMeta[k]) { bandMeta[k] = { label: (c.group_label ?? "").trim(), desc: "", minPos: c.group_position, comps: [] }; bandKeys.push(k); }
                  bandMeta[k].comps.push(c);
                  bandMeta[k].minPos = Math.min(bandMeta[k].minPos, c.group_position);
                  if (!bandMeta[k].desc && c.group_description) bandMeta[k].desc = c.group_description;
                }
                const orderedKeys = bandKeys.sort((a, z) => bandMeta[a].minPos - bandMeta[z].minPos);
                return orderedKeys.map((bk) => {
                  const band = bandMeta[bk];
                  const isBand = !bk.startsWith("__bare__");
                  const bandTotal = band.comps.reduce((sum, cc) => {
                    if (cc.pricing_mode === "package") return sum + (cc.package_price != null ? (cc.package_basis === "per_person" ? cc.package_price * totalGuests : cc.package_price) : 0);
                    return sum + items.filter((i) => i.component_id === cc.id).reduce((t, i) => {
                      if (i.unit_price == null || !isActive(i)) return t;
                      const n = i.quantity_basis === "per_person" ? (i.applies_to_category_id ? (guests[i.applies_to_category_id] ?? 0) : totalGuests) : (i.quantity ?? 1);
                      return t + i.unit_price * n;
                    }, 0);
                  }, 0);
                  return (
                  <div key={bk} className={isBand ? "rounded-lg bg-[#F8FAFD] ring-1 ring-[#E7EDF5] p-2" : ""}>
                    {isBand && (
                      <div className="flex items-center gap-2 px-1 pb-1.5">
                        <span className="text-[11px]">◱</span>
                        <input className="font-display font-semibold text-[12px] bg-transparent outline-none flex-1 min-w-0 focus:bg-white rounded px-1 text-[#334155]"
                          defaultValue={band.label} disabled={!!locked}
                          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== band.label) renameBand(band.label, g.sectionTypeId, v); }} />
                        <span className="text-[11px] font-semibold text-slate-400">{money(bandTotal)}</span>
                        {!locked && (
                          <button className="text-slate-300 hover:text-red-500 text-[11px]" title="Ungroup this band"
                            onClick={() => { for (const cc of band.comps) assignGroup(cc.id, ""); }}>⊘</button>
                        )}
                      </div>
                    )}
                    <div className="space-y-2">
              {band.comps.map((c) => {
                const isPkg = c.pricing_mode === "package";
                const its = isPkg ? [] : items.filter((i) => i.component_id === c.id);
                const pkgTotal = isPkg && c.package_price != null
                  ? (c.package_basis === "per_person" ? c.package_price * totalGuests : c.package_price) : 0;
                const secTotal = isPkg ? pkgTotal : its.reduce((s, i) => {
                  if (i.unit_price == null || !isActive(i)) return s;
                  const allG = guestCounts.reduce((x, g) => x + g.count, 0);
                  const n = i.quantity_basis === "per_person"
                    ? (i.applies_to_category_id ? (guests[i.applies_to_category_id] ?? 0) : allG)
                    : (i.quantity ?? 1);
                  return s + i.unit_price * n;
                }, 0);
                return (
                  <div key={c.id}
                    draggable={!locked}
                    onDragStart={(e) => { e.dataTransfer.setData("text/eventcore-reorder", c.id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(e) => { if (e.dataTransfer.types.includes("text/eventcore-reorder")) e.preventDefault(); }}
                    onDrop={(e) => {
                      const dragId = e.dataTransfer.getData("text/eventcore-reorder");
                      if (dragId) {
                        e.preventDefault(); e.stopPropagation();
                        // dropping into another section MOVES the component there
                        const dragged = comps.find((x) => x.id === dragId);
                        if (dragged && dragged.section_type_id !== c.section_type_id) setCompSection(dragId, c.section_type_id);
                        else reorderTo(dragId, c.id);
                      }
                    }}
                    className="rounded-xl bg-white ring-1 ring-[#E7EDF5] shadow-sm">
                    <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[#F1F5F9]">
                      <span className="cursor-grab text-slate-300 select-none" title="Drag to reorder or into another section">⠿</span>
                      <input className="font-display font-semibold text-[14px] bg-transparent outline-none flex-1 min-w-0 focus:bg-[#F6F8FB] rounded px-1"
                        defaultValue={c.title} disabled={!!locked}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.title) patchComp(c.id, { title: v }); }} />
                      {isPkg && <span className="text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-[#FEF3C7] text-[#92400E]">package</span>}
                      {isPkg && c.package_price != null && !c.package_price_confirmed && <span className="text-[10px] font-semibold text-amber-700">⚠ carried</span>}
                      {secTotal === 0 && totalGuests === 0 && (isPkg ? c.package_basis === "per_person" && c.package_price != null : its.some((i) => i.quantity_basis === "per_person" && i.unit_price != null && isActive(i)))
                        ? <span className="text-[10px] font-semibold text-amber-600">needs guest count</span>
                        : <span className="text-[12px] font-semibold text-slate-500">{money(secTotal)}</span>}
                      {!locked && (
                        <button className="text-[9px] font-semibold text-slate-300 hover:text-[#2F80ED] uppercase tracking-wide"
                          title={isPkg ? "Switch to itemized (items return)" : "Switch to package (one price, items hidden & not counted)"}
                          onClick={() => {
                            if (!isPkg && items.some((i) => i.component_id === c.id) &&
                              !confirm("Package mode sells this as ONE unit — its items will be hidden and not counted. Switch?")) return;
                            patchComp(c.id, { pricing_mode: isPkg ? "itemized" : "package" });
                          }}>⇄ {isPkg ? "itemize" : "package"}</button>
                      )}
                      {!locked && (
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <label className="flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                            <span className="text-slate-300">§</span>
                            <select className="field !py-0.5 !px-1 !text-[10px] max-w-[110px]" title="Section — where in the event"
                              value={c.section_type_id ?? ""}
                              onChange={(e) => setCompSection(c.id, e.target.value || null)}>
                              <option value="">— section —</option>
                              {sectionTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          </label>
                          <label className={`flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide ${c.group_label ? "text-[#6D28D9]" : "text-slate-400"}`}>
                            <span>◱</span>
                            <select className={`field !py-0.5 !px-1 !text-[10px] max-w-[130px] ${c.group_label ? "!text-[#6D28D9] !border-[#DDD6FE]" : ""}`}
                              title="Band — group components into a display (e.g. Stationary Display)"
                              value={c.group_label ? `existing:${(c.group_label).trim()}` : ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "") { assignGroup(c.id, ""); return; }
                                if (val === "__new") {
                                  const name = prompt(`New band name for "${c.title}" — e.g. Stationary Display, Chef Stations`, "");
                                  if (name && name.trim()) assignGroup(c.id, name.trim());
                                  return;
                                }
                                if (val.startsWith("existing:")) assignGroup(c.id, val.slice("existing:".length));
                              }}>
                              <option value="">— no band —</option>
                              {(() => {
                                // Existing bands in THIS component's section (dedup, case-insensitive).
                                const here = Array.from(new Set(
                                  comps.filter((x) => (x.section_type_id ?? "") === (c.section_type_id ?? "") && x.group_label)
                                    .map((x) => (x.group_label ?? "").trim())
                                    .filter((l) => l.toLowerCase() !== (c.group_label ?? "").trim().toLowerCase())));
                                return here.map((label) => <option key={label} value={`existing:${label}`}>{label}</option>);
                              })()}
                              {c.group_label && <option value={`existing:${(c.group_label).trim()}`}>{(c.group_label).trim()} ✓</option>}
                              <option value="__new">＋ New band…</option>
                            </select>
                          </label>
                          <button className="hover:text-slate-500" title="Move up" onClick={() => moveComp(c, -1)}>↑</button>
                          <button className="hover:text-slate-500" title="Move down" onClick={() => moveComp(c, 1)}>↓</button>
                          <button className="hover:text-red-500" title="Remove component" onClick={() => deleteComp(c)}>✕</button>
                        </span>
                      )}
                    </div>
                    {isPkg && (
                      <div className="px-3.5 py-2.5 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap text-[12px]">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sell price</span>
                          <span className="text-slate-400">$</span>
                          <input type="number" step="0.01" min={0} disabled={!!locked}
                            className="field !py-0.5 !px-1 !text-[12px] w-24"
                            value={c.package_price ?? ""}
                            onChange={(e) => {
                              const val = e.target.value === "" ? null : parseFloat(e.target.value);
                              patchComp(c.id, { package_price: val, package_price_confirmed: true });
                            }} />
                          <select className="field !py-0.5 !px-1 !text-[10px]" disabled={!!locked}
                            value={c.package_basis}
                            onChange={(e) => patchComp(c.id, { package_basis: e.target.value })}>
                            <option value="flat">flat</option>
                            <option value="per_person">/person</option>
                          </select>
                          <label className="flex items-center gap-0.5 text-[10px] text-slate-500">
                            <input type="checkbox" className="accent-[#4A9EFF]" disabled={!!locked}
                              checked={c.package_taxable} onChange={(e) => patchComp(c.id, { package_taxable: e.target.checked })} />tax
                          </label>
                          {!locked && c.package_price != null && !c.package_price_confirmed && (
                            <button className="text-[10px] font-bold text-amber-700 underline"
                              onClick={() => patchComp(c.id, { package_price_confirmed: true })}>ok</button>
                          )}
                          <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
                            cost $
                            <input type="number" step="0.01" min={0} disabled={!!locked}
                              className="field !py-0.5 !px-1 !text-[10px] w-16" placeholder="opt."
                              title="Internal cost (optional, dormant) — feeds margin when the purchasing module exists; never shown to customers, never changes the sell price"
                              value={c.package_cost ?? ""}
                              onChange={(e) => patchComp(c.id, { package_cost: e.target.value === "" ? null : parseFloat(e.target.value) })} />
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Proposal detail</span>
                          <select className="field !py-0.5 !px-1.5 !text-[11px]" disabled={!!locked}
                            title="How much of this component the customer sees on the proposal"
                            value={c.proposal_display ?? (isPkg ? "description" : "items")}
                            onChange={(e) => patchComp(c.id, { proposal_display: e.target.value })}>
                            <option value="title_only">Title only</option>
                            <option value="description">Title + description</option>
                            <option value="items">Title + visible items</option>
                          </select>
                        </div>
                        {/* Item layout + headings only matter when items render. */}
                        {(c.proposal_display ?? (isPkg ? "description" : "items")) === "items" && (
                          <div className="rounded-lg ring-1 ring-[#E7EDF5] bg-[#FBFCFE] p-2 mb-1 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Item layout</span>
                              <select className="field !py-0.5 !px-1.5 !text-[11px]" disabled={!!locked}
                                title="Default layout for this component's items. A heading can override it."
                                value={c.item_layout ?? "vertical"}
                                onChange={(e) => patchComp(c.id, { item_layout: e.target.value })}>
                                {LAYOUT_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                              </select>
                              <span className="text-[10px] text-slate-400">ungrouped</span>
                              <select className="field !py-0.5 !px-1.5 !text-[11px]" disabled={!!locked}
                                title="Where items without a heading appear"
                                value={c.uncategorized_position ?? "bottom"}
                                onChange={(e) => patchComp(c.id, { uncategorized_position: e.target.value })}>
                                <option value="bottom">last</option>
                                <option value="top">first</option>
                              </select>
                            </div>
                            {readCats(c.item_categories).map((cat, ci, arr) => (
                              <div key={cat.key} className="flex items-center gap-1 flex-wrap">
                                <input className="field !py-0.5 !px-1.5 !text-[11px] w-36" disabled={!!locked}
                                  defaultValue={cat.label}
                                  onBlur={(e) => e.target.value.trim() && e.target.value !== cat.label
                                    && patchCategory(c, cat.key, { label: e.target.value.trim() })} />
                                <select className="field !py-0.5 !px-1 !text-[10px]" disabled={!!locked}
                                  title="Layout for this heading (overrides the component default)"
                                  value={cat.layout ?? ""}
                                  onChange={(e) => patchCategory(c, cat.key, { layout: e.target.value || null })}>
                                  <option value="">(default)</option>
                                  {LAYOUT_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                                </select>
                                <label className="flex items-center gap-0.5 text-[10px] text-slate-500" title="Show this heading on the proposal">
                                  <input type="checkbox" className="accent-[#4A9EFF]" disabled={!!locked}
                                    checked={cat.show_heading !== false}
                                    onChange={(e) => patchCategory(c, cat.key, { show_heading: e.target.checked })} />heading
                                </label>
                                <button className="text-[10px] text-slate-300 hover:text-slate-600 disabled:opacity-30" disabled={!!locked || ci === 0}
                                  title="Move up" onClick={() => moveCategory(c, cat.key, -1)}>↑</button>
                                <button className="text-[10px] text-slate-300 hover:text-slate-600 disabled:opacity-30" disabled={!!locked || ci === arr.length - 1}
                                  title="Move down" onClick={() => moveCategory(c, cat.key, 1)}>↓</button>
                                <button className="text-[10px] text-slate-300 hover:text-rose-600" disabled={!!locked}
                                  title="Remove heading" onClick={() => deleteCategory(c, cat.key)}>✕</button>
                              </div>
                            ))}
                            {!locked && (
                              <button className="text-[10.5px] text-[#2F80ED] hover:underline"
                                onClick={() => addCategory(c)}>+ Add heading</button>
                            )}
                          </div>
                        )}
                        <textarea className="field w-full !py-1 !text-[12px] !bg-[#FBFCFE]" rows={2} disabled={!!locked}
                          placeholder="Customer description — what the guest receives (marketing copy, shown on the proposal)"
                          defaultValue={c.customer_description ?? ""}
                          onBlur={(e) => patchComp(c.id, { customer_description: e.target.value || null })} />
                        <textarea className="field w-full !py-1 !text-[11px] !bg-[#F6F8FB]" rows={2} disabled={!!locked}
                          placeholder="Internal / production notes — vendor, order details, purchasing reminders (never shown to the customer)"
                          defaultValue={c.notes ?? ""}
                          onBlur={(e) => patchComp(c.id, { notes: e.target.value || null })} />
                      </div>
                    )}
                    {!isPkg && (
                    <div className="px-3.5 py-2 space-y-1">
                      {its.map((i) => {
                        const active = isActive(i);
                        const carried = i.unit_price != null && !i.price_confirmed;
                        return (
                          <div key={i.id}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] ring-1 transition-colors ${focusItem === i.id ? "ring-[#4A9EFF] bg-[#F4F9FF]" : carried ? "ring-amber-300 bg-amber-50" : "ring-transparent hover:ring-[#E7EDF5]"} ${!active ? "opacity-60" : ""}`}>
                            {i.item_role === "optional" && (
                              <input type="checkbox" className="accent-[#2F80ED]" disabled={!!locked} title="Customer option — include?"
                                checked={i.selected !== false}
                                onChange={(e) => patchItem(i.id, { selected: e.target.checked })} />
                            )}
                            <button className="font-medium text-left min-w-0 truncate hover:underline" onClick={() => focusOn(i)}>
                              {i.name}
                              {/* Presentation note prints as stored — no prefix (v191). */}
                              {i.presentation_note && <span className="block text-[10px] italic text-slate-400 font-normal">{i.presentation_note}</span>}
                            </button>
                            {i.category_key && (
                              <span className="text-[9px] rounded-full px-1.5 py-0.5 bg-[#EEF4FB] text-slate-500 shrink-0 max-w-[7rem] truncate"
                                title="Presentation heading">
                                {readCats(c.item_categories).find((x) => x.key === i.category_key)?.label ?? i.category_key}
                              </span>
                            )}
                            {/* Discoverability: the row must advertise that an item has
                                details behind it. Without this nobody finds the panel. */}
                            <button className={`shrink-0 text-[11px] ${focusItem === i.id ? "text-[#2F80ED]" : "text-slate-300 hover:text-[#2F80ED]"}`}
                              title="Item details — visibility, heading, presentation note, pricing history"
                              onClick={() => focusOn(i)}>⋯</button>
                            <button
                              className={`shrink-0 text-[13px] leading-none ${i.show_on_proposal === false ? "text-slate-300 hover:text-slate-500" : "text-[#2F80ED] hover:text-[#1b5fc0]"}`}
                              disabled={!!locked}
                              title={i.show_on_proposal === false ? "Internal only — hidden from the customer proposal. Click to show." : "Shown on the customer proposal. Click to make internal-only."}
                              onClick={() => patchItem(i.id, { show_on_proposal: i.show_on_proposal === false })}>
                              {i.show_on_proposal === false ? "🚫" : "👁"}
                            </button>
                            {i.item_role === "optional" && <span className="text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-[#EDE9FE] text-[#6D28D9] shrink-0">option</span>}
                            {carried && <span className="text-[10px] font-semibold text-amber-700 shrink-0">⚠ carried</span>}
                            <span className="ml-auto flex items-center gap-1.5 shrink-0">
                              <select className="field !py-0.5 !px-1 !text-[10px]" disabled={!!locked}
                                value={i.quantity_basis ?? "flat"}
                                onChange={(e) => patchItem(i.id, { quantity_basis: e.target.value })}>
                                <option value="per_person">/person</option>
                                <option value="flat">flat</option>
                                <option value="per_table">/table</option>
                              </select>
                              {i.quantity_basis === "per_person" ? (
                                <select className="field !py-0.5 !px-1 !text-[10px]" disabled={!!locked}
                                  value={i.applies_to_category_id ?? ""}
                                  onChange={(e) => patchItem(i.id, { applies_to_category_id: e.target.value || null })}>
                                  <option value="">All guests</option>
                                  {cats.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                </select>
                              ) : (
                                <input type="number" min={0} disabled={!!locked} className="field !py-0.5 !px-1 !text-[10px] w-12"
                                  value={i.quantity ?? 1}
                                  onChange={(e) => patchItem(i.id, { quantity: parseFloat(e.target.value || "1") })} />
                              )}
                              <span className="text-slate-400">$</span>
                              <input type="number" step="0.01" min={0} disabled={!!locked}
                                className="field !py-0.5 !px-1 !text-[11px] w-[70px]"
                                value={i.unit_price ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? null : parseFloat(e.target.value);
                                  patchItem(i.id, { unit_price: val, price_confirmed: true });
                                }} />
                              {carried && !locked && (
                                <button className="text-[10px] font-bold text-amber-700 underline"
                                  onClick={() => patchItem(i.id, { price_confirmed: true })}>ok</button>
                              )}
                              {!locked && (
                                <>
                                  <button className={`text-[10px] ${i.item_role === "optional" ? "text-[#6D28D9]" : "text-slate-300 hover:text-[#6D28D9]"}`}
                                    title={i.item_role === "optional" ? "Make included" : "Make optional upgrade"}
                                    onClick={() => patchItem(i.id, i.item_role === "optional" ? { item_role: "included", selected: true } : { item_role: "optional", selected: false })}>
                                    ☆
                                  </button>
                                  <button className="text-slate-300 hover:text-red-500 text-[11px]" onClick={() => deleteItem(i.id)}>✕</button>
                                </>
                              )}
                            </span>
                          </div>
                        );
                      })}
                      {!locked && (
                        <button className="text-[11px] text-slate-400 hover:text-[#2F80ED] font-medium pl-2 py-0.5"
                          onClick={() => addItem(c.id)}>＋ item</button>
                      )}
                    </div>
                    )}
                  </div>
                );
              })}
                    </div>
                  </div>
                  );
                });
              })()}
                  </div>
                  {!locked && (
                    <button className="text-[11px] text-slate-400 hover:text-[#2F80ED] font-medium pl-1.5 pt-1.5"
                      onClick={() => addComponentIn(g.sectionTypeId)}>＋ component</button>
                  )}
                </div>
              ))}
              {comps.length + groups.length > 0 && !locked && (
                <div className={`rounded-xl border-2 border-dashed py-3 text-center text-[12px] transition-colors ${dropHot ? "border-[#4A9EFF] bg-[#F4F9FF] text-[#2F80ED]" : "border-[#D8E2EF] text-slate-400"}`}>
                  Drop a component here — or{" "}
                  {sectionPicker ? (
                    <select className="field !py-0.5 !text-[11px]" autoFocus
                      onChange={(e) => { if (e.target.value === "__new") { const n = prompt("New section name"); if (n?.trim()) { supabase.from("section_types").insert({ name: n.trim(), position: sectionTypes.length }).select("id").single().then(({ data }) => { if (data) addSectionType((data as { id: string }).id); }); } } else if (e.target.value) addSectionType(e.target.value); }}>
                      <option value="">pick a section…</option>
                      {sectionTypes.filter((t) => !seen.has(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      <option value="__new">＋ new section type…</option>
                    </select>
                  ) : (
                    <button className="font-semibold text-[#2F80ED] hover:underline" onClick={() => setSectionPicker(true)}>＋ add a section</button>
                  )}
                </div>
              )}
            </div>
          </div>

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
