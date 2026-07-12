// ═══════════════════════════════════════════════════════════════════════════
// STUDIO LIBRARY (v179) — the knowledge-driven proposal builder's data layer.
//
// Event-first: the browsing unit is a past successful event, not a component.
// "Give me what worked for Goldberg" retrieves a proven combination — the
// cocktail hour that worked WITH that dinner AT that guest count — where a
// parts search throws the gestalt away.
//
// Copies into a version carry prices UNCONFIRMED (design v2 §3) and set
// copied_from to the true source (cross-event provenance → lineage price
// memory works; Rolodex reuse counts stay honest since they count
// operational rows only).
// ═══════════════════════════════════════════════════════════════════════════
import { supabase, logActivity } from "./supabase";
import { Booking } from "./workflow";

export interface SourceEvent {
  booking: Booking;
  revenue: number | null;      // charges total, computed by caller when shown
  componentCount: number;
}
export interface SourceComponent {
  id: string; domain: string; kind: string | null; title: string; notes: string | null;
  items: { id: string; name: string; unit_price: number | null; quantity_basis: string | null }[];
  coverUrl?: string;
}

/** Similar events: same event_type first, nearest guest count, newest first.
 *  Falls back to recent events with components when type yields little. */
export async function loadSimilarEvents(current: Booking, limit = 6): Promise<Booking[]> {
  const { data: compRows } = await supabase.from("event_components")
    .select("booking_id").is("proposal_version_id", null);
  const withComps = Array.from(new Set(((compRows ?? []) as { booking_id: string }[]).map((r) => r.booking_id)))
    .filter((id) => id !== current.id);
  if (!withComps.length) return [];
  const { data: evs } = await supabase.from("bookings").select("*")
    .in("id", withComps).neq("status", "cancelled");
  const rows = ((evs ?? []) as Booking[]);
  const guests = current.est_guests ?? 0;
  const score = (b: Booking) => {
    const typeMatch = current.event_type && b.event_type === current.event_type ? 0 : 1;
    const guestGap = guests > 0 && b.est_guests ? Math.abs(b.est_guests - guests) : 999;
    return typeMatch * 100000 + guestGap;
  };
  rows.sort((a, z) => score(a) - score(z) || (z.event_date ?? "").localeCompare(a.event_date ?? ""));
  return rows.slice(0, limit);
}

export async function loadRecentEvents(currentBookingId: string, limit = 8): Promise<Booking[]> {
  const { data: compRows } = await supabase.from("event_components")
    .select("booking_id").is("proposal_version_id", null);
  const ids = Array.from(new Set(((compRows ?? []) as { booking_id: string }[]).map((r) => r.booking_id)))
    .filter((id) => id !== currentBookingId);
  if (!ids.length) return [];
  const { data } = await supabase.from("bookings").select("*").in("id", ids)
    .neq("status", "cancelled").order("event_date", { ascending: false }).limit(limit);
  return (data ?? []) as Booking[];
}

/** An event's operational components with items + cover photos (signed). */
export async function loadSourceComponents(bookingId: string): Promise<SourceComponent[]> {
  const { data: cs } = await supabase.from("event_components")
    .select("id,domain,kind,title,notes").eq("booking_id", bookingId)
    .is("proposal_version_id", null).order("position");
  const comps = (cs ?? []) as SourceComponent[];
  if (!comps.length) return [];
  const ids = comps.map((c) => c.id);
  const [{ data: its }, { data: ph }] = await Promise.all([
    supabase.from("component_items").select("id,component_id,name,unit_price,quantity_basis").in("component_id", ids).order("position"),
    supabase.from("photos").select("file_id,component_id").in("component_id", ids).eq("is_cover", true),
  ]);
  const itemRows = (its ?? []) as { id: string; component_id: string; name: string; unit_price: number | null; quantity_basis: string | null }[];
  for (const c of comps) c.items = itemRows.filter((i) => i.component_id === c.id);
  const phRows = (ph ?? []) as { file_id: string; component_id: string | null }[];
  if (phRows.length) {
    const { data: frs } = await supabase.from("booking_files").select("id,path").in("id", phRows.map((p) => p.file_id));
    const pathBy: Record<string, string> = {};
    for (const f of (frs ?? []) as { id: string; path: string }[]) pathBy[f.id] = f.path;
    await Promise.all(phRows.map(async (p) => {
      const path = pathBy[p.file_id]; if (!path || !p.component_id) return;
      const { data: sg } = await supabase.storage.from("booking-files").createSignedUrl(path, 3600);
      const c = comps.find((x) => x.id === p.component_id);
      if (c && sg?.signedUrl) c.coverUrl = sg.signedUrl;
    }));
  }
  return comps;
}

/** Copy source components into a proposal version. Prices carry, arriving
 *  UNCONFIRMED; provenance points at the true source. Returns new count. */
export async function copyIntoVersion(
  booking: { id: string; invoice_num: string },
  versionId: string,
  srcComponentIds: string[],
  sourceLabel: string,
): Promise<{ ok: boolean; detail?: string; copied: number }> {
  if (!srcComponentIds.length) return { ok: true, copied: 0 };
  const { count } = await supabase.from("event_components")
    .select("id", { count: "exact", head: true }).eq("proposal_version_id", versionId);
  let pos = count ?? 0;
  const { data: srcRows, error } = await supabase.from("event_components")
    .select("id,domain,kind,title,notes,section_type_id,pricing_mode,package_price,package_basis,package_taxable,package_cost,customer_description,group_label,group_position,group_description").in("id", srcComponentIds);
  if (error) return { ok: false, detail: error.message, copied: 0 };
  const [{ data: its }, { data: rqs }] = await Promise.all([
    supabase.from("component_items").select("*").in("component_id", srcComponentIds).order("position"),
    supabase.from("component_requirements").select("component_id,name,category,notes").in("component_id", srcComponentIds),
  ]);
  let copied = 0;
  for (const src of (srcRows ?? []) as { id: string; domain: string; kind: string | null; title: string; notes: string | null; section_type_id?: string | null; pricing_mode?: string; package_price?: number | null; package_basis?: string | null; package_taxable?: boolean | null; package_cost?: number | null; customer_description?: string | null; group_label?: string | null; group_position?: number; group_description?: string | null }[]) {
    const { data: nc, error: cErr } = await supabase.from("event_components").insert({
      booking_id: booking.id, proposal_version_id: versionId,
      domain: src.domain, kind: src.kind, title: src.title, notes: src.notes,
      position: pos++, copied_from: src.id,
      section_type_id: src.section_type_id ?? null,
      pricing_mode: src.pricing_mode ?? "itemized",
      package_price: src.package_price ?? null,
      package_basis: src.package_basis ?? "flat",
      package_taxable: src.package_taxable ?? true,
      package_cost: src.package_cost ?? null,
      customer_description: src.customer_description ?? null,
      group_label: src.group_label ?? null,
      group_position: src.group_position ?? 0,
      group_description: src.group_description ?? null,
      package_price_confirmed: src.package_price == null,
    }).select("id").single();
    if (cErr || !nc) return { ok: false, detail: `"${src.title}": ${cErr?.message ?? "?"}`, copied };
    const rows = ((its ?? []) as Record<string, unknown>[]).filter((i) => i.component_id === src.id);
    if (rows.length) {
      const { error: iErr } = await supabase.from("component_items").insert(rows.map((i, idx) => ({
        component_id: nc.id, name: i.name, description: i.description,
        quantity: i.quantity, quantity_basis: i.quantity_basis,
        unit_price: i.unit_price,
        price_confirmed: i.unit_price == null,     // carried prices arrive amber
        taxable: (i.taxable as boolean | null) ?? true,
        catalog_item_id: (i.catalog_item_id as string | null) ?? null,
        applies_to_category_id: (i.applies_to_category_id as string | null) ?? null,
        served_with: (i.served_with as string | null) ?? null,
        item_role: (i.item_role as string | null) ?? "included",
        selected: (i.selected as boolean | null) ?? true,
        position: idx,
      })));
      if (iErr) return { ok: false, detail: `"${src.title}" items: ${iErr.message}`, copied };
    }
    const reqs = ((rqs ?? []) as { component_id: string; name: string; category: string | null; notes: string | null }[])
      .filter((r) => r.component_id === src.id);
    if (reqs.length) await supabase.from("component_requirements").insert(
      reqs.map((r) => ({ component_id: nc.id, name: r.name, category: r.category, notes: r.notes })));
    copied++;
  }
  await logActivity(booking.id, booking.invoice_num, "Studio Copy",
    `🎨 ${copied} component${copied === 1 ? "" : "s"} from ${sourceLabel} → proposal`);
  return { ok: true, copied };
}

// ── Version comparison: the revision-call changelist ──
export interface VersionDiff {
  added: { title: string }[];
  removed: { title: string }[];
  changed: { title: string; detail: string }[];
  totalA: number; totalB: number;
}
interface DiffItem { name: string; unit_price: number | null; quantity: number | null; item_role?: string; selected?: boolean; }

export async function diffVersions(versionA: string, versionB: string,
  totalsFor: (versionId: string) => Promise<number>): Promise<VersionDiff> {
  async function snapshot(vid: string) {
    const { data: cs } = await supabase.from("event_components")
      .select("id,title,pricing_mode,package_price").eq("proposal_version_id", vid).order("position");
    const comps = (cs ?? []) as { id: string; title: string; pricing_mode?: string; package_price?: number | null }[];
    const map: Record<string, DiffItem[]> = {};
    const pkg: Record<string, number | null | undefined> = {};
    for (const c of comps) if (c.pricing_mode === "package") pkg[c.title] = c.package_price;
    if (comps.length) {
      const { data: its } = await supabase.from("component_items")
        .select("component_id,name,unit_price,quantity,item_role,selected")
        .in("component_id", comps.map((c) => c.id)).order("position");
      for (const c of comps) {
        map[c.title] = ((its ?? []) as (DiffItem & { component_id: string })[])
          .filter((i) => i.component_id === c.id);
      }
    }
    return { map, pkg };
  }
  const [snapA, snapB, totalA, totalB] = await Promise.all([
    snapshot(versionA), snapshot(versionB), totalsFor(versionA), totalsFor(versionB),
  ]);
  const a = snapA.map, b = snapB.map;
  const added: VersionDiff["added"] = [], removed: VersionDiff["removed"] = [], changed: VersionDiff["changed"] = [];
  for (const t of Object.keys(b)) if (!(t in a)) added.push({ title: t });
  for (const t of Object.keys(a)) if (!(t in b)) removed.push({ title: t });
  for (const t of Object.keys(b)) {
    if (!(t in a)) continue;
    const details: string[] = [];
    const aBy: Record<string, DiffItem> = {}; for (const i of a[t]) aBy[i.name] = i;
    const bBy: Record<string, DiffItem> = {}; for (const i of b[t]) bBy[i.name] = i;
    for (const n of Object.keys(bBy)) {
      if (!(n in aBy)) { details.push(`+ ${n}`); continue; }
      const x = aBy[n], y = bBy[n];
      if (x.unit_price !== y.unit_price) details.push(`${n}: $${x.unit_price ?? "—"} → $${y.unit_price ?? "—"}`);
      else if (x.quantity !== y.quantity) details.push(`${n}: qty ${x.quantity ?? "—"} → ${y.quantity ?? "—"}`);
      else if ((x.selected !== false) !== (y.selected !== false)) details.push(`${n}: ${y.selected === false ? "deselected" : "selected"}`);
    }
    for (const n of Object.keys(aBy)) if (!(n in bBy)) details.push(`− ${n}`);
    if (snapA.pkg[t] !== undefined || snapB.pkg[t] !== undefined) {
      if (snapA.pkg[t] !== snapB.pkg[t]) details.push(`Package: $${snapA.pkg[t] ?? "—"} → $${snapB.pkg[t] ?? "—"}`);
    }
    if (details.length) changed.push({ title: t, detail: details.join(" · ") });
  }
  return { added, removed, changed, totalA, totalB };
}

// ── Component Palette (v180) — the Rolodex's component dimension as a
// builder palette. DERIVED, never authored: distinct component titles from
// real operational events, grouped by domain, with usage counts and the most
// recent instance's items/photo. Adding from the palette instantiates the
// MOST RECENT REAL INSTANCE (freshest items + prices, true lineage) — the
// palette browses the abstraction; every add copies reality.
export interface PaletteEntry {
  title: string;
  domain: string;
  count: number;                    // times used across real events
  latestComponentId: string;        // the instance an add will copy
  latestBookingLabel: string;       // "Goldberg Wedding · May 2026"
  items: string[];                  // latest instance's item names (preview)
  coverUrl?: string;
}

export async function loadComponentPalette(): Promise<PaletteEntry[]> {
  const { data: cs } = await supabase.from("event_components")
    .select("id,title,domain,booking_id,created_at")
    .is("proposal_version_id", null)
    .order("created_at", { ascending: false }).limit(600);
  const rows = (cs ?? []) as { id: string; title: string; domain: string; booking_id: string; created_at: string }[];
  if (!rows.length) return [];

  // Group by normalized title; first row seen per group = latest instance.
  const groups: Record<string, PaletteEntry & { bookingId: string }> = {};
  const order: string[] = [];
  for (const r of rows) {
    const key = r.title.trim().toLowerCase();
    if (!key) continue;
    if (!groups[key]) {
      groups[key] = { title: r.title.trim(), domain: r.domain, count: 0,
        latestComponentId: r.id, latestBookingLabel: "", items: [], bookingId: r.booking_id };
      order.push(key);
    }
    groups[key].count++;
  }

  const latestIds = order.map((k) => groups[k].latestComponentId);
  const bookingIds = Array.from(new Set(order.map((k) => groups[k].bookingId)));
  const [{ data: its }, { data: bks }, { data: ph }] = await Promise.all([
    supabase.from("component_items").select("component_id,name").in("component_id", latestIds).order("position"),
    supabase.from("bookings").select("id,contact_name,event_type,event_date").in("id", bookingIds),
    supabase.from("photos").select("file_id,component_id").in("component_id", latestIds).eq("is_cover", true),
  ]);
  const bMap: Record<string, string> = {};
  for (const b of (bks ?? []) as { id: string; contact_name: string; event_type: string | null; event_date: string | null }[]) {
    const when = b.event_date ? new Date(b.event_date).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "";
    bMap[b.id] = `${b.contact_name}${b.event_type ? ` ${b.event_type}` : ""}${when ? ` · ${when}` : ""}`;
  }
  const itemsBy: Record<string, string[]> = {};
  for (const i of (its ?? []) as { component_id: string; name: string }[]) {
    (itemsBy[i.component_id] ??= []).push(i.name);
  }
  const phRows = (ph ?? []) as { file_id: string; component_id: string | null }[];
  const coverBy: Record<string, string> = {};
  if (phRows.length) {
    const { data: frs } = await supabase.from("booking_files").select("id,path").in("id", phRows.map((p) => p.file_id));
    const pathBy: Record<string, string> = {};
    for (const f of (frs ?? []) as { id: string; path: string }[]) pathBy[f.id] = f.path;
    await Promise.all(phRows.map(async (p) => {
      const path = pathBy[p.file_id]; if (!path || !p.component_id) return;
      const { data: sg } = await supabase.storage.from("booking-files").createSignedUrl(path, 3600);
      if (sg?.signedUrl) coverBy[p.component_id] = sg.signedUrl;
    }));
  }

  const out: PaletteEntry[] = order.map((k) => {
    const g = groups[k];
    return {
      title: g.title, domain: g.domain, count: g.count,
      latestComponentId: g.latestComponentId,
      latestBookingLabel: bMap[g.bookingId] ?? "",
      items: itemsBy[g.latestComponentId] ?? [],
      coverUrl: coverBy[g.latestComponentId],
    };
  });
  // Most-used first within each domain; caller groups by domain.
  out.sort((a, z) => a.domain.localeCompare(z.domain) || z.count - a.count || a.title.localeCompare(z.title));
  return out;
}

// ── Proposal Sources (v187) — borrow from prior commercial thinking ──
// The fourth knowledge source: past proposals (won, sent, draft, lost),
// distinct from Events (operational reality). Closes the loop where v186
// made proposal history authoritative but not yet reusable.
//
// Rules: exclude the CURRENT proposal's entire version chain (copying v1→v3
// of the same proposal blurs lineage — New Version handles that). Exclude
// archived versions (retracted from knowledge = not borrowable). Default to
// each proposal's latest non-archived version, expandable to older. Tiered
// ordering by commercial evidence: won → sent → draft → lost.
export interface ProposalSourceVersion {
  id: string; version: number; status: string; created_at: string;
}
export interface ProposalSource {
  proposalId: string;
  title: string;
  bookingLabel: string;          // "Goldberg Wedding" (the opportunity)
  bookingId: string;
  proposalStatus: string;        // open | won | lost | archived
  booked: boolean;               // the booking is a real booked event
  tier: number;                  // 0 won · 1 sent · 2 draft · 3 lost (sort key)
  tierLabel: string;             // "Won" | "Sent" | "Draft" | "Lost"
  latest: ProposalSourceVersion;
  older: ProposalSourceVersion[];
}

export async function loadProposalSources(currentProposalId: string): Promise<ProposalSource[]> {
  // All proposals except archived-status and the current one.
  const { data: ps } = await supabase.from("proposals")
    .select("id,booking_id,title,status,won_version_id")
    .neq("status", "archived").neq("id", currentProposalId);
  const props = (ps ?? []) as { id: string; booking_id: string; title: string; status: string; won_version_id: string | null }[];
  if (!props.length) return [];

  const { data: vs } = await supabase.from("proposal_versions")
    .select("id,proposal_id,version,status,created_at,archived_at")
    .in("proposal_id", props.map((p) => p.id)).is("archived_at", null).order("version");
  const versions = (vs ?? []) as { id: string; proposal_id: string; version: number; status: string; created_at: string }[];

  const bookingIds = Array.from(new Set(props.map((p) => p.booking_id)));
  const { data: bks } = await supabase.from("bookings").select("id,contact_name,event_type,status").in("id", bookingIds);
  const bMap: Record<string, { contact_name: string; event_type: string | null; status: string }> = {};
  for (const b of (bks ?? []) as { id: string; contact_name: string; event_type: string | null; status: string }[]) {
    bMap[b.id] = b;
  }

  const out: ProposalSource[] = [];
  for (const p of props) {
    const vChain = versions.filter((v) => v.proposal_id === p.id).sort((a, z) => a.version - z.version);
    if (!vChain.length) continue;                       // nothing non-archived to borrow
    const latest = vChain[vChain.length - 1];
    const older = vChain.slice(0, -1).reverse();        // newest-first under the fold
    const bk = bMap[p.booking_id];
    const booked = bk?.status === "booked" || bk?.status === "completed" || p.status === "won";

    // Tier by strongest commercial evidence of the LATEST version.
    let tier = 2, tierLabel = "Draft";
    if (p.status === "won" || latest.status === "approved") { tier = 0; tierLabel = "Won"; }
    else if (p.status === "lost") { tier = 3; tierLabel = "Lost"; }
    else if (latest.status === "sent" || latest.status === "revision_requested") { tier = 1; tierLabel = "Sent"; }
    else { tier = 2; tierLabel = latest.status === "internal_review" ? "In review" : "Draft"; }

    out.push({
      proposalId: p.id, title: p.title,
      bookingLabel: bk?.contact_name ?? "Event", bookingId: p.booking_id,
      proposalStatus: p.status, booked, tier, tierLabel,
      latest: { id: latest.id, version: latest.version, status: latest.status, created_at: latest.created_at },
      older: older.map((v) => ({ id: v.id, version: v.version, status: v.status, created_at: v.created_at })),
    });
  }
  // Tier, then newest latest-version first within tier.
  out.sort((a, z) => a.tier - z.tier || (z.latest.created_at ?? "").localeCompare(a.latest.created_at ?? ""));
  return out;
}

/** Components of a specific proposal version, for the source preview. */
export async function loadVersionComponents(versionId: string): Promise<{ id: string; title: string; sectionLabel: string | null; itemCount: number }[]> {
  const { data: cs } = await supabase.from("event_components")
    .select("id,title,section_type_id").eq("proposal_version_id", versionId).order("position");
  const comps = (cs ?? []) as { id: string; title: string; section_type_id: string | null }[];
  if (!comps.length) return [];
  const [{ data: its }, { data: sts }] = await Promise.all([
    supabase.from("component_items").select("component_id").in("component_id", comps.map((c) => c.id)),
    supabase.from("section_types").select("id,name"),
  ]);
  const counts: Record<string, number> = {};
  for (const i of (its ?? []) as { component_id: string }[]) counts[i.component_id] = (counts[i.component_id] ?? 0) + 1;
  const secName: Record<string, string> = {};
  for (const sec of (sts ?? []) as { id: string; name: string }[]) secName[sec.id] = sec.name;
  return comps.map((c) => ({
    id: c.id, title: c.title,
    sectionLabel: c.section_type_id ? (secName[c.section_type_id] ?? null) : null,
    itemCount: counts[c.id] ?? 0,
  }));
}
