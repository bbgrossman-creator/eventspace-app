"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, logActivity } from "@/lib/supabase";
import AddressAutocomplete, { PlaceValue } from "@/components/AddressAutocomplete";
import OpsWorkspace from "@/components/OpsWorkspace";
import CommunicationCard from "@/components/CommunicationCard";
import TouchpointsCard from "@/components/TouchpointsCard";
import CustomerSnapshot from "@/components/CustomerSnapshot";
import FilesPanel from "@/components/FilesPanel";
import ComponentsCard from "@/components/ComponentsCard";
import DebriefCard from "@/components/DebriefCard";
import ProposalsCard from "@/components/ProposalsCard";
import EventLegacyCard from "@/components/EventLegacyCard";
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
import { loadPolicies, Policies, changeoverMinutes } from "@/lib/policies";
import { billableHours } from "@/lib/billingHours";
import { loadSopNote } from "@/lib/sop";
import { sendEmail } from "@/lib/sendEmail";
import { runActionAutomation } from "@/lib/automation";
import StatusPipeline from "@/components/StatusPipeline";
import { STAGE_TO_STATUS, hasMenu, TIMELINE_MILESTONES, STAGES, findConflicts, HOLD_HOURS } from "@/lib/workflow";

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
  const [railRefresh, setRailRefresh] = useState(0);
  const [overdueHrs, setOverdueHrs] = useState(1);
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
  useEffect(() => { loadPolicies().then((p) => setOverdueHrs(p.menu_call_overdue_hours)); }, []);
  const [roomsMap, setRoomsMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    supabase.from("rooms").select("id,name").then(({ data }) =>
      setRoomsMap(new Map(((data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]))));
  }, []);

  // Genealogy read-side: "Came from: Goldberg Wedding". One tiny lookup,
  // only when the link exists. (Knowledge Architecture §3)
  const [srcEvent, setSrcEvent] = useState<{ id: string; contact_name: string; event_name: string | null; event_type: string | null; event_date: string | null } | null>(null);
  useEffect(() => {
    if (!b?.source_booking_id) { setSrcEvent(null); return; }
    supabase.from("bookings").select("id,contact_name,event_name,event_type,event_date")
      .eq("id", b.source_booking_id).maybeSingle()
      .then(({ data }) => setSrcEvent((data as typeof srcEvent) ?? null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.source_booking_id]);

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

  /** Convert a lead into a real reservation: mint the next invoice number,
   *  start the 24h hold clock, and run the conflict check NOW — the moment a
   *  date is actually being claimed. All history stays (same row). */
  async function convertLead() {
    if (!b) return;
    if (!b.event_date || !b.event_time) {
      setMsg({ ok: false, text: "Set the event date & time first (✏️ Edit Details) — a reservation needs a real date." });
      return;
    }
    const [{ data: all }, pol] = await Promise.all([
      supabase.from("bookings").select("*").neq("status", "cancelled"),
      loadPolicies(),
    ]);
    const clashes = findConflicts((all ?? []) as Booking[], b.event_date, b.event_time, b.id, {
      newHours: (b as { expected_hours?: number | null }).expected_hours ?? pol.service_hours,
      defaultHours: pol.service_hours,
      bufferMin: changeoverMinutes(pol),
    });
    const asConflict = clashes.length > 0;
    if (asConflict) {
      const list = clashes.map((c) => `#${c.invoice_num} ${c.contact_name} at ${fmtTime(c.event_time)}`).join(", ");
      if (!confirm(`This date/time clashes with: ${list}.\n\nConvert anyway as a CONFLICT for review?`)) return;
    }
    const { data: invData, error: invErr } = await supabase.rpc("next_invoice_num");
    if (invErr) { setMsg({ ok: false, text: invErr.message }); return; }
    const newInv = invData as string;
    const oldNum = b.invoice_num;
    const holdExpires = new Date(); holdExpires.setHours(holdExpires.getHours() + HOLD_HOURS);
    const { error } = await supabase.from("bookings").update({
      invoice_num: newInv,
      status: asConflict ? "conflict" : "on_hold",
      hold_expires: holdExpires.toISOString(),
    }).eq("id", b.id);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    await logActivity(b.id, newInv, "Lead Converted to Hold",
      `${oldNum} → #${newInv}. 24-hour hold started${asConflict ? " ⚠️ as CONFLICT (date clash at conversion)" : ""}. Full lead history retained.`,
      asConflict ? "WARNING" : "SUCCESS");
    setMsg({ ok: true, text: `Converted — now #${newInv} ✓` });
    load();
  }

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
  const ds = discussionState(b, overdueHrs);
  const apptFmt = b.menu_discussion_date
    ? new Date(b.menu_discussion_date).toLocaleString("en-US", {
        weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
      })
    : "";

  return (
    <div>
      {/* Header — spans both columns: the booking stays the hero */}
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="page-title">
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

          </div>
        </div>
        <div className="gold-rule mt-3" />
      </header>

    <div className="xl:flex xl:gap-6 xl:items-start">
    <div className="flex-1 min-w-0 max-w-[1100px]">


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
        {b.celebrant_name && (
          <Info label="Celebrating" value={`🎉 ${b.celebrant_name}${b.celebrant_relation ? ` (${b.celebrant_relation.toLowerCase()}${b.celebrant_age != null ? `, ${b.celebrant_age}` : ""})` : b.celebrant_age != null ? ` (${b.celebrant_age})` : ""}`} />
        )}
        {b.affiliation && <Info label="Community" value={`🕍 ${b.affiliation}`} />}
        {srcEvent && (
          <Info label="Came From"
            value={`🎊 ${srcEvent.contact_name}${srcEvent.event_type ? ` ${srcEvent.event_type}` : ""}${b.source_note ? ` — “${b.source_note}”` : ""}`}
            link={`/bookings/${srcEvent.id}`} />
        )}
        {(b.location_type === "off_prem" || (b.room_id && roomsMap.size > 1)) && (
          b.location_type === "off_prem" ? (
            <Info label="Location" value={`📍 ${b.offprem_address ?? "Off-premise"}`}
              link={(b as { offprem_place_id?: string }).offprem_place_id
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.offprem_address ?? "")}&query_place_id=${(b as { offprem_place_id?: string }).offprem_place_id}`
                : b.offprem_address ? `https://maps.google.com/?q=${encodeURIComponent(b.offprem_address)}` : undefined} />
          ) : (
            <Info label="Location" value={`🏛️ ${roomsMap.get(b.room_id!) ?? "—"}`} />
          )
        )}
        {b.contact2_name && (
          <>
            <Info label="2nd Contact" value={b.contact2_name} />
            <Info label="2nd Phone" value={b.contact2_phone || "—"} link={b.contact2_phone ? `tel:${b.contact2_phone}` : undefined} />
            <Info label="2nd Email" value={b.contact2_email || "—"} link={b.contact2_email ? `mailto:${b.contact2_email}` : undefined} />
          </>
        )}
      </div>

      {/* Customer intelligence now lives pinned at the top of the right rail
          (see aside below) — persistent context while working, without
          consuming the main column's vertical space. */}

      {/* Pipeline + current status */}
      {stage.stageIndex >= 0 && (
        <div className="card p-5 pb-6 mb-5">
          <StatusPipeline currentStage={stage.stageIndex} onStageClick={(i) => {
            const target = STAGE_TO_STATUS[i];
            if (target === b.status) return;
            // Guard: can't jump to invoice/count steps without a completed menu
            const needsMenu = ["send_est_invoice", "confirm_guest_count", "send_final_invoice", "collect_payment", "completed"];
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
        </div>
      )}
      <div className="rounded-2xl px-5 py-4 mb-5 flex items-center justify-between"
        style={{ background: stage.color, color: stage.textColor }}>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider opacity-70">Current status</div>
          <div className="font-display font-bold text-lg">
            {b.status === "schedule_menu_discussion"
              ? (discussionState(b, overdueHrs) === "menu_in"
                  ? "📋 Menu Received — Review & Complete"
                  : discussionState(b, overdueHrs) === "overdue"
                  ? "⚠️ Menu Call Missed — Follow Up"
                  : discussionState(b, overdueHrs) === "scheduled"
                    ? "📞 Booked — Menu Call Scheduled"
                    : `${stage.icon} ${stage.label}`)
              : `${stage.icon} ${stage.label}`}
          </div>
        </div>
        {b.status === "on_hold" && b.hold_expires && (
          <div className="text-xs font-semibold text-right">
            {holdExpired
              ? <span className="text-red-600">⏰ EXPIRED {new Date(b.hold_expires).toLocaleString()}</span>
              : <><div><HoldCountdown expires={b.hold_expires} /></div>
                  <div className="opacity-70 font-normal">expires {new Date(b.hold_expires).toLocaleString()}</div></>}
          </div>
        )}
      </div>

      {/* SOP / playbook note for the current stage (editable in back office) */}
      <SopNote statusKey={holdExpired ? "hold_expired" : b.status} />

      {/* Optional touchpoints: walkthrough / tasting / contract / follow-up.
          Hidden until the rep adds one — never a pipeline stage. */}
      <TouchpointsPanel b={b} onChange={load} onConvert={convertLead}
        onMarkLost={() => {
          if (confirm("Mark this lead as lost? You can reopen it later.")) {
            setStatus("lead_lost", "Lead Marked Lost", "Opportunity closed — did not convert.");
          }
        }} />

      {msg && (
        <div className={`rounded-lg px-4 py-3 mb-5 text-sm font-semibold border ${msg.ok ? "status-success" : "status-conflict"}`}>
          {msg.text}
        </div>
      )}

      {/* Conflict context: show what this booking conflicts with */}
      {b.status === "conflict" && <ConflictPanel b={b} onChange={load} />}

      {/* First-right-of-refusal: this booking holds a date someone else wants */}
      {b.refusal_challenger && <RefusalPanel b={b} onChange={load} setMsg={setMsg} />}

      {/* ─── Action buttons by status ─── */}
      <div className="card p-5 mb-5">
        {/* Menu discussion sub-state banners */}
        {b.status === "schedule_menu_discussion" && ds === "link_sent" && (
          <div className="rounded-lg status-warning border px-4 py-3 mb-3 text-sm">
            <b>📧 Scheduling link sent</b>{" "}
            {new Date(b.menu_discussion_sent_at!).toLocaleDateString()} — waiting for customer to pick a time
          </div>
        )}
        {b.status === "schedule_menu_discussion" && ds === "scheduled" && (
          <div className="rounded-lg status-success border px-4 py-3 mb-3 text-sm">
            <b>📞 Call scheduled:</b> {apptFmt}
          </div>
        )}
        {b.status === "schedule_menu_discussion" && ds === "overdue" && (
          <div className="rounded-lg status-conflict border px-4 py-3 mb-3 text-sm">
            <b>⚠️ Scheduled call missed</b> — was {apptFmt}, menu not completed. Follow up with {b.contact_name}.
          </div>
        )}

        {b.deposit_ready && (b.status === "on_hold" || b.status === "conflict") && (
          <div className="rounded-lg status-success border px-4 py-2.5 mb-3 text-sm">
            💳 <b>Ready to collect</b> — this party committed with a card on file
            {b.card_last4 ? <> (•••• {b.card_last4})</> : ""}. Collect the deposit to confirm.
          </div>
        )}

        <div className="flex flex-wrap gap-2.5">
          {b.status === "on_hold" || b.status === "conflict" ? (
            <>
              <button className="btn-success" onClick={() => setPanel(panel === "deposit" ? "" : "deposit")}>
                {b.deposit_ready ? "💳 Charge Deposit (card on file)" : `💰 Record Deposit${holdExpired ? " (rebooks the date)" : ""}`}
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
                  🕐 Move Call Time
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
                  📅 Schedule Call Manually
                </button>
                <button className="btn-tertiary"
                  onClick={async () => {
                    setMsg({ ok: true, text: "Checking the calendar…" });
                    try {
                      const res = await fetch("/api/calendar-sync", { method: "POST" });
                      const data = await res.json();
                      if (!data.ok) { setMsg({ ok: false, text: data.detail }); return; }
                      if (data.filled > 0) {
                        load();
                        const flags = (data.ambiguous ?? 0) + (data.low_confidence ?? 0);
                        const ambNote = flags > 0 ? ` — ⚠️ ${flags} other event${flags === 1 ? "" : "s"} needs manual review (check Activity).` : "";
                        setMsg({ ok: true, text: `Found and filled ${data.filled} call time(s) ✓${ambNote}` });
                      } else if ((data.ambiguous ?? 0) + (data.low_confidence ?? 0) > 0) {
                        const flags = (data.ambiguous ?? 0) + (data.low_confidence ?? 0);
                        setMsg({ ok: false, text: `⚠️ ${flags} calendar event(s) couldn't be confidently matched — needs manual review (check Activity). Nothing was auto-filled for ${flags === 1 ? "it" : "them"}.` });
                      } else setMsg({ ok: true, text: `No matching calendar appointment found yet (scanned ${data.events_scanned}).` });
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
                  {ds === "menu_in" ? "📋 Process Received Menu" : ds === "overdue" ? "📞 Complete Menu Now" : "⏭️ Skip to Menu"}
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
          ) : b.status === "waitlisted" ? (
            <span className="font-display font-bold text-amber-700 text-base py-1">⏳ Waitlisted — awaiting the holder&apos;s decision on this date</span>
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
          {b.status === "lead" && (
            <>
              <button className="btn-primary" onClick={convertLead}>⏳ Convert to 24-Hour Hold</button>
              <button className="btn-ghost" onClick={() => {
                if (confirm("Mark this lead as lost? You can reopen it later.")) {
                  setStatus("lead_lost", "Lead Marked Lost", "Opportunity closed — did not convert.");
                }
              }}>🚫 Mark Lost</button>
            </>
          )}
          {b.status === "lead_lost" && (
            <button className="btn-ghost" onClick={() => setStatus("lead", "Lead Reopened", "Back to active prospects.")}>🌱 Reopen Lead</button>
          )}
          {b.status !== "cancelled" && (
            <button className="btn-tertiary" onClick={() => setPanel(panel === "edit" ? "" : "edit")}>✏️ Edit Details</button>
          )}
        </div>

        {/* Inline panels */}
        {panel === "edit" && <EditDetailsForm b={b} done={() => { setPanel(""); load(); }} />}
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

      {/* Event hours & overtime — only at the late stages where event timing
          actually matters (final invoice onward), not during scheduling/menu. */}
      {["send_final_invoice", "collect_payment", "paid_awaiting_event", "completed"].includes(b.status) && (
        <EventHoursPanel b={b} onChange={load} />
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

                        // Decide how the reversal affects the workflow stage.
                        const { data: pays } = await supabase.from("payments")
                          .select("amount_applied,payment_type").eq("booking_id", b.id);
                        const totalApplied = (pays ?? []).reduce((s, x) => s + Number(x.amount_applied), 0);
                        const wasDeposit = p.payment_type === "Deposit";

                        if (wasDeposit && totalApplied <= 0.01 && b.status !== "on_hold") {
                          // Deposit fully reversed → back to awaiting deposit.
                          const holdExpires = new Date(); holdExpires.setHours(holdExpires.getHours() + 24);
                          await supabase.from("bookings").update({
                            status: "on_hold", deposit_date: null, deposit_method: null,
                            hold_expires: holdExpires.toISOString(),
                          }).eq("id", b.id);
                          await logActivity(b.id, b.invoice_num, "Reverted to Deposit Stage",
                            "Deposit reversed — booking returned to awaiting deposit.", "WARNING");
                        } else if (!wasDeposit && (b.status === "completed" || b.status === "paid_awaiting_event")) {
                          // A balance/final payment was reversed on a closed booking →
                          // reopen it so the now-outstanding balance can be re-collected.
                          await supabase.from("bookings").update({ status: "collect_payment" }).eq("id", b.id);
                          await logActivity(b.id, b.invoice_num, "Reopened (Payment Reversed)",
                            `${fmtMoney(p.amount_applied)} payment reversed — booking reopened to collect the balance.`, "WARNING");
                        }
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

      {/* Everything attached to the event */}
      {/* Debrief — core (knowledge_capture); renders only once the event
          is completed. Event Components — renders only when the operating
          model unlocks it (caps.components_editor). */}
      <DebriefCard b={b} />
      <ProposalsCard b={b} />
      <ComponentsCard b={b} />
      <FilesPanel b={b} />

      {/* Activity — the audit trail: facts the system recorded. The work
          narrative lives in the Operations rail (Progress). */}
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

    {/* ── Right rail: Customer Snapshot is the first card — foundational
        context, not a floating overlay. It does NOT stick; the entire rail
        scrolls together as one column. Top of the snapshot aligns with the
        top of the Contact strip (both are top-aligned flex children of the
        same row, no extra offset here). ── */}
    <aside className="xl:w-[28%] xl:max-w-[480px] xl:shrink-0 mt-8 xl:mt-0">
      <div className="space-y-3">
        <CustomerSnapshot b={b} />
        <EventLegacyCard b={b} />
        <CommunicationCard b={b} />
        <TouchpointsCard b={b} />
        <OpsWorkspace b={b} refreshKey={railRefresh} />
      </div>
    </aside>
    </div>
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
function useStaffNames(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    supabase.from("staff").select("name").eq("active", true).order("sort_order")
      .then(({ data }) => setNames((data ?? []).map((s: { name: string }) => s.name)));
  }, []);
  return names;
}

function DepositForm({ b, done }: { b: Booking; done: () => void }) {
  const [method, setMethod] = useState("Cash");
  const [amount, setAmount] = useState(String(PRICING.DEPOSIT_AMOUNT));
  const [by, setBy] = useState("");
  const staffNames = useStaffNames();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setAmount(method === "Credit Card" ? String(grossUpForCC(PRICING.DEPOSIT_AMOUNT).total) : String(PRICING.DEPOSIT_AMOUNT));
  }, [method]);

  async function save() {
    setErr("");
    // Block only if there's an ACTIVE deposit (net positive). A reversed deposit
    // nets to zero and should allow recording a fresh one.
    const { data: deps } = await supabase.from("payments")
      .select("amount_applied,payment_type").eq("booking_id", b.id)
      .eq("payment_type", "Deposit");
    const { data: revs } = await supabase.from("payments")
      .select("amount_applied,payment_type").eq("booking_id", b.id)
      .eq("payment_type", "Reversal");
    const depTotal = (deps ?? []).reduce((s, x) => s + Number(x.amount_applied), 0);
    const revTotal = (revs ?? []).reduce((s, x) => s + Number(x.amount_applied), 0);
    if (depTotal + revTotal > 0.01) { setErr("An active deposit is already recorded for this booking."); return; }
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
      refusal_deadline: null, refusal_challenger: null,
    }).eq("id", b.id);

    // Depositing IS the holder committing: any parties waiting on this date
    // (deposit-ready challenger or no-standing leads) are declined, so nothing
    // sits "awaiting holder decision" on a date that's now confirmed.
    const { data: waiting } = await supabase.from("bookings")
      .select("id,invoice_num,contact_name").eq("waitlisted_for", b.id).eq("status", "waitlisted");
    for (const w of waiting ?? []) {
      await supabase.from("bookings").update({ status: "cancelled", waitlisted_for: null }).eq("id", w.id);
      await logActivity(w.id, w.invoice_num, "Waitlist Declined",
        `${b.contact_name} confirmed the date with a deposit — waitlist released. Follow up to offer another date.`, "WARNING");
    }

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
          <select className="field" value={by} onChange={(e) => setBy(e.target.value)}>
            <option value="">Select…</option>
            {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select></div>
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
  const paymentStaff = useStaffNames();
  const balance = fin.balance;
  const [method, setMethod] = useState("Cash");
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [by, setBy] = useState("");
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
          <select className="field" value={by} onChange={(e) => setBy(e.target.value)}>
            <option value="">Select…</option>
            {paymentStaff.map((n) => <option key={n} value={n}>{n}</option>)}
          </select></div>
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

// ─── Live countdown to hold expiry (ticks every second) ───
function HoldCountdown({ expires }: { expires: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(expires).getTime() - now;
  if (ms <= 0) return <span className="text-red-600">⏰ Expired</span>;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const urgent = ms < 2 * 3600000; // under 2h
  return (
    <span className={urgent ? "text-red-600" : ""}>
      ⏳ {h}h {String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s left
    </span>
  );
}

// ─── Conflict context — shows the rep what this booking conflicts with ───
function ConflictPanel({ b, onChange }: { b: Booking; onChange: () => void }) {
  const [others, setOthers] = useState<Booking[]>([]);
  const [pol, setPol] = useState<Policies | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!b.event_date) return;
    supabase.from("bookings").select("*")
      .eq("event_date", b.event_date)
      .neq("id", b.id)
      .neq("status", "cancelled")
      .then(({ data }) => setOthers((data ?? []) as Booking[]));
    loadPolicies().then(setPol);
  }, [b.event_date, b.id]);

  if (others.length === 0) return null;
  const anyBooked = others.some((o) => !["on_hold", "conflict", "waitlisted", "hold_expired"].includes(o.status));
  // The holder eligible for first-right-of-refusal: an UNCONFIRMED hold.
  const eligibleHolder = others.find((o) => o.status === "on_hold" || o.status === "conflict");
  const canStartRefusal = pol?.conflict_mode === "first_refusal" && !!eligibleHolder && !anyBooked;

  // Adapt this existing conflict to first-refusal on demand: make THIS booking the
  // waitlisted challenger and start the holder's decision clock. Mirrors creation-time setup.
  async function startRefusal() {
    if (!eligibleHolder || !pol) return;
    if (!confirm(`Start first-right-of-refusal? ${eligibleHolder.contact_name} will have ${pol.refusal_deadline_hours} hours to commit, then ${pol.refusal_lapse_action === "auto_release" ? "the date auto-releases to this party" : "you'll be prompted to decide"}.`)) return;
    setBusy(true);
    const deadline = new Date(); deadline.setHours(deadline.getHours() + pol.refusal_deadline_hours);
    // This booking becomes the waitlisted challenger.
    const r1 = await supabase.from("bookings").update({ status: "waitlisted", waitlisted_for: eligibleHolder.id }).eq("id", b.id);
    // The holder gets the decision clock + a link back to this challenger.
    const r2 = await supabase.from("bookings").update({
      refusal_deadline: deadline.toISOString(), refusal_challenger: b.id,
    }).eq("id", eligibleHolder.id);
    if (r1.error || r2.error) {
      setBusy(false);
      alert(`Could not start first-right-of-refusal: ${(r1.error || r2.error)?.message}\n\nThis usually means the refusal columns are missing — run first_refusal.sql in Supabase.`);
      return;
    }
    await logActivity(eligibleHolder.id, eligibleHolder.invoice_num, "First Right of Refusal Started",
      `${b.contact_name} wants this date. Holder has until ${deadline.toLocaleString()} to commit.`, "WARNING");
    await logActivity(b.id, b.invoice_num, "Waitlisted (First Refusal)",
      `Now waiting on ${eligibleHolder.contact_name}'s decision.`, "WARNING");
    // Take the rep to the holder's page to act.
    window.location.assign(`/bookings/${eligibleHolder.id}`);
  }

  return (
    <div className="card p-5 mb-5 status-conflict" style={{ borderWidth: 1, borderStyle: "solid" }}>
      <h2 className="font-display font-bold text-sm mb-1">⚠️ Conflict — same date</h2>
      <p className="text-xs mb-3" style={{ color: "var(--ec-text-secondary)" }}>
        {anyBooked
          ? "This date is held by a CONFIRMED booking — the date is taken. Inform this customer or offer an alternative."
          : "This date is held by another unconfirmed party. Per your policy, first right of refusal may apply."}
      </p>
      <div className="space-y-1.5">
        {others.map((o) => {
          const booked = !["on_hold", "conflict", "waitlisted", "hold_expired"].includes(o.status);
          return (
            <div key={o.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm">
                <b>#{o.invoice_num}</b> {o.contact_name} · {fmtTime(o.event_time)} ·{" "}
                <span className={booked ? "text-red-700 font-semibold" : "text-amber-700"}>
                  {booked ? "CONFIRMED BOOKING" : "hold (unconfirmed)"}
                </span>
              </span>
              <button className="text-xs text-navy underline" onClick={() => window.location.assign(`/bookings/${o.id}`)}>view →</button>
            </div>
          );
        })}
      </div>
      {canStartRefusal && (
        <button className="btn-primary mt-3 w-full" disabled={busy} onClick={startRefusal}>
          ▶️ Start First-Right-of-Refusal with {eligibleHolder!.contact_name}
        </button>
      )}
      <p className="text-xs text-slate-400 mt-3">
        {canStartRefusal
          ? "Your policy is first-right-of-refusal: start the holder's decision clock above, or use the manual options below."
          : "Use the SOP note above for how to handle this. To proceed anyway (e.g. a shorter event that fits), use \u201cOverride Conflict \u2192 Hold\u201d below."}
      </p>
    </div>
  );
}

// ─── SOP note for the current stage (collapsible; editable in back office) ───
const TP_META: Record<string, { icon: string; label: string }> = {
  walkthrough: { icon: "🚶", label: "Walkthrough" },
  tasting: { icon: "🍽️", label: "Tasting" },
  contract: { icon: "✍️", label: "Contract Signing" },
  followup: { icon: "☎️", label: "Follow-Up" },
};

interface Touchpoint {
  id: string; kind: string; scheduled_at: string | null;
  status: string; notes: string | null;
}

/** Optional, booking-tied appointments (walkthrough / tasting / contract /
 *  follow-up). Hidden until added; completing a tasting offers to finalize
 *  the menu, since a tasting is usually the menu's finalizer when it happens. */
function TouchpointsPanel({ b, onChange, onConvert, onMarkLost }: {
  b: Booking; onChange: () => void;
  onConvert?: () => void; onMarkLost?: () => void;
}) {
  const [items, setItems] = useState<Touchpoint[]>([]);
  const [leadNext, setLeadNext] = useState(false);

  const loadTp = useCallback(async () => {
    const { data } = await supabase.from("touchpoints").select("*")
      .eq("booking_id", b.id).order("scheduled_at", { ascending: true });
    setItems((data ?? []) as Touchpoint[]);
  }, [b.id]);
  useEffect(() => { loadTp(); }, [loadTp]);

  async function complete(t: Touchpoint) {
    await supabase.from("touchpoints").update({ status: "completed" }).eq("id", t.id);
    await logActivity(b.id, b.invoice_num, `${TP_META[t.kind]?.label ?? t.kind} Completed`, t.notes ?? "");
    if (t.kind === "walkthrough" && b.status === "lead") setLeadNext(true);
    if (t.kind === "tasting" && !hasMenu(b) &&
        confirm("Tasting completed — also mark the menu as finalized?")) {
      await supabase.from("bookings").update({ menu_completed: true }).eq("id", b.id);
      await logActivity(b.id, b.invoice_num, "Menu Finalized at Tasting",
        "Menu locked in at the tasting.");
      onChange();
    }
    loadTp();
  }

  async function remove(t: Touchpoint) {
    if (!confirm(`Remove this ${TP_META[t.kind]?.label.toLowerCase() ?? "touchpoint"}?`)) return;
    await supabase.from("touchpoints").delete().eq("id", t.id);
    loadTp();
  }

  if (items.length === 0) return null;

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display font-bold text-sm">📌 Touchpoints</h3>
      </div>

      {leadNext && (
        <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 p-3 mb-3">
          <p className="text-xs font-semibold text-emerald-800 mb-2">✅ Walkthrough done — what's next for this lead?</p>
          <div className="flex gap-1.5 flex-wrap">
            {onConvert && (
              <button className="btn-primary !py-1 !px-3 !text-[11px]" onClick={() => { setLeadNext(false); onConvert(); }}>⏳ Create 24-Hour Hold</button>
            )}
            {onMarkLost && (
              <button className="text-[11px] font-semibold rounded-lg border border-red-200 text-red-600 px-3 py-1 hover:bg-red-50"
                onClick={() => { setLeadNext(false); onMarkLost(); }}>🚫 Mark Lost</button>
            )}
            <button className="text-[11px] text-slate-500 underline px-2" onClick={() => setLeadNext(false)}>Leave as prospect</button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">To schedule a follow-up or another walkthrough, use ＋ Log Communication in the right rail.</p>
        </div>
      )}
      {items.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-50 last:border-0 text-sm flex-wrap">
          <span className={t.status === "completed" ? "line-through text-slate-400" : ""}>
            {TP_META[t.kind]?.icon} <b>{TP_META[t.kind]?.label ?? t.kind}</b>
            {t.scheduled_at ? ` — ${fmtDate(String(t.scheduled_at).slice(0, 10))} ${fmtTime(String(t.scheduled_at).slice(11, 16))}` : " — no time set"}
            {(t as { assignee?: string | null }).assignee ? <span className="text-slate-500"> · 👤 {(t as { assignee?: string | null }).assignee}</span> : ""}
            {t.notes ? <span className="text-slate-500"> · {t.notes}</span> : ""}
          </span>
          <span className="flex gap-2 text-xs">
            {t.status !== "completed" && (
              <button className="text-emerald-700 underline" onClick={() => complete(t)}>✓ Complete</button>
            )}
            <button className="text-slate-400 underline" onClick={() => remove(t)}>remove</button>
          </span>
        </div>
      ))}
    </div>
  );
}

function SopNote({ statusKey }: { statusKey: string }) {
  const [body, setBody] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { loadSopNote(statusKey).then(setBody); }, [statusKey]);
  if (!body) return null;
  if (!open) {
    return (
      <p className="mb-5">
        <button className="inline-flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-navy/5 border border-navy/15 rounded-full px-3 py-1 transition-colors" onClick={() => setOpen(true)}>＋ Show guidance</button>
      </p>
    );
  }
  return (
    <div className="rounded-xl ring-1 ring-slate-900/[0.05] bg-slate-50 mb-5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-700">📋 What to do here</span>
        <button className="inline-flex items-center gap-1 text-xs font-semibold text-navy bg-white hover:bg-navy/5 border border-navy/15 rounded-full px-3 py-1 transition-colors" onClick={() => setOpen(false)}>− Hide guidance</button>
      </div>
      <p className="px-4 pb-3 text-sm text-slate-600 whitespace-pre-line">{body}</p>
    </div>
  );
}

// ─── First Right of Refusal panel (shown on the HOLDER's booking) ───
function RefusalPanel({ b, onChange, setMsg }: {
  b: Booking; onChange: () => void; setMsg: (m: { ok: boolean; text: string }) => void;
}) {
  const [challenger, setChallenger] = useState<Booking | null>(null);
  useEffect(() => {
    if (!b.refusal_challenger) return;
    supabase.from("bookings").select("*").eq("id", b.refusal_challenger).maybeSingle()
      .then(({ data }) => setChallenger((data as Booking) ?? null));
  }, [b.refusal_challenger]);

  const deadline = b.refusal_deadline ? new Date(b.refusal_deadline) : null;
  const passed = deadline ? Date.now() > deadline.getTime() : false;

  // Holder commits: clear the challenge; ALL parties waiting on this date
  // (the challenger and any no-standing leads) are declined.
  async function holderCommits() {
    if (!confirm("Confirm the holder is committing to this date? The waitlisted party will be declined.")) return;
    await supabase.from("bookings").update({ refusal_deadline: null, refusal_challenger: null }).eq("id", b.id);
    const { data: waiting } = await supabase.from("bookings")
      .select("id,invoice_num").eq("waitlisted_for", b.id).eq("status", "waitlisted");
    for (const w of waiting ?? []) {
      await supabase.from("bookings").update({ status: "cancelled", waitlisted_for: null }).eq("id", w.id);
      await logActivity(w.id, w.invoice_num, "Waitlist Declined",
        `Date holder (${b.contact_name}) committed — waitlist released.`, "WARNING");
    }
    await logActivity(b.id, b.invoice_num, "Holder Committed (First Refusal)",
      "Holder is keeping the date. Proceed to collect deposit.");
    setMsg({ ok: true, text: "Holder committed — collect their deposit to confirm." });
    onChange();
  }

  // Holder passes: release this hold; promote the challenger to on_hold.
  async function holderPasses() {
    if (!confirm("Holder is releasing this date? It will pass to the waitlisted party.")) return;
    await supabase.from("bookings").update({
      status: "cancelled", refusal_deadline: null, refusal_challenger: null,
    }).eq("id", b.id);
    if (challenger) {
      const holdExpires = new Date(); holdExpires.setHours(holdExpires.getHours() + 24);
      await supabase.from("bookings").update({
        status: "on_hold", waitlisted_for: null, hold_expires: holdExpires.toISOString(),
      }).eq("id", challenger.id);
      const readyNote = challenger.deposit_ready
        ? ` Ready to commit — card ${challenger.card_last4 ? `•••• ${challenger.card_last4}` : "on file"}; collect the deposit.`
        : "";
      await logActivity(challenger.id, challenger.invoice_num, "Promoted from Waitlist",
        `Date released by ${b.contact_name} — now holding (24h).${readyNote}`);
      await runActionAutomation("hold_confirmation", { ...challenger, status: "on_hold", hold_expires: holdExpires.toISOString() } as Booking);
    }
    await logActivity(b.id, b.invoice_num, "Holder Passed (First Refusal)",
      `Holder released the date${challenger ? ` to ${challenger.contact_name}` : ""}.`, "WARNING");
    setMsg({ ok: true, text: "Date released and passed to the waitlisted party." });
    onChange();
  }

  return (
    <div className={`card p-5 mb-5 border-2 ${passed ? "border-red-300" : "border-amber-300"}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="font-display font-bold text-sm">📞 First Right of Refusal</h2>
          <p className="text-sm text-slate-600 mt-1">
            <b>{challenger?.contact_name ?? "Another party"}</b> wants this date.
            {challenger?.phone && <> Call them: <a href={`tel:${challenger.phone}`} className="text-navy underline">{challenger.phone}</a>.</>}
          </p>
          {challenger?.deposit_ready && (
            <p className="text-xs text-emerald-700 mt-1 font-medium">
              ✅ Ready to commit — card secured{challenger.card_last4 ? ` (•••• ${challenger.card_last4})` : ""}.
            </p>
          )}
        </div>
        <div className={`text-xs font-bold px-3 py-1 rounded-full ${passed ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
          {passed ? "⏰ Deadline passed" : deadline ? `Decide by ${deadline.toLocaleString()}` : ""}
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        The holder has first right of refusal. Contact {b.contact_name} — if they commit with a deposit, they keep the date; if they pass, it goes to {challenger?.contact_name ?? "the next party"}.
      </p>
      <div className="flex flex-wrap gap-2.5">
        <button className="btn-success" onClick={holderCommits}>✅ Holder is committing</button>
        <button className="btn-warn" onClick={holderPasses}>↩️ Holder passes — release date</button>
        {challenger && (
          <button className="btn-ghost" onClick={() => window.location.assign(`/bookings/${challenger.id}`)}>
            View {challenger.contact_name}&apos;s booking →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Event hours & overtime — billable time per the Policies settings ───
function EventHoursPanel({ b, onChange }: { b: Booking; onChange: () => void }) {
  const [policies, setPolicies] = useState<Policies | null>(null);
  // Default the actual start to the SCHEDULED start — it's on display from the
  // outset, and the rep only touches it when reality differed from the plan.
  const [start, setStart] = useState((b as { actual_start?: string }).actual_start ?? b.event_time ?? "");
  const [end, setEnd] = useState((b as { actual_end?: string }).actual_end ?? "");
  const [override, setOverride] = useState(
    (b as { hours_override?: number | null }).hours_override != null
      ? String((b as { hours_override?: number | null }).hours_override) : "");
  const [msg, setMsg] = useState("");

  useEffect(() => { loadPolicies().then(setPolicies); }, []);
  if (!policies) return null;

  // Compute against the CURRENT field values (live preview before saving).
  const preview = billableHours({
    ...b,
    actual_start: start || null, actual_end: end || null,
    hours_override: override ? Number(override) : null,
  } as Booking, policies);

  async function save() {
    await supabase.from("bookings").update({
      actual_start: start || null,
      actual_end: end || null,
      hours_override: override ? Number(override) : null,
    }).eq("id", b.id);
    setMsg("Saved ✓");
    setTimeout(() => setMsg(""), 1500);
    onChange();
  }

  async function resetTimes() {
    if (!confirm("Reset to default? Start returns to the scheduled time; end and override are cleared.")) return;
    setStart(b.event_time ?? ""); setEnd(""); setOverride("");
    await supabase.from("bookings").update({
      actual_start: null, actual_end: null, hours_override: null,
    }).eq("id", b.id);
    setMsg("Reset to default ✓");
    setTimeout(() => setMsg(""), 1500);
    onChange();
  }

  async function addOvertime() {
    if (preview.overtimeAmount <= 0) return;
    if (!confirm(`Add ${fmtMoney(preview.overtimeAmount)} overtime charge (${preview.overtimeUnits} × ${fmtMoney(policies!.overtime_rate)})?`)) return;
    await supabase.from("charges").insert({
      booking_id: b.id,
      description: `Overtime — ${preview.overtimeHours} hr beyond ${policies!.default_event_hours} hr (${preview.overtimeUnits} × ${policies!.overtime_increment_min} min)`,
      quantity: 1, unit_price: preview.overtimeAmount, taxable: true, source: "manual",
    });
    await logActivity(b.id, b.invoice_num, "Overtime Charge Added",
      `${fmtMoney(preview.overtimeAmount)} for ${preview.overtimeHours} hr overtime`);
    setMsg("Overtime charge added ✓");
    setTimeout(() => setMsg(""), 1500);
    onChange();
  }

  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-sm">⏱️ Event hours</h2>
        <div className="text-right">
          <span className="font-display font-bold text-xl text-navy">{preview.hours}</span>
          <span className="text-sm text-slate-500"> billable hr</span>
          <div className="text-[11px] text-slate-400">
            {preview.source === "override" ? "manual override"
              : preview.source === "actual" ? "from actual times"
              : `default (${policies.default_event_hours} hr)`}
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Actual start</label>
          <input className="field" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="label">Actual end</label>
          <input className="field" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div>
          <label className="label">Override hours</label>
          <input className="field" type="number" step="0.25" min="0" value={override}
            onChange={(e) => setOverride(e.target.value)} placeholder="—" />
        </div>
      </div>

      {preview.incomplete && (
        <p className="text-xs text-amber-700 mt-2">⚠️ Only one actual time entered — using the {policies.default_event_hours}-hr default until both are set.</p>
      )}

      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <button className="btn-ghost" onClick={save}>Save times</button>
        {(start || end || override) && (
          <button className="btn-ghost !text-slate-500" onClick={resetTimes}>↺ Reset to default</button>
        )}
        {preview.overtimeAmount > 0 && (
          <button className="btn-warn" onClick={addOvertime}>
            ➕ Add overtime charge — {fmtMoney(preview.overtimeAmount)} ({preview.overtimeHours} hr)
          </button>
        )}
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
      </div>
      {preview.overtimeAmount > 0 && (
        <p className="text-[11px] text-slate-400 mt-2">
          {preview.overtimeHours} hr beyond the {policies.default_event_hours}-hr default = {preview.overtimeUnits} × {fmtMoney(policies.overtime_rate)} per {policies.overtime_increment_min} min. Overtime is only added when you confirm.
        </p>
      )}
    </div>
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
const EDIT_EVENT_TYPES = ["Bar Mitzvah", "Bat Mitzvah", "Wedding", "Engagement", "Sheva Brochos", "Birthday Party", "Corporate Event", "Other"];
const EDIT_TIMES = Array.from({ length: 25 }, (_, i) => {
  const mins = 11 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

/** Edit a booking's details after creation. A date/time change re-runs
 *  conflict detection live — a confirmed-booking clash requires an explicit
 *  override; an unconfirmed-hold clash warns but allows. */
function EditDetailsForm({ b, done }: { b: Booking; done: () => void }) {
  const [f, setF] = useState({
    contact_name: b.contact_name ?? "", phone: b.phone ?? "", email: b.email ?? "",
    contact2_name: b.contact2_name ?? "", contact2_phone: b.contact2_phone ?? "", contact2_email: b.contact2_email ?? "",
    event_type: b.event_type ?? "", event_name: b.event_name ?? "",
    event_date: b.event_date ?? "", event_time: b.event_time ?? "19:00",
    expected_hours: (b as { expected_hours?: number | null }).expected_hours?.toString() ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const [all, setAll] = useState<Booking[]>([]);
  const [pol, setPol] = useState<Policies | null>(null);
  const [override, setOverride] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const offAllowed = (pol?.offprem_enabled === 1) || (b.location_type === "off_prem");
  const [roomId, setRoomId] = useState<string>(b.room_id ?? "");
  const [locType, setLocType] = useState<string>(b.location_type ?? "on_prem");
  const [offAddr, setOffAddr] = useState<string>(b.offprem_address ?? "");
  const [celName, setCelName] = useState(b.celebrant_name ?? "");
  const [celRelation, setCelRelation] = useState(b.celebrant_relation ?? "");
  const [celAge, setCelAge] = useState(b.celebrant_age != null ? String(b.celebrant_age) : "");
  const [affil, setAffil] = useState(b.affiliation ?? "");
  const [offPlace, setOffPlace] = useState<PlaceValue | null>(null);

  useEffect(() => {
    supabase.from("bookings").select("*").neq("status", "cancelled")
      .then(({ data }) => setAll((data ?? []) as Booking[]));
    supabase.from("rooms").select("id,name").eq("active", true).order("sort_order")
      .then(({ data }) => setRooms((data ?? []) as { id: string; name: string }[]));
    loadPolicies().then(setPol);
  }, []);

  const dateChanged = f.event_date !== (b.event_date ?? "") || f.event_time !== (b.event_time ?? "")
    || roomId !== (b.room_id ?? "") || locType !== (b.location_type ?? "on_prem");
  const conflicts = dateChanged && f.event_date && f.event_time && pol
    ? findConflicts(all, f.event_date, f.event_time, b.id, {
        newHours: f.expected_hours ? Number(f.expected_hours) : pol.service_hours,
        defaultHours: pol.service_hours,
        bufferMin: changeoverMinutes(pol),
        roomId: roomId || null,
        locationType: locType,
      })
    : [];
  const confirmedClash = conflicts.some((c) =>
    !["on_hold", "conflict", "waitlisted", "hold_expired"].includes(c.status));

  async function save() {
    if (!f.contact_name.trim()) { setErr("Customer name is required."); return; }
    if (!f.event_date || !f.event_time) { setErr("Event date and time are required."); return; }
    if (confirmedClash && !override) { setErr("The new date/time clashes with a CONFIRMED booking — tick the override to save anyway, or pick another slot."); return; }
    setSaving(true);
    const moved = dateChanged
      ? ` Event moved: ${b.event_date ?? "?"} ${b.event_time ?? ""} → ${f.event_date} ${f.event_time}.`
      : "";
    await supabase.from("bookings").update({
      contact_name: f.contact_name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null,
      contact2_name: f.contact2_name.trim() || null, contact2_phone: f.contact2_phone.trim() || null,
      contact2_email: f.contact2_email.trim() || null,
      event_type: f.event_type || null, event_name: f.event_name.trim() || null,
      event_date: f.event_date, event_time: f.event_time,
      room_id: locType === "on_prem" ? (roomId || null) : null,
      location_type: locType,
      offprem_address: locType === "off_prem" ? (offAddr.trim() || null) : null,
      celebrant_name: celName.trim() || null,
      celebrant_relation: celRelation || null,
      celebrant_age: celAge ? Number(celAge) : null,
      affiliation: affil.trim() || null,
      ...(locType === "off_prem" && offPlace ? {
        offprem_street: offPlace.street, offprem_city: offPlace.city,
        offprem_state: offPlace.state, offprem_zip: offPlace.zip,
        offprem_lat: offPlace.lat, offprem_lng: offPlace.lng,
        offprem_place_id: offPlace.placeId, offprem_source: offPlace.source,
      } : {}),
      expected_hours: f.expected_hours ? Number(f.expected_hours) : null,
    }).eq("id", b.id);
    await logActivity(b.id, b.invoice_num, "Details Edited",
      `Booking details updated.${moved}${confirmedClash ? " ⚠️ Saved OVER a confirmed-booking conflict (rep override)." : conflicts.length ? " Note: clashes with an unconfirmed hold." : ""}`,
      confirmedClash || conflicts.length ? "WARNING" : "SUCCESS");
    setSaving(false);
    done();
  }

  return (
    <Panel title="✏️ Edit booking details">
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className="label">Customer name *</label>
          <input className="field" value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></div>
        <div><label className="label">Phone</label>
          <input className="field" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div><label className="label">Email</label>
          <input className="field" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div><label className="label">2nd contact name</label>
          <input className="field" value={f.contact2_name} onChange={(e) => set("contact2_name", e.target.value)} /></div>
        <div><label className="label">2nd phone</label>
          <input className="field" value={f.contact2_phone} onChange={(e) => set("contact2_phone", e.target.value)} /></div>
        <div><label className="label">2nd email</label>
          <input className="field" type="email" value={f.contact2_email} onChange={(e) => set("contact2_email", e.target.value)} /></div>
        <div><label className="label">Event type</label>
          <select className="field" value={f.event_type} onChange={(e) => set("event_type", e.target.value)}>
            <option value="">— Select —</option>
            {EDIT_EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select></div>
        <div><label className="label">Event name</label>
          <input className="field" value={f.event_name} onChange={(e) => set("event_name", e.target.value)} /></div>
        <div><label className="label">Expected duration (hrs)</label>
          <input className="field" type="number" step="0.5" min="0" value={f.expected_hours}
            onChange={(e) => set("expected_hours", e.target.value)} placeholder="standard" /></div>
        <div><label className="label">Event date</label>
          <input className="field" type="date" value={f.event_date} onChange={(e) => set("event_date", e.target.value)} /></div>
        <div><label className="label">Start time</label>
          <select className="field" value={f.event_time} onChange={(e) => set("event_time", e.target.value)}>
            {EDIT_TIMES.map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
          </select></div>
        {(rooms.length > 1 || locType === "off_prem" || offAllowed) && (
          <div><label className="label">Location</label>
            <select className="field" value={locType === "off_prem" ? "off_prem" : roomId}
              onChange={(e) => {
                if (e.target.value === "off_prem") setLocType("off_prem");
                else { setLocType("on_prem"); setRoomId(e.target.value); }
              }}>
              {rooms.map((r) => <option key={r.id} value={r.id}>🏛️ {r.name}</option>)}
              {offAllowed && <option value="off_prem">📍 Off-premise</option>}
            </select></div>
        )}
          <div className="sm:col-span-2"><label className="label">Who&rsquo;s the simcha for? <span className="text-slate-300">(optional)</span></label>
            <div className="flex gap-2 flex-wrap">
              <input className="field flex-1 min-w-[140px]" placeholder="Name" value={celName} onChange={(e) => setCelName(e.target.value)} />
              <select className="field w-36" value={celRelation} onChange={(e) => setCelRelation(e.target.value)}>
                <option value="">Relation…</option>
                <option>Son</option><option>Daughter</option>
                <option>Grandson</option><option>Granddaughter</option>
                <option>Self</option><option>Sibling</option>
                <option>Parent</option><option>Other</option>
              </select>
              <input className="field w-20" type="number" min="0" max="120" placeholder="Age" value={celAge} onChange={(e) => setCelAge(e.target.value)} />
            </div></div>
          <div><label className="label">Shul / school / community <span className="text-slate-300">(optional)</span></label>
            <input className="field" value={affil} onChange={(e) => setAffil(e.target.value)} /></div>
        {locType === "off_prem" && (
          <div><label className="label">Job address</label>
            <AddressAutocomplete value={offAddr}
              onChange={(pv) => { setOffAddr(pv.formatted); setOffPlace(pv); }} /></div>
        )}
      </div>

      {dateChanged && conflicts.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          <p className="font-bold mb-1">⚠️ New date/time clashes with:</p>
          {conflicts.map((c) => (
            <p key={c.id} className="text-xs">• #{c.invoice_num} {c.contact_name} at {fmtTime(c.event_time)} — {["on_hold", "conflict", "waitlisted", "hold_expired"].includes(c.status) ? "hold (unconfirmed)" : "CONFIRMED BOOKING"}</p>
          ))}
          {confirmedClash && (
            <label className="flex items-center gap-2 mt-2 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              Save anyway (I understand this double-books a confirmed slot)
            </label>
          )}
        </div>
      )}
      {dateChanged && conflicts.length === 0 && f.event_date && (
        <p className="mt-3 text-xs text-emerald-700 font-semibold">✅ New date/time is clear — no conflicts.</p>
      )}

      {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
      <div className="flex gap-2 mt-4">
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>
    </Panel>
  );
}

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
