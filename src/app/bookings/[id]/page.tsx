"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, logActivity } from "@/lib/supabase";
import {
  Booking,
  Status,
  stageFor,
  fmtDate,
  fmtTime,
  fmtMoney,
  menuBadge,
  discussionState,
  deriveGuests,
  isHoldExpired, eventHasPassed } from "@/lib/workflow";
import { PRICING, calcCCFee, grossUpForCC, buffetBaseTotal, invoiceTotals } from "@/lib/pricing";
import { regenerateMenuCharges } from "@/lib/menuCharges";
import { bookingFinancials } from "@/lib/finance";
import ApprovalField from "@/components/ApprovalField";
import { sendEmail } from "@/lib/sendEmail";
import { runActionAutomation } from "@/lib/automation";
import StatusPipeline from "@/components/StatusPipeline";
import { STAGE_TO_STATUS, hasMenu, TIMELINE_MILESTONES, STAGES } from "@/lib/workflow";

interface Payment {
  id: string; payment_type: string; method: string; check_number?: string | null;
  amount_received: number; amount_applied: number; cc_fee: number;
  received_by: string | null; notes: string | null; created_at: string;
}
interface Charge {
  id: string; description: string; quantity: number; unit_price: number;
  taxable: boolean; is_adjustment: boolean;
}
interface LogRow { id: string; action: string; details: string | null; result: string; created_at: string; }

const SCHEDULING_LINK = "https://calendar.app.google/MuzMridpmcgdgj9r9";

function gmailCompose(to: string, subject: string, body: string) {
  window.open(
    `https://mail.google.com/mail/?view=cm&fs=1` +
      `&to=${encodeURIComponent(to)}` +
      `&su=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`,
    "_blank"
  );
}

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Booking | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [priorBookings, setPriorBookings] = useState(0);
  const [panel, setPanel] = useState<
    "" | "deposit" | "payment" | "charge" | "guestcount" | "cancel" | "edit" | "schedulecall" | "amend"
  >("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [bk, py, ch, lg] = await Promise.all([
      supabase.from("bookings").select("*").eq("id", id).single(),
      supabase.from("payments").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
      supabase.from("charges").select("*").eq("booking_id", id).order("created_at"),
      supabase.from("activity_log").select("*").eq("booking_id", id).order("created_at", { ascending: false }).limit(15),
    ]);
    setB(bk.data as Booking);
    setPayments((py.data ?? []) as Payment[]);
    setCharges((ch.data ?? []) as Charge[]);
    setLog((lg.data ?? []) as LogRow[]);
    const bb = bk.data as Booking;
    if (bb && (bb.phone || bb.email)) {
      const ors: string[] = [];
      if (bb.phone) ors.push(`phone.eq.${bb.phone}`);
      if (bb.email) ors.push(`email.eq.${bb.email}`);
      const { count } = await supabase.from("bookings")
        .select("id", { count: "exact", head: true })
        .neq("id", bb.id).or(ors.join(","));
      setPriorBookings(count ?? 0);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ─── Financials ───
  const fin = useMemo(() => {
    if (!b) return null;
    const f = bookingFinancials(b, charges);
    const paid = payments.reduce((s, p) => s + Number(p.amount_applied), 0);
    return {
      base: f.base, subtotal: f.subtotal, tax: f.tax, total: f.total, paid,
      balance: Math.max(0, f.total - paid),
      guests: f.guests,
      estimated: f.guests.source !== "confirmed",
      billedToMinimum: f.billedToMinimum,
      minGuests: f.minGuests,
      actualHeads: f.actualHeads,
    };
  }, [b, charges, payments]);

  async function setStatus(status: Status, action: string, details = "") {
    if (!b) return;
    const { error } = await supabase.from("bookings").update({ status }).eq("id", b.id);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    await logActivity(b.id, b.invoice_num, action, details || `Status → ${status}`);
    setMsg({ ok: true, text: `${action} ✓` });
    setPanel("");
    load();
  }

  // ─── Menu discussion email actions ───
  async function sendSchedulingEmail() {
    if (!b) return;
    const subject = `📞 Let's Plan Your Menu! - ${b.event_name || "Your Event"} - Event Space by Burger Bar`;
    const body =
      `Dear ${b.contact_name},\n\n` +
      `Your event at Event Space by Burger Bar is coming up on ${fmtDate(b.event_date)}!\n\n` +
      `Let's schedule a quick call to discuss and finalize your menu selections.\n\n` +
      `═══════════════════════════════════════\n` +
      `📅 SCHEDULE YOUR MENU DISCUSSION\n` +
      `═══════════════════════════════════════\n\n` +
      `Click the link below to pick a time that works for you:\n\n` +
      `👉 ${SCHEDULING_LINK}\n\n` +
      `During the call we'll go through:\n` +
      `  • Your menu selections (plated dinner or buffet)\n` +
      `  • Add-ons and extras\n` +
      `  • Guest count confirmation\n` +
      `  • Any dietary needs or special requests\n\n` +
      `⏰ Please schedule at least 7 days before your event\n` +
      `so we can finalize everything on time.\n\n` +
      `📄 OUR MENUS\n` +
      `Full Service: https://drive.google.com/file/d/1IMd8RvEGTmwMmc68AO9vljIC7N8zyLLp/view\n` +
      `Buffet: https://drive.google.com/file/d/1oof43BE8KZitW4yg7Wqz7U4_40t9AsIf/view\n\n` +
      `If you'd prefer to call directly: (848) 299-9079\n\n` +
      `We look forward to creating a wonderful event for you!\n\n` +
      `Event Space by Burger Bar`;
    const sent = await sendEmail({
      to: b.email, subject, text: body,
      bookingId: b.id, invoiceNum: b.invoice_num, action: "Menu Discussion Link Sent",
    });
    if (!sent.ok) {
      // Fall back to Gmail compose if automated send isn't configured
      gmailCompose(b.email ?? "", subject, body);
    }
    await supabase.from("bookings")
      .update({ menu_discussion_sent_at: new Date().toISOString() })
      .eq("id", b.id);
    setMsg(sent.ok ? { ok: true, text: `Scheduling link emailed ✓ (${sent.detail})` }
                   : { ok: false, text: `Auto-send unavailable (${sent.detail}) — Gmail compose opened instead.` });
    load();
  }

  async function sendRescheduleRequest() {
    if (!b) return;
    const apptFmt = b.menu_discussion_date
      ? new Date(b.menu_discussion_date).toLocaleString("en-US", {
          weekday: "long", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
        })
      : "";
    const subject = `📞 Need to move our menu call — ${b.event_name || "your event"}`;
    const body =
      `Dear ${b.contact_name},\n\n` +
      `We need to move our scheduled menu call` +
      (apptFmt ? ` (currently ${apptFmt})` : ``) +
      `.\n\nPlease pick a new time that works for you:\n\n` +
      `👉 ${SCHEDULING_LINK}\n\n` +
      `Sorry for the inconvenience, and thank you!\n\n` +
      `Event Space by Burger Bar\n(848) 299-9079`;
    gmailCompose(b.email ?? "", subject, body);
    await supabase.from("bookings").update({
      menu_discussion_date: null,
      menu_discussion_status: null,
      menu_discussion_sent_at: new Date().toISOString(),
    }).eq("id", b.id);
    await logActivity(b.id, b.invoice_num, "Reschedule Requested",
      "Old call time cleared — customer asked to rebook via scheduling link");
    load();
  }

  if (!b) return <p className="text-slate-500">Loading…</p>;
  const holdExpired = isHoldExpired(b);
  const stage = holdExpired ? stageFor("hold_expired") : stageFor(b.status);
  const ds = discussionState(b);
  const apptFmt = b.menu_discussion_date
    ? new Date(b.menu_discussion_date).toLocaleString("en-US", {
        weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
      })
    : "";

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {b.event_name || b.event_type || "Event"}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {fmtDate(b.event_date)} · {fmtTime(b.event_time)} · {menuBadge(b.menu_type)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="font-display font-bold text-lg bg-ink text-white rounded-full px-4 py-1.5">
              #{b.invoice_num}
            </span>
            {priorBookings > 0 && (
              <span className="rounded-full bg-goldsoft text-ink text-[11px] font-semibold px-3 py-1">
                ↩️ Returning customer · {priorBookings} other booking{priorBookings === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <div className="gold-rule mt-3" />
      </header>

      {/* Contact strip */}
      <div className="card px-5 py-4 mb-5 grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <Info label="Contact" value={b.contact_name} />
        <Info label="Phone" value={b.phone || "—"} link={b.phone ? `tel:${b.phone}` : undefined} />
        <Info label="Email" value={b.email || "—"} link={b.email ? `mailto:${b.email}` : undefined} />
        <Info label="Guests" value={(() => {
          const g = deriveGuests(b);
          const heads = (g.gendered ? g.men + g.women : g.adults) + g.children;
          if (heads <= 0) return "TBD";
          const suffix = g.source === "confirmed" ? "" : " (est.)";
          return g.gendered
            ? `${heads}${suffix}`
            : `${heads}${suffix}`;
        })()} />
      </div>

      {/* Pipeline + current status */}
      {stage.stageIndex >= 0 && (
        <div className="card p-5 mb-5">
          <StatusPipeline currentStage={stage.stageIndex} onStageClick={(i) => {
            const target = STAGE_TO_STATUS[i];
            if (target === b.status) return;
            // Guard: can't jump to invoice/count steps without a completed menu
            const needsMenu = ["send_est_invoice", "confirm_guest_count", "send_final_invoice", "completed"];
            if (needsMenu.includes(target) && !hasMenu(b)) {
              setMsg({ ok: false, text: "Complete the menu first — this booking has no menu selections yet." });
              return;
            }
            const forward = STAGES[target].stageIndex > stage.stageIndex;
            const verb = forward ? "Advance" : "Move back";
            if (confirm(`${verb} this booking to "${TIMELINE_MILESTONES[i]}"?`)) {
              setStatus(target, `Moved to ${TIMELINE_MILESTONES[i]}`, forward ? "Advanced manually" : "Moved back manually");
            }
          }} />
          <p className="text-[11px] text-slate-400 mt-2">Tap any stage to move this booking forward or back.</p>
        </div>
      )}
      <div className="rounded-2xl px-5 py-4 mb-5 flex items-center justify-between"
        style={{ background: stage.color, color: stage.textColor }}>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider opacity-70">Current status</div>
          <div className="font-display font-bold text-lg">{stage.icon} {stage.label}</div>
        </div>
        {b.status === "on_hold" && b.hold_expires && (
          <div className="text-xs font-semibold">
            {holdExpired ? "EXPIRED " : "Hold expires "}{new Date(b.hold_expires).toLocaleString()}
          </div>
        )}
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 mb-5 text-sm font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {msg.text}
        </div>
      )}

      {/* ─── Action buttons by status ─── */}
      <div className="card p-5 mb-5">
        {/* Menu discussion sub-state banners */}
        {b.status === "schedule_menu_discussion" && ds === "link_sent" && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-3 mb-3 text-sm text-amber-800">
            <b>📧 Scheduling link sent</b>{" "}
            {new Date(b.menu_discussion_sent_at!).toLocaleDateString()} — waiting for customer to pick a time
          </div>
        )}
        {b.status === "schedule_menu_discussion" && ds === "scheduled" && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-300 px-4 py-3 mb-3 text-sm text-emerald-800">
            <b>📞 Call scheduled:</b> {apptFmt}
          </div>
        )}
        {b.status === "schedule_menu_discussion" && ds === "overdue" && (
          <div className="rounded-lg bg-red-50 border border-red-300 px-4 py-3 mb-3 text-sm text-red-800">
            <b>⚠️ Scheduled call missed</b> — was {apptFmt}, menu not completed. Follow up with {b.contact_name}.
          </div>
        )}

        <div className="flex flex-wrap gap-2.5">
          {b.status === "on_hold" || b.status === "conflict" ? (
            <>
              <button className="btn-success" onClick={() => setPanel(panel === "deposit" ? "" : "deposit")}>
                💰 Record Deposit{holdExpired ? " (rebooks the date)" : ""}
              </button>
              {holdExpired && (
                <>
                  <button className="btn-warn" onClick={async () => {
                    const subject = `Your hold on ${fmtDate(b.event_date)} has expired — Event Space by Burger Bar`;
                    const body =
                      `Dear ${b.contact_name},\n\n` +
                      `The 24-hour courtesy hold on ${fmtDate(b.event_date)} at ${fmtTime(b.event_time)} for ${b.event_name || "your event"} has expired, ` +
                      `and we are no longer able to reserve the date.\n\n` +
                      `The good news: as of now, the date is still open. To secure it, a $${"500"} deposit is required — ` +
                      `we accept cash, check, Zelle, or credit card over the phone.\n\n` +
                      `Please call us at (848) 299-9079 or reply to this email and we'll take care of it right away.\n\n` +
                      `Thank you,\nEvent Space by Burger Bar`;
                    window.open(
                      `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(b.email ?? "")}` +
                      `&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
                    await logActivity(b.id, b.invoice_num, "Hold Expired Notice Sent", `Gmail compose opened for ${b.email}`);
                    load();
                  }}>
                    📧 Notify Customer (no new hold)
                  </button>
                  <button className="btn-danger" onClick={() => setStatus("cancelled", "Hold Released", "Expired hold released — date freed")}>
                    🗑️ Release Hold
                  </button>
                </>
              )}
              {b.status === "conflict" && (
                <button className="btn-warn" onClick={() => setStatus("on_hold", "Conflict Overridden", "Manually overridden — hold created")}>
                  ⚠️ Override Conflict → Hold
                </button>
              )}
            </>
          ) : b.status === "hold_expired" ? (
            <>
              <button className="btn-warn" onClick={() => setStatus("on_hold", "Rebooked", "New 24h hold")}>🔄 Rebook (new hold)</button>
              <button className="btn-danger" onClick={() => setStatus("cancelled", "Hold Deleted")}>🗑️ Delete Hold</button>
            </>
          ) : b.status === "schedule_menu_discussion" ? (
            ds === "scheduled" ? (
              <>
                <button className="btn-success"
                  onClick={async () => {
                    await setStatus("send_menu_form", "Menu Call Started", "Opening menu form");
                    router.push(`/bookings/${b.id}/menu`);
                  }}>
                  📋 Complete Menu Now
                </button>
                <button className="btn-ghost"
                  onClick={() => setPanel(panel === "schedulecall" ? "" : "schedulecall")}>
                  ✏️ Update Recorded Time
                </button>
                <button className="btn-warn" onClick={sendRescheduleRequest}>
                  🔄 Send Reschedule Request
                </button>
              </>
            ) : (
              <>
                <button className="btn-primary" onClick={sendSchedulingEmail}>
                  {ds === "not_sent" ? "📧 Email Scheduling Link" : "📧 Resend Link"}
                </button>
                {b.phone && (
                  <a className="btn-ghost" target="_blank"
                    href={waLink(b.phone, `Hi ${b.contact_name}! 👋 Your event at Event Space by Burger Bar is coming up on ${fmtDate(b.event_date)}. Let's schedule a quick menu call: ${SCHEDULING_LINK}`)}>
                    💬 WhatsApp {ds === "overdue" ? "Follow-Up" : "Link"}
                  </a>
                )}
                <button className="btn-ghost"
                  onClick={() => setPanel(panel === "schedulecall" ? "" : "schedulecall")}>
                  📅 Record Scheduled Call
                </button>
                <button className="btn-ghost"
                  onClick={async () => {
                    setMsg({ ok: true, text: "Checking the calendar…" });
                    try {
                      const res = await fetch("/api/calendar-sync", { method: "POST" });
                      const data = await res.json();
                      if (!data.ok) { setMsg({ ok: false, text: data.detail }); return; }
                      if (data.filled > 0) { load(); setMsg({ ok: true, text: `Found and filled ${data.filled} call time(s) ✓` }); }
                      else setMsg({ ok: true, text: `No matching calendar appointment found yet (scanned ${data.events_scanned}).` });
                    } catch (e) {
                      setMsg({ ok: false, text: `Sync failed: ${(e as Error).message}` });
                    }
                  }}>
                  🔄 Sync from Calendar
                </button>
                <button className="btn-warn"
                  onClick={async () => {
                    await setStatus("send_menu_form",
                      ds === "overdue" ? "Calling Customer Directly" : "Menu Discussion Skipped",
                      "Opening menu form");
                    router.push(`/bookings/${b.id}/menu`);
                  }}>
                  {ds === "overdue" ? "📞 Complete Menu Now" : "⏭️ Skip to Menu"}
                </button>
              </>
            )
          ) : b.status === "send_menu_form" ? (
            <>
              <button className="btn-primary" onClick={() => router.push(`/bookings/${b.id}/menu`)}>
                📋 Fill Out Menu Form
              </button>
              <button className="btn-ghost" onClick={async () => {
                if (!confirm("Skip the menu form and go straight to the estimated invoice? Use this only if you're billing without itemized menu selections.")) return;
                await supabase.from("bookings").update({
                  menu_completed: true,
                  menu_discussion_status: "Completed",
                }).eq("id", b.id);
                setStatus("send_est_invoice", "Menu Skipped", "Proceeding without itemized menu");
              }}>
                ⏭️ Skip Menu &amp; Invoice Directly
              </button>
            </>
          ) : b.status === "menu_completed" || b.status === "send_est_invoice" ? (
            <button className="btn-primary" onClick={async () => {
              if (!fin) return;
              if (!hasMenu(b)) { setMsg({ ok: false, text: "Complete the menu before creating an invoice." }); return; }
              await supabase.from("bookings").update({
                subtotal: fin.subtotal, tax_amount: fin.tax, total_with_tax: fin.total,
                invoice_version: "Estimated",
              }).eq("id", b.id);
              // Go to the invoice to review & email. The workflow advances only
              // when the invoice is actually emailed (which returns you here).
              router.push(`/bookings/${b.id}/invoice`);
            }}>
              📄 Review &amp; Email Estimated Invoice ({fin ? fmtMoney(fin.total) : ""})
            </button>
          ) : b.status === "confirm_guest_count" ? (
            <button className="btn-primary" onClick={() => setPanel(panel === "guestcount" ? "" : "guestcount")}>
              👥 Confirm Guest Count & Menu
            </button>
          ) : b.status === "send_final_invoice" ? (
            <button className="btn-primary" onClick={async () => {
              if (!fin) return;
              await supabase.from("bookings").update({
                subtotal: fin.subtotal, tax_amount: fin.tax, total_with_tax: fin.total,
                invoice_version: "Final",
              }).eq("id", b.id);
              // Review & email the final (pre-event) invoice. Emailing advances to payment.
              router.push(`/bookings/${b.id}/invoice`);
            }}>
              📨 Review &amp; Email Final Invoice ({fin ? fmtMoney(fin.total) : ""})
            </button>
          ) : b.status === "collect_payment" ? (
            <>
              <button className="btn-success" onClick={() => setPanel(panel === "payment" ? "" : "payment")}>💵 Record Payment</button>
              <button className="btn-primary" onClick={() => setStatus("completed", "Event Completed")}>☑️ Mark Complete</button>
            </>
          ) : b.status === "paid_awaiting_event" ? (
            <>
              <span className="font-display font-bold text-amber-700 text-base py-1 pr-2">✅ Paid in full — awaiting event {fmtDate(b.event_date)}</span>
              {eventHasPassed(b) && (
                <button className="btn-primary" onClick={() => setStatus("completed", "Event Completed")}>☑️ Mark Complete</button>
              )}
            </>
          ) : b.status === "completed" ? (
            <span className="font-display font-bold text-emerald-700 text-lg py-1">☑️ Completed</span>
          ) : (
            <span className="font-display font-bold text-slate-500 text-lg py-1">❌ Cancelled</span>
          )}

          {/* Secondary actions — Payment only where a balance payment makes sense
              (after the deposit). At the hold/deposit and menu stages it would be
              redundant with Record Deposit / out of place. */}
          {b.status !== "cancelled" && b.status !== "completed" && (
            <>
              {["confirm_guest_count", "send_final_invoice", "collect_payment", "paid_awaiting_event"].includes(b.status) && (
                <button className="btn-ghost" onClick={() => setPanel(panel === "payment" ? "" : "payment")}>💳 Payment</button>
              )}
              <button className="btn-ghost" onClick={() => setPanel(panel === "charge" ? "" : "charge")}>➕ Add Charge</button>
              <button className="btn-ghost" onClick={() => setPanel(panel === "cancel" ? "" : "cancel")}>❌ Cancel</button>
            </>
          )}
          {(b.status === "completed" || b.status === "paid_awaiting_event") && (
            <button className="btn-warn" onClick={() => setPanel(panel === "amend" ? "" : "amend")}>📝 Add Amendment (extra guests/charges)</button>
          )}
        </div>

        {/* Inline panels */}
        {panel === "deposit" && <DepositForm b={b} done={() => { setPanel(""); load(); setMsg({ ok: true, text: "Deposit recorded ✓" }); }} />}
        {panel === "payment" && fin && <PaymentForm b={b} fin={fin} done={() => { setPanel(""); load(); setMsg({ ok: true, text: "Payment recorded ✓" }); }} />}
        {panel === "charge" && <ChargeForm b={b} isAdjustment={b.status === "completed"} done={async () => {
          if (b.status === "completed") await setStatus("collect_payment", "Invoice Adjusted", "Reopened for payment");
          setPanel(""); load();
        }} />}
        {panel === "guestcount" && <GuestCountForm b={b} done={() => { setPanel(""); load(); }} advance={async () => {
          await setStatus("send_final_invoice", "Guest Count Confirmed");
          // Auto-prompt the final (pre-event) invoice so it can be sent before the party.
          router.push(`/bookings/${b.id}/invoice`);
        }} />}
        {panel === "schedulecall" && <ScheduleCallForm b={b} done={() => { setPanel(""); load(); }} />}
        {panel === "cancel" && <CancelForm b={b} done={() => { setPanel(""); load(); }} />}
        {panel === "amend" && <AmendmentForm b={b} adultPP={b.menu_type === "Double Buffet" ? PRICING.BUFFET_DOUBLE_PP : PRICING.FULL_SERVICE_PP} done={() => { setPanel(""); load(); setMsg({ ok: true, text: "Amendment added — booking reopened for payment ✓" }); }} />}
      </div>

      {/* Menu selections summary */}
      {(() => {
        const m = b.menu as unknown as { template?: string; guests?: { men: number; women: number; children: number }; answers?: Record<string, unknown> };
        if (!m?.answers || Object.keys(m.answers).length === 0) return null;
        const entries = Object.entries(m.answers).filter(([, v]) =>
          (typeof v === "string" && v.trim()) || (Array.isArray(v) && v.length > 0));
        return (
          <div className="card p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-sm">🍽️ Menu selections</h2>
              <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => router.push(`/bookings/${b.id}/menu`)}>
                ✏️ Edit Menu
              </button>
            </div>
            {m.guests && (
              <p className="text-xs text-slate-500 mb-2">
                Guests at menu time: {(m.guests as {adults?: number}).adults ? `${(m.guests as {adults?: number}).adults} adults` : `${m.guests.men} men · ${m.guests.women} women`} · {m.guests.children} children
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {entries.slice(0, 14).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-50 py-1">
                  <span className="text-slate-500 text-xs">{k.replace(/_/g, " ")}</span>
                  <span className="text-right font-medium truncate max-w-[60%]">
                    {Array.isArray(v) ? (v as string[]).join(", ") : String(v)}
                  </span>
                </div>
              ))}
            </div>
            {entries.length > 14 && (
              <p className="text-xs text-slate-400 mt-2">…and {entries.length - 14} more — open the menu form to see everything.</p>
            )}
          </div>
        );
      })()}

      {/* Financial summary */}
      {fin && (
        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-sm">
              💰 Financial summary{" "}
              {fin.estimated && (
                <span className="text-xs font-normal text-amber-600">
                  (estimated — counts from {fin.guests.source === "menu" ? "menu form" : fin.guests.source === "estimate" ? "inquiry estimate" : "nothing yet"})
                </span>
              )}
              {fin.billedToMinimum && (
                <span className="text-xs font-normal text-navy block">
                  💡 Billed at the {fin.minGuests}-guest minimum (actual: {fin.actualHeads})
                </span>
              )}
            </h2>
            <div className="flex gap-2">
              <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => router.push(`/bookings/${b.id}/invoice`)}>
                🧾 View Invoice
              </button>
              <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => router.push(`/bookings/${b.id}/worksheet`)}>
                📋 Staff Worksheet
              </button>
              <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => router.push(`/bookings/${b.id}/menu-card`)}>
                🍽️ Menu Card
              </button>
            </div>
          </div>
          <div className="space-y-1.5 text-sm">
            {(fin.guests.gendered ? fin.guests.men + fin.guests.women : fin.guests.adults) > 0 && (
              <Row label={`${fin.guests.gendered ? `Adults (${fin.guests.men}M/${fin.guests.women}W)` : "Adults"} ${fin.guests.gendered ? fin.guests.men + fin.guests.women : fin.guests.adults} × ${fmtMoney(b.menu_type === "Double Buffet" ? PRICING.BUFFET_DOUBLE_PP : PRICING.FULL_SERVICE_PP)}`}
                value={fmtMoney((fin.guests.gendered ? fin.guests.men + fin.guests.women : fin.guests.adults) * (b.menu_type === "Double Buffet" ? PRICING.BUFFET_DOUBLE_PP : PRICING.FULL_SERVICE_PP))} />
            )}
            {fin.guests.children > 0 && (
              <Row label={`Children ${fin.guests.children} × ${fmtMoney(PRICING.BUFFET_CHILDREN_PP)}`}
                value={fmtMoney(fin.guests.children * PRICING.BUFFET_CHILDREN_PP)} />
            )}
            <Row label="Subtotal" value={fmtMoney(fin.subtotal)} />
            <Row label="Tax (6.625%)" value={fmtMoney(fin.tax)} />
            <Row label="Total" value={fmtMoney(fin.total)} bold />
            <Row label="Payments received" value={`−${fmtMoney(fin.paid)}`} />
            <div className="flex justify-between border-t-2 border-navy pt-2 mt-2">
              <span className="font-display font-bold">Balance</span>
              <span className={`font-display font-bold text-lg ${fin.balance <= 0.01 ? "text-emerald-600" : "text-red-600"}`}>
                {fin.balance <= 0.01 ? "✓ PAID IN FULL" : fmtMoney(fin.balance)}
              </span>
            </div>
          </div>

          {charges.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 mb-2">Line items</h3>
              {charges.map((c) => (
                <div key={c.id} className="flex justify-between text-sm py-1">
                  <span>{c.is_adjustment && <span className="text-amber-600 font-semibold">[ADJ] </span>}{c.description} <span className="text-slate-400">× {c.quantity}</span></span>
                  <span className="flex items-center gap-3">
                    {fmtMoney(c.quantity * c.unit_price)}
                    <button className="text-red-400 hover:text-red-600 text-xs" onClick={async () => {
                      await supabase.from("charges").delete().eq("id", c.id); load();
                    }}>✕</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payment history */}
      <div className="card p-5 mb-5">
        <h2 className="font-display font-bold text-sm mb-3">📋 Payment history</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-400">No payments yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="py-2">Date</th><th>Type</th><th>Method</th>
              <th className="text-right">Received</th><th className="text-right">Applied</th><th></th>
            </tr></thead>
            <tbody>{payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-2">{new Date(p.created_at).toLocaleDateString()}</td>
                <td>{p.payment_type}</td><td>{p.method}{p.check_number ? ` #${p.check_number}` : ""}</td>
                <td className="text-right">{fmtMoney(p.amount_received)}</td>
                <td className="text-right font-medium">{fmtMoney(p.amount_applied)}</td>
                <td className="text-right">
                  {Number(p.amount_applied) >= 0 && (
                    <button className="text-red-400 hover:text-red-600 text-xs font-medium"
                      onClick={async () => {
                        if (!confirm(`Reverse this ${fmtMoney(p.amount_applied)} ${p.method} payment? This records an offsetting reversal entry.`)) return;
                        await supabase.from("payments").insert({
                          booking_id: b.id, payment_type: "Reversal", method: p.method,
                          amount_received: -Number(p.amount_received), amount_applied: -Number(p.amount_applied),
                          cc_fee: -Number(p.cc_fee ?? 0), received_by: "Ben",
                          notes: `Reversal of ${p.payment_type} from ${new Date(p.created_at).toLocaleDateString()}`,
                        });
                        await logActivity(b.id, b.invoice_num, "Payment Reversed", `${fmtMoney(p.amount_applied)} ${p.method} reversed`, "WARNING");
                        load();
                        setMsg({ ok: true, text: "Payment reversed ✓" });
                      }}>
                      ↩ Reverse
                    </button>
                  )}
                  {Number(p.amount_applied) < 0 && <span className="text-[11px] text-slate-400">reversal</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {/* Activity */}
      <div className="card p-5">
        <h2 className="font-display font-bold text-sm mb-3">🕐 Activity</h2>
        <div className="space-y-2">
          {log.map((l) => (
            <div key={l.id} className="flex gap-3 text-xs">
              <span className="text-slate-400 w-32 shrink-0">{new Date(l.created_at).toLocaleString()}</span>
              <span className={`font-semibold w-44 shrink-0 ${l.result === "WARNING" ? "text-amber-600" : l.result === "FAILED" ? "text-red-600" : ""}`}>{l.action}</span>
              <span className="text-slate-600">{l.details}</span>
            </div>
          ))}
        </div>
      </div>

      <button className="text-xs text-slate-400 hover:text-navy mt-6" onClick={() => router.push("/bookings")}>← Back to bookings</button>
    </div>
  );
}

// ─── Small components ───

function Info({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
      {link ? <a href={link} className="font-medium text-navy hover:underline block truncate" title={value}>{value}</a>
        : <div className="font-medium truncate" title={value}>{value}</div>}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className="text-slate-600">{label}</span><span>{value}</span>
    </div>
  );
}

function waLink(phone: string, text: string) {
  let clean = phone.replace(/\D/g, "");
  if (clean.length === 10) clean = "1" + clean;
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
      <h3 className="font-display font-bold text-sm mb-3">{title}</h3>
      {children}
    </div>
  );
}

// ─── Deposit form (duplicate-protected, CC fee aware) ───
function DepositForm({ b, done }: { b: Booking; done: () => void }) {
  const [method, setMethod] = useState("Cash");
  const [amount, setAmount] = useState(String(PRICING.DEPOSIT_AMOUNT));
  const [by, setBy] = useState("Ben");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setAmount(method === "Credit Card" ? String(grossUpForCC(PRICING.DEPOSIT_AMOUNT).total) : String(PRICING.DEPOSIT_AMOUNT));
  }, [method]);

  async function save() {
    setErr("");
    if (b.deposit_date) { setErr("Deposit already recorded for this booking."); return; }
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { setErr("Enter a valid amount."); return; }
    setBusy(true);
    const cc = method === "Credit Card" ? calcCCFee(amt) : { applied: amt, fee: 0 };

    const { error } = await supabase.from("payments").insert({
      booking_id: b.id, payment_type: "Deposit", method,
      amount_received: amt, amount_applied: cc.applied, cc_fee: cc.fee,
      received_by: by, notes: cc.fee > 0 ? `CC fee $${cc.fee.toFixed(2)}` : null,
    });
    if (error) { setErr(error.message); setBusy(false); return; }

    await supabase.from("bookings").update({
      deposit_date: new Date().toISOString(), deposit_amount: cc.applied,
      deposit_method: method, status: "schedule_menu_discussion", hold_expires: null,
    }).eq("id", b.id);

    await logActivity(b.id, b.invoice_num, "Deposit Received",
      `$${amt.toFixed(2)} via ${method} (applied $${cc.applied.toFixed(2)}) by ${by}`);
    await runActionAutomation("deposit_received", b, { deposit_amount: `$${cc.applied.toFixed(2)}` });
    await runActionAutomation("menu_scheduling_invite", b);
    done();
  }

  return (
    <Panel title="💰 Record deposit">
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className="label">Method</label>
          <select className="field" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option>Cash</option><option>Check</option><option>Zelle</option>
            <option>Credit Card</option>
          </select></div>
        <div><label className="label">Amount received</label>
          <input className="field" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label className="label">Received by</label>
          <input className="field" value={by} onChange={(e) => setBy(e.target.value)} /></div>
      </div>
      {method === "Credit Card" && (
        <p className="text-xs text-amber-700 mt-2">
          Includes 3% fee — ${calcCCFee(parseFloat(amount) || 0).applied.toFixed(2)} will be applied to the balance.
        </p>
      )}
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      <button onClick={save} disabled={busy} className="btn-success mt-3 w-full">
        {busy ? "Saving…" : "Confirm Deposit Received"}
      </button>
    </Panel>
  );
}

// ─── Payment form ───
interface FinShape { balance: number; subtotal: number; tax: number; paid: number; total: number; }
function PaymentForm({ b, fin, done }: { b: Booking; fin: FinShape; done: () => void }) {
  const balance = fin.balance;
  const [method, setMethod] = useState("Cash");
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [by, setBy] = useState("Ben");
  const [checkNum, setCheckNum] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preApprover, setPreApprover] = useState<string | null>(null);
  const [showPreWarn, setShowPreWarn] = useState(false);

  useEffect(() => {
    setAmount(method === "Credit Card" ? grossUpForCC(balance).total.toFixed(2) : balance.toFixed(2));
  }, [method, balance]);

  const amt = parseFloat(amount) || 0;
  const cc0 = method === "Credit Card" ? calcCCFee(amt) : { applied: amt, fee: 0 };
  const clearsBalance = cc0.applied >= balance - 0.01;     // this payment pays it off
  const preEvent = !eventHasPassed(b);
  const needsOverride = clearsBalance && preEvent;          // paying in full before the event

  async function save() {
    setErr("");
    if (amt <= 0) { setErr("Enter a valid amount."); return; }
    if (method === "Check" && !checkNum.trim()) { setErr("Enter the check number."); return; }

    // Pre-event full payment: require explicit acknowledgement + approval.
    if (needsOverride && !showPreWarn) { setShowPreWarn(true); return; }
    if (needsOverride && !preApprover) { setErr("Approval is required to accept full payment before the event."); return; }

    setBusy(true);
    const cc = method === "Credit Card" ? calcCCFee(amt) : { applied: amt, fee: 0 };
    const { error } = await supabase.from("payments").insert({
      booking_id: b.id, payment_type: "Additional Payment", method,
      amount_received: amt, amount_applied: cc.applied, cc_fee: cc.fee, received_by: by,
      check_number: method === "Check" ? checkNum.trim() : null,
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    await logActivity(b.id, b.invoice_num, "Payment Recorded",
      `$${amt.toFixed(2)} via ${method}${method === "Check" ? ` #${checkNum.trim()}` : ""} by ${by}`);

    if (needsOverride) {
      await supabase.from("bookings").update({ prepay_override_by: preApprover, status: "paid_awaiting_event" }).eq("id", b.id);
      await logActivity(b.id, b.invoice_num, "Pre-Event Full Payment Approved",
        `Paid in full before the event — approved by ${preApprover}. Booking stays open for post-event amendments.`, "WARNING");
    }

    // Auto-complete ONLY when the event has passed AND the balance is cleared.
    if (clearsBalance && !preEvent) {
      await supabase.from("bookings").update({ status: "completed" }).eq("id", b.id);
      await logActivity(b.id, b.invoice_num, "Event Completed", "Balance cleared after the event — auto-completed.");
    }
    done();
  }

  return (
    <Panel title={`💵 Record payment — balance ${fmtMoney(balance)}`}>
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className="label">Method</label>
          <select className="field" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option>Cash</option><option>Check</option><option>Zelle</option><option>Credit Card</option>
          </select></div>
        <div><label className="label">Amount received</label>
          <input className="field" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label className="label">Received by</label>
          <input className="field" value={by} onChange={(e) => setBy(e.target.value)} /></div>
      </div>
      {method === "Check" && (
        <div className="mt-3">
          <label className="label">Check number</label>
          <input className="field" value={checkNum} onChange={(e) => setCheckNum(e.target.value)} placeholder="e.g. 1042" />
        </div>
      )}
      {method === "Credit Card" && (
        <p className="text-xs text-amber-700 mt-2">
          Customer pays {fmtMoney(grossUpForCC(balance).total)} (incl. {fmtMoney(grossUpForCC(balance).fee)} fee) to clear the balance.
        </p>
      )}

      {/* Pre-event full-payment warning + approval */}
      {showPreWarn && needsOverride && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-300 px-4 py-3">
          <p className="text-sm text-amber-900 font-medium">⚠️ This event hasn&apos;t happened yet.</p>
          <p className="text-sm text-amber-800 mt-1">
            Accepting payment in full now means additional charges (extra guests, day-of additions) may still apply afterward.
            This booking will stay open until after the event so an amendment can be added if needed. Approval required to proceed.
          </p>
          <div className="mt-3">
            <ApprovalField label="Approved by" onChange={setPreApprover} />
          </div>
        </div>
      )}

      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      <button onClick={save} disabled={busy} className="btn-success mt-3 w-full">
        {busy ? "Saving…" : needsOverride && !showPreWarn ? "Continue…" : "Record Payment"}
      </button>
    </Panel>
  );
}

// ─── Charge / adjustment form (unlimited slots) ───
// ─── Amendment: post-event extra guests + extra charges, with PIN approval ───
function AmendmentForm({ b, adultPP, done }: { b: Booking; adultPP: number; done: () => void }) {
  const [extraGuests, setExtraGuests] = useState("");
  const [extraDesc, setExtraDesc] = useState("");
  const [extraAmt, setExtraAmt] = useState("");
  const [reason, setReason] = useState("");
  const [approver, setApprover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const guestCount = parseInt(extraGuests) || 0;
  const guestCharge = guestCount * adultPP;
  const otherCharge = parseFloat(extraAmt) || 0;
  const totalAmend = guestCharge + otherCharge;

  async function save() {
    setErr("");
    if (totalAmend <= 0) { setErr("Add extra guests and/or an extra charge."); return; }
    if (!reason.trim()) { setErr("A reason is required for the amendment."); return; }
    if (!approver) { setErr("Approval is required."); return; }
    setBusy(true);

    const rows: Record<string, unknown>[] = [];
    if (guestCount > 0) rows.push({
      booking_id: b.id, description: `Additional guests (${guestCount} @ ${fmtMoney(adultPP)})`,
      quantity: guestCount, unit_price: adultPP, taxable: true, is_supplemental: true, source: "manual", added_by: approver,
    });
    if (otherCharge !== 0) rows.push({
      booking_id: b.id, description: extraDesc.trim() || "Additional event charge",
      quantity: 1, unit_price: otherCharge, taxable: true, is_supplemental: true, source: "manual", added_by: approver,
    });
    const ins = await supabase.from("charges").insert(rows);
    if (ins.error) { setErr(ins.error.message); setBusy(false); return; }

    const wasCompleted = b.status === "completed";
    const patch: Record<string, unknown> = { status: "collect_payment" };
    if (wasCompleted) patch.reopened_at = new Date().toISOString();
    await supabase.from("bookings").update(patch).eq("id", b.id);

    await logActivity(b.id, b.invoice_num,
      wasCompleted ? "Booking Reopened (Amendment)" : "Amendment Added",
      `${guestCount > 0 ? `+${guestCount} guests ` : ""}${otherCharge ? `+${fmtMoney(otherCharge)} ${extraDesc.trim()} ` : ""}— ${reason.trim()} — approved by ${approver}`,
      "WARNING");
    done();
  }

  return (
    <Panel title="📝 Amendment — additional guests or charges">
      <p className="text-sm text-slate-500 mb-3">
        For extras discovered at or after the event. This adds supplemental charges and {b.status === "completed" ? "reopens the booking" : "updates the balance"} so the difference can be collected. A new (amended) invoice can then be sent.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Additional guests (billed at {fmtMoney(adultPP)}/guest)</label>
          <input className="field" type="number" min="0" value={extraGuests} onChange={(e) => setExtraGuests(e.target.value)} placeholder="0" />
          {guestCount > 0 && <p className="text-xs text-slate-500 mt-1">= {fmtMoney(guestCharge)}</p>}
        </div>
        <div>
          <label className="label">Other extra charge ($)</label>
          <input className="field" type="number" step="0.01" value={extraAmt} onChange={(e) => setExtraAmt(e.target.value)} placeholder="0.00" />
          <input className="field mt-2" value={extraDesc} onChange={(e) => setExtraDesc(e.target.value)} placeholder="Description (e.g. extra soda package)" />
        </div>
      </div>
      <div className="mt-3">
        <label className="label">Reason for amendment <span className="text-red-500">*</span></label>
        <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 8 extra guests arrived; added bar service" />
      </div>
      <div className="mt-3"><ApprovalField label="Approved by" onChange={setApprover} /></div>
      {totalAmend > 0 && (
        <div className="flex justify-between items-center mt-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2">
          <span className="text-sm text-amber-800">Supplemental subtotal (before tax)</span>
          <span className="font-display font-bold text-lg text-amber-900">{fmtMoney(totalAmend)}</span>
        </div>
      )}
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      <button onClick={save} disabled={busy} className="btn-warn mt-3 w-full">{busy ? "Saving…" : "Add Amendment & Reopen for Payment"}</button>
    </Panel>
  );
}

function ChargeForm({ b, isAdjustment, done }: { b: Booking; isAdjustment: boolean; done: () => void }) {
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    if (!desc.trim() || !(parseFloat(price) > 0)) { setErr("Description and price are required."); return; }
    const { error } = await supabase.from("charges").insert({
      booking_id: b.id, description: desc.trim(), quantity: parseInt(qty) || 1,
      unit_price: parseFloat(price), taxable, is_adjustment: isAdjustment, added_by: "Ben",
    });
    if (error) { setErr(error.message); return; }
    await logActivity(b.id, b.invoice_num, isAdjustment ? "Invoice Adjusted" : "Custom Charge Added",
      `${desc} — ${qty} × $${parseFloat(price).toFixed(2)}`);
    done();
  }

  return (
    <Panel title={isAdjustment ? "📝 Post-event adjustment" : "➕ Add custom charge"}>
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2"><label className="label">Description</label>
          <input className="field" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Overtime (2 hours)" /></div>
        <div><label className="label">Qty</label>
          <input className="field" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        <div><label className="label">Unit price ($)</label>
          <input className="field" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm mt-3">
        <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} /> Taxable
      </label>
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      <button onClick={save} className="btn-primary mt-3 w-full">Add {isAdjustment ? "Adjustment" : "Charge"}</button>
    </Panel>
  );
}

// ─── Record / update the customer's booked call time ───
function ScheduleCallForm({ b, done }: { b: Booking; done: () => void }) {
  const [dt, setDt] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr("");
    if (!dt) { setErr("Pick both a date AND a time before saving."); return; }
    setBusy(true);
    const { error } = await supabase.from("bookings").update({
      menu_discussion_date: new Date(dt).toISOString(),
      menu_discussion_status: "Scheduled",
    }).eq("id", b.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await logActivity(b.id, b.invoice_num, "Menu Call Scheduled", new Date(dt).toLocaleString());
    done();
  }

  return (
    <Panel title="✏️ Record / update call time">
      <p className="text-xs text-slate-500 mb-2">
        This records what&apos;s on Google Calendar — it does not change the appointment itself.
        To move the appointment, use &ldquo;Send Reschedule Request&rdquo; and let the customer rebook.
      </p>
      <input className="field" type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} />
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      <button onClick={save} disabled={busy} className="btn-primary mt-3 w-full">
        {busy ? "Saving…" : "Save Call Time"}
      </button>
    </Panel>
  );
}

// ─── Guest count confirmation ───
function GuestCountForm({ b, done, advance }: { b: Booking; done: () => void; advance: () => void }) {
  // Match the mode chosen at menu time: if the menu used non-gendered "adults",
  // confirm with Adults/Children; otherwise Men/Women/Children.
  const menuGuests = (b.menu as unknown as { guests?: { adults?: number } })?.guests;
  const nonGendered = (menuGuests?.adults ?? 0) > 0;

  const [men, setMen] = useState(String(b.confirmed_men ?? ""));
  const [women, setWomen] = useState(String(b.confirmed_women ?? ""));
  const [adults, setAdults] = useState(String((menuGuests?.adults ?? "") || ""));
  const [children, setChildren] = useState(String(b.confirmed_children ?? ""));
  const [approver, setApprover] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [minGuests, setMinGuests] = useState(0);
  const [overrideMin, setOverrideMin] = useState(false);
  const adultHeads = nonGendered ? (parseInt(adults) || 0) : (parseInt(men) || 0) + (parseInt(women) || 0);
  const total = adultHeads + (parseInt(children) || 0);

  useEffect(() => {
    const slug = b.menu_type === "Full Service" ? "full_service"
      : b.menu_type === "Single Buffet" ? "single_buffet"
      : b.menu_type === "Double Buffet" ? "double_buffet" : null;
    if (!slug) return;
    supabase.from("menu_templates").select("config").eq("slug", slug).single()
      .then(({ data }) => setMinGuests((data?.config as { base?: { min_guests?: number } })?.base?.min_guests ?? 0));
  }, [b.menu_type]);

  const belowMin = minGuests > 0 && total > 0 && total < minGuests;

  async function save() {
    setErr("");
    if (total <= 0) { setErr("Enter at least one guest."); return; }
    if (!approver) { setErr("Confirmed by is required."); return; }
    if (belowMin && !overrideMin) {
      setErr(`${total} guests is below the ${minGuests}-guest minimum for ${b.menu_type}. Check the override box to confirm anyway.`);
      return;
    }
    // For non-gendered, store adults in the men slot (both bill adult rate) so
    // confirmed_* stays consistent; the menu's guests.adults preserves display.
    const m = nonGendered ? (parseInt(adults) || 0) : (parseInt(men) || 0);
    const w = nonGendered ? 0 : (parseInt(women) || 0);
    const c = parseInt(children) || 0;
    const by = approver;
    await supabase.from("bookings").update({
      confirmed_men: m, confirmed_women: w, confirmed_children: c,
      guest_count_confirmed_at: new Date().toISOString(), guest_count_confirmed_by: by,
      invoice_version: "Final",
    }).eq("id", b.id);

    const sel = b.menu as unknown as { template?: string; guests?: object; answers?: Record<string, unknown> };
    if (sel?.template && sel?.answers) {
      const updated = { ...sel, guests: nonGendered ? { men: 0, women: 0, children: c, adults: m } : { men: m, women: w, children: c } };
      await supabase.from("bookings").update({ menu: updated }).eq("id", b.id);
      const { data: tpl } = await supabase.from("menu_templates")
        .select("config").eq("slug", sel.template).single();
      if (tpl) {
        const regen = await regenerateMenuCharges(b.id, tpl.config, updated as never);
        if (regen.error) { setErr(`Counts saved, but menu re-pricing failed: ${regen.error}`); return; }
        await logActivity(b.id, b.invoice_num, "Menu Charges Re-priced",
          `${regen.lineCount} line(s) recalculated for confirmed count of ${total}`);
      }
    }

    const desc = nonGendered ? `${total} total (${m} adults / ${c} children)` : `${total} total (${m}M/${w}W/${c}C)`;
    await logActivity(b.id, b.invoice_num, "Guest Count Confirmed", `${desc} by ${by}`);
    if (belowMin && overrideMin) {
      await logActivity(b.id, b.invoice_num, "Guest Minimum Overridden",
        `Confirmed ${total} guests (minimum ${minGuests}) by ${by}`, "WARNING");
    }
    done();
    advance();
  }

  return (
    <Panel title="👥 Confirm final guest count">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className={`grid ${nonGendered ? "grid-cols-2" : "grid-cols-3"} gap-3`}>
          {nonGendered ? (
            <div><label className="label">Adults</label><input className="field" type="number" min="0" value={adults} onChange={(e) => setAdults(e.target.value)} /></div>
          ) : (
            <>
              <div><label className="label">Men</label><input className="field" type="number" min="0" value={men} onChange={(e) => setMen(e.target.value)} /></div>
              <div><label className="label">Women</label><input className="field" type="number" min="0" value={women} onChange={(e) => setWomen(e.target.value)} /></div>
            </>
          )}
          <div><label className="label">Children</label><input className="field" type="number" min="0" value={children} onChange={(e) => setChildren(e.target.value)} /></div>
        </div>
        <ApprovalField label="Confirmed by" onChange={setApprover} />
      </div>
      <div className="flex justify-between items-center mt-3 rounded-lg bg-white border border-slate-200 px-4 py-2">
        <span className="text-sm text-slate-600">Total guests</span>
        <span className="font-display font-bold text-xl text-navy">{total}</span>
      </div>
      {belowMin && (
        <label className="flex items-start gap-2 text-sm mt-3 cursor-pointer rounded-lg bg-red-50 border border-red-300 px-3 py-2.5 text-red-800">
          <input type="checkbox" className="mt-0.5" checked={overrideMin} onChange={(e) => setOverrideMin(e.target.checked)} />
          <span><b>Below the {minGuests}-guest minimum.</b> Override and confirm {total} anyway (logged).</span>
        </label>
      )}
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      <button onClick={save} className="btn-primary mt-3 w-full">✅ Confirm &amp; Move to Final Invoice</button>
    </Panel>
  );
}

// ─── Cancel with refund options ───
function CancelForm({ b, done }: { b: Booking; done: () => void }) {
  const dep = Number(b.deposit_amount ?? 0);
  const [refund, setRefund] = useState<"full" | "credit" | "none">(dep > 0 ? "full" : "none");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    if (dep > 0 && refund === "full") {
      await supabase.from("payments").insert({
        booking_id: b.id, payment_type: "Refund", method: b.deposit_method || "Refund",
        amount_received: -dep, amount_applied: -dep, received_by: "Ben",
        notes: "Full refund on cancellation",
      });
    }
    await supabase.from("bookings").update({ status: "cancelled" }).eq("id", b.id);
    const refundLabel = dep <= 0 ? "No deposit" : refund === "full" ? `Full refund $${dep.toFixed(2)}` : refund === "credit" ? `Credit on file $${dep.toFixed(2)}` : "Deposit forfeited";
    await logActivity(b.id, b.invoice_num, "Booking Cancelled", `${reason || "No reason given"} | ${refundLabel}`, "WARNING");
    await runActionAutomation("cancellation_confirmation", b);
    done();
  }

  return (
    <Panel title="❌ Cancel booking">
      {dep > 0 && (
        <div className="space-y-2 mb-3 text-sm">
          <p className="font-medium">Deposit on file: {fmtMoney(dep)} ({b.deposit_method})</p>
          {(["full", "credit", "none"] as const).map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input type="radio" checked={refund === r} onChange={() => setRefund(r)} />
              {r === "full" ? `Full refund (${fmtMoney(dep)})` : r === "credit" ? "Keep as credit on file" : "No refund (forfeited)"}
            </label>
          ))}
        </div>
      )}
      <input className="field" placeholder="Cancellation reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button onClick={save} disabled={busy} className="btn-danger mt-3 w-full">
        {busy ? "Cancelling…" : "Confirm Cancellation"}
      </button>
    </Panel>
  );
}
