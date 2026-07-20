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
import BlueprintPaperPreview from "@/components/BlueprintPaperPreview";
import CopyIntoDraft from "@/components/CopyIntoDraft";
import {
  FRIENDLY_STRIP_COPY, EDITOR_AREAS, GUIDE_CHECKLIST, onboardDismissKey,
  deriveOpportunities, PROPOSED_GUEST_PARAMETER, contentCounts, Opportunity,
} from "@/lib/blueprintGuide";
import { loadPromotionAct, loadDraftById, PromotionAct } from "@/lib/blueprintGuideSupabase";
import {
  CONDITION_PREDICATES, PREDICATE_ADMISSION, PredicateNode, BlueprintCondition,
} from "@/lib/blueprintConditions";
import { loadRevisionUsage, usageLine, RevisionUsage } from "@/lib/blueprintUsageSupabase";

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
  const [deeplinkFailed, setDeeplinkFailed] = useState<"" | "NOT_FOUND" | "NOT_A_DRAFT">("");

  const loadList = useCallback(async () => {
    try { setIdentities(await listBlueprintIdentities(true)); setErr(""); }
    catch { setErr("Couldn't load the shelf — run v251_blueprints_shelf.sql."); }
  }, []);
  useEffect(() => { void loadList(); }, [loadList]);

  // v259 · Editor Foundation — deep-link: ?draft=<exact revision id> opens
  // THAT draft in the editor. Tenant scoping is RLS's (a foreign revision is
  // simply not found); anything unopenable shows a NAMED state — never a
  // silent fall-back to the list.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const draftId = q.get("draft");
    if (!draftId) return;
    void (async () => {
      const res = await loadDraftById(draftId);
      if ("named" in res) { setDeeplinkFailed(res.named); return; }
      setSelected(res.identity);
      setOpenRevision(res.revision);
    })();
  }, []);

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
      {deeplinkFailed && (
        <div data-deeplink-failed className="mb-3 rounded-md bg-amber-50 ring-1 ring-amber-200 px-4 py-2 text-[13px] text-amber-800">
          {deeplinkFailed === "NOT_A_DRAFT"
            ? "That revision is no longer a draft — it may have been published or superseded. Its content lives on the shelf below."
            : "That draft can't be opened here. It may have been discarded, or it may belong to another workspace."}
        </div>
      )}
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
  const [usage, setUsage] = useState<RevisionUsage | null>(null);
  useEffect(() => {
    let alive = true;
    void loadRevisionUsage(revision.id).then((u) => { if (alive) setUsage(u); });
    return () => { alive = false; };
  }, [revision.id]);
  return (
    <div data-readonly-revision className="mt-4 rounded-md ring-1 ring-[#E7EDF5] bg-white p-4">
      <div className="text-[12px] text-slate-400">
        r{revision.revision_number} · {revision.state} — immutable
        {revision.published_at ? ` · published ${new Date(revision.published_at).toLocaleDateString()}` : ""}
        {revision.seeded_from_revision_id ? " · seeded" : ""}
      </div>
      {usage && (
        <div data-revision-usage className="mt-1 text-[12px] text-slate-500">{usageLine(usage)}</div>
      )}
      <div className="mt-2 text-[13px] text-slate-600">
        {(c?.structure ?? []).length} chapter(s) ·{" "}
        {(c?.structure ?? []).reduce((n, ch) => n + ch.sections.length, 0)} section(s) ·{" "}
        {(c?.parameters ?? []).length} parameter(s)
        {c?.presentation ? " · presentation attached" : ""}
        {c?.presentation?.provenance ? ` (from template, ${c.presentation.provenance.fingerprint.slice(0, 8)}…)` : ""}
      </div>
      <div className="mt-1 text-[11px] text-slate-400">Amendment is supersession — begin a new draft to change anything.</div>
      {c && <BlueprintPaperPreview content={c} />}
    </div>
  );
}


/** v259 — a named, anchorable editor area: the permanent information
 *  architecture, implemented modestly in this release. */
function EditorArea(props: {
  area: { id: string; label: string; hint: string };
  children: React.ReactNode;
}) {
  return (
    <section id={props.area.id} data-editor-area={props.area.id} className="mt-5">
      <div className="text-[11px] font-medium tracking-wide uppercase text-slate-400">{props.area.label}</div>
      <div className="text-[11px] text-slate-400">{props.area.hint}</div>
      <div className="mt-1">{props.children}</div>
    </section>
  );
}

/** v259 — Review Before Publishing: live validation, open questions, and
 *  the promotion's omissions in one place. READ-ONLY: publication remains
 *  the ceremony behind the Publish… button above; this area only shows
 *  where things stand. */
function ReviewBeforePublishing(props: {
  content: BlueprintContent; act: PromotionAct | null; dirty: boolean;
}) {
  const v = validateBlueprintContent(props.content);
  const counts = contentCounts(props.content);
  const omissions = props.act?.detail && Array.isArray(props.act.detail.omissions) ? props.act.detail.omissions : [];
  return (
    <div data-review-before-publishing className="text-[12px] text-slate-500 space-y-1">
      <div>
        {v.ok
          ? "The draft currently passes validation."
          : `The validator would refuse this draft as it stands (${v.refusals.length} refusal${v.refusals.length === 1 ? "" : "s"} — shown above on save).`}
        {props.dirty ? " Unsaved changes exist." : ""}
      </div>
      <div>
        {props.content.parameters.length === 0
          ? "No questions declared — future events will only be asked for guest count."
          : `${props.content.parameters.length} question${props.content.parameters.length === 1 ? "" : "s"} will be asked when a new event starts from this Blueprint.`}
        {" "}{counts.conditions > 0 ? `${counts.conditions} condition${counts.conditions === 1 ? "" : "s"} will resolve from the answers.` : ""}
      </div>
      {omissions.length > 0 && (
        <div>
          {omissions.length} thing{omissions.length === 1 ? "" : "s"} stayed with the source event — reviewed above under "Review what came from the event".
        </div>
      )}
      <div className="text-slate-400">
        Publishing is a separate, deliberate ceremony (the Publish… button above). Nothing here publishes.
      </div>
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
  // v259 · Editor Foundation — the guide layer. Event-review content is
  // gated on THIS draft's exact BP-5 promotion act; composed or seeded
  // drafts have no such act and never wear event-learning language.
  const [promotionAct, setPromotionAct] = useState<PromotionAct | null>(null);
  const [onboardDismissed, setOnboardDismissed] = useState(true);
  const [confirmGuestParam, setConfirmGuestParam] = useState(false);

  useEffect(() => {
    void listDefinitionIdentities().then(setDefs).catch(() => setDefs([]));
    void listPresentationTemplates().then(setTemplates).catch(() => setTemplates([]));
    void loadPromotionAct(props.draft.id).then(setPromotionAct).catch(() => setPromotionAct(null));
    try {
      const q = new URLSearchParams(window.location.search);
      const forced = q.get("onboard") === "1" && q.get("draft") === props.draft.id;
      setOnboardDismissed(!forced && localStorage.getItem(onboardDismissKey(props.draft.id)) === "1");
    } catch { setOnboardDismissed(false); }
  }, [props.draft.id]);

  const dismissOnboard = () => {
    // a personal UI preference — never Blueprint state, never review status
    try { localStorage.setItem(onboardDismissKey(props.draft.id), "1"); } catch { /* preference only */ }
    setOnboardDismissed(true);
  };
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const counts = contentCounts(content);
  const opportunities = deriveOpportunities(promotionAct?.detail ?? null, content);

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

      {/* ═══ v259 · the editor's identity: company knowledge, not a proposal ═══ */}
      <div data-knowledge-banner className="mt-3 rounded-md px-3 py-2 ring-1 ring-[#E8E2D4]" style={{ background: "#FBF8F1" }}>
        <span className="text-[11px] font-medium tracking-wide uppercase text-[#8A7B55]">📘 Reusable Knowledge · Organization Standard</span>
        <span className="ml-2 text-[12px] text-[#8A7B55]">
          You are writing the company's cookbook — how this kind of event should be designed in the future.
        </span>
      </div>

      {promotionAct && !onboardDismissed && (
        <div data-onboarding className="mt-3 rounded-md bg-[#F4F8FD] ring-1 ring-[#DCE8F5] p-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[13px] font-medium" style={{ color: NAVY }}>Draft Blueprint created</div>
              <p className="mt-0.5 text-[12px] text-slate-600">
                This Blueprint was extracted from a real event. Now refine it into reusable
                organizational knowledge before publishing.
              </p>
            </div>
            <button data-onboard-dismiss onClick={dismissOnboard}
              className="text-[11px] text-slate-400 hover:text-slate-600">dismiss</button>
          </div>
          <ul className="mt-2 space-y-0.5">
            {GUIDE_CHECKLIST.map((item) => (
              <li key={item.jump} className="text-[12px] text-slate-600">
                · {item.text}{" "}
                <button onClick={() => jump(item.jump)} className="text-[11px] underline text-slate-400 hover:text-slate-600">jump</button>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 text-[11px] text-slate-400">
            This list is guidance. Readiness is judged by the validator and by you — not by dismissing this note.
          </div>
        </div>
      )}

      {promotionAct && opportunities.length > 0 && (
        <div data-event-review className="mt-3 rounded-md ring-1 ring-[#EDF2F8] bg-white p-3">
          <div className="text-[13px] font-medium text-slate-700">Review what came from the event</div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            The promotion recorded what was transformed or left behind. What any of it should MEAN for
            future events is yours to decide — nothing below changes the Blueprint without your say-so.
          </p>
          <ul className="mt-2 space-y-2">
            {opportunities.map((op: Opportunity, i: number) => (
              <li key={i} className="text-[12px]">
                <span className="font-medium text-slate-600">{FRIENDLY_STRIP_COPY[op.entry.reason].title}</span>
                <span className="text-slate-500"> — {op.entry.at}</span>
                <div className="text-[11px] text-slate-400">{FRIENDLY_STRIP_COPY[op.entry.reason].body}</div>
                {op.kind === "ask-guest-count" && !confirmGuestParam && (
                  <button data-offer-guest-param onClick={() => setConfirmGuestParam(true)}
                    className="mt-1 text-[11px] px-2 py-0.5 rounded ring-1 ring-[#DCE8F5] text-slate-600 hover:bg-[#F4F8FD]">
                    Ask this on future events…
                  </button>
                )}
                {op.kind === "ask-guest-count" && confirmGuestParam && (
                  <div data-confirm-parameter className="mt-1.5 rounded bg-[#F9FBFE] ring-1 ring-[#EDF2F8] p-2">
                    <div className="text-[11px] text-slate-500">This will add the question below — nothing is created until you confirm:</div>
                    <div className="mt-1 text-[12px] text-slate-600">
                      Question: <span className="font-medium">{PROPOSED_GUEST_PARAMETER.label}</span>
                      <span className="text-slate-400"> · key {PROPOSED_GUEST_PARAMETER.key} · number · required</span>
                    </div>
                    <div className="mt-1.5 flex gap-2">
                      <button data-confirm-guest-param
                        onClick={() => { patch((c) => { c.parameters.push({ ...PROPOSED_GUEST_PARAMETER }); return c; }); setConfirmGuestParam(false); }}
                        className="text-[11px] px-2 py-0.5 rounded text-white" style={{ background: NAVY }}>Add the question</button>
                      <button onClick={() => setConfirmGuestParam(false)}
                        className="text-[11px] px-2 py-0.5 rounded ring-1 ring-[#E7EDF5] text-slate-500">Not now</button>
                    </div>
                  </div>
                )}
                {op.kind === "review-pricing" && (
                  <button onClick={() => jump("area-pricing")}
                    className="mt-1 text-[11px] px-2 py-0.5 rounded ring-1 ring-[#DCE8F5] text-slate-600 hover:bg-[#F4F8FD]">
                    Review pricing guidance
                  </button>
                )}
                {op.kind === "info" && (
                  <span className="mt-1 inline-block text-[11px] text-slate-400">Leave event-specific — nothing to do.</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex justify-end">
        <CopyIntoDraft destIdentityId={props.identity.id} destRevisionId={props.draft.id}
          destContent={content} onCopied={() => { void props.refresh(); }} />
      </div>

      {/* ═══ v259 · the editor's permanent areas ═══ */}
      <EditorArea area={EDITOR_AREAS[0]}>
        <StructureEditor content={content} defs={defs} patch={patch} />
        <ConstraintsEditor content={content} patch={patch} />
      </EditorArea>
      <EditorArea area={EDITOR_AREAS[1]}>
        <ParametersEditor content={content} patch={patch} />
      </EditorArea>
      <EditorArea area={EDITOR_AREAS[2]}>
        <div className="text-[12px] text-slate-500">
          {counts.conditions === 0
            ? "No conditions yet. Add one on a section or component in Reusable Structure when content only belongs in certain situations — e.g. guest count at least 150, or evening events."
            : `${counts.conditions} condition${counts.conditions === 1 ? "" : "s"} authored — they live on sections, components, and items in Reusable Structure, and resolve once when a new event is created.`}
        </div>
      </EditorArea>
      <EditorArea area={EDITOR_AREAS[3]}>
        <div className="text-[12px] text-slate-500">
          {counts.choiceGroups === 0
            ? "No choice groups yet. Add one on a component in Reusable Structure to offer optional upgrades — e.g. Coffee Bar, Ice Cream Bar."
            : `${counts.choiceGroups} choice group${counts.choiceGroups === 1 ? "" : "s"} authored — future events pick from them.`}
        </div>
      </EditorArea>
      <EditorArea area={EDITOR_AREAS[4]}>
        <div className="text-[12px] text-slate-500">
          {counts.pricedEntries === 0
            ? `No pricing guidance yet across ${counts.entries} component${counts.entries === 1 ? "" : "s"}. Set intent on a component in Reusable Structure — a suggestion, a per-guest formula, or the catalog's current price.`
            : `${counts.pricedEntries} of ${counts.entries} component${counts.entries === 1 ? "" : "s"} carry pricing guidance. This is guidance for future events — never a confirmed price.`}
        </div>
      </EditorArea>
      <EditorArea area={EDITOR_AREAS[5]}>
        <PresentationEditor content={content} templates={templates} patch={patch} />
      </EditorArea>
      <EditorArea area={EDITOR_AREAS[6]}>
        <ReviewBeforePublishing content={content} act={promotionAct} dirty={dirty} />
      </EditorArea>

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


/** v257 (BP-7) — the condition editor: a closed all-of list of predicate
 *  rows over the DECLARED parameters. Predicates filter by the admission
 *  matrix; operands type themselves; the law (validation) speaks through
 *  the draft's refusal panel, never silently. */
function ConditionEditor(props: {
  condition: BlueprintCondition | undefined;
  parameters: BlueprintContent["parameters"];
  onChange: (c: BlueprintCondition | undefined) => void;
}) {
  const rows: PredicateNode[] =
    props.condition && "all" in props.condition ? (props.condition.all as PredicateNode[])
    : props.condition ? [props.condition as PredicateNode] : [];
  const emit = (next: PredicateNode[]) =>
    props.onChange(next.length === 0 ? undefined : next.length === 1 ? next[0] : { all: next });
  const declFor = (key: string) => props.parameters.find((p) => p.key === key);
  return (
    <div data-condition-editor className="mt-1.5 ml-1 rounded bg-[#FBFCFE] ring-1 ring-[#F1F5FA] p-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        Condition — included when ALL hold (resolved once, at instantiation)
      </div>
      {rows.map((r, i) => {
        const decl = declFor(r.param);
        const admitted = decl ? CONDITION_PREDICATES.filter((p) => PREDICATE_ADMISSION[p].includes(decl.type)) : CONDITION_PREDICATES;
        return (
          <div key={i} className="mt-1 flex items-center gap-1.5">
            <select data-cond-param value={r.param}
              onChange={(e) => { const n = [...rows]; n[i] = { ...r, param: e.target.value }; emit(n); }}
              className="text-[11px] px-1.5 py-0.5 rounded ring-1 ring-[#E7EDF5] bg-white">
              <option value="">— parameter —</option>
              {props.parameters.map((p) => <option key={p.key} value={p.key}>{p.label || p.key}</option>)}
            </select>
            <select data-cond-predicate value={r.predicate}
              onChange={(e) => { const n = [...rows]; n[i] = { ...r, predicate: e.target.value as PredicateNode["predicate"] }; emit(n); }}
              className="text-[11px] px-1.5 py-0.5 rounded ring-1 ring-[#E7EDF5] bg-white">
              {admitted.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {r.predicate !== "present" && (
              decl?.type === "flag" ? (
                <select data-cond-operand value={String(r.operand ?? "")}
                  onChange={(e) => { const n = [...rows]; n[i] = { ...r, operand: e.target.value === "true" }; emit(n); }}
                  className="text-[11px] px-1.5 py-0.5 rounded ring-1 ring-[#E7EDF5] bg-white">
                  <option value="true">true</option><option value="false">false</option>
                </select>
              ) : (
                <input data-cond-operand value={String(r.operand ?? "")}
                  placeholder={r.predicate === "one-of" ? "a, b, c" : decl?.type === "count" ? "number" : "value"}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = [...rows];
                    if (r.predicate === "one-of") {
                      const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
                      n[i] = { ...r, operand: decl?.type === "count" ? parts.map(Number) : parts };
                    } else {
                      n[i] = { ...r, operand: decl?.type === "count" ? Number(raw) : raw };
                    }
                    emit(n);
                  }}
                  className="w-28 text-[11px] px-1.5 py-0.5 rounded ring-1 ring-[#E7EDF5]" />
              )
            )}
            <button className="text-[10px] text-slate-400 hover:text-rose-600"
              onClick={() => { const n = rows.filter((_, x) => x !== i); emit(n); }}>×</button>
          </div>
        );
      })}
      <button data-cond-add className="mt-1 text-[10px] text-slate-400 hover:text-slate-600"
        onClick={() => emit([...rows, { predicate: "equals", param: props.parameters[0]?.key ?? "", operand: "" }])}>
        + predicate
      </button>
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
              <ConditionEditor condition={se.condition} parameters={props.content.parameters}
                onChange={(cond) => patch((c) => { c.structure[ci].sections[si].condition = cond; return c; })} />
              {se.entries.map((en, ei) => (
                <EntryEditor key={en.key} entry={en} defs={defs} parameters={props.content.parameters}
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

function EntryEditor(props: { entry: ComponentEntry; defs: DefinitionIdentity[]; parameters: BlueprintContent["parameters"]; patchEntry: (fn: (e: ComponentEntry) => void) => void; remove: () => void }) {
  const { entry, defs, patchEntry } = props;
  const intent = entry.pricingIntent;
  return (
    <div data-entry className="mt-2 ml-3 rounded bg-[#FAFBFD] ring-1 ring-[#EDF2F8] p-2">
      <ConditionEditor condition={entry.condition} parameters={props.parameters}
        onChange={(cond) => patchEntry((en) => { en.condition = cond; })} />
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
        <span data-pricing-hint className="text-[10px] text-slate-300">guidance for future events — never a confirmed price</span>
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
