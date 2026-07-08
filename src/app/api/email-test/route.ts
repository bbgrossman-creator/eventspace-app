import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════════
// /api/email-test — DIAGNOSTIC ONLY. Reports email configuration and optionally
// sends ONE test email via the same Resend path production uses.
//
// Usage:
//   GET  /api/email-test            → config report only (sends nothing)
//   GET  /api/email-test?to=you@example.com  → also sends a test to that address
//
// SAFETY: only sends to the address you pass in. Never sends to customers.
// ═══════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";  // never cache — see /api/cron for why

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const to = searchParams.get("to");

  // ── 1. Config report (never leaks the actual key) ──
  const apiKey = process.env.RESEND_API_KEY;
  const betaModeRaw = process.env.EMAIL_BETA_MODE;
  const betaMode = betaModeRaw !== "false";
  const config = {
    RESEND_API_KEY: apiKey ? `present (${apiKey.slice(0, 5)}…, length ${apiKey.length})` : "MISSING",
    EMAIL_FROM: process.env.EMAIL_FROM ?? "(unset → defaults to onboarding@resend.dev)",
    EMAIL_BETA_MODE: betaModeRaw ?? "(unset → defaults to true/ON)",
    beta_mode_active: betaMode,
    EMAIL_BETA_ADDRESS: process.env.EMAIL_BETA_ADDRESS ?? "(unset → defaults to bbgrossman@gmail.com)",
    EMAIL_INTERNAL_ADDRESS: process.env.EMAIL_INTERNAL_ADDRESS ?? "(unset)",
  };

  // Quick interpretation to point at the likely problem.
  const findings: string[] = [];
  if (!apiKey) findings.push("RESEND_API_KEY is MISSING — Resend calls will fail. Add it in Vercel → Settings → Environment Variables, then redeploy.");
  if (!process.env.EMAIL_FROM) findings.push("EMAIL_FROM is unset — using onboarding@resend.dev, which only delivers reliably to your own Resend account email. Verify a domain and set EMAIL_FROM for delivery to others.");
  if (betaMode) findings.push("Beta mode is ON — all email reroutes to the beta address regardless of recipient.");
  if (!betaMode) findings.push("Beta mode is OFF — email goes to real recipients.");

  // ── 2. Optional send test (only if ?to= supplied) ──
  let sendResult: Record<string, unknown> | null = null;
  if (to) {
    if (!apiKey) {
      sendResult = { attempted: false, reason: "RESEND_API_KEY missing — cannot send." };
    } else {
      const from = process.env.EMAIL_FROM ?? "Event Space by Burger Bar <onboarding@resend.dev>";
      const finalTo = betaMode ? (process.env.EMAIL_BETA_ADDRESS ?? "bbgrossman@gmail.com") : to;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from, to: [finalTo],
            subject: "Event Space — email diagnostic test",
            text: "This is a diagnostic test from /api/email-test. If you received it, the email path is working.",
          }),
        });
        const bodyText = await res.text();
        sendResult = {
          attempted: true,
          success: res.ok,
          http_status: res.status,
          from_used: from,
          intended_recipient: to,
          final_recipient: finalTo,
          beta_rerouted: betaMode,
          resend_response: bodyText.slice(0, 500),
        };
      } catch (e) {
        sendResult = { attempted: true, success: false, error: (e as Error).message };
      }
    }
  }

  return NextResponse.json({
    ok: true,
    note: to ? "Config report + send test below." : "Config report only. Append ?to=your@email.com to also send a test (only to that address).",
    config,
    findings,
    sendResult,
  }, { status: 200 });
}
