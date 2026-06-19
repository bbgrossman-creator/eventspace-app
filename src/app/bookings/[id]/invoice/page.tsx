"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, logActivity } from "@/lib/supabase";
import { Booking, fmtDate, fmtTime, fmtMoney, deriveGuests, menuBadge } from "@/lib/workflow";
import { PRICING, buffetBaseTotal, invoiceTotals, grossUpForCC } from "@/lib/pricing";
import { MenuTemplate, isVisible } from "@/lib/menuEngine";
import { templateSlugFor } from "@/lib/menuCharges";
import { sendEmail } from "@/lib/sendEmail";

interface Charge { id: string; description: string; quantity: number; unit_price: number; taxable: boolean; is_adjustment: boolean; source: string | null; }
interface Payment { id: string; payment_type: string; method: string; amount_received: number; amount_applied: number; created_at: string; }

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Booking | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [template, setTemplate] = useState<MenuTemplate | null>(null);

  const load = useCallback(async () => {
    const [bk, ch, py] = await Promise.all([
      supabase.from("bookings").select("*").eq("id", id).single(),
      supabase.from("charges").select("*").eq("booking_id", id).order("created_at"),
      supabase.from("payments").select("*").eq("booking_id", id).order("created_at"),
    ]);
    setB(bk.data as Booking);
    setCharges((ch.data ?? []) as Charge[]);
    setPayments((py.data ?? []) as Payment[]);
    const booking = bk.data as Booking;
    const sel = booking?.menu as unknown as { template?: string };
    const slug = sel?.template ?? templateSlugFor(booking?.menu_type ?? null);
    if (slug) {
      const { data: tpl } = await supabase.from("menu_templates").select("config").eq("slug", slug).single();
      if (tpl) setTemplate(tpl.config as MenuTemplate);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const inv = useMemo(() => {
    if (!b) return null;
    const g = deriveGuests(b);
    const adults = g.gendered ? g.men + g.women : g.adults;
    const adultPP = b.menu_type === "Double Buffet" ? PRICING.BUFFET_DOUBLE_PP : PRICING.FULL_SERVICE_PP;
    const base = buffetBaseTotal(b.menu_type, g.gendered ? g.men : g.adults, g.gendered ? g.women : 0, g.children);
    const { subtotal, tax, total } = invoiceTotals(base, charges);
    const paid = payments.reduce((s, p) => s + Number(p.amount_applied), 0);
    const balance = Math.max(0, total - paid);
    const version = b.invoice_version ?? (g.source === "confirmed" ? "Final" : "Estimated");
    return { g, adults, adultPP, base, subtotal, tax, total, paid, balance, version };
  }, [b, charges, payments]);

  if (!b || !inv) return <p className="text-slate-500">Loading…</p>;

  const menuLines = buildMenuLines(b, template);
  const emailBody = buildEmailBody(b, inv, charges, menuLines);

  return (
    <div className="max-w-3xl">
      {/* Action bar — hidden when printing */}
      <div className="no-print flex items-center justify-between mb-6 flex-wrap gap-3">
        <button className="text-xs text-slate-400 hover:text-navy" onClick={() => router.push(`/bookings/${b.id}`)}>
          ← Back to #{b.invoice_num}
        </button>
        <div className="flex gap-2.5">
          <button className="btn-ghost" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
          <button className="btn-primary" onClick={async () => {
            const subject = `${inv.version} Invoice #${b.invoice_num} — Event Space by Burger Bar`;
            const sent = await sendEmail({
              to: b.email, subject, text: emailBody,
              bookingId: b.id, invoiceNum: b.invoice_num, action: `${inv.version} Invoice Emailed`,
            });
            if (!sent.ok) {
              window.open(
                `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(b.email ?? "")}` +
                  `&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`, "_blank");
            }
            await supabase.from("bookings").update({ invoice_sent_at: new Date().toISOString() }).eq("id", b.id);
            alert(sent.ok ? `Invoice emailed ✓ ${sent.detail}` : `Auto-send unavailable (${sent.detail}) — Gmail opened instead.`);
          }}>
            📧 Email Invoice
          </button>
        </div>
      </div>

      {/* ─── The invoice document ─── */}
      <div className="card overflow-hidden print:shadow-none">
        {/* Brand header */}
        <div className="bg-ink text-white px-8 py-6 flex items-start justify-between">
          <div>
            <div className="font-display text-xl font-bold tracking-tight">EVENT SPACE</div>
            <div className="text-[11px] tracking-[0.25em] text-gold font-semibold">BY BURGER BAR</div>
            <div className="text-xs text-slate-300 mt-2">Jackson, NJ · (848) 299-9079</div>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-bold text-gold">{inv.version.toUpperCase()} INVOICE</div>
            <div className="font-display font-bold text-lg mt-1">#{b.invoice_num}</div>
            <div className="text-xs text-slate-300 mt-1">{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
          </div>
        </div>

        <div className="px-8 py-6">
          {/* Bill to / event */}
          <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
            <div>
              <div className="text-[11px] font-bold text-gold uppercase tracking-wider mb-1">Billed to</div>
              <div className="font-semibold">{b.contact_name}</div>
              {b.email && <div className="text-slate-600">{b.email}</div>}
              {b.phone && <div className="text-slate-600">{b.phone}</div>}
            </div>
            <div className="text-right">
              <div className="text-[11px] font-bold text-gold uppercase tracking-wider mb-1">Event</div>
              <div className="font-semibold">{b.event_name || b.event_type}</div>
              <div className="text-slate-600">{fmtDate(b.event_date)} · {fmtTime(b.event_time)}</div>
              <div className="text-slate-600">{menuBadge(b.menu_type)}</div>
            </div>
          </div>

          {/* Line items */}
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="border-b-2 border-ink text-left">
                <th className="py-2 font-bold">Description</th>
                <th className="py-2 font-bold text-center w-16">Qty</th>
                <th className="py-2 font-bold text-right w-24">Unit</th>
                <th className="py-2 font-bold text-right w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.adults > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-2.5">{b.menu_type} — {inv.g.gendered ? `Adults (${inv.g.men} men, ${inv.g.women} women)` : "Adults"} {inv.g.source !== "confirmed" && <span className="text-amber-600 text-xs">(est.)</span>}</td>
                  <td className="py-2.5 text-center">{inv.adults}</td>
                  <td className="py-2.5 text-right">{fmtMoney(inv.adultPP)}</td>
                  <td className="py-2.5 text-right">{fmtMoney(inv.adults * inv.adultPP)}</td>
                </tr>
              )}
              {inv.g.children > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-2.5">Children&apos;s Menu {inv.g.source !== "confirmed" && <span className="text-amber-600 text-xs">(est.)</span>}</td>
                  <td className="py-2.5 text-center">{inv.g.children}</td>
                  <td className="py-2.5 text-right">{fmtMoney(PRICING.BUFFET_CHILDREN_PP)}</td>
                  <td className="py-2.5 text-right">{fmtMoney(inv.g.children * PRICING.BUFFET_CHILDREN_PP)}</td>
                </tr>
              )}
              {charges.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="py-2.5">
                    {c.is_adjustment && <span className="text-amber-600 font-semibold">[ADJ] </span>}
                    {c.description}
                  </td>
                  <td className="py-2.5 text-center">{c.quantity}</td>
                  <td className="py-2.5 text-right">{fmtMoney(c.unit_price)}</td>
                  <td className="py-2.5 text-right">{fmtMoney(c.quantity * c.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Menu selections — the full order confirmation */}
          {menuLines.length > 0 && (
            <div className="mb-6">
              <div className="text-[11px] font-bold text-gold uppercase tracking-wider mb-2 border-b-2 border-ink pb-1">
                Menu Selections
              </div>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                {menuLines.map((m) => (
                  <div key={m.title} className="flex justify-between gap-4 border-b border-slate-100 py-1.5">
                    <span className="text-slate-500">{m.title}</span>
                    <span className="text-right font-medium">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="flex justify-end mb-6">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span>{fmtMoney(inv.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">NJ Sales Tax (6.625%)</span><span>{fmtMoney(inv.tax)}</span></div>
              <div className="flex justify-between font-bold border-t border-ink pt-1.5"><span>Total</span><span>{fmtMoney(inv.total)}</span></div>
              {inv.paid !== 0 && (
                <div className="flex justify-between text-emerald-700"><span>Payments received</span><span>−{fmtMoney(inv.paid)}</span></div>
              )}
              <div className="flex justify-between font-display font-bold text-lg border-t-2 border-ink pt-2">
                <span>Balance Due</span>
                <span className={inv.balance <= 0.01 ? "text-emerald-600" : "text-ink"}>
                  {inv.balance <= 0.01 ? "PAID IN FULL" : fmtMoney(inv.balance)}
                </span>
              </div>
            </div>
          </div>

          {/* Payments record */}
          {payments.length > 0 && (
            <div className="mb-6">
              <div className="text-[11px] font-bold text-gold uppercase tracking-wider mb-2">Payment record</div>
              {payments.map((p) => (
                <div key={p.id} className="flex justify-between text-xs text-slate-600 py-0.5">
                  <span>{new Date(p.created_at).toLocaleDateString()} — {p.payment_type} ({p.method})</span>
                  <span>{fmtMoney(Number(p.amount_applied))}</span>
                </div>
              ))}
            </div>
          )}

          {/* Footer terms */}
          <div className="border-t border-slate-200 pt-4 text-[11px] text-slate-500 space-y-1">
            {inv.version === "Estimated" && (
              <p>This is an estimated invoice. Final totals are confirmed after your guest count and menu are finalized.</p>
            )}
            {inv.balance > 0.01 && (
              <p>Credit card payments include a 3% processing fee — balance via card: {fmtMoney(grossUpForCC(inv.balance).total)}.</p>
            )}
            <p>Payment accepted by cash, check, Zelle, or credit card. Thank you for celebrating with us!</p>
          </div>
        </div>
        <div className="h-2 bg-gold" />
      </div>
    </div>
  );
}

// ─── Menu selections in template order, human-readable ───
export interface MenuLine { title: string; value: string }
function buildMenuLines(b: Booking, template: MenuTemplate | null): MenuLine[] {
  const sel = b.menu as unknown as { guests?: { men: number; women: number; children: number }; answers?: Record<string, unknown> };
  if (!sel?.answers || !template) return [];
  const a = sel.answers;
  const out: MenuLine[] = [];
  if (sel.guests) out.push({ title: "Guest Count", value: `${sel.guests.men} men · ${sel.guests.women} women · ${sel.guests.children} children` });
  for (const s of template.sections) {
    if (s.type === "info" || !isVisible(s, a)) continue;
    const v = a[s.key];
    let value = "";
    if (typeof v === "string" && v.trim()) value = v;
    else if (Array.isArray(v) && v.length > 0) value = (v as string[]).join(", ");
    else if (v && typeof v === "object") {
      const entries = Object.entries(v as Record<string, number>).filter(([, q]) => Number(q) > 0);
      if (entries.length) value = entries.map(([l, q]) => `${l} × ${q}`).join(", ");
    }
    if (value) out.push({ title: s.title.replace(/\s*\(.*?\)\s*$/, ""), value });
  }
  return out;
}

// ─── Plain-text invoice for the Gmail compose body ───
function buildEmailBody(
  b: Booking,
  inv: { g: { men: number; women: number; children: number; source: string }; adults: number; adultPP: number; subtotal: number; tax: number; total: number; paid: number; balance: number; version: string },
  charges: Charge[],
  menuLines: MenuLine[]
): string {
  const L: string[] = [];
  const money = (n: number) => "$" + n.toFixed(2);
  L.push(`Dear ${b.contact_name},`);
  L.push("");
  L.push(`Please find your ${inv.version.toLowerCase()} invoice for ${b.event_name || "your event"} on ${fmtDate(b.event_date)} below.`);
  L.push("");
  L.push("═══════════════════════════════════════");
  L.push(`${inv.version.toUpperCase()} INVOICE #${b.invoice_num} — EVENT SPACE BY BURGER BAR`);
  L.push("═══════════════════════════════════════");
  if (inv.adults > 0) L.push(`${b.menu_type} — Adults: ${inv.adults} × ${money(inv.adultPP)} = ${money(inv.adults * inv.adultPP)}`);
  if (inv.g.children > 0) L.push(`Children's Menu: ${inv.g.children} × ${money(PRICING.BUFFET_CHILDREN_PP)} = ${money(inv.g.children * PRICING.BUFFET_CHILDREN_PP)}`);
  for (const c of charges) L.push(`${c.is_adjustment ? "[ADJ] " : ""}${c.description}: ${c.quantity} × ${money(Number(c.unit_price))} = ${money(c.quantity * Number(c.unit_price))}`);
  L.push("───────────────────────────────────────");
  L.push(`Subtotal: ${money(inv.subtotal)}`);
  L.push(`NJ Sales Tax (6.625%): ${money(inv.tax)}`);
  L.push(`Total: ${money(inv.total)}`);
  if (inv.paid !== 0) L.push(`Payments received: −${money(inv.paid)}`);
  L.push(`BALANCE DUE: ${inv.balance <= 0.01 ? "PAID IN FULL" : money(inv.balance)}`);
  L.push("═══════════════════════════════════════");
  if (menuLines.length > 0) {
    L.push("");
    L.push("YOUR MENU SELECTIONS");
    L.push("───────────────────────────────────────");
    for (const m of menuLines) L.push(`${m.title}: ${m.value}`);
    L.push("───────────────────────────────────────");
    L.push("Please review carefully and reply with any corrections.");
  }
  L.push("");
  if (inv.version === "Estimated") L.push("This is an estimate — final totals are confirmed after your guest count and menu are finalized.");
  if (inv.balance > 0.01) L.push(`Payment by credit card adds a 3% processing fee (balance via card: ${money(grossUpForCC(inv.balance).total)}).`);
  L.push("Payment accepted by cash, check, Zelle, or credit card.");
  L.push("");
  L.push("Questions? Call us at (848) 299-9079.");
  L.push("");
  L.push("Thank you,");
  L.push("Event Space by Burger Bar");
  return L.join("\n");
}
