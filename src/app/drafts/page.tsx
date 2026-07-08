"use client";
/**
 * Inquiry Drafts (v134) — unfinished conversations.
 * A partially completed intake is valuable work; it lives here until it
 * converts (→ lead / hold) or is deliberately discarded. Only status=draft
 * rows appear; converted drafts stay linked to their booking for history.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/workflow";
import { PRICING } from "@/lib/pricing";

interface DraftRow {
  id: string; draft_number: string | null; assigned_to: string | null;
  customer_name: string | null; phone: string | null; email: string | null;
  event_type: string | null; event_date: string | null;
  guest_count: string | null; venue_type: string | null; venue_room: string | null;
  off_premise_location: string | null; notes: string | null;
  created_at: string; updated_at: string;
}

function pct(d: DraftRow) {
  const done = [
    !!(d.customer_name && (d.phone || d.email)),
    !!(d.event_type && d.event_date),
    d.venue_type === "off_prem" ? !!d.off_premise_location : !!d.venue_room,
    !!d.guest_count, !!d.notes,
  ].filter(Boolean).length;
  return Math.round((done / 5) * 100);
}
function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

export default function InquiryDrafts() {
  const router = useRouter();
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("inquiry_drafts").select("*")
      .eq("status", "draft").order("updated_at", { ascending: false });
    if (error) { setErr(`Couldn't load drafts: ${error.message} — run v134_inquiry_drafts.sql.`); return; }
    setRows((data ?? []) as DraftRow[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((d) =>
      [d.customer_name, d.phone, d.email, d.event_type, d.draft_number]
        .some((v) => v && v.toLowerCase().includes(needle)));
  }, [rows, q]);

  async function discard(d: DraftRow) {
    if (!confirm(`Discard "${d.customer_name || "this inquiry"}"? It won't appear in drafts anymore.`)) return;
    const { error } = await supabase.from("inquiry_drafts")
      .update({ status: "discarded", discarded_at: new Date().toISOString() }).eq("id", d.id);
    if (error) { setErr(`Couldn't discard: ${error.message}`); return; }
    load();
  }
  async function duplicate(d: DraftRow) {
    const { data: full } = await supabase.from("inquiry_drafts").select("*").eq("id", d.id).single();
    if (!full) return;
    const copy = { ...full } as Record<string, unknown>;
    delete copy.id; delete copy.created_at;
    copy.draft_number = "D-" + Date.now().toString(36).toUpperCase().slice(-5);
    copy.status = "draft"; copy.converted_booking_id = null; copy.converted_at = null; copy.discarded_at = null;
    copy.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("inquiry_drafts").insert(copy).select("id").single();
    if (error || !data) { setErr(`Couldn't duplicate: ${error?.message ?? "unknown"}`); return; }
    router.push(`/bookings/new?draft=${data.id}`);
  }

  const estValue = (d: DraftRow) => {
    const g = d.guest_count ? Number(d.guest_count) : 0;
    return g > 0 ? `~$${(g * PRICING.FULL_SERVICE_PP).toLocaleString()}` : "—";
  };

  return (
    <div className="max-w-4xl">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Inquiry Drafts</h1>
          <p className="text-sm text-slate-500 mt-1">Unfinished conversations — nothing here is lost.</p>
          <div className="gold-rule mt-3" />
        </div>
        <Link href="/bookings/new" className="btn-primary">＋ New Inquiry</Link>
      </header>

      {err && <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-4">⚠️ {err}</p>}

      {rows && rows.length > 0 && (
        <input className="field max-w-sm mb-4" placeholder="Search drafts…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      )}

      {!rows ? (
        <div className="card p-10 text-center text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3 opacity-50">📝</div>
          <p className="font-display font-semibold text-lg">No unfinished inquiries.</p>
          <p className="text-sm text-slate-500 mt-1 mb-5">Every intake autosaves here until it becomes a lead or a hold.</p>
          <Link href="/bookings/new" className="btn-primary">＋ New Inquiry</Link>
        </div>
      ) : shown.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">No drafts match your search.</div>
      ) : (
        <div className="space-y-2.5">
          {shown.map((d) => (
            <div key={d.id} className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-display font-bold text-[16px]">{d.customer_name || "Unnamed inquiry"}</span>
                  {d.draft_number && <span className="text-[10px] font-semibold text-slate-400">{d.draft_number}</span>}
                </div>
                <div className="text-[13px] text-slate-500 mt-0.5">
                  {[d.event_type, d.event_date ? fmtDate(d.event_date) : null,
                    d.guest_count ? `${d.guest_count} guests` : null].filter(Boolean).join(" · ") || "Just started"}
                </div>
                <div className="flex items-center gap-2.5 mt-2 text-[11px] text-slate-400">
                  <div className="h-1 w-24 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${pct(d)}%` }} />
                  </div>
                  <span>{pct(d)}%</span>
                  <span>·</span><span>edited {ago(d.updated_at)}</span>
                  {d.assigned_to && <><span>·</span><span>{d.assigned_to}</span></>}
                  <span>·</span><span className="text-[#9C7A2E] font-semibold">{estValue(d)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/bookings/new?draft=${d.id}`} className="btn-primary !py-1.5 !px-3.5 text-xs">Continue</Link>
                <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => duplicate(d)}>Duplicate</button>
                <button className="text-[11px] text-slate-300 hover:text-red-500 underline" onClick={() => discard(d)}>Discard</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
