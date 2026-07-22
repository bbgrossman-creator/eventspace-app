// harness/lifecycle.harness.tsx — THE ADVERTISING RULE (STUDIO_COMPOSITION
// §14), mounted over the REAL organs: the real DesignStage (its click
// affordances are provable in this container — only real-mouse DRAGS are
// environmentally quarantined) and the real Inspector inside the real
// Drawer. window.__adverts records every host callback; the claims are that
// each level advertises exactly its own children and its own removal, and
// that read-only advertises nothing.
//   ?mode=edit (default) · ?mode=readonly
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import DesignStage, { StageChapter } from "@/components/studio/renderers/DesignStage";
import Inspector, { InspectorSelection } from "@/components/studio/Inspector";
import { Drawer } from "@/components/studio/StageFurniture";
import VersionGenesis from "@/components/studio/VersionGenesis";
import SectionPicker from "@/components/studio/SectionPicker";
import VersionThread from "@/components/VersionThread";
import BrandKit from "@/components/BrandKit";
import { ThemeDelta, resolveTheme, mergeDelta, BUILT_IN_THEMES } from "@/lib/publication";
import { ProposalVersion } from "@/lib/proposals";
import ArchetypePick from "@/components/ArchetypePick";
import { bootMoves } from "@/lib/moves/boot";
bootMoves();

const mode = new URLSearchParams(window.location.search).get("mode") ?? "edit";
const adverts: string[] = [];
(window as unknown as { __adverts: string[] }).__adverts = adverts;
const rec = (x: string) => { adverts.push(x); };

const item = (id: string, name: string) => ({
  id, name, unitPrice: 12, basis: "per_person", priceState: "quoted", confirmed: true,
  visible: true, optional: false, categoryKey: null, choiceGroupId: null,
});
const CHAPTERS: StageChapter[] = [
  { id: "ch-cocktail", name: "Cocktail Hour", subtotal: 2950, components: [
    { id: "comp-sushi", title: "Sushi Station", isPackage: false, packagePrice: null,
      packageBasis: null, packageConfirmed: false, display: "full", note: null,
      subtotal: 2950, categories: [{ key: null, label: null, layout: "list",
        items: [item("it-nigiri", "Nigiri platter"), item("it-maki", "Maki boards")] }] },
  ] },
  { id: "ch-dinner", name: "Dinner", subtotal: null, components: [] },
];

function GenesisHost() {
  const [open, setOpen] = useState(true);
  if (!open) return <p data-genesis-closed>closed — no version created</p>;
  return (
    <VersionGenesis
      reviseTarget={{ label: "Revise v3 — the version you're viewing", blurb: "Copies everything on v3 into a new draft." }}
      otherVersions={[
        { id: "v2", label: "v2", statusLabel: "Sent", date: "6/1/2026", count: 14 },
        { id: "v1", label: "v1", statusLabel: "Draft", date: "5/12/2026", count: 9 },
      ]}
      onRevise={() => { rec("genesis:revise"); setOpen(false); }}
      onCopyVersion={(id) => { rec(`genesis:copy:${id}`); setOpen(false); }}
      onBlank={() => { rec("genesis:blank"); setOpen(false); }}
      onCancel={() => { rec("genesis:cancel"); setOpen(false); }}
    />
  );
}

function PickerHost() {
  const [open, setOpen] = useState(true);
  if (!open) return <p data-picker-closed>closed</p>;
  return (
    <SectionPicker
      types={[
        { id: "t-dinner", name: "Dinner", active: true, category: "Food" },
        { id: "t-late", name: "Late Night", active: true, category: "Food" },
        { id: "t-ceremony", name: "Ceremony", active: true, category: "Event" },
        { id: "t-floral", name: "Floral", active: true, category: "Presentation" },
        { id: "t-custom", name: "After Party", active: true },
      ]}
      present={[{ section_type_id: "t-dinner" }]}
      onPick={(id) => { rec(`pick:${id}`); setOpen(false); }}
      onCreate={(name) => { rec(`coin:${name}`); setOpen(false); }}
      onCancel={() => { rec("picker:cancel"); setOpen(false); }}
    />
  );
}

function ArchetypeHost() {
  const [v, setV] = useState<string | null>(null);
  return (
    <div className="p-8 w-[360px]">
      <ArchetypePick value={v} onChange={(k) => { rec(`arch:${k}`); setV(k); }} />
      <p data-arch-value>{v ?? "unanswered"}</p>
    </div>
  );
}

const fxV = (id: string, version: number, status: string, approved = false, archivedAt: string | null = null): ProposalVersion => ({
  id, proposal_id: "p1", version, status: status as ProposalVersion["status"], notes: null,
  sent_at: null, approved_at: approved ? "2026-06-01T00:00:00Z" : null, approved_by: null,
  created_at: "2026-05-01T00:00:00Z", archived_at: archivedAt, archived_reason: archivedAt ? "superseded" : null,
});

function ThreadHost() {
  const [genesisOpen, setGenesisOpen] = useState(false);
  return (
    <div className="p-6 w-[720px]">
      <VersionThread
        versions={[
          fxV("v1", 1, "approved", true),
          fxV("v2", 2, "sent", false, "2026-07-01T00:00:00Z"),   // archived MID-thread
          fxV("v3", 3, "sent"),
          fxV("v4", 4, "draft", false, "2026-06-15T00:00:00Z"),  // the LATEST is archived — current falls to v3
        ]}
        compCounts={{ v1: 9, v2: 14, v3: 17, v4: 3 }}
        wonVersionId={"v1"}
        proposalOpen={true}
        studioHref={(id) => `#studio-${id}`}
        onNewVersion={() => { rec("thread:open-genesis"); setGenesisOpen(true); }}
        onStatus={(v, next) => rec(`status:${v.id}:${next}`)}
        onArchiveVersion={(v) => rec(`archive:${v.id}`)}
        onRestoreVersion={(v) => rec(`restore:${v.id}`)}
        onTogglePricing={(id) => rec(`pricing:${id}`)}
        pricingOpen={{}}
      />
      {genesisOpen && (
        <VersionGenesis
          reviseTarget={{ label: "Revise latest version — v3", blurb: "Copies everything on v3 (17 components) into a new draft." }}
          otherVersions={[
            { id: "v2", label: "v2", statusLabel: "Sent", date: "5/1/2026", count: 14 },
            { id: "v1", label: "v1", statusLabel: "Approved", date: "5/1/2026", count: 9 },
          ]}
          onRevise={() => { rec("genesis:revise"); setGenesisOpen(false); }}
          onCopyVersion={(id) => { rec(`genesis:copy:${id}`); setGenesisOpen(false); }}
          onBlank={() => { rec("genesis:blank"); setGenesisOpen(false); }}
          onCancel={() => { rec("genesis:cancel"); setGenesisOpen(false); }}
        />
      )}
    </div>
  );
}

function BrandHost() {
  const [draft, setDraft] = useState<ThemeDelta | null>(null);
  const [dirty, setDirty] = useState(false);
  const [defKey, setDefKey] = useState<string | null>(null);
  const [words, setWords] = useState<{ footer: string | null; signature: string | null; terms: string | null }>({ footer: null, signature: null, terms: null });
  const resolved = resolveTheme(draft, null, null).theme;
  return (
    <div className="p-6 bg-white min-h-screen">
      <BrandKit
        draft={draft} resolved={resolved} dirty={dirty}
        regionTexts={words}
        onRegionText={(k, v) => { setWords((prev) => ({ ...prev, [k]: v || null })); setDirty(true); }}
        defaultThemeKey={defKey}
        themeChoices={BUILT_IN_THEMES.map((t) => ({ key: t.key, label: t.label }))}
        onPatch={(d) => { setDraft((prev) => mergeDelta(prev, d)); setDirty(true); }}
        onDefaultTheme={(k) => { setDefKey(k === "__brand__" ? null : k); setDirty(true); rec(`default:${k}`); }}
        onSave={() => { rec(`brand-save:${JSON.stringify(draft)}:${JSON.stringify(words)}`); setDirty(false); }}
        onDiscard={() => { setDraft(null); setDirty(false); rec("brand-discard"); }}
        onSaveAsTheme={(name) => rec(`theme-save:${name}:${JSON.stringify(draft)}`)}
      />
      <span data-brand-resolved-primary style={{ display: "none" }}>{resolved.colors.primary}</span>
    </div>
  );
}

function App() {
  const mayEdit = mode !== "readonly";
  const [selected, setSelected] = useState<string | null>(null);
  const sel: InspectorSelection | null = selected === "comp-sushi"
    ? { kind: "component", id: "comp-sushi", title: "Sushi Station", subtitle: "Cocktail Hour" }
    : selected === "it-nigiri"
      ? { kind: "item", id: "it-nigiri", title: "Nigiri platter", subtitle: "Sushi Station",
          price: { amount: 12, basis: "per_person", confirmed: true, state: "quoted" } }
      : null;
  return (
    <div style={{ height: "100vh" }} className="overflow-y-auto bg-[#E9EDF3]">
      <main data-paper className="bg-white shadow-lg rounded my-8 mx-auto max-w-[840px] px-6 py-8">
        <DesignStage
          chapters={CHAPTERS}
          selectedId={selected}
          onSelect={setSelected}
          focusedId={null}
          xray={true}
          mayEdit={mayEdit}
          onPatchComponent={() => {}}
          onPatchItem={() => {}}
          onAddComponent={(chId) => rec(`add-component:${chId}`)}
          onAddItem={(compId, key) => rec(`add-item:${compId}:${key ?? "-"}`)}
          onAddChapter={() => rec("add-moment")}
          onChapterAction={(chId, action) => rec(`chapter:${action}:${chId}`)}
          onComponentAction={(id, action) => rec(`remove:component:${id}`)}
          onItemAction={(id, action) => rec(`remove:item:${id}`)}
          money={(n) => "$" + n.toFixed(2)}
        />
      </main>
      <Drawer open={!!sel} title="Inspector" onClose={() => setSelected(null)}>
        {sel && (
          <Inspector selection={sel} lens="design" canEdit={mayEdit} canSeeCost
            money={(n) => "$" + n.toFixed(2)} designPanel={null}
            onRemove={() => { rec(`remove:${sel.kind}:${sel.id}`); setSelected(null); }}
            removeLabel={sel.kind === "component" ? "Remove this component from the design…" : "Remove this item…"} />
        )}
      </Drawer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  mode === "genesis" ? <div style={{ height: "100vh" }}><GenesisHost /></div>
  : mode === "picker" ? <div style={{ height: "100vh" }}><PickerHost /></div>
  : mode === "archetype" ? <div style={{ height: "100vh" }}><ArchetypeHost /></div>
  : mode === "thread" ? <div style={{ height: "100vh" }} className="overflow-y-auto bg-white"><ThreadHost /></div>
  : mode === "brand" ? <div style={{ height: "100vh" }} className="overflow-y-auto"><BrandHost /></div>
  : <App />);
