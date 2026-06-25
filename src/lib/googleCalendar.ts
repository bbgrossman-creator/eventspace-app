// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE CALENDAR SYNC (read-only)
// Polls the appointment calendar, finds menu-call bookings, and matches each to
// an Event Space booking by the attendee's email or phone. When matched, the
// call time auto-fills onto the booking — which arms the 1-hour reminder.
//
// Auth uses a Google service account (set GOOGLE_SERVICE_ACCOUNT_JSON and
// GOOGLE_CALENDAR_ID). See CALENDAR_SETUP.md for the one-time credential steps.
// ═══════════════════════════════════════════════════════════════════════════
import { Booking } from "./workflow";
import { createClient } from "@supabase/supabase-js";

export interface GCalEvent {
  id: string;
  start: string;            // ISO datetime
  summary: string;
  description: string;
  attendeeEmails: string[];
  // raw text we can scan for a phone number
  scanText: string;
}

// ─── Build a Google OAuth access token from a service account (JWT grant) ───
// Uses Web Crypto (works in the Vercel edge/node runtime) — no googleapis dep.
async function getAccessToken(saJson: string): Promise<string> {
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(claim)}`;

  // Import the PEM private key and sign
  const pem = sa.private_key.replace(/\\n/g, "\n");
  const der = pemToArrayBuffer(pem);
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${Buffer.from(sig).toString("base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = Buffer.from(body, "base64");
  return bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
}

// ─── Fetch upcoming events from the calendar ───
export async function fetchCalendarEvents(
  saJson: string, calendarId: string, daysAhead = 120
): Promise<GCalEvent[]> {
  const token = await getAccessToken(saJson);
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + daysAhead * 86400000).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    + `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
    + `&singleEvents=true&orderBy=startTime&maxResults=250`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Calendar fetch error: ${await res.text()}`);
  const data = await res.json();

  return (data.items ?? [])
    .filter((e: { start?: { dateTime?: string } }) => e.start?.dateTime)
    .map((e: {
      id: string; summary?: string; description?: string;
      start: { dateTime: string };
      attendees?: { email?: string }[];
    }) => {
      const attendeeEmails = (e.attendees ?? [])
        .map((a) => (a.email ?? "").toLowerCase()).filter(Boolean);
      return {
        id: e.id,
        start: e.start.dateTime,
        summary: e.summary ?? "",
        description: e.description ?? "",
        attendeeEmails,
        scanText: `${e.summary ?? ""} ${e.description ?? ""} ${attendeeEmails.join(" ")}`,
      };
    });
}

// ─── Match an event to a booking ───
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function matchEventToBooking(ev: GCalEvent, bookings: Booking[]): Booking | null {
  // 1. Email match (strongest)
  for (const b of bookings) {
    const be = (b.email ?? "").toLowerCase();
    if (be && ev.attendeeEmails.includes(be)) return b;
    if (be && ev.scanText.toLowerCase().includes(be)) return b;
  }
  // 2. Phone match — last 10 digits appearing anywhere in the event text
  const evDigits = digits(ev.scanText);
  for (const b of bookings) {
    const bp = digits(b.phone);
    if (bp.length >= 10 && evDigits.includes(bp.slice(-10))) return b;
  }
  // 3. Name fallback — Google appointment pages put the booker's name in the
  //    event title (e.g. "Menu Discussion … (Leah Weber)") but often DON'T expose
  //    the email/phone via the API. Match on full name, but ONLY when it's
  //    unambiguous (exactly one awaiting booking has that name) to avoid
  //    attaching to the wrong booking.
  const text = ev.scanText.toLowerCase();
  const nameMatches = bookings.filter((b) => {
    const nm = (b.contact_name ?? "").trim().toLowerCase();
    return nm.length >= 4 && text.includes(nm);
  });
  if (nameMatches.length === 1) return nameMatches[0];

  return null;
}

// Only bookings awaiting a scheduled call are eligible to be matched/filled.
export function syncEligible(b: Booking): boolean {
  return b.status === "schedule_menu_discussion" && !b.menu_discussion_date;
}

// ─── Shared sync routine — called directly by both the API route and the cron,
//     so there's no internal HTTP hop that can fail on origin resolution. ───
export interface SyncResult {
  ok: boolean; detail?: string;
  events_scanned?: number; awaiting_call?: number; filled?: number; matches?: string[];
}

export async function syncCalendar(): Promise<SyncResult> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!saJson || !calendarId) {
    return { ok: false, detail: "Calendar sync not configured — set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_CALENDAR_ID." };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, detail: "SUPABASE_SERVICE_ROLE_KEY not set" };
  const db = createClient(url, key);

  let events;
  try {
    events = await fetchCalendarEvents(saJson, calendarId);
  } catch (e) {
    return { ok: false, detail: `Google error: ${(e as Error).message}` };
  }

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
    const idx = bookings.findIndex((x) => x.id === b.id);
    if (idx >= 0) bookings.splice(idx, 1);
    filled++;
    matches.push(`${ev.summary} → #${b.invoice_num}`);
  }

  return { ok: true, events_scanned: events.length, awaiting_call: bookings.length + filled, filled, matches };
}
