"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate, fmtTime, fmtMoney, menuBadge, stageFor } from "@/lib/workflow";

export default function BookingsList() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"active" | "all" | "completed" | "cancelled">("active");

  useEffect(() => {
    supabase
      .from("bookings")
      .select("*")
      .order("event_date", { ascending: true, nullsFirst: false })
      .then(({ data }) => setBookings((data ?? []) as Booking[]));
  }, []);

  const shown = useMemo(() => {
    if (!bookings) return [];
    return bookings.filter((b) => {
      if (filter === "active" && (b.status === "completed" || b.status === "cancelled")) return false;
      if (filter === "completed" && b.status !== "completed") return false;
      if (filter === "cancelled" && b.status !== "cancelled") return false;
      if (q) {
        const hay = `${b.invoice_num} ${b.contact_name} ${b.event_name ?? ""} ${b.phone ?? ""} ${b.email ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [bookings, q, filter]);

  return (
    <div>
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Bookings</h1>
          <div className="gold-rule mt-3" />
        </div>
        <Link href="/bookings/new" className="btn-primary">+ New Inquiry</Link>
      </header>

      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          className="field max-w-xs"
          placeholder="Search name, invoice #, phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
          {(["active", "all", "completed", "cancelled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-medium capitalize ${filter === f ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {!bookings ? (
        <p className="text-slate-500">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">No bookings match.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink text-white text-left">
                <th className="px-4 py-3 font-semibold">Invoice</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Event date</th>
                <th className="px-4 py-3 font-semibold hidden lg:table-cell">Menu</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => {
                const st = stageFor(b.status);
                return (
                  <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/bookings/${b.id}`} className="font-display font-bold text-navy hover:underline">
                        #{b.invoice_num}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{b.contact_name}</div>
                      <div className="text-xs text-slate-500">{b.event_name || b.event_type}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {fmtDate(b.event_date)}
                      <span className="text-slate-400"> · {fmtTime(b.event_time)}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs">{menuBadge(b.menu_type)}</td>
                    <td className="px-4 py-3 hidden md:table-cell">{b.total_with_tax ? fmtMoney(b.total_with_tax) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
                        style={{ background: st.color, color: st.textColor }}>
                        {st.icon} {st.label.replace("Booked — ", "")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
