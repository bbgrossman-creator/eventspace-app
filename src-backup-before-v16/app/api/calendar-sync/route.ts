import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Booking } from "@/lib/workflow";
import {
  fetchCalendarEvents, matchEventToBooking, syncEligible,
} from "@/lib/googleCalendar";

// ═══════════════════════════════════════════════════════════════════════════
// GET/POST /api/calendar-sync — reads the appointment calendar and auto-fills
// menu-call times onto matching bookings. Called by the cron and by the manual
// "Sync Now" button. Read-only against Google; only writes to our own bookings.
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(req: Request) { return run(req); }
export async function GET(req: Request) { return run(req); }

async function run(req: Request) {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!saJson || !calendarId) {
    return NextResponse.json(
      { ok: false, detail: "Calendar sync not configured — set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_CALENDAR_ID (see CALENDAR_SETUP.md)." },
      { status: 200 }  // 200 so the cron/button shows a friendly message, not a crash
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, detail: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  const db = createClient(url, key);

  let events;
  try {
    events = await fetchCalendarEvents(saJson, calendarId);
  } catch (e) {
    return NextResponse.json({ ok: false, detail: `Google error: ${(e as Error).message}` }, { status: 200 });
  }

  // Only bookings awaiting a scheduled call
  const { data: rows } = await db.from("bookings").select("*")
    .eq("status", "schedule_menu_discussion").is("menu_discussion_date", null);
  const bookings = ((rows ?? []) as Booking[]).filter(syncEligible);

  let filled = 0;
  const matches: string[] = [];
  for (const ev of events) {
    const b = matchEventToBooking(ev, bookings);
    if (!b) continue;
    await db.from("bookings").update({
      menu_discussion_date: ev.start,
      menu_discussion_status: "Scheduled",
    }).eq("id", b.id);
    await db.from("activity_log").insert({
      booking_id: b.id, invoice_num: b.invoice_num,
      action: "Menu Call Auto-Synced from Calendar",
      details: `Matched "${ev.summary}" → call ${new Date(ev.start).toLocaleString()}`,
      result: "SUCCESS",
    });
    // prevent the same event filling two bookings in one pass
    const idx = bookings.findIndex((x) => x.id === b.id);
    if (idx >= 0) bookings.splice(idx, 1);
    filled++;
    matches.push(`${ev.summary} → #${b.invoice_num}`);
  }

  return NextResponse.json({
    ok: true, events_scanned: events.length, awaiting_call: bookings.length + filled,
    filled, matches,
  });
}
