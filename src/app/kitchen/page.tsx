"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Booking, deriveGuests, fmtDate, fmtTime, menuBadge } from "@/lib/workflow";
import { bookingFinancials, ChargeLike } from "@/lib/finance";

interface ChargeRow extends ChargeLike { booking_id: string; is_supplemental?: boolean; }

/** Day-of kitchen sheet: every event on one date, on one printable page —
 *  times, headcounts, menus, add-ons, notes. What actually goes on the wall. */
export default function KitchenSheet() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [charges, setCharges] = useState<ChargeRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data: b } = await supabase.from("bookings").select("*")
        .eq("event_date", date).neq("status", "cancelled").order("event_time");
      const rows = (b ?? []) as Booking[];
      setBookings(rows);
      if (rows.length) {
        const { data: c } = await supabase.from("charges").select("*")
          .in("booking_id", rows.map((x) => x.id));
        setCharges((c ?? []) as ChargeRow[]);
      } else setCharges([]);
    })();
  }, [date]);

  const totals = useMemo(() => {
    if (!bookings) return { events: 0, guests: 0 };
    const guests = bookings.reduce((s, b) => {
      const g = deriveGuests(b); return s + g.men + g.women + g.children;
    }, 0);
    return { events: bookings.length, guests };
  }, [bookings]);

  return (
    <div className="max-w-4xl">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy">🍳 Kitchen Sheet</h1>
          <p className="text-sm text-slate-500">Every event for the day on one printable page.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="field !py-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn-primary !py-1.5 !px-4 text-sm" onClick={() => window.print()}>🖨️ Print</button>
        </div>
      </header>

      <div className="mb-5">
        <h2 className="font-display text-xl font-bold">{fmtDate(date)}</h2>
        <p className="text-sm text-slate-500">{totals.events} event{totals.events === 1 ? "" : "s"} · {totals.guests} total guests</p>
      </div>

      {!bookings ? (
        <p className="text-slate-500">Loading…</p>
      ) : bookings.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">No events on this date.</div>
      ) : (
        bookings.map((b) => {
          const g = deriveGuests(b);
          const fin = bookingFinancials(b, charges.filter((c) => c.booking_id === b.id));
          const addons = charges.filter((c) => c.booking_id === b.id && !c.is_supplemental);
          return (
            <div key={b.id} className="card p-5 mb-4 break-inside-avoid">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-display font-bold text-lg">
                    {fmtTime(b.event_time)} — {b.event_name || b.event_type || "Event"}
                  </h3>
                  <p className="text-sm text-slate-600">
                    <Link href={`/bookings/${b.id}`} className="underline print:no-underline">#{b.invoice_num}</Link>
                    {" · "}{b.contact_name}{b.phone ? ` · ${b.phone}` : ""}
                    {(b as { contact2_name?: string | null }).contact2_name
                      ? ` · 2nd: ${(b as { contact2_name?: string | null }).contact2_name}${(b as { contact2_phone?: string | null }).contact2_phone ? ` (${(b as { contact2_phone?: string | null }).contact2_phone})` : ""}`
                      : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold">{menuBadge(b.menu_type)}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Guests</div>
                  <div className="font-bold">
                    {g.gendered ? `${g.men}M / ${g.women}W` : `${g.adults} adults`}
                    {g.children ? ` + ${g.children} kids` : ""}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Billed heads</div>
                  <div className="font-bold">{fin.actualHeads}{fin.billedToMinimum ? ` (min ${fin.minGuests})` : ""}</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2 col-span-2">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Add-ons / extras</div>
                  <div className="font-medium text-xs">
                    {addons.length ? addons.map((a) => a.description).join(" · ") : "—"}
                  </div>
                </div>
              </div>
              {b.notes && (
                <p className="mt-3 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">📝 {b.notes}</p>
              )}
              <p className="mt-2 text-xs text-slate-400 print:hidden">
                <Link href={`/bookings/${b.id}/worksheet`} className="underline">Full staff worksheet →</Link>
                {" · "}
                <Link href={`/bookings/${b.id}/menu-card`} className="underline">Menu card →</Link>
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
