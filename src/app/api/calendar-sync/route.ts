import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Booking } from "@/lib/workflow";
import { fetchCalendarEvents, syncCalendar, syncEligible } from "@/lib/googleCalendar";

// ═══════════════════════════════════════════════════════════════════════════
// GET/POST /api/calendar-sync — reads the appointment calendar and auto-fills
// menu-call times onto matching bookings. Called by the manual "Sync Now"
// button; the cron calls syncCalendar() directly (no internal HTTP hop).
//
// This route used to have its own copy-pasted matching loop, separate from
// the shared syncCalendar() the cron uses — the two had already drifted apart
// (this one had no ambiguous-tie handling). Fixed by delegating entirely to
// the shared routine, so manual sync and cron sync are always identical.
// ═══════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";  // never cache — see /api/cron for why

export async function POST(req: Request) { return run(req); }
export async function GET(req: Request) { return run(req); }

async function run(req: Request) {
  const result = await syncCalendar();
  if (!result.ok) return NextResponse.json(result, { status: 200 });

  // Debug mode: a second, read-only pass to show what the matcher saw,
  // without re-running (and re-writing) the actual sync logic.
  if (new URL(req.url).searchParams.get("debug")) {
    const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
    const calendarId = process.env.GOOGLE_CALENDAR_ID!;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const db = createClient(url, key);
    const events = await fetchCalendarEvents(saJson, calendarId);
    const { data: rows } = await db.from("bookings").select("*")
      .eq("status", "schedule_menu_discussion").is("menu_discussion_date", null);
    const bookings = ((rows ?? []) as Booking[]).filter(syncEligible);
    return NextResponse.json({
      ...result,
      debug: {
        events: events.map((e) => ({
          title: e.summary, start: e.start,
          attendeeEmails: e.attendeeEmails,
          scanText: e.scanText.slice(0, 300),
        })),
        awaiting_bookings: bookings.map((b) => ({
          invoice: b.invoice_num, name: b.contact_name,
          email: b.email, phone: b.phone, event_date: b.event_date,
        })),
      },
    });
  }

  return NextResponse.json(result);
}
