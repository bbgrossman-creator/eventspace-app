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
import ProductionSheet from "@/components/studio/renderers/ProductionSheet";
import { composeProductionModel, ProductionInputs } from "@/lib/productionLens";
import { PresentationModel } from "@/lib/presentation";
import { visibleLenses } from "@/lib/lenses";
import { Capabilities } from "@/lib/capabilities";
import { Session } from "@/lib/permissions";
import { registerLibraryKind, rankPrefix, LibraryEntry } from "@/lib/libraryRegistry";
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
  .map((l) => ({ key: l.key as string, label: l.label, blurb: l.blurb }));

const stageModel: PresentationModel = {
  title: "The Goldberg Wedding", eventLine: "Wedding · 180 guests",
  intro: null, closing: null, priceVisibility: "hidden",
  sections: [{ name: "Cocktail Hour", bands: [{ label: "", description: null,
    components: [{ title: "Sushi Station", description: null, note: null, isPackage: false,
      priceLabel: null, priceStatus: "none", blocks: [], choice: null }] }],
    choiceGroups: [], subtotalLabel: null }],
  totalLabel: null, status: "draft", hasUnconfirmedVisiblePrice: false, summary: null,
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

function App() {
  const [lens, setLens] = useState<string>("design");
  const [xray, setXray] = useState(true);
  const [split, setSplit] = useState(false);
  const [ask, setAsk] = useState("");
  const [shade, setShade] = useState(false);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [selected, setSelected] = useState(false);
  const [sheetLens, setSheetLens] = useState("customer");

  return (
    <div style={{ height: "100vh" }} className="flex flex-col bg-[#EEF2F7]">
      <StudioLine
        session={session}
        backHref="#back"
        title="Goldberg Wedding"
        contactLine="Goldberg · Wedding · Aug 22 · #560018"
        versions={[{ id: "v3", label: "v3" }]}
        versionId="v3" onVersion={() => {}}
        flow={{ label: "Draft", color: "#FDE68A" }}
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
        <div className={split ? "grid grid-cols-2 gap-6 px-6" : "px-6"} data-stage-body>
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
            {lens === "customer" && <ProposalRenderer model={stageModel} xray={false} draftRibbon />}
            {lens === "production" && <ProductionSheet model={prodModel} />}
          </main>
          {split && (
            <div className="my-8 min-h-[60vh] bg-white shadow-lg rounded-lg overflow-hidden" data-paper-second>
              <SecondSheet
                options={liveOptions}
                onSheetLens={setSheetLens}
                projections={{
                  customer: <ProposalRenderer model={stageModel} xray={false} draftRibbon />,
                  production: <ProductionSheet model={prodModel} />,
                }}
              />
            </div>
          )}
        </div>
        <Meter perPerson={money(100)} totalLabel="Goldberg evening" total={money(18000)}
          debt={3} onDebt={() => setSelected(true)} />
      </div>

      <Drawer open={selected} title="Inspector" onClose={() => setSelected(false)}>
        <Inspector selection={fixtureSel} lens="design" canEdit canSeeCost money={money} designPanel={null} />
      </Drawer>
      <span data-sheet-mirror style={{ display: "none" }}>{sheetLens}</span>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
