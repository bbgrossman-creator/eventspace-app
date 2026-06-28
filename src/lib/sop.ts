import { supabase } from "./supabase";

// Stages that can carry an SOP note. The stages are FIXED (architecture);
// only the guidance text is editable. Order = the lifecycle order shown in the editor.
export const SOP_STAGES: { key: string; label: string }[] = [
  { key: "on_hold", label: "Hold (new)" },
  { key: "hold_expired", label: "Hold Expired" },
  { key: "conflict", label: "Conflict" },
  { key: "waitlisted", label: "Waitlisted (First Refusal)" },
  { key: "schedule_menu_discussion", label: "Schedule Menu Call" },
  { key: "send_menu_form", label: "Menu" },
  { key: "send_est_invoice", label: "Estimated Invoice" },
  { key: "confirm_guest_count", label: "Confirm Count" },
  { key: "send_final_invoice", label: "Final Invoice" },
  { key: "collect_payment", label: "Collect Payment" },
  { key: "paid_awaiting_event", label: "Paid — Awaiting Event" },
  { key: "completed", label: "Completed" },
];

export async function loadSopNotes(): Promise<Record<string, string>> {
  const { data } = await supabase.from("sop_notes").select("stage_key,body");
  const out: Record<string, string> = {};
  for (const r of data ?? []) out[r.stage_key as string] = (r.body as string) ?? "";
  return out;
}

export async function loadSopNote(stageKey: string): Promise<string> {
  const { data } = await supabase.from("sop_notes").select("body").eq("stage_key", stageKey).maybeSingle();
  return (data?.body as string) ?? "";
}

export async function saveSopNote(stageKey: string, body: string): Promise<void> {
  const { data } = await supabase.from("sop_notes").select("stage_key").eq("stage_key", stageKey).maybeSingle();
  if (data) await supabase.from("sop_notes").update({ body, updated_at: new Date().toISOString() }).eq("stage_key", stageKey);
  else await supabase.from("sop_notes").insert({ stage_key: stageKey, body });
}
