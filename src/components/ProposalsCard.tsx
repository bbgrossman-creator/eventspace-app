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
import {
  Proposal, ProposalVersion, VersionStatus,
  VERSION_FLOW, PROPOSAL_STATUS_LABEL,
  createProposal, createVersion, setVersionStatus, setProposalStatus,
} from "@/lib/proposals";

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pricingOpen, setPricingOpen] = useState<Record<string, boolean>>({});

  useEffect(() => { loadCapabilities().then((c) => setCaps(c.caps)); }, []);

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
  useEffect(() => { if (caps?.proposals) load(); }, [caps, load]);

  if (!caps?.proposals) return null;

  async function run(fn: () => Promise<{ ok: boolean; detail?: string }>) {
    setBusy(true); setErr("");
    const r = await fn();
    if (!r.ok) setErr(r.detail ?? "Something went wrong.");
    setBusy(false); load();
  }

  const latestOf = (p: Proposal) => {
    const vs = versions.filter((v) => v.proposal_id === p.id);
    return vs.length ? vs[vs.length - 1] : null;
  };

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
          <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
            <input type="checkbox" className="accent-[#4A9EFF]" checked={nSeed} onChange={(e) => setNSeed(e.target.checked)} />
            Start v1 from this event&apos;s current components
          </label>
          <div className="flex gap-2">
            <button className="btn-primary !py-1 !px-2.5 text-xs" disabled={busy}
              onClick={() => run(() => createProposal(b, nTitle, nSeed)).then(() => { setNTitle(""); setAdding(false); })}>
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
          const vs = versions.filter((v) => v.proposal_id === p.id);
          const latest = latestOf(p);
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
                  {vs.map((v) => {
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
                      </div>
                    );
                  })}
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
