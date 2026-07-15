// ═══════════════════════════════════════════════════════════════════════════
// COPY COMPONENTS (Knowledge Architecture steps 4/6 — shared logic)
// Copies components (with provenance) from anywhere to a destination booking.
// Used by the Rolodex's Copy mode; same semantics as the booking-page dialog.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase, logActivity } from "./supabase";

export interface CopyOptions {
  quantities: boolean;
  pricing: boolean;
  notes: boolean;
  requirements: boolean;
  /** When set, copies land INSIDE this proposal version instead of the
   *  destination's operational set. Cross-event provenance is real here
   *  (copied_from = source component — this IS reuse), and carried prices
   *  arrive price_confirmed=false per pricing doctrine §3: they travel,
   *  amber, until a salesperson waves each one through. */
  proposalVersionId?: string;
}

export interface CopyOutcome { ok: boolean; detail?: string; copied: number; }

interface SrcComp { id: string; booking_id: string; domain: string; kind: string | null; title: string; notes: string | null;
  customer_description: string | null; item_categories: unknown; item_layout: string | null; uncategorized_position: string | null; }
interface SrcItem { id: string; component_id: string; name: string; description: string | null; quantity: number | null; quantity_basis: string | null; unit_price: number | null;
  category_key: string | null; presentation_note: string | null; show_on_proposal: boolean | null; item_role: string | null; }
interface SrcReq { component_id: string; name: string; category: string | null; notes: string | null; }

export async function copyComponentsTo(
  dest: { id: string; invoice_num: string },
  srcComponentIds: string[],
  opts: CopyOptions,
  sourceLabel?: string,
): Promise<CopyOutcome> {
  if (!srcComponentIds.length) return { ok: true, copied: 0 };

  const [{ data: srcRows, error: sErr }, { count }] = await Promise.all([
    supabase.from("event_components").select("id,booking_id,domain,kind,title,notes,customer_description,item_categories,item_layout,uncategorized_position").in("id", srcComponentIds),
    opts.proposalVersionId
      ? supabase.from("event_components").select("id", { count: "exact", head: true }).eq("proposal_version_id", opts.proposalVersionId)
      : supabase.from("event_components").select("id", { count: "exact", head: true }).eq("booking_id", dest.id).is("proposal_version_id", null),
  ]);
  if (sErr) return { ok: false, detail: sErr.message, copied: 0 };
  const sources = (srcRows ?? []) as SrcComp[];
  let pos = count ?? 0;

  const [items, reqs] = await Promise.all([
    supabase.from("component_items").select("*").in("component_id", srcComponentIds).order("position"),
    opts.requirements
      ? supabase.from("component_requirements").select("component_id,name,category,notes").in("component_id", srcComponentIds)
      : Promise.resolve({ data: [] as SrcReq[] }),
  ]);

  let copied = 0;
  for (const src of sources) {
    const { data: nc, error: cErr } = await supabase.from("event_components").insert({
      booking_id: dest.id, domain: src.domain, kind: src.kind, title: src.title,
      position: pos++, copied_from: src.id,
      proposal_version_id: opts.proposalVersionId ?? null,
      notes: opts.notes ? src.notes : null,
      // ── COMPONENT KNOWLEDGE — travels unconditionally ──
      // This is what Sushi Station *is*: how it organises and describes itself.
      // The Rolodex is a knowledge library; a component copied out of it that
      // arrived structureless would have to be rebuilt every single time.
      // Keys are component-local, so item_categories copies verbatim — no remap.
      customer_description: src.customer_description ?? null,
      item_categories: src.item_categories ?? [],
      item_layout: src.item_layout ?? "vertical",
      uncategorized_position: src.uncategorized_position ?? "bottom",
      // ── PROPOSAL STYLING — deliberately NOT copied ──
      // proposal_display: how much *this* proposal reveals is this proposal's
      // decision, not the component's. Falls to its default.
    }).select("id").single();
    if (cErr || !nc) return { ok: false, detail: `"${src.title}": ${cErr?.message ?? "unknown"}`, copied };

    const its = ((items.data ?? []) as SrcItem[]).filter((i) => i.component_id === src.id);
    if (its.length) {
      const { error: iErr } = await supabase.from("component_items").insert(its.map((i, idx) => ({
        component_id: nc.id, name: i.name,
        description: opts.notes ? i.description : null,
        quantity: opts.quantities ? i.quantity : null,
        quantity_basis: opts.quantities ? i.quantity_basis : null,
        unit_price: opts.pricing ? i.unit_price : null,
        price_confirmed: opts.proposalVersionId && opts.pricing && i.unit_price != null ? false : true,
        // ── KNOWLEDGE ── how this item is grouped, described and whether it is
        // customer-facing at all are intrinsic to the component. Soy sauce is a
        // production supply on every Sushi Station ever built, not just this one.
        category_key: i.category_key ?? null,
        presentation_note: i.presentation_note ?? null,
        show_on_proposal: i.show_on_proposal ?? true,
        item_role: i.item_role ?? "included",
        // ── STYLING ── an upgrade arrives unchosen: whether THIS client takes
        // the Edamame is not inherited from the last client who did.
        selected: (i.item_role ?? "included") === "optional" ? false : true,
        position: idx,
      })));
      if (iErr) return { ok: false, detail: `"${src.title}" items: ${iErr.message}`, copied };
    }
    const rqs = ((reqs.data ?? []) as SrcReq[]).filter((r) => r.component_id === src.id);
    if (rqs.length) {
      await supabase.from("component_requirements").insert(rqs.map((r) => ({
        component_id: nc.id, name: r.name, category: r.category, notes: r.notes,
      })));
    }
    copied++;
  }
  await logActivity(dest.id, dest.invoice_num, "Components Copied",
    `↺ ${copied} component${copied === 1 ? "" : "s"}${sourceLabel ? ` from ${sourceLabel}` : ""}${opts.proposalVersionId ? " into proposal" : " via Rolodex"}${opts.pricing ? " incl. pricing" : ""}`);
  return { ok: true, copied };
}
