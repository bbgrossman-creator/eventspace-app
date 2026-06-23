import { supabase } from "./supabase";

export interface StaffMember { id: string; name: string; pin: string; }
export type IdMode = "free_text" | "dropdown" | "pin";

export async function loadStaffAndMode(): Promise<{ staff: StaffMember[]; mode: IdMode }> {
  const [{ data: s }, { data: m }] = await Promise.all([
    supabase.from("staff").select("id,name,pin").eq("active", true).order("sort_order"),
    supabase.from("app_settings").select("value").eq("key", "staff_id_mode").single(),
  ]);
  return {
    staff: (s ?? []) as StaffMember[],
    mode: ((m?.value as IdMode) ?? "free_text"),
  };
}

/** Verify an approval. Returns the approver's name if valid, else null.
 *  - free_text: name typed directly (always valid if non-empty)
 *  - dropdown: a staff member was selected
 *  - pin: selected staff member's PIN must match
 */
export function verifyApproval(
  mode: IdMode,
  staff: StaffMember[],
  selectedId: string,
  typedName: string,
  pin: string
): { ok: boolean; name?: string; error?: string } {
  if (mode === "free_text") {
    if (!typedName.trim()) return { ok: false, error: "Enter your name." };
    return { ok: true, name: typedName.trim() };
  }
  const member = staff.find((s) => s.id === selectedId);
  if (!member) return { ok: false, error: "Select your name." };
  if (mode === "dropdown") return { ok: true, name: member.name };
  // pin mode
  if (!pin.trim()) return { ok: false, error: "Enter your PIN." };
  if (member.pin !== pin.trim()) return { ok: false, error: "PIN does not match." };
  return { ok: true, name: member.name };
}
