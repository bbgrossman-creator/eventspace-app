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
import { scaffoldFor, seedVersionSections, copyVersionSections } from "./sections";
import { shouldStampPresentation, resolveTheme, builtInTheme, ThemeDelta } from "./publication";

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
  archived_at?: string | null; archived_reason?: string | null;
  // v225 PUBLICATION — the Version Override + the stamped artifact (§2/§3).
  theme_key?: string | null;
  theme_override?: unknown;
  presentation_snapshot?: unknown;
  presentation_stamped_at?: string | null;
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
  fromBlueprint?: { sourceVersionId: string; name: string },
  /** v221 — the answered archetype question. Blueprint and operational seeds
   *  carry their own structure and ignore it; absent = legacy scaffold. */
  archetypeSeed?: { key: string; label: string; sections: string[] } | null,
): Promise<Outcome> {
  const { data: p, error: pErr } = await supabase.from("proposals")
    .insert({ booking_id: booking.id, title: title.trim() || "Proposal" })
    .select("id").single();
  if (pErr || !p) return { ok: false, detail: pErr?.message ?? "insert failed — run v177 SQL" };
  const { data: v, error: vErr } = await supabase.from("proposal_versions")
    .insert({ proposal_id: p.id, version: 1 }).select("id").single();
  if (vErr || !v) return { ok: false, detail: vErr?.message ?? "version insert failed" };

  // The outline seed: the ANSWERED archetype when the question applied
  // (labels only — content never comes from a seed); otherwise the legacy
  // event-type scaffold.
  try {
    if (archetypeSeed && !fromBlueprint && !seedFromOperational) {
      const { ensureSectionTypeIds } = await import("./sections");
      await seedVersionSections(v.id, await ensureSectionTypeIds(archetypeSeed.sections));
    } else {
      const { data: bt } = await supabase.from("bookings").select("event_type").eq("id", booking.id).maybeSingle();
      const scaffold = await scaffoldFor((bt as { event_type: string | null } | null)?.event_type ?? null);
      await seedVersionSections(v.id, scaffold);
    }
  } catch { /* pre-v181 DB — proposals still work, unsectioned */ }
  if (fromBlueprint) {
    // Blueprint seed: instantiate the source version's components (lineage,
    // sections, amber prices) via the studio copy machinery.
    const { applyBlueprintSeed } = await import("./blueprints");
    const r = await applyBlueprintSeed(booking, v.id, fromBlueprint.sourceVersionId, fromBlueprint.name);
    if (!r.ok) return { ok: false, detail: r.detail };
  } else if (seedFromOperational) {
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
    `🎨 "${title.trim() || "Proposal"}" v1${seedFromOperational ? " seeded from event components"
      : archetypeSeed && !fromBlueprint ? ` (${archetypeSeed.label} outline)` : ""}`);
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
    .insert({ proposal_id: proposal.id, version: nextN,
      // v225: the Version Override TRAVELS with version copies (§2); the
      // SNAPSHOT never does — a new draft has no send history.
      theme_key: fromVersion.theme_key ?? null,
      theme_override: fromVersion.theme_override ?? null,
    }).select("id").single();
  if (vErr || !v) return { ok: false, detail: vErr?.message ?? "version insert failed" };
  const copied = await copyComponentsBetween(booking.id, fromVersion.id, v.id);
  if (!copied.ok) return copied;
  try { await copyVersionSections(fromVersion.id, v.id); } catch { /* pre-v181 DB */ }
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

/** v220 — a genuinely EMPTY version: the row and nothing else. No sections,
 *  no components, no items, no carried guests or adjustments. Provenance is
 *  explicit in the activity log: "(started blank)". */
export async function createBlankVersion(
  booking: { id: string; invoice_num: string },
  proposal: Proposal,
): Promise<Outcome> {
  const { data: maxRow } = await supabase.from("proposal_versions")
    .select("version").eq("proposal_id", proposal.id)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  const nextN = ((maxRow as { version: number } | null)?.version ?? 0) + 1;
  const { data: v, error } = await supabase.from("proposal_versions")
    .insert({ proposal_id: proposal.id, version: nextN }).select("id").single();
  if (error || !v) return { ok: false, detail: error?.message ?? "version insert failed" };
  await logActivity(booking.id, booking.invoice_num, "Proposal Version Created",
    `🎨 ${proposal.title} v${nextN} (started blank)`);
  return { ok: true, id: v.id };
}

/** Copy all components (+items +requirements) within one booking, from one
 *  version (or the operational set when fromVersionId is null) to another.
 *  copied_from PASSES THROUGH — see header. */
async function copyComponentsBetween(
  bookingId: string, fromVersionId: string | null, toVersionId: string,
): Promise<Outcome> {
  let q = supabase.from("event_components")
    .select("id,domain,kind,title,position,copied_from,notes,section_type_id,pricing_mode,package_price,package_basis,package_taxable,package_cost,customer_description,group_label,group_position,group_description,proposal_display,item_categories,item_layout,uncategorized_position,definition_id")
    .eq("booking_id", bookingId).order("position");
  q = fromVersionId ? q.eq("proposal_version_id", fromVersionId) : q.is("proposal_version_id", null);
  const { data: srcRows, error } = await q;
  if (error) return { ok: false, detail: error.message };
  const sources = (srcRows ?? []) as { id: string; domain: string; kind: string | null; title: string; position: number; copied_from: string | null; notes: string | null; section_type_id?: string | null; pricing_mode?: string; package_price?: number | null; package_basis?: string | null; package_taxable?: boolean | null; package_cost?: number | null; customer_description?: string | null; group_label?: string | null; group_position?: number; group_description?: string | null; proposal_display?: string | null; item_categories?: unknown; item_layout?: string | null; uncategorized_position?: string | null; definition_id?: string | null }[];
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
      definition_id: src.definition_id ?? null,   // identity travels — a renamed instance keeps its noun
      notes: src.notes,
      section_type_id: src.section_type_id ?? null,   // section knowledge travels
      pricing_mode: src.pricing_mode ?? "itemized",
      package_price: src.package_price ?? null,
      package_basis: src.package_basis ?? "flat",
      package_taxable: src.package_taxable ?? true,
      package_cost: src.package_cost ?? null,
      customer_description: src.customer_description ?? null,
      proposal_display: src.proposal_display ?? null,   // presentation mode travels
      // Component-local categories travel verbatim — keys stay valid because
      // they only ever mean anything inside this component. No remapping.
      item_categories: src.item_categories ?? [],
      item_layout: src.item_layout ?? "vertical",
      uncategorized_position: src.uncategorized_position ?? "bottom",
      // Groups are inherited structure — the proven arrangement travels.
      group_label: src.group_label ?? null,
      group_position: src.group_position ?? 0,
      group_description: src.group_description ?? null,
      // carried package prices arrive unconfirmed, same rule as items
      package_price_confirmed: src.package_price == null,
    }).select("id").single();
    if (cErr || !nc) return { ok: false, detail: `"${src.title}": ${cErr?.message ?? "unknown"}` };
    const its = ((items.data ?? []) as { component_id: string; name: string; description: string | null; quantity: number | null; quantity_basis: string | null; unit_price: number | null; taxable?: boolean | null; catalog_item_id?: string | null; applies_to_category_id?: string | null; presentation_note?: string | null; category_key?: string | null; item_role?: string | null; selected?: boolean | null; show_on_proposal?: boolean | null }[])
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
        presentation_note: i.presentation_note ?? null,  // presentation copy travels
        category_key: i.category_key ?? null,            // grouping travels
        show_on_proposal: i.show_on_proposal ?? true,    // visibility travels
        item_role: i.item_role ?? "included",
        selected: i.selected ?? true,
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
/** v225b — THE SEND CEREMONY. Sending is an ACT, and the act is what
 *  stamps: every explicit send takes a fresh snapshot of the resolved
 *  presentation actually sent and logs it — INCLUDING re-sending an
 *  already-sent version (sent → Send → sent). Approval elsewhere locks the
 *  last stamp forever. This is the ONE door for the send act; the UI routes
 *  every "send" through here. */
export async function sendVersion(
  booking: { id: string; invoice_num: string },
  proposal: Proposal,
  v: ProposalVersion,
): Promise<Outcome> {
  if (v.status === "approved") return { ok: false, detail: "Approved versions are immutable — create a new version instead." };
  const resend = v.status === "sent";
  const named = builtInTheme((v.theme_key as string | null) ?? null);
  const resolved = resolveTheme(null /* brand: v226 */, named, (v.theme_override as ThemeDelta | null) ?? null);
  const patch: Record<string, unknown> = {
    status: "sent",
    presentation_snapshot: resolved.theme,
    presentation_stamped_at: new Date().toISOString(),
  };
  if (!v.sent_at) patch.sent_at = new Date().toISOString();
  const { error } = await supabase.from("proposal_versions").update(patch).eq("id", v.id);
  if (error) return { ok: false, detail: error.message };
  await logActivity(booking.id, booking.invoice_num, resend ? "Proposal Re-sent" : "Proposal Sent",
    `📤 ${proposal.title} v${v.version}${resend ? " re-sent" : " sent"}`);
  await logActivity(booking.id, booking.invoice_num, "Presentation Stamped",
    `🎨 v${v.version} presentation stamped${resend ? " (re-send — fresh snapshot)" : " as sent"}`);
  return { ok: true, id: v.id };
}

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
  // v225b: the SEND ACT lives in sendVersion() and always stamps. This
  // transition-based stamp remains as the safety net for programmatic
  // status writes that bypass the ceremony — it fires only on transitions
  // INTO "sent"; editing alone never stamps; approval locks the last stamp.
  if (shouldStampPresentation(v.status, status)) {
    const named = builtInTheme((v.theme_key as string | null) ?? null);
    const resolved = resolveTheme(null /* brand: v226 */, named, (v.theme_override as ThemeDelta | null) ?? null);
    patch.presentation_snapshot = resolved.theme;
    patch.presentation_stamped_at = new Date().toISOString();
  }
  if (status === "approved") { patch.approved_at = new Date().toISOString(); patch.approved_by = approvedBy ?? null; }
  const { error } = await supabase.from("proposal_versions").update(patch).eq("id", v.id);
  if (error) return { ok: false, detail: error.message };
  if (patch.presentation_snapshot) {
    await logActivity(booking.id, booking.invoice_num, "Presentation Stamped",
      `🎨 v${v.version} presentation stamped as sent`);
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// v186 — Archive & delete. Archive retracts from knowledge (reversible);
// permanent delete is admin-only, blocked when the version is referenced.
// ═══════════════════════════════════════════════════════════════════════════
export interface DeleteGuard { canDelete: boolean; reasons: string[]; }

/** Why a version may NOT be hard-deleted: blueprint source, generated invoice
 *  lines, or being the won version of its proposal. */
export async function deleteBlockers(v: ProposalVersion, proposal: Proposal): Promise<DeleteGuard> {
  const reasons: string[] = [];
  const [{ data: bp }, { data: ch }] = await Promise.all([
    supabase.from("blueprints").select("name").eq("source_version_id", v.id).eq("active", true),
    supabase.from("charges").select("id", { count: "exact", head: true }).eq("source_proposal_version_id", v.id),
  ]);
  for (const b of (bp ?? []) as { name: string }[]) reasons.push(`Blueprint: "${b.name}"`);
  if ((ch as unknown as { count?: number })?.count) reasons.push("Has generated invoice lines");
  if (proposal.won_version_id === v.id) reasons.push("Accepted (won) version of this proposal");
  return { canDelete: reasons.length === 0, reasons };
}

export async function archiveVersion(
  booking: { id: string; invoice_num: string },
  v: ProposalVersion, reason: string,
): Promise<Outcome> {
  const { error } = await supabase.from("proposal_versions")
    .update({ archived_at: new Date().toISOString(), archived_reason: reason || null }).eq("id", v.id);
  if (error) return { ok: false, detail: error.message };
  await logActivity(booking.id, booking.invoice_num, "Proposal Version Archived",
    `🗄 v${v.version} archived — retracted from pricing memory & knowledge${reason ? ` (${reason})` : ""}`);
  return { ok: true };
}

export async function restoreVersion(
  booking: { id: string; invoice_num: string }, v: ProposalVersion,
): Promise<Outcome> {
  const { error } = await supabase.from("proposal_versions")
    .update({ archived_at: null, archived_reason: null }).eq("id", v.id);
  if (error) return { ok: false, detail: error.message };
  await logActivity(booking.id, booking.invoice_num, "Proposal Version Restored",
    `♻️ v${v.version} restored — eligible for knowledge again`);
  return { ok: true };
}

/** Admin-only hard delete. Caller must confirm role AND pass deleteBlockers. */
export async function deleteVersionPermanently(
  booking: { id: string; invoice_num: string },
  v: ProposalVersion, proposal: Proposal,
): Promise<Outcome> {
  const guard = await deleteBlockers(v, proposal);
  if (!guard.canDelete) return { ok: false, detail: `Cannot delete — referenced by: ${guard.reasons.join("; ")}` };
  // Components of this version cascade via FK (proposal_version_id on delete
  // cascade); version_guests / version_sections / version_adjustments too.
  const { error } = await supabase.from("proposal_versions").delete().eq("id", v.id);
  if (error) return { ok: false, detail: error.message };
  await logActivity(booking.id, booking.invoice_num, "Proposal Version Deleted",
    `🗑 v${v.version} permanently deleted`);
  return { ok: true };
}
