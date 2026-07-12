// ═══════════════════════════════════════════════════════════════════════════
// TIER-1 BACKFILL (Knowledge Architecture §6)
// Transforms real, completed template-menu selections into Event Components.
//
// Guarantees (Editions Architecture v2 — confirmed requirements):
//   • Only bookings with actual menu selections produce rows — a booking
//     without a menu produces NOTHING (no placeholders, ever).
//   • Idempotent: a booking that already has components is skipped, so the
//     button can be pressed twice (or after new events complete) safely.
//   • Pricing is deliberately NOT carried: template option prices are
//     surcharges over a base per-person rate, not standalone item prices —
//     copying them onto items would be misleading. Items backfill unpriced.
//   • Runs client-side with the same supabase client as everything else.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabase";
import { Booking } from "./workflow";
import { MenuTemplate, MenuSection, MenuSelections, isVisible } from "./menuEngine";

export interface BackfillResult {
  ok: boolean; detail?: string;
  scanned: number;        // bookings with menu selections found
  skipped_existing: number;
  backfilled: number;     // bookings that produced components
  components: number;     // total component rows created
  items: number;          // total item rows created
}

function hasSelections(b: Booking): boolean {
  const m = b.menu as unknown as MenuSelections | null;
  return !!(m && m.answers && Object.keys(m.answers).length > 0 && m.template);
}

/** One section's answer → item names (+ optional quantities). Returns [] when
 *  the section has no real selection — which means NO component is created. */
function itemsForSection(s: MenuSection, answer: unknown): { name: string; quantity: number | null }[] {
  if (answer == null) return [];
  switch (s.type) {
    case "choose": {
      const v = String(answer).trim();
      return v ? [{ name: v, quantity: null }] : [];
    }
    case "multi": {
      if (!Array.isArray(answer)) return [];
      return (answer as unknown[]).map((x) => String(x).trim()).filter(Boolean)
        .map((name) => ({ name, quantity: null }));
    }
    case "toggle":
      return String(answer) === "Yes" ? [{ name: s.title, quantity: null }] : [];
    case "qty": {
      if (typeof answer !== "object" || Array.isArray(answer)) return [];
      return Object.entries(answer as Record<string, unknown>)
        .map(([name, q]) => ({ name: name.trim(), quantity: Number(q) || 0 }))
        .filter((x) => x.name && x.quantity > 0);
    }
    default:
      return []; // text lands in notes; info is display-only
  }
}

export async function runTier1Backfill(): Promise<BackfillResult> {
  const zero: BackfillResult = { ok: false, scanned: 0, skipped_existing: 0, backfilled: 0, components: 0, items: 0 };

  // Templates by slug — the config is needed to resolve section titles/types.
  const { data: tplRows, error: tplErr } = await supabase.from("menu_templates").select("slug,config");
  if (tplErr) return { ...zero, detail: `Couldn't load menu templates: ${tplErr.message}` };
  const templates = new Map<string, MenuTemplate>();
  for (const r of (tplRows ?? []) as { slug: string; config: MenuTemplate }[]) templates.set(r.slug, r.config);

  // Real selections only; cancelled events excluded.
  const { data: rows, error } = await supabase.from("bookings").select("*").neq("status", "cancelled");
  if (error) return { ...zero, detail: error.message };
  const withMenus = ((rows ?? []) as Booking[]).filter(hasSelections);

  // Idempotency: skip any booking that already has components.
  const ids = withMenus.map((b) => b.id);
  const existing = new Set<string>();
  if (ids.length) {
    const { data: ex } = await supabase.from("event_components").select("booking_id").is("proposal_version_id", null).in("booking_id", ids);
    for (const r of (ex ?? []) as { booking_id: string }[]) existing.add(r.booking_id);
  }

  let backfilled = 0, components = 0, items = 0;
  for (const b of withMenus) {
    if (existing.has(b.id)) continue;
    const sel = b.menu as unknown as MenuSelections;
    const tpl = templates.get(sel.template);
    if (!tpl?.sections) continue; // template deleted/renamed — nothing to resolve against

    let pos = 0;
    for (const s of tpl.sections) {
      if (!isVisible(s, sel.answers)) continue;
      const answer = sel.answers[s.key];
      if (s.type === "text") continue; // free-text notes aren't components
      const sectionItems = itemsForSection(s, answer);
      if (sectionItems.length === 0) continue; // no selection → NO row

      const { data: comp, error: cErr } = await supabase.from("event_components").insert({
        booking_id: b.id, domain: "food", kind: s.key, title: s.title, position: pos++,
      }).select("id").single();
      if (cErr || !comp) return { ...zero, detail: `Insert failed on #${b.invoice_num}: ${cErr?.message ?? "unknown"} — run v164 SQL first.`, backfilled, components, items };

      const { error: iErr } = await supabase.from("component_items").insert(
        sectionItems.map((it, i) => ({
          component_id: comp.id, name: it.name, quantity: it.quantity, position: i,
        })));
      if (iErr) return { ...zero, detail: `Item insert failed on #${b.invoice_num}: ${iErr.message}`, backfilled, components, items };
      components++; items += sectionItems.length;
    }
    backfilled++;
  }

  return { ok: true, scanned: withMenus.length, skipped_existing: existing.size, backfilled, components, items };
}
