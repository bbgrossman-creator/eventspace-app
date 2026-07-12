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
import { Booking } from "@/lib/workflow";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";
import VersionPricing from "@/components/VersionPricing";
import { Blueprint, listBlueprints } from "@/lib/blueprints";
import {
  Proposal, ProposalVersion, VersionStatus,
  VERSION_FLOW, PROPOSAL_STATUS_LABEL,
  createProposal, createVersion, setVersionStatus, setProposalStatus,
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
  const [nTitle, setNTitle] = useState("");
  const [nSeed, setNSeed] = useState(true);
  const [bps, setBps] = useState<Blueprint[]>([]);
  const [nBlueprint, setNBlueprint] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pricingOpen, setPricingOpen] = useState<Record<string, boolean>>({});
  const [session, setSession] = useState<Session | null>(null);
  const [showArchived, setShowArchived] = useState<Record<string, boolean>>({});
  const [showAllVersions, setShowAllVersions] = useState<Record<string, boolean>>({});

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
          onClick={() => setAdding((v) => !v)}>＋ New Proposal</button>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        The evolving quote. Versions are kept forever — approval locks a version; changes after that become a new one.
      </p>
      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-3">⚠️ {err}</p>}

      {adding && (
        <div className="rounded-lg bg-[#F6F8FB] ring-1 ring-[#E7EDF5] p-2.5 mb-3 space-y-2 reveal">
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
          <div className="flex gap-2">
            <button className="btn-primary !py-1 !px-2.5 text-xs" disabled={busy}
              onClick={() => {
                const bp = bps.find((x) => x.id === nBlueprint);
                run(() => createProposal(b, nTitle, nSeed && !bp,
                  bp?.source_version_id ? { sourceVersionId: bp.source_version_id, name: bp.name } : undefined,
                )).then(() => { setNTitle(""); setNBlueprint(""); setAdding(false); });
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
                  {p.status === "open" && latest && (
                    <button className="text-[11px] text-accent-ink hover:underline" disabled={busy}
                      onClick={() => run(() => createVersion(b, p, latest))}>＋ new version</button>
                  )}
                  {p.status === "open" && (
                    <>
                      <button className="text-[11px] text-slate-400 hover:text-red-500 underline" disabled={busy}
                        onClick={() => run(() => setProposalStatus(b, p, "lost"))}>lost</button>
                      <button className="text-[11px] text-slate-400 underline" disabled={busy}
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
                  {collapsed && (
                    <button className="text-[11px] text-slate-400 hover:text-accent-ink underline"
                      onClick={() => setShowAllVersions((x) => ({ ...x, [p.id]: true }))}>
                      ▼ Show version history ({vs.length})
                    </button>
                  )}
                  {shownVs.map((v) => {
                    const flow = VERSION_FLOW.find((f) => f.value === v.status)!;
                    const isWinner = p.won_version_id === v.id;
                    const nextSteps: VersionStatus[] =
                      v.status === "draft" ? ["internal_review", "sent"]
                      : v.status === "internal_review" ? ["draft", "sent"]
                      : v.status === "sent" ? ["revision_requested", "approved"]
                      : v.status === "revision_requested" ? []   // changes = new version
                      : [];
                    return (
                      <div key={v.id} className="flex items-center gap-2 flex-wrap rounded px-2 py-1.5 bg-[#F6F8FB] ring-1 ring-[#E7EDF5]">
                        <span className="text-[12px] font-semibold w-8">v{v.version}</span>
                        <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ backgroundColor: flow.color }}>{flow.label}</span>
                        {isWinner && <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-[#DCFCE7] text-[#166534]">🏆 approved version</span>}
                        <span className="text-[11px] text-slate-400">{compCounts[v.id] ?? 0} component{(compCounts[v.id] ?? 0) === 1 ? "" : "s"}</span>
                        {v.approved_at && <span className="text-[11px] text-slate-400">approved {new Date(v.approved_at).toLocaleDateString()}{v.approved_by ? ` · ${v.approved_by}` : ""}</span>}
                        <span className="ml-auto flex gap-2">
                          {p.status === "open" && nextSteps.map((s) => (
                            <button key={s} className="text-[11px] text-accent-ink hover:underline" disabled={busy}
                              onClick={() => {
                                if (s === "approved" && !confirm(`Approve v${v.version}? This locks it permanently and marks the proposal Won.`)) return;
                                run(() => setVersionStatus(b, p, v, s));
                              }}>
                              → {VERSION_FLOW.find((f) => f.value === s)?.label}
                            </button>
                          ))}
                          {v.status === "revision_requested" && p.status === "open" && (
                            <span className="text-[11px] text-slate-400 italic">changes go in a new version →</span>
                          )}
                        </span>
                        <a href={`/bookings/${b.id}/studio/${v.id}`}
                          className="text-[11px] font-semibold text-accent-ink hover:underline">🎨 Studio ↗</a>
                        <button className="text-[11px] text-slate-400 underline"
                          onClick={() => setPricingOpen((x) => ({ ...x, [v.id]: !x[v.id] }))}>
                          {pricingOpen[v.id] ? "hide pricing" : "pricing"}
                        </button>
                        <button className="text-[11px] text-slate-300 hover:text-amber-600" title="Archive this version"
                          disabled={busy} onClick={() => doArchive(p, v)}>🗄</button>
                      </div>
                    );
                  })}
                  {vs.filter((v) => pricingOpen[v.id]).map((v) => (
                    <VersionPricing key={`pp-${v.id}`} b={b} v={v} />
                  ))}

                  {archived.length > 0 && (
                    <div className="pt-1">
                      <button className="text-[11px] text-slate-400 hover:text-slate-600 underline"
                        onClick={() => setShowArchived((x) => ({ ...x, [p.id]: !x[p.id] }))}>
                        {showArchived[p.id] ? "Hide" : "Show"} archived ({archived.length})
                      </button>
                      {showArchived[p.id] && (
                        <div className="mt-1.5 space-y-1 reveal">
                          {archived.map((v) => (
                            <div key={v.id} className="flex items-center gap-2 flex-wrap rounded px-2 py-1.5 bg-[#FAFAF9] ring-1 ring-[#EDE9E4]">
                              <span className="text-[12px] font-semibold w-8 text-slate-400">v{v.version}</span>
                              <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-[#F5F5F4] text-[#78716C]">🗄 archived</span>
                              <span className="text-[11px] text-slate-400">
                                {v.archived_at ? new Date(v.archived_at).toLocaleDateString() : ""}
                                {v.archived_reason ? ` · ${v.archived_reason}` : ""}
                              </span>
                              <span className="ml-auto flex gap-2">
                                <button className="text-[11px] text-accent-ink hover:underline" disabled={busy}
                                  onClick={() => run(() => restoreVersion(b, v))}>restore</button>
                                {isAdmin && (
                                  <button className="text-[11px] text-red-400 hover:text-red-600 hover:underline" disabled={busy}
                                    onClick={() => doDelete(p, v)}>delete permanently</button>
                                )}
                              </span>
                            </div>
                          ))}
                          {!isAdmin && <p className="text-[10px] text-slate-300 pl-1">Permanent deletion is admin-only.</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
