"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, logActivity } from "@/lib/supabase";
import { Booking, fmtDate, fmtTime, fmtMoney, deriveGuests, menuBadge } from "@/lib/workflow";
import { PRICING, grossUpForCC } from "@/lib/pricing";
import { bookingFinancials } from "@/lib/finance";
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
    const f = bookingFinancials(b, charges);
    const g = f.guests;
    const adults = g.gendered ? g.men + g.women : g.adults;
    const adultPP = b.menu_type === "Double Buffet" ? PRICING.BUFFET_DOUBLE_PP : PRICING.FULL_SERVICE_PP;
    const paid = payments.reduce((s, p) => s + Number(p.amount_applied), 0);
    const balance = Math.max(0, f.total - paid);
    const version = b.invoice_version ?? (g.source === "confirmed" ? "Final" : "Estimated");
    return { g, adults, adultPP, base: f.base, subtotal: f.subtotal, tax: f.tax, total: f.total,
      paid, balance, version, billedToMinimum: f.billedToMinimum, minGuests: f.minGuests, actualHeads: f.actualHeads };
  }, [b, charges, payments]);

  if (!b || !inv) return <p className="text-slate-500">Loading…</p>;

  const menuLines = buildMenuLines(b, template);
  const emailBody = buildEmailBody(b, inv, charges, menuLines);
  const emailHtml = buildInvoiceHtml(b, inv, charges, menuLines);

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
              to: b.email, subject, text: emailBody, html: emailHtml,
              bookingId: b.id, invoiceNum: b.invoice_num, action: `${inv.version} Invoice Emailed`,
            });
            if (!sent.ok) {
              window.open(
                `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(b.email ?? "")}` +
                  `&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`, "_blank");
            }
            // Mark sent, and advance the workflow only now (emailing is what advances).
            const patch: Record<string, unknown> = { invoice_sent_at: new Date().toISOString() };
            if (b.status === "send_est_invoice" || b.status === "menu_completed") patch.status = "confirm_guest_count";
            if (b.status === "send_final_invoice") patch.status = "collect_payment";
            await supabase.from("bookings").update(patch).eq("id", b.id);
            await supabase.from("activity_log").insert({
              booking_id: b.id, invoice_num: b.invoice_num,
              action: `${inv.version} Invoice Emailed`, result: "SUCCESS",
              details: sent.ok ? `Sent to ${b.email}` : "Gmail fallback opened",
            });
            // Auto-return to the booking — landing back here proves it sent and advanced.
            router.push(`/bookings/${b.id}`);
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
              {inv.billedToMinimum && (
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 text-slate-500 italic" colSpan={3}>Minimum guarantee ({inv.minGuests} guests; actual {inv.actualHeads})</td>
                  <td className="py-2.5 text-right">{fmtMoney((inv.minGuests - inv.actualHeads) * inv.adultPP)}</td>
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
              <p>Credit card charges incur an additional 3% processing fee (balance via card: {fmtMoney(grossUpForCC(inv.balance).total)}).</p>
            )}
            <p>Payment accepted by cash, check, Zelle, or credit card.</p>
            <p style={{ marginTop: "6px" }}>Thank you for celebrating with us!</p>
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

// ─── Branded HTML invoice for the email body (inline styles for email clients) ───
function buildInvoiceHtml(
  b: Booking,
  inv: { g: { men: number; women: number; children: number; adults: number; gendered: boolean; source: string }; adults: number; adultPP: number; subtotal: number; tax: number; total: number; paid: number; balance: number; version: string; billedToMinimum: boolean; minGuests: number; actualHeads: number },
  charges: Charge[],
  menuLines: MenuLine[]
): string {
  const money = (n: number) => "$" + n.toFixed(2);
  const navy = "#16314F", gold = "#B08A3E", ink = "#1F4E79";
  const row = (label: string, qty: string, unit: string, amt: string, opts: { bold?: boolean; adj?: boolean } = {}) =>
    `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;${opts.bold ? "font-weight:bold;" : ""}${opts.adj ? "color:" + gold + ";" : ""}">${label}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">${qty}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${unit}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;${opts.bold ? "font-weight:bold;" : ""}">${amt}</td>
    </tr>`;

  const lineRows: string[] = [];
  if (inv.adults > 0) {
    const lbl = inv.g.gendered ? `${b.menu_type} — Adults (${inv.g.men} men, ${inv.g.women} women)` : `${b.menu_type} — Adults`;
    lineRows.push(row(lbl, String(inv.adults), money(inv.adultPP), money(inv.adults * inv.adultPP)));
  }
  if (inv.billedToMinimum) {
    lineRows.push(row(`Minimum guarantee (${inv.minGuests} guests; actual ${inv.actualHeads})`, "", "", money((inv.minGuests - inv.actualHeads) * inv.adultPP), { adj: true }));
  }
  if (inv.g.children > 0) {
    lineRows.push(row("Children's Menu", String(inv.g.children), money(50), money(inv.g.children * 50)));
  }
  for (const c of charges) {
    lineRows.push(row(`${c.is_adjustment ? "[ADJ] " : ""}${c.description}`, String(c.quantity), money(Number(c.unit_price)), money(c.quantity * Number(c.unit_price)), { adj: c.is_adjustment }));
  }

  const menuBlock = menuLines.length === 0 ? "" : `
    <div style="margin-top:28px;">
      <div style="font-size:11px;letter-spacing:2px;color:${gold};text-transform:uppercase;font-weight:bold;border-bottom:2px solid ${navy};padding-bottom:4px;">Menu Selections</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
        ${menuLines.map((m) => `<tr><td style="padding:5px 0;color:#666;border-bottom:1px solid #f0f0f0;">${m.title}</td><td style="padding:5px 0;text-align:right;font-weight:500;border-bottom:1px solid #f0f0f0;">${m.value}</td></tr>`).join("")}
      </table>
      <p style="font-size:12px;color:#888;margin-top:8px;">Please review carefully and reply with any corrections.</p>
    </div>`;

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <div style="max-width:640px;margin:0 auto;background:#fff;">
    <!-- header -->
    <div style="background:${navy};padding:28px 32px;color:#fff;">
      <table style="width:100%;"><tr>
        <td>
          <div style="font-size:20px;font-weight:bold;letter-spacing:0.5px;">EVENT SPACE</div>
          <div style="font-size:11px;letter-spacing:3px;color:${gold};font-weight:bold;">BY BURGER BAR</div>
          <div style="font-size:12px;color:#cbd5e1;margin-top:8px;">Jackson, NJ · (848) 299-9079</div>
        </td>
        <td style="text-align:right;vertical-align:top;">
          <div style="font-size:22px;font-weight:bold;color:${gold};">${inv.version.toUpperCase()} INVOICE</div>
          <div style="font-size:16px;font-weight:bold;margin-top:4px;">#${b.invoice_num}</div>
          <div style="font-size:12px;color:#cbd5e1;margin-top:4px;">${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
        </td>
      </tr></table>
    </div>

    <div style="padding:28px 32px;">
      <!-- bill to / event -->
      <table style="width:100%;font-size:14px;margin-bottom:20px;"><tr>
        <td style="vertical-align:top;">
          <div style="font-size:11px;font-weight:bold;color:${gold};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Billed To</div>
          <div style="font-weight:bold;">${b.contact_name ?? ""}</div>
          ${b.email ? `<div style="color:#666;">${b.email}</div>` : ""}
          ${b.phone ? `<div style="color:#666;">${b.phone}</div>` : ""}
        </td>
        <td style="text-align:right;vertical-align:top;">
          <div style="font-size:11px;font-weight:bold;color:${gold};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Event</div>
          <div style="font-weight:bold;">${b.event_name || b.event_type || ""}</div>
          <div style="color:#666;">${fmtDate(b.event_date)} · ${fmtTime(b.event_time)}</div>
        </td>
      </tr></table>

      <!-- line items -->
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="border-bottom:2px solid ${navy};text-align:left;">
          <th style="padding:8px 0;">Description</th>
          <th style="padding:8px 0;text-align:center;">Qty</th>
          <th style="padding:8px 0;text-align:right;">Unit</th>
          <th style="padding:8px 0;text-align:right;">Amount</th>
        </tr>
        ${lineRows.join("")}
      </table>

      <!-- totals -->
      <table style="width:100%;margin-top:18px;font-size:14px;"><tr><td></td><td style="width:280px;">
        <table style="width:100%;">
          <tr><td style="padding:3px 0;color:#666;">Subtotal</td><td style="padding:3px 0;text-align:right;">${money(inv.subtotal)}</td></tr>
          <tr><td style="padding:3px 0;color:#666;">NJ Sales Tax (6.625%)</td><td style="padding:3px 0;text-align:right;">${money(inv.tax)}</td></tr>
          <tr style="border-top:1px solid ${navy};"><td style="padding:6px 0;font-weight:bold;">Total</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${money(inv.total)}</td></tr>
          ${inv.paid !== 0 ? `<tr><td style="padding:3px 0;color:#16a34a;">Payments received</td><td style="padding:3px 0;text-align:right;color:#16a34a;">−${money(inv.paid)}</td></tr>` : ""}
          <tr style="border-top:2px solid ${navy};"><td style="padding:8px 0;font-size:17px;font-weight:bold;">Balance Due</td><td style="padding:8px 0;text-align:right;font-size:17px;font-weight:bold;color:${inv.balance <= 0.01 ? "#16a34a" : ink};">${inv.balance <= 0.01 ? "PAID IN FULL" : money(inv.balance)}</td></tr>
        </table>
      </td></tr></table>

      ${menuBlock}

      <!-- footer -->
      <div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;font-size:12px;color:#888;line-height:1.6;">
        ${inv.version === "Estimated" ? "<p style='margin:4px 0;'>This is an estimated invoice. Final totals are confirmed after your guest count and menu are finalized.</p>" : ""}
        ${inv.balance > 0.01 ? `<p style='margin:4px 0;'>Credit card charges incur an additional 3% processing fee (balance via card: ${money(grossUpForCC(inv.balance).total)}).</p>` : ""}
        <p style="margin:4px 0;">Payment accepted by cash, check, Zelle, or credit card.</p>
        <p style="margin:8px 0 4px;">Thank you for celebrating with us!</p>
        <p style="margin:4px 0;">Questions? Call us at (848) 299-9079.</p>
      </div>
    </div>
    <div style="height:8px;background:${gold};"></div>
  </div>
  </body></html>`;
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
  if (inv.balance > 0.01) L.push(`Credit card charges incur an additional 3% processing fee (balance via card: ${money(grossUpForCC(inv.balance).total)}).`);
  L.push("Payment accepted by cash, check, Zelle, or credit card.");
  L.push("");
  L.push("Questions? Call us at (848) 299-9079.");
  L.push("");
  L.push("Thank you,");
  L.push("Event Space by Burger Bar");
  return L.join("\n");
}
