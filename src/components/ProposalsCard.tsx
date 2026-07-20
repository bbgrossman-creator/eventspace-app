"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PROPOSALS (v177) — minimal management surface for the proposal data model.
// List proposals on this opportunity, create one (optionally seeded from the
// event's operational components), spin new versions, walk the version
// lifecycle, record won/lost. The three-pane Studio canvas is v179 — this
// card is deliberately just the spine made visible.
// Gated on caps.proposals: template-driven renders NOTHING.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ArchetypePick from "@/components/ArchetypePick";
import VersionThread from "@/components/VersionThread";
import VersionGenesis from "@/components/studio/VersionGenesis";
import { archetype } from "@/lib/archetypes";
import { BUILT_IN_THEMES } from "@/lib/publication";
import { getPublicationSettings, listPublicationThemes, PublicationTheme } from "@/lib/publicationData";
import { Booking } from "@/lib/workflow";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";
import VersionPricing from "@/components/VersionPricing";
// v261 — the legacy v182 pointer model is no longer a creation source.
// Blueprint starts go through the constitutional path (exact published
// revision → questions → deterministic review → BP-3's act).
import StartFromBlueprint from "@/components/StartFromBlueprint";
// v263 PL-1 — ceremonies at the choke points: creating a proposal is the
// Open Proposal door (three honest outcomes: transitioned / already /
// legacy_untouched — a legacy row stays derived, nothing is written);
// withdrawing an offer is an explicit version ceremony.
import { openProposing, withdrawOffer } from "@/lib/spineSupabase";
import {
  Proposal, ProposalVersion, VersionStatus,
  VERSION_FLOW, PROPOSAL_STATUS_LABEL,
  createProposal, createVersion, createBlankVersion, setVersionStatus, sendVersion, setProposalStatus,
  archiveVersion, restoreVersion, deleteVersionPermanently, deleteBlockers,
} from "@/lib/proposals";
import { loadSession, Session } from "@/lib/permissions";

export default function ProposalsCard({ b }: { b: Booking }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [versions, setVersions] = useState<ProposalVersion[]>([]);
  const [compCounts, setCompCounts] = useState<Record<string, number>>({}); // version_id → components
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nArch, setNArch] = useState<string | null>(null);   // v221: the outline question — unanswered until answered
  // v227 — the creation-moment THEME field (§8): defaults to the tenant's
  // default theme, so every proposal is born looking like the company.
  // Unlike the outline, the look HAS a right default — the brand.
  const [nTheme, setNTheme] = useState<string>("__default__");
  const [pubThemes, setPubThemes] = useState<PublicationTheme[]>([]);
  const [defThemeKey, setDefThemeKey] = useState<string | null>(null);
  useEffect(() => {
    listPublicationThemes().then(setPubThemes).catch(() => {});
    getPublicationSettings().then((st) => setDefThemeKey(st.defaultThemeKey)).catch(() => {});
  }, []);
  const [nTitle, setNTitle] = useState("");
  const [nSeed, setNSeed] = useState(true);
  // v261 — the three creation paths: blank / from Blueprint / copy a proposal
  const [nMode, setNMode] = useState<"blank" | "blueprint" | "copy">("blank");
  const [nCopyFrom, setNCopyFrom] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pricingOpen, setPricingOpen] = useState<Record<string, boolean>>({});
  const [session, setSession] = useState<Session | null>(null);
  const [showArchived, setShowArchived] = useState<Record<string, boolean>>({});
  const [showAllVersions, setShowAllVersions] = useState<Record<string, boolean>>({});
  // v222 — ONE door: the Booking page's New Version goes through the same
  // Genesis ceremony as the Studio's. Nothing mutates before a route is
  // chosen. Here no version is "being viewed", so the primary route revises
  // the LATEST, and "Copy another version…" offers the rest explicitly.
  const [genesisFor, setGenesisFor] = useState<{ p: Proposal; latest: ProposalVersion } | null>(null);
  const [genesisBusy, setGenesisBusy] = useState(false);
  async function commitGenesis(run2: () => Promise<{ ok: boolean; detail?: string; id?: string }>) {
    setGenesisBusy(true);
    const r = await run2();
    setGenesisBusy(false);
    if (!r.ok || !r.id) { setErr(r.detail ?? "Could not create the version."); return; }
    setGenesisFor(null);
    window.location.href = `/bookings/${b.id}/studio/${r.id}`;
  }

  useEffect(() => {
    loadCapabilities().then((c) => setCaps(c.caps));
    loadSession().then(setSession).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const { data: ps, error } = await supabase.from("proposals")
      .select("*").eq("booking_id", b.id).order("created_at");
    if (error) { setErr(`Proposals couldn't load: ${error.message} — run v177 SQL.`); return; }
    setErr("");
    const rows = (ps ?? []) as Proposal[];
    setProposals(rows);
    if (!rows.length) { setVersions([]); setCompCounts({}); return; }
    const { data: vs } = await supabase.from("proposal_versions")
      .select("*").in("proposal_id", rows.map((p) => p.id)).order("version");
    const vRows = (vs ?? []) as ProposalVersion[];
    setVersions(vRows);
    if (vRows.length) {
      const { data: cc } = await supabase.from("event_components")
        .select("proposal_version_id").in("proposal_version_id", vRows.map((v) => v.id));
      const counts: Record<string, number> = {};
      for (const c of (cc ?? []) as { proposal_version_id: string }[]) {
        counts[c.proposal_version_id] = (counts[c.proposal_version_id] ?? 0) + 1;
      }
      setCompCounts(counts);
    } else setCompCounts({});
  }, [b.id]);
  useEffect(() => {
    if (caps?.proposals) { load(); }
  }, [caps, load]);

  if (!caps?.proposals) return null;

  async function run(fn: () => Promise<{ ok: boolean; detail?: string }>) {
    setBusy(true); setErr("");
    const r = await fn();
    if (!r.ok) setErr(r.detail ?? "Something went wrong.");
    setBusy(false); load();
  }

  const activeVs = (p: Proposal) => versions.filter((v) => v.proposal_id === p.id && !v.archived_at);
  const archivedVs = (p: Proposal) => versions.filter((v) => v.proposal_id === p.id && v.archived_at);
  const latestOf = (p: Proposal) => {
    const vs = activeVs(p);
    return vs.length ? vs[vs.length - 1] : null;
  };
  const isAdmin = session?.role === "admin";

  async function doArchive(p: Proposal, v: ProposalVersion) {
    const reason = prompt("Archiving retracts this version from proposal history and excludes it from pricing memory, reuse counts, and knowledge signals. It does NOT delete it — find it under Show Archived.\n\nReason (optional):", "");
    if (reason === null) return;
    run(() => archiveVersion(b, v, reason));
  }
  async function doDelete(p: Proposal, v: ProposalVersion) {
    const guard = await deleteBlockers(v, p);
    if (!guard.canDelete) {
      alert(`This version cannot be permanently deleted because it is referenced by:\n\n• ${guard.reasons.join("\n• ")}\n\nArchive or restore it instead.`);
      return;
    }
    if (!confirm(`Delete v${v.version} permanently? This cannot be undone. It will be removed from proposal history, pricing memory, comparisons, and reporting.`)) return;
    run(() => deleteVersionPermanently(b, v, p));
  }

  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-display font-semibold text-[15px]">🎨 Proposals</h2>
        <button className="text-xs font-medium text-accent-ink hover:text-[#102F56] transition-colors"
          title="A SEPARATE proposal option for this booking — its own thread of versions. For revising an existing proposal, use Create New Version on that proposal instead."
          onClick={() => setAdding((v) => !v)}>＋ New Proposal</button>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        The evolving quote. Versions are kept forever — approval locks a version; changes after that become a new one.
      </p>
      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-3">⚠️ {err}</p>}

      {adding && (
        <div className="rounded-lg bg-[#F6F8FB] ring-1 ring-[#E7EDF5] p-2.5 mb-3 space-y-2 reveal">
          <p className="text-[10.5px] text-slate-400">
            This creates a <b>separate proposal</b> — another commercial option for this booking, with its own version
            history. To revise an existing proposal, use <b>＋ Create New Version</b> on it instead.
          </p>
          <div data-proposal-paths className="flex gap-3 text-[11px]">
            {([["blank", "Start blank"], ["blueprint", "Start from Blueprint"], ["copy", "Copy an existing Proposal"]] as const).map(([m, label]) => (
              <label key={m} className="flex items-center gap-1.5 cursor-pointer text-slate-600">
                <input type="radio" className="accent-[#4A9EFF]" checked={nMode === m} onChange={() => setNMode(m)} />
                {label}
              </label>
            ))}
          </div>
          {nMode !== "blueprint" && (
            <input className="field !py-1.5 !text-xs !bg-white w-full" autoFocus
              placeholder='Proposal title — e.g. "Summer Wedding — Option A"'
              value={nTitle} onChange={(e) => setNTitle(e.target.value)} />
          )}
          {nMode === "blank" && (
            <>
              <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600">
                <input type="checkbox" className="accent-[#4A9EFF]" checked={nSeed}
                  onChange={(e) => setNSeed(e.target.checked)} />
                Start v1 from this event&apos;s current components
              </label>
              {!nSeed && <ArchetypePick value={nArch} onChange={setNArch} />}
            </>
          )}
          {nMode === "copy" && (
            <select data-copy-source className="field !py-1 !text-xs !bg-white w-full" value={nCopyFrom}
              onChange={(e) => setNCopyFrom(e.target.value)}>
              <option value="">— copy which proposal&apos;s latest version? —</option>
              {proposals.map((p) => {
                const latest = activeVs(p).slice(-1)[0];
                return latest ? (
                  <option key={p.id} value={latest.id}>{p.title} · v{latest.version}</option>
                ) : null;
              })}
            </select>
          )}
          {nMode === "blueprint" && (
            <StartFromBlueprint bookingId={b.id}
              hasExistingProposals={proposals.length > 0}
              latestProposalTitle={proposals.length > 0 ? proposals[proposals.length - 1].title : null}
              onCreated={(versionId) => { void openProposing(b.id, "sales").catch(() => {})
                  .then(() => { window.location.href = `/bookings/${b.id}/studio/${versionId}`; }); }} />
          )}
          {nMode !== "blueprint" && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Theme</p>
            <select data-new-theme className="field !py-1 !text-xs !bg-white w-full" value={nTheme}
              onChange={(e) => setNTheme(e.target.value)}>
              <option value="__default__">
                {defThemeKey ? "Company default" : "Company brand"}
              </option>
              <option value="__brand__">Company brand (bare)</option>
              {BUILT_IN_THEMES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              {pubThemes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          )}
          {nMode !== "blueprint" && (
            <div className="flex gap-2">
              <button className="btn-primary !py-1 !px-2.5 text-xs"
                disabled={busy || (nMode === "blank" && !nSeed && !nArch) || (nMode === "copy" && !nCopyFrom)}
                title={nMode === "blank" && !nSeed && !nArch ? "Choose how the event is organized first"
                  : nMode === "copy" && !nCopyFrom ? "Choose a proposal to copy" : undefined}
                onClick={() => {
                  const arch = nMode === "blank" && !nSeed && nArch ? archetype(nArch) : null;
                  const copySrc = nMode === "copy" ? proposals.find((p) => activeVs(p).slice(-1)[0]?.id === nCopyFrom) : null;
                  run(() => createProposal(b, nTitle, nMode === "blank" && nSeed,
                    nMode === "copy" && nCopyFrom ? { sourceVersionId: nCopyFrom, name: copySrc?.title ?? "proposal" } : undefined,
                    arch ? { key: arch.key, label: arch.label, sections: arch.sections } : null,
                    nTheme === "__default__" ? undefined : nTheme,
                  )).then(() => { void openProposing(b.id, "sales").catch(() => {});
                    setNTitle(""); setNCopyFrom(""); setNArch(null); setNTheme("__default__"); setNMode("blank"); setAdding(false); });
                }}>
                Create
              </button>
              <button className="text-xs text-slate-400 underline" onClick={() => setAdding(false)}>cancel</button>
            </div>
          )}
        </div>
      )}

      {proposals.length === 0 && !adding && (
        <p className="text-[13px] text-slate-400">No proposals yet. Each proposal is its own thread — a customer can have several in play, and losing one doesn&apos;t lose the opportunity.</p>
      )}

      {genesisFor && (() => {
        const vs = activeVs(genesisFor.p);
        const others = vs.filter((v) => v.id !== genesisFor.latest.id).slice().reverse();
        const flowLabel = (st: string) => VERSION_FLOW.find((f) => f.value === st)?.label ?? (st === "withdrawn" ? "Withdrawn" : st === "superseded" ? "Superseded" : st);
        return (
          <VersionGenesis
            reviseTarget={{
              label: `Revise latest version — v${genesisFor.latest.version}`,
              blurb: `Copies everything on v${genesisFor.latest.version} (${compCounts[genesisFor.latest.id] ?? 0} components) into a new draft.`,
            }}
            otherVersions={others.map((v) => ({
              id: v.id, label: `v${v.version}`, statusLabel: flowLabel(v.status),
              date: new Date(v.created_at).toLocaleDateString(), count: compCounts[v.id] ?? 0,
            }))}
            busy={genesisBusy}
            onRevise={() => void commitGenesis(() => createVersion(b, genesisFor.p, genesisFor.latest))}
            onCopyVersion={(vid) => {
              const src = vs.filter((v) => v.id === vid)[0];
              if (src) void commitGenesis(() => createVersion(b, genesisFor.p, src));
            }}
            onBlank={() => void commitGenesis(() => createBlankVersion(b, genesisFor.p))}
            onCancel={() => setGenesisFor(null)}
          />
        );
      })()}

      <div className="space-y-3">
        {proposals.map((p) => {
          const vs = activeVs(p);
          const archived = archivedVs(p);
          const latest = latestOf(p);
          const showAll = !!showAllVersions[p.id];
          const collapsed = vs.length > 4 && !showAll;
          const shownVs = collapsed ? vs.slice(-1) : vs;
          const ps = PROPOSAL_STATUS_LABEL[p.status];
          const open = !!expanded[p.id];
          return (
            <div key={p.id} className="rounded-lg ring-1 ring-[#E7EDF5] p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button className="flex items-center gap-2 min-w-0 text-left" onClick={() => setExpanded((x) => ({ ...x, [p.id]: !open }))}>
                  <span className="text-slate-300 text-xs">{open ? "▾" : "▸"}</span>
                  <span className="text-sm font-semibold truncate">{p.title}</span>
                  <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ backgroundColor: ps.color }}>{ps.label}</span>
                  {latest && <span className="text-[11px] text-slate-400">v{latest.version} · {VERSION_FLOW.find((f) => f.value === latest.status)?.label}</span>}
                </button>
                <div className="flex items-center gap-2">
                  {p.status === "open" && (
                    <>
                      <button className="text-[11px] text-slate-400 hover:text-red-500 underline" disabled={busy}
                        title="Mark this PROPOSAL lost — the whole option, all its versions. The booking and other proposals are untouched."
                        onClick={() => run(() => setProposalStatus(b, p, "lost"))}>lost</button>
                      <button className="text-[11px] text-slate-400 underline" disabled={busy}
                        title="Archive this PROPOSAL — off the working list, kept forever."
                        onClick={() => run(() => setProposalStatus(b, p, "archived"))}>archive</button>
                    </>
                  )}
                  {(p.status === "lost" || p.status === "archived") && (
                    <button className="text-[11px] text-slate-400 underline" disabled={busy}
                      onClick={() => run(() => setProposalStatus(b, p, "open"))}>reopen</button>
                  )}
                </div>
              </div>

              {open && (
                <div className="mt-2 space-y-1.5">
                  <VersionThread
                    versions={vs.concat(archived).slice().sort((a, b) => a.version - b.version)}
                    compCounts={compCounts}
                    wonVersionId={p.won_version_id ?? null}
                    proposalOpen={p.status === "open"}
                    busy={busy}
                    studioHref={(vid) => `/bookings/${b.id}/studio/${vid}`}
                    onNewVersion={() => latest && setGenesisFor({ p, latest })}
                    onStatus={(v, next) => {
                      if (next === "approved" && !confirm(`Approve v${v.version}? This locks it permanently and marks the proposal Won.`)) return;
                      // v225b: sending is a CEREMONY — one door, always stamps
                      // (including re-send). Other statuses move normally.
                      run(() => next === "sent" ? sendVersion(b, p, v) : setVersionStatus(b, p, v, next));
                    }}
                    onArchiveVersion={(v) => doArchive(p, v)}
                    onWithdrawVersion={(v) => run(async () => {
                      const r = await withdrawOffer(v.id, "sales");
                      return r.ok ? { ok: true } : { ok: false, detail: r.detail };
                    })}
                    onRestoreVersion={(v) => run(() => restoreVersion(b, v))}
                    onTogglePricing={(vid) => setPricingOpen((x) => ({ ...x, [vid]: !x[vid] }))}
                    pricingOpen={pricingOpen}
                  />

                  {vs.filter((v) => pricingOpen[v.id]).map((v) => (
                    <VersionPricing key={`pp-${v.id}`} b={b} v={v} />
                  ))}

                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
