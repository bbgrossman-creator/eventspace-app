"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate, fmtTime, stageFor } from "@/lib/workflow";
import {
  matchHousehold, computeCustomerStats, headsOf, NON_REAL,
  CustomerChargeRow, CustomerPayRow,
} from "@/lib/customer";

function fmtMoney(n: number): string { return "$" + Math.round(n).toLocaleString(); }

/** The Customer — the second object in the system. The booking page answers
 *  "how do I handle THIS event?"; this page answers "tell me everything about
 *  THIS customer": full history, lifetime numbers, year-by-year revenue.
 *  Entered via a booking (pre-customer-entity, the household is derived from
 *  that booking's phone/email). */
export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [seed, setSeed] = useState<Booking | null>(null);
  const [matched, setMatched] = useState<Booking[]>([]);
  const [charges, setCharges] = useState<CustomerChargeRow[]>([]);
  const [pays, setPays] = useState<CustomerPayRow[]>([]);
  const [rooms, setRooms] = useState<Map<string, string>>(new Map());
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: bk, error: e1 } = await supabase.from("bookings").select("*").eq("id", id).single();
    if (e1 || !bk) { setErr(e1?.message ?? "Booking not found."); setLoading(false); return; }
    setSeed(bk as Booking);
    const { data: allRows, error: e2 } = await supabase.from("bookings").select("*");
    if (e2) { setErr(e2.message); setLoading(false); return; }
    const mine = matchHousehold((allRows ?? []) as Booking[], bk as Booking);
    setMatched(mine);
    const ids = mine.map((x) => x.id);
    const [c, p, r] = await Promise.all([
      supabase.from("charges").select("booking_id,unit_price,quantity,taxable,description").in("booking_id", ids),
      supabase.from("payments").select("booking_id,amount_applied").in("booking_id", ids),
      supabase.from("rooms").select("id,name"),
    ]);
    setCharges((c.data ?? []) as CustomerChargeRow[]);
    setPays((p.data ?? []) as CustomerPayRow[]);
    setRooms(new Map(((r.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])));
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => computeCustomerStats(matched, charges, pays, rooms), [matched, charges, pays, rooms]);

  if (loading) return <div className="text-sm text-slate-400">Loading customer…</div>;
  if (err) return <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">⚠️ {err}</p>;
  if (!seed) return null;

  const single = !stats; // only this one booking — still show a useful page
  const history = stats?.history ?? [seed];

  const stat = (label: string, value: string, tone = "") => (
    <div>
      <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">{label}</div>
      <div className={`font-display font-bold text-xl ${tone}`}>{value}</div>
    </div>
  );

  return (
    <div className="max-w-4xl">
      {/* ── Header ── */}
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">{seed.contact_name}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {stats?.since ? `Customer since ${stats.since}` : "New customer"}
              {stats?.tier ? <span className="text-gold font-bold"> · {stats.tier}</span> : ""}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {seed.phone && <a className="hover:text-navy underline" href={`tel:${seed.phone}`}>{seed.phone}</a>}
              {seed.phone && seed.email && " · "}
              {seed.email && <a className="hover:text-navy underline" href={`mailto:${seed.email}`}>{seed.email}</a>}
            </p>
          </div>
          <button className="btn-ghost text-sm" onClick={() => router.back()}>← Back</button>
        </div>
        <div className="gold-rule mt-3" />
      </header>

      {/* ── Overview ── */}
      <section className="card p-6 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-5">
          {stat("Events", String(stats?.events ?? 1))}
          {stat("Lifetime revenue", fmtMoney(stats?.lifetime ?? 0))}
          {stat("Outstanding", stats && stats.outstanding > 0 ? fmtMoney(stats.outstanding) : "None",
            stats && stats.outstanding > 0 ? "text-red-600" : "text-emerald-600")}
          {stat("Upcoming", String(stats?.upcoming ?? 0))}
          {stats?.avgGuests != null && stat("Average event", `${stats.avgGuests} guests`)}
          {stats?.lastEvent && stat("Last event", fmtDate(stats.lastEvent))}
          {stats?.favRoom && stat("Favorite room", stats.favRoom)}
          {stats?.favMenu && stat("Favorite menu", stats.favMenu)}
          {stats?.lastMenu && stat("Last menu", stats.lastMenu)}
          {stats && stats.favAddons.length > 0 && stat("Favorite add-ons", stats.favAddons.join(" · "))}
        </div>
        {single && (
          <p className="text-xs text-slate-400 mt-4">
            First booking on file — the relationship starts here.
          </p>
        )}
      </section>

      {/* ── Revenue by year ── */}
      {stats && stats.byYear.length > 1 && (
        <section className="card p-6 mb-6">
          <h2 className="font-display font-bold text-sm mb-3">Revenue by Year</h2>
          <div className="space-y-2">
            {stats.byYear.map((y) => {
              const max = Math.max(...stats.byYear.map((x) => x.revenue), 1);
              return (
                <div key={y.year} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{y.year}</span>
                    <span className="whitespace-nowrap">
                      <span className="font-semibold">{fmtMoney(y.revenue)}</span>
                      <span className="text-xs text-slate-400"> · {y.count} event{y.count === 1 ? "" : "s"}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 mt-1">
                    <div className="h-1.5 rounded-full bg-gold" style={{ width: `${Math.max(4, (y.revenue / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Full event history — the 34 rows live here, happily ── */}
      <section className="card p-6">
        <h2 className="font-display font-bold text-sm mb-3">Event History</h2>
        <div className="space-y-1">
          {history.map((x) => {
            const st = stageFor(x.status);
            const gone = NON_REAL.includes(x.status);
            const heads = headsOf(x);
            return (
              <Link key={x.id} href={`/bookings/${x.id}`}
                className={`flex items-center gap-4 rounded-xl px-3 py-2.5 hover:bg-slate-50 transition-colors ${gone ? "opacity-45" : ""} ${x.id === seed.id ? "ring-1 ring-gold/50 bg-goldsoft/30" : ""}`}>
                <span className="text-xs text-slate-400 w-20 shrink-0">
                  {x.event_date ? fmtDate(x.event_date) : "No date"}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-sm truncate block">
                    {x.event_name || x.event_type || "Event"}
                    {x.id === seed.id && <span className="text-gold text-[10px] font-bold ml-2">VIEWING VIA</span>}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    #{x.invoice_num}{heads > 0 ? ` · ${heads} guests` : ""}{x.event_time ? ` · ${fmtTime(x.event_time)}` : ""}
                  </span>
                </span>
                <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap"
                  style={{ background: st.color, color: st.textColor }}>
                  {st.icon} {x.status === "completed" ? "Completed" : st.label.split(" — ")[0]}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] text-slate-300 mt-4">
        Household matched by phone/email across primary and secondary contacts. Family relationships, notes, and communication history arrive with the customer entity in the multi-tenant build.
      </p>
    </div>
  );
}
