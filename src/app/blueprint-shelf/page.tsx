"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE BLUEPRINT SHELF — authoring surface (v252 · BP-2).
// Company-level room for the CONSTITUTIONAL blueprint (PUBLICATION_BLUEPRINTS
// — stable identity over immutable revisions). NOT the legacy v182 pointer
// surface at /blueprints, which is untouched and reserved for BP-5.
//
// What this surface does: shelf verbs (BP-1's, unmodified — begin draft ·
// publish with the intent ceremony · retire · reinstate), and DRAFT
// authoring over the lawful content shape (blueprintContent.ts): structure,
// component entries by definition IDENTITY, configuration deltas, item
// selections, choice groups, pricing intent, constraints, parameters,
// portable presentation by value with template provenance.
//
// What it cannot do, by construction: instantiate, create designs, resolve
// definition revisions, look up or confirm prices, evaluate parameters or
// conditions, promote, register in the Library, or touch the legacy table.
// Saves REFUSE invalid content, staged and named — application never
// guesses, and refusals are displayed, never repaired silently.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from "react";
import PageGuard from "@/components/PageGuard";
import {
  BlueprintIdentity, BlueprintRevision,
  PUBLISH_DECLARATION, publishRefusal, identityVerbs, revisionVerbs,
} from "@/lib/blueprintShelf";
import {
  listBlueprintIdentities, getBlueprintIdentity, listRevisions,
  createBlueprintIdentity, beginDraft, saveDraftContent, discardDraft,
  publishRevision, retireIdentity, reinstateIdentity,
} from "@/lib/blueprintShelfSupabase";
import {
  BlueprintContent, ComponentEntry, PricingIntent, ParameterDecl,
  emptyContent, validateBlueprintContent, attachTemplatePresentation,
  PRICING_INTENT_FORMS, PARAMETER_TYPES,
} from "@/lib/blueprintContent";
import {
  DefinitionIdentity, PresentationTemplate,
  listDefinitionIdentities, listPresentationTemplates,
} from "@/lib/blueprintAuthoringSupabase";
import BlueprintInstantiate from "@/components/BlueprintInstantiate";

const NAVY = "#102F56";
const uid = () => Math.random().toString(36).slice(2, 10);

export default function BlueprintShelfPage() {
  return (
    <PageGuard perm="content.manage" cap="proposals">
      <ShelfInner />
    </PageGuard>
  );
}

function ShelfInner() {
  const [identities, setIdentities] = useState<BlueprintIdentity[]>([]);
  const [showRetired, setShowRetired] = useState(false);
  const [selected, setSelected] = useState<BlueprintIdentity | null>(null);
  const [revisions, setRevisions] = useState<BlueprintRevision[]>([]);
  const [openRevision, setOpenRevision] = useState<BlueprintRevision | null>(null);
  const [newName, setNewName] = useState("");
  const [newTaxonomy, setNewTaxonomy] = useState("");
  const [err, setErr] = useState("");

  const loadList = useCallback(async () => {
    try { setIdentities(await listBlueprintIdentities(true)); setErr(""); }
    catch { setErr("Couldn't load the shelf — run v251_blueprints_shelf.sql."); }
  }, []);
  useEffect(() => { void loadList(); }, [loadList]);

  const openIdentity = useCallback(async (id: string) => {
    const ident = await getBlueprintIdentity(id);
    setSelected(ident);
    setOpenRevision(null);
    setRevisions(ident ? await listRevisions(ident.id) : []);
  }, []);

  const refresh = useCallback(async () => {
    await loadList();
    if (selected) await openIdentity(selected.id);
  }, [loadList, openIdentity, selected]);

  const visible = identities.filter((i) => showRetired || i.status === "active");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold" style={{ color: NAVY }}>Blueprint Shelf</h1>
      <p className="text-sm text-slate-500 mt-1">
        Reusable design knowledge — how we repeatedly design each class of event.
        Identities are stable; published revisions are immutable; publication requires intent.
      </p>
      {err && <div className="mt-3 text-sm text-rose-600">{err}</div>}

      <div className="mt-5 grid grid-cols-[280px_1fr] gap-6">
        <div>
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium text-slate-600">Identities</div>
            <label className="text-[11px] text-slate-400 flex items-center gap-1">
              <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
              retired
            </label>
          </div>
          <div className="mt-2 space-y-1">
            {visible.map((i) => (
              <button key={i.id} data-shelf-identity onClick={() => void openIdentity(i.id)}
                className={`w-full text-left px-3 py-2 rounded-md ring-1 text-[13px] ${
                  selected?.id === i.id ? "ring-[#102F56] bg-[#F3F7FC]" : "ring-[#E7EDF5] bg-white hover:bg-[#FAFBFD]"}`}>
                <div className="font-medium text-slate-700">{i.name}</div>
                <div className="text-[11px] text-slate-400">
                  {i.taxonomy ?? "—"} · {i.status}{i.published_revision_id ? " · published" : ""}
                </div>
              </button>
            ))}
            {visible.length === 0 && <div className="text-[12px] text-slate-400 px-1 py-2">Empty is correct on day one.</div>}
          </div>
          <div className="mt-4 rounded-md ring-1 ring-[#E7EDF5] bg-white p-3">
            <div className="text-[12px] font-medium text-slate-600">New identity</div>
            <input data-new-name value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name (e.g., Wedding Reception)"
              className="mt-2 w-full text-[13px] px-2 py-1.5 rounded ring-1 ring-[#E7EDF5]" />
            <input data-new-taxonomy value={newTaxonomy} onChange={(e) => setNewTaxonomy(e.target.value)} placeholder="Taxonomy (optional)"
              className="mt-2 w-full text-[13px] px-2 py-1.5 rounded ring-1 ring-[#E7EDF5]" />
            <button data-create-identity disabled={!newName.trim()}
              onClick={() => void (async () => {
                await createBlueprintIdentity(newName.trim(), newTaxonomy.trim() || null);
                setNewName(""); setNewTaxonomy(""); await loadList();
              })()}
              className="mt-2 text-[12px] px-3 py-1.5 rounded-md text-white disabled:opacity-40" style={{ background: NAVY }}>
              Create
            </button>
          </div>
        </div>

        <div>
          {!selected && <div className="text-[13px] text-slate-400 mt-8">Select an identity to see its chain.</div>}
          {selected && (
            <IdentityPanel
              identity={selected} revisions={revisions}
              openRevision={openRevision} setOpenRevision={setOpenRevision}
              refresh={refresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function IdentityPanel(props: {
  identity: BlueprintIdentity;
  revisions: BlueprintRevision[];
  openRevision: BlueprintRevision | null;
  setOpenRevision: (r: BlueprintRevision | null) => void;
  refresh: () => Promise<void>;
}) {
  const { identity, revisions } = props;
  const verbs = identityVerbs(identity);
  const published = revisions.find((r) => r.id === identity.published_revision_id) ?? null;
  const draft = revisions.find((r) => r.state === "draft") ?? null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-slate-800">{identity.name}</div>
          <div className="text-[12px] text-slate-400">{identity.taxonomy ?? "—"} · {identity.status}</div>
        </div>
        <div className="flex items-center gap-2">
          {identity.status === "active" && published && (
            <BlueprintInstantiate revisionId={published.id} revisionNumber={published.revision_number} blueprintName={identity.name} />
          )}
          {verbs.includes("begin_draft") && !draft && (
            <button data-begin-draft className="text-[12px] px-3 py-1.5 rounded-md ring-1 ring-[#E7EDF5] bg-white hover:bg-[#FAFBFD]"
              onClick={() => void (async () => {
                const d = await beginDraft(identity.id, published ?? undefined);
                await props.refresh();
                if (d) props.setOpenRevision(d);
              })()}>
              Begin draft{published ? ` (seeded from r${published.revision_number})` : ""}
            </button>
          )}
          {verbs.includes("retire") && (
            <button data-retire className="text-[12px] px-3 py-1.5 rounded-md ring-1 ring-[#E7EDF5] bg-white hover:bg-[#FAFBFD] text-slate-500"
              onClick={() => void (async () => { await retireIdentity(identity.id); await props.refresh(); })()}>
              Retire
            </button>
          )}
          {verbs.includes("reinstate") && (
            <button data-reinstate className="text-[12px] px-3 py-1.5 rounded-md text-white" style={{ background: NAVY }}
              onClick={() => void (async () => { await reinstateIdentity(identity.id); await props.refresh(); })()}>
              Reinstate
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {revisions.map((r) => (
          <button key={r.id} data-revision={r.revision_number}
            onClick={() => props.setOpenRevision(r)}
            className={`text-[12px] px-2.5 py-1 rounded-md ring-1 ${
              props.openRevision?.id === r.id ? "ring-[#102F56] bg-[#F3F7FC]" : "ring-[#E7EDF5] bg-white"}`}>
            r{r.revision_number} · {r.state}
          </button>
        ))}
        {revisions.length === 0 && <div className="text-[12px] text-slate-400">No revisions yet — begin a draft.</div>}
      </div>

      {props.openRevision && props.openRevision.state === "draft" && identity.status === "active" && (
        <DraftEditor key={props.openRevision.id} identity={identity} draft={props.openRevision} refresh={props.refresh} />
      )}
      {props.openRevision && props.openRevision.state !== "draft" && (
        <ReadOnlyRevision revision={props.openRevision} />
      )}
    </div>
  );
}

function ReadOnlyRevision({ revision }: { revision: BlueprintRevision }) {
  const c = revision.content as BlueprintContent | null;
  return (
    <div data-readonly-revision className="mt-4 rounded-md ring-1 ring-[#E7EDF5] bg-white p-4">
      <div className="text-[12px] text-slate-400">
        r{revision.revision_number} · {revision.state} — immutable
        {revision.published_at ? ` · published ${new Date(revision.published_at).toLocaleDateString()}` : ""}
        {revision.seeded_from_revision_id ? " · seeded" : ""}
      </div>
      <div className="mt-2 text-[13px] text-slate-600">
        {(c?.structure ?? []).length} chapter(s) ·{" "}
        {(c?.structure ?? []).reduce((n, ch) => n + ch.sections.length, 0)} section(s) ·{" "}
        {(c?.parameters ?? []).length} parameter(s)
        {c?.presentation ? " · presentation attached" : ""}
        {c?.presentation?.provenance ? ` (from template, ${c.presentation.provenance.fingerprint.slice(0, 8)}…)` : ""}
      </div>
      <div className="mt-1 text-[11px] text-slate-400">Amendment is supersession — begin a new draft to change anything.</div>
    </div>
  );
}

function DraftEditor(props: { identity: BlueprintIdentity; draft: BlueprintRevision; refresh: () => Promise<void> }) {
  const initial = useMemo<BlueprintContent>(() => {
    const c = props.draft.content as BlueprintContent | null;
    return c && typeof c === "object" && Array.isArray((c as BlueprintContent).structure) ? c : emptyContent();
  }, [props.draft.content]);
  const [content, setContent] = useState<BlueprintContent>(initial);
  const [dirty, setDirty] = useState(false);
  const [refusals, setRefusals] = useState<string[]>([]);
  const [defs, setDefs] = useState<DefinitionIdentity[]>([]);
  const [templates, setTemplates] = useState<PresentationTemplate[]>([]);
  const [ceremony, setCeremony] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void listDefinitionIdentities().then(setDefs).catch(() => setDefs([]));
    void listPresentationTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const patch = (fn: (c: BlueprintContent) => BlueprintContent) => {
    setContent((c) => fn(structuredClone(c)));
    setDirty(true);
  };

  const save = async () => {
    const v = validateBlueprintContent(content);
    setRefusals(v.refusals);
    if (!v.ok) return;
    setBusy(true);
    try { await saveDraftContent(props.draft, content); setDirty(false); setNotice("Saved."); }
    finally { setBusy(false); }
  };

  const gateReason = publishRefusal(PUBLISH_DECLARATION);
  const verbs = revisionVerbs("draft");

  return (
    <div className="mt-4 rounded-md ring-1 ring-[#E7EDF5] bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-medium text-slate-700">
          Draft r{props.draft.revision_number}
          {props.draft.seeded_from_revision_id && <span className="text-slate-400 font-normal"> · seeded</span>}
        </div>
        <div className="flex items-center gap-2">
          {verbs.includes("edit") && (
            <button data-save disabled={busy || !dirty} onClick={() => void save()}
              className="text-[12px] px-3 py-1.5 rounded-md ring-1 ring-[#E7EDF5] bg-white hover:bg-[#FAFBFD] disabled:opacity-40">
              Save draft
            </button>
          )}
          {verbs.includes("publish") && (
            <button data-open-ceremony disabled={busy || dirty || gateReason === "CAPABILITY_REQUIRED"}
              title={gateReason === "CAPABILITY_REQUIRED" ? "Requires the Curate Organizational Knowledge capability" : dirty ? "Save first" : ""}
              onClick={() => setCeremony(true)}
              className="text-[12px] px-3 py-1.5 rounded-md text-white disabled:opacity-40" style={{ background: NAVY }}>
              Publish…
            </button>
          )}
          {verbs.includes("discard") && (
            <button data-discard disabled={busy}
              onClick={() => void (async () => { await discardDraft(props.draft); await props.refresh(); })()}
              className="text-[12px] px-3 py-1.5 rounded-md ring-1 ring-[#E7EDF5] text-slate-400 hover:text-rose-600">
              Discard
            </button>
          )}
        </div>
      </div>
      {notice && !dirty && <div className="mt-1 text-[11px] text-emerald-600">{notice}</div>}

      {refusals.length > 0 && (
        <div data-refusals className="mt-3 rounded-md bg-rose-50 ring-1 ring-rose-200 p-3">
          <div className="text-[12px] font-medium text-rose-700">The draft was refused — nothing was saved:</div>
          <ul className="mt-1 space-y-0.5">
            {refusals.map((r, i) => <li key={i} className="text-[12px] text-rose-600">· {r}</li>)}
          </ul>
        </div>
      )}

      <StructureEditor content={content} defs={defs} patch={patch} />
      <ConstraintsEditor content={content} patch={patch} />
      <ParametersEditor content={content} patch={patch} />
      <PresentationEditor content={content} templates={templates} patch={patch} />

      {ceremony && (
        <div data-ceremony className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5">
            <div className="text-[15px] font-semibold" style={{ color: NAVY }}>Publish r{props.draft.revision_number}</div>
            <p className="mt-2 text-[13px] text-slate-600">
              Publishing freezes this revision and offers it for instantiation. Amendment from here is supersession.
              Publication requires intent, not merely authority — affirm the declaration:
            </p>
            <div data-declaration className="mt-3 rounded-md bg-[#F3F7FC] ring-1 ring-[#E7EDF5] p-3 text-[13px] font-medium text-slate-700">
              {PUBLISH_DECLARATION}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button data-ceremony-cancel onClick={() => setCeremony(false)}
                className="text-[12px] px-3 py-1.5 rounded-md ring-1 ring-[#E7EDF5]">Cancel</button>
              <button data-ceremony-affirm disabled={busy}
                onClick={() => void (async () => {
                  setBusy(true);
                  try {
                    await publishRevision(props.draft.id, PUBLISH_DECLARATION);
                    setCeremony(false);
                    await props.refresh();
                  } finally { setBusy(false); }
                })()}
                className="text-[12px] px-3 py-1.5 rounded-md text-white" style={{ background: NAVY }}>
                I affirm — publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StructureEditor(props: { content: BlueprintContent; defs: DefinitionIdentity[]; patch: (fn: (c: BlueprintContent) => BlueprintContent) => void }) {
  const { content, defs, patch } = props;
  return (
    <div className="mt-4">
      <div className="text-[12px] font-medium text-slate-600">Structure</div>
      {content.structure.map((ch, ci) => (
        <div key={ch.key} className="mt-2 rounded-md ring-1 ring-[#EDF2F8] p-3">
          <div className="flex items-center gap-2">
            <input data-chapter-title value={ch.title} placeholder="Chapter title"
              onChange={(e) => patch((c) => { c.structure[ci].title = e.target.value; return c; })}
              className="flex-1 text-[13px] font-medium px-2 py-1 rounded ring-1 ring-[#E7EDF5]" />
            <button className="text-[11px] text-slate-400 hover:text-rose-600"
              onClick={() => patch((c) => { c.structure.splice(ci, 1); return c; })}>remove</button>
          </div>
          <textarea value={ch.prose} placeholder="Chapter prose"
            onChange={(e) => patch((c) => { c.structure[ci].prose = e.target.value; return c; })}
            className="mt-2 w-full text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5]" rows={1} />
          {ch.sections.map((se, si) => (
            <div key={se.key} className="mt-2 ml-3 rounded-md ring-1 ring-[#F1F5FA] p-2.5">
              <div className="flex items-center gap-2">
                <input data-section-title value={se.title} placeholder="Section title"
                  onChange={(e) => patch((c) => { c.structure[ci].sections[si].title = e.target.value; return c; })}
                  className="flex-1 text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5]" />
                <input value={se.role ?? ""} placeholder="semantic role"
                  onChange={(e) => patch((c) => { c.structure[ci].sections[si].role = e.target.value || null; return c; })}
                  className="w-32 text-[11px] px-2 py-1 rounded ring-1 ring-[#E7EDF5] text-slate-500" />
                <button className="text-[11px] text-slate-400 hover:text-rose-600"
                  onClick={() => patch((c) => { c.structure[ci].sections.splice(si, 1); return c; })}>remove</button>
              </div>
              {se.entries.map((en, ei) => (
                <EntryEditor key={en.key} entry={en} defs={defs}
                  patchEntry={(fn) => patch((c) => { fn(c.structure[ci].sections[si].entries[ei]); return c; })}
                  remove={() => patch((c) => { c.structure[ci].sections[si].entries.splice(ei, 1); return c; })} />
              ))}
              <button data-add-entry className="mt-2 text-[11px] text-slate-500 hover:text-slate-700"
                onClick={() => patch((c) => {
                  c.structure[ci].sections[si].entries.push({
                    key: uid(), definitionId: defs[0]?.id ?? "", title: "",
                    configuration: { values: {}, scheme: null, annotations: "" },
                    itemSelections: [], choiceGroups: [], pricingIntent: null, notes: "",
                  });
                  return c;
                })}>+ component entry</button>
            </div>
          ))}
          <button data-add-section className="mt-2 ml-3 text-[11px] text-slate-500 hover:text-slate-700"
            onClick={() => patch((c) => {
              c.structure[ci].sections.push({ key: uid(), title: "", prose: "", role: null, entries: [] });
              return c;
            })}>+ section</button>
        </div>
      ))}
      <button data-add-chapter className="mt-2 text-[12px] text-slate-500 hover:text-slate-700"
        onClick={() => patch((c) => { c.structure.push({ key: uid(), title: "", prose: "", sections: [] }); return c; })}>
        + chapter
      </button>
    </div>
  );
}

function EntryEditor(props: { entry: ComponentEntry; defs: DefinitionIdentity[]; patchEntry: (fn: (e: ComponentEntry) => void) => void; remove: () => void }) {
  const { entry, defs, patchEntry } = props;
  const intent = entry.pricingIntent;
  return (
    <div data-entry className="mt-2 ml-3 rounded bg-[#FAFBFD] ring-1 ring-[#EDF2F8] p-2">
      <div className="flex items-center gap-2">
        <select data-entry-def value={entry.definitionId}
          onChange={(e) => patchEntry((en) => { en.definitionId = e.target.value; })}
          className="text-[12px] px-1.5 py-1 rounded ring-1 ring-[#E7EDF5] bg-white max-w-[180px]">
          <option value="">— definition —</option>
          {defs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input value={entry.title} placeholder="Authored title"
          onChange={(e) => patchEntry((en) => { en.title = e.target.value; })}
          className="flex-1 text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5]" />
        <button className="text-[11px] text-slate-400 hover:text-rose-600" onClick={props.remove}>remove</button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[11px] text-slate-400 w-20">Pricing intent</span>
        <select data-intent-form value={intent?.form ?? ""}
          onChange={(e) => patchEntry((en) => {
            const f = e.target.value;
            en.pricingIntent =
              f === "" ? null
              : f === "reference-current" ? { form: "reference-current" }
              : f === "authored-suggestion" ? { form: "authored-suggestion", amount: 0 }
              : f === "formula" ? { form: "formula", perGuest: 0 }
              : { form: "fixed-package", amount: 0, policy: "" };
          })}
          className="text-[11px] px-1.5 py-1 rounded ring-1 ring-[#E7EDF5] bg-white">
          <option value="">priced later (absent)</option>
          {PRICING_INTENT_FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        {intent && "amount" in intent && (
          <input data-intent-amount type="number" value={intent.amount}
            onChange={(e) => patchEntry((en) => { if (en.pricingIntent && "amount" in en.pricingIntent) en.pricingIntent.amount = Number(e.target.value); })}
            className="w-20 text-[11px] px-1.5 py-1 rounded ring-1 ring-[#E7EDF5]" />
        )}
        {intent?.form === "formula" && (
          <input data-intent-perguest type="number" value={intent.perGuest}
            onChange={(e) => patchEntry((en) => { if (en.pricingIntent?.form === "formula") en.pricingIntent.perGuest = Number(e.target.value); })}
            className="w-20 text-[11px] px-1.5 py-1 rounded ring-1 ring-[#E7EDF5]" />
        )}
        {intent?.form === "fixed-package" && (
          <input data-intent-policy value={intent.policy} placeholder="policy name (required)"
            onChange={(e) => patchEntry((en) => { if (en.pricingIntent?.form === "fixed-package") en.pricingIntent.policy = e.target.value; })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded ring-1 ring-[#E7EDF5]" />
        )}
      </div>
      <div className="mt-1.5 flex items-start gap-2">
        <span className="text-[11px] text-slate-400 w-20 pt-1">Items</span>
        <div className="flex-1">
          {entry.itemSelections.map((it, ii) => (
            <div key={ii} className="flex items-center gap-1.5 mt-0.5">
              <input type="checkbox" checked={it.include}
                onChange={(e) => patchEntry((en) => { en.itemSelections[ii].include = e.target.checked; })} />
              <input value={it.name} placeholder="item"
                onChange={(e) => patchEntry((en) => { en.itemSelections[ii].name = e.target.value; })}
                className="flex-1 text-[11px] px-1.5 py-0.5 rounded ring-1 ring-[#E7EDF5]" />
              <button className="text-[10px] text-slate-300 hover:text-rose-500"
                onClick={() => patchEntry((en) => { en.itemSelections.splice(ii, 1); })}>×</button>
            </div>
          ))}
          <button data-add-item className="text-[10px] text-slate-400 hover:text-slate-600 mt-0.5"
            onClick={() => patchEntry((en) => { en.itemSelections.push({ name: "", include: true, note: "" }); })}>+ item</button>
        </div>
      </div>
      <div className="mt-1.5 flex items-start gap-2">
        <span className="text-[11px] text-slate-400 w-20 pt-1">Choices</span>
        <div className="flex-1">
          {entry.choiceGroups.map((cg, gi) => (
            <div key={cg.key} className="flex items-center gap-1.5 mt-0.5">
              <input value={cg.label} placeholder="question (e.g., Protein)"
                onChange={(e) => patchEntry((en) => { en.choiceGroups[gi].label = e.target.value; })}
                className="w-32 text-[11px] px-1.5 py-0.5 rounded ring-1 ring-[#E7EDF5]" />
              <input value={cg.options.join(", ")} placeholder="options, comma-separated"
                onChange={(e) => patchEntry((en) => { en.choiceGroups[gi].options = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); })}
                className="flex-1 text-[11px] px-1.5 py-0.5 rounded ring-1 ring-[#E7EDF5]" />
              <button className="text-[10px] text-slate-300 hover:text-rose-500"
                onClick={() => patchEntry((en) => { en.choiceGroups.splice(gi, 1); })}>×</button>
            </div>
          ))}
          <button data-add-choice className="text-[10px] text-slate-400 hover:text-slate-600 mt-0.5"
            onClick={() => patchEntry((en) => { en.choiceGroups.push({ key: uid(), label: "", options: [], required: false }); })}>+ choice group</button>
        </div>
      </div>
    </div>
  );
}

function ConstraintsEditor(props: { content: BlueprintContent; patch: (fn: (c: BlueprintContent) => BlueprintContent) => void }) {
  const { content, patch } = props;
  return (
    <div className="mt-4">
      <div className="text-[12px] font-medium text-slate-600">Design constraints <span className="font-normal text-slate-400">— entered once, organization-level</span></div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <select data-constraint-character value={content.constraints.character ?? ""}
          onChange={(e) => patch((c) => { c.constraints.character = (e.target.value || null) as BlueprintContent["constraints"]["character"]; return c; })}
          className="text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5] bg-white">
          <option value="">character —</option>
          <option value="meat">meat</option><option value="dairy">dairy</option><option value="pareve">pareve</option>
        </select>
        <input data-constraint-supervision value={content.constraints.supervision} placeholder="Supervision requirement"
          onChange={(e) => patch((c) => { c.constraints.supervision = e.target.value; return c; })}
          className="text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5] w-56" />
        <input data-constraint-style value={content.constraints.serviceStyle ?? ""} placeholder="Service style"
          onChange={(e) => patch((c) => { c.constraints.serviceStyle = e.target.value || null; return c; })}
          className="text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5] w-40" />
        <label className="text-[12px] text-slate-500 flex items-center gap-1.5">
          <input type="checkbox" checked={content.constraints.calendarSensitive}
            onChange={(e) => patch((c) => { c.constraints.calendarSensitive = e.target.checked; return c; })} />
          calendar-sensitive
        </label>
      </div>
    </div>
  );
}

function ParametersEditor(props: { content: BlueprintContent; patch: (fn: (c: BlueprintContent) => BlueprintContent) => void }) {
  const { content, patch } = props;
  return (
    <div className="mt-4">
      <div className="text-[12px] font-medium text-slate-600">
        Parameters <span className="font-normal text-slate-400">— questions the event answers at instantiation; no defaults, nothing evaluates here</span>
      </div>
      {content.parameters.map((p, i) => (
        <div key={p.key} className="mt-1.5 flex items-center gap-2">
          <input value={p.label} placeholder="Label (e.g., Guest count)"
            onChange={(e) => patch((c) => { c.parameters[i].label = e.target.value; return c; })}
            className="w-48 text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5]" />
          <select value={p.type}
            onChange={(e) => patch((c) => { c.parameters[i].type = e.target.value as ParameterDecl["type"]; return c; })}
            className="text-[12px] px-1.5 py-1 rounded ring-1 ring-[#E7EDF5] bg-white">
            {PARAMETER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="text-[11px] text-slate-500 flex items-center gap-1">
            <input type="checkbox" checked={p.required}
              onChange={(e) => patch((c) => { c.parameters[i].required = e.target.checked; return c; })} />
            required
          </label>
          {p.type === "choice" && (
            <input value={(p.options ?? []).join(", ")} placeholder="options"
              onChange={(e) => patch((c) => { c.parameters[i].options = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); return c; })}
              className="flex-1 text-[11px] px-1.5 py-1 rounded ring-1 ring-[#E7EDF5]" />
          )}
          <button className="text-[10px] text-slate-300 hover:text-rose-500"
            onClick={() => patch((c) => { c.parameters.splice(i, 1); return c; })}>×</button>
        </div>
      ))}
      <button data-add-parameter className="mt-1.5 text-[11px] text-slate-500 hover:text-slate-700"
        onClick={() => patch((c) => { c.parameters.push({ key: uid(), label: "", type: "count", required: true }); return c; })}>
        + parameter
      </button>
    </div>
  );
}

function PresentationEditor(props: { content: BlueprintContent; templates: PresentationTemplate[]; patch: (fn: (c: BlueprintContent) => BlueprintContent) => void }) {
  const { content, templates, patch } = props;
  return (
    <div className="mt-4">
      <div className="text-[12px] font-medium text-slate-600">
        Presentation <span className="font-normal text-slate-400">— portable stratum by value; bound dress never travels</span>
      </div>
      {content.presentation ? (
        <div data-presentation-attached className="mt-2 flex items-center gap-3 text-[12px] text-slate-600">
          <span>
            Attached{content.presentation.portable.themeKey ? ` · theme ${content.presentation.portable.themeKey}` : ""}
            {content.presentation.provenance
              ? ` · from template (${content.presentation.provenance.fingerprint.slice(0, 8)}…, recorded ${new Date(content.presentation.provenance.applied_at).toLocaleDateString()})`
              : " · authored directly"}
          </span>
          <button data-presentation-detach className="text-[11px] text-slate-400 hover:text-rose-600"
            onClick={() => patch((c) => { c.presentation = null; return c; })}>detach</button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <select data-presentation-template defaultValue=""
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (t) patch((c) => { c.presentation = attachTemplatePresentation(t); return c; });
            }}
            className="text-[12px] px-2 py-1 rounded ring-1 ring-[#E7EDF5] bg-white">
            <option value="">Attach from template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <span className="text-[11px] text-slate-400">copies by value; provenance recorded; the template stays a citation</span>
        </div>
      )}
    </div>
  );
}
