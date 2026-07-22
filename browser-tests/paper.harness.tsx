// harness/paper.harness.tsx — THE LAW, mounted (STUDIO_COMPOSITION §0). The
// real recomposed organs in the page's own arrangement: StudioLine,
// GhostOutline, Drawer, Meter, SecondSheet, LibraryBrowser (summon row +
// shade), real Inspector, real ProposalRenderer and ProductionSheet over
// fixtures. The Design paper's interior is a fixture body (the Stage's
// interior is the v197 suites' territory); every claim here is about the
// COMPOSITION: what is permanent, what is summoned, what dismisses, what
// never reflows, what is never persisted.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import StudioLine from "@/components/studio/StudioLine";
import SecondSheet from "@/components/studio/SecondSheet";
import { Meter, Drawer, GhostOutline } from "@/components/studio/StageFurniture";
import LibraryBrowser from "@/components/studio/LibraryBrowser";
import Inspector, { InspectorSelection } from "@/components/studio/Inspector";
import DesignOutline from "@/components/studio/renderers/DesignOutline";
import ProposalRenderer from "@/components/ProposalRenderer";
import { projectIdentity } from "@/lib/identity";
import { portablePresentation, applyPortable, replaceOntoDestination, makeProvenance, PortablePresentation, MappingDecisions } from "@/lib/portable";
import ComparePresentation from "@/components/studio/ComparePresentation";
import { renderToPdf } from "@/lib/render/render";
import { fetchBrandFonts } from "@/lib/render/fonts";
import ProductionSheet from "@/components/studio/renderers/ProductionSheet";
import { composeProductionModel, ProductionInputs } from "@/lib/productionLens";
import { PresentationModel } from "@/lib/presentation";
import { visibleLenses, lensEdits } from "@/lib/lenses";
import PresentationControls, { PubRoom } from "@/components/studio/PresentationControls";
import PresentationRooms from "@/components/studio/PresentationRooms";
import PresentationRoomRegion from "@/components/studio/PresentationRoomRegion";
import PhotographyRoom from "@/components/studio/PhotographyRoom";
import InspectorRegion from "@/components/studio/InspectorRegion";
import { PhotoRecord, PhotoPins, pinPhoto, unpinPhoto } from "@/lib/photos";
import TreatmentToolbar from "@/components/studio/TreatmentToolbar";
import { ThemeDelta, resolveTheme, builtInTheme, mergeDelta } from "@/lib/publication";
import { Capabilities } from "@/lib/capabilities";
import { Session } from "@/lib/permissions";
import { registerLibraryKind, rankPrefix, LibraryEntry } from "@/lib/libraryRegistry";
import { formatVersionDiff } from "@/lib/sheetChoice";
import { bootMoves } from "@/lib/moves/boot";
bootMoves();

// ── fixtures ───────────────────────────────────────────────────────────────
const session = {
  userId: "u", email: null, tenantId: "t", tenantName: "F", role: "admin",
  perms: ["bookings.view", "bookings.edit", "ops.view", "knowledge.view"],
} as unknown as Session;
const caps = {
  knowledge_capture: true, components_editor: true, component_copy: true,
  rolodex: true, photos_retrieval: false, requirements: true, proposals: true,
  event_legacy: true, multi_domain: true, workflow_engine: true,
} as Capabilities;
const lenses = visibleLenses({ caps, featureCan: () => true }, session);
const LIVE: Record<string, true> = { customer: true, production: true };
const liveOptions = lenses.filter((l) => LIVE[l.key] === true)
  .map((l) => ({ key: l.key as string, label: l.label, blurb: l.blurb }))
  .concat([{ key: "v:v2", label: "v2", blurb: "Version 2 \u2014 as the client would receive it" }]);

const stageModel: PresentationModel = {
  title: "The Goldberg Wedding", eventLine: "Wedding · 180 guests",
  intro: null, closing: null, priceVisibility: "hidden",
  sections: [{ id: "sec-fx-1", name: "Cocktail Hour", bands: [{ label: "", description: null,
    components: [{ id: "comp-fx-1", title: "Sushi Station", description: null, note: null, isPackage: false,
      priceLabel: null, priceStatus: "none",
      blocks: [{ showHeading: true, label: "Featured Rolls", layout: "vertical", items: [
        { name: "Spicy Tuna", description: null, price: null, priceLabel: null, priceStatus: "none", note: null, optional: false },
        { name: "Salmon Avocado", description: null, price: null, priceLabel: null, priceStatus: "none", note: null, optional: false },
      ] }], choice: null }] }],
    choiceGroups: [], subtotalLabel: null }],
  totalLabel: null, status: "draft", hasUnconfirmedVisiblePrice: false, summary: null,
  validUntil: null,   // v268 — open-ended fixture offer
};
const prodInputs: ProductionInputs = {
  booking: { title: "Goldberg Wedding", eventDate: "2026-08-22", estGuests: 180 },
  locked: false, evidence: false,
  components: [{ id: "c1", title: "Sushi Station",
    config: { schemeId: null, customized: [], scalars: {}, choices: {}, display: {}, substitutions: {} },
    baselineProvenance: "instantiation_stamp",
    requirements: [{ layerKey: "kitchen", logicalKey: "kitchen.x.handwash",
      name: "Handwash station", category: "equipment", notes: null, derived: true, suppressedAt: null }],
    layer: { schemaVersion: 1, data: { requirements: [], equipment: [], staffing: [], prepNotes: "Rice at dawn." } },
    annotation: null }],
};
const prodModel = composeProductionModel(prodInputs);

const oldStageModel: PresentationModel = {
  ...stageModel, title: "The Goldberg Wedding \u2014 v2",
  sections: [{ ...stageModel.sections[0], bands: [{ label: "", description: null,
    components: [{ id: "comp-fx-2", title: "Pasta Station", description: null, note: null, isPackage: false,
      priceLabel: null, priceStatus: "none", blocks: [], choice: null }] }] }],
};
const fixtureDiff = { added: [1], removed: [1], changed: [2, 3] as unknown[], totalA: 16500, totalB: 18000 };

const chapters = [
  { id: "ch1", label: "Cocktail Hour", debt: 2 },
  { id: "ch2", label: "Dinner", debt: 0 },
  { id: "ch3", label: "Dessert", debt: 0 },
];
const outlineNodes = chapters.map((c) => ({
  id: c.id, label: c.label, kind: "chapter" as const, debt: c.debt || undefined,
}));
const fixtureSel: InspectorSelection = {
  kind: "item", id: "item-1", title: "Nigiri platter", subtitle: "Sushi Station",
  price: { amount: 240, basis: "flat", confirmed: false, state: "quoted" },
  counts: { requirements: 2, media: 0, usedIn: 3 },
};

const env = (kind: string, id: string, title: string): LibraryEntry => ({
  id, kind, title, subtitle: null, cover: null, tenant: "tenant", tags: [],
  facets: {}, text: null, layer_badges: [], provenance: null, pointer: { href: null },
});
registerLibraryKind({
  kind: "fx-station", label: "Stations", icon: "◆",
  search: async ({ q }) => [
    { entry: env("fx-station", "s1", "Sushi Station"), weight: rankPrefix("Sushi Station", q) },
  ].filter((r) => r.entry.title.toLowerCase().includes(q)),
  pick: (e) => ({ type: "instantiate", instantiateId: e.id, name: e.title }),
  legalDestinations: ["canvas"], dragMime: "text/eventcore-identity",
  drag: (e) => ({ mime: "text/eventcore-identity", payload: JSON.stringify({ identityId: e.id, name: e.title }) }),
});

const money = (n: number) => "$" + n.toFixed(2);

const PX_GOLD = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
const PX_NAVY = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAX+XLSgAAAABJRU5ErkJggg==";
const FIXTURE_PHOTOS: PhotoRecord[] = [
  { id: "ph-venue", url: PX_NAVY, label: "The venue at dusk", tags: ["venue", "room"] },
  { id: "ph-cocktails", url: PX_GOLD, label: "Passed cocktails", tags: ["cocktail", "drinks"] },
];

function App() {
  const [lens, setLens] = useState<string>("design");
  const [xray, setXray] = useState(true);
  const [split, setSplit] = useState(false);
  const [ask, setAsk] = useState("");
  const [shade, setShade] = useState(false);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [selected, setSelected] = useState(false);
  const [sheetLens, setSheetLens] = useState("customer");
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [pubOv, setPubOv] = useState<ThemeDelta | null>(null);
  const [pubDirty, setPubDirty] = useState(false);
  const [pubRoom, setPubRoom] = useState<PubRoom | null>(null);
  const [pubSection, setPubSection] = useState<string | null>(null);
  const [pubPins, setPubPins] = useState<PhotoPins | null>(null);
  const [pubFocusSlot, setPubFocusSlot] = useState<string | null>(null);
  const [facetOrder, setFacetOrder] = useState<string[]>(["configure", "commercial", "media", "usedin"]);
  // v239 — company truth holds EVERYTHING; the projection decides what renders
  const fixtureIdentity = {
    "identity.trade_name": "Event Space by Burger Bar",
    "identity.address": "123 County Line Rd\nJackson, NJ 08527",
    "identity.phone": "(732) 555-0100",
    "identity.email": "events@burgerbar.example",
    "commerce.tax_id": "22-1234567",
    "commerce.ach": "Routing 021000021 · Acct 000123456",
    "legal.supervision": "Under KCL supervision",
  };
  const [achShown, setAchShown] = useState(false);
  // v242 — a fixture template: a document change, dress for the live role,
  // dress for a ghost role, and a pin whose photo the library lacks.
  const FIXTURE_TEMPLATE: { id: string; name: string; portable: PortablePresentation } = {
    id: "tpl-fx-1", name: "Autumn Gallery",
    portable: {
      themeKey: "gallery",
      delta: { colors: { accent: "#8B4513" }, treatments: { document: { cover: "banner" } } },
      sectionDress: { "sec-fx-1": { heading: "eyebrow" }, "role-ghost": { heading: "centered" } },
      sectionPins: { "sec-fx-1": { id: "ph-not-here", url: "x", label: "lost plate" } },
      documentPin: null,
    },
  };
  const [compareOpen, setCompareOpen] = useState(false);
  const [ambigTwin, setAmbigTwin] = useState(false);
  const fixtureCompany = projectIdentity(fixtureIdentity, achShown ? { "commerce.ach": "shown" } : {});
  const patchPub = (d: ThemeDelta) => { setPubOv((prev) => mergeDelta(prev, d)); setPubDirty(true); };
  const resolvedPub = resolveTheme(null, builtInTheme(pubKey), pubOv).theme;
  const saves: string[] = (window as unknown as { __saves: string[] }).__saves
    ?? ((window as unknown as { __saves: string[] }).__saves = []);
  (window as unknown as { __templates: unknown[] }).__templates
    ?? ((window as unknown as { __templates: unknown[] }).__templates = []);
  (window as unknown as { __applied: unknown[] }).__applied
    ?? ((window as unknown as { __applied: unknown[] }).__applied = []);

  return (
    <div style={{ height: "100vh" }} className="flex flex-col bg-[#EEF2F7]">
      <StudioLine
        session={session}
        lensControls={lensEdits(lenses.filter((l) => l.key === lens)[0] ?? null, "presentation")
          ? <PresentationControls
              openRoom={pubRoom} dirty={pubDirty} canEdit
              onOpenRoom={(r) => { setPubSection(null); setPubRoom(r); }}
              onClose={() => setPubRoom(null)}
              onSave={() => { saves.push(JSON.stringify({ key: pubKey, ov: pubOv })); setPubDirty(false); }}
              onDiscard={() => { setPubKey(null); setPubOv(null); setPubDirty(false); }}
            />
          : null}
        backHref="#back"
        title="Goldberg Wedding"
        contactLine="Goldberg · Wedding · Aug 22 · #560018"
        versions={[{ id: "v3", label: "v3" }]}
        versionId="v3" onVersion={() => {}}
        flow={{ label: "Draft", color: "#FDE68A", value: "draft" }}
        onVersionAction={(a) => saves.push("version:" + a)}
        locked={false}
        ask={ask} onAsk={setAsk}
        onOpenShade={() => { setAsk(""); setShade(true); }}
        lenses={lenses} active={lens} onSelect={(k) => setLens(k as string)}
        xray={xray} onXray={setXray}
        split={split} onSplit={setSplit}
        desk={[{ key: "notes", label: "🗒 Notes", onPick: () => {} }]}
      />
      {ask.trim().length > 0 && !shade && (
        <div data-summon-row className="shrink-0 max-h-[34vh] overflow-y-auto shadow-sm border-b border-[#E7EDF5]">
          <LibraryBrowser docked chromeless externalQuery={ask} open={true}
            onClose={() => setAsk("")}
            onInstantiate={() => setAsk("")} />
        </div>
      )}
      {shade && (
        <LibraryBrowser open={shade} onClose={() => setShade(false)}
          onInstantiate={() => setShade(false)} />
      )}

      <div className="flex-1 min-h-0 overflow-y-auto relative" data-stage>
        {lens === "design" && (
          <GhostOutline
            open={ghostOpen} onOpen={setGhostOpen}
            onTravel={(id) => {
              setGhostOpen(false);
              document.querySelector(`[data-chapter='${id}']`)?.scrollIntoView({ block: "start" });
            }}
            ticks={chapters}
            panel={<DesignOutline nodes={outlineNodes} selectedId={null}
              onSelect={() => setGhostOpen(false)} focusedId={null} onFocus={() => {}} xray={true} />}
          />
        )}
        <div data-stage-body
          className={(pubRoom && lens === "customer") || (selected && lens === "design") ? "grid gap-6 px-6" : split ? "grid grid-cols-2 gap-6 px-6" : "px-6"}
          style={pubRoom && lens === "customer" ? { gridTemplateColumns: "minmax(280px,360px) 1fr" }
            : selected && lens === "design" ? { gridTemplateColumns: "1fr minmax(300px,380px)" } : undefined}>
          {pubRoom && lens === "customer" && (
            <PresentationRoomRegion openRoom={pubRoom}
              onOpenRoom={(r) => { setPubSection(null); setPubRoom(r); }}
              onClose={() => setPubRoom(null)}>
              {compareOpen ? (
                <ComparePresentation
                  templateName={FIXTURE_TEMPLATE.name}
                  source={FIXTURE_TEMPLATE.portable}
                  dest={{ themeKey: pubKey, override: pubOv, pins: pubPins }}
                  destSections={[{ id: "sec-fx-1", role: "sec-fx-1", name: "Cocktail Hour" }]
                    .concat(ambigTwin ? [{ id: "sec-fx-1b", role: "sec-fx-1", name: "Cocktail Hour (late)" }] : [])}
                  libraryPhotoIds={FIXTURE_PHOTOS.map((ph) => ph.id)}
                  onClose={() => setCompareOpen(false)}
                  onApply={(decisions: MappingDecisions) => {
                    const destSecs = [{ id: "sec-fx-1", role: "sec-fx-1" }]
                      .concat(ambigTwin ? [{ id: "sec-fx-1b", role: "sec-fx-1" }] : []);
                    const applied = applyPortable(FIXTURE_TEMPLATE.portable, destSecs, decisions);
                    const next = replaceOntoDestination(pubOv, pubPins, applied);
                    (window as unknown as { __applied: unknown[] }).__applied.push(
                      { provenance: makeProvenance(FIXTURE_TEMPLATE.id, FIXTURE_TEMPLATE.portable, "midflight") });
                    setPubKey(FIXTURE_TEMPLATE.portable.themeKey);
                    setPubOv(next.override); setPubPins(next.pins); setPubDirty(false);
                    setCompareOpen(false); setPubRoom(null);
                  }}
                />
              ) : pubRoom === "photography" ? (
                <PhotographyRoom
                  slots={[{ id: "__document__", name: "Goldberg Wedding" }, { id: "sec-fx-1", name: "Cocktail Hour" },
                    { id: "comp:comp-fx-1", name: "Sushi Station" }]}
                  library={FIXTURE_PHOTOS}
                  pins={pubPins}
                  focusSlot={pubFocusSlot}
                  onPin={(slot, ph) => { setPubPins((prev) => pinPhoto(prev, slot, ph)); setPubDirty(true); }}
                  onUnpin={(slot) => { setPubPins((prev) => unpinPhoto(prev, slot)); setPubDirty(true); }}
                />
              ) : (
              <PresentationRooms room={pubRoom} themeKey={pubKey} override={pubOv} resolved={resolvedPub}
                onThemeKey={(k) => { setPubKey(k); setPubDirty(true); }} onPatch={patchPub}
                templates={[{ id: FIXTURE_TEMPLATE.id, name: FIXTURE_TEMPLATE.name, description: null }]}
                onCompareTemplate={() => setCompareOpen(true)}
                onSaveTemplate={() => {
                  const name = window.prompt("Template name:");
                  if (!name) return;
                  (window as unknown as { __templates: unknown[] }).__templates.push(
                    { name, portable: portablePresentation({ themeKey: pubKey, override: pubOv, pins: pubPins }) });
                }} />
              )}
            </PresentationRoomRegion>
          )}
          <main data-paper className={`bg-white shadow-lg rounded-lg my-8 min-h-[60vh] ${split ? "" : "max-w-[820px] mx-auto"}`}>
            {lens === "design" && (
              <div className="p-8">
                {chapters.map((c) => (
                  <section key={c.id} data-chapter={c.id} style={{ minHeight: 500 }}>
                    <h2 className="text-[15px] font-semibold">{c.label}</h2>
                    <button data-fixture-row onClick={() => setSelected(true)}
                      className="mt-2 block w-full text-left px-3 py-2 rounded border border-slate-200 text-[13px]">
                      Nigiri platter — click to interrogate
                    </button>
                  </section>
                ))}
              </div>
            )}
            {lens === "customer" && <ProposalRenderer model={stageModel} xray={false} draftRibbon theme={resolvedPub}
                regions={{ footer: null, signature: null, terms: null }} company={fixtureCompany}
                photos={pubPins}
                onSectionSelect={(sid) => { setPubRoom(null); setPubSection(sid === pubSection ? null : sid); }}
                onDocumentSelect={() => { setPubRoom(null); setPubSection(pubSection === "__document__" ? null : "__document__"); }}
                onComponentSelect={(cid) => { setPubRoom(null); setPubSection(pubSection === "comp:" + cid ? null : "comp:" + cid); }}
                onItemsSelect={(cid) => { setPubRoom(null); setPubSection(pubSection === "items:" + cid ? null : "items:" + cid); }}
                selectedItemsId={pubSection?.indexOf("items:") === 0 ? pubSection.slice(6) : null}
                selectedComponentId={pubSection?.indexOf("comp:") === 0 ? pubSection.slice(5) : null}
                selectedSectionId={pubSection}
                documentSelected={pubSection === "__document__"} />}
            {lens === "production" && <ProductionSheet model={prodModel} />}
          </main>
          {selected && lens === "design" && (
            <InspectorRegion subjectLabel="Sushi Station" onClose={() => setSelected(false)}>
              <Inspector selection={fixtureSel} facetOrder={facetOrder} canEdit canSeeCost money={money} designPanel={null} />
            </InspectorRegion>
          )}
          {split && (
            <div className="my-8 min-h-[60vh] bg-white shadow-lg rounded-lg overflow-hidden flex flex-col" data-paper-second>
              {sheetLens === "v:v2" && (
                <div data-sheet-diff className="shrink-0 px-4 py-1 text-[10.5px] text-slate-500 bg-[#FAFBFD] border-b">
                  {"vs v3: " + formatVersionDiff(fixtureDiff, money)}
                </div>
              )}
              <div className="flex-1 min-h-0">
              <SecondSheet
                options={liveOptions}
                onSheetLens={setSheetLens}
                projections={{
                  customer: <ProposalRenderer model={stageModel} xray={false} draftRibbon />,
                  production: <ProductionSheet model={prodModel} />,
                  "v:v2": <ProposalRenderer model={oldStageModel} xray={false} />,
                }}
              />
              </div>
            </div>
          )}
        </div>
        <button data-swap-facets className="hidden" onClick={() => setFacetOrder(["usedin", "media", "commercial", "configure"])} />
        <button data-show-ach className="hidden" onClick={() => setAchShown(true)} />
        <button data-ambig-twin className="hidden" onClick={() => setAmbigTwin(true)} />
        <button data-render-pdf className="hidden" onClick={() => void (async () => {
          const brand = await fetchBrandFonts("/fontsource");   // the harness server carries the woffs
          const { bytes, artifact } = await renderToPdf(
            { model: stageModel, theme: resolvedPub, regions: { footer: null, signature: "Ben Grossman", terms: "Terms." },
              company: fixtureCompany, pins: pubPins }, "harness-stamp", brand ?? undefined);
          (window as unknown as { __pdf: unknown }).__pdf = {
            head: String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]),
            pages: artifact.pages.length,
            provenance: artifact.provenance,
            outline: (artifact.outline ?? []).length,
            secondPageNumber: (artifact.pages[1] as { proof?: { pageNumber?: { text?: string } } })?.proof?.pageNumber?.text ?? null,
          };
        })()} />
        <Meter perPerson={money(100)} totalLabel="Goldberg evening" total={money(18000)}
          debt={3} onDebt={() => setSelected(true)} />
      </div>


      <span data-sheet-mirror style={{ display: "none" }}>{sheetLens}</span>
      {lens === "customer" && pubSection && (
        <TreatmentToolbar
          selection={pubSection === "__document__" ? { kind: "document" }
            : pubSection.indexOf("items:") === 0 ? { kind: "item", id: pubSection.slice(6), name: "Sushi Station · items" }
            : pubSection.indexOf("comp:") === 0 ? { kind: "component", id: pubSection.slice(5), name: "Sushi Station" }
            : { kind: "section", id: pubSection, name: "Cocktail Hour" }}
          resolved={resolvedPub}
          onPatch={patchPub}
          onChoosePhoto={() => {
            setPubFocusSlot(pubSection); setPubSection(null); setPubRoom("photography");
          }}
          onClose={() => setPubSection(null)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
