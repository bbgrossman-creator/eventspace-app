import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncCalendar } from "@/lib/googleCalendar";
import { Booking } from "@/lib/workflow";
import {
  Automation, resolveAnchor, DEFAULT_ELIGIBLE, placeholderValues, renderTemplate,
} from "@/lib/automation";
import { bookingFinancials, ChargeLike } from "@/lib/finance";
import { menuScheduleReminderDue, reminderCadenceLabel } from "@/lib/menuSchedule";

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/cron — generic automation scheduler. Run every 15 minutes.
// Reads enabled, time-based rows from email_automations; nothing is hard-coded.
// For each (automation × booking): if the anchor+offset time has arrived
// (within a 6-hour grace window), status is eligible, balance condition holds,
// and it was never sent before (email_sends ledger) → send and record.
// ═══════════════════════════════════════════════════════════════════════════

const GRACE_MS = 6 * 3600000;

// CRITICAL: without this, Next.js statically prerenders this GET handler
// (nothing in it unconditionally touches a dynamic API), so external cron
// services get a cached response (X-Vercel-Cache: PRERENDER) and the sync
// never actually runs. Vercel's own cron bypasses the cache; cron-job.org
// and friends do not.
export const dynamic = "force-dynamic";

interface PaymentRow { booking_id: string; amount_applied: number; }
interface ChargeRowDb extends ChargeLike { booking_id: string; }

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ detail: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  const db = createClient(url, key);
  // Build a reliable public origin. req.url can be an internal address when the
  // cron is triggered by Vercel, which would break internal fetches. Prefer an
  // explicit base URL, then VERCEL_URL, then fall back to req.url.
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : new URL(req.url).origin);
  const now = Date.now();

  // Multi-tenant: process each tenant's config + bookings in isolation, so one
  // tenant's app_settings / email_automations never touch another's bookings.
  // (service_role bypasses RLS, so we MUST filter by tenant explicitly.)
  const { data: tenantRows } = await db.from("tenants").select("id");
  const tenantIds = ((tenantRows ?? []) as { id: string }[]).map((t) => t.id);

  // Calendar sync first — call the shared routine DIRECTLY (no internal HTTP
  // hop, which previously failed when Vercel's cron passed an internal origin).
  let calendar_sync = "skipped";
  try {
    const csData = await syncCalendar();
    calendar_sync = csData.ok
      ? `scanned ${csData.events_scanned}, awaiting ${csData.awaiting_call}, filled ${csData.filled}`
      : (csData.detail ?? "error");
  } catch (e) {
    calendar_sync = `error: ${(e as Error).message}`;
  }
  // Record every run's sync outcome so we can see what the cron is doing without
  // catching the live JSON. Visible in any booking's activity? No — log globally.
  try {
    await db.from("activity_log").insert({
      booking_id: null, invoice_num: "CRON",
      action: "Cron Calendar Sync", details: calendar_sync,
      result: calendar_sync.startsWith("error") ? "FAILED" : "SUCCESS",
    });
  } catch { /* non-fatal */ }

  // Expire holds whose 24h window has passed, so status is real everywhere
  // (lists/dashboard group by stored status, not lazy computation).
  let holds_expired = 0;
  try {
    const { data: stale } = await db.from("bookings").select("id,invoice_num,tenant_id")
      .eq("status", "on_hold")
      .not("hold_expires", "is", null)
      .lt("hold_expires", new Date().toISOString());
    for (const h of (stale ?? []) as { id: string; invoice_num: string; tenant_id: string }[]) {
      await db.from("bookings").update({ status: "hold_expired" }).eq("id", h.id);
      await db.from("activity_log").insert({
        tenant_id: h.tenant_id,   // service_role bypasses the DEFAULT; stamp from the booking
        booking_id: h.id, invoice_num: h.invoice_num,
        action: "Hold Expired", details: "24h hold window passed with no deposit — follow up or release.",
        result: "WARNING",
      });
      // Any leads waiting on this holder: the date is now effectively open.
      const { data: leads } = await db.from("bookings").select("id,invoice_num,tenant_id")
        .eq("waitlisted_for", h.id).eq("status", "waitlisted");
      for (const l of (leads ?? []) as { id: string; invoice_num: string; tenant_id: string }[]) {
        await db.from("activity_log").insert({
          tenant_id: l.tenant_id,
          booking_id: l.id, invoice_num: l.invoice_num,
          action: "Held Date Now Open",
          details: "The holder's hold expired without a deposit — offer this party the date.",
          result: "WARNING",
        });
      }
      holds_expired++;
    }
  } catch { /* non-fatal */ }

  // First-right-of-refusal: handle holders whose decision deadline has passed.
  let refusal_lapsed = 0;
  try {
   for (const tid of tenantIds) {
    const { data: polRows } = await db.from("app_settings").select("key,value")
      .eq("tenant_id", tid)
      .in("key", ["refusal_lapse_action"]);
    const lapseAction = (polRows ?? []).find((r) => r.key === "refusal_lapse_action")?.value ?? "flag";
    const { data: expired } = await db.from("bookings").select("*")
      .eq("tenant_id", tid)
      .not("refusal_deadline", "is", null)
      .lt("refusal_deadline", new Date().toISOString())
      .in("status", ["on_hold", "conflict"]); // never touch a booked/deposited holder
    for (const holder of (expired ?? []) as Booking[]) {
      if (lapseAction === "auto_release") {
        // Release the holder; promote the challenger to a fresh 24h hold.
        await db.from("bookings").update({
          status: "cancelled", refusal_deadline: null, refusal_challenger: null,
        }).eq("id", holder.id);
        if (holder.refusal_challenger) {
          const he = new Date(); he.setHours(he.getHours() + 24);
          await db.from("bookings").update({
            status: "on_hold", waitlisted_for: null, hold_expires: he.toISOString(),
          }).eq("id", holder.refusal_challenger);
          // Fetch the challenger to note if they're deposit-ready (card on file).
          const { data: chal } = await db.from("bookings").select("deposit_ready,card_last4").eq("id", holder.refusal_challenger).maybeSingle();
          const readyNote = chal?.deposit_ready
            ? ` Ready to commit — card ${chal.card_last4 ? `•••• ${chal.card_last4}` : "on file"}; collect the deposit.`
            : "";
          await db.from("activity_log").insert({
            tenant_id: tid,
            booking_id: holder.refusal_challenger, invoice_num: "—",
            action: "Promoted from Waitlist (Auto)",
            details: `Holder deadline lapsed — date auto-released and now holding.${readyNote}`, result: "SUCCESS",
          });
        }
        await db.from("activity_log").insert({
          tenant_id: tid,
          booking_id: holder.id, invoice_num: holder.invoice_num,
          action: "Hold Auto-Released (Deadline Lapsed)",
          details: "First-right-of-refusal deadline passed with no commitment.", result: "WARNING",
        });
      } else {
        // Flag-the-rep mode: just log that the deadline lapsed; rep decides.
        await db.from("activity_log").insert({
          tenant_id: tid,
          booking_id: holder.id, invoice_num: holder.invoice_num,
          action: "First-Refusal Deadline Lapsed",
          details: "Deadline passed — rep must decide to keep or release the date.", result: "WARNING",
        });
        // Clear only the deadline so it isn't re-flagged every run; keep challenger link.
        await db.from("bookings").update({ refusal_deadline: null }).eq("id", holder.id);
      }
      refusal_lapsed++;
    }
   }
  } catch { /* non-fatal */ }

  // ── Debrief tasks (Knowledge Architecture step 5) ──
  // Opens ONE ignorable task per completed event, prompting the three
  // close-out questions.
  //
  // IDEMPOTENCY LIVES ON THE BOOKING, not the task. Dismissing a task DELETES
  // it, so "does a Debrief: task exist?" was a check that erased its own
  // evidence — the task came back every 15 minutes forever. `debrief_prompted_at`
  // survives dismissal, completion, and deletion alike: asked once, never again.
  //
  // Also trickles: at most MAX_NEW per run, so enabling this on a business with
  // months of completed events doesn't dump 20 tasks into Daily Ops at once.
  const MAX_NEW_DEBRIEF_TASKS = 3;
  let debrief_tasks = 0;
  try {
   for (const tid of tenantIds) {
    const { data: kc } = await db.from("app_settings").select("value")
      .eq("tenant_id", tid)
      .eq("key", "cap_override:knowledge_capture").maybeSingle();
    const captureOn = !kc || (kc.value !== "0" && kc.value !== "false");
    if (captureOn) {
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const { data: done } = await db.from("bookings")
        .select("id,invoice_num,contact_name,event_type,event_date,tenant_id")
        .eq("tenant_id", tid)
        .eq("status", "completed")
        .is("debrief_prompted_at", null)      // ← the durable check
        .gte("event_date", cutoff)
        .order("event_date", { ascending: false })
        .limit(MAX_NEW_DEBRIEF_TASKS);
      const recent = (done ?? []) as { id: string; invoice_num: string; contact_name: string; event_type: string | null; event_date: string | null; tenant_id: string }[];
      for (const ev of recent) {
        const { error: tErr } = await db.from("tasks").insert({
          tenant_id: ev.tenant_id,   // service_role bypasses the DEFAULT; stamp from the booking
          booking_id: ev.id, invoice_num: ev.invoice_num,
          title: `Debrief: ${ev.contact_name}${ev.event_type ? ` ${ev.event_type}` : ""} — what worked?`,
          due_date: new Date().toISOString().slice(0, 10), done: false,
        });
        // Mark prompted even if the task insert failed — better to miss one
        // prompt than to retry it every 15 minutes forever.
        await db.from("bookings").update({ debrief_prompted_at: new Date().toISOString() }).eq("id", ev.id);
        if (!tErr) debrief_tasks++;
      }
    }
   }
  } catch { /* non-fatal — columns may not exist until v174 SQL runs */ }

  let sent = 0;
  let ladderSent = 0;
  const details: string[] = [];
  let anyAutomations = false;

  for (const tid of tenantIds) {
    const { data: autoRows } = await db.from("email_automations")
      .select("*").eq("tenant_id", tid).eq("enabled", true).neq("trigger", "action");
    const automations = (autoRows ?? []) as Automation[];
    if (automations.length === 0) continue;
    anyAutomations = true;

    const { data: bookingRows } = await db.from("bookings").select("*")
      .eq("tenant_id", tid).neq("status", "cancelled");
    const bookings = (bookingRows ?? []) as Booking[];

    const needBalance = automations.some((a) => a.require_balance);
    const chargesBy = new Map<string, ChargeLike[]>();
    const paidBy = new Map<string, number>();
    if (needBalance) {
      const [{ data: ch }, { data: py }] = await Promise.all([
        db.from("charges").select("*").eq("tenant_id", tid),
        db.from("payments").select("booking_id, amount_applied").eq("tenant_id", tid),
      ]);
      for (const c of (ch ?? []) as ChargeRowDb[]) {
        if (!chargesBy.has(c.booking_id)) chargesBy.set(c.booking_id, []);
        chargesBy.get(c.booking_id)!.push(c);
      }
      for (const p of (py ?? []) as PaymentRow[]) {
        paidBy.set(p.booking_id, (paidBy.get(p.booking_id) ?? 0) + Number(p.amount_applied));
      }
    }

    const { data: sends } = await db.from("email_sends").select("automation_id, booking_id");
    const sentSet = new Set((sends ?? []).map((s) => `${s.automation_id}:${s.booking_id}`));

    for (const a of automations) {
      const eligible = a.status_filter?.length ? a.status_filter : DEFAULT_ELIGIBLE[a.trigger] ?? [];
      for (const b of bookings) {
        if (!eligible.includes(b.status)) continue;
        if (sentSet.has(`${a.id}:${b.id}`)) continue;

        const anchor = resolveAnchor(a.trigger, b);
        if (!anchor) continue;
        const target = anchor.getTime() + a.offset_minutes * 60000;
        if (now < target || now - target > GRACE_MS) continue;

        let balanceStr = "", totalStr = "";
        if (a.require_balance || a.body.includes("{{balance}}") || a.subject.includes("{{balance}}")) {
          const fin = bookingFinancials(b, chargesBy.get(b.id) ?? []);
          const paid = paidBy.get(b.id) ?? 0;
          const balance = Math.max(0, fin.total - paid);
          if (a.require_balance && balance <= 0.01) continue;
          balanceStr = `$${balance.toFixed(2)}`;
          totalStr = `$${fin.total.toFixed(2)}`;
        }

        const values = placeholderValues(b, { balance: balanceStr, total: totalStr });
        const res = await fetch(`${origin}/api/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: a.recipient === "internal" ? "__internal__" : b.email,
            subject: renderTemplate(a.subject, values),
            text: renderTemplate(a.body, values),
            bookingId: b.id,
            invoiceNum: b.invoice_num,
            action: `Automation: ${a.name}`,
          }),
        });
        if (res.ok) {
          await db.from("email_sends").insert({ automation_id: a.id, booking_id: b.id });
          sentSet.add(`${a.id}:${b.id}`);
          sent++;
          details.push(`${a.key} → #${b.invoice_num}`);
        }
      }
    }

    // ── Menu scheduling escalation ladder (per-tenant; max once/day/booking) ──
    const { data: ladderRow } = await db.from("email_automations")
      .select("*").eq("tenant_id", tid).eq("key", "menu_scheduling_reminder").eq("enabled", true).maybeSingle();
    if (ladderRow) {
      const a = ladderRow as Automation;
      const todayStr = new Date().toISOString().slice(0, 10);
      for (const b of bookings) {
        if (!menuScheduleReminderDue(b, new Date())) continue;
        const dayKey = `ladder:${b.id}:${todayStr}`;
        const { data: already } = await db.from("email_sends")
          .select("id").eq("booking_id", b.id).eq("day_key", dayKey).limit(1);
        if (already && already.length > 0) continue;
        if (!b.email) continue;
        const values = placeholderValues(b);
        const res = await fetch(`${origin}/api/email`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: b.email,
            subject: renderTemplate(a.subject, values),
            text: renderTemplate(a.body, values),
            bookingId: b.id, invoiceNum: b.invoice_num,
            action: `Automation: ${a.name} (${reminderCadenceLabel(b, new Date())})`,
          }),
        });
        if (res.ok) {
          await db.from("email_sends").insert({ automation_id: a.id, booking_id: b.id, day_key: dayKey });
          ladderSent++;
          details.push(`menu_scheduling_reminder → #${b.invoice_num}`);
        }
      }
    }
  }

  if (!anyAutomations) return NextResponse.json({ ran_at: new Date().toISOString(), calendar_sync, holds_expired, refusal_lapsed, debrief_tasks, sent: 0, note: "No enabled scheduled automations" });

  return NextResponse.json({ ran_at: new Date().toISOString(), calendar_sync, holds_expired, refusal_lapsed, debrief_tasks, sent: sent + ladderSent, details });
}
