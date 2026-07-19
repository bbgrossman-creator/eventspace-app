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
import { getBlueprint, applyBlueprint } from "@/lib/blueprints";
import { archetype } from "@/lib/archetypes";
import { Booking } from "@/lib/workflow";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";
import VersionPricing from "@/components/VersionPricing";
import { Blueprint, listBlueprints } from "@/lib/blueprints";
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
  const [nTitle, setNTitle] = useState("");
  const [nSeed, setNSeed] = useState(true);
  const [bps, setBps] = useState<Blueprint[]>([]);
  const [nBlueprint, setNBlueprint] = useState("");
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
    if (caps?.proposals) { load(); listBlueprints().then(setBps).catch(() => {}); }
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
          <input className="field !py-1.5 !text-xs !bg-white w-full" autoFocus
            placeholder='Proposal title — e.g. "Summer Wedding — Option A"'
            value={nTitle} onChange={(e) => setNTitle(e.target.value)} />
          {bps.length > 0 && (
            <select className="field !py-1 !text-xs !bg-white w-full" value={nBlueprint}
              onChange={(e) => setNBlueprint(e.target.value)}>
              <option value="">Start from a blueprint? (optional)</option>
              {bps.map((x) => <option key={x.id} value={x.id}>📐 {x.name}{x.event_type ? ` · ${x.event_type}` : ""}</option>)}
            </select>
          )}
          <label className={`flex items-center gap-2 text-[11px] cursor-pointer ${nBlueprint ? "text-slate-300" : "text-slate-600"}`}>
            <input type="checkbox" className="accent-[#4A9EFF]" checked={nSeed && !nBlueprint} disabled={!!nBlueprint}
              onChange={(e) => setNSeed(e.target.checked)} />
            Start v1 from this event&apos;s current components
          </label>
          {!nBlueprint && !nSeed && <ArchetypePick value={nArch} onChange={setNArch} />}
          <div className="flex gap-2">
            <button className="btn-primary !py-1 !px-2.5 text-xs"
              disabled={busy || (!nBlueprint && !nSeed && !nArch)}
              title={!nBlueprint && !nSeed && !nArch ? "Choose how the event is organized first" : undefined}
              onClick={() => {
                const bp = bps.find((x) => x.id === nBlueprint);
                const arch = !bp && !nSeed && nArch ? archetype(nArch) : null;
                run(() => createProposal(b, nTitle, nSeed && !bp,
                  bp?.source_version_id ? { sourceVersionId: bp.source_version_id, name: bp.name } : undefined,
                  arch ? { key: arch.key, label: arch.label, sections: arch.sections } : null,
                )).then(() => { setNTitle(""); setNBlueprint(""); setNArch(null); setAdding(false); });
              }}>
              Create
            </button>
            <button className="text-xs text-slate-400 underline" onClick={() => setAdding(false)}>cancel</button>
          </div>
        </div>
      )}

      {proposals.length === 0 && !adding && (
        <p className="text-[13px] text-slate-400">No proposals yet. Each proposal is its own thread — a customer can have several in play, and losing one doesn&apos;t lose the opportunity.</p>
      )}

      {genesisFor && (() => {
        const vs = activeVs(genesisFor.p);
        const others = vs.filter((v) => v.id !== genesisFor.latest.id).slice().reverse();
        const flowLabel = (st: string) => VERSION_FLOW.find((f) => f.value === st)?.label ?? st;
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
            blueprints={bps.map((x) => ({ id: x.id, name: x.name }))}
            busy={genesisBusy}
            onRevise={() => void commitGenesis(() => createVersion(b, genesisFor.p, genesisFor.latest))}
            onCopyVersion={(vid) => {
              const src = vs.filter((v) => v.id === vid)[0];
              if (src) void commitGenesis(() => createVersion(b, genesisFor.p, src));
            }}
            onBlank={() => void commitGenesis(() => createBlankVersion(b, genesisFor.p))}
            onBlueprint={(bpId) => void commitGenesis(async () => {
              const made = await createBlankVersion(b, genesisFor.p);
              if (!made.ok || !made.id) return made;
              const bp = await getBlueprint(bpId);
              if (!bp) return { ok: false, detail: "That blueprint's row is gone." };
              const applied = await applyBlueprint(b, made.id, bp);
              return applied.ok ? { ok: true, id: made.id } : { ok: false, detail: applied.detail };
            })}
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
