// ═══════════════════════════════════════════════════════════════════════════
// PROPOSALS (v177) — the data spine of Proposal Studio.
//
// Three state dimensions, never collapsed:
//   opportunity stage  → bookings.status          (the pipeline)
//   proposal outcome   → proposals.status          open | won | lost | archived
//   version lifecycle  → proposal_versions.status  draft → internal_review →
//                        sent → revision_requested → approved
//
// Immutability rule (app-enforced): an APPROVED version is never edited.
// Post-approval changes = createVersion() from it, producing v(N+1) draft.
//
// PROVENANCE PASSTHROUGH: when a new version copies the previous version's
// components, copied_from carries the ORIGINAL external source through —
// it never points at the sibling version's rows. Otherwise every internal
// v1→v2 bump would inflate the Rolodex's "reused ×N" confidence signal.
// Reuse counts measure cross-event reuse, not editing churn.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase, logActivity } from "./supabase";

export type ProposalStatus = "open" | "won" | "lost" | "archived";
export type VersionStatus = "draft" | "internal_review" | "sent" | "revision_requested" | "approved";

export interface Proposal {
  id: string; booking_id: string; title: string;
  status: ProposalStatus; won_version_id: string | null;
  created_at: string; updated_at: string;
}
export interface ProposalVersion {
  id: string; proposal_id: string; version: number;
  status: VersionStatus; notes: string | null;
  sent_at: string | null; approved_at: string | null; approved_by: string | null;
  created_at: string;
}

export const VERSION_FLOW: { value: VersionStatus; label: string; color: string }[] = [
  { value: "draft", label: "Draft", color: "#F1F5F9" },
  { value: "internal_review", label: "Internal Review", color: "#FEF3C7" },
  { value: "sent", label: "Sent", color: "#DBEAFE" },
  { value: "revision_requested", label: "Revision Requested", color: "#FCE7F3" },
  { value: "approved", label: "Approved", color: "#DCFCE7" },
];
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, { label: string; color: string }> = {
  open: { label: "Open", color: "#DBEAFE" },
  won: { label: "Won", color: "#DCFCE7" },
  lost: { label: "Lost", color: "#F1F5F9" },
  archived: { label: "Archived", color: "#E5E7EB" },
};

export interface Outcome { ok: boolean; detail?: string; id?: string; }

/** Create a proposal + its v1. If seedFromOperational, v1 starts as a copy of
 *  the event's current operational components (proposal_version_id IS NULL). */
export async function createProposal(
  booking: { id: string; invoice_num: string },
  title: string,
  seedFromOperational: boolean,
): Promise<Outcome> {
  const { data: p, error: pErr } = await supabase.from("proposals")
    .insert({ booking_id: booking.id, title: title.trim() || "Proposal" })
    .select("id").single();
  if (pErr || !p) return { ok: false, detail: pErr?.message ?? "insert failed — run v177 SQL" };
  const { data: v, error: vErr } = await supabase.from("proposal_versions")
    .insert({ proposal_id: p.id, version: 1 }).select("id").single();
  if (vErr || !v) return { ok: false, detail: vErr?.message ?? "version insert failed" };

  if (seedFromOperational) {
    const copied = await copyComponentsBetween(booking.id, null, v.id);
    if (!copied.ok) return copied;
  }
  // Seed v1 guest counts: booking's estimate lands in the first category
  // (typically Adults); the version owns the numbers from here on.
  const { data: cats } = await supabase.from("guest_categories")
    .select("id").eq("active", true).order("position").limit(1);
  const firstCat = ((cats ?? []) as { id: string }[])[0];
  const { data: bk } = await supabase.from("bookings").select("est_guests").eq("id", booking.id).maybeSingle();
  const est = (bk as { est_guests: number | null } | null)?.est_guests ?? 0;
  if (firstCat && est > 0) {
    await supabase.from("version_guests").insert({ version_id: v.id, category_id: firstCat.id, count: est });
  }
  await logActivity(booking.id, booking.invoice_num, "Proposal Created",
    `🎨 "${title.trim() || "Proposal"}" v1${seedFromOperational ? " seeded from event components" : ""}`);
  return { ok: true, id: p.id };
}

/** New version = copy of a source version's components, status draft.
 *  This is the ONLY path for changing an approved proposal. */
export async function createVersion(
  booking: { id: string; invoice_num: string },
  proposal: Proposal,
  fromVersion: ProposalVersion,
): Promise<Outcome> {
  const { data: maxRow } = await supabase.from("proposal_versions")
    .select("version").eq("proposal_id", proposal.id)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  const nextN = ((maxRow as { version: number } | null)?.version ?? 0) + 1;
  const { data: v, error: vErr } = await supabase.from("proposal_versions")
    .insert({ proposal_id: proposal.id, version: nextN }).select("id").single();
  if (vErr || !v) return { ok: false, detail: vErr?.message ?? "version insert failed" };
  const copied = await copyComponentsBetween(booking.id, fromVersion.id, v.id);
  if (!copied.ok) return copied;
  // Guests + adjustments travel version→version (each version owns its own).
  const [{ data: g }, { data: adj }] = await Promise.all([
    supabase.from("version_guests").select("category_id,count").eq("version_id", fromVersion.id),
    supabase.from("version_adjustments").select("label,kind,value,taxable,position").eq("version_id", fromVersion.id),
  ]);
  const gRows = (g ?? []) as { category_id: string; count: number }[];
  if (gRows.length) await supabase.from("version_guests").insert(gRows.map((x) => ({ ...x, version_id: v.id })));
  const aRows = (adj ?? []) as { label: string; kind: string; value: number; taxable: boolean; position: number }[];
  if (aRows.length) await supabase.from("version_adjustments").insert(aRows.map((x) => ({ ...x, version_id: v.id })));
  await logActivity(booking.id, booking.invoice_num, "Proposal Version Created",
    `🎨 ${proposal.title} v${nextN} (from v${fromVersion.version})`);
  return { ok: true, id: v.id };
}

/** Copy all components (+items +requirements) within one booking, from one
 *  version (or the operational set when fromVersionId is null) to another.
 *  copied_from PASSES THROUGH — see header. */
async function copyComponentsBetween(
  bookingId: string, fromVersionId: string | null, toVersionId: string,
): Promise<Outcome> {
  let q = supabase.from("event_components")
    .select("id,domain,kind,title,position,copied_from,notes")
    .eq("booking_id", bookingId).order("position");
  q = fromVersionId ? q.eq("proposal_version_id", fromVersionId) : q.is("proposal_version_id", null);
  const { data: srcRows, error } = await q;
  if (error) return { ok: false, detail: error.message };
  const sources = (srcRows ?? []) as { id: string; domain: string; kind: string | null; title: string; position: number; copied_from: string | null; notes: string | null }[];
  if (!sources.length) return { ok: true };

  const ids = sources.map((s) => s.id);
  const [items, reqs] = await Promise.all([
    supabase.from("component_items").select("*").in("component_id", ids).order("position"),
    supabase.from("component_requirements").select("component_id,name,category,notes").in("component_id", ids),
  ]);

  for (const src of sources) {
    const { data: nc, error: cErr } = await supabase.from("event_components").insert({
      booking_id: bookingId, proposal_version_id: toVersionId,
      domain: src.domain, kind: src.kind, title: src.title, position: src.position,
      copied_from: src.copied_from,   // ← passthrough, NOT src.id
      notes: src.notes,
    }).select("id").single();
    if (cErr || !nc) return { ok: false, detail: `"${src.title}": ${cErr?.message ?? "unknown"}` };
    const its = ((items.data ?? []) as { component_id: string; name: string; description: string | null; quantity: number | null; quantity_basis: string | null; unit_price: number | null; taxable?: boolean | null; catalog_item_id?: string | null; applies_to_category_id?: string | null }[])
      .filter((i) => i.component_id === src.id);
    if (its.length) {
      const { error: iErr } = await supabase.from("component_items").insert(its.map((i, idx) => ({
        component_id: nc.id, name: i.name, description: i.description,
        quantity: i.quantity, quantity_basis: i.quantity_basis,
        // v178 §3: prices TRAVEL on copy — but arrive UNCONFIRMED, rendered
        // amber until a salesperson accepts or edits them. A proposal can't
        // reach Sent wearing last May's numbers without each being waved
        // through. (price_confirmed only meaningful when a price exists.)
        unit_price: i.unit_price,
        price_confirmed: i.unit_price == null ? true : false,
        taxable: i.taxable ?? true,
        catalog_item_id: i.catalog_item_id ?? null,
        applies_to_category_id: i.applies_to_category_id ?? null,
        pricing_reason: null,        // reasons are per-decision, never copied
        position: idx,
      })));
      if (iErr) return { ok: false, detail: `"${src.title}" items: ${iErr.message}` };
    }
    const rs = ((reqs.data ?? []) as { component_id: string; name: string; category: string | null; notes: string | null }[])
      .filter((r) => r.component_id === src.id);
    if (rs.length) {
      await supabase.from("component_requirements").insert(rs.map((r) => ({
        component_id: nc.id, name: r.name, category: r.category, notes: r.notes,
      })));
    }
  }
  return { ok: true };
}

/** Version lifecycle transitions. Approved is terminal + immutable; approving
 *  also marks the proposal won and records WHICH version won. */
export async function setVersionStatus(
  booking: { id: string; invoice_num: string },
  proposal: Proposal,
  v: ProposalVersion,
  status: VersionStatus,
  approvedBy?: string,
): Promise<Outcome> {
  if (v.status === "approved") return { ok: false, detail: "Approved versions are immutable — create a new version instead." };
  const patch: Record<string, unknown> = { status };
  if (status === "sent" && !v.sent_at) patch.sent_at = new Date().toISOString();
  if (status === "approved") { patch.approved_at = new Date().toISOString(); patch.approved_by = approvedBy ?? null; }
  const { error } = await supabase.from("proposal_versions").update(patch).eq("id", v.id);
  if (error) return { ok: false, detail: error.message };
  if (status === "approved") {
    await supabase.from("proposals").update({
      status: "won", won_version_id: v.id, updated_at: new Date().toISOString(),
    }).eq("id", proposal.id);
    await logActivity(booking.id, booking.invoice_num, "Proposal Approved",
      `✅ ${proposal.title} v${v.version} approved${approvedBy ? ` by ${approvedBy}` : ""} — locked; further changes need a new version.`);
  }
  return { ok: true };
}

/** Proposal outcome (lost/archived/reopen). Won only happens via approval. */
export async function setProposalStatus(
  booking: { id: string; invoice_num: string },
  proposal: Proposal,
  status: Exclude<ProposalStatus, "won">,
): Promise<Outcome> {
  const { error } = await supabase.from("proposals")
    .update({ status, updated_at: new Date().toISOString() }).eq("id", proposal.id);
  if (error) return { ok: false, detail: error.message };
  await logActivity(booking.id, booking.invoice_num, "Proposal Status",
    `${status === "lost" ? "🚫" : status === "archived" ? "🗄" : "↩️"} ${proposal.title} → ${status}`);
  return { ok: true };
}
