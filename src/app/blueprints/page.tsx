"use client";
// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINTS (v182) — curation surface. Blueprints are PROMOTED from real
// proposals (📐 Save as Blueprint in the Studio); here management renames and
// retires what selling created. Empty is correct on day one.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PageGuard from "@/components/PageGuard";
import { Blueprint, listBlueprints } from "@/lib/blueprints";

export default function BlueprintsPage() {
  return (
    <PageGuard perm="content.manage" cap="proposals">
      {/* v255 BP-5 · RECONCILIATION OF THE v182 SURFACE (canon §6.29):
          this page is a POINTER list — entries read content LIVE from a
          proposal version, which is exactly the live ancestry the
          Publication Blueprints constitution forbids. Promotion (the
          lawful capture) now exists, so this surface is retired in place:
          entries remain readable (history is preserved, never deleted),
          the nav entry is gone, and new reuse goes through the Shelf. */}
      <div data-legacy-retired className="max-w-5xl mx-auto mt-4 mx-6 px-4 py-2 rounded-md bg-amber-50 ring-1 ring-amber-200 text-[13px] text-amber-800">
        This legacy surface is retired. These entries point at live proposal versions rather than
        holding knowledge of their own. To capture a design as reusable knowledge, open its Studio and
        use <span className="font-medium">Promote to Blueprint</span>; the result lives on the{" "}
        <a href="/blueprint-shelf" className="underline font-medium">Blueprint Shelf</a>. Existing entries stay readable here.
      </div>
      <BlueprintsInner />
    </PageGuard>
  );
}

function BlueprintsInner() {
  const [rows, setRows] = useState<Blueprint[]>([]);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try { setRows(await listBlueprints(true)); }
    catch { setErr("Couldn't load — run v182 SQL."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="page-title">Blueprints</h1>
      <div className="gold-rule mb-2" />
      <p className="text-sm text-slate-500 mb-4 max-w-2xl">
        Proven proposal skeletons, promoted from real work — never authored here. Build a
        proposal worth repeating, then <b>📐 Save as Blueprint</b> in the Studio. This page
        curates the results.
      </p>
      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-4">⚠️ {err}</p>}
      {rows.length === 0 && !err && (
        <p className="text-sm text-slate-400">None yet — and that&apos;s correct. The first blueprint arrives the first time a proposal earns promotion.</p>
      )}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className={`card p-3 flex items-center gap-3 flex-wrap ${r.active ? "" : "opacity-50"}`}>
            <span>📐</span>
            <input className="field !py-1 !text-[13px] font-medium flex-1 min-w-[160px]" defaultValue={r.name}
              onBlur={async (e) => { const v = e.target.value.trim(); if (v && v !== r.name) { await supabase.from("blueprints").update({ name: v }).eq("id", r.id); } }} />
            <span className="text-[11px] text-slate-400 w-24">{r.event_type ?? "Any event"}</span>
            <span className="text-[11px] text-slate-400 flex-1 min-w-[140px]">from {r.source_label || "—"}{!r.source_version_id ? " · ⚠ source gone" : ""}</span>
            <button className="text-[11px] text-slate-400 underline ml-auto"
              onClick={async () => { await supabase.from("blueprints").update({ active: !r.active }).eq("id", r.id); load(); }}>
              {r.active ? "retire" : "restore"}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
