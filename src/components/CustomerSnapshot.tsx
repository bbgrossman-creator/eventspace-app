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
 *  Pinned at the top of the right rail — persistent working context (history,
 *  value, outstanding balance) while Communication/Touchpoints/Tasks scroll
 *  underneath. Deliberately small: ~80-90px, built for the narrow sidebar
 *  column, not the wide main column. The full CRM lives one click away on
 *  the Customer Profile page. */
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

  if (err) return <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">⚠️ {err}</p>;
  if (!stats) return null;

  // Value-over-label KPI treatment — the three numbers that matter most while
  // working: how many events, how much they're worth, what they still owe.
  const kpi = (value: string, label: string, tone = "text-white") => (
    <div className="text-center leading-none">
      <div className={`font-display font-bold text-[15px] ${tone}`}>{value}</div>
      <div className="text-[8px] font-semibold tracking-wide text-white/40 uppercase mt-1">{label}</div>
    </div>
  );

  return (
    <section className="rounded-2xl bg-surface-navy text-white px-4 py-2.5 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display font-bold text-[13px] truncate">{b.contact_name}</span>
        {stats.tier && (
          <span className="shrink-0 text-[10px] font-bold text-gold whitespace-nowrap">{stats.tier}</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1 mt-2">
        {kpi(String(stats.events), stats.events === 1 ? "Event" : "Events")}
        {kpi(fmtMoney(stats.lifetime), "Lifetime")}
        {kpi(stats.outstanding > 0 ? fmtMoney(stats.outstanding) : "$0", "Outstanding",
          stats.outstanding > 0 ? "text-red-300" : "text-emerald-300")}
      </div>

      <div className="flex items-center justify-between mt-2">
        {stats.avgGuests != null ? (
          <span className="text-[11px] text-white/55">
            <b className="text-white font-semibold">{stats.avgGuests}</b> avg guests
          </span>
        ) : <span />}
        <Link href={`/customers/${b.id}`}
          className="shrink-0 text-[11px] font-semibold text-white/55 hover:text-white underline underline-offset-2 whitespace-nowrap">
          Open Profile →
        </Link>
      </div>
    </section>
  );
}
