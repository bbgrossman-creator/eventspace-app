"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate } from "@/lib/workflow";
import {
  matchHousehold, computeCustomerStats, CustomerChargeRow, CustomerPayRow,
} from "@/lib/customer";

function fmtMoney(n: number): string { return "$" + Math.round(n).toLocaleString(); }

/** The three-second relationship read: who is this customer to us?
 *  One clean card, fixed height — the full CRM lives one click away on the
 *  Customer Profile page. (Booking answers "how do I handle THIS event?";
 *  Customer answers "tell me everything about THIS person.") */
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

  const cell = (label: string, value: string) => (
    <div className="min-w-0">
      <div className="text-[9px] font-bold tracking-wider text-white/40 uppercase">{label}</div>
      <div className="text-sm font-semibold truncate">{value}</div>
    </div>
  );

  return (
    <section className="rounded-2xl bg-ink text-white p-5 mb-5 shadow-lg">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display font-bold text-base">{b.contact_name}</div>
          <div className="text-[11px] text-white/50">
            Customer since {stats.since ?? "—"}{stats.tier ? <span className="text-gold font-semibold"> · {stats.tier}</span> : ""}
          </div>
        </div>
        <Link href={`/customers/${b.id}`}
          className="text-[11px] font-bold rounded-full bg-gold/90 hover:bg-gold text-ink px-3.5 py-1.5 transition-colors whitespace-nowrap">
          Open Customer Profile →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mt-3">
        {cell("Events", String(stats.events))}
        {cell("Lifetime revenue", fmtMoney(stats.lifetime))}
        {cell("Outstanding", stats.outstanding > 0 ? fmtMoney(stats.outstanding) : "None")}
        {cell("Upcoming", String(stats.upcoming))}
        {stats.avgGuests != null && cell("Avg event", `${stats.avgGuests} guests`)}
        {stats.lastEvent && cell("Last event", fmtDate(stats.lastEvent))}
        {stats.favRoom && cell("Favorite room", stats.favRoom)}
        {stats.favMenu && cell("Favorite menu", stats.favMenu)}
        {stats.favAddons.length > 0 && cell("Always orders", stats.favAddons.slice(0, 2).join(", "))}
      </div>
    </section>
  );
}
