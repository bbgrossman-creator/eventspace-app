import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
  const origin = new URL(req.url).origin;
  const now = Date.now();

  const { data: autoRows } = await db.from("email_automations")
    .select("*").eq("enabled", true).neq("trigger", "action");
  const automations = (autoRows ?? []) as Automation[];
  if (automations.length === 0) return NextResponse.json({ ran_at: new Date().toISOString(), sent: 0, note: "No enabled scheduled automations" });

  const { data: bookingRows } = await db.from("bookings").select("*").neq("status", "cancelled");
  const bookings = (bookingRows ?? []) as Booking[];

  const needBalance = automations.some((a) => a.require_balance);
  const chargesBy = new Map<string, ChargeLike[]>();
  const paidBy = new Map<string, number>();
  if (needBalance) {
    const [{ data: ch }, { data: py }] = await Promise.all([
      db.from("charges").select("*"),
      db.from("payments").select("booking_id, amount_applied"),
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

  let sent = 0;
  const details: string[] = [];

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

  // ── Menu scheduling escalation ladder (sends repeatedly, max once/day/booking) ──
  let ladderSent = 0;
  const { data: ladderRow } = await db.from("email_automations")
    .select("*").eq("key", "menu_scheduling_reminder").eq("enabled", true).single();
  if (ladderRow) {
    const a = ladderRow as Automation;
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const b of bookings) {
      if (!menuScheduleReminderDue(b, new Date())) continue;
      // one per booking per day: ledger key includes the date
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

  return NextResponse.json({ ran_at: new Date().toISOString(), automations_checked: automations.length, sent: sent + ladderSent, details });
}
