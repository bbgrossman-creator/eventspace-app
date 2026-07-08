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

const MONTHS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];
// Explicit aliases, not a slice(0,3) guess — September genuinely has two
// common abbreviations in the wild ("Sep" and "Sept"), and a mechanical
// 3-letter slice silently misses the 4-letter one.
const MONTH_ALIASES: string[][] = [
  ["january", "jan"], ["february", "feb"], ["march", "mar"], ["april", "apr"],
  ["may"], ["june", "jun"], ["july", "jul"], ["august", "aug"],
  ["september", "sep", "sept"], ["october", "oct"], ["november", "nov"], ["december", "dec"],
];

// Lenient check: does the customer's typed event date (from the "What's your
// event date?" booking-page question) appear anywhere in the event text?
// Used ONLY to break a tie between two otherwise-equal candidates — never as
// a primary signal on its own, since it's free text a customer typed once.
// Hand-rolled matching (no date-parsing library) — deliberately permissive:
// numeric M/D and M/D/Y (with or without leading zeros), plus every common
// month-name alias in either "Month Day" or "Day Month" order, with an
// optional ordinal suffix (1st/2nd/3rd/13th) and an optional trailing period
// on the month token ("Sept." / "Aug."). Always matched against lowercased
// text, so capitalization never matters.
function eventDateAppearsIn(eventDateIso: string | null | undefined, text: string): boolean {
  if (!eventDateIso) return false;
  const d = new Date(`${eventDateIso}T00:00:00`);
  if (isNaN(d.getTime())) return false;
  const month = d.getMonth() + 1, day = d.getDate(), year = d.getFullYear();
  const mm = String(month).padStart(2, "0"), dd = String(day).padStart(2, "0");
  const numeric = [
    `${month}/${day}`, `${mm}/${dd}`, `${month}-${day}`, `${mm}-${dd}`,
    `${month}/${day}/${year}`, `${mm}/${dd}/${year}`,
  ];
  if (numeric.some((p) => text.includes(p))) return true;
  const ordinal = "(st|nd|rd|th)?";
  const wordPatterns: RegExp[] = [];
  for (const alias of MONTH_ALIASES[month - 1]) {
    wordPatterns.push(new RegExp(`\\b${alias}\\.?\\s+${day}${ordinal}\\b`));
    wordPatterns.push(new RegExp(`\\b${day}${ordinal}\\s+${alias}\\.?\\b`));
  }
  return wordPatterns.some((re) => re.test(text));
}

export interface MatchResult {
  booking: Booking | null;
  // "matched": booking is set. "none": nothing scored — not this event's booking,
  // ignore quietly. "ambiguous": 2+ eligible candidates tied and the date
  // tie-breaker couldn't separate them. "low_confidence": only one eligible
  // candidate, but its email is shared elsewhere in the system and nothing
  // else (name/date) confirms it — could be a coincidental attendee match on
  // an unrelated event. Never guess on either.
  reason: "matched" | "none" | "ambiguous" | "low_confidence";
  tiedCount?: number;
}

export function matchEventToBooking(ev: GCalEvent, bookings: Booking[], sharedEmails: Set<string>): MatchResult {
  const evText = ev.scanText.toLowerCase();
  const evDigits = digits(ev.scanText);

  // Score every booking against this event. Higher = more confident.
  // Email is decisive; phone is supporting; name only breaks ties.
  type Scored = { b: Booking; score: number; emailMatch: boolean; nameMatch: boolean };
  const scored: Scored[] = [];

  for (const b of bookings) {
    const be = (b.email ?? "").toLowerCase();
    const bp = digits(b.phone);
    let score = 0;
    let emailMatch = false;
    let nameMatch = false;

    // Email — strongest signal. Attendee field is most reliable; body text next.
    if (be && ev.attendeeEmails.includes(be)) { score += 100; emailMatch = true; }
    else if (be && evText.includes(be)) { score += 80; emailMatch = true; }

    // Phone — supporting signal only.
    if (bp.length >= 10 && evDigits.includes(bp.slice(-10))) score += 20;

    // Name — weak tiebreaker only (truncation/dupes make it unreliable alone).
    const nm = (b.contact_name ?? "").trim().toLowerCase();
    if (nm.length >= 4 && evText.includes(nm)) { score += 5; nameMatch = true; }

    if (score > 0) scored.push({ b, score, emailMatch, nameMatch });
  }

  if (scored.length === 0) return { booking: null, reason: "none" };

  // CRITICAL disambiguation: if ANY candidate matches by email, only consider
  // email-matched candidates. This prevents a phone-only match from stealing an
  // event that actually belongs to a different booking (the same-phone bug).
  const anyEmail = scored.some((s) => s.emailMatch);
  const pool = anyEmail ? scored.filter((s) => s.emailMatch) : scored;
  pool.sort((a, z) => z.score - a.score);

  // A genuine tie at the top — same score, could be same email shared across
  // multiple bookings (the same-email bug), or two equally-weak phone/name
  // matches. Try the event-date tie-breaker before giving up.
  const tiedTop = pool.filter((s) => s.score === pool[0].score);
  if (tiedTop.length >= 2) {
    const dateMatches = tiedTop.filter((s) => eventDateAppearsIn(s.b.event_date, evText));
    if (dateMatches.length === 1) return { booking: dateMatches[0].b, reason: "matched" };
    // Still ambiguous — 0 or 2+ tied candidates also share the typed date
    // (or no date question was answered at all). Refuse rather than guess.
    return { booking: null, reason: "ambiguous", tiedCount: tiedTop.length };
  }

  // No live tie among *currently eligible* bookings — but that alone isn't
  // enough. If this booking's email is shared by other bookings elsewhere in
  // the system (even ones not eligible right now — completed, cancelled,
  // mid-flow), a bare email match is coincidence, not confirmation: some
  // unrelated event that happens to list this address as an attendee could
  // silently attach itself to whichever booking happens to be the only one
  // waiting at that moment. Require the event to also confirm the name or
  // the typed date before trusting it in that case.
  const top = pool[0];
  const emailIsStructurallyShared = top.emailMatch && sharedEmails.has((top.b.email ?? "").toLowerCase());
  if (emailIsStructurallyShared && !top.nameMatch && !eventDateAppearsIn(top.b.event_date, evText)) {
    return { booking: null, reason: "low_confidence" };
  }

  return { booking: top.b, reason: "matched" };
}

// Only bookings awaiting a scheduled call are eligible to be matched/filled.
export function syncEligible(b: Booking): boolean {
  return b.status === "schedule_menu_discussion" && !b.menu_discussion_date;
}

// ─── Shared sync routine — called directly by both the API route and the cron,
//     so there's no internal HTTP hop that can fail on origin resolution. ───
export interface SyncResult {
  ok: boolean; detail?: string;
  events_scanned?: number; awaiting_call?: number; filled?: number; ambiguous?: number; low_confidence?: number; matches?: string[];
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

  // Emails that appear on more than one booking ANYWHERE in the system (not
  // just currently-eligible ones) — a bare match against one of these is
  // coincidence, not confirmation. See matchEventToBooking's low_confidence path.
  const { data: allEmailRows } = await db.from("bookings").select("email").not("email", "is", null);
  const emailCounts: Record<string, number> = {};
  for (const r of (allEmailRows ?? []) as { email: string }[]) {
    const e = r.email.toLowerCase();
    emailCounts[e] = (emailCounts[e] ?? 0) + 1;
  }
  const sharedEmails = new Set(Object.keys(emailCounts).filter((e) => emailCounts[e] >= 2));

  let filled = 0;
  let ambiguous = 0;
  let lowConfidence = 0;
  const matches: string[] = [];
  for (const ev of events) {
    const result = matchEventToBooking(ev, bookings, sharedEmails);

    if (result.reason === "ambiguous") {
      // Never guess: 2+ eligible bookings tied (typically a shared email) and
      // the event-date tie-breaker couldn't separate them either. Flag every
      // tied candidate so a human resolves it from whichever booking they open.
      const evText = ev.scanText.toLowerCase();
      const tied = bookings.filter((b) => {
        const be = (b.email ?? "").toLowerCase();
        return be && (ev.attendeeEmails.includes(be) || evText.includes(be));
      });
      for (const b of tied) {
        await db.from("activity_log").insert({
          booking_id: b.id, invoice_num: b.invoice_num,
          action: "Calendar Match Ambiguous — Needs Review",
          details: `"${ev.summary}" at ${new Date(ev.start).toLocaleString()} matches ${tied.length} bookings with this email and couldn't be told apart automatically. Check which one this call belongs to and set the call time manually.`,
          result: "WARNING",
        });
      }
      ambiguous++;
      continue;
    }
    if (result.reason === "low_confidence") {
      // Only one eligible booking shared this event's email, but the email
      // itself is reused elsewhere in the system and nothing else confirmed
      // it — flag it rather than risk attaching an unrelated event's time.
      const evText = ev.scanText.toLowerCase();
      const candidate = bookings.find((b) => {
        const be = (b.email ?? "").toLowerCase();
        return be && (ev.attendeeEmails.includes(be) || evText.includes(be));
      });
      if (candidate) {
        await db.from("activity_log").insert({
          booking_id: candidate.id, invoice_num: candidate.invoice_num,
          action: "Calendar Match Low-Confidence — Needs Review",
          details: `"${ev.summary}" at ${new Date(ev.start).toLocaleString()} matches this booking only by email, and that email is shared by other bookings in the system. Neither the name nor the event date confirmed it, so it wasn't auto-filled. Check whether this call actually belongs here.`,
          result: "WARNING",
        });
      }
      lowConfidence++;
      continue;
    }
    if (!result.booking) continue;

    const b = result.booking;
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

  return { ok: true, events_scanned: events.length, awaiting_call: bookings.length + filled, filled, ambiguous, low_confidence: lowConfidence, matches };
}
