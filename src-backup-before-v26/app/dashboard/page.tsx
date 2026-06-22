"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Booking, fmtDate, fmtMoney, stageFor, parseLocalDate } from "@/lib/workflow";
import { bookingFinancials, ChargeLike } from "@/lib/finance";

interface PaymentRow {
  booking_id: string; payment_type: string; method: string;
  amount_received: number; amount_applied: number; cc_fee: number; created_at: string;
}
interface ChargeRowDb extends ChargeLike { booking_id: string; }

const STATUS_GROUPS: { label: string; statuses: string[] }[] = [
  { label: "On Hold", statuses: ["on_hold", "conflict", "hold_expired"] },
  { label: "Booked — Pending Menu", statuses: ["schedule_menu_discussion", "send_menu_form"] },
  { label: "Needs Invoice", statuses: ["menu_completed", "send_est_invoice"] },
  { label: "Invoice Sent / Collecting", statuses: ["confirm_guest_count", "send_final_invoice", "collect_payment"] },
  { label: "Completed", statuses: ["completed"] },
];

export default function Dashboard() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [charges, setCharges] = useState<ChargeRowDb[]>([]);

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

    // ── This month ──
    const now = new Date();
    const inThisMonth = (d: Date) => d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    const monthRows = rows.filter((r) => r.b.event_date && inThisMonth(parseLocalDate(r.b.event_date)));
    const monthRevenue = monthRows.reduce((s, r) => s + r.fin.total, 0);
    const monthCollected = sumApplied(payments.filter((p) => inThisMonth(new Date(p.created_at))));
    const monthCash = sumApplied(cash.filter((p) => inThisMonth(new Date(p.created_at))));

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
      monthCount: monthRows.length, monthRevenue, monthCollected, monthCash,
      monthAvg: monthRows.length ? monthRevenue / monthRows.length : 0,
      upcoming: [7, 30, 60, 90].map((d) => ({ d, v: upcoming(d) })),
      groups, orders, methodPaid,
    };
  }, [bookings, payments, charges]);

  if (!D) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Live from bookings, charges, and payments — nothing to refresh.</p>
        <div className="gold-rule mt-3" />
      </header>

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

        {/* This month */}
        <div className="card p-5">
          <SectionTitle>This Month</SectionTitle>
          <table className="w-full text-sm">
            <tbody>
              <KV k="Events This Month" v={String(D.monthCount)} />
              <KV k="Revenue This Month" v={fmtMoney(D.monthRevenue)} />
              <KV k="Collected This Month" v={fmtMoney(D.monthCollected)} />
              <KV k="Cash This Month" v={fmtMoney(D.monthCash)} />
              <KV k="Avg per Event" v={fmtMoney(D.monthAvg)} />
            </tbody>
          </table>
        </div>

        {/* Upcoming revenue */}
        <div className="card p-5">
          <SectionTitle>Upcoming Revenue</SectionTitle>
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
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>All Orders (most recent event first)</SectionTitle>
        <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => exportOrdersCSV(D.orders, D.methodPaid)}>
          ⬇️ Export CSV
        </button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="bg-ink text-white text-left">
              {["Event Date", "Invoice #", "Customer", "Type", "Guests", "Subtotal", "Tax", "Total", "Cash", "Check/Zelle", "Credit Card", "Total Paid", "Balance", "Status"]
                .map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {D.orders.map(({ b, fin, paid, balance }) => {
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display font-bold text-sm uppercase tracking-wider text-slate-600 mb-3">{children}</h2>
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
