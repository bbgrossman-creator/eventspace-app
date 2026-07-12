"use client";
// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE (v186) — the booking page's operational-record summary.
//
// The Studio absorbed proposal building, so this card stops competing with it
// and starts SUMMARIZING: what this event actually contributed to the
// company's memory (operational components — proposal_version_id IS NULL —
// which feed the Rolodex, price memory, Library, and Source Events).
//
// Hand-editing operational components still matters for the genuine case (a
// walk-in event that never had a proposal), so it's preserved — demoted
// behind a disclosure rather than removed. Editing surface unchanged.
// Gated on caps.components_editor: template-driven sees nothing.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Booking } from "@/lib/workflow";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";
import ComponentsCard from "@/components/ComponentsCard";

export default function KnowledgeCard({ b }: { b: Booking }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [stats, setStats] = useState<{ components: number; priced: number; packages: number; blueprints: number; lastActivity: string | null } | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => { loadCapabilities().then((c) => setCaps(c.caps)); }, []);

  const load = useCallback(async () => {
    // Operational footprint: this event's real components (null version).
    const { data: cs } = await supabase.from("event_components")
      .select("id,pricing_mode").eq("booking_id", b.id).is("proposal_version_id", null);
    const comps = (cs ?? []) as { id: string; pricing_mode: string | null }[];
    const packages = comps.filter((c) => c.pricing_mode === "package").length;
    let priced = 0;
    if (comps.length) {
      const { data: its } = await supabase.from("component_items")
        .select("component_id,unit_price").in("component_id", comps.map((c) => c.id)).not("unit_price", "is", null);
      priced = new Set(((its ?? []) as { component_id: string }[]).map((i) => i.component_id)).size + packages;
    }
    // Blueprints promoted from any proposal on this booking.
    const { data: vs } = await supabase.from("proposal_versions").select("id")
      .in("proposal_id", (await supabase.from("proposals").select("id").eq("booking_id", b.id)).data?.map((p: { id: string }) => p.id) ?? []);
    const vids = ((vs ?? []) as { id: string }[]).map((v) => v.id);
    let blueprints = 0;
    if (vids.length) {
      const { count } = await supabase.from("blueprints").select("id", { count: "exact", head: true }).in("source_version_id", vids);
      blueprints = count ?? 0;
    }
    setStats({ components: comps.length, priced, packages, blueprints, lastActivity: null });
  }, [b.id]);
  useEffect(() => { if (caps?.components_editor) load(); }, [caps, load, editing]);

  if (!caps?.components_editor) return null;

  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-[15px]">Knowledge</h2>
        <span className="text-[11px] text-slate-400">operational record</span>
      </div>

      {stats && stats.components === 0 && !editing && (
        <p className="text-[13px] text-slate-400">
          No operational record yet. Once a proposal is accepted and executed — or you record a
          walk-in event by hand — this event&apos;s components become part of the company&apos;s
          memory, feeding the Rolodex, price memory, and the Studio&apos;s Library.
        </p>
      )}

      {stats && stats.components > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
          <Stat label="Components" value={stats.components} />
          <Stat label="Priced" value={stats.priced} />
          <Stat label="Packages" value={stats.packages} />
          <Stat label="Blueprints" value={stats.blueprints} />
        </div>
      )}

      {stats && stats.components > 0 && (
        <p className="text-[11px] text-slate-400 mb-2">
          These are this event&apos;s real components — the substrate the Studio reads from as a Source Event.
        </p>
      )}

      <button className="text-[11px] text-slate-400 hover:text-accent-ink underline"
        onClick={() => setEditing((x) => !x)}>
        {editing ? "Hide manual editor" : "Edit operational components by hand"}
      </button>

      {editing && (
        <div className="mt-3 reveal">
          <p className="text-[11px] text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded px-2 py-1.5 mb-2">
            Manual editing is for events without a proposal (e.g. a walk-in). For proposal-driven
            work, build in the Studio instead — these components are the event&apos;s reality, not a draft.
          </p>
          <ComponentsCard b={b} embedded />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg ring-1 ring-[#E7EDF5] bg-[#F6F8FB] px-3 py-2">
      <div className="font-display font-bold text-[18px] text-[#102F56]">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}
