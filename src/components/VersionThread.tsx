"use client";
// ═══════════════════════════════════════════════════════════════════════════
// THE VERSION THREAD (v222) — one proposal's versions, composed to TEACH the
// hierarchy: a Proposal is a commercial option for the booking; a Version is
// a revision inside it; Draft is a STATUS a version passes through, never a
// third object. The CURRENT version is the prominent citizen (Open Studio ·
// Create New Version); everything older folds under "Version history".
// Presentational by design: data and callbacks in, no data client — so the
// composition is harness-provable. Creation goes through ONE door: the host
// opens the Version Genesis ceremony; nothing here mutates.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useState } from "react";
import { ProposalVersion, VERSION_FLOW, VersionStatus } from "@/lib/proposals";

const chip = (color: string | undefined) => ({ backgroundColor: color });

export interface VersionThreadProps {
  versions: ProposalVersion[];              // active, ascending
  archived: ProposalVersion[];
  compCounts: Record<string, number>;
  wonVersionId: string | null;
  proposalOpen: boolean;
  busy?: boolean;
  studioHref: (versionId: string) => string;
  onNewVersion: () => void;                 // opens the Genesis ceremony — never mutates here
  onStatus: (v: ProposalVersion, next: VersionStatus) => void;
  onArchiveVersion: (v: ProposalVersion) => void;
  onTogglePricing: (versionId: string) => void;
  pricingOpen: Record<string, boolean>;
}

const STATUS_TITLES: Record<string, string> = {
  draft: "Draft — a version being composed. A status, not a separate thing: this version will move to Review, Sent, and (maybe) Approved.",
  internal_review: "In review — being checked internally before it goes to the customer.",
  sent: "Sent — the customer has this version.",
  revision_requested: "Revision requested — changes go into a NEW version; this one stays as the record.",
  approved: "Approved — locked forever. Later changes become a new version.",
};

function Row(p: {
  v: ProposalVersion; current: boolean; won: boolean; count: number;
  open: boolean; busy?: boolean; href: string;
  onStatus: (next: VersionStatus) => void; onArchive: () => void;
  onPricing: () => void; pricingShown: boolean; onNewVersion?: () => void;
}) {
  const flow = VERSION_FLOW.find((f) => f.value === p.v.status);
  const nextSteps: VersionStatus[] =
    p.v.status === "draft" ? ["internal_review", "sent"]
    : p.v.status === "internal_review" ? ["draft", "sent"]
    : p.v.status === "sent" ? ["revision_requested", "approved"]
    : [];
  return (
    <div data-version-row={p.v.id} {...(p.current ? { "data-version-current": true } : {})}
      className={`flex items-center gap-2 flex-wrap rounded px-2 ${
        p.current ? "py-2.5 bg-white ring-2 ring-[#C9A34E]/50 shadow-sm" : "py-1.5 bg-[#F6F8FB] ring-1 ring-[#E7EDF5]"}`}>
      <span className={`font-semibold ${p.current ? "text-[14px]" : "text-[12px]"} w-8`}>v{p.v.version}</span>
      {p.current && <span className="text-[9px] font-bold uppercase tracking-wider text-[#A07C24]">current</span>}
      <span data-version-status className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 cursor-help"
        title={STATUS_TITLES[p.v.status] ?? flow?.label} style={chip(flow?.color)}>{flow?.label}</span>
      {p.won && <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-[#DCFCE7] text-[#166534]">🏆 approved version</span>}
      <span className="text-[11px] text-slate-400">{p.count} component{p.count === 1 ? "" : "s"}</span>
      {p.v.approved_at && <span className="text-[11px] text-slate-400">approved {new Date(p.v.approved_at).toLocaleDateString()}</span>}
      <span className="ml-auto flex items-center gap-2">
        {p.open && nextSteps.map((s) => (
          <button key={s} className="text-[11px] text-accent-ink hover:underline" disabled={p.busy}
            title={STATUS_TITLES[s] ?? undefined}
            onClick={() => p.onStatus(s)}>→ {VERSION_FLOW.find((f) => f.value === s)?.label}</button>
        ))}
        {p.v.status === "revision_requested" && p.open && (
          <span className="text-[11px] text-slate-400 italic">changes go in a new version →</span>
        )}
      </span>
      {p.current && p.open && p.onNewVersion && (
        <button data-thread-new-version disabled={p.busy} onClick={p.onNewVersion}
          title="Create the next version of THIS proposal — a ceremony asks how it should begin (revise, copy, blank, or blueprint). Nothing is created until you choose."
          className="text-[11px] font-semibold text-white rounded-md px-2 py-1" style={{ background: "#102F56" }}>
          ＋ Create New Version
        </button>
      )}
      <a href={p.href} data-thread-studio={p.v.id}
        title="Open this version in the Studio — the design surface where the proposal is composed"
        className={`text-[11px] font-semibold text-accent-ink hover:underline ${p.current ? "rounded-md ring-1 ring-[#E7EDF5] px-2 py-1" : ""}`}>
        🎨 {p.current ? "Open Studio" : "Studio"} ↗
      </a>
      <button className="text-[11px] text-slate-400 underline" title="Money view — totals, guests, adjustments for this version"
        onClick={p.onPricing}>{p.pricingShown ? "hide pricing" : "pricing"}</button>
      <button className="text-[11px] text-slate-300 hover:text-amber-600"
        title="Archive this version — removed from the working list, kept in history"
        disabled={p.busy} onClick={p.onArchive}>🗄</button>
    </div>
  );
}

export default function VersionThread(p: VersionThreadProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const current = p.versions[p.versions.length - 1] ?? null;
  const history = p.versions.slice(0, -1).reverse();   // newest first under the fold
  if (!current) return null;
  return (
    <div className="space-y-1.5">
      <Row v={current} current won={p.wonVersionId === current.id} count={p.compCounts[current.id] ?? 0}
        open={p.proposalOpen} busy={p.busy} href={p.studioHref(current.id)}
        onStatus={(s) => p.onStatus(current, s)} onArchive={() => p.onArchiveVersion(current)}
        onPricing={() => p.onTogglePricing(current.id)} pricingShown={!!p.pricingOpen[current.id]}
        onNewVersion={p.onNewVersion} />
      {history.length > 0 && (
        <div>
          <button data-version-history-toggle onClick={() => setHistoryOpen((o) => !o)}
            title="Older versions of this proposal — every revision is kept forever"
            className="text-[11px] text-slate-400 hover:text-slate-600">
            {historyOpen ? "▾" : "▸"} Version history ({history.length})
          </button>
          {historyOpen && (
            <div data-version-history className="mt-1.5 space-y-1 reveal">
              {history.map((v) => (
                <Row key={v.id} v={v} current={false} won={p.wonVersionId === v.id}
                  count={p.compCounts[v.id] ?? 0} open={p.proposalOpen} busy={p.busy}
                  href={p.studioHref(v.id)} onStatus={(s) => p.onStatus(v, s)}
                  onArchive={() => p.onArchiveVersion(v)}
                  onPricing={() => p.onTogglePricing(v.id)} pricingShown={!!p.pricingOpen[v.id]} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
