"use client";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** Append a row to the activity log (fire-and-forget). */
export async function logActivity(
  bookingId: string | null,
  invoiceNum: string,
  action: string,
  details: string,
  result: "SUCCESS" | "FAILED" | "WARNING" = "SUCCESS"
) {
  await supabase.from("activity_log").insert({
    booking_id: bookingId, invoice_num: invoiceNum, action, details, result,
  });
}
