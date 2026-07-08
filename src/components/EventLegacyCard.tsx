"use client";
// ═══════════════════════════════════════════════════════════════════════════
// EVENT LEGACY (Knowledge Architecture steps 3+6 read-side)
// "The event continues creating value long after it ends." Shows the bookings
// that cite THIS event as their source ("I was at the Goldberg wedding"),
// with real, defensible numbers only: direct descendants and their contracted
// revenue. No multi-hop "influence" estimates — those are storytelling.
// Renders nothing when there are no descendants (no clutter, no empty state).
// Gated on caps.event_legacy.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate } from "@/lib/workflow";
import { bookingFinancials, ChargeLike } from "@/lib/finance";
import { loadCapabilities, Capabilities } from "@/lib/capabilities";

interface ChargeRow extends ChargeLike { booking_id: string; }

export default function EventLegacyCard({ b }: { b: Booking }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [kids, setKids] = useState<Booking[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});

  useEffect(() => { loadCapabilities().then((c) => setCaps(c.caps)); }, []);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("bookings").select("*")
      .eq("source_booking_id", b.id).neq("status", "cancelled")
      .order("created_at", { ascending: false });
    if (error) return; // columns not migrated yet — stay quiet
    const rows = (data ?? []) as Booking[];
    setKids(rows);
    if (!rows.length) return;
    const { data: chgs } = await supabase.from("charges")
      .select("booking_id,description,quantity,unit_price,taxable")
      .in("booking_id", rows.map((x) => x.id));
    const by: Record<string, ChargeRow[]> = {};
    for (const c of (chgs ?? []) as ChargeRow[]) (by[c.booking_id] ??= []).push(c);
    const t: Record<string, number> = {};
    for (const k of rows) t[k.id] = bookingFinancials(k, by[k.id] ?? []).total;
    setTotals(t);
  }, [b.id]);
  useEffect(() => { if (caps?.event_legacy) load(); }, [caps, load]);

  if (!caps?.event_legacy || kids.length === 0) return null;
  const sum = kids.reduce((s, k) => s + (totals[k.id] ?? 0), 0);

  return (
    <div className="rounded-2xl bg-white p-4 ec-card-shadow ring-1 ring-[#E7EDF5]">
      <div className="flex items-center gap-2 mb-1">
        <span className="grid place-items-center w-6 h-6 rounded-lg text-[13px] shrink-0 bg-accent-tint text-accent-ink">🌱</span>
        <h3 className="font-display font-semibold text-[15px] leading-none text-accent-ink">Event Legacy</h3>
      </div>
      <p className="text-[11px] text-slate-400 mb-2">
        {kids.length} booking{kids.length === 1 ? "" : "s"} came from guests of this event
        {sum > 0 ? <> · <b className="text-slate-500">${Math.round(sum).toLocaleString()}</b> contracted</> : null}
      </p>
      <div className="divide-y divide-slate-100">
        {kids.map((k) => (
          <div key={k.id} className="py-1.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-[13px]">
            <Link href={`/bookings/${k.id}`} className="min-w-0 truncate font-medium hover:underline">
              {k.contact_name}{k.event_type ? ` · ${k.event_type}` : ""}
            </Link>
            <span className="text-[11px] text-slate-400 shrink-0">
              {k.event_date ? fmtDate(k.event_date) : "TBD"}
              {(totals[k.id] ?? 0) > 0 ? ` · $${Math.round(totals[k.id]).toLocaleString()}` : ""}
            </span>
          </div>
        ))}
      </div>
      {kids.some((k) => k.source_note) && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
          {kids.filter((k) => k.source_note).slice(0, 3).map((k) => (
            <p key={k.id} className="text-[11px] text-slate-500 italic">“{k.source_note}” — {k.contact_name}</p>
          ))}
        </div>
      )}
    </div>
  );
}
