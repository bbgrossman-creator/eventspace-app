"use client";
// ═══════════════════════════════════════════════════════════════════════════
// BRAND STUDIO (v227 · PUBLICATION §8) — the company's identity: the Brand
// rung every proposal inherits. Edits are draft state; "Save brand" commits;
// "Save as theme…" names the draft as a reusable theme. Logo, photo style,
// signature, footer, and terms join when their systems land (§1 reserved).
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import PageGuard from "@/components/PageGuard";
import BrandKit from "@/components/BrandKit";
import ProposalRenderer from "@/components/ProposalRenderer";
import { PresentationModel } from "@/lib/presentation";
import { ThemeDelta, RegionTexts, resolveTheme, mergeDelta, BUILT_IN_THEMES } from "@/lib/publication";
import CompanyIdentityPanel from "@/components/studio/CompanyIdentityPanel";
import { CompanyIdentity, PublicationPolicy, projectIdentity } from "@/lib/identity";
import { getCompanyIdentity, saveCompanyIdentity, saveCompanyPolicy } from "@/lib/identityData";
import {
  getPublicationSettings, saveBrand, saveDefaultTheme, saveRegionTexts,
  listPublicationThemes, createPublicationTheme, PublicationTheme,
} from "@/lib/publicationData";

// A tiny fixture publication so the brand is designed AGAINST A DOCUMENT,
// not against swatches in a void — the paper stays the hero even here.
const SPECIMEN: PresentationModel = {
  title: "Your Company — Specimen Proposal",
  status: "draft",
  eventLine: "An evening, catered beautifully",
  sections: [{
    id: "spec-1", name: "Cocktail Hour",
    bands: [{ label: "", description: null, components: [
      { id: "spec-comp-1", title: "Passed Hors d'Oeuvres", description: "A confident opening.", note: null, isPackage: false,
        priceLabel: "$18 / person", priceStatus: "quoted", blocks: [], choice: null },
    ] }],
    choiceGroups: [], subtotalLabel: null,
  }],
  summary: { rows: [], totalLabel: "$4,250", perPersonLabel: null },
  hasUnconfirmedVisiblePrice: false,
} as unknown as PresentationModel;

function BrandStudio() {
  const [saved, setSaved] = useState<{ brand: ThemeDelta | null; def: string | null; words: RegionTexts } | null>(null);
  const [draft, setDraft] = useState<ThemeDelta | null>(null);
  const [defKey, setDefKey] = useState<string | null>(null);
  const [words, setWords] = useState<RegionTexts>({ footer: null, signature: null, terms: null });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [themes, setThemes] = useState<PublicationTheme[]>([]);
  const [identity, setIdentity] = useState<CompanyIdentity>({});
  const [policy, setPolicy] = useState<PublicationPolicy>({});
  const [note, setNote] = useState("");

  useEffect(() => {
    getPublicationSettings().then((st) => {
      setSaved({ brand: st.brand, def: st.defaultThemeKey, words: st.regionTexts });
      setDraft(st.brand); setDefKey(st.defaultThemeKey); setWords(st.regionTexts);
    });
    listPublicationThemes().then(setThemes);
    getCompanyIdentity().then((co) => { setIdentity(co.identity); setPolicy(co.policy); });
  }, []);

  const resolved = useMemo(() => resolveTheme(draft, null, null).theme, [draft]);

  if (!saved) return <div className="text-sm text-slate-400">Loading the brand…</div>;

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <h1 className="page-title">Brand Studio</h1>
        <p className="text-sm text-slate-500 mt-1">
          The company&apos;s look. Every proposal inherits this; versions override only what they need.
          Sent proposals keep the dress they were stamped with — changing the brand never rewrites history.
        </p>
      </header>
      {note && <p className="rounded-lg bg-[#F0FDF4] ring-1 ring-[#BBF7D0] text-[#166534] text-xs px-3 py-2 mb-3">{note}</p>}
      <div className="flex gap-8 items-start flex-wrap">
        <BrandKit
          draft={draft}
          resolved={resolved}
          dirty={dirty}
          busy={busy}
          defaultThemeKey={defKey}
          regionTexts={words}
          onRegionText={(k, v) => { setWords((prev) => ({ ...prev, [k]: v || null })); setDirty(true); }}
          themeChoices={[
            ...BUILT_IN_THEMES.map((t) => ({ key: t.key, label: t.label })),
            ...themes.map((t) => ({ key: t.id, label: t.name })),
          ]}
          onPatch={(d) => { setDraft((prev) => mergeDelta(prev, d)); setDirty(true); }}
          onDefaultTheme={(k) => { setDefKey(k === "__brand__" ? null : k); setDirty(true); }}
          onSave={() => void (async () => {
            setBusy(true);
            const ok = (await saveBrand(draft)) && (await saveDefaultTheme(defKey)) && (await saveRegionTexts(words))
              && (await saveCompanyIdentity(identity)) && (await saveCompanyPolicy(policy));
            setBusy(false);
            if (!ok) { setNote(""); alert("Could not save — run v227_brand.sql?"); return; }
            setSaved({ brand: draft, def: defKey, words }); setDirty(false);
            setNote("✓ Brand saved — new proposals are born wearing it.");
          })()}
          onDiscard={() => { setDraft(saved.brand); setDefKey(saved.def); setWords(saved.words); setDirty(false); }}
          onSaveAsTheme={(name) => void (async () => {
            setBusy(true);
            const made = await createPublicationTheme(name, draft ?? {});
            setBusy(false);
            if (!made) { alert("Could not save the theme — run v227_brand.sql?"); return; }
            setThemes((prev) => prev.concat([made]));
            setNote(`✓ "${made.name}" saved as a theme — it's on every Studio's Appearance shelf now.`);
          })()}
        />
        <CompanyIdentityPanel identity={identity} policy={policy}
          onFact={(k, v) => { setIdentity((prev) => ({ ...prev, [k]: v })); setDirty(true); }}
          onPolicy={(k, v) => { setPolicy((prev) => { const n = { ...prev }; if (v) n[k] = v; else delete n[k]; return n; }); setDirty(true); }} />
        <div className="flex-1 min-w-[380px]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Specimen — live</p>
          <div className="rounded-lg shadow-xl overflow-hidden ring-1 ring-[#E7EDF5]">
            <ProposalRenderer model={SPECIMEN} draftRibbon={false} theme={resolved} regions={words} company={projectIdentity(identity, policy)} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BrandPage() {
  return <PageGuard perm="config.manage"><BrandStudio /></PageGuard>;
}
