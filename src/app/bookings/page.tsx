"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate, fmtTime, fmtMoney, menuBadge, stageFor, isHoldExpired, eventHealth, HealthInput } from "@/lib/workflow";

export default function BookingsList() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [health, setHealth] = useState<Record<string, HealthInput>>({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"active" | "all" | "completed" | "cancelled">("active");
  const [sortKey, setSortKey] = useState<"invoice_num" | "contact_name" | "event_date" | "total_with_tax" | "status">("event_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

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
    }).sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      if (sortKey === "invoice_num") { av = a.invoice_num ?? ""; bv = b.invoice_num ?? ""; }
      else if (sortKey === "contact_name") { av = (a.contact_name ?? "").toLowerCase(); bv = (b.contact_name ?? "").toLowerCase(); }
      else if (sortKey === "event_date") { av = a.event_date ?? "9999"; bv = b.event_date ?? "9999"; }
      else if (sortKey === "total_with_tax") { av = Number(a.total_with_tax ?? 0); bv = Number(b.total_with_tax ?? 0); }
      else if (sortKey === "status") { av = a.status ?? ""; bv = b.status ?? ""; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [bookings, q, filter, sortKey, sortDir]);

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
                {([
                  ["", "", "w-6"],
                  ["invoice_num", "Invoice", ""],
                  ["contact_name", "Contact", ""],
                  ["event_date", "Event date", ""],
                  ["", "Menu", "hidden lg:table-cell"],
                  ["total_with_tax", "Total", "hidden md:table-cell"],
                  ["status", "Status", ""],
                ] as [string, string, string][]).map(([key, label, cls]) => (
                  <th key={label} className={`px-4 py-3 font-semibold ${cls} ${key ? "cursor-pointer select-none hover:bg-white/10" : ""}`}
                    onClick={key ? () => toggleSort(key as typeof sortKey) : undefined}>
                    {label}{key && sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => {
                const st = stageFor(isHoldExpired(b) ? "hold_expired" : b.status);
                const active = b.status !== "completed" && b.status !== "cancelled" && b.status !== "lead_lost";
                const hi = health[b.id];
                const h = active && hi ? eventHealth(b, hi) : null;
                const dot = h ? (h.tier === "healthy" ? "#10b981" : h.tier === "attention" ? "#f59e0b" : "#ef4444") : null;
                return (
                  <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="pl-4 pr-0 py-3">
                      {dot && (
                        <span className="inline-block w-2.5 h-2.5 rounded-full align-middle"
                          style={{ background: dot }}
                          title={`${h!.tierLabel} · ${h!.score}/100${h!.missing.length ? " — " + h!.missing.join(", ") : ""}`} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/bookings/${b.id}`} className="font-display font-bold text-navy hover:underline">
                        #{b.invoice_num}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[15px] text-ink">{b.contact_name}</div>
                      <div className="text-[13px] text-slate-500">{b.event_name || b.event_type}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-400 text-[13px]">
                      {fmtDate(b.event_date)}
                      <span className="text-slate-300"> · {fmtTime(b.event_time)}</span>
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
