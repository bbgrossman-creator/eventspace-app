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

  // Three questions only: how valuable · have we worked together · what do
  // they usually do. Identity + planning; operational hints live elsewhere.
  const metric = (value: string, label: string, tone = "") => (
    <span className="whitespace-nowrap">
      <b className={`font-semibold ${tone}`}>{value}</b>
      <span className="text-white/45 text-[11px]"> {label}</span>
    </span>
  );

  return (
    <section className="rounded-2xl bg-ink text-white px-5 py-4 mb-5 shadow-lg">
      <div className="text-[9px] font-bold tracking-[0.18em] text-white/30 uppercase mb-1">Customer Snapshot</div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="font-display font-bold text-base">{b.contact_name}</div>
        <Link href={`/customers/${b.id}`}
          className="text-[11px] font-semibold text-white/55 hover:text-white underline underline-offset-2 whitespace-nowrap">
          Open Customer Profile →
        </Link>
      </div>
      <div className="text-[11px] text-white/50 mb-2.5">
        {stats.tier ? <span className="text-gold font-semibold">{stats.tier}</span> : "Returning"}
        {" • "}Customer since {stats.since ?? "—"}
      </div>

      <div className="flex gap-x-6 gap-y-1 flex-wrap text-sm">
        {metric(String(stats.events), stats.events === 1 ? "event" : "events")}
        {metric(fmtMoney(stats.lifetime), "lifetime")}
        {metric(stats.outstanding > 0 ? fmtMoney(stats.outstanding) : "None", "outstanding",
          stats.outstanding > 0 ? "text-red-300" : "text-emerald-300")}
      </div>
      {(stats.avgGuests != null || stats.favRoom || stats.favMenu) && (
        <div className="flex gap-x-6 gap-y-1 flex-wrap text-sm mt-1">
          {stats.avgGuests != null && metric(`${stats.avgGuests}`, "avg guests")}
          {stats.favRoom && metric(stats.favRoom, "favorite room")}
          {stats.favMenu && metric(stats.favMenu, "favorite menu")}
        </div>
      )}
    </section>
  );
}
