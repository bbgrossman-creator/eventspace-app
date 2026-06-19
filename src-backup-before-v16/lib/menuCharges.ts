"use client";
import { supabase } from "@/lib/supabase";
import { MenuTemplate, MenuSelections, computeMenuCharges } from "@/lib/menuEngine";

/** Replace all menu-generated charge lines for a booking with freshly
 *  computed ones. Manual charges (source='manual') are never touched. */
export async function regenerateMenuCharges(
  bookingId: string,
  template: MenuTemplate,
  selections: MenuSelections
): Promise<{ error: string | null; lineCount: number }> {
  const lines = computeMenuCharges(template, selections);

  const del = await supabase.from("charges").delete()
    .eq("booking_id", bookingId).eq("source", "menu");
  if (del.error) return { error: del.error.message, lineCount: 0 };

  if (lines.length > 0) {
    const ins = await supabase.from("charges").insert(
      lines.map((l) => ({
        booking_id: bookingId,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        taxable: l.taxable,
        source: "menu",
        added_by: "Menu Form",
      }))
    );
    if (ins.error) return { error: ins.error.message, lineCount: 0 };
  }
  return { error: null, lineCount: lines.length };
}

/** Map a booking's menu_type to its template slug. */
export function templateSlugFor(menuType: string | null): string | null {
  switch (menuType) {
    case "Full Service": return "full_service";
    case "Single Buffet": return "single_buffet";
    case "Double Buffet": return "double_buffet";
    default: return null;
  }
}
