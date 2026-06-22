import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/email — sends via Resend.
// BETA MODE (default ON): every email is rerouted to EMAIL_BETA_ADDRESS with
// the original recipient shown in the subject — exactly like the Apps Script
// beta behavior. Set EMAIL_BETA_MODE=false in .env.local for production.
// ═══════════════════════════════════════════════════════════════════════════

function serverSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: Request) {
  const { to, subject, text, bookingId, invoiceNum, action } = await req.json();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { detail: "RESEND_API_KEY is not set — add it to .env.local (see README)." },
      { status: 500 }
    );
  }

  const betaMode = process.env.EMAIL_BETA_MODE !== "false";
  const betaAddress = process.env.EMAIL_BETA_ADDRESS ?? "bbgrossman@gmail.com";
  // "__internal__" routes to the business inbox (staff alerts)
  const resolvedTo = to === "__internal__"
    ? (process.env.EMAIL_INTERNAL_ADDRESS ?? betaAddress)
    : to;
  if (!resolvedTo) return NextResponse.json({ detail: "No recipient email on file" }, { status: 400 });
  const finalTo = betaMode ? betaAddress : resolvedTo;
  const finalSubject = betaMode && to !== "__internal__" ? `[BETA → ${resolvedTo}] ${subject}` : subject;
  const from = process.env.EMAIL_FROM ?? "Event Space by Burger Bar <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [finalTo], subject: finalSubject, text }),
  });

  const ok = res.ok;
  let detail = "";
  if (!ok) {
    const err = await res.json().catch(() => ({}));
    detail = (err as { message?: string }).message ?? `Resend error ${res.status}`;
  } else {
    detail = betaMode ? `Sent (beta-routed to ${betaAddress})` : `Sent to ${resolvedTo}`;
  }

  // Log to the activity record (service role bypasses RLS — server only)
  const db = serverSupabase();
  if (db) {
    await db.from("activity_log").insert({
      booking_id: bookingId ?? null,
      invoice_num: invoiceNum ?? "—",
      action: action ?? "Email Sent",
      details: ok ? `"${subject}" → ${resolvedTo}${betaMode ? " (beta-routed)" : ""}` : `FAILED "${subject}" → ${resolvedTo}: ${detail}`,
      result: ok ? "SUCCESS" : "FAILED",
    });
  }

  return NextResponse.json({ detail }, { status: ok ? 200 : 502 });
}
