"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate, fmtMoney, stageFor, parseLocalDate, deriveGuests } from "@/lib/workflow";
import { bookingFinancials, ChargeLike } from "@/lib/finance";
import PageGuard from "@/components/PageGuard";

interface PaymentRow {
  booking_id: string; payment_type: string; method: string;
  amount_received: number; amount_applied: number; cc_fee: number; created_at: string;
}
interface ChargeRowDb extends ChargeLike { booking_id: string; }

const STATUS_GROUPS: { label: string; statuses: string[] }[] = [
  { label: "On Hold", statuses: ["on_hold", "conflict", "hold_expired", "waitlisted"] },
  { label: "Booked — Pending Menu", statuses: ["schedule_menu_discussion", "send_menu_form"] },
  { label: "Needs Invoice", statuses: ["menu_completed", "send_est_invoice"] },
  { label: "Invoice Sent / Collecting", statuses: ["confirm_guest_count", "send_final_invoice", "collect_payment", "paid_awaiting_event"] },
  { label: "Completed", statuses: ["completed"] },
];

function Dashboard() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [charges, setCharges] = useState<ChargeRowDb[]>([]);
  const [showAllAddons, setShowAllAddons] = useState(false);
  const [roomsMap, setRoomsMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    supabase.from("rooms").select("id,name").then(({ data }) =>
      setRoomsMap(new Map(((data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]))));
  }, []);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [periodPreset, setPeriodPreset] = useState<"all" | "week" | "month" | "year" | "custom">("all");
  const [bucket, setBucket] = useState<"week" | "month" | "year">("month");
  const [ordSort, setOrdSort] = useState<string>("event_date");
  const [ordDir, setOrdDir] = useState<"asc" | "desc">("desc");

  function applyPreset(preset: "all" | "week" | "month" | "year" | "custom") {
    setPeriodPreset(preset);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const now = new Date();
    if (preset === "all") { setPeriodStart(""); setPeriodEnd(""); }
    else if (preset === "week") {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());
      const end = new Date(start); end.setDate(start.getDate() + 6);
      setPeriodStart(iso(start)); setPeriodEnd(iso(end)); setBucket("week");
    } else if (preset === "month") {
      setPeriodStart(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
      setPeriodEnd(iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))); setBucket("week");
    } else if (preset === "year") {
      setPeriodStart(iso(new Date(now.getFullYear(), 0, 1)));
      setPeriodEnd(iso(new Date(now.getFullYear(), 11, 31))); setBucket("month");
    }
  }
  function toggleOrdSort(key: string) {
    if (ordSort === key) setOrdDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setOrdSort(key); setOrdDir("asc"); }
  }

  useEffect(() => {
    Promise.all([
      supabase.from("bookings").select("*"),
      supabase.from("payments").select("*"),
      supabase.from("charges").select("*"),
    ]).then(([b, p, c]) => {
      setBookings((b.data ?? []) as Booking[]);
      setPayments((p.data ?? []) as PaymentRow[]);
      setCharges((c.data ?? []) as ChargeRowDb[]);
    });
  }, []);

  const D = useMemo(() => {
    if (!bookings) return null;
    const chargesBy = new Map<string, ChargeLike[]>();
    for (const c of charges) {
      if (!chargesBy.has(c.booking_id)) chargesBy.set(c.booking_id, []);
      chargesBy.get(c.booking_id)!.push(c);
    }
    const paidBy = new Map<string, number>();
    for (const p of payments) paidBy.set(p.booking_id, (paidBy.get(p.booking_id) ?? 0) + Number(p.amount_applied));

    const live = bookings.filter((b) => b.status !== "cancelled");
    const rows = live.map((b) => {
      const fin = bookingFinancials(b, chargesBy.get(b.id) ?? []);
      const paid = paidBy.get(b.id) ?? 0;
      return { b, fin, paid, balance: Math.max(0, fin.total - paid) };
    });

    // ── Grand totals ──
    const totalSubtotal = rows.reduce((s, r) => s + r.fin.subtotal, 0);
    const totalTax = rows.reduce((s, r) => s + r.fin.tax, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.fin.total, 0);
    const totalCollected = payments.reduce((s, p) => s + Number(p.amount_applied), 0);
    const outstandingAR = rows.reduce((s, r) => s + r.balance, 0);
    const byMethod = (m: string) => payments.filter((p) => p.method === m);
    const sumApplied = (ps: PaymentRow[]) => ps.reduce((s, p) => s + Number(p.amount_applied), 0);
    const cashCollected = sumApplied(byMethod("Cash"));
    const ccFees = payments.reduce((s, p) => s + Number(p.cc_fee ?? 0), 0);

    // ── Cash tracking ──
    const cash = byMethod("Cash");
    const cashDeposits = sumApplied(cash.filter((p) => p.payment_type === "Deposit"));
    const cashFinal = sumApplied(cash.filter((p) => p.payment_type === "Additional Payment"));
    const cashOther = cashCollected - cashDeposits - cashFinal;

    // ── Upcoming revenue ──
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const upcoming = (days: number) => {
      const end = new Date(today); end.setDate(end.getDate() + days);
      return rows
        .filter((r) => r.b.event_date)
        .filter((r) => { const d = parseLocalDate(r.b.event_date!); return d >= today && d <= end; })
        .reduce((s, r) => s + r.fin.total, 0);
    };

    // ── Status groups ──
    const groups = STATUS_GROUPS.map((g) => {
      const grows = rows.filter((r) => g.statuses.includes(r.b.status));
      return { ...g, count: grows.length, revenue: grows.reduce((s, r) => s + r.fin.total, 0) };
    });

    // ── Orders table, recent event first ──
    const orders = [...rows].sort((a, z) =>
      (z.b.event_date ?? "").localeCompare(a.b.event_date ?? ""));
    const methodPaid = (bid: string, methods: string[]) =>
      sumApplied(payments.filter((p) => p.booking_id === bid && methods.includes(p.method)));

    return {
      totalSubtotal, totalTax,
      totalRevenue, totalCollected, outstandingAR, cashCollected, ccFees,
      methods: ["Cash", "Check", "Zelle", "Credit Card"].map((m) => ({
        m, count: byMethod(m).length, sum: sumApplied(byMethod(m)),
      })),
      cashDeposits, cashFinal, cashOther,
      upcoming: [7, 30, 60, 90].map((d) => ({ d, v: upcoming(d) })),
      groups, orders, methodPaid,
    };
  }, [bookings, payments, charges]);

  if (!D) return <p className="text-slate-500">Loading…</p>;

  // Apply the period filter + column sort to the orders table (view-only; the
  // financial tiles above still reflect all live bookings).
  const pStart = periodStart ? parseLocalDate(periodStart) : null;
  const pEnd = periodEnd ? parseLocalDate(periodEnd) : null;
  const visibleOrders = [...D.orders]
    .filter(({ b }) => {
      if (!pStart && !pEnd) return true;
      if (!b.event_date) return false;
      const d = parseLocalDate(b.event_date);
      if (pStart && d < pStart) return false;
      if (pEnd && d > pEnd) return false;
      return true;
    })
    .sort((a, z) => {
      let av: string | number = "", bv: string | number = "";
      if (ordSort === "event_date") { av = a.b.event_date ?? "9999"; bv = z.b.event_date ?? "9999"; }
      else if (ordSort === "invoice_num") { av = a.b.invoice_num ?? ""; bv = z.b.invoice_num ?? ""; }
      else if (ordSort === "contact_name") { av = (a.b.contact_name ?? "").toLowerCase(); bv = (z.b.contact_name ?? "").toLowerCase(); }
      else if (ordSort === "event_type") { av = a.b.event_type ?? ""; bv = z.b.event_type ?? ""; }
      else if (ordSort === "total") { av = a.fin.total; bv = z.fin.total; }
      else if (ordSort === "paid") { av = a.paid; bv = z.paid; }
      else if (ordSort === "balance") { av = a.balance; bv = z.balance; }
      else if (ordSort === "status") { av = a.b.status ?? ""; bv = z.b.status ?? ""; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return ordDir === "asc" ? cmp : -cmp;
    });

  // Totals row for the visible (period-filtered) orders.
  const orderTotals = visibleOrders.reduce((acc, { b, fin, paid, balance }) => ({
    subtotal: acc.subtotal + fin.subtotal,
    tax: acc.tax + fin.tax,
    total: acc.total + fin.total,
    cash: acc.cash + D.methodPaid(b.id, ["Cash"]),
    checkZelle: acc.checkZelle + D.methodPaid(b.id, ["Check", "Zelle"]),
    cc: acc.cc + D.methodPaid(b.id, ["Credit Card"]),
    paid: acc.paid + paid,
    balance: acc.balance + balance,
  }), { subtotal: 0, tax: 0, total: 0, cash: 0, checkZelle: 0, cc: 0, paid: 0, balance: 0 });

  // Period-scoped analytics band (governed by the start/end pickers).
  const periodActive = !!(pStart || pEnd);
  const periodRevenue = orderTotals.total;
  const periodCount = visibleOrders.length;
  const periodAvg = periodCount ? periodRevenue / periodCount : 0;

  // ── Additional analytics (respect the period via visibleOrders) ──
  // 1. Collection rate = collected / contracted (gross).
  const collectionRate = periodRevenue > 0 ? (orderTotals.paid / periodRevenue) * 100 : 0;

  // Deposit conversion = of holds ever created, how many got a deposit (moved past hold).
  // Uses all visible orders: a booking "converted" if it has a deposit on file.
  const holdsTotal = visibleOrders.length;
  const converted = visibleOrders.filter(({ b }) =>
    !["on_hold", "conflict", "waitlisted", "hold_expired"].includes(b.status)).length;
  const conversionRate = holdsTotal > 0 ? (converted / holdsTotal) * 100 : 0;

  // 2. Guest analytics.
  const guestRows = visibleOrders.filter(({ b }) => b.event_date); // real events
  const totalGuests = guestRows.reduce((s, { b }) => {
    const g = deriveGuests(b); return s + (g.men + g.women + g.children);
  }, 0);
  const avgGuests = guestRows.length ? Math.round(totalGuests / guestRows.length) : 0;

  // 3. Repeat customer revenue — group by phone/email; a customer with >1 booking
  // is "returning". Sum revenue attributed to returning customers.
  const custKey = (b: Booking) => (b.phone || b.email || b.contact_name || "").trim().toLowerCase();
  const custCounts = new Map<string, number>();
  for (const { b } of visibleOrders) { const k = custKey(b); if (k) custCounts.set(k, (custCounts.get(k) ?? 0) + 1); }
  const repeatRevenue = visibleOrders.reduce((s, { b, fin }) =>
    (custCounts.get(custKey(b)) ?? 0) > 1 ? s + fin.total : s, 0);
  const repeatPct = periodRevenue > 0 ? (repeatRevenue / periodRevenue) * 100 : 0;

  // Add-on tracking: pre-event add-ons (charges above base, EXCLUDING post-event
  // supplemental/amendment charges which carry is_supplemental). Counts revenue,
  // jobs with at least one add-on, and average add-on per such job.
  const visibleIds = new Set(visibleOrders.map(({ b }) => b.id));
  const addonByBooking = new Map<string, number>();
  for (const c of charges) {
    if (!visibleIds.has(c.booking_id)) continue;
    if ((c as { is_supplemental?: boolean }).is_supplemental) continue; // skip post-event
    const amt = Number(c.unit_price) * Number(c.quantity);
    addonByBooking.set(c.booking_id, (addonByBooking.get(c.booking_id) ?? 0) + amt);
  }
  const addonRevenue = Array.from(addonByBooking.values()).reduce((s, v) => s + v, 0);
  const addonJobs = Array.from(addonByBooking.values()).filter((v) => v > 0.01).length;
  const addonAvg = addonJobs > 0 ? addonRevenue / addonJobs : 0;
  const addonAttachRate = periodCount > 0 ? (addonJobs / periodCount) * 100 : 0;

  // Per-item breakdown: which add-ons actually drive the revenue.
  const addonItems = new Map<string, { revenue: number; jobs: Set<string> }>();
  for (const c of charges) {
    if (!visibleIds.has(c.booking_id)) continue;
    if ((c as { is_supplemental?: boolean }).is_supplemental) continue;
    const name = (c.description || "Other").replace(/\s*[×x]\s*\d+\s*$/, "").trim() || "Other";
    const cur = addonItems.get(name) ?? { revenue: 0, jobs: new Set<string>() };
    cur.revenue += Number(c.unit_price) * Number(c.quantity);
    cur.jobs.add(c.booking_id);
    addonItems.set(name, cur);
  }
  const addonBreakdown = Array.from(addonItems.entries())
    .map(([name, x]) => ({ name, revenue: x.revenue, jobs: x.jobs.size }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12);

  // Events by location — where the business actually happens this period.
  const byLocation = (() => {
    const m = new Map<string, { label: string; count: number; revenue: number }>();
    for (const r of visibleOrders) {
      const key = r.b.location_type === "off_prem" ? "__off" : (r.b.room_id ?? "__unassigned");
      const label = r.b.location_type === "off_prem" ? "📍 Off-premise"
        : r.b.room_id ? `🏛️ ${roomsMap.get(r.b.room_id) ?? "Room"}` : "🏛️ Unassigned";
      const e = m.get(key) ?? { label, count: 0, revenue: 0 };
      e.count++; e.revenue += r.fin.total;
      m.set(key, e);
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  })();

  // Revenue chart series — bucketed by week / month / year, always from the
  // period-filtered orders (so it respects the dashboard period control).
  function bucketKey(d: Date): { key: string; label: string } {
    if (bucket === "year") {
      return { key: String(d.getFullYear()), label: String(d.getFullYear()) };
    }
    if (bucket === "week") {
      const wk = new Date(d); wk.setDate(d.getDate() - d.getDay()); // Sunday
      const key = wk.toISOString().slice(0, 10);
      return { key, label: wk.toLocaleString("en-US", { month: "short", day: "numeric" }) };
    }
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }) };
  }
  const revMap = new Map<string, { label: string; v: number }>();
  for (const { b, fin } of visibleOrders) {
    if (!b.event_date) continue;
    const { key, label } = bucketKey(parseLocalDate(b.event_date));
    const cur = revMap.get(key) ?? { label, v: 0 };
    cur.v += fin.total; revMap.set(key, cur);
  }
  const chartMonthly = Array.from(revMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, val]) => val);

  // Revenue by type (respects the period).
  const typeMapP = new Map<string, number>();
  for (const { b, fin } of visibleOrders) { const t = b.event_type || "Other"; typeMapP.set(t, (typeMapP.get(t) ?? 0) + fin.total); }
  const chartByType = Array.from(typeMapP.entries()).map(([type, v]) => ({ type, v })).sort((a, b) => b.v - a.v);

  return (
    <div>
      <header className="mb-8">
        <h1 className="page-title">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Live from bookings, charges, and payments — nothing to refresh.</p>
        <div className="gold-rule mt-3" />
      </header>

      {/* ── PERIOD CONTROL (governs period-appropriate sections) ── */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 mr-1">PERIOD:</span>
            {([["all", "All Time"], ["week", "This Week"], ["month", "This Month"], ["year", "This Year"]] as const).map(([p, label]) => (
              <button key={p} onClick={() => applyPreset(p)}
                className={`text-xs px-3 py-1.5 rounded-full border ${periodPreset === p ? "bg-navy text-white border-navy" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <label className="text-slate-500">From</label>
            <input type="date" className="field !py-1 !text-xs" value={periodStart}
              onChange={(e) => { setPeriodStart(e.target.value); setPeriodPreset("custom"); }} />
            <label className="text-slate-500">To</label>
            <input type="date" className="field !py-1 !text-xs" value={periodEnd}
              onChange={(e) => { setPeriodEnd(e.target.value); setPeriodPreset("custom"); }} />
          </div>
        </div>
        {periodActive && (
          <p className="text-[11px] text-slate-400 mt-2">
            Showing period-appropriate metrics for {periodStart || "earliest"} → {periodEnd || "latest"}. Snapshot metrics (Upcoming Revenue, Outstanding A/R, Booking Status) always reflect today.
          </p>
        )}
      </div>

      {/* ── REVENUE BREAKDOWN ── */}
      <SectionTitle>Revenue (contracted)</SectionTitle>
      <div className="card p-5 mb-6">
        <table className="w-full text-sm max-w-md">
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-2 text-slate-600">Subtotal (all charges)</td>
              <td className="py-2 text-right font-medium">{fmtMoney(D.totalSubtotal)}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-2 text-slate-600">NJ Sales Tax (6.625%)</td>
              <td className="py-2 text-right font-medium">{fmtMoney(D.totalTax)}</td>
            </tr>
            <tr>
              <td className="py-2 font-display font-bold">Total Revenue</td>
              <td className="py-2 text-right font-display font-bold text-navy">{fmtMoney(D.totalRevenue)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── GRAND TOTALS ── */}
      <SectionTitle>Grand Totals</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Big label="Total Revenue" value={fmtMoney(D.totalRevenue)} tone="text-navy" />
        <Big label="Total Collected" value={fmtMoney(D.totalCollected)} tone="text-emerald-600" />
        <Big label="Outstanding A/R" value={fmtMoney(D.outstandingAR)} tone="text-red-600" />
        <Big label="Cash Collected" value={fmtMoney(D.cashCollected)} tone="text-gold" />
      </div>

      {/* Charts — each full-width on its own row; respect the period filter */}
      <div className="card p-5 mb-5">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <SectionTitle>Revenue by {bucket === "week" ? "Week" : bucket === "year" ? "Year" : "Month"}</SectionTitle>
          <div className="flex gap-1">
            {(["week", "month", "year"] as const).map((bk) => (
              <button key={bk} onClick={() => setBucket(bk)}
                className={`text-xs px-3 py-1 rounded-full border ${bucket === bk ? "bg-navy text-white border-navy" : "border-slate-300 text-slate-500 hover:bg-slate-50"}`}>
                {bk[0].toUpperCase() + bk.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-3">Contracted revenue by event date — spot your busy and slow seasons.</p>
        <BarChart data={chartMonthly} height={300} />
      </div>
      <div className="card p-5 mb-8">
        <SectionTitle>Revenue by Event Type{periodActive ? " (period)" : ""}</SectionTitle>
        <p className="text-xs text-slate-400 mb-3">Where your revenue comes from.</p>
        <DonutChart data={chartByType} />
      </div>

      {/* Business health analytics (respect the period filter) */}
      <SectionTitle>Business Health{periodActive ? " (period)" : ""}</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Big label="Collection Rate" value={`${collectionRate.toFixed(0)}%`} tone="text-emerald-600" />
        <Big label="Deposit Conversion" value={`${conversionRate.toFixed(0)}%`} tone="text-navy" />
        <Big label="Repeat Revenue" value={`${repeatPct.toFixed(0)}%`} tone="text-gold" />
        <Big label="Total Guests" value={totalGuests.toLocaleString()} tone="text-navy" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Big label="Avg Guests / Event" value={String(avgGuests)} tone="text-slate-600" />
        <Big label="Avg Event Size" value={fmtMoney(periodAvg)} tone="text-slate-600" />
        <Big label="Repeat Revenue $" value={fmtMoney(repeatRevenue)} tone="text-gold" />
        <Big label="CC Fees Paid" value={fmtMoney(D.ccFees)} tone="text-red-600" />
      </div>

      <SectionTitle>Add-On Sales (pre-event, above base){periodActive ? " (period)" : ""}</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Big label="Add-On Revenue" value={fmtMoney(addonRevenue)} tone="text-emerald-600" />
        <Big label="Jobs with Add-Ons" value={String(addonJobs)} tone="text-navy" />
        <Big label="Avg Add-On / Job" value={fmtMoney(addonAvg)} tone="text-gold" />
        <Big label="Attach Rate" value={`${addonAttachRate.toFixed(0)}%`} tone="text-slate-600" />
      </div>
      {addonBreakdown.length > 0 && (
        <div className="card p-5 mb-8">
          <SectionTitle>Events by Location</SectionTitle>
          {byLocation.length <= 1 && roomsMap.size <= 1 ? (
            <p className="text-xs text-slate-400 mt-2 mb-4">One location — add rooms or enable off-premise in Locations & Capacity to see the split.</p>
          ) : (
            <div className="mt-2 mb-5 space-y-2">
              {byLocation.map((l) => {
                const max = byLocation[0]?.count || 1;
                return (
                  <div key={l.label} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">{l.label}</span>
                      <span className="whitespace-nowrap text-right">
                        <span className="font-semibold">{l.count} event{l.count === 1 ? "" : "s"}</span>
                        <span className="text-xs text-slate-400"> · {fmtMoney(l.revenue)}</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 mt-1">
                      <div className="h-1.5 rounded-full bg-navy/70" style={{ width: `${Math.max(4, (l.count / max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <SectionTitle>Top 5 Add-Ons</SectionTitle>
          {(() => {
            const totalRev = addonBreakdown.reduce((t, a) => t + a.revenue, 0) || 1;
            const top = showAllAddons ? addonBreakdown : addonBreakdown.slice(0, 5);
            const max = addonBreakdown[0]?.revenue || 1;
            return (
              <div className="mt-2 space-y-2">
                {top.map((a) => (
                  <div key={a.name} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">{a.name}</span>
                      <span className="whitespace-nowrap text-right">
                        <span className="font-semibold">{fmtMoney(a.revenue)}</span>
                        <span className="text-xs text-slate-400"> · {a.jobs} job{a.jobs === 1 ? "" : "s"} · {Math.round((a.revenue / totalRev) * 100)}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 mt-1">
                      <div className="h-1.5 rounded-full bg-gold" style={{ width: `${Math.max(4, (a.revenue / max) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                {addonBreakdown.length > 5 && (
                  <button
                    className="inline-flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-navy/5 border border-navy/15 rounded-full px-3 py-1 transition-colors mt-1"
                    onClick={() => setShowAllAddons((v) => !v)}>
                    {showAllAddons ? "− Show top 5 only" : `＋ View all ${addonBreakdown.length} add-ons`}
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <div className="card p-5 mb-8 border-2 border-navy/20">
        <SectionTitle>Revenue Summary{periodActive ? ` · ${periodStart || "earliest"} → ${periodEnd || "latest"}` : " · All Time"}</SectionTitle>
        <p className="text-xs text-slate-400 mb-3">Net = pre-tax · Gross = net + tax. Payment rows show gross collected by method.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Big label="Events" value={String(periodCount)} tone="text-navy" />
          <Big label="Net Revenue (pre-tax)" value={fmtMoney(orderTotals.subtotal)} tone="text-navy" />
          <Big label="Tax" value={fmtMoney(orderTotals.tax)} tone="text-slate-500" />
          <Big label="Gross Revenue (net+tax)" value={fmtMoney(orderTotals.total)} tone="text-navy" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <Big label="Collected" value={fmtMoney(orderTotals.paid)} tone="text-emerald-600" />
          <Big label="Gross by Cash" value={fmtMoney(orderTotals.cash)} tone="text-gold" />
          <Big label="Gross by Check/Zelle" value={fmtMoney(orderTotals.checkZelle)} tone="text-gold" />
          <Big label="Gross by Card" value={fmtMoney(orderTotals.cc)} tone="text-gold" />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-8">
        {/* Payment breakdown */}
        <div className="card p-5">
          <SectionTitle>Payment Breakdown</SectionTitle>
          <table className="w-full text-sm">
            <tbody>
              {D.methods.map((r) => (
                <tr key={r.m} className="border-b border-slate-100">
                  <td className="py-2">{r.m}</td>
                  <td className="py-2 text-center text-slate-500">{r.count} payment{r.count === 1 ? "" : "s"}</td>
                  <td className="py-2 text-right font-medium">{fmtMoney(r.sum)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 font-semibold text-gold">CC Fees Earned</td>
                <td />
                <td className="py-2 text-right font-semibold text-gold">{fmtMoney(D.ccFees)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Cash tracking */}
        <div className="card p-5">
          <SectionTitle>Cash Tracking</SectionTitle>
          <table className="w-full text-sm">
            <tbody>
              <KV k="Cash Deposits" v={fmtMoney(D.cashDeposits)} />
              <KV k="Cash Final Payments" v={fmtMoney(D.cashFinal)} />
              <KV k="Cash Other / Refunds" v={fmtMoney(D.cashOther)} />
              <tr>
                <td className="py-2 font-display font-bold">Total Cash</td>
                <td className="py-2 text-right font-display font-bold">{fmtMoney(D.cashCollected)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Upcoming revenue (always current — forward-looking snapshot) */}
        <div className="card p-5">
          <SectionTitle>📅 Upcoming Revenue</SectionTitle>
          <p className="text-[11px] text-slate-400 mb-2">As of today — not affected by the period filter.</p>
          <table className="w-full text-sm">
            <tbody>
              {D.upcoming.map((u) => <KV key={u.d} k={`Next ${u.d} Days`} v={fmtMoney(u.v)} />)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking status */}
      <SectionTitle>Booking Status</SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        {D.groups.map((g) => (
          <div key={g.label} className="card px-4 py-3 text-center">
            <div className="font-display font-bold text-2xl text-navy">{g.count}</div>
            <div className="text-[11px] text-slate-500 leading-tight">{g.label}</div>
            <div className="text-xs font-semibold mt-1">{fmtMoney(g.revenue)}</div>
          </div>
        ))}
      </div>

      {/* All orders */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <SectionTitle>All Orders{periodActive ? " (period)" : ""}</SectionTitle>
        <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => exportOrdersCSV(visibleOrders, D.methodPaid)}>
          ⬇️ Export CSV
        </button>
      </div>
      {(periodStart || periodEnd) && (
        <p className="text-xs text-slate-500 mb-2">Showing {visibleOrders.length} order(s) in the selected period.</p>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="bg-ink text-white text-left">
              {([
                ["event_date", "Event Date"], ["invoice_num", "Invoice #"], ["contact_name", "Customer"],
                ["event_type", "Type"], ["", "Guests"], ["", "Subtotal"], ["", "Tax"], ["total", "Total"],
                ["", "Cash"], ["", "Check/Zelle"], ["", "Credit Card"], ["paid", "Total Paid"],
                ["balance", "Balance"], ["status", "Status"],
              ] as [string, string][]).map(([key, h]) => (
                <th key={h} className={`px-3 py-2.5 font-semibold ${key ? "cursor-pointer select-none hover:bg-white/10" : ""}`}
                  onClick={key ? () => toggleOrdSort(key) : undefined}>
                  {h}{key && ordSort === key ? (ordDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleOrders.map(({ b, fin, paid, balance }) => {
              const st = stageFor(b.status);
              const g = fin.guests;
              return (
                <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">{fmtDate(b.event_date)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/bookings/${b.id}`} className="font-bold text-navy hover:underline">#{b.invoice_num}</Link>
                  </td>
                  <td className="px-3 py-2">{b.contact_name}</td>
                  <td className="px-3 py-2">{b.event_type ?? "—"}</td>
                  <td className="px-3 py-2 text-center">{(g.gendered ? g.men + g.women : g.adults) + g.children || "—"}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(fin.subtotal)}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(fin.tax)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtMoney(fin.total)}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(D.methodPaid(b.id, ["Cash"]))}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(D.methodPaid(b.id, ["Check", "Zelle"]))}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(D.methodPaid(b.id, ["Credit Card"]))}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtMoney(paid)}</td>
                  <td className={`px-3 py-2 text-right font-bold ${balance > 0.01 ? "text-red-600" : "text-emerald-600"}`}>
                    {balance > 0.01 ? fmtMoney(balance) : "PAID"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: st.color, color: st.textColor }}>
                      {st.label.replace("Booked — ", "")}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink bg-slate-50 font-bold">
              <td className="px-3 py-2.5" colSpan={4}>TOTALS ({visibleOrders.length} orders)</td>
              <td className="px-3 py-2.5"></td>
              <td className="px-3 py-2.5 text-right">{fmtMoney(orderTotals.subtotal)}</td>
              <td className="px-3 py-2.5 text-right">{fmtMoney(orderTotals.tax)}</td>
              <td className="px-3 py-2.5 text-right text-navy">{fmtMoney(orderTotals.total)}</td>
              <td className="px-3 py-2.5 text-right">{fmtMoney(orderTotals.cash)}</td>
              <td className="px-3 py-2.5 text-right">{fmtMoney(orderTotals.checkZelle)}</td>
              <td className="px-3 py-2.5 text-right">{fmtMoney(orderTotals.cc)}</td>
              <td className="px-3 py-2.5 text-right">{fmtMoney(orderTotals.paid)}</td>
              <td className={`px-3 py-2.5 text-right ${orderTotals.balance > 0.01 ? "text-red-600" : "text-emerald-600"}`}>{fmtMoney(orderTotals.balance)}</td>
              <td className="px-3 py-2.5"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function exportOrdersCSV(
  orders: { b: Booking; fin: { subtotal: number; tax: number; total: number; guests: { gendered: boolean; men: number; women: number; adults: number; children: number } }; paid: number; balance: number }[],
  methodPaid: (bid: string, methods: string[]) => number
) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = ["Event Date", "Invoice #", "Customer", "Type", "Guests", "Subtotal", "Tax", "Total", "Cash", "Check/Zelle", "Credit Card", "Total Paid", "Balance", "Status"];
  const lines = [headers.join(",")];
  for (const { b, fin, paid, balance } of orders) {
    const g = fin.guests;
    const guestCount = (g.gendered ? g.men + g.women : g.adults) + g.children;
    lines.push([
      esc(fmtDate(b.event_date)), esc(b.invoice_num), esc(b.contact_name ?? ""),
      esc(b.event_type ?? ""), esc(guestCount || ""),
      fin.subtotal.toFixed(2), fin.tax.toFixed(2), fin.total.toFixed(2),
      methodPaid(b.id, ["Cash"]).toFixed(2),
      methodPaid(b.id, ["Check", "Zelle"]).toFixed(2),
      methodPaid(b.id, ["Credit Card"]).toFixed(2),
      paid.toFixed(2), balance.toFixed(2), esc(stageFor(b.status).label),
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `event-space-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Lightweight inline SVG charts (no external dependency) ───
function BarChart({ data, height = 300 }: { data: { label: string; v: number }[]; height?: number }) {
  if (data.length === 0) return <p className="text-sm text-slate-400">No data yet.</p>;
  const max = Math.max(...data.map((d) => d.v), 1);
  const W = Math.max(600, data.length * 70); // widen so bars/labels have room; scrolls if needed
  const H = height;
  const padB = 46, padT = 24, padL = 8, padR = 8;
  const plotH = H - padB - padT;
  const bw = (W - padL - padR) / data.length;
  const money = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} className="block" style={{ minWidth: "100%" }}>
        {data.map((d, i) => {
          const h = (d.v / max) * plotH;
          const x = padL + i * bw;
          const y = padT + (plotH - h);
          return (
            <g key={d.label + i}>
              <rect x={x + bw * 0.18} y={y} width={bw * 0.64} height={h} fill="#1F4E79" rx="3" />
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize="12" fill="#1F4E79" fontWeight="600">
                {money(d.v)}
              </text>
              <text x={x + bw / 2} y={H - padB + 18} textAnchor="middle" fontSize="12" fill="#64748b">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DonutChart({ data }: { data: { type: string; v: number }[] }) {
  const total = data.reduce((s, d) => s + d.v, 0);
  if (total === 0) return <p className="text-sm text-slate-400">No data yet.</p>;
  const colors = ["#1F4E79", "#B08A3E", "#2E7D5B", "#8B4A6B", "#5A6B8C", "#C77D3E", "#4A7C8B", "#9B7B4A"];
  let acc = 0;
  const segs = data.map((d, i) => {
    const frac = d.v / total;
    const start = acc; acc += frac;
    const a0 = start * 2 * Math.PI - Math.PI / 2;
    const a1 = acc * 2 * Math.PI - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const r = 16, cx = 20, cy = 20;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    return { d, color: colors[i % colors.length], path: `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`, pct: Math.round(frac * 100) };
  });
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg viewBox="0 0 40 40" className="w-48 h-48 shrink-0">
        {segs.map((s) => <path key={s.d.type} d={s.path} fill={s.color} />)}
        <circle cx="20" cy="20" r="8" fill="white" />
      </svg>
      <div className="space-y-1.5 text-sm">
        {segs.map((s) => (
          <div key={s.d.type} className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-sm inline-block" style={{ background: s.color }} />
            <span className="text-slate-600">{s.d.type}</span>
            <span className="font-semibold text-navy">{fmtMoney(s.d.v)}</span>
            <span className="text-slate-400">({s.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display font-bold text-sm uppercase tracking-wider text-slate-600 mt-10 mb-3">{children}</h2>
  );
}
function Big({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="card px-5 py-4">
      <div className={`font-display text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-2 text-slate-600">{k}</td>
      <td className="py-2 text-right font-medium">{v}</td>
    </tr>
  );
}

export default function GuardedPage() {
  return (
    <PageGuard perm="dashboard.view">
      <Dashboard />
    </PageGuard>
  );
}
