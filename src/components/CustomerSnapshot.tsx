"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Booking } from "@/lib/workflow";
import {
  matchHousehold, computeCustomerStats, CustomerChargeRow, CustomerPayRow,
} from "@/lib/customer";

function fmtMoney(n: number): string { return "$" + Math.round(n).toLocaleString(); }

/** The three-second relationship read: who is this customer to us?
 *  A compact ribbon, not a hero section — customer intelligence should always
 *  be visible without pushing the actual workflow below the fold. The full
 *  CRM lives one click away on the Customer Profile page. (Booking answers
 *  "how do I handle THIS event?"; Customer answers "who is this person?") */
export default function CustomerSnapshot({ b }: { b: Booking }) {
  const [all, setAll] = useState<Booking[]>([]);
  const [charges, setCharges] = useState<CustomerChargeRow[]>([]);
  const [pays, setPays] = useState<CustomerPayRow[]>([]);
  const [rooms, setRooms] = useState<Map<string, string>>(new Map());
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("bookings").select("*");
    if (error) { setErr(`Snapshot couldn't load: ${error.message}`); return; }
    const mine = matchHousehold((data ?? []) as Booking[], b);
    setAll(mine);
    const ids = mine.map((x) => x.id);
    if (ids.length) {
      const [c, p] = await Promise.all([
        supabase.from("charges").select("booking_id,unit_price,quantity,taxable,description").in("booking_id", ids),
        supabase.from("payments").select("booking_id,amount_applied").in("booking_id", ids),
      ]);
      setCharges((c.data ?? []) as CustomerChargeRow[]);
      setPays((p.data ?? []) as CustomerPayRow[]);
    }
    supabase.from("rooms").select("id,name").then(({ data: r }) =>
      setRooms(new Map(((r ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]))));
  }, [b]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => computeCustomerStats(all, charges, pays, rooms), [all, charges, pays, rooms]);

  if (err) return <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-5">⚠️ {err}</p>;
  if (!stats) return null;

  // Value-over-label KPI treatment: these four numbers are the visual
  // anchors of the card. Favorite menu/room and tier are secondary metadata.
  const kpi = (value: string, label: string, tone = "text-white") => (
    <div className="leading-none">
      <div className={`font-display font-bold text-base ${tone}`}>{value}</div>
      <div className="text-[9px] font-semibold tracking-wide text-white/40 uppercase mt-1">{label}</div>
    </div>
  );

  return (
    <section className="rounded-2xl bg-surface-navy text-white px-5 py-3.5 mb-5 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display font-bold text-[15px] truncate">{b.contact_name}</span>
          {stats.tier && (
            <span className="shrink-0 text-[10px] font-bold text-gold whitespace-nowrap">{stats.tier}</span>
          )}
        </div>
        <Link href={`/customers/${b.id}`}
          className="shrink-0 text-[11px] font-semibold text-white/55 hover:text-white underline underline-offset-2 whitespace-nowrap">
          Open Customer Profile →
        </Link>
      </div>

      <div className="flex items-end justify-between gap-4 mt-2.5">
        <div className="flex items-end gap-x-6">
          {kpi(String(stats.events), stats.events === 1 ? "Event" : "Events")}
          {kpi(fmtMoney(stats.lifetime), "Lifetime")}
          {kpi(stats.outstanding > 0 ? fmtMoney(stats.outstanding) : "$0", "Outstanding",
            stats.outstanding > 0 ? "text-red-300" : "text-emerald-300")}
          {stats.avgGuests != null && kpi(String(stats.avgGuests), "Avg Guests")}
        </div>

        {(stats.favMenu || stats.favRoom) && (
          <div className="hidden sm:block text-[11px] text-white/40 text-right shrink-0 leading-tight">
            {[stats.favMenu, stats.favRoom].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </section>
  );
}
