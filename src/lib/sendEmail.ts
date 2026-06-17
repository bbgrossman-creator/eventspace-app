"use client";

/** Client-side helper: fire an email through the server route.
 *  Never throws — email failure should not break a booking action. */
export async function sendEmail(args: {
  to: string | null | undefined;
  subject: string;
  text: string;
  bookingId?: string;
  invoiceNum?: string;
  action?: string;
}): Promise<{ ok: boolean; detail: string }> {
  try {
    if (!args.to) return { ok: false, detail: "No email address on file" };
    const res = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await res.json();
    return { ok: res.ok, detail: data.detail ?? "" };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
